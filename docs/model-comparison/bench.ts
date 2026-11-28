// bun bench.ts <lib> <model.onnx> [size]
// One thread, one picture at a time: median ms, the longest the event loop
// was held (a 5ms timer firing late), RSS, and agreement with onnxruntime-node.
import {
  existsSync,
  openSync,
  readFileSync,
  readSync,
  writeFileSync,
} from "node:fs";

const [lib, path, sizeArg = "224"] = process.argv.slice(2);
const S = Number(sizeArg);
const N = 31;
const P = S * S;
const fd = openSync(`/w/out/px-${S}.f32`, "r");
const MEAN = [0.48145466, 0.4578275, 0.40821073];
const STD = [0.26862954, 0.26130258, 0.27577711];
function input(i: number): Float32Array {
  const buf = new Float32Array(P * 3);
  readSync(fd, new Uint8Array(buf.buffer), 0, P * 12, i * P * 12);
  const x = new Float32Array(3 * P);
  for (let t = 0; t < P; t++)
    for (let c = 0; c < 3; c++)
      x[c * P + t] = (buf[t * 3 + c] / 255 - MEAN[c]) / STD[c];
  return x;
}

let run: (x: Float32Array) => Promise<Float32Array>;
const t0 = performance.now();
if (lib === "ort-node") {
  process.env.ORT_DISABLE_TELEMETRY = "1";
  const ort = await import("onnxruntime-node");
  const s = await ort.InferenceSession.create(path, {
    intraOpNumThreads: 1,
    interOpNumThreads: 1,
  });
  run = async (x) =>
    Object.values(
      await s.run({
        [s.inputNames[0]]: new ort.Tensor("float32", x, [1, 3, S, S]),
      }),
    )[0].data as Float32Array;
} else if (lib === "ort-web") {
  const ort = await import("onnxruntime-web");
  ort.env.wasm.numThreads = 1;
  const s = await ort.InferenceSession.create(readFileSync(path));
  run = async (x) =>
    Object.values(
      await s.run({
        [s.inputNames[0]]: new ort.Tensor("float32", x, [1, 3, S, S]),
      }),
    )[0].data as Float32Array;
} else if (lib === "transformers") {
  const { CLIPVisionModelWithProjection, Tensor, env } =
    await import("@huggingface/transformers");
  env.allowRemoteModels = false;
  env.localModelPath = "/hfjs/";
  const m = await CLIPVisionModelWithProjection.from_pretrained("clip", {
    dtype: path.includes("quantized") ? "q8" : "fp32",
    session_options: { intraOpNumThreads: 1, interOpNumThreads: 1 },
  } as never);
  run = async (x) =>
    (
      (await m({ pixel_values: new Tensor("float32", x, [1, 3, S, S]) })) as {
        image_embeds: { data: Float32Array };
      }
    ).image_embeds.data;
} else if (lib === "openvino") {
  const { addon: ov } = await import("openvino-node");
  const core = new ov.Core();
  const model = await core.readModel(path);
  const c = await core.compileModel(model, "CPU", {
    INFERENCE_NUM_THREADS: "1",
    NUM_STREAMS: "1",
  });
  const req = c.createInferRequest();
  run = async (x) => {
    const r = await req.inferAsync([
      new ov.Tensor(ov.element.f32, [1, 3, S, S], x),
    ]);
    return (Object.values(r)[0] as { data: Float32Array }).data as Float32Array;
  };
} else throw new Error(lib);
const loadMs = performance.now() - t0;

const unit = (v: Float32Array) => {
  const n = Math.hypot(...v);
  return Array.from(v, (x) => x / n);
};
const embs: number[][] = [];
const ts: number[] = [];
let lag = 0;
const lags: number[] = [];
for (let i = 0; i < N; i++) {
  const x = input(i);
  let last = performance.now();
  let it = 0;
  const probe = setInterval(() => {
    const now = performance.now();
    it = Math.max(it, now - last - 5);
    last = now;
  }, 5);
  const s = performance.now();
  const e = await run(x);
  const ms = performance.now() - s;
  // Let a late timer fire before stopping the probe.
  await new Promise((r) => setTimeout(r, 12));
  clearInterval(probe);
  if (i > 0) {
    lags.push(it);
    lag = Math.max(lag, it);
  }
  if (i > 0) ts.push(ms);
  embs.push(unit(e));
}
ts.sort((a, b) => a - b);
const ref = `/w/res/bench-ref-${path.split("/").pop()}.json`;
let agree = "ref";
if (lib === "ort-node") writeFileSync(ref, JSON.stringify(embs));
else if (existsSync(ref)) {
  const r: number[][] = JSON.parse(readFileSync(ref, "utf8"));
  agree = Math.min(
    ...embs.map((e, i) => e.reduce((s, v, k) => s + v * r[i][k], 0)),
  ).toFixed(4);
}
console.log(
  JSON.stringify({
    lib,
    model: path.split("/").pop(),
    loadMs: Math.round(loadMs),
    medianMs: +ts[ts.length >> 1].toFixed(1),
    maxLoopLagMs: Math.round(lag),
    medianLoopLagMs: Math.round(lags.sort((a, b) => a - b)[lags.length >> 1]),
    rssMB: Math.round(process.memoryUsage().rss / 1e6),
    minCosVsOrtNode: agree,
  }),
);
