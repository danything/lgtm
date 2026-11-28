#!/bin/bash
# Every model through eval.py, one at a time. M is the work folder holding
# data/ (names, labels, prompts: not in the repository) and out/ (prep.ts).
# Images: `wslc build -t mc-eval -f Dockerfile.eval .`
set -u
: "${M:?set M to the work folder}"
R() { MSYS_NO_PATHCONV=1 wslc run --rm -v mc-hf:/hf -v "$M/data:/w/data:ro" -v "$M/out:/w/out:ro" -v "$PWD:/p:ro" -v "$M/res:/w/res" -v "$M/emb:/w/emb" -v mc-onnx:/w/onnx mc-eval python /p/eval.py "$@" > "$M/log-$1.txt" 2>&1 < /dev/null; tail -1 "$M/log-$1.txt"; }
while read -r t k a b; do [ -f "$M/res/$t.json" ] || R "$t" "$k" $a $b; done <<'L'
xenova-b32 xenova
oc-b32-openai openclip ViT-B-32 openai
oc-b16-openai openclip ViT-B-16 openai
oc-l14-openai openclip ViT-L-14 openai
oc-b32-laion openclip ViT-B-32 laion2b_s34b_b79k
oc-b16-laion openclip ViT-B-16 laion2b_s34b_b88k
oc-b32-dc openclip ViT-B-32 datacomp_xl_s13b_b90k
oc-b16-dc openclip ViT-B-16 datacomp_xl_s13b_b90k
oc-b32-256-dc openclip ViT-B-32-256 datacomp_s34b_b86k
oc-siglip-b16 openclip ViT-B-16-SigLIP webli
oc-siglip2-b16 openclip ViT-B-16-SigLIP2 webli
oc-siglip2-b32 openclip ViT-B-32-SigLIP2-256 webli
oc-siglip2-so400m openclip ViT-SO400M-14-SigLIP2 webli
oc-eva02-b16 openclip EVA02-B-16 merged2b_s8b_b131k
hf-tinyclip-8m hf wkcn/TinyCLIP-ViT-8M-16-Text-3M-YFCC15M
hf-tinyclip-40m hf wkcn/TinyCLIP-ViT-40M-32-Text-19M-LAION400M
jina-clip-v1 jina
nomic-v15 nomic
L
# Then, with nothing else running: speed.py, stats.py, table.py (same mounts).
# Libraries (Dockerfile.bench as mc-bench-dl): for each model file, ort-node
# first, then ort-web, transformers, openvino; bun worker-main.ts; bun tfjs.ts.
