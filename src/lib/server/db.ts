import type { Database as DatabaseType } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

let instance: DatabaseType | undefined;

export default function db(): DatabaseType {
	if (instance) return instance;
	const { Database } = require("bun:sqlite") as typeof import("bun:sqlite");
	const path = process.env.DB_PATH ?? "data/lgtm.db";
	mkdirSync(dirname(path), { recursive: true });
	instance = new Database(path);
	instance.exec("PRAGMA journal_mode = WAL;");
	// During a rolling update the outgoing and incoming pod share this file for
	// a few seconds. WAL lets them read concurrently; this makes the one writer
	// at a time wait its turn instead of failing with SQLITE_BUSY.
	instance.exec("PRAGMA busy_timeout = 5000;");
	// The only sign-in. No token is kept: it is used once, during the callback,
	// to ask GitHub who just arrived.
	instance.run(`
		CREATE TABLE IF NOT EXISTS ghUser (
			key TEXT PRIMARY KEY,
			githubId TEXT NOT NULL UNIQUE,
			login TEXT NOT NULL
		)
	`);
	instance.run(`
		CREATE TABLE IF NOT EXISTS lImage (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			fileName TEXT NOT NULL UNIQUE,
			userKey TEXT NOT NULL,
			createdAt INTEGER NOT NULL
		)
	`);
	instance.run("CREATE INDEX IF NOT EXISTS lImage_userKey ON lImage(userKey)");
	// Admin handed out from the admin page. ADMIN_GH_LOGINS stays the root of
	// it: that cannot be revoked from inside the app, so a mistake here is
	// always recoverable.
	instance.run(`
		CREATE TABLE IF NOT EXISTS admin (
			userKey TEXT PRIMARY KEY,
			grantedAt INTEGER NOT NULL,
			grantedBy TEXT NOT NULL
		)
	`);
	return instance;
}
