const w = new Worker("/t/worker.ts");
await new Promise((r) => (w.onmessage = r));
const x = new Float32Array(3 * 224 * 224).fill(0.1);
const ts: number[] = [],
  lags: number[] = [];
for (let i = 0; i < 21; i++) {
  let it = 0,
    last = performance.now();
  const probe = setInterval(() => {
    const n = performance.now();
    it = Math.max(it, n - last - 5);
    last = n;
  }, 5);
  const s = performance.now();
  await new Promise((r) => {
    w.onmessage = r;
    w.postMessage(x);
  });
  const ms = performance.now() - s;
  await new Promise((r) => setTimeout(r, 12));
  clearInterval(probe);
  if (i > 0) {
    ts.push(ms);
    lags.push(it);
  }
}
ts.sort((a, b) => a - b);
lags.sort((a, b) => a - b);
console.log(
  JSON.stringify({
    lib: "ort-node in Worker",
    medianMs: +ts[10].toFixed(1),
    medianLoopLagMs: Math.round(lags[10]),
    maxLoopLagMs: Math.round(lags.at(-1)!),
    rssMB: Math.round(process.memoryUsage().rss / 1e6),
  }),
);
process.exit(0);
