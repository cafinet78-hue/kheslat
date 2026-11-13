"""Sound for "The Bridge That Froze the Thames": synthesized SFX + an original skating waltz, timed to the same word
cues as src/videos/frost/story.ts (words.json), mixed to mix.wav (48 kHz, exact film length).
Standard mix: music +3 dB, SFX -6 dB (relative to stems normalised to -20 LUFS), music ducked under the voice's words.
usage: python frost_sound.py ../voice/words.json out_dir [voice.wav]
"""
import json, os, sys
import numpy as np
from dsp import SR, ns, tt, rng, lp, hp, bp, fades, pan, place, dbg, make_ir, convolve_st, integrated, write_wav, read_wav, colored, smooth_noise, modal, phase, shape, true_peak
import sfx_gen as G
import instruments as I

WORDS = json.load(open(sys.argv[1]))
OUT = sys.argv[2]
VOICE = sys.argv[3] if len(sys.argv) > 3 else None
os.makedirs(OUT, exist_ok=True)
FPS = 30
wt = lambda i: WORDS[max(0, min(i, len(WORDS) - 1))]["s"]
wf = lambda i: max(0, round(wt(i) * FPS) - 2)
TOTAL = round((WORDS[-1]["e"] + 1.7) * FPS)
DUR = TOTAL / FPS
N = ns(DUR)
W = dict(elephant0=5, noBridge=10, noBoat=12, justIce=14, that=16, so=29, they=35, party=38, first=41, skaters=44, then1=45, gin=48,
         then2=49, swings=50, skittles=51, printing=53, name=58, card=61, pence=65, someone=66, sheep=70, charged=74, sold=81, slice=87,
         andThen=88, elephant1=96, four=97, theIce=103, split=105, sailing=115, luckily=119, unluckily=128, but=134, bridge1=143, old=144,
         nineteen=149, dam=158, above=159, moved=164, and2=165, its=174, puddle=177, stream=182, in1831=190, five=199, and3=202, down=207,
         theRiver=208, sped=210, and4=212, so2=222, it=236, bridgeEnd=241)
c = lambda k: wf(W[k]) / FPS          # cue time (2 f before the word)
FLASH = c("that")
SPLIT = wt(W["split"]) - 2 / FPS
CRACK0 = wt(W["theIce"]) - 0.1
DEMOL = wt(W["down"]) - 2 / FPS
r = rng(1814)
sfx = np.zeros((2, N))
mus = np.zeros((2, N))


def span(a, b):
    return max(0.0, a), min(DUR, b)


# ================================================================ SFX
def trumpet(dur=1.1, f0=330, up=1.6, smug=False):
    """elephant trumpet: a buzzy saw with a fast pitch bend through nasal formants + breath"""
    n = ns(dur); t = np.arange(n) / SR
    bend = np.interp(t, [0, 0.12 * dur, 0.55 * dur, dur], [0.7, up, up * 1.08, up * (0.9 if smug else 0.75)])
    vib = 1 + 0.02 * np.sin(2 * np.pi * 7.5 * t) + 0.01 * smooth_noise(n, r, 12)
    ph = phase(f0 * bend * vib)
    y = sum((1 / k) * np.sin(k * ph) for k in range(1, 18))
    y = bp(y, 400, 5200, 1) + 0.6 * bp(y, 1100, 1700, 2) + 0.4 * bp(y, 2400, 3100, 2)
    y += 0.25 * bp(r.standard_normal(n), 800, 4000, 1)
    env = np.clip(t / 0.05, 0, 1) * np.clip((dur - t) / 0.18, 0, 1)
    return fades(np.tanh(1.8 * y * env) * 0.8, 0.005, 0.05)


def crunch_bed(a, b, rate=6.0, level=1.0):
    """footsteps in snow / on ice: short filtered noise crunches, random pan"""
    a, b = span(a, b)
    tm = a
    while tm < b:
        L = ns(0.09); tl = np.arange(L) / SR
        k = bp(r.standard_normal(L), 900, 5000, 1) * np.exp(-tl / 0.025) * (1 + 0.5 * np.sin(tl * 900))
        place(sfx, pan(k * level * r.uniform(0.25, 0.7), r.uniform(-0.8, 0.8)), tm)
        tm += r.exponential(1 / rate)


def crowd(a, b, people=8, level=1.0, cheer_at=(), cheer_n=6):
    a, b = span(a, b)
    if b - a < 0.2: return
    d = b - a
    for p in range(people):
        y = G.babble(d, r, r.uniform(110, 230), r.uniform(0.95, 1.18), r.uniform(3.6, 4.8), r.uniform(0.55, 0.8), fmax=3400)
        y = lp(y, 2600) * np.clip(np.arange(len(y)) / SR / 0.3, 0, 1) * np.clip((d - np.arange(len(y)) / SR) / 0.3, 0, 1)
        place(sfx, pan(y * 0.35 * level, r.uniform(-0.9, 0.9)), a)
    for tc in cheer_at:
        for k in range(cheer_n):
            h = G.hurrah(r, r.uniform(120, 240), r.uniform(1.0, 1.18), kid=k % 4 == 0)
            place(sfx, pan(h * 0.5 * level, r.uniform(-0.8, 0.8)), tc + r.uniform(0, 0.25))


def scrape(t0, dur=0.7, level=1.0):
    """an ice skate glide: hissing scrape with a rising then falling band"""
    y = G.whoosh(dur, r, peak=0.35 * dur, f_lo=2500, f_hi=6500, width=0.5, tail=0.18, air=0.3)
    place(sfx, pan(y * 0.5 * level, r.uniform(-0.6, 0.6)), t0)


def clinks(t0, n=3, f=2600):
    for k in range(n):
        place(sfx, pan(G.clink(r, f * r.uniform(0.85, 1.2), 0.18, 1.0) * 0.6, r.uniform(-0.5, 0.5)), t0 + k * 0.07 + r.uniform(0, 0.03))


def wood_knock(t0, level=1.0, low=1.0):
    y = modal(0.35, [(f * low, a, d) for f, a, d in [(180, 1.0, 0.08), (420, 0.6, 0.05), (900, 0.35, 0.025), (1900, 0.2, 0.012)]], r)
    place(sfx, pan(y * level, r.uniform(-0.3, 0.3)), t0)


def water(a, b, close=1.0, level=1.0):
    a, b = span(a, b)
    if b - a < 0.2: return
    y = G.water_bed(b - a, r, close=close)
    y *= np.clip(np.arange(y.shape[1]) / SR / 0.25, 0, 1)[None, :] * np.clip((b - a - np.arange(y.shape[1]) / SR) / 0.25, 0, 1)[None, :]
    place(sfx, y * level, a)


def wind(a, b, level=1.0):
    a, b = span(a, b)
    if b - a < 0.2: return
    y = G.breeze(b - a, r, level=1.0)
    y = y if y.ndim == 2 else pan(y, 0)
    y = y * np.clip(np.arange(y.shape[1]) / SR / 0.4, 0, 1)[None, :] * np.clip((b - a - np.arange(y.shape[1]) / SR) / 0.4, 0, 1)[None, :]
    place(sfx, y * level, a)


def whoosh(t0, dur=0.5, level=1.0):
    place(sfx, G.whoosh(dur, r, peak=0.6 * dur) * 0.5 * level, t0 - 0.6 * dur)


def quack(t0, level=1.0):
    for k in range(2):
        d = 0.16; n = ns(d); t = np.arange(n) / SR
        ph = phase(480 * (1 + 0.25 * np.exp(-t / 0.03)) * (1 - 0.2 * t / d))
        y = sum((1 / k2 ** 0.7) * np.sin(k2 * ph) for k2 in range(1, 14))
        y = bp(y, 900, 3200, 2) * np.clip(t / 0.01, 0, 1) * np.clip((d - t) / 0.04, 0, 1)
        place(sfx, pan(np.tanh(2 * y) * 0.5 * level, 0.1), t0 + k * 0.22)


def crackle(a, b, rate=12, level=1.0, bright=1.0):
    """fire / forming ice: sparse sharp clicks"""
    a, b = span(a, b)
    tm = a
    while tm < b:
        L = ns(0.02); tl = np.arange(L) / SR
        k = hp(r.standard_normal(L), 2000 * bright) * np.exp(-tl / 0.003)
        place(sfx, pan(k * level * r.uniform(0.2, 1.0), r.uniform(-0.6, 0.6)), tm)
        tm += r.exponential(1 / rate)


# hook: elephant on the ice, crowd, trumpet on "elephant", footfalls
crowd(0, FLASH, 7, 0.8, cheer_at=[wt(W["elephant0"]) + 0.3])
crunch_bed(0, FLASH, 5)
place(sfx, pan(trumpet(1.2), -0.1) * 0.9, wt(W["elephant0"]) - 0.15)
for k in range(5): wood_knock(0.4 + k * 0.8, 0.6, 0.45)  # heavy padded footfalls
wood_knock(wt(W["justIce"]) + 0.15, 1.3, 0.35)              # "Just ice": the foot lands
whoosh(FLASH, 0.6, 1.2)
wind(FLASH, c("so"), 1.0)
whoosh(c("so"), 0.4, 0.6)
crunch_bed(c("so"), c("they"), 4)
crowd(c("they"), SPLIT, 10, 0.7, cheer_at=[wt(W["party"])], cheer_n=8)
crunch_bed(c("they"), SPLIT, 7)
for k in range(9): scrape(c("first") + 0.1 + k * 0.38, 0.6, 0.9)
clinks(wt(W["gin"]) - 0.05, 4)
for k in range(4): place(sfx, pan(G.swing_squeak(r, 0.8, k % 2 == 0) * 0.5, -0.3), c("then2") + 0.15 + k * 1.05)
roll = G.whoosh(1.0, r, peak=0.8, f_lo=120, f_hi=500, width=0.7, tail=0.1, air=0.0)
place(sfx, roll * 0.6, wt(W["skittles"]) - 1.0)
for k in range(7): wood_knock(wt(W["skittles"]) + 0.05 + k * 0.035 + r.uniform(0, 0.02), 0.9 * r.uniform(0.5, 1), 1.8 + r.uniform(0, 1.2))
wood_knock(wt(W["name"]) - 0.05, 1.1, 0.7); clinks(wt(W["name"]) - 0.02, 1, 1400)
place(sfx, G.whoosh(0.4, r, peak=0.2, f_lo=1500, f_hi=4000) * 0.3, wt(W["card"]) - 0.45)
clinks(wt(W["pence"]), 2, 3600)
crackle(c("someone"), c("andThen"), 22, 0.5)
clinks(wt(W["charged"]) + 0.1, 2, 3600)
place(sfx, G.whoosh(0.3, r, peak=0.1, f_lo=3000, f_hi=7000) * 0.3, wt(W["slice"]) - 0.2)
crowd(c("andThen"), c("four"), 8, 0.8, cheer_at=[wt(W["elephant1"])], cheer_n=8)
place(sfx, pan(trumpet(1.3, 300, 1.7), 0.2) * 1.0, wt(W["elephant1"]) - 0.1)
# thaw: drips, nervous murmur, the crack racing in, the split, water and grinding floes
drips = G.bubbles(c("theIce") - c("four"), r, 9, 900, 2600, (0.01, 0.03))
place(sfx, pan(drips * 0.8, 0.2), c("four"))
crowd(c("four"), SPLIT, 6, 0.5)
cr = G.creak(SPLIT - CRACK0 + 0.2, r, 60, 260, G.TIMBER, rough=0.25, scale=1.2)
place(sfx, pan(cr * np.linspace(0.2, 1.2, len(cr)), 0) * 0.9, CRACK0)
place(sfx, pan(G.wood_crack(r), 0) * 1.4, SPLIT)
rum = lp(colored(ns(3.0), r, 2.0), 140, 2) * np.exp(-tt(3.0) / 1.1) * 2.0
place(sfx, pan(rum, 0), SPLIT)
water(SPLIT, c("but"), 1.0, 1.0)
for k in range(6): wood_knock(SPLIT + 0.8 + k * 0.6 + r.uniform(0, 0.3), 0.5, 0.5)   # floes knocking together
place(sfx, pan(trumpet(0.6, 360, 1.4, smug=True), 0) * 0.8, wt(W["luckily"]) + 0.9)   # smug toot
for k in range(4): wood_knock(c("unluckily") + 0.2 + k * 0.75, 0.7, 0.8); clinks(c("unluckily") + 0.25 + k * 0.75, 1, 1500)
# the dam: rapids, ice forming (crackles), the duck freezing in
water(c("but"), c("its"), 1.4, 1.2)
crackle(c("above"), c("its"), 16, 0.35, 1.8)
quack(wt(W["moved"]) - 0.2, 1.0)
whoosh(c("dam"), 0.5, 0.8)
# dawn park: birds, a little stream
place(sfx, pan(G.bird_chirps(c("in1831") - c("its"), r, 0.6), 0.3) * 0.6, c("its"))
place(sfx, pan(G.bubbles(c("in1831") - c("its"), r, 40, 500, 2400, (0.006, 0.02)) * 0.7, -0.2), c("its"))
place(sfx, pan(G.whoosh(0.5, r, peak=0.15, f_lo=2000, f_hi=6000) * 0.35, 0), wt(W["puddle"]) + 0.1)
# 1831: the opening crowd, hammers, the old bridge coming down, the fast river, the duck swept by
crowd(c("in1831"), c("and3"), 10, 0.8, cheer_at=[wt(W["five"])], cheer_n=10)
place(sfx, G.applause(c("and3") - c("in1831"), r, 30) * 0.12, c("in1831"))
for k in range(4): place(sfx, pan(G.hammer_hit(r, 0.8) * 0.6, r.uniform(-0.4, 0.4)), c("and3") + 0.1 + k * 0.62)
place(sfx, pan(G.wood_crack(r), 0) * 1.0, DEMOL)
place(sfx, pan(G.splash_big(r), 0) * 1.2, DEMOL + 0.55)
place(sfx, pan(lp(colored(ns(2.5), r, 2.0), 200, 2) * np.exp(-tt(2.5) / 0.9) * 2.2, 0), DEMOL)
water(c("and3"), c("and4"), 1.6, 1.0)
place(sfx, G.whoosh(0.8, r, peak=0.4, f_lo=300, f_hi=1800) * 0.6, c("theRiver") + 1.0)
quack(c("theRiver") + 1.05, 0.9)
water(c("and4"), c("so2"), 0.6, 0.6)
wind(c("and4"), c("so2"), 0.6)
# the golden fair again + snow, the last line
crowd(c("so2"), c("it"), 12, 0.7)
for k in range(4): scrape(c("so2") + 0.3 + k * 0.9, 0.7, 0.5)
wind(c("so2"), DUR, 0.5)
whoosh(c("it"), 0.4, 0.8)

# ================================================================ music: an original skating waltz in F (3/4)
BPM = 156.0; B = 60 / BPM; BAR = 3 * B
F = I.m2f
TUNE = [  # (bar, beat, beats, midi)
    (0, 0, 2, 72), (0, 2, 1, 74), (1, 0, 2, 76), (1, 2, 1, 77), (2, 0, 3, 79), (3, 0, 1, 77), (3, 1, 1, 76), (3, 2, 1, 74),
    (4, 0, 2, 72), (4, 2, 1, 69), (5, 0, 2, 70), (5, 2, 1, 72), (6, 0, 3, 74), (7, 0, 3, 72),
    (8, 0, 2, 81), (8, 2, 1, 79), (9, 0, 2, 77), (9, 2, 1, 76), (10, 0, 2, 74), (10, 2, 1, 76), (11, 0, 3, 77),
    (12, 0, 2, 72), (12, 2, 1, 76), (13, 0, 2, 79), (13, 2, 1, 76), (14, 0, 2, 74), (14, 2, 1, 71), (15, 0, 3, 72),
]
CHORDS = ["F", "F", "C", "C", "F", "Bb", "C", "F", "Dm", "Bb", "C", "F", "F", "C", "G", "C"]
CH = {"F": (41, [65, 69, 72]), "C": (36, [64, 67, 72]), "Bb": (34, [65, 70, 74]), "Dm": (38, [65, 69, 74]), "G": (43, [67, 71, 74]),
      "Gm": (43, [67, 70, 74]), "Am": (45, [64, 69, 72])}


def waltz(t0, t1, vel=1.0, mel="glock", bass=True, tri=True, transpose=0, sparse=False):
    """the waltz from t0 (bar 0) cut at t1: pluck oom-pah-pah, melody on glock / musicbox / vibes"""
    bar = 0
    while t0 + bar * BAR < t1 - 0.05:
        tb = t0 + bar * BAR
        root, triad = CH[CHORDS[bar % 16]]
        if bass:
            place(mus, pan(I.pluck(F(root + transpose), 0.9 * vel, r, 0.9), -0.2), tb)
            if not sparse:
                for bt in (1, 2):
                    if tb + bt * B < t1:
                        for m in triad: place(mus, pan(I.pluck(F(m - 12 + transpose), 0.32 * vel, r, 0.5, bright=0.7), 0.25), tb + bt * B)
        if tri and bar % 2 == 0: place(mus, pan(I.triangle(0.25 * vel, r), 0.5), tb)
        for (b, beat, ln, m) in TUNE:
            if b == bar % 16:
                ts = tb + beat * B
                if ts >= t1: continue
                fn = {"glock": lambda f: I.glock(f, 0.6 * vel, r, 1.4), "musicbox": lambda f: I.musicbox(f, 0.6 * vel, r, 1.6),
                      "vibes": lambda f: I.vibes(f, 0.55 * vel, r, 1.8)}[mel]
                place(mus, pan(fn(F(m + transpose)), 0.1), ts)
        bar += 1


def fanfare(t0, vel=1.0):
    for k, (m, d) in enumerate([(65, 0.18), (69, 0.18), (72, 0.18), (77, 0.6)]):
        for h in (0, -12):
            place(mus, pan(I.brass(F(m + h), d, 0.7 * vel, r, "horn"), -0.2 if h else 0.2), t0 + sum(x[1] for x in [(65, 0.18), (69, 0.18), (72, 0.18)][:k]))


def padc(t0, t1, notes, vel=0.5):
    if t1 - t0 > 0.3: place(mus, I.pad([F(m) for m in notes], t1 - t0, vel, r, att=0.8, rel=0.8), t0)


# hook: sparkle + soft pad, a glock run into the flash
padc(0, FLASH, [53, 60, 65, 69], 0.35)
for k, m in enumerate([72, 76, 79, 84, 88]): place(mus, pan(I.glock(F(m), 0.5, r, 1.6), 0.3), FLASH - 0.5 + k * 0.1)
place(mus, pan(I.triangle(0.5, r), 0.4), FLASH)
padc(FLASH, c("so"), [50, 57, 62, 65], 0.4)                                  # cold aerial: D minor
waltz(c("so"), c("four"), 1.0)                                                 # the fair
fanfare(wt(W["elephant1"]) - 0.1, 0.9)                                         # "came the elephant"
waltz(c("four"), CRACK0 - 0.3, 0.6, "vibes", sparse=True, transpose=-1)       # thaw: thinner, a semitone down, wobbly
# silence through the crack; two deadpan plucks
place(mus, pan(I.pluck(F(48), 0.9, r, 1.2), 0), c("luckily") + 0.05)
place(mus, pan(I.pluck(F(47), 0.9, r, 1.2), 0), c("unluckily") + 0.05)
padc(c("but"), c("its"), [45, 52, 57, 60], 0.35)                               # explanation: A minor pad
for k in range(int((c("its") - c("but")) / (2 * B))): place(mus, pan(I.vibes(F([69, 72, 76, 72][k % 4]), 0.35, r, 1.2), 0.2), c("but") + k * 2 * B)
waltz(c("its"), c("in1831"), 0.7, "musicbox", bass=False, tri=False)           # dawn park: music box
fanfare(c("in1831") + 0.1, 1.0)
waltz(c("in1831") + 1.0, c("and4"), 0.9)                                       # 1831: the waltz in full again
for k, m in enumerate([72, 70, 69, 65]): place(mus, pan(I.pluck(F(m - 12), 0.6, r, 1.4), 0), c("and4") + 0.3 + k * 0.9)  # sad skater
waltz(c("so2"), c("it"), 1.0)                                                  # the greatest party
for m in (41, 53, 60, 65, 69, 72): place(mus, pan(I.brass(F(m), 1.4, 0.4, r, "soft" if m < 60 else "horn"), 0) * 0.45, wt(W["bridgeEnd"]) - 0.05)
place(mus, pan(I.glock(F(84), 0.7, r, 2.4), 0.2), wt(W["bridgeEnd"]) - 0.05)

# ================================================================ mix
hall = make_ir(1.4, 9, pre=0.015, hf=1.4)
mus = mus + 0.25 * convolve_st(mus.mean(0), hall)[:, :N]
mus = hp(mus, 35, 2)
sfx = hp(sfx, 30, 2)
mus *= dbg(-20 - integrated(mus)) * dbg(3.0)
sfx *= dbg(-20 - integrated(sfx)) * dbg(-6.0)
# duck the music under the words (the voice sits on top later)
t = np.arange(N) / SR
duck = np.ones(N)
for w in WORDS:
    a, b = ns(w["s"] - 0.08), ns(w["e"] + 0.12)
    duck[max(0, a):min(N, b)] = dbg(-5)
k = ns(0.12)
duck = np.convolve(duck, np.ones(k) / k, mode="same")
mus *= duck[None, :]
mix = mus + sfx
if VOICE:
    v, sr = read_wav(VOICE)
    assert sr == SR, "voice must be 48 kHz"
    place(mix, v, 0.0)
mix *= dbg(-16 - integrated(mix))
peak = np.abs(mix).max()
if peak > 0.89: mix = np.tanh(mix / 0.89) * 0.89  # soft safety limiter
write_wav(os.path.join(OUT, "mix.wav"), mix)
write_wav(os.path.join(OUT, "music.wav"), mus)
write_wav(os.path.join(OUT, "sfx.wav"), sfx)
print(f"mix.wav {DUR:.2f} s, {integrated(mix):.1f} LUFS, true peak {true_peak(mix):.1f} dBTP")
