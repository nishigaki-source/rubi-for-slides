#!/usr/bin/env python3
"""
拡張機能アイコンを生成する(このスクリプトは Pillow が必要: `pip install pillow`)。
「文」(kanji)+「ぶん」(ruby)で、この拡張機能自体の機能(漢字にふりがなを振る)を
そのままアイコンのモチーフにしている。

512x512 のマスターを描いてから縮小することで、16px でも角の潰れが少なく仕上がる。
使い方: python3 scripts/generate-icons.py
"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
FONT_PATH = "/System/Library/Fonts/Hiragino Sans GB.ttc"
FONT_INDEX_BOLD = 2  # Hiragino Sans GB W6(太字)
MASTER_SIZE = 512
BG_COLOR = (0, 0, 0, 255)  # 黒
KANJI_COLOR = (255, 255, 255, 255)
RUBY_COLOR = (255, 202, 40, 255)  # 琥珀色。背景の青に対して視認性が高い


def build_master() -> Image.Image:
    img = Image.new("RGBA", (MASTER_SIZE, MASTER_SIZE), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    draw.rounded_rectangle([0, 0, MASTER_SIZE, MASTER_SIZE], radius=100, fill=BG_COLOR)

    font_kanji = ImageFont.truetype(FONT_PATH, 300, index=FONT_INDEX_BOLD)
    kanji = "文"
    bbox = draw.textbbox((0, 0), kanji, font=font_kanji)
    kw, kh = bbox[2] - bbox[0], bbox[3] - bbox[1]
    draw.text(
        ((MASTER_SIZE - kw) / 2 - bbox[0], MASTER_SIZE * 0.60 - kh / 2 - bbox[1]),
        kanji,
        font=font_kanji,
        fill=KANJI_COLOR,
    )

    font_ruby = ImageFont.truetype(FONT_PATH, 105, index=FONT_INDEX_BOLD)
    ruby = "ぶん"
    bbox2 = draw.textbbox((0, 0), ruby, font=font_ruby)
    rw, rh = bbox2[2] - bbox2[0], bbox2[3] - bbox2[1]
    draw.text(
        ((MASTER_SIZE - rw) / 2 - bbox2[0], MASTER_SIZE * 0.16 - rh / 2 - bbox2[1]),
        ruby,
        font=font_ruby,
        fill=RUBY_COLOR,
    )
    return img


def main() -> None:
    master = build_master()
    (ROOT / "design").mkdir(exist_ok=True)
    master.save(ROOT / "design" / "icon-master-512.png")

    icons_dir = ROOT / "public" / "icons"
    icons_dir.mkdir(parents=True, exist_ok=True)
    for size in (16, 48, 128):
        master.resize((size, size), Image.LANCZOS).save(icons_dir / f"icon{size}.png")
    print(f"Wrote icon16/48/128.png to {icons_dir} and design/icon-master-512.png")


if __name__ == "__main__":
    main()
