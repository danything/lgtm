import type { FolderFilter } from "#lib/folders.js";
import {
  type GroupKey,
  GROUPS,
  type GroupSection,
  type SceneKey,
  SCENES,
  type SceneSection,
} from "#lib/groups.js";
import { MAX_SIDE, MAX_UPLOAD_BYTES, mb } from "#lib/limits.js";

import db from "./db";
import { tagsFor } from "./groups/tags";
import { HttpError } from "./http";
import { imagePath, removeImage, writeImage } from "./storage";
import { stripMetadata, webpSize } from "./webp";

/** An upload the browser could not have made; the status says which way. */
export class InvalidImageError extends HttpError {}

type Checked = { bytes: Uint8Array; width: number; height: number };

async function check(file: File): Promise<Checked> {
  if (file.size > MAX_UPLOAD_BYTES)
    throw new InvalidImageError(
      413,
      `画像が大きすぎます (${mb(MAX_UPLOAD_BYTES)} まで)`,
    );
  const raw = new Uint8Array(await file.arrayBuffer());
  const size = webpSize(raw);
  const bytes = size && stripMetadata(raw);
  if (!size || !bytes)
    throw new InvalidImageError(415, "画像の形式が正しくありません");
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

/** What narrows the top page: a group, a scene of 人, words to search. */
export type TopFilter = { group?: GroupKey; scene?: SceneKey; q?: string };

const marks = (xs: unknown[]) => xs.map(() => "?").join(",");

/**
 * The conditions for pictures a search finds: a tag for every word of it.
 * Undefined when some word is no tag, so nothing can match.
 */
function searchWhere(q: string) {
  const terms = tagsFor(q);
  if (terms.length === 0 || terms.some((t) => t.length === 0)) return undefined;
  return {
    terms,
    where: terms.map(
      (tags) =>
        `id IN (SELECT imageId FROM lImageTag WHERE tag IN (${marks(tags)}))`,
    ),
    params: terms.flat(),
  };
}

// The top page shows one picture per shot: the newest of its dupKey.
const NEWEST_COPY = `(dupKey IS NULL OR id = (SELECT d.id FROM lImage d
  WHERE d.dupKey = lImage.dupKey ORDER BY d.createdAt DESC, d.id DESC LIMIT 1))`;

/**
 * Paged by offset so the gallery can ask for what comes after the tiles it
 * has; fixed pages skipped a picture whenever one was deleted. `folder` only
 * narrows one owner's images (`find`), who sees every copy; `top` narrows
 * the top page.
 */
export function get(
  offset: number,
  limit: number,
  find: boolean,
  userKey?: string,
  folder?: FolderFilter,
  top: TopFilter = {},
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
  } else {
    where.push(NEWEST_COPY);
    if (top.group) {
      where.push("grp = ?");
      params.push(top.group);
    }
    if (top.scene) {
      where.push("scene = ?");
      params.push(top.scene);
    }
  }
  // A search ranks by how well the tags fit, newest first among equals.
  let order = "";
  const orderParams: string[] = [];
  if (!find && top.q !== undefined) {
    const s = searchWhere(top.q);
    if (!s) return [];
    where.push(...s.where);
    params.push(...s.params);
    const all = [...new Set(s.terms.flat())];
    order = `(SELECT SUM(score) FROM lImageTag t WHERE t.imageId = lImage.id AND t.tag IN (${marks(all)})) DESC, `;
    orderParams.push(...all);
  }
  const rows = db()
    .query<Row, (string | number)[]>(
      `SELECT fileName, userKey, width, height, folderId FROM lImage
			 ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
			 ORDER BY ${order}createdAt DESC, id DESC LIMIT ? OFFSET ?`,
    )
    .all(...params, ...orderParams, limit, offset);

  return rows.map((image) => ({
    name: image.fileName,
    isDeletable: image.userKey === userKey,
    width: image.width ?? MAX_SIDE,
    height: image.height ?? MAX_SIDE,
    // Folders are private, so only the owner sees which one.
    folderId: image.userKey === userKey ? image.folderId : null,
  }));
}

/** The groups with pictures in them, biggest first and その他 last. */
export function groupSections(q?: string): GroupSection[] {
  const s = q === undefined ? { where: [], params: [] } : searchWhere(q);
  if (!s) return [];
  const counts = new Map(
    db()
      .query<{ grp: string; count: number }, string[]>(
        `SELECT grp, COUNT(*) AS count FROM lImage
         WHERE ${["grp IS NOT NULL", NEWEST_COPY, ...s.where].join(" AND ")}
         GROUP BY grp`,
      )
      .all(...s.params)
      .map((r) => [r.grp, r.count]),
  );
  return GROUPS.map(({ key, label }) => ({
    key,
    label,
    count: counts.get(key) ?? 0,
  }))
    .filter((g) => g.count > 0)
    .sort(
      (a, b) =>
        Number(a.key === "other") - Number(b.key === "other") ||
        b.count - a.count,
    );
}

/** 人's scenes with pictures in them, biggest first and そのほか last. */
export function sceneSections(q?: string): SceneSection[] {
  const s = q === undefined ? { where: [], params: [] } : searchWhere(q);
  if (!s) return [];
  const counts = new Map(
    db()
      .query<{ scene: string; count: number }, string[]>(
        `SELECT scene, COUNT(*) AS count FROM lImage
         WHERE ${["grp = 'person'", "scene IS NOT NULL", NEWEST_COPY, ...s.where].join(" AND ")}
         GROUP BY scene`,
      )
      .all(...s.params)
      .map((r) => [r.scene, r.count]),
  );
  return SCENES.map(({ key, label }) => ({
    key,
    label,
    count: counts.get(key) ?? 0,
  }))
    .filter((s) => s.count > 0)
    .sort(
      (a, b) =>
        Number(a.key === "rest") - Number(b.key === "rest") ||
        b.count - a.count,
    );
}

/** The tags on the most pictures shown on the top page. */
export function popularTags(limit: number): string[] {
  return db()
    .query<{ tag: string }, [number]>(
      `SELECT tag FROM lImageTag JOIN lImage ON lImage.id = imageId
       WHERE ${NEWEST_COPY} GROUP BY tag ORDER BY COUNT(*) DESC, tag LIMIT ?`,
    )
    .all(limit)
    .map((r) => r.tag);
}
