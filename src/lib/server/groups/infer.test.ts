import { afterAll, afterEach, describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

import { loadEmbedder } from "./embedder";
import { embedInWorker, stopWorker, useWorkerScript } from "./infer";

const REAL = new URL("./clip.worker.ts", import.meta.url);
const FAKE = new URL("./fake-clip.worker.ts", import.meta.url);
const ROOT = resolve(import.meta.dir, "../../../..");
// All three come from scripts/build-wasm.sh (in CI, from the same stages).
const MODEL_DIR = `${ROOT}/model`;
const hasModel = [
  `${MODEL_DIR}/vision.onnx`,
  `${MODEL_DIR}/webp-node.wasm`,
  `${ROOT}/src/lib/lgtm/vendor/webp-node.js`,
].every((f) => existsSync(f));
const savedDir = process.env.MODEL_DIR;
const mark = await Bun.file(`${ROOT}/src/lib/assets/lgtm.webp`).bytes();

afterEach(() => {
  useWorkerScript(REAL);
  if (savedDir === undefined) delete process.env.MODEL_DIR;
  else process.env.MODEL_DIR = savedDir;
});
afterAll(stopWorker);

/** The longest a 5ms timer was late while `run` ran. */
async function lagDuring(run: () => Promise<unknown>): Promise<number> {
  let worst = 0;
  let last = performance.now();
  const probe = setInterval(() => {
    const now = performance.now();
    worst = Math.max(worst, now - last - 5);
    last = now;
  }, 5);
  try {
    await run();
  } finally {
    clearInterval(probe);
  }
  return worst;
}

describe("the worker's plumbing", () => {
  // The fake doubles the bytes and waits webp[1] ms; 255 first makes it exit.
  const picture = (first: number, ms = 0) => new Uint8Array([first, ms]);
  const embed = (webp: Uint8Array) => embedInWorker(webp, mark);

  test("answers go to their own calls, however they come back", async () => {
    useWorkerScript(FAKE);
    // The first is answered last.
    const out = await Promise.all(
      [30, 0, 10, 0].map((ms, i) => embed(picture(i, ms))),
    );
    expect(out.map((e) => e[0])).toEqual([0, 2, 4, 6]);
  });

  test("a worker that dies fails its calls and is started again", async () => {
    useWorkerScript(FAKE);
    const waiting = embed(picture(5, 50));
    const dying = embed(picture(255));
    const settled = await Promise.allSettled([waiting, dying]);
    expect(
      settled.map((s) => s.status === "rejected" && String(s.reason.message)),
    ).toEqual([
      "the CLIP worker stopped: it exited",
      "the CLIP worker stopped: it exited",
    ]);
    expect((await embed(picture(7)))[0]).toBe(14);
  });

  test("the server's shutdown stops it", async () => {
    useWorkerScript(FAKE);
    expect((await embed(picture(1)))[0]).toBe(2);
    const waiting = embed(picture(1, 200));
    (process as NodeJS.EventEmitter).emit("sveltekit:shutdown", "SIGTERM");
    await expect(waiting).rejects.toThrow("was stopped");
  });

  test("a model that cannot be read says so by name", async () => {
    process.env.MODEL_DIR = "/nonexistent";
    const failed = await embed(mark).catch((e: Error) => e);
    expect(failed).toBeInstanceOf(Error);
    expect((failed as Error).name).toBe("ModelUnavailable");
  });
});

describe.skipIf(!hasModel)("CLIP in the worker", () => {
  // A still picture and a four-frame animation.
  const frames = Bun.file(`${ROOT}/tests/fixtures/frames-96x64.webp`).bytes();
  const pictures = async () => {
    const anim = await frames;
    return [mark, anim, anim, mark, anim, mark];
  };

  test("gives the embeddings the main thread gave, one call at a time or many", async () => {
    process.env.MODEL_DIR = MODEL_DIR;
    const webps = await pictures();
    // As embed() ran before: on the main thread.
    const inThread = await loadEmbedder(MODEL_DIR, mark);
    const before: Float32Array[] = [];
    for (const webp of webps) before.push(await inThread(webp));
    expect(before[0]).toHaveLength(512);
    expect(before[1]).not.toEqual(before[0]);

    for (const [i, webp] of webps.entries())
      expect(await embedInWorker(webp, mark)).toEqual(before[i]);
    const together = await Promise.all(
      webps.map((webp) => embedInWorker(webp, mark)),
    );
    expect(together).toEqual(before);
  });

  test("leaves the main thread free while it works", async () => {
    process.env.MODEL_DIR = MODEL_DIR;
    const webps = await pictures();
    // Loads the model first; that is not what is measured.
    await embedInWorker(mark, mark);
    const lag = await lagDuring(async () => {
      for (const webp of webps) await embedInWorker(webp, mark);
    });
    // On the main thread each inference held it for about 70ms.
    expect(lag).toBeLessThan(25);
  });
});
