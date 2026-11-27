import type { FolderFilter } from "#lib/folders.js";
import { MAX_SIDE, MAX_UPLOAD_BYTES, mb } from "#lib/limits.js";

import db from "./db";
import { HttpError } from "./http";
import { imagePath, removeImage, writeImage } from "./storage";
import { webpSize } from "./webp";

/** An upload the browser could not have made; the status says which way. */
export class InvalidImageError extends HttpError {}

type Checked = { bytes: Uint8Array; width: number; height: number };

async function check(file: File): Promise<Checked> {
  if (file.size > MAX_UPLOAD_BYTES)
    throw new InvalidImageError(
      413,
      `画像が大きすぎます (${mb(MAX_UPLOAD_BYTES)} まで)`,
    );
  const bytes = new Uint8Array(await file.arrayBuffer());
  const size = webpSize(bytes);
  if (!size) throw new InvalidImageError(415, "画像の形式が正しくありません");
  if (size.width > MAX_SIDE || size.height > MAX_SIDE)
    throw new InvalidImageError(
      422,
      `画像の縦横が大きすぎます (${MAX_SIDE}px まで)`,
    );
  return { bytes, ...size };
}

/**
 * Keeps WebPs the browser already stamped, answering with their names in
 * order. All are checked before any is written, and a failed write undoes the
 * batch. Whether LGTM is really on them cannot be checked here.
 */
export async function create(
  files: File[],
  userKey: string,
  folderId: number | null = null,
): Promise<string[]> {
  if (files.length === 0) throw new HttpError(400, "画像を選んでください");
  const checked: Checked[] = [];
  for (const file of files) checked.push(await check(file));

  const written: string[] = [];
  try {
    for (const { bytes } of checked) written.push(await writeImage(bytes));
    const insert = db().prepare(
      // A folder deleted while this was uploading leaves the image unfiled.
      "INSERT INTO lImage (fileName, userKey, createdAt, width, height, folderId) VALUES (?, ?, ?, ?, ?, (SELECT id FROM folder WHERE id = ? AND userKey = ?))",
    );
    db().transaction(() => {
      checked.forEach(({ width, height }, i) =>
        insert.run(
          written[i],
          userKey,
          Date.now(),
          width,
          height,
          folderId,
          userKey,
        ),
      );
    })();
    return written;
  } catch (e) {
    console.error("could not store an upload", e);
    written.forEach(removeImage);
    throw new HttpError(500, "画像を保存できませんでした");
  }
}

export function deleteFile(fileName: string, userKey: string): boolean {
  const { changes } = db().run(
    "DELETE FROM lImage WHERE fileName = ? AND userKey = ?",
    [fileName, userKey],
  );
  if (changes > 0) removeImage(fileName);
  return changes > 0;
}

/** Rows first: a stray file is invisible, a row without its file is a 404 tile. */
export function deleteAllImages(userKey: string): number {
  // One statement, so an upload landing in between cannot lose its row.
  const rows = db()
    .query<{ fileName: string }, [string]>(
      "DELETE FROM lImage WHERE userKey = ? RETURNING fileName",
    )
    .all(userKey);
  for (const { fileName } of rows) removeImage(fileName);
  return rows.length;
}

/** Fills in sizes for rows stored before they were recorded. */
export async function backfillImageSizes(): Promise<void> {
  const rows = db()
    .query<{ fileName: string }, []>(
      "SELECT fileName FROM lImage WHERE width IS NULL",
    )
    .all();
  for (const { fileName } of rows) {
    try {
      const size = webpSize(await Bun.file(imagePath(fileName)).bytes());
      if (!size) continue;
      db().run("UPDATE lImage SET width = ?, height = ? WHERE fileName = ?", [
        size.width,
        size.height,
        fileName,
      ]);
    } catch {
      // Left NULL; the gallery shows a square for it.
    }
  }
}

/**
 * Paged by offset so the gallery can ask for what comes after the tiles it
 * has; fixed pages skipped a picture whenever one was deleted. `folder` only
 * narrows one owner's images (`find`).
 */
export function get(
  offset: number,
  limit: number,
  find: boolean,
  userKey?: string,
  folder?: FolderFilter,
) {
  type Row = {
    fileName: string;
    userKey: string;
    width: number | null;
    height: number | null;
    folderId: number | null;
  };
  const where: string[] = [];
  const params: (string | number)[] = [];
  if (find) {
    where.push("userKey = ?");
    params.push(userKey ?? "");
    if (folder === "none") where.push("folderId IS NULL");
    else if (folder !== undefined) {
      where.push("folderId = ?");
      params.push(folder);
    }
  }
  const rows = db()
    .query<Row, (string | number)[]>(
      `SELECT fileName, userKey, width, height, folderId FROM lImage
			 ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
			 ORDER BY createdAt DESC, id DESC LIMIT ? OFFSET ?`,
    )
    .all(...params, limit, offset);

  return rows.map((image) => ({
    name: image.fileName,
    isDeletable: image.userKey === userKey,
    width: image.width ?? MAX_SIDE,
    height: image.height ?? MAX_SIDE,
    // Folders are private, so only the owner sees which one.
    folderId: image.userKey === userKey ? image.folderId : null,
  }));
}
