import { unlinkSync } from "node:fs";
import sharp from "sharp";
import db from "./db";
import { generateUniqueKey } from "./key";

/** The file names written, in the order they were given. */
export async function create(
	files: File[],
	userKey: string,
): Promise<string[]> {
	const lgtmSource = await Bun.file("assets/lgtm.webp").arrayBuffer();
	const created: string[] = [];
	for (const file of files) {
		const fileName = `${await generateUniqueKey((k) => Bun.file(`images/${k}.webp`).exists())}.webp`;
		const buffer = await sharp(await file.arrayBuffer(), { animated: true })
			.resize({
				width: 960,
				height: 960,
				fit: "inside",
			})
			.rotate()
			.webp({ quality: 80 })
			.toBuffer();
		const image = sharp(buffer);
		const metadata = await image.metadata();
		const lgtm = await sharp(lgtmSource)
			.resize({
				width: metadata.width,
				height: metadata.height,
				fit: "contain",
				background: { r: 0, g: 0, b: 0, alpha: 0 },
			})
			.toBuffer();

		await sharp(buffer, { animated: true })
			.composite([
				{
					input: lgtm,
					tile: true,
					top: 0,
					left: 0,
				},
			])
			.toFile(`images/${fileName}`);
		db().run(
			"INSERT INTO lImage (fileName, userKey, createdAt, width, height) VALUES (?, ?, ?, ?, ?)",
			[
				fileName,
				userKey,
				Date.now(),
				metadata.width ?? null,
				metadata.height ?? null,
			],
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
 * Reads the size off disk for rows stored before sizes were recorded. Opened
 * without animated, as create() does, so an animation reports one frame
 * rather than the whole strip.
 */
export async function backfillImageSizes(): Promise<void> {
	const rows = db()
		.query<{ fileName: string }, []>(
			"SELECT fileName FROM lImage WHERE width IS NULL",
		)
		.all();
	for (const { fileName } of rows) {
		try {
			const { width, height } = await sharp(`images/${fileName}`).metadata();
			db().run("UPDATE lImage SET width = ?, height = ? WHERE fileName = ?", [
				width,
				height,
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
