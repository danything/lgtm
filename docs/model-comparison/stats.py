"""Paired against the shipped model (xenova-b32 q8), picture by picture:
pictures only it gets right (b) vs only the other gets right (c), exact
two-sided McNemar p. Also the duplicate mistakes at each model's best threshold."""
import glob, json
from math import comb

base = json.load(open("/w/res/xenova-b32.json"))["q8_hits"]


def mcnemar(b, c):
    n = b + c
    if n == 0:
        return 1.0
    k = min(b, c)
    return min(1.0, 2 * sum(comb(n, i) for i in range(k + 1)) / 2 ** n)


print("| tag | 版 | held: 今だけ正 / 相手だけ正 / p | 場面 (90+90): 今だけ / 相手だけ / p | 重複 45 組の誤り (しきい値) |")
print("|---|---|---|---|---|")
for f in sorted(glob.glob("/w/res/*.json")):
    if "bench" in f or "speed" in f:
        continue
    r = json.load(open(f))
    for k in ("fp32", "q8"):
        h = r.get(f"{k}_hits")
        if not h:
            continue
        cells = []
        for sets in (("held",), ("scene_tuned", "scene_held")):
            a = sum((base[s] for s in sets), [])
            o = sum((h[s] for s in sets), [])
            b = sum(x and not y for x, y in zip(a, o))
            c = sum(y and not x for x, y in zip(a, o))
            cells.append(f"{b} / {c} / {mcnemar(b, c):.2f}")
        d = r[f"{k}_dup"]
        cells.append(f"{d.get('best_err')} ({d.get('best_thr')})")
        print(f"| {r['tag']} | {k} | " + " | ".join(cells) + " |")
