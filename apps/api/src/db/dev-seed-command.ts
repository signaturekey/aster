import { seedDevelopmentData } from "@api/db/dev-seed";
import { createSqlDatabase } from "@api/db/kysely";
import { sql } from "kysely";

/** Validate without opening a connection or including credentials in errors. */
export function requireDevelopmentSeedTarget(
  value: string | undefined,
  args: readonly string[],
  environment: string | undefined,
) {
  const refusal = () =>
    new Error(
      "Development seed requires NODE_ENV unset/development, a PostgreSQL URL for local aster with an explicit port, no URL options, and exactly --acknowledge-local-aster=<host>:<port>/aster. Test/production targets are forbidden.",
    );
  if (!value || (environment !== undefined && environment !== "development"))
    throw refusal();
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw refusal();
  }
  const local = url.hostname === "localhost" || url.hostname === "127.0.0.1";
  const compose = url.hostname === "db" && url.port === "5432";
  if (
    !["postgres:", "postgresql:"].includes(url.protocol) ||
    (!local && !compose) ||
    !url.port ||
    url.pathname !== "/aster" ||
    url.search ||
    url.hash ||
    /(?:prod|test)/i.test(decodeURIComponent(url.username))
  )
    throw refusal();
  const target = `${url.hostname}:${url.port}/aster`;
  if (args.length !== 1 || args[0] !== `--acknowledge-local-aster=${target}`)
    throw refusal();
  return { url: url.toString(), target };
}

export async function runDevelopmentSeedCommand() {
  const target = requireDevelopmentSeedTarget(
    process.env.DATABASE_URL,
    process.argv.slice(2),
    process.env.NODE_ENV,
  );
  const db = createSqlDatabase(target.url);
  try {
    // Refuse alternate search paths even if injected through server/role defaults.
    // No implicit migration/ordinary seeding: the developer runs those separately.
    const result = await sql<{
      database: string;
      schema: string;
    }>`select current_database() as database, current_schema() as schema`.execute(
      db,
    );
    if (
      result.rows[0]?.database !== "aster" ||
      result.rows[0]?.schema !== "public"
    )
      throw new Error(
        "Development seed requires database aster, schema public",
      );
    console.log(`Explicit development seed target: ${target.target} (public)`);
    const report = await seedDevelopmentData(db);
    console.log(JSON.stringify(report, null, 2));
  } finally {
    await db.destroy();
  }
}

if (import.meta.main) {
  try {
    await runDevelopmentSeedCommand();
  } catch {
    // PostgreSQL/URL errors can contain credentials or private row values. Keep
    // CLI failures bounded; operators inspect the local DB instead of adopting
    // identities or trying an automatic repair/reset.
    console.error(
      "Development seed refused or rolled back. Verify the acknowledged local aster target, applied migrations/dictionaries and seed-email/provenance conflicts. No reset or repair was attempted.",
    );
    process.exitCode = 1;
  }
}
