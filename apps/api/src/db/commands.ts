import { createSqlDatabase } from "@api/db/kysely";
import { migrateDatabase } from "@api/db/migrate";
import { seedSqlDictionaries } from "@api/db/kysely-seed";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is required");
const db = createSqlDatabase(url);
try {
  if (process.argv[2] === "migrate") {
    const results = await migrateDatabase(db);
    console.log(`Migrations complete (${results.length} applied)`);
  } else if (process.argv[2] === "seed") {
    await seedSqlDictionaries(db);
    console.log("Dictionary seed applied");
  } else throw new Error("Use migrate or seed");
} finally {
  await db.destroy();
}
