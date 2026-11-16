"""Estimate word timings (words.json) from script.txt when no recorded voice exists yet.

Per word: 0.06 s + 0.155 s per syllable; pauses after commas, sentence ends and paragraph breaks; then everything is
scaled so the speech fills TARGET seconds after a LEAD-in. Replace with a forced alignment of the real voice
(align_words.py) as soon as voice.wav exists; story.ts reads only words.ts, so the film re-times itself.
usage: python estimate_words.py script.txt words.json [target_seconds]
"""
import json, re, sys

LEAD, TARGET = 0.35, float(sys.argv[3]) if len(sys.argv) > 3 else 66.0
NUM = {"1814": "eighteen fourteen", "1831": "eighteen thirty one"}

def syll(w: str) -> int:
    w = w.lower()
    if w in NUM: return sum(syll(x) for x in NUM[w].split())
    if re.search(r"[\u0600-\u06FF]", w):  # Persian: ~2.3 letters per syllable (short vowels are not written)
        n = len(re.sub(r"[^\u0600-\u06FF]", "", w))
        return max(1, round(n / 2.3))
    w = re.sub(r"[^a-z]", "", w)
    if not w: return 1
    groups = re.findall(r"[aeiouy]+", w)
    n = len(groups)
    if w.endswith("e") and not w.endswith(("le", "ee")) and n > 1: n -= 1
    return max(1, n)

text = open(sys.argv[1], encoding="utf-8").read()
items = []  # (word, dur, pause_after)
for para in [p for p in text.split("\n") if p.strip()]:
    toks = para.split()
    for i, t in enumerate(toks):
        w = re.sub(r"^[^\w'\u200c]+|[^\w'\u200c]+$", "", t)
        pause = 0.0
        if t.endswith((",", "\u060c")): pause = 0.22
        if t.endswith(("\u061b", ":")): pause = 0.32
        if t.endswith((".", "!", "?", "\u061f")): pause = 0.45
        if t.endswith("..."): pause = 0.55
        if i == len(toks) - 1: pause = max(pause, 0.6)
        items.append([w, 0.06 + 0.155 * syll(w), pause])
items[-1][2] = 0.0
raw = sum(d + p for _, d, p in items)
k = TARGET / raw
t, out = LEAD, []
for i, (w, d, p) in enumerate(items):
    s, e = t, t + d * k
    out.append({"i": i, "w": w, "s": round(s, 3), "e": round(e, 3)})
    t = e + p * k
json.dump(out, open(sys.argv[2], "w"), indent=0)
print(f"{len(out)} words, speech ends at {out[-1]['e']:.2f} s (scale {k:.3f})")
