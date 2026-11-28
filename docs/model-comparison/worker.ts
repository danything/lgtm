// onnxruntime-node inside a Bun Worker: does the main thread stay free?
declare const self: Worker;
const ort = await import("onnxruntime-node");
const s = await ort.InferenceSession.create(
  "/hfjs/clip/onnx/vision_model_quantized.onnx",
  { intraOpNumThreads: 1, interOpNumThreads: 1 },
);
self.onmessage = async (e: MessageEvent<Float32Array>) => {
  const o = await s.run({
    pixel_values: new ort.Tensor("float32", e.data, [1, 3, 224, 224]),
  });
  postMessage((o.image_embeds.data as Float32Array).slice());
};
postMessage("ready");
