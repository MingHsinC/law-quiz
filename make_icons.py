"""產生 PWA 圖示（webapp/icons/）。需要 Pillow。

用法：
    python make_icons.py
"""
import os
from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
ICON_DIR = os.path.join(HERE, "webapp", "icons")
BG = (31, 111, 235)      # #1f6feb
FG = (255, 255, 255)
GLYPH = "法"

# 找一個有中文字的字型
FONT_CANDIDATES = [
    r"C:\Windows\Fonts\msjh.ttc",
    r"C:\Windows\Fonts\msyh.ttc",
    r"C:\Windows\Fonts\mingliu.ttc",
    r"C:\Windows\Fonts\simhei.ttf",
]


def _font(size: int) -> ImageFont.FreeTypeFont:
    for path in FONT_CANDIDATES:
        if os.path.exists(path):
            return ImageFont.truetype(path, size)
    return ImageFont.load_default()


def _draw(size: int, glyph_ratio: float, rounded: bool) -> Image.Image:
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    if rounded:
        radius = int(size * 0.22)
        d.rounded_rectangle([0, 0, size - 1, size - 1], radius=radius, fill=BG)
    else:
        d.rectangle([0, 0, size, size], fill=BG)  # maskable：滿版背景
    font = _font(int(size * glyph_ratio))
    bbox = d.textbbox((0, 0), GLYPH, font=font)
    w, h = bbox[2] - bbox[0], bbox[3] - bbox[1]
    d.text(((size - w) / 2 - bbox[0], (size - h) / 2 - bbox[1]), GLYPH, font=font, fill=FG)
    return img


def main():
    os.makedirs(ICON_DIR, exist_ok=True)
    _draw(192, 0.62, rounded=True).save(os.path.join(ICON_DIR, "icon-192.png"))
    _draw(512, 0.62, rounded=True).save(os.path.join(ICON_DIR, "icon-512.png"))
    # maskable：字縮小到安全區（約 60%），背景滿版，避免被裁切
    _draw(512, 0.50, rounded=False).save(os.path.join(ICON_DIR, "icon-maskable-512.png"))
    print(f"圖示已輸出至 {ICON_DIR}")


if __name__ == "__main__":
    main()
