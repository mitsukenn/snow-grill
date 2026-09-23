"""ゲーム用の軽い画像を作る。assets/sprites/*.png（原本）→ img/<名前>.webp

  python tools/optimize.py

- キャラ・設備などの透明PNG … 長辺 256px（ボス白クマは 384px）の WebP
- 地面 assets/ground.png … 256px の WebP（タイルとして敷き詰める）
- アプリアイコン … img/icon-192.png, img/icon-512.png
"""
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SRC, DST = ROOT / "assets", ROOT / "img"
BIG = {"bear_boss": 384, "grill_on": 320, "grill_off": 320, "counter": 320, "tent": 320, "igloo": 320}


def main() -> None:
    DST.mkdir(exist_ok=True)
    n = 0
    for src in sorted((SRC / "sprites").glob("*.png")):
        im = Image.open(src).convert("RGBA")
        size = BIG.get(src.stem, 256)
        im.thumbnail((size, size), Image.LANCZOS)
        im.save(DST / f"{src.stem}.webp", "WEBP", quality=88, method=6)
        n += 1
    ground = SRC / "ground.png"
    if ground.exists():
        im = Image.open(ground).convert("RGB")
        im.thumbnail((512, 512), Image.LANCZOS)
        im.save(DST / "ground.webp", "WEBP", quality=80, method=6)
        n += 1
    hero = SRC / "sprites" / "hero_idle.png"
    if hero.exists():
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
