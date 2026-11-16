"""Sound for Tarikh-Khand ep. 1 (yakhchal): synthesized SFX + an original santur-like tune over a drone, timed to the same
word cues as src/videos/yakh/story.ts (words.json). Mix: music +3 dB, SFX -6 dB (stems at -20 LUFS), music ducked
under the words. usage: python yakh_sound.py ../voice/words.json out_dir [voice.wav]"""
import json, os, sys
import numpy as np
from dsp import SR, ns, tt, rng, lp, hp, bp, fades, pan, place, dbg, make_ir, convolve_st, integrated, write_wav, read_wav, colored, smooth_noise, modal, phase, true_peak
import sfx_gen as G
import instruments as I

WORDS = json.load(open(sys.argv[1])); OUT = sys.argv[2]; VOICE = sys.argv[3] if len(sys.argv) > 3 else None
os.makedirs(OUT, exist_ok=True)
FPS = 30
wt = lambda i: WORDS[max(0, min(i, len(WORDS) - 1))]["s"]
wf = lambda i: max(0, round(wt(i) * FPS) - 2)
TOTAL = round((WORDS[-1]["e"] + 1.8) * FPS); DUR = TOTAL / FPS; N = ns(DUR)
W = dict(ice0=11, noPower=13, yazd=17, thirsty=21, winter=24, beside=36, tall=41, night1=49, freeze=51, morning=53, breakIce=57,
         carry=59, tomorrow=65, dayAfter=68, until=71, summer2=76, but=83, ice2=86, luckily=87, unluckily=93, secret=100, even=117,
         like=126, cold=143, wallDome=145, goatHair=157, goat=158, meybod=159, next=163, open=170, oneOf=174, sky3=187)
c = lambda k: wf(W[k]) / FPS
r = rng(1394)
sfx = np.zeros((2, N)); mus = np.zeros((2, N))
span = lambda a, b: (max(0.0, a), min(DUR, b))


def bed(a, b, y, level=1.0, fade=0.4):
    a, b = span(a, b)
    if b - a < 0.2: return
    y = y if y.ndim == 2 else pan(y, 0)
    y = y[:, :ns(b - a)]
    t = np.arange(y.shape[1]) / SR
    place(sfx, y * level * np.clip(t / fade, 0, 1)[None, :] * np.clip((b - a - t) / fade, 0, 1)[None, :], a)


def wind(a, b, level=1.0): bed(a, b, G.breeze(max(0.3, b - a), r, level=1.0), level)
def crickets(a, b, level=1.0): bed(a, b, G.crickets(max(0.3, b - a), r), level)
def crowd(a, b, people=6, level=1.0):
    a, b = span(a, b)
    for p in range(people):
        y = lp(G.babble(b - a, r, r.uniform(110, 230), r.uniform(0.95, 1.18), r.uniform(3.6, 4.8), r.uniform(0.5, 0.75), fmax=3400), 2600)
        bed(a, b, pan(y * 0.35, r.uniform(-0.9, 0.9)), level, 0.3)
def knock(t0, level=1.0, low=1.0):
    y = modal(0.3, [(f * low, a, d) for f, a, d in [(180, 1.0, 0.08), (420, 0.6, 0.05), (900, 0.35, 0.025), (1900, 0.2, 0.012)]], r)
    place(sfx, pan(y * level, r.uniform(-0.3, 0.3)), t0)
def ice_hit(t0, level=1.0):
    y = modal(0.4, [(r.uniform(1800, 2600), 1.0, 0.03), (r.uniform(3500, 5200), 0.6, 0.015), (r.uniform(700, 1100), 0.5, 0.05)], r)
    y += hp(r.standard_normal(ns(0.4)), 2500) * np.exp(-tt(0.4) / 0.006) * 0.8
    place(sfx, pan(y * level, r.uniform(-0.4, 0.4)), t0); knock(t0, 0.5 * level, 0.6)
def pour(t0, dur=1.2, level=1.0):
    y = G.bubbles(dur, r, 260, 300, 2200, (0.006, 0.025)) + 0.4 * bp(colored(ns(dur), r, 0.5), 400, 3000, 1)
    place(sfx, pan(y * np.clip(tt(dur) / 0.1, 0, 1) * np.clip((dur - tt(dur)) / 0.3, 0, 1) * 0.6 * level, r.uniform(-0.5, 0.5)), t0)
def crackle(a, b, rate=12, level=1.0):
    a, b = span(a, b); tm = a
    while tm < b:
        L = ns(0.02); k = hp(r.standard_normal(L), 3000) * np.exp(-tt(0.02) / 0.003)
        place(sfx, pan(k * level * r.uniform(0.2, 1.0), r.uniform(-0.6, 0.6)), tm); tm += r.exponential(1 / rate)
def whoosh(t0, dur=0.5, level=1.0): place(sfx, G.whoosh(dur, r, peak=0.6 * dur) * 0.5 * level, t0 - 0.6 * dur)
def bleat(t0, level=1.0):
    d = 0.7; n = ns(d); t = np.arange(n) / SR
    f0 = 420 * (1 + 0.08 * np.sin(2 * np.pi * 9 * t)) * (1 + 0.15 * np.exp(-t / 0.1))
    y = sum((1 / k ** 0.8) * np.sin(k * phase(f0)) for k in range(1, 16))
    y = bp(y, 500, 3500, 2) * np.clip(t / 0.03, 0, 1) * np.clip((d - t) / 0.15, 0, 1)
    place(sfx, pan(np.tanh(2 * y) * 0.5 * level, 0.1), t0)
def scrape(t0, n=6):
    for k in range(n): place(sfx, pan(G.whoosh(0.22, r, peak=0.1, f_lo=2500, f_hi=7000, width=0.4, tail=0.06, air=0.4) * 0.5, 0.2), t0 + k * 0.33)

# hook: heat (wind), the slurp of ice, the town, thirst
wind(0, c("winter"), 0.8)
place(sfx, pan(G.whoosh(0.4, r, peak=0.1, f_lo=2500, f_hi=6000) * 0.4, 0), wt(W["ice0"]))
crackle(wt(W["ice0"]), wt(W["ice0"]) + 0.6, 30, 0.6)
whoosh(c("yazd"), 0.6, 1.2)
crowd(c("thirsty"), c("winter"), 6, 0.6)
# winter nights: crickets, pouring water, the wall, freezing crackles
crickets(c("winter"), c("morning"), 0.8)
for k in range(5): pour(c("winter") + 0.2 + k * 0.55, 1.0, 0.8)
wind(c("beside"), c("night1"), 0.6)
crackle(c("night1"), c("morning"), 18, 0.4)
# dawn: hacking the ice, carrying, again and again
for tb in [wt(W["breakIce"]) - 0.05, wt(W["breakIce"]) + 0.45, wt(W["dayAfter"]) + 0.3, wt(W["dayAfter"]) + 0.9]: ice_hit(tb, 1.2)
for k in range(8): ice_hit(c("morning") + 0.3 + k * 0.42, 0.45)
crickets(c("tomorrow"), c("dayAfter"), 0.7); crackle(c("tomorrow"), c("dayAfter"), 14, 0.35)
for k in range(6): ice_hit(c("dayAfter") + 0.2 + k * 0.4, 0.4)
for k in range(5): knock(c("until") + 0.3 + k * 0.6, 0.8, 0.7)   # blocks stacked in the pit
# summer: heat outside, the cold inside (stab), crowd with ice, the sad man
wind(c("summer2"), c("secret"), 0.7)
whoosh(c("but"), 0.4, 0.9)
crowd(c("luckily"), c("unluckily"), 6, 0.5)
# night sky + thermometer, the car, the goat, Meybod, the fridge, the end
crickets(c("secret"), c("like"), 0.7)
place(sfx, pan(G.whoosh(1.2, r, peak=0.9, f_lo=300, f_hi=1600, width=0.9, tail=0.3) * 0.5, 0), c("secret") + 0.6)
scrape(c("like") + 0.5, 7)
wind(c("wallDome"), c("meybod"), 0.5)
bleat(wt(W["goat"]) - 0.05, 1.0)
wind(c("meybod"), c("oneOf"), 0.5); crowd(c("meybod"), c("next"), 4, 0.4)
knock(wt(W["open"]) - 0.1, 0.6, 1.4)
fr = lp(colored(ns(c("oneOf") - wt(W["open"])), r, 1.5), 300, 2) * 0.3
place(sfx, pan(fr, 0), wt(W["open"]))  # fridge hum
crickets(c("oneOf"), DUR, 0.8)

# ================================================================ music: santur-like tune over a drone (D, 6/8 lilt)
B = 0.3  # eighth note
F = I.m2f
TUNE = [(0, 3, 62), (3, 1, 63), (4, 1, 65), (5, 1, 67), (6, 2, 69), (8, 1, 67), (9, 3, 65), (12, 1, 67), (13, 1, 65), (14, 1, 63), (15, 3, 62),
        (18, 2, 65), (20, 1, 67), (21, 3, 69), (24, 1, 70), (25, 1, 69), (26, 1, 67), (27, 3, 65), (30, 1, 63), (31, 1, 65), (32, 4, 62)]
TUNE_LEN = 36


def santur(m, vel, t0):
    for k, d in enumerate([0, 0.075, 0.15] if vel > 0.5 else [0]):  # tremolo strokes on long notes
        place(mus, pan(I.pluck(F(m), vel * (1 - 0.25 * k), r, 1.1, bright=0.85, pos=0.11), 0.15), t0 + d)


def tune(t0, t1, vel=1.0, perc=True, transpose=0):
    n = 0
    while t0 + n * TUNE_LEN * B < t1 - 0.1:
        base = t0 + n * TUNE_LEN * B
        for st, ln, m in TUNE:
            ts = base + st * B
            if ts < t1: santur(m + transpose, vel * (0.75 if ln == 1 else 0.95), ts)
        if perc:
            for k in range(TUNE_LEN // 3):
                tk = base + k * 3 * B
                if tk < t1:
                    place(mus, pan(I.pluck(F(38), 0.8 * vel, r, 0.35, bright=0.2), -0.1), tk)            # dum
                    place(mus, pan(I.brush(0.35 * vel, r, 0.12), 0.3), tk + 2 * B)                         # tak
        n += 1


def drone(t0, t1, notes=(38, 45), vel=0.4):
    if t1 - t0 > 0.4: place(mus, I.pad([F(m) for m in notes], t1 - t0, vel, r, att=0.7, rel=0.8, warm=700), t0)


drone(0, c("winter")); tune(0.2, c("winter") - 0.3, 0.9)
drone(c("winter"), c("morning"), (38, 45, 50), 0.35)
for k in range(int((c("morning") - c("winter")) / (6 * B))): santur([62, 65, 69, 67][k % 4], 0.35, c("winter") + 0.4 + k * 6 * B)
tune(c("morning"), c("summer2") - 0.2, 0.75)
drone(c("summer2"), c("secret")); place(mus, pan(I.glock(F(86), 0.8, r, 2.0), 0), wt(W["ice2"]) - 0.05)
tune(c("luckily"), c("unluckily") - 0.1, 0.8, perc=False)
santur(57, 0.9, c("unluckily") + 0.05); santur(56, 0.9, c("unluckily") + 0.6)
drone(c("secret"), c("like"), (38, 45, 53, 57), 0.35)
for k in range(int((c("like") - c("secret")) / (4 * B))): place(mus, pan(I.vibes(F([69, 74, 77, 74][k % 4]), 0.3, r, 1.4), 0.2), c("secret") + k * 4 * B)
for k, m in enumerate([74, 72, 70, 69, 67, 69]): place(mus, pan(I.musicbox(F(m), 0.5, r, 1.4), 0.1), c("like") + 0.3 + k * 0.6)
tune(c("wallDome"), c("goatHair") - 0.1, 0.6, perc=False)
santur(50, 1.0, wt(W["goat"]) - 0.05)
drone(c("meybod"), c("oneOf")); tune(c("meybod") + 0.1, c("oneOf") - 0.2, 0.85)
drone(c("oneOf"), DUR, (38, 45, 50, 57), 0.4)
for k, m in enumerate([62, 65, 69, 74]): place(mus, pan(I.glock(F(m + 12), 0.4, r, 2.2), 0.2), c("oneOf") + 0.4 + k * 0.5)
place(mus, pan(I.glock(F(86), 0.5, r, 3.0), 0), wt(W["sky3"]))

hall = make_ir(1.4, 9, pre=0.015, hf=1.4)
mus = hp(mus + 0.3 * convolve_st(mus.mean(0), hall)[:, :N], 35, 2); sfx = hp(sfx, 30, 2)
mus *= dbg(-20 - integrated(mus)) * dbg(3.0); sfx *= dbg(-20 - integrated(sfx)) * dbg(-6.0)
duck = np.ones(N)
for w in WORDS:
    a, b = ns(w["s"] - 0.08), ns(w["e"] + 0.12); duck[max(0, a):min(N, b)] = dbg(-5)
k = ns(0.12); duck = np.convolve(duck, np.ones(k) / k, mode="same"); mus *= duck[None, :]
mix = mus + sfx
if VOICE:
    v, sr = read_wav(VOICE); assert sr == SR, "voice must be 48 kHz"; place(mix, v, 0.0)
mix *= dbg(-16 - integrated(mix))
if np.abs(mix).max() > 0.89: mix = np.tanh(mix / 0.89) * 0.89
for name, x in [("mix", mix), ("music", mus), ("sfx", sfx)]: write_wav(os.path.join(OUT, name + ".wav"), x)
print(f"mix.wav {DUR:.2f} s, {integrated(mix):.1f} LUFS, true peak {true_peak(mix):.1f} dBTP")
