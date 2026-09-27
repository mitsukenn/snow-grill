"""ChatGPT で作った地面テクスチャを assets/grounds/ に入れる。名前が4つなら 2×2 のシートとして切り分ける。

  python tools/ground_sheet.py assets/_sheets/grounds1.png 左上 右上 左下 右下
  python tools/ground_sheet.py assets/_sheets/lake_ice.png lake_ice

→ assets/grounds/<名前>.png（ふちの境目を少し削る）。そのあと python tools/optimize.py で img/ground_<名前>.webp を作る
"""
import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent


def main() -> None:
    sheet, names = Path(sys.argv[1]), sys.argv[2:]
    im = Image.open(sheet).convert("RGB")
    n = 2 if len(names) == 4 else 1
    w, h = im.width // n, im.height // n
    cut = int(min(w, h) * 0.04)   # マスの境目のにじみを避ける
    out = ROOT / "assets" / "grounds"
    out.mkdir(parents=True, exist_ok=True)
    for i, name in enumerate(names):
        x, y = (i % n) * w, (i // n) * h
        t = im.crop((x + cut, y + cut, x + w - cut, y + h - cut))
        t.thumbnail((768, 768), Image.LANCZOS)   # ゲームでは 512px にするので、原本も軽くしておく
        t.save(out / f"{name}.png", optimize=True)
        print(name)


if __name__ == "__main__":
    main()
