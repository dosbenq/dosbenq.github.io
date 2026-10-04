"""Build the narration track from Aditya's own recording.

Keeps the best take of each line (false starts are skipped), cleans and
evens out the voice, tightens hesitations inside takes, and places every
take on the film's timeline. Writes the voice track and timeline.json / timeline.js:
scene times, sync beats and captions that film.html and soundtrack.py read.

Run: python3 film-src/voiceover_recorded.py RECORDING voice.wav
Word times come from forced alignment of the recording (pocketsphinx);
they are stored below so the build needs no speech model.
"""
import json
import os
import subprocess
import sys
import tempfile
import numpy as np
from scipy import signal
from scipy.io import wavfile

SR = 44100
HERE = os.path.dirname(os.path.abspath(__file__))

# Each take: start/end in the recording, its scene, captions as (first word
# index, text), sync beats (name: word index), and the aligned words
# (word, start, end) in recording time.
TAKES = json.load(open(os.path.join(HERE, 'recorded-takes.json')))

GAP_MIN, GAP_MAX = 0.32, 0.6      # breath between takes
PAUSE_MAX, PAUSE_KEEP = 0.45, 0.3  # hesitations inside a take are shortened to this


def clean(recording):
    """Gentle broadcast-style chain with ffmpeg."""
    out = tempfile.mktemp(suffix='.wav')
    chain = ','.join([
        'highpass=f=75',
        'afftdn=nr=10:nf=-55',
        'equalizer=f=220:t=q:w=1:g=-2.5',     # less boom
        'equalizer=f=3200:t=q:w=1.2:g=2',     # clarity
        'equalizer=f=9000:t=q:w=1:g=-1.5',    # tame hiss
        'deesser=i=0.35',
        'acompressor=threshold=-22dB:ratio=3:attack=8:release=180:makeup=2',
    ])
    subprocess.run(['ffmpeg', '-loglevel', 'error', '-y', '-i', recording, '-af', chain,
                    '-ac', '1', '-ar', str(SR), out], check=True)
    sr, x = wavfile.read(out)
    os.remove(out)
    return x.astype(float) / 32768


def voiced_rms(x):
    hop = int(.02 * SR)
    frames = np.array([np.sqrt((x[i:i + hop] ** 2).mean()) for i in range(0, len(x) - hop, hop)])
    loud = frames[frames > frames.max() * .1]
    return loud.mean() if len(loud) else frames.mean()


def cut_take(x, take):
    """Return the take's audio with long pauses shortened, and a function
    that maps recording time to time within the returned clip."""
    a, b = take['start'] - .14, take['end'] + .24
    words = take['words']
    keep = []                      # (rec_start, rec_end) intervals to keep
    cur = a
    for (w0, s0, e0), (w1, s1, e1) in zip(words, words[1:]):
        if s1 - e0 > PAUSE_MAX:
            trim_from = e0 + PAUSE_KEEP / 2
            trim_to = s1 - PAUSE_KEEP / 2
            keep.append((cur, trim_from))
            cur = trim_to
    keep.append((cur, b))
    xf = int(.015 * SR)
    pieces = []
    for s, e in keep:
        seg = x[int(s * SR):int(e * SR)].copy()
        seg[:xf] *= np.linspace(0, 1, xf)
        seg[-xf:] *= np.linspace(1, 0, xf)
        pieces.append(seg)
    clip = np.concatenate(pieces)

    def to_clip(t):
        off = 0.0
        for s, e in keep:
            if t < s:
                return off
            if t <= e:
                return off + (t - s)
            off += e - s
        return off
    return clip, to_clip


# Scenes in order: minimum length, how long after the scene starts the
# first line begins, and how much room to leave after the last line.
SCENES = [
    ('title', 6.5, 0.9, 0.5), ('delhi', 9.0, 0.7, 0.5), ('drive', 10.0, 0.9, 0.5),
    ('doubt', 8.0, 0.7, 0.5), ('recalc', 7.5, 0.6, 0.6), ('flight', 7.0, 0.8, 0.4),
    ('duke', 14.0, 1.0, 0.5), ('pointsmax', 10.0, 0.7, 0.5), ('finale', 10.0, 1.0, 4.5),
]


def main(recording, out_wav):
    x = clean(recording)
    clips = [cut_take(x, tk) for tk in TAKES]
    target = np.median([voiced_rms(c) for c, _ in clips])

    # lay the takes out scene by scene; scenes stretch to fit the narration
    placed, scenes, t0 = [], [], 0.0
    for name, min_len, lead, tail in SCENES:
        cursor, prev = t0 + lead, None
        for tk, (clip, to_clip) in zip(TAKES, clips):
            if tk['scene'] != name:
                continue
            if prev is not None:
                cursor += min(GAP_MAX, max(GAP_MIN, tk['start'] - prev['end']))
            placed.append((cursor, tk, clip, to_clip))
            cursor += len(clip) / SR
            prev = tk
        end = max(cursor + tail, t0 + min_len)
        scenes.append({'name': name, 'start': round(t0, 2), 'end': round(end, 2)})
        t0 = end
    duration = round(t0, 2)

    track = np.zeros(int((duration + 1) * SR))
    captions, beats = [], {}
    for start, tk, clip, to_clip in placed:
        clip = clip * min(2.5, target / max(voiced_rms(clip), 1e-6))
        i = int(start * SR)
        track[i:i + len(clip)] += clip
        end = start + len(clip) / SR
        word_t = [start + to_clip(ws) - to_clip(tk['start'] - .14) for _, ws, _ in tk['words']]
        for (idx, text), nxt in zip(tk['captions'], tk['captions'][1:] + [None]):
            c0 = word_t[idx] - .08
            c1 = (word_t[nxt[0]] - .1) if nxt else end - .05
            captions.append({'start': round(c0, 2), 'end': round(c1, 2), 'caption': text})
        for name, idx in tk.get('beats', {}).items():
            beats[name] = round(word_t[idx], 2)
        print(f'{start:6.2f}-{end:6.2f}  [{tk["scene"]}] {" ".join(w for w, _, _ in tk["words"])}')
    for c, n in zip(captions, captions[1:]):
        c['end'] = min(c['end'] + .3, n['start'] - .05)
    captions[-1]['end'] += .4

    track = track[:int(duration * SR)]
    track = track / (np.abs(track).max() + 1e-9) * .9
    wavfile.write(out_wav, SR, (track * 32767).astype(np.int16))
    timeline = {'duration': duration, 'scenes': scenes, 'beats': beats, 'captions': captions}
    json.dump(timeline, open(os.path.join(HERE, 'timeline.json'), 'w'), indent=1)
    with open(os.path.join(HERE, 'timeline.js'), 'w') as f:
        f.write('// Generated by voiceover_recorded.py: scene times, sync beats and captions.\n')
        f.write('window.TIMELINE = ' + json.dumps(timeline) + ';\n')
    for sc in scenes:
        print(f"scene {sc['name']:10s} {sc['start']:6.2f}-{sc['end']:6.2f}")
    print('duration', duration)
    print('beats', beats)


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])
