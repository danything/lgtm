import { type Folder, FOLDER_NAME_MAX } from "#lib/folders.js";

import db from "./db";
import { HttpError } from "./http";

export function listFolders(userKey: string): Folder[] {
  return db()
    .query<Folder, [string]>(
      `SELECT folder.id, folder.name,
			        (SELECT COUNT(*) FROM lImage WHERE lImage.folderId = folder.id) AS images
			 FROM folder WHERE userKey = ? ORDER BY name COLLATE NOCASE, id`,
    )
    .all(userKey);
}

/** Answers 404 for someone else's folder too, so ids reveal nothing. */
export function requireFolder(id: number, userKey: string): void {
  const found = db()
    .query<{ id: number }, [number, string]>(
      "SELECT id FROM folder WHERE id = ? AND userKey = ?",
    )
    .get(id, userKey);
  if (!found) throw new HttpError(404, "フォルダが見つかりません");
}

function checkName(name: unknown): string {
  const trimmed = typeof name === "string" ? name.trim() : "";
  if (trimmed === "")
    throw new HttpError(400, "フォルダの名前を入れてください");
  if ([...trimmed].length > FOLDER_NAME_MAX)
    throw new HttpError(
      400,
      `フォルダの名前は ${FOLDER_NAME_MAX} 文字までです`,
    );
  return trimmed;
}

const taken = (e: unknown) =>
  e instanceof Error && e.message.includes("UNIQUE constraint failed");

export function createFolder(userKey: string, name: unknown): Folder {
  const checked = checkName(name);
  try {
    const { lastInsertRowid } = db().run(
      "INSERT INTO folder (userKey, name, createdAt) VALUES (?, ?, ?)",
      [userKey, checked, Date.now()],
    );
    return { id: Number(lastInsertRowid), name: checked, images: 0 };
  } catch (e) {
    if (taken(e)) throw new HttpError(409, "同じ名前のフォルダがあります");
    throw e;
  }
}

export function renameFolder(id: number, userKey: string, name: unknown): void {
  const checked = checkName(name);
  requireFolder(id, userKey);
  try {
    db().run("UPDATE folder SET name = ? WHERE id = ?", [checked, id]);
  } catch (e) {
    if (taken(e)) throw new HttpError(409, "同じ名前のフォルダがあります");
    throw e;
  }
}

/**
 * Its images go back to no folder rather than being deleted: they may be
 * embedded in pull requests. Answers how many were moved out.
 */
export function deleteFolder(id: number, userKey: string): number {
  requireFolder(id, userKey);
  let moved = 0;
  db().transaction(() => {
    moved = db().run("UPDATE lImage SET folderId = NULL WHERE folderId = ?", [
      id,
    ]).changes;
    db().run("DELETE FROM folder WHERE id = ?", [id]);
  })();
  return moved;
}

/** Moves the caller's own images; anyone else's are left alone. */
export function moveImages(
  fileNames: string[],
  folderId: number | null,
  userKey: string,
): number {
  if (folderId !== null) requireFolder(folderId, userKey);
  const update = db().prepare(
    "UPDATE lImage SET folderId = ? WHERE fileName = ? AND userKey = ?",
  );
  let moved = 0;
  db().transaction(() => {
    for (const name of fileNames)
      moved += update.run(folderId, name, userKey).changes;
  })();
  return moved;
}

export function deleteAllFolders(userKey: string): void {
  db().run("DELETE FROM folder WHERE userKey = ?", [userKey]);
}
