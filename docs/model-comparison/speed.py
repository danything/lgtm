"""Speed only, nothing else running: one thread, one picture at a time,
median of 30 after a first run. Writes /w/res/speed.json {"<tag>-<fp32|q8>": ms}."""
import glob, json, os, time
import numpy as np
import onnxruntime as ort
from huggingface_hub import hf_hub_download

out = {}
meta = json.load(open("/w/out/meta.json"))
N = len(meta)
for f in sorted(glob.glob("/w/res/*.json")):
    if "bench" in f or f.endswith("speed.json"):
        continue
    r = json.load(open(f))
    tag, size = r["tag"], r["size"]
    if r["kind"] in ("openclip", "hf"):
        files = {"fp32": f"/w/onnx/{tag}.onnx", "q8": f"/w/onnx/{tag}-q8.onnx"}
    else:
        p = [x for x in r["pins"] if "file" in x and ("vision" in x["repo"] or "clip" in x["repo"]) and "text" not in x["file"]]
        files = {}
        for x in p:
            k = "q8" if "quantized" in x["file"] else "fp32"
            files[k] = hf_hub_download(x["repo"], x["file"], revision=x["revision"])
    px = np.memmap(f"/w/out/px-{size}.f32", dtype=np.float32, mode="r").reshape(N, size, size, 3)
    for k, path in files.items():
        if not os.path.exists(path):
            continue
        so = ort.SessionOptions()
        so.intra_op_num_threads = 1
        so.inter_op_num_threads = 1
        s = ort.InferenceSession(path, so, providers=["CPUExecutionProvider"])
        name = s.get_inputs()[0].name
        x = lambda i: (px[i:i + 1].transpose(0, 3, 1, 2) / 255.0 - 0.5).astype(np.float32)
        s.run(None, {name: x(0)})
        ts = []
        for i in range(1, 31):
            t = time.perf_counter()
            s.run(None, {name: x(i)})
            ts.append((time.perf_counter() - t) * 1000)
        out[f"{tag}-{k}"] = round(float(np.median(ts)), 1)
        print(tag, k, out[f"{tag}-{k}"], flush=True)
json.dump(out, open("/w/res/speed.json", "w"), indent=1)
