import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

const migrationsDirectory = path.resolve(
  process.cwd(),
  "prisma",
  "migrations",
);

describe("Prisma migration history", () => {
  it("locks the migration provider to PostgreSQL", async () => {
    const lock = await readFile(
      path.join(migrationsDirectory, "migration_lock.toml"),
      "utf8",
    );

    expect(lock).toMatch(/^provider = "postgresql"$/m);
  });

  it("contains SQL for every timestamped migration", async () => {
    const entries = await readdir(migrationsDirectory, {
      withFileTypes: true,
    });
    const migrationDirectories = entries.filter((entry) => entry.isDirectory());

    expect(migrationDirectories.length).toBeGreaterThan(0);

    for (const migration of migrationDirectories) {
      expect(migration.name).toMatch(/^\d{14}_[a-z0-9_]+$/);

      const sql = await readFile(
        path.join(migrationsDirectory, migration.name, "migration.sql"),
        "utf8",
      );

      expect(sql.trim().length).toBeGreaterThan(0);
    }
  });
});
