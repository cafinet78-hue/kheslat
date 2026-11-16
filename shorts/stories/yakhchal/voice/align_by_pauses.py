"""Word timings for a recorded narration without speech-to-text: find the voiced spans (silencedetect), then spread
the script's words over the voiced time in proportion to their estimated length (estimate_words.py), so pauses in the
recording are not given to words. usage: python align_by_pauses.py voice.wav script.txt words.json"""
import json, re, subprocess, sys
wav, script, out = sys.argv[1:4]
e = subprocess.run(["ffmpeg", "-hide_banner", "-nostats", "-i", wav, "-af", "silencedetect=noise=-35dB:d=0.3", "-f", "null", "-"], capture_output=True, text=True).stderr
dur = float(re.search(r"Duration: (\d+):(\d+):([\d.]+)", e).expand(r"\1 \2 \3").split()[2]) + 60 * int(re.search(r"Duration: \d+:(\d+)", e).group(1))
st = [float(x) for x in re.findall(r"silence_start: ([\d.]+)", e)]
en = [float(x) for x in re.findall(r"silence_end: ([\d.]+)", e)]
sil = list(zip(st, en + [dur] * (len(st) - len(en))))
voiced, t = [], 0.0
for a, b in sil:
    if a > t + 0.05: voiced.append((t, a))
    t = b
if t < dur - 0.05: voiced.append((t, dur))
total = sum(b - a for a, b in voiced)
sys.argv = ["x", script, "/dev/null", "60"]
est = json.load(open(subprocess.run([sys.executable, "estimate_words.py", script, "_est.json", "60"], capture_output=True, text=True) and "_est.json"))
units = [(w["w"], w["e"] - w["s"]) for w in est]
U = sum(u for _, u in units)
def at(x):  # voiced-time position x (s) -> recording time
    for a, b in voiced:
        if x <= b - a: return a + x
        x -= b - a
    return voiced[-1][1]
res, acc = [], 0.0
for i, (w, u) in enumerate(units):
    s0 = acc / U * total; acc += u; s1 = acc / U * total
    res.append({"i": i, "w": w, "s": round(at(s0 + 1e-4), 3), "e": round(at(s1 - 1e-4), 3)})
json.dump(res, open(out, "w"), indent=0)
print(f"{len(voiced)} voiced spans, {total:.1f} s voiced of {dur:.1f} s; last word ends {res[-1]['e']:.2f}")
