"""Suno の曲を、ゲームで切れ目なくループできる 60〜90 秒の mp3 にする（ffmpeg が必要）。

  python tools/bgm_loop.py <元の曲.mp3> <出力.mp3> <BPM> [--start 秒]

- 静かなイントロは飛ばして、音が大きくなったところから始める（--start で指定もできる）
- 長さは小節の区切り（4拍）で、75 秒にいちばん近い長さにする
- 最後の 1 小節ぶんを頭に重ねて（クロスフェード）、終わりから頭へ自然につながるようにする
- 96kbps ステレオの mp3 に（1曲 1MB 前後）
"""
import subprocess
import sys

import numpy as np

SR = 44100


def load(path: str) -> np.ndarray:
    raw = subprocess.run(["ffmpeg", "-v", "error", "-i", path, "-f", "f32le", "-ac", "2", "-ar", str(SR), "-"],
                         check=True, capture_output=True).stdout
    return np.frombuffer(raw, dtype=np.float32).reshape(-1, 2).copy()


def save(a: np.ndarray, path: str) -> None:
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "f32le", "-ac", "2", "-ar", str(SR), "-i", "-",
                    "-codec:a", "libmp3lame", "-b:a", "96k", path], input=a.astype(np.float32).tobytes(), check=True)


def main() -> None:
    src, dst, bpm = sys.argv[1], sys.argv[2], float(sys.argv[3])
    a = load(src)
    # 音が大きくなったところ（0.5 秒ごとの大きさが、曲全体の7割に届いたところ）から始める
    if "--start" in sys.argv:
        start = int(float(sys.argv[sys.argv.index("--start") + 1]) * SR)
    else:
        win = SR // 2
        rms = np.array([np.sqrt((a[i:i + win] ** 2).mean()) for i in range(0, len(a) - win, win)])
        loud = np.where(rms > np.percentile(rms, 60) * 0.7)[0]
        start = int(loud[0] * win) if len(loud) else 0
    bar = 4 * 60 / bpm
    bars = max(8, round(75 / bar / 4) * 4)          # 4小節単位で 75 秒前後
    L = int(bars * bar * SR)
    X = int(bar * SR)                               # 1小節ぶん重ねる
    while start + L + X > len(a) and bars > 8:      # 曲が短いときは短くする
        bars -= 4
        L = int(bars * bar * SR)
    seg = a[start:start + L + X]
    out = seg[:L].copy()
    fade = np.linspace(0, 1, X, dtype=np.float32)[:, None]
    out[:X] = seg[:X] * fade + seg[L:L + X] * (1 - fade)   # 頭に「終わりの続き」を重ねる
    peak = np.abs(out).max()
    if peak > 0:
        out *= 0.89 / peak                                   # 曲ごとの音量をそろえる
    save(out, dst)
    print(f"{dst}: start {start / SR:.1f}s, {bars} bars, {L / SR:.1f}s")


if __name__ == "__main__":
    main()
