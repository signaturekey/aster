import type { Database } from "@api/db/client";
import { dictionaries } from "../../prisma/dictionaries";

export async function seedDictionaries(db: Database) {
  await db.$transaction([
    ...dictionaries.specializations.map((item) =>
      db.specialization.upsert({
        where: { id: item.id },
        create: item,
        update: { label: item.label },
      }),
    ),
    ...dictionaries.skills.map((item) =>
      db.skill.upsert({
        where: { id: item.id },
        create: item,
        update: { label: item.label },
      }),
    ),
    ...dictionaries.experienceLevels.map((item) =>
      db.experienceLevel.upsert({
        where: { id: item.id },
        create: item,
        update: { label: item.label },
      }),
    ),
    ...dictionaries.goals.map((item) =>
      db.goal.upsert({
        where: { id: item.id },
        create: item,
        update: { label: item.label },
      }),
    ),
  ]);
}
