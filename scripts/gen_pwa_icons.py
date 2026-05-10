#!/usr/bin/env python3
"""
PWA 아이콘 자동 생성.

생성:
  - public/icons/icon-192.png            (any, 정사각 하늘색 + 'tt:')
  - public/icons/icon-512.png            (any, 정사각 하늘색 + 'tt:')
  - public/icons/icon-maskable-512.png   (maskable, 동일 정사각 버전)
  - public/icons/apple-touch-icon.png    (180×180, 정사각 하늘색 + 'tt:')
  - public/icons/splash-circle-512.png   (스플래시용 동그라미 로고)

설계 의도:
  - 홈 화면 아이콘: OS마다 동그라미/squircle/사각형 등 마스크 모양이 다름 →
    정사각형 PNG에 배경색 꽉 채우고 가운데 'tt:' 로고만 두면 어떤 OS 마스크에도
    검정 배경 없이 깔끔히 보임.
  - 스플래시(앱 구동 직후) 화면: 동그라미 로고 그대로 → 별도 파일로 보관.
    in-app splash overlay 컴포넌트가 standalone 모드 진입 시 이 이미지를 사용.
"""
from pathlib import Path
from PIL import Image, ImageChops

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "public" / "logo.png"
OUT = ROOT / "public" / "icons"
OUT.mkdir(parents=True, exist_ok=True)


def pick_brand_color(src: Image.Image) -> tuple[int, int, int, int]:
    """동그라미 안의 평균 하늘색 추출 — logo의 글자 안 닿는 좌상 영역 sampling."""
    w, h = src.size
    box = (int(w * 0.10), int(h * 0.15), int(w * 0.30), int(h * 0.25))
    sample = src.crop(box)
    pixels = list(sample.getdata())
    opaque = [
        p for p in pixels
        if len(p) >= 4 and p[3] > 200 and not (p[0] > 230 and p[1] > 230 and p[2] > 230)
    ]
    if not opaque:
        return (113, 191, 234, 255)  # fallback #71BFEA
    n = len(opaque)
    return (
        sum(p[0] for p in opaque) // n,
        sum(p[1] for p in opaque) // n,
        sum(p[2] for p in opaque) // n,
        255,
    )


def make_square(src: Image.Image, size: int, bg: tuple[int, int, int, int]) -> Image.Image:
    """정사각 bg 배경 + logo의 흰색 글자만 추출해 중앙 합성."""
    canvas = Image.new("RGBA", (size, size), bg)
    src_resized = src.resize((size, size), Image.LANCZOS)
    r, g, b, a = src_resized.split()

    def threshold(img, t):
        return img.point(lambda v: 255 if v > t else 0)

    whiteish = ImageChops.multiply(
        ImageChops.multiply(threshold(r, 230), threshold(g, 230)),
        threshold(b, 230),
    )
    text_alpha = ImageChops.multiply(whiteish, a)
    text_white = Image.new("RGBA", (size, size), (255, 255, 255, 255))
    text_white.putalpha(text_alpha)
    canvas.alpha_composite(text_white)
    return canvas


def main() -> None:
    src = Image.open(SRC).convert("RGBA")
    bg = pick_brand_color(src)
    print(f"brand color = #{bg[0]:02X}{bg[1]:02X}{bg[2]:02X}")

    # 모든 일반 아이콘을 정사각 + 'tt:' 버전으로 통일
    targets = [
        ("icon-192.png", 192, "any"),
        ("icon-512.png", 512, "any"),
        ("icon-maskable-512.png", 512, "maskable"),
        ("apple-touch-icon.png", 180, "iOS"),
    ]
    for name, size, role in targets:
        out_path = OUT / name
        make_square(src, size, bg).save(out_path, format="PNG", optimize=True)
        print(f"[ok] {out_path.relative_to(ROOT)}  {role}  {size}x{size}")

    # 스플래시(in-app overlay)용 동그라미 로고 — 원본 logo.png를 그대로 다운샘플
    splash_path = OUT / "splash-circle-512.png"
    src.resize((512, 512), Image.LANCZOS).save(splash_path, format="PNG", optimize=True)
    print(f"[ok] {splash_path.relative_to(ROOT)}  splash  512x512")


if __name__ == "__main__":
    main()
