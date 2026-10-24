import { unlinkSync } from "node:fs";
import db from "./db";
import { generateUniqueKey } from "./key";
import { webpSize } from "./webp";

/** Uploads are made no larger than this on each side by the browser. */
const MAX_SIDE = 960;
/**
 * Per file. The largest animation stored so far is about 4MB at 500px; this
 * leaves room for a long one at full size without taking just anything.
 */
const MAX_BYTES = 30 * 1024 * 1024;

/** An upload that is not a WebP the browser could have made. */
export class InvalidImageError extends Error {}

/**
 * Stores files the browser has already converted and stamped with LGTM, and
 * answers with their names in the order given. The server no longer decodes
 * or re-encodes anything; it checks each file is a well-formed WebP within
 * the size limits and keeps it as is. What it cannot check is that the LGTM
 * is actually on it -- an account that uploads bare images is dealt with by
 * deleting them. Every file is checked before any is written, so a batch with
 * one bad file leaves nothing behind.
 */
export async function create(
  files: File[],
  userKey: string,
): Promise<string[]> {
  const checked: { bytes: Uint8Array; width: number; height: number }[] = [];
  for (const file of files) {
    if (file.size > MAX_BYTES) throw new InvalidImageError("too large");
    const bytes = new Uint8Array(await file.arrayBuffer());
    const size = webpSize(bytes);
    if (!size) throw new InvalidImageError("not a webp");
    if (size.width > MAX_SIDE || size.height > MAX_SIDE)
      throw new InvalidImageError("too many pixels");
    checked.push({ bytes, ...size });
  }

  const created: string[] = [];
  for (const { bytes, width, height } of checked) {
    const fileName = `${await generateUniqueKey((k) => Bun.file(`images/${k}.webp`).exists())}.webp`;
    await Bun.write(`images/${fileName}`, bytes);
    db().run(
      "INSERT INTO lImage (fileName, userKey, createdAt, width, height) VALUES (?, ?, ?, ?, ?)",
      [fileName, userKey, Date.now(), width, height],
    );
    created.push(fileName);
  }
  return created;
}

export function deleteFile(fileName: string, userKey: string): boolean {
  const result = db().run(
    "DELETE FROM lImage WHERE fileName = ? AND userKey = ?",
    [fileName, userKey],
  );
  if (result.changes > 0) {
    unlinkSync(`images/${fileName}`);
  }
  return result.changes > 0;
}

/**
 * Removes every image a key owns, files included, and answers with how many.
 * The unlinks happen after the rows are gone: a file left on disk with no row
 * is invisible clutter, while a row pointing at a missing file is a gallery
 * tile that 404s.
 */
export function deleteAllImages(userKey: string): number {
  const rows = db()
    .query<{ fileName: string }, [string]>(
      "SELECT fileName FROM lImage WHERE userKey = ?",
    )
    .all(userKey);
  db().run("DELETE FROM lImage WHERE userKey = ?", [userKey]);
  for (const { fileName } of rows) {
    try {
      unlinkSync(`images/${fileName}`);
    } catch {
      // Already gone is the outcome we wanted.
    }
  }
  return rows.length;
}

/**
 * Reads the size off disk for rows stored before sizes were recorded. Every
 * stored file is a WebP, so the header says it without decoding anything.
 */
export async function backfillImageSizes(): Promise<void> {
  const rows = db()
    .query<{ fileName: string }, []>(
      "SELECT fileName FROM lImage WHERE width IS NULL",
    )
    .all();
  for (const { fileName } of rows) {
    try {
      const size = webpSize(await Bun.file(`images/${fileName}`).bytes());
      if (!size) continue;
      db().run("UPDATE lImage SET width = ?, height = ? WHERE fileName = ?", [
        size.width,
        size.height,
        fileName,
      ]);
    } catch {
      // A missing or unreadable file keeps its NULLs; the gallery falls
      // back to a square for it, as it did for everything before.
    }
  }
}

/**
 * Counted by position rather than by page, so the gallery can ask for "what
 * comes after the ones I have". With fixed pages, deleting a tile shifted
 * every later row up one and the next page silently skipped a picture.
 */
export function get(
  offset: number,
  limit: number,
  find: boolean,
  userKey?: string,
) {
  type Row = {
    fileName: string;
    userKey: string;
    width: number | null;
    height: number | null;
  };
  const rows = find
    ? db()
        .query<Row, [string, number, number]>(
          "SELECT fileName, userKey, width, height FROM lImage WHERE userKey = ? ORDER BY createdAt DESC, id DESC LIMIT ? OFFSET ?",
        )
        .all(userKey ?? "", limit, offset)
    : db()
        .query<Row, [number, number]>(
          "SELECT fileName, userKey, width, height FROM lImage ORDER BY createdAt DESC, id DESC LIMIT ? OFFSET ?",
        )
        .all(limit, offset);

  return rows.map((image) => ({
    name: image.fileName,
    isDeletable: image.userKey === userKey,
    width: image.width ?? 960,
    height: image.height ?? 960,
  }));
}
