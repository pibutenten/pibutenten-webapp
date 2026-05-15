#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
파비콘/아이콘 일괄 recolor — 옛 #71BFEA (light blue) → vivid blue #00b1ff.
anti-aliased edge 도 흰색 + base 합성을 해체 후 새 base 로 재합성하여 자연스러운 톤 유지.
"""
import sys
from pathlib import Path
from PIL import Image
sys.stdout.reconfigure(encoding='utf-8')

OLD_BASE = (113, 191, 234)  # #71BFEA
NEW_BASE = (0, 177, 255)    # #00b1ff

ROOT = Path(__file__).parent.parent
ICONS_DIR = ROOT / 'public' / 'icons'
APP_DIR = ROOT / 'src' / 'app'

# 변환 대상 (PNG)
PNG_TARGETS = [
    ICONS_DIR / 'favicon-16.png',
    ICONS_DIR / 'favicon-32.png',
    ICONS_DIR / 'favicon-48.png',
    ICONS_DIR / 'favicon-192.png',
    ICONS_DIR / 'icon-192.png',
    ICONS_DIR / 'icon-512.png',
    ICONS_DIR / 'icon-maskable-512.png',
    ICONS_DIR / 'apple-touch-icon.png',
    ICONS_DIR / 'splash-circle-512.png',
    APP_DIR / 'icon.png',
    APP_DIR / 'apple-icon.png',
]

def remap(path: Path) -> bool:
    """옛 base 픽셀을 새 base 로 치환. 변경이 있으면 True."""
    if not path.exists():
        print(f'  SKIP (not found): {path}')
        return False
    img = Image.open(path).convert('RGBA')
    w, h = img.size
    out = Image.new('RGBA', (w, h))
    out_pixels = out.load()
    in_pixels = img.load()
    changed = 0
    for x in range(w):
        for y in range(h):
            r, g, b, a = in_pixels[x, y]
            if a == 0:
                out_pixels[x, y] = (r, g, b, a)
                continue
            # 흰색 또는 거의 흰색 — 그대로
            if r > 245 and g > 245 and b > 245:
                out_pixels[x, y] = (r, g, b, a)
                continue
            # 옛 base 와 매우 가까운 픽셀 — 새 base 직접 사용
            d = ((r - OLD_BASE[0]) ** 2 + (g - OLD_BASE[1]) ** 2 + (b - OLD_BASE[2]) ** 2) ** 0.5
            if d < 30:
                out_pixels[x, y] = (NEW_BASE[0], NEW_BASE[1], NEW_BASE[2], a)
                changed += 1
                continue
            # 파란 계열 anti-aliased (R<=G<=B): 흰색과 옛 base 의 mix 추정 후 새 base 로 재합성
            if r <= g + 5 and g <= b + 10 and b > 100:
                # mix ratio: r 채널 기준 (255 → 0 일 때 mix 0 → 1)
                mix = max(0.0, min(1.0, (255 - r) / max(1, 255 - OLD_BASE[0])))
                new_r = int(NEW_BASE[0] * mix + 255 * (1 - mix))
                new_g = int(NEW_BASE[1] * mix + 255 * (1 - mix))
                new_b = int(NEW_BASE[2] * mix + 255 * (1 - mix))
                out_pixels[x, y] = (new_r, new_g, new_b, a)
                changed += 1
                continue
            # 그 외 (검정 글자 등) — 그대로
            out_pixels[x, y] = (r, g, b, a)
    if changed == 0:
        print(f'  SKIP (no blue pixels): {path}')
        return False
    out.save(path, format='PNG')
    print(f'  OK ({changed} px recolored): {path.name}')
    return True

def main():
    print(f'== Recolor {OLD_BASE} → {NEW_BASE} ==')
    n = 0
    for p in PNG_TARGETS:
        if remap(p):
            n += 1
    # ICO 재생성 (favicon-48.png 기반 → 16/32/48 멀티)
    src48 = ICONS_DIR / 'favicon-48.png'
    if src48.exists():
        ico_target = APP_DIR / 'favicon.ico'
        Image.open(src48).save(ico_target, format='ICO', sizes=[(16,16),(32,32),(48,48)])
        print(f'  OK (rebuilt): {ico_target.name}')
        n += 1
    print(f'\n총 {n} 파일 갱신 완료.')

if __name__ == '__main__':
    main()
