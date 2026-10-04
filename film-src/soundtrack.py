"""Original score and sound effects for The Long Way Round.

Everything is synthesised here (no samples), so the track is free to use.
Run:  python3 film-src/soundtrack.py out.wav [voice.wav]
Scene times and sync beats come from timeline.json (written by
voiceover_recorded.py), the same file film.html reads.
"""
import sys
import numpy as np
from scipy import signal

import json
import os

TL = json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'timeline.json')))
SC = {s['name']: s for s in TL['scenes']}
BT = TL['beats']
SR = 44100
DUR = TL['duration']
N = int(SR * DUR)
rng = np.random.default_rng(7)

music = np.zeros((N, 2))
sfx = np.zeros((N, 2))


def t_axis(dur):
    return np.arange(int(dur * SR)) / SR


def place(bus, x, at, gain=1.0, pan=0.0):
    """Add mono or stereo clip x to bus at time `at` (seconds), pan -1..1."""
    i = int(at * SR)
    if i >= N:
        return
    if x.ndim == 1:
        l, r = np.cos((pan + 1) * np.pi / 4), np.sin((pan + 1) * np.pi / 4)
        x = np.stack([x * l, x * r], axis=1) * np.sqrt(2)
    n = min(len(x), N - i)
    bus[i:i + n] += x[:n] * gain


def env(n, a=0.005, d=None, rel=0.05, dur=None):
    t = np.arange(n) / SR
    e = np.minimum(1, t / max(a, 1e-4))
    if d is not None:
        e *= np.exp(-t / d)
    if rel and dur:
        e *= np.clip((dur - t) / rel, 0, 1)
    return e


def lp(x, hz, order=2):
    return signal.sosfilt(signal.butter(order, hz, 'low', fs=SR, output='sos'), x)


def hp(x, hz, order=2):
    return signal.sosfilt(signal.butter(order, hz, 'high', fs=SR, output='sos'), x)


def bp(x, lo, hi, order=2):
    return signal.sosfilt(signal.butter(order, [lo, hi], 'band', fs=SR, output='sos'), x)


NOTE = {'C': 0, 'C#': 1, 'D': 2, 'D#': 3, 'E': 4, 'F': 5, 'F#': 6, 'G': 7, 'G#': 8, 'A': 9, 'A#': 10, 'B': 11}


def hz(name):
    n, o = name[:-1], int(name[-1])
    return 440 * 2 ** ((NOTE[n] + 12 * (o + 1) - 69) / 12)


# ---------------- instruments ----------------
def epiano(f, dur, vel=1.0):
    t = t_axis(dur)
    x = (np.sin(2 * np.pi * f * t) * np.exp(-t * 1.6)
         + .35 * np.sin(2 * np.pi * 2 * f * t) * np.exp(-t * 3.5)
         + .12 * np.sin(2 * np.pi * 4.01 * f * t) * np.exp(-t * 7)
         + .06 * np.sin(2 * np.pi * 7.1 * f * t) * np.exp(-t * 14))
    x *= (1 + .08 * np.sin(2 * np.pi * 5 * t))  # gentle tremolo
    return x * env(len(t), a=.004, rel=.08, dur=dur) * vel * .22


def pluck(f, dur, vel=1.0):
    t = t_axis(dur)
    x = np.sin(2 * np.pi * f * t) + .3 * np.sin(2 * np.pi * 2 * f * t) * np.exp(-t * 6) + .1 * np.sin(2 * np.pi * 3 * f * t) * np.exp(-t * 10)
    return x * env(len(t), a=.002, d=.35, rel=.05, dur=dur) * vel * .2


def pad(freqs, dur, bright=1800, vel=1.0):
    t = t_axis(dur)
    x = np.zeros(len(t))
    for f in freqs:
        for det in (-0.12, 0.0, 0.11):
            ph = rng.random() * 2 * np.pi
            ff = f * 2 ** (det / 12)
            x += signal.sawtooth(2 * np.pi * ff * t + ph)
    x = lp(x / (3 * len(freqs)), bright)
    att, rel = min(1.2, dur / 3), min(1.5, dur / 3)
    e = np.minimum(1, t / att) * np.clip((dur - t) / rel, 0, 1)
    return x * e * vel * .16


def bass(f, dur, vel=1.0):
    t = t_axis(dur)
    x = np.sin(2 * np.pi * f * t) + .25 * np.sin(2 * np.pi * 2 * f * t)
    x = np.tanh(1.6 * x)
    return x * env(len(t), a=.006, d=.9, rel=.06, dur=dur) * vel * .3


def kick(vel=1.0):
    t = t_axis(.45)
    f = 45 + 80 * np.exp(-t * 28)
    x = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 9)
    return x * vel * .42


def clap(vel=1.0):
    t = t_axis(.25)
    x = bp(rng.standard_normal(len(t)), 900, 5000) * np.exp(-t * 22)
    return x * vel * .16


def hat(vel=1.0, dur=.06):
    t = t_axis(dur)
    return hp(rng.standard_normal(len(t)), 7000) * np.exp(-t * 60) * vel * .09


def bell(f, dur=2.2, vel=1.0):
    t = t_axis(dur)
    x = sum(a * np.sin(2 * np.pi * f * m * t) * np.exp(-t * k) for m, a, k in ((1, 1, 2.2), (2.76, .5, 3.5), (5.4, .25, 6), (8.9, .12, 9)))
    return x * env(len(t), a=.002) * vel * .18


def whoosh(dur, lo=300, hi=6000, up=True, vel=1.0):
    """Noise swept through a moving band, built from short filtered slices."""
    n = int(dur * SR)
    noise = rng.standard_normal(n)
    out = np.zeros(n)
    seg = int(.03 * SR)
    win = np.hanning(2 * seg)
    for s in range(0, n, seg):
        k = s / n if up else 1 - s / n
        c = lo * (hi / lo) ** k
        chunk = noise[max(0, s - seg // 2): s + seg + seg // 2]
        if len(chunk) < 2 * seg:
            continue
        y = bp(chunk, max(40, c * .6), min(SR / 2 - 100, c * 1.6))[:2 * seg] * win
        out[max(0, s - seg // 2): max(0, s - seg // 2) + 2 * seg] += y
    t = np.arange(n) / SR
    shape = np.sin(np.pi * np.clip(t / dur, 0, 1)) ** 1.5
    return out * shape * vel * .35


def engine_pass(dur, vel=1.0):
    """A car passing left to right: rising pitch, swelling then fading."""
    t = t_axis(dur)
    f = 70 + 40 * (t / dur) + 25 * np.tanh((t - dur * .55) * 4)
    x = signal.sawtooth(2 * np.pi * np.cumsum(f) / SR) + .5 * signal.sawtooth(2 * np.pi * np.cumsum(f * 2.01) / SR)
    x = lp(x, 900)
    shape = np.exp(-((t - dur * .5) / (dur * .3)) ** 2)
    pan = np.linspace(-1, 1, len(t))
    l, r = np.cos((pan + 1) * np.pi / 4), np.sin((pan + 1) * np.pi / 4)
    m = x * shape * vel * .25
    return np.stack([m * l, m * r], axis=1) * np.sqrt(2)


def road_hum(dur, vel=1.0):
    t = t_axis(dur)
    x = lp(rng.standard_normal(len(t)), 220) * 2 + .3 * np.sin(2 * np.pi * 55 * t)
    e = np.minimum(1, t / .8) * np.clip((dur - t) / .8, 0, 1)
    return x * e * vel * .12


def tick(vel=1.0, f=1800):
    t = t_axis(.05)
    return (np.sin(2 * np.pi * f * t) * np.exp(-t * 120) + .5 * hp(rng.standard_normal(len(t)), 3000) * np.exp(-t * 200)) * vel * .25


def pop(vel=1.0, f=600):
    t = t_axis(.18)
    ff = f * (1 + 1.5 * np.exp(-t * 40))
    return np.sin(2 * np.pi * np.cumsum(ff) / SR) * np.exp(-t * 26) * vel * .3


def glitch(vel=1.0):
    t = t_axis(.35)
    x = np.sign(np.sin(2 * np.pi * 90 * t)) * (rng.random(len(t)) > .5) * np.exp(-t * 9)
    return lp(x, 3000) * vel * .15


# ---------------- harmony ----------------
CH = {
    'D': ['D3', 'F#3', 'A3', 'D4', 'F#4', 'A4'], 'Bm': ['B2', 'F#3', 'B3', 'D4', 'F#4'],
    'G': ['G2', 'D3', 'G3', 'B3', 'D4', 'G4'], 'A': ['A2', 'E3', 'A3', 'C#4', 'E4'],
    'Em': ['E3', 'B3', 'E4', 'G4'], 'F#': ['F#2', 'C#3', 'F#3', 'A#3', 'C#4'],
    'Asus': ['A2', 'E3', 'A3', 'D4', 'E4'], 'Dadd9': ['D3', 'A3', 'E4', 'F#4', 'A4'],
}
ROOT = {'D': 'D2', 'Bm': 'B1', 'G': 'G1', 'A': 'A1', 'Em': 'E2', 'F#': 'F#1', 'Asus': 'A1', 'Dadd9': 'D2'}
BEAT = 60 / 96

# chords per scene, laid out in 2.5 s bars and trimmed to each scene
SECTION = {'title': ('title', ['Dadd9']), 'delhi': ('delhi', ['D', 'Bm', 'G', 'A']),
           'drive': ('drive', ['D', 'A', 'Bm', 'G']), 'doubt': ('doubt', ['Bm', 'G', 'Em', 'F#']),
           'flight': ('flight', ['G', 'D', 'A']), 'duke': ('duke', ['Bm', 'G', 'D', 'A']),
           'pointsmax': ('groove', ['D', 'A', 'Bm', 'G']), 'finale': ('finale', ['D', 'A', 'Bm', 'G'])}
RECALC = BT['notJustHow'] + .9   # matches the film's "Recalculating" moment
TURN = BT['turn']
PROG = []
for sc in TL['scenes']:
    a, b = sc['start'], sc['end']
    if sc['name'] == 'recalc':
        PROG += [(a, 'Em', RECALC - a, 'recalc'), (RECALC, 'Asus', TURN - RECALC, 'recalc'),
                 (TURN, 'D', 1.5, 'lift'), (TURN + 1.5, 'G', b - TURN - 1.5, 'lift')]
        continue
    style, chords = SECTION[sc['name']]
    if style == 'title':
        PROG.append((a, chords[0], b - a, style))
        continue
    end = b - 1.5 if style == 'finale' else b
    t, k = a, 0
    while t < end - .05:
        length = 2.5 if end - t - 2.5 >= 1.0 else end - t
        PROG.append((t, chords[k % len(chords)], length, style))
        t += length
        k += 1
    if style == 'finale':
        PROG.append((end, 'D', 1.5, 'end'))

for start, ch, length, sec in PROG:
    notes = [hz(n) for n in CH[ch]]
    upper = [f for f in notes if f > 140]
    # pads everywhere, darker in the doubt
    bright = {'doubt': 900, 'recalc': 1100, 'duke': 1300, 'title': 2200, 'finale': 2600, 'end': 2400}.get(sec, 1800)
    pv = {'title': 1.4, 'doubt': .8, 'recalc': .9, 'flight': 1.2, 'finale': 1.15, 'end': 1.2}.get(sec, .85)
    place(music, pad(upper, length + .6, bright, pv), start, pan=0)

    if sec in ('delhi', 'drive', 'groove', 'finale', 'lift'):
        # e-piano comping on beats 1 and the "and" of 2
        for b in (0, 1.5, 2.5, 3.5):
            at = start + b * BEAT
            if at < start + length:
                for i, f in enumerate(upper[:4]):
                    place(music, epiano(f, 1.2, .7 if b else .9), at + i * .006, pan=-.3 + .2 * i)
    if sec in ('duke', 'title', 'flight'):
        # slow arpeggios
        step = BEAT / 2 if sec == 'duke' else BEAT
        k = 0
        at = start
        while at < start + length - .05:
            f = upper[k % len(upper)] * (2 if sec == 'title' and k % 4 == 3 else 1)
            place(music, epiano(f, 1.6, .55), at, pan=-.4 + .8 * ((k % 4) / 3))
            k += 1
            at += step
    if sec == 'doubt':
        for i, f in enumerate(upper[:3]):
            place(music, epiano(f / 2 if i == 0 else f, 2.4, .5), start + i * .02, pan=-.2 + .2 * i)

    # bass
    rf = hz(ROOT[ch])
    if sec in ('drive', 'groove', 'finale', 'lift'):
        for b in range(int(length / BEAT + .01)):
            place(music, bass(rf if b % 4 != 3 else rf * 1.5, BEAT * .9, .9), start + b * BEAT)
    elif sec in ('delhi', 'doubt', 'recalc', 'flight', 'duke', 'end'):
        place(music, bass(rf, length, .7), start)

    # drums
    if sec in ('drive', 'groove', 'finale'):
        for b in range(int(length / BEAT + .01)):
            at = start + b * BEAT
            if b % 2 == 0:
                place(music, kick(), at)
            else:
                place(music, clap(), at, pan=.05)
            place(music, hat(.8), at, pan=.3)
            place(music, hat(.5), at + BEAT / 2, pan=.35)
    elif sec in ('delhi', 'lift'):
        for b in range(int(length / BEAT + .01)):
            at = start + b * BEAT
            if b % 4 == 0:
                place(music, kick(.6), at)
            place(music, hat(.45, .09), at + BEAT / 2, pan=-.25)

# melodies: a short hopeful motif, used in the title and the finale
MOTIF = ['F#5', 'A5', 'B5', 'A5', 'F#5', 'E5', 'D5', 'E5']
for i, n in enumerate(MOTIF):
    place(music, pluck(hz(n), .9, 1.1), 2.0 + i * BEAT / 2 * 1.5, pan=.2)
FINALE = ['F#5', 'A5', 'D6', 'C#6', 'A5', 'B5', 'A5', 'F#5', 'D5', 'E5', 'F#5', 'A5', 'B5', 'A5', 'F#5', 'E5']
for i, n in enumerate(FINALE):
    if i < 8:  # the first half answers the narration softly, the rest plays after it
        place(music, pluck(hz(n), 1.0, .4), SC['finale']['start'] + i * BEAT, pan=.15)
for i, n in enumerate(FINALE[8:]):
    place(music, pluck(hz(n), 1.0, .9), BT['maybe'] + .75 + i * BEAT * .75, pan=.15)
place(music, pluck(hz('D6'), 2.4, .9), BT['maybe'] + .75 + 8 * BEAT * .75 + .1, pan=.15)
GROOVE = ['D5', 'F#5', 'A5', 'F#5', 'E5', 'C#5', 'E5', 'A5', 'F#5', 'D5', 'B4', 'D5', 'G5', 'D5', 'B4', 'G4']
for i, n in enumerate(GROOVE):
    place(music, pluck(hz(n), .7, .45), SC['pointsmax']['start'] + i * BEAT * .9, pan=-.15)

# ---------------- sound effects ----------------
def boundary(name):
    return SC[name]['start']


place(sfx, pop(.8, 500), 0.85)
for i in range(4):
    place(sfx, pop(.6, 700 + 80 * i), boundary('delhi') + .8 + .25 * i, pan=-.5)
    place(sfx, pop(.6, 900 + 80 * i), BT['delhiEcon'] - .2 + .25 * i, pan=.5)
place(sfx, whoosh(1.1, 400, 7000, True, .8), boundary('delhi') - .55)               # iris
place(sfx, engine_pass(1.6, 1.0), boundary('drive') - .8)                            # car wipe
place(sfx, road_hum(SC['drive']['end'] - boundary('drive'), .55), boundary('drive'))
blind = BT['camera'] - .2
place(sfx, glitch(1.0), blind)                                                       # camera goes blind
pings = set()
for i in range(9):                                                                   # a ping as each sign is read from the map
    local_blind = blind - boundary('drive')
    shows = local_blind - 5.8 + (1700 + 380 * i) / 420
    gone = local_blind - 5.8 + (2700 + 380 * i) / 420
    t_ping = max(local_blind, shows)
    if t_ping < gone and boundary('drive') + t_ping < SC['drive']['end']:
        pings.add(round(boundary('drive') + t_ping, 2))
for at in sorted(pings):
    place(sfx, bell(hz('E6'), .6, .22), at, pan=.3)
place(sfx, whoosh(1.1, 2000, 300, False, .7), boundary('doubt') - .55)              # into the window
for i in range(7):
    place(sfx, pop(.55, 260 - 10 * i), BT['tasks'] + .2 + .5 * i, pan=.4)            # tickets landing
place(sfx, pop(.7, 900), BT['bizSense'])
place(sfx, whoosh(1.0, 3000, 400, False, .7), boundary('recalc') - .5)              # tilt down
place(sfx, bell(hz('A5'), 1.2, .6), RECALC)                                          # recalculating
t = RECALC + .2
while t < TURN + .8:
    place(sfx, tick(.8, 1500), t, pan=.25)
    place(sfx, tick(.6, 1200), t + .2, pan=.25)
    t += .4
place(sfx, bell(hz('D6'), 1.6, .7), TURN)
place(sfx, bell(hz('F#6'), 1.4, .5), TURN + .15)
place(sfx, whoosh(1.0, 500, 5000, True, .7), boundary('flight') - .5)               # push
place(sfx, whoosh(5.8, 200, 1400, True, .9), boundary('flight') + .5)               # jet
place(sfx, whoosh(1.6, 200, 2500, True, 1.0), boundary('duke') - .8)                # clouds
for i in range(5):
    place(sfx, pop(.45, 1100 + 90 * i), BT['strategy'] - .2 + .3 * i, pan=-.4 + .2 * i)
place(sfx, bell(hz('B5'), 1.0, .55), BT['design'])
for i in range(3):
    place(sfx, pop(.5, 700), BT['after'] + .45 * i, pan=-.3 + .3 * i)
for i in range(14):
    place(sfx, tick(.35, 2200), BT['after'] + i * (2.5 / 14))
place(sfx, bell(hz('D6'), 2.4, .9), BT['trust'] - .15)                              # TRUST
place(sfx, bell(hz('A6'), 2.0, .4), BT['trust'] - .1)
place(sfx, whoosh(1.1, 500, 6000, True, .7), boundary('pointsmax') - .55)           # route band
for i in range(3):
    place(sfx, pop(.6, 500 + 120 * i), boundary('pointsmax') + .4 + .5 * i, pan=-.5 + .5 * i)
place(sfx, whoosh(1.2, 600, 4000, True, .5), BT['builtOne'])
place(sfx, bell(hz('E6'), 1.2, .6), BT['builtOne'] + .6)
place(sfx, kick(.9), BT['points'])
place(sfx, whoosh(1.3, 300, 8000, True, .8), boundary('finale') - 1.0)              # iris out of the phone
place(sfx, pop(.5, 520), boundary('finale') + .3)
END_HIT = BT['maybe'] + .75                                                         # right after "Maybe yours"
place(sfx, kick(1.0), END_HIT)
place(sfx, bell(hz('D6'), 3.0, .8), END_HIT)
place(sfx, bell(hz('A5'), 3.0, .5), END_HIT + .02)

# ---------------- mix ----------------
def reverb(x, secs=2.2, wet=.22):
    n = int(secs * SR)
    t = np.arange(n) / SR
    ir = rng.standard_normal((n, 2)) * np.exp(-t * 3.2)[:, None]
    ir = np.stack([lp(ir[:, 0], 6000), lp(ir[:, 1], 6000)], axis=1)
    ir /= np.sqrt((ir ** 2).sum(axis=0))
    y = np.stack([signal.fftconvolve(x[:, c], ir[:, c])[:len(x)] for c in range(2)], axis=1)
    return x * (1 - wet) + y * wet


music = reverb(music, 2.2, .25)
sfx = reverb(sfx, 1.2, .12)

voice = None
if len(sys.argv) > 2:
    from scipy.io import wavfile as _wf
    vsr, v = _wf.read(sys.argv[2])
    v = v.astype(float) / 32767
    if v.ndim > 1:
        v = v.mean(axis=1)
    voice = np.zeros(N)
    voice[:min(N, len(v))] = v[:N]
    # duck the music under the narration: fast attack, slow release
    e = np.abs(voice)
    e = signal.sosfilt(signal.butter(1, 4, 'low', fs=SR, output='sos'), e)
    e = np.clip(e / .04, 0, 1)
    hold = np.maximum.accumulate(np.where(e > .5, np.arange(N), 0))
    since = (np.arange(N) - hold) / SR
    duck = np.clip(1 - since / .45, 0, 1) * (hold > 0)
    duck = signal.sosfilt(signal.butter(1, 6, 'low', fs=SR, output='sos'), duck)
    lead = int(.08 * SR)  # start ducking just before each line
    duck = np.concatenate([duck[lead:], np.zeros(lead)])
    music *= (1 - .93 * duck)[:, None]
    sfx *= (1 - .7 * duck)[:, None]
    v2 = np.stack([voice, voice], axis=1)
    voice = reverb(v2, .6, .06)

mix = music * .55 + sfx * 1.0
if voice is not None:
    import os
    if os.environ.get('STEMS'):
        np.save(os.environ['STEMS'] + '_bed.npy', mix[:, 0])
        np.save(os.environ['STEMS'] + '_voice.npy', voice[:, 0] * 1.9)
    mix = mix + voice * 1.9

# fade in/out
t = np.arange(N) / SR
mix *= np.clip(t / .4, 0, 1)[:, None] * np.clip((DUR - t) / 2.2, 0, 1)[:, None]

peak = np.abs(mix).max()
mix = mix / peak * 1.25
mix = np.tanh(mix) * .89  # gentle limiting, peaks under -1 dBFS

out = sys.argv[1] if len(sys.argv) > 1 else 'soundtrack.wav'
pcm = (mix * 32767).astype(np.int16)
from scipy.io import wavfile
wavfile.write(out, SR, pcm)
print('wrote', out, f'{DUR:.0f}s')
