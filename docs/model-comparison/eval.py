"""One model, end to end: pinned download, text centroids, ONNX image tower
(fp32 and dynamic 8 bit), embeddings of the 1,668 unstamped pictures, speed at
one thread, top-1 accuracy on the labelled sets, duplicate separation.

python eval.py <tag> openclip <model> <pretrained>
python eval.py <tag> hf <repo>            (transformers CLIPModel, e.g. TinyCLIP)
python eval.py <tag> xenova               (the shipped Xenova ONNX + repo centroids)
Writes /w/res/<tag>.json and /w/emb/<tag>-{fp32,q8}.npy
"""
import json, os, re, sys, time, hashlib
import numpy as np

tag, kind = sys.argv[1], sys.argv[2]
D = "/w/data"
os.makedirs("/w/res", exist_ok=True)
os.makedirs("/w/emb", exist_ok=True)
os.makedirs("/w/onnx", exist_ok=True)

meta = json.load(open("/w/out/meta.json"))
names = [m["name"] for m in meta]
idx = {n: i for i, n in enumerate(names)}

PROMPTS = json.load(open(f"{D}/prompts.json"))
SCENES = json.load(open(f"{D}/scene-prompts.json"))

from huggingface_hub import HfApi, hf_hub_download
api = HfApi()
pins = []


def pinned(repo, filename):
    info = api.model_info(repo, files_metadata=True)
    f = next(s for s in info.siblings if s.rfilename == filename)
    path = hf_hub_download(repo, filename, revision=info.sha)
    sha = f.lfs.sha256 if f.lfs else None
    if sha:
        h = hashlib.sha256()
        with open(path, "rb") as fh:
            for chunk in iter(lambda: fh.read(1 << 20), b""):
                h.update(chunk)
        assert h.hexdigest() == sha, (repo, filename)
    pins.append({"repo": repo, "file": filename, "revision": info.sha, "sha256": sha, "size": f.size})
    return path


def unit(v):
    return v / np.linalg.norm(v, axis=-1, keepdims=True)


result = {"tag": tag, "kind": kind, "args": sys.argv[3:]}

if kind == "xenova":
    repo, rev = "Xenova/clip-vit-base-patch32", "6b7c523703ae26e39be4b03774966f8571c7f523"
    q8 = hf_hub_download(repo, "onnx/vision_model_quantized.onnx", revision=rev)
    pins.append({"repo": repo, "file": "onnx/vision_model_quantized.onnx", "revision": rev})
    cen = {k: np.array(v) for k, v in json.load(open(f"{D}/centroids.json")).items()}
    scen = {k: np.array(v) for k, v in json.load(open(f"{D}/scene-centroids.json")).items()}
    size, mean, std = 224, (0.48145466, 0.4578275, 0.40821073), (0.26862954, 0.26130258, 0.27577711)
    files = {"q8": q8}
    in_name = "pixel_values"
elif kind in ("jina", "nomic"):
    # Both ship their own ONNX towers (and need remote code otherwise).
    import onnxruntime as ort
    from transformers import AutoTokenizer
    if kind == "jina":
        vrepo = trepo = "jinaai/jina-clip-v1"
        vf, vq, tf_ = "onnx/vision_model.onnx", "onnx/vision_model_quantized.onnx", "onnx/text_model.onnx"
        prefix = ""
    else:
        vrepo, trepo = "nomic-ai/nomic-embed-vision-v1.5", "nomic-ai/nomic-embed-text-v1.5"
        vf, vq, tf_ = "onnx/model.onnx", "onnx/model_quantized.onnx", "onnx/model.onnx"
        prefix = "search_query: "
    files = {"fp32": pinned(vrepo, vf), "q8": pinned(vrepo, vq)}
    tsess = ort.InferenceSession(pinned(trepo, tf_), providers=["CPUExecutionProvider"])
    from huggingface_hub import snapshot_download
    trev = api.model_info(trepo).sha
    # tokenizer.json alone: AutoTokenizer asks to run the repo's code (and waits on stdin).
    from transformers import PreTrainedTokenizerFast
    tdir = snapshot_download(trepo, revision=trev, allow_patterns=["*.json", "*.txt"])
    tok = PreTrainedTokenizerFast(tokenizer_file=f"{tdir}/tokenizer.json", pad_token="[PAD]")
    tin = [i.name for i in tsess.get_inputs()]

    def text(ts):
        out = []
        for t in ts:
            enc = tok([prefix + t], return_tensors="np", padding=True)
            feed = {k: enc[k].astype(np.int64) for k in tin if k in enc}
            if "token_type_ids" in tin and "token_type_ids" not in feed:
                feed["token_type_ids"] = np.zeros_like(enc["input_ids"], dtype=np.int64)
            o = tsess.run(None, feed)[0]
            if o.ndim == 3:  # nomic: mean pool, layer norm, as its card says
                m = enc["attention_mask"][..., None]
                o = (o * m).sum(1) / m.sum(1)
                o = (o - o.mean(-1, keepdims=True)) / np.sqrt(o.var(-1, keepdims=True) + 1e-5)
            out.append(o[0])
        return np.stack(out)

    def centroids(all_):
        return {k: unit(unit(text(ps)).sum(0)) for k, ps in all_.items()}

    cen, scen = centroids(PROMPTS), centroids(SCENES)
    size, mean, std = 224, (0.48145466, 0.4578275, 0.40821073), (0.26862954, 0.26130258, 0.27577711)
    in_name = ort.InferenceSession(files["q8"], providers=["CPUExecutionProvider"]).get_inputs()[0].name
else:
    import torch
    torch.set_grad_enabled(False)
    if kind == "openclip":
        import open_clip
        model_name, pre = sys.argv[3], sys.argv[4]
        cfg = open_clip.get_pretrained_cfg(model_name, pre)
        hub = cfg["hf_hub"].strip("/")
        fname = None
        info = api.model_info(hub)
        names_in = [s.rfilename for s in info.siblings]
        for cand in ("open_clip_model.safetensors", "open_clip_pytorch_model.bin"):
            if cand in names_in:
                fname = cand
                break
        weights = pinned(hub, fname)
        model, _, preprocess = open_clip.create_model_and_transforms(model_name, pretrained=weights)
        model.eval()
        tokenizer = open_clip.get_tokenizer(model_name)
        pc = model.visual.preprocess_cfg if hasattr(model.visual, "preprocess_cfg") else {}
        size = model.visual.image_size
        size = size[0] if isinstance(size, (tuple, list)) else size
        # SigLIP and others normalise with 0.5/0.5: take it from the
        # pretrained config, which every open_clip tag carries.
        mean = tuple(cfg.get("mean") or pc.get("mean") or (0.48145466, 0.4578275, 0.40821073))
        std = tuple(cfg.get("std") or pc.get("std") or (0.26862954, 0.26130258, 0.27577711))
        try:
            from open_clip import reparameterize_model
            model = reparameterize_model(model)
        except Exception:
            pass

        def text(ts):
            return model.encode_text(tokenizer(ts)).float().numpy()

        class Vis(torch.nn.Module):
            def __init__(s, m):
                super().__init__()
                s.m = m

            def forward(s, x):
                return s.m.encode_image(x)

        vis = Vis(model)
    else:
        from transformers import CLIPModel, CLIPProcessor
        repo = sys.argv[3]
        info = api.model_info(repo)
        from huggingface_hub import snapshot_download
        local = snapshot_download(repo, revision=info.sha, allow_patterns=["*.json", "*.txt", "*.safetensors", "*.bin", "*.model"])
        pins.append({"repo": repo, "revision": info.sha})
        model = CLIPModel.from_pretrained(local).eval()
        proc = CLIPProcessor.from_pretrained(local)
        size = proc.image_processor.crop_size["height"]
        mean, std = tuple(proc.image_processor.image_mean), tuple(proc.image_processor.image_std)

        def text(ts):
            t = proc.tokenizer(ts, padding=True, return_tensors="pt")
            o = model.get_text_features(**t)
            o = getattr(o, "pooler_output", o)
            return o.float().numpy()

        class Vis(torch.nn.Module):
            def __init__(s, m):
                super().__init__()
                s.m = m

            def forward(s, x):
                o = s.m.get_image_features(pixel_values=x)
                return getattr(o, "pooler_output", o)

        vis = Vis(model)

    def centroids(all_):
        out = {}
        for k, ps in all_.items():
            out[k] = unit(unit(text(ps)).sum(0))
        return out

    cen, scen = centroids(PROMPTS), centroids(SCENES)
    fp32 = f"/w/onnx/{tag}.onnx"
    q8 = f"/w/onnx/{tag}-q8.onnx"
    if not os.path.exists(q8):
        torch.onnx.export(vis, torch.randn(1, 3, size, size), fp32, input_names=["pixel_values"],
                          output_names=["image_embeds"], dynamic_axes={"pixel_values": {0: "b"}, "image_embeds": {0: "b"}},
                          opset_version=17, dynamo=False)
        from onnxruntime.quantization import quantize_dynamic, QuantType
        from onnxruntime.quantization.shape_inference import quant_pre_process
        try:
            quant_pre_process(fp32, fp32 + ".pre.onnx", skip_symbolic_shape=True)
            src = fp32 + ".pre.onnx"
        except Exception as e:
            print("preprocess skipped", e)
            src = fp32
        try:
            quantize_dynamic(src, q8, weight_type=QuantType.QUInt8)
        except ValueError as e:
            print("quantize from the preprocessed model failed, from the export:", e)
            quantize_dynamic(fp32, q8, weight_type=QuantType.QUInt8)
        if src != fp32:
            os.remove(src)
    files = {"fp32": fp32, "q8": q8}
    in_name = "pixel_values"

result.update({"size": size, "mean": mean, "std": std, "pins": pins})
px = np.memmap(f"/w/out/px-{size}.f32", dtype=np.float32, mode="r").reshape(len(names), size, size, 3)
M = np.array(mean, dtype=np.float32).reshape(1, 3, 1, 1)
S = np.array(std, dtype=np.float32).reshape(1, 3, 1, 1)


def inputs(ix):
    x = px[ix].astype(np.float32).transpose(0, 3, 1, 2) / 255.0
    return ((x - M) / S).astype(np.float32)


import onnxruntime as ort


def first(outs):
    o = outs[0]
    return o[:, 0] if o.ndim == 3 else o

ok = [i for i, m in enumerate(meta) if m["ok"]]
ALL = os.environ.get("ALL") == "1"
_pairs = json.load(open(f"{D}/pairs.json"))
want = set()
for f in ("sample.txt", "held.txt"):
    want |= {idx[n] for n in open(f"{D}/{f}").read().split() if n}
want |= {idx[n] for n in open(f"{D}/persons.txt").read().split()[:180]}
for p in _pairs:
    if p["sameAspect"] and p["cos"] >= 0.95:
        want |= {idx[p["a"]], idx[p["b"]]}
todo = ok if ALL else [i for i in ok if i in want]
result["embedded"] = len(todo)
for kind_, path in files.items():
    result[f"{kind_}_mb"] = round(sum(os.path.getsize(p) for p in [path, path + ".data"] if os.path.exists(p)) / 1e6, 1)
    so = ort.SessionOptions()
    so.intra_op_num_threads = 12
    sess = ort.InferenceSession(path, so, providers=["CPUExecutionProvider"])
    embp = f"/w/emb/{tag}-{kind_}.npy"
    if os.path.exists(embp):
        E = np.load(embp)
    else:
        E = np.zeros((len(names), list(cen.values())[0].shape[0]), dtype=np.float32)
        bs = 1  # dynamic 8 bit scales activations per batch: one at a time, as served
        for s in range(0, len(todo), bs):
            ix = todo[s:s + bs]
            try:
                E[ix] = first(sess.run(None, {in_name: inputs(ix)}))
            except Exception:
                for i in ix:
                    E[i] = first(sess.run(None, {in_name: inputs([i])}))[0]
        E = unit(E + 1e-12)
        np.save(embp, E)
    # One thread, one picture at a time, as the server runs it.
    so1 = ort.SessionOptions()
    so1.intra_op_num_threads = 1
    so1.inter_op_num_threads = 1
    s1 = ort.InferenceSession(path, so1, providers=["CPUExecutionProvider"])
    t0 = time.perf_counter()
    s1.run(None, {in_name: inputs([ok[0]])})
    result[f"{kind_}_first_ms"] = round((time.perf_counter() - t0) * 1000)
    ts = []
    for i in ok[1:31]:
        t = time.perf_counter()
        s1.run(None, {in_name: inputs([i])})
        ts.append((time.perf_counter() - t) * 1000)
    result[f"{kind_}_ms"] = round(float(np.median(ts)), 1)

    # --- accuracy
    def lst(f):
        return [l for l in open(f"{D}/{f}").read().split("\n") if l]

    def ts_truth(f):
        return {int(k): v for k, v in re.findall(r'(\d+):\s*"([^"]+)"', open(f"{D}/{f}").read())}

    def top1(e, cs):
        ks = list(cs)
        sc = np.stack([cs[k] for k in ks]) @ e
        return ks[int(np.argmax(sc))]

    acc = {}
    hits = {}
    for setname, lf, tf in (("tuned", "sample.txt", "truth.ts"), ("held", "held.txt", "truth-held.ts")):
        truth = ts_truth(tf)
        L = lst(lf)
        hl = [int(top1(E[idx[n]], cen) in truth.get(i, "person").split("|")) for i, n in enumerate(L)]
        hits[setname] = hl
        hit = sum(hl)
        acc[setname] = round(hit / len(L) * 100, 1)
        acc[setname + "_n"] = len(L)
    src = open(f"{D}/truth-scenes.ts").read()
    codes = re.search(r'codes = "([^"]+)"', src).group(1).split(",")
    held = re.search(r'held = "([^"]+)"', src).group(1).split(",")
    MAP = {"live": "L", "selfie": "S", "group": "G", "pose": "P", "drink": "D", "outfit": "O"}
    P = lst("persons.txt")
    for setname, cs, off in (("scene_tuned", codes, 0), ("scene_held", held, 90)):
        hit = 0
        hits[setname] = []
        for i, c in enumerate(cs):
            got = top1(E[idx[P[off + i]]], scen)
            got = MAP.get(got, "R")
            hit += got in c.split("|")
            hits[setname].append(int(got in c.split("|")))
        acc[setname] = round(hit / len(cs) * 100, 1)
    result[f"{kind_}_acc"] = acc
    result[f"{kind_}_hits"] = hits

    # --- duplicates: the 18 pairs CLIP B/32 put at >= 0.97 (all checked by eye
    # as the same shot) against same-aspect pairs at 0.95-0.97 (checked: different).
    pairs = json.load(open(f"{D}/pairs.json"))
    pos = [(p["a"], p["b"]) for p in pairs if p["cos"] >= 0.97 and p["sameAspect"]]
    neg = [(p["a"], p["b"]) for p in pairs if 0.95 <= p["cos"] < 0.97 and p["sameAspect"]]
    cos = lambda a, b: float(E[idx[a]] @ E[idx[b]])
    pc = sorted(cos(a, b) for a, b in pos)
    nc = sorted(cos(a, b) for a, b in neg)
    thr = pc[0]
    if ALL:
        ar = np.array([m["width"] / max(1, m["height"]) for m in meta])
        G = E[ok] @ E[ok].T
        iu = np.triu_indices(len(ok), 1)
        same = np.abs(ar[ok][iu[0]] - ar[ok][iu[1]]) < 0.01
        vals = G[iu][same]
    else:
        vals = np.array([])
    result[f"{kind_}_dup"] = {
        "pos_min": round(pc[0], 4), "pos_median": round(pc[len(pc) // 2], 4),
        "hardneg_max": round(nc[-1], 4) if nc else None, "hardneg_n": len(nc),
        "pairs_at_pos_min": int((vals >= thr).sum()) if ALL else None,
        "pairs_at_0.97": int((vals >= 0.97).sum()) if ALL else None,
        "separable": bool(nc and pc[0] > nc[-1]),
        # share of (same shot, different shot) pairs ranked the right way round
        # fewest mistakes over the 45 pairs at the best threshold for this model
        "best_err": min(sum(p < t for p in pc) + sum(n >= t for n in nc) for t in pc + nc + [1.01]),
        "best_thr": min((sum(p < t for p in pc) + sum(n >= t for n in nc), t) for t in pc + nc + [1.01])[1],
        "auc": round(float(np.mean([[p > n for n in nc] for p in pc])), 3),
    }
    print(kind_, json.dumps({k: result[k] for k in result if k.startswith(kind_)}))

json.dump(result, open(f"/w/res/{tag}.json", "w"), indent=1)
print("OK", tag)
