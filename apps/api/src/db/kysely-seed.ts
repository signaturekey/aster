import { dictionaries } from "@api/db/dictionaries";
import type { SqlDatabase } from "@api/db/kysely";

export async function seedSqlDictionaries(db: SqlDatabase) {
  await db.transaction().execute(async (tx) => {
    for (const [table, values] of [
      ["specializations", dictionaries.specializations],
      ["skills", dictionaries.skills],
      ["experience_levels", dictionaries.experienceLevels],
      ["goals", dictionaries.goals],
    ] as const) {
      await tx
        .insertInto(table)
        .values(values)
        .onConflict((conflict) =>
          conflict
            .column("id")
            .doUpdateSet((eb) => ({ label: eb.ref("excluded.label") })),
        )
        .execute();
    }
  });
}
