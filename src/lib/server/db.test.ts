import { Database } from "bun:sqlite";
import { expect, test } from "bun:test";

import { migrate } from "./db";

const version = (db: Database) =>
  db.query<{ user_version: number }, []>("PRAGMA user_version").get()
    ?.user_version;

test("migrates a database made before migrations without losing rows", () => {
  const db = new Database(":memory:");
  db.run(
    "CREATE TABLE lImage (id INTEGER PRIMARY KEY AUTOINCREMENT, fileName TEXT NOT NULL UNIQUE, userKey TEXT NOT NULL, createdAt INTEGER NOT NULL)",
  );
  db.run(
    "INSERT INTO lImage (fileName, userKey, createdAt) VALUES ('a', 'u', 1)",
  );
  migrate(db);
  const after = version(db);
  migrate(db);
  expect(version(db)).toBe(after!);
  expect(db.query("SELECT fileName, width FROM lImage").all()).toEqual([
    { fileName: "a", width: null },
  ]);
});
