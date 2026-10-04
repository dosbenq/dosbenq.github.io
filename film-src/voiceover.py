"""Synthesise the narration with Kokoro (open-source TTS, Apache 2.0) and
lay each sentence on the film's timeline.

Needs: pip install kokoro-onnx soundfile, plus kokoro-v1.0.onnx and
voices-v1.0.bin from https://github.com/thewh1teagle/kokoro-onnx/releases
Run:   python3 film-src/voiceover.py MODEL_DIR voice.wav timing.json
"""
import json
import sys
import numpy as np
from scipy import signal
from kokoro_onnx import Kokoro

# Michael, optionally blended with Kokoro's Hindi male voice for a light
# Indian-American accent: {voice name: weight}
VOICE = {'am_michael': 1.0}
SR = 44100
DUR = 94.5

# (earliest start in seconds, what is spoken, caption shown, scene end)
# Anchors put each line on the moment it describes.
LINES = [
    (0.9, "Hey, I'm Aditya.", "Hey, I'm Aditya.", 6.5),
    (None, "Let me tell you how I got here.", "Let me tell you how I got here.", 6.5),
    (7.1, "I was always the analytical kid. Math, science, building fun stuff.", "I was always the analytical kid.|Math, science, building fun stuff.", 19.0),
    (None, "So, engineering.", "So: engineering.", 19.0),
    (13.1, "But I also loved investing, and how money moves the world.", "But I also loved investing,|and how money moves the world.", 19.0),
    (None, "So I added economics.", "So I added economics.", 19.0),
    (19.6, "Then, five years at Harman in Bengaluru, building navigation for cars and trucks.", "Then, five years at HARMAN in Bengaluru,|building navigation for cars and trucks.", 31.0),
    (24.5, "One thing I'm proud of: when a truck's camera can't see a speed sign, our map data still knows it.", "When a truck's camera can't see a speed sign,|our map data still knows it.", 31.0),
    (31.6, "But I kept having business doubts.", "But I kept having business doubts.", 40.5),
    (None, "As an engineer, you get tasks, not a vote.", "As an engineer, you get tasks, not a vote.", 40.5),
    (None, "And a lot of effort went into things that just didn't make business sense.", "A lot of effort went into things|that just didn't make business sense.", 40.5),
    (41.0, "I wanted to help decide what gets built, not just how.", "I wanted to help decide what gets built,|not just how.", 48.0),
    (44.4, "So, I recalculated.", "So: I recalculated.", 48.0),
    (48.7, "In twenty twenty-five, I moved to the US.", "In 2025, I moved to the US.", 55.0),
    (None, "It's where AI is being built, and I wanted to be there.", "It's where AI is being built,|and I wanted to be there.", 55.6),
    (55.8, "At Duke, I picked up the business side. Strategy, finance, marketing.", "At Duke, I picked up the business side:|strategy, finance, marketing.", 72.5),
    (61.0, "Design Thinking taught me how to really interview customers.", "Design Thinking taught me|how to really interview customers.", 72.5),
    (None, "After fifteen-plus interviews, the lesson was simple.", "After 15+ interviews, the lesson was simple.", 72.5),
    (None, "People weren't missing information. They were missing trust.", "People weren't missing information.|They were missing trust.", 72.5),
    (73.0, "And on the side, I'm a little obsessed with credit card points.", "On the side, I'm a little obsessed|with credit card points.", 83.5),
    (None, "I was optimizing everything by hand, and couldn't find a tool that did it.", "I was optimizing everything by hand,|and couldn't find a tool that did it.", 83.5),
    (81.2, "So I built one. Points Max.", "So I built one: PointsMax.", 83.9),
    (84.5, "Next stop?", "Next stop?", 94.5),
    (None, "A team that moves fast, has fun, and makes a real dent.", "A team that moves fast, has fun,|and makes a real dent.", 94.5),
    (89.6, "Maybe yours.", "Maybe yours.", 94.5),
]
GAP = 0.32   # breath between sentences
SPEED = 1.05


def main(model_dir, out_wav, out_json):
    kokoro = Kokoro(f'{model_dir}/kokoro-v1.0.onnx', f'{model_dir}/voices-v1.0.bin')
    style = sum(w * kokoro.get_voice_style(name) for name, w in VOICE.items())
    track = np.zeros(int(DUR * SR))
    timing = []
    cursor = 0.0
    for anchor, spoken, caption, scene_end in LINES:
        samples, sr = kokoro.create(spoken, voice=style, speed=SPEED, lang='en-us')
        audio = signal.resample_poly(samples, SR, sr)
        # trim leading/trailing silence so the gaps are ours, not the model's
        level = np.abs(audio) > 0.01
        idx = np.flatnonzero(level)
        audio = audio[max(0, idx[0] - 400): idx[-1] + 2200]
        start = max(anchor or 0, cursor + GAP)
        end = start + len(audio) / SR
        if end > scene_end - 0.1:
            print(f'warning: "{spoken[:40]}" runs to {end:.2f}s, past scene end {scene_end}')
        i = int(start * SR)
        n = min(len(audio), len(track) - i)
        track[i:i + n] += audio[:n]
        timing.append({'start': round(start, 2), 'end': round(end, 2), 'caption': caption})
        cursor = end
        print(f'{start:6.2f}-{end:6.2f}  {spoken}')

    # voice chain: high-pass, gentle compression, level
    track = signal.sosfilt(signal.butter(2, 85, 'high', fs=SR, output='sos'), track)
    env = signal.sosfilt(signal.butter(1, 12, 'low', fs=SR, output='sos'), np.abs(track))
    gain = np.where(env > 0.08, (0.08 / np.maximum(env, 1e-6)) ** 0.4, 1.0)
    track *= gain
    track = track / (np.abs(track).max() + 1e-9) * 0.9
    from scipy.io import wavfile
    wavfile.write(out_wav, SR, (track * 32767).astype(np.int16))
    with open(out_json, 'w') as f:
        json.dump(timing, f, indent=1)


if __name__ == '__main__':
    main(*sys.argv[1:4])
