"""ゲーム用の軽い画像を作る。assets/sprites/*.png（原本）→ img/<名前>.webp

  python tools/optimize.py            … 全部
  python tools/optimize.py --grounds  … 村ごとの地面だけ

- キャラ・設備などの透明PNG … 長辺 256px（ボス白クマは 384px）の WebP
- 地面 assets/ground.png … 256px の WebP（タイルとして敷き詰める）
- 村ごとの地面 assets/grounds/*.png … つなぎ目の出ない 512px のタイル img/ground_<名前>.webp
- アプリアイコン … img/icon-192.png, img/icon-512.png
"""
import sys
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SRC, DST = ROOT / "assets", ROOT / "img"
BIG = {"bear_boss": 384, "grill_on": 320, "grill_off": 320, "counter": 320, "tent": 320, "igloo": 320}


def main() -> None:
    DST.mkdir(exist_ok=True)
    n = 0
    only_grounds = "--grounds" in sys.argv
    for src in ([] if only_grounds else sorted((SRC / "sprites").glob("*.png"))):
        im = Image.open(src).convert("RGBA")
        size = BIG.get(src.stem, BIG.get(src.stem.rsplit("_", 1)[0], 256))   # 村ごとの絵（grill_on_lake など）も元と同じ大きさ
        im.thumbnail((size, size), Image.LANCZOS)
        im.save(DST / f"{src.stem}.webp", "WEBP", quality=88, method=6)
        n += 1
    ground = SRC / "ground.png"
    if ground.exists() and not only_grounds:
        im = Image.open(ground).convert("RGB")
        im.thumbnail((512, 512), Image.LANCZOS)
        im.save(DST / "ground.webp", "WEBP", quality=80, method=6)
        n += 1
    # 村ごとの地面 assets/grounds/*.png … 半分ずらした絵と、ふちに向かってなめらかに混ぜて、つなぎ目の出ないタイルにする
    #（反転してつなぐと、岩などの模様が左右対称に並んで見えてしまうため）
    for src in sorted((SRC / "grounds").glob("*.png")):
        t = Image.open(src).convert("RGB").resize((512, 512), Image.LANCZOS)
        out = np.asarray(t, dtype=np.float32)
        d = np.abs(np.linspace(-1, 1, 512))                  # まんなか 0 → ふち 1
        w = np.clip((0.9 - d) / 0.5, 0, 1)
        w = w * w * (3 - 2 * w)
        for axis in (1, 0):                                   # 左右 → 上下の順に（同時にやると角でずれが出る）
            rolled = np.roll(out, 256, axis=axis)
            k = (w[None, :, None] if axis == 1 else w[:, None, None])
            out = out * k + rolled * (1 - k)
        Image.fromarray(out.astype(np.uint8)).save(DST / f"ground_{src.stem}.webp", "WEBP", quality=80, method=6)
        n += 1
    hero = SRC / "sprites" / "hero_idle.png"
    if hero.exists() and not only_grounds:
        h = Image.open(hero).convert("RGBA")
        for size in (192, 512):
            icon = Image.new("RGBA", (size, size), (90, 169, 230, 255))
            c = h.copy()
            c.thumbnail((int(size * 0.86),) * 2, Image.LANCZOS)
            icon.alpha_composite(c, ((size - c.width) // 2, (size - c.height) // 2))
            icon.save(DST / f"icon-{size}.png", optimize=True)
    print(f"{n} images -> img/")


if __name__ == "__main__":
    main()
