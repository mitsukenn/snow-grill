"""流氷の地面の「すき間の暗い海」を、凍った氷の色で埋める（白クマや人が海に落ちそうに見えないように）。

  python tools/frozen_seams.py port_ice port_frozen

assets/grounds/<元>.png → assets/grounds/<新>.png。そのあと python tools/optimize.py --grounds
"""
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter

ROOT = Path(__file__).resolve().parent.parent


def main() -> None:
    src, dst = sys.argv[1], sys.argv[2]
    im = Image.open(ROOT / "assets" / "grounds" / f"{src}.png").convert("RGB")
    a = np.asarray(im, dtype=np.float32)
    lum = a @ np.array([0.299, 0.587, 0.114], dtype=np.float32)
    # 暗いほど強く、うす水色の氷に置きかえる（ふちはなめらかに）
    k = np.clip((175 - lum) / 90, 0, 1)
    k = np.asarray(Image.fromarray((k * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(2)), dtype=np.float32)[..., None] / 255
    ice = np.array([192, 226, 244], dtype=np.float32)
    shade = (lum[..., None] / 175) * 0.25 + 0.75            # 元の明暗を少し残して、氷の割れ目に見せる
    out = a * (1 - k) + ice * shade * k
    Image.fromarray(np.clip(out, 0, 255).astype(np.uint8)).save(ROOT / "assets" / "grounds" / f"{dst}.png", optimize=True)
    print(dst)


if __name__ == "__main__":
    main()
