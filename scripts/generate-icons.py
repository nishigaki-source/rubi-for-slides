#!/usr/bin/env python3
"""
拡張機能アイコンを生成する(このスクリプトは Pillow が必要: `pip install pillow`)。
「文」(kanji)+「ぶん」(ruby)で、この拡張機能自体の機能(漢字にふりがなを振る)を
そのままアイコンのモチーフにしている。

配色は紹介LP(rocketdone.com/products/rubi-for-slides)のトーンに合わせたクリーム地+
インク色の文字+オレンジのルビバッジ(LP hero のスクリーンショットから実測した値)。

512x512 のマスターを描いてから縮小することで、16px でも角の潰れが少なく仕上がる。
使い方: python3 scripts/generate-icons.py
"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
FONT_PATH = "/System/Library/Fonts/Hiragino Sans GB.ttc"
FONT_INDEX_BOLD = 2  # Hiragino Sans GB W6(太字)
MASTER_SIZE = 512

# LP(design/、rocketdone.com/products/rubi-for-slides)の背景・見出し色から実測。
BG_COLOR = (228, 225, 214, 255)  # クリーム
KANJI_COLOR = (29, 31, 36, 255)  # インク(見出し文字色)
RUBY_BADGE_COLOR = (242, 178, 51, 255)  # オレンジ(LPのアクセントカラー)
RUBY_TEXT_COLOR = (29, 31, 36, 255)  # バッジ上のルビ文字はインクのままにして視認性を確保


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
    ruby_cx = MASTER_SIZE / 2
    ruby_cy = MASTER_SIZE * 0.16

    # ルビの後ろに、LPのアクセントカラー(オレンジ)を敷いた角丸バッジを置く。
    pad_x, pad_y = 34, 22
    badge_box = [
        ruby_cx - rw / 2 - pad_x,
        ruby_cy - rh / 2 - pad_y,
        ruby_cx + rw / 2 + pad_x,
        ruby_cy + rh / 2 + pad_y,
    ]
    draw.rounded_rectangle(badge_box, radius=(badge_box[3] - badge_box[1]) / 2, fill=RUBY_BADGE_COLOR)
    draw.text(
        (ruby_cx - rw / 2 - bbox2[0], ruby_cy - rh / 2 - bbox2[1]),
        ruby,
        font=font_ruby,
        fill=RUBY_TEXT_COLOR,
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

    # OAuth 同意画面のブランディング用ロゴ(Cloud Console、120x120・背景を白で合成)。
    oauth_logo = Image.new("RGB", (120, 120), (255, 255, 255))
    oauth_logo.paste(master.resize((120, 120), Image.LANCZOS), (0, 0), master.resize((120, 120), Image.LANCZOS))
    oauth_logo.save(ROOT / "design" / "oauth-consent-logo-120.png")

    print(f"Wrote icon16/48/128.png to {icons_dir}, design/icon-master-512.png, design/oauth-consent-logo-120.png")


if __name__ == "__main__":
    main()
