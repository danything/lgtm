import { Database, type Database as DatabaseType } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

/**
 * Schema changes in order; PRAGMA user_version counts how many have run.
 * The first is written to be a no-op on databases made before this list.
 */
const MIGRATIONS: ((db: DatabaseType) => void)[] = [
  (db) => {
    // No GitHub token is kept: it is used once, in the callback.
    db.run(`
			CREATE TABLE IF NOT EXISTS ghUser (
				key TEXT PRIMARY KEY,
				githubId TEXT NOT NULL UNIQUE,
				login TEXT NOT NULL
			)
		`);
    db.run(`
			CREATE TABLE IF NOT EXISTS lImage (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				fileName TEXT NOT NULL UNIQUE,
				userKey TEXT NOT NULL,
				createdAt INTEGER NOT NULL,
				width INTEGER,
				height INTEGER
			)
		`);
    // Older tables lack the size; backfillImageSizes fills it in.
    const columns = db
      .query<{ name: string }, []>("PRAGMA table_info(lImage)")
      .all()
      .map((c) => c.name);
    if (!columns.includes("width")) {
      db.run("ALTER TABLE lImage ADD COLUMN width INTEGER");
      db.run("ALTER TABLE lImage ADD COLUMN height INTEGER");
    }
    db.run("CREATE INDEX IF NOT EXISTS lImage_userKey ON lImage(userKey)");
    db.run(`
			CREATE TABLE IF NOT EXISTS admin (
				userKey TEXT PRIMARY KEY,
				grantedAt INTEGER NOT NULL,
				grantedBy TEXT NOT NULL
			)
		`);
  },
  (db) => {
    // Flat, one per image, owned by one account. Deleting one unfiles its images.
    db.run(`
			CREATE TABLE folder (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				userKey TEXT NOT NULL,
				name TEXT NOT NULL,
				createdAt INTEGER NOT NULL,
				UNIQUE (userKey, name)
			)
		`);
    db.run("ALTER TABLE lImage ADD COLUMN folderId INTEGER");
    db.run("CREATE INDEX lImage_folderId ON lImage(folderId)");
  },
];

/** Immediate, so two pods starting together cannot both run the same step. */
export function migrate(db: DatabaseType): void {
  db.transaction(() => {
    const { user_version: done } = db
      .query<{ user_version: number }, []>("PRAGMA user_version")
      .get()!;
    for (let i = done; i < MIGRATIONS.length; i++) MIGRATIONS[i](db);
    db.run(`PRAGMA user_version = ${MIGRATIONS.length}`);
  }).immediate();
}

let instance: DatabaseType | undefined;

export default function db(): DatabaseType {
  if (instance) return instance;
  const path = process.env.DB_PATH ?? "data/lgtm.db";
  mkdirSync(dirname(path), { recursive: true });
  instance = new Database(path);
  instance.exec("PRAGMA journal_mode = WAL;");
  // Old and new pods share the file during a rollout; wait for the writer
  // instead of failing with SQLITE_BUSY.
  instance.exec("PRAGMA busy_timeout = 5000;");
  migrate(instance);
  return instance;
}
