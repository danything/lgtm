import type { GroupKey } from "#lib/groups.js";

import db from "../db";
import { imagePath } from "../storage";
import { pickGroup } from "./score";

type Embed = (webp: Uint8Array) => Promise<Float32Array>;

// Imported late: the model is native and the tests swap it out.
let embed: Embed = async (webp) => (await import("./model")).embed(webp);

/** For tests. */
export function useEmbedder(fake: Embed): void {
  embed = fake;
}

const queue: string[] = [];
// Cleared in the same tick the queue is found empty, so a call right after
// cannot land in a queue nobody is working on.
let busy = false;
let done: Promise<void> = Promise.resolve();

async function work(): Promise<void> {
  try {
    await drain();
  } finally {
    busy = false;
  }
}

async function drain(): Promise<void> {
  const update = db().prepare(
    "UPDATE lImage SET grp = ?, embedding = ? WHERE fileName = ?",
  );
  for (let name = queue.shift(); name; name = queue.shift()) {
    try {
      const e = await embed(await Bun.file(imagePath(name)).bytes());
      update.run(
        pickGroup(e),
        new Uint8Array(e.buffer, e.byteOffset, e.byteLength),
        name,
      );
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
 * Regroups every stored embedding (prompts may have changed), then queues the
 * pictures that have none: new since the last start, or from before groups.
 */
export function startGrouping(): Promise<void> {
  const rows = db()
    .query<{ fileName: string; embedding: Uint8Array | null }, []>(
      "SELECT fileName, embedding FROM lImage ORDER BY createdAt DESC",
    )
    .all();
  const update = db().prepare("UPDATE lImage SET grp = ? WHERE fileName = ?");
  const missing: string[] = [];
  db().transaction(() => {
    for (const { fileName, embedding } of rows) {
      if (!embedding) {
        missing.push(fileName);
        continue;
      }
      // A copy: the blob need not sit on a 4-byte boundary.
      const e = new Float32Array(new Uint8Array(embedding).buffer);
      update.run(pickGroup(e) satisfies GroupKey, fileName);
    }
  })();
  return groupLater(missing);
}
