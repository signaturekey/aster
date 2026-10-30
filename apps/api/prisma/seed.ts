import { createDatabase } from "@api/db/client";
import { seedDictionaries } from "@api/db/seed";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is required for seeding");
const db = createDatabase(url);
try {
  await seedDictionaries(db);
  console.log("Dictionary seed applied");
} finally {
  await db.$disconnect();
}
