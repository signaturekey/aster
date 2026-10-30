import { requireTestDatabase } from "./test-database";

const url = requireTestDatabase(
  process.env.TEST_DATABASE_URL,
  process.env.DATABASE_URL,
);
const env = { ...process.env, DATABASE_URL: url, ASTER_INTEGRATION: "1" };
for (const command of [
  ["bun", "run", "db:migrate"],
  ["bun", "run", "db:seed"],
  ["bun", "test", "--isolate", "apps/api/tests/integration"],
]) {
  const child = Bun.spawn(command, {
    env,
    stdout: "inherit",
    stderr: "inherit",
  });
  const code = await child.exited;
  if (code !== 0) process.exit(code);
}
