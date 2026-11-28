// Does tfjs-node load under Bun, and does a convolution run off the JS thread?
const t0 = performance.now();
const tf = await import("@tensorflow/tfjs-node");
const x = tf.randomNormal([1, 224, 224, 3]);
const k = tf.randomNormal([7, 7, 3, 64]);
let lag = 0,
  last = performance.now();
const probe = setInterval(() => {
  const n = performance.now();
  lag = Math.max(lag, n - last - 5);
  last = n;
}, 5);
const s = performance.now();
for (let i = 0; i < 20; i++) await tf.conv2d(x, k, 2, "same").data();
await new Promise((r) => setTimeout(r, 12));
clearInterval(probe);
console.log(
  JSON.stringify({
    lib: "tfjs-node",
    version: tf.version.tfjs,
    backend: tf.getBackend(),
    loadMs: Math.round(s - t0),
    convMs: +((performance.now() - s) / 20).toFixed(1),
    maxLoopLagMs: Math.round(lag),
  }),
);
