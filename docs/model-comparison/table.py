import json, glob, os
speed = {}
if os.path.exists("/w/res/speed.json"):
    speed = json.load(open("/w/res/speed.json"))
rows = []
for f in sorted(glob.glob("/w/res/*.json")):
    if "bench" in f or f.endswith("speed.json"):
        continue
    r = json.load(open(f))
    for k in ("fp32", "q8"):
        if f"{k}_acc" not in r:
            continue
        a, d = r[f"{k}_acc"], r[f"{k}_dup"]
        ms = speed.get(f"{r['tag']}-{k}", r.get(f"{k}_ms"))
        rows.append((r["tag"], k, r["size"], r.get(f"{k}_mb"), ms, a["tuned"], a["held"], a["scene_tuned"], a["scene_held"],
                     d["pos_min"], d["hardneg_max"], d.get("auc")))
print("| tag | 版 | 入力 | MB | ms(1T) | 調整209 | held208 | 場面90 | 場面held90 | 同じ18組の最小cos | 別27組の最大cos | AUC |")
print("|" + "---|" * 12)
for x in rows:
    print("| " + " | ".join(str(v) for v in x) + " |")
