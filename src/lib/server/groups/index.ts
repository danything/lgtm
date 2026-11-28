import db from "../db";
import { imagePath } from "../storage";
import { cosine, pickGroup, pickScene, SAME_SHOT } from "./score";
import { cosines, pickTags, StatsBuilder, type TagStats } from "./tags";

type Embed = (webp: Uint8Array) => Promise<Float32Array>;

// Imported late: the model is native and the tests swap it out.
let embed: Embed = async (webp) => (await import("./model")).embed(webp);

/** For tests. */
export function useEmbedder(fake: Embed): void {
  embed = fake;
}

// A copy: a blob need not sit on a 4-byte boundary.
const floats = (blob: Uint8Array) =>
  new Float32Array(new Uint8Array(blob).buffer);

/** The group, and the scene when it is 人. */
function classify(e: Float32Array) {
  const grp = pickGroup(e);
  return { grp, scene: grp === "person" ? pickScene(e) : null };
}

// How tags score across the pictures, as of the last start; a new picture is
// tagged against these until the next one.
let tagStats: TagStats | undefined;

/** Replaces the picture's tags; run inside a transaction. */
function writeTags(id: number, e: Float32Array): void {
  db().run("DELETE FROM lImageTag WHERE imageId = ?", [id]);
  const insert = db().query(
    "INSERT INTO lImageTag (tag, imageId, score) VALUES (?, ?, ?)",
  );
  for (const { tag, score } of pickTags(e, tagStats))
    insert.run(tag, id, score);
}

/**
 * Puts the picture in one dupKey with every copy of the same shot: the
 * smallest key among them and its own id. Clusters it bridges are merged, so
 * the order pictures are keyed in does not matter.
 */
function markDuplicate(fileName: string): void {
  const me = db()
    .query<
      {
        id: number;
        width: number | null;
        height: number | null;
        embedding: Uint8Array | null;
      },
      [string]
    >("SELECT id, width, height, embedding FROM lImage WHERE fileName = ?")
    .get(fileName);
  if (!me?.embedding) return;
  const keys = new Set<number>();
  if (me.width && me.height) {
    const e = floats(me.embedding);
    // Copies keep their proportions; this also keeps the scan short.
    const peers = db()
      .query<{ dupKey: number; embedding: Uint8Array }, [number, number]>(
        `SELECT dupKey, embedding FROM lImage
         WHERE id != ? AND dupKey IS NOT NULL AND embedding IS NOT NULL
           AND height > 0 AND abs(width * 1.0 / height - ?) < 0.01`,
      )
      .all(me.id, me.width / me.height);
    for (const p of peers)
      if (cosine(e, floats(p.embedding)) >= SAME_SHOT) keys.add(p.dupKey);
  }
  const key = Math.min(me.id, ...keys);
  db().run(
    `UPDATE lImage SET dupKey = ? WHERE id = ? OR dupKey IN (${[...keys].map(() => "?").join(",") || "NULL"})`,
    [key, me.id, ...keys],
  );
}

const queue: string[] = [];
// Cleared in the same tick the queue is found empty, so a call right after
// cannot land in a queue nobody is working on.
let busy = false;
let done: Promise<void> = Promise.resolve();

async function work(): Promise<void> {
  try {
    const update = db().prepare<
      { id: number },
      [string, string | null, Uint8Array, string]
    >(
      "UPDATE lImage SET grp = ?, scene = ?, embedding = ? WHERE fileName = ? RETURNING id",
    );
    for (let name = queue.shift(); name; name = queue.shift()) {
      try {
        const e = await embed(await Bun.file(imagePath(name)).bytes());
        const { grp, scene } = classify(e);
        db().transaction(() => {
          const row = update.get(
            grp,
            scene,
            new Uint8Array(e.buffer, e.byteOffset, e.byteLength),
            name,
          );
          // Deleted while the model looked at it.
          if (row) writeTags(row.id, e);
        })();
        markDuplicate(name);
      } catch (e) {
        // Left ungrouped; the next start tries again. Without the model there
        // is nothing to try, so say so once.
        if ((e as Error).name === "ModelUnavailable") {
          console.error("grouping is off:", (e as Error).message);
          queue.length = 0;
          return;
        }
        console.error(`could not group ${name}`, e);
      }
    }
  } catch (e) {
    // Nobody awaits this to catch it.
    console.error("grouping stopped", e);
  } finally {
    busy = false;
  }
}

/** Groups these one at a time, after anything already waiting. */
export function groupLater(fileNames: string[]): Promise<void> {
  queue.push(...fileNames);
  if (!busy) {
    busy = true;
    done = work();
  }
  return done;
}

/**
 * Regroups and retags every stored embedding (prompts may have changed) and keys the
 * copies not keyed yet, then queues the pictures that have no embedding: new
 * since the last start, or from before groups.
 */
export async function startGrouping(): Promise<void> {
  // After the server is listening: the first run keys every picture.
  await new Promise((resolve) => setTimeout(resolve));
  const rows = db()
    .query<
      {
        id: number;
        fileName: string;
        width: number | null;
        height: number | null;
        embedding: Uint8Array | null;
        dupKey: number | null;
      },
      []
    >(
      "SELECT id, fileName, width, height, embedding, dupKey FROM lImage ORDER BY createdAt, id",
    )
    .all();
  const update = db().prepare(
    "UPDATE lImage SET grp = ?, scene = ?, dupKey = ? WHERE id = ?",
  );
  const shots = rows.flatMap((r) =>
    r.embedding
      ? [
          {
            ...r,
            e: floats(r.embedding),
            // NaN for a size not known yet: it matches nothing, as in markDuplicate.
            ratio: r.width && r.height ? r.width / r.height : Number.NaN,
          },
        ]
      : [],
  );
  keyCopies(shots);
  db().transaction(() => {
    for (const s of shots) {
      const { grp, scene } = classify(s.e);
      update.run(grp, scene, s.dupKey, s.id);
    }
  })();
  await retag(shots);
  // Newest first, so the top page fills in from where people look.
  const missing = rows.filter((r) => !r.embedding).map((r) => r.fileName);
  await groupLater(missing.reverse());
}

// Tagging takes about 0.25ms a picture (0.4s for 1,650); in slices, with a
// turn of the event loop between, page requests are not held up behind it.
const SLICE = 100;
const nextTurn = () => new Promise((resolve) => setTimeout(resolve));

/**
 * Every picture's tags again, as the vocabulary may have changed: first how
 * each tag scores across them all, then each picture against that. Search
 * keeps working throughout, on the old tags until a picture's new ones land;
 * a word taken out of the vocabulary goes with them.
 */
async function retag(shots: { id: number; e: Float32Array }[]): Promise<void> {
  const stats = new StatsBuilder();
  for (let i = 0; i < shots.length; i += SLICE) {
    for (const s of shots.slice(i, i + SLICE)) stats.add(cosines(s.e));
    await nextTurn();
  }
  tagStats = stats.done();
  for (let i = 0; i < shots.length; i += SLICE) {
    db().transaction(() => {
      for (const s of shots.slice(i, i + SLICE)) writeTags(s.id, s.e);
    })();
    await nextTurn();
  }
}

/**
 * markDuplicate for every picture not keyed yet, in memory: one query per
 * picture made the first start take minutes.
 */
function keyCopies(
  shots: {
    id: number;
    e: Float32Array;
    ratio: number;
    dupKey: number | null;
  }[],
): void {
  const keyed = shots.filter((s) => s.dupKey !== null);
  for (const s of shots) {
    if (s.dupKey !== null) continue;
    const keys = new Set<number>();
    for (const p of keyed)
      if (Math.abs(p.ratio - s.ratio) < 0.01 && cosine(s.e, p.e) >= SAME_SHOT)
        keys.add(p.dupKey!);
    const key = Math.min(s.id, ...keys);
    for (const p of keyed) if (keys.has(p.dupKey!)) p.dupKey = key;
    s.dupKey = key;
    keyed.push(s);
  }
}
