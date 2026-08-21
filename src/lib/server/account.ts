import db from "./db";

/**
 * Whether the key in the cookie still names an account. Without this any value
 * at all was a working identity for uploading, and an upload could end up owned
 * by a key nobody holds.
 */
export function accountExists(userKey: string): boolean {
	return (
		db()
			.query<{ key: string }, [string]>("SELECT key FROM ghUser WHERE key = ?")
			.get(userKey) !== null
	);
}
