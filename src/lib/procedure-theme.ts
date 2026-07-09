/**
 * 시술 분류별 테마 색 SSOT — 리포트 카드 헤더 톤 등에서 공용 사용.
 *
 * CATEGORIES 에서 동적 조회. 미발견(null)=기본 파란 톤(var(--primary)).
 *
 * 2026-07-08 UI 개편 Phase 0-6 — 파생 색 3종 확장(tint·chip·deep)
 * + 2026-07-09 R2-1 — `light` 파생 신설(히어로 그라데이션 하단, 초록 기준 #B4E4DF.
 *   히어로 소비만 deep→light 체계로 교체 — deep 은 허브 등 타 소비처 존치)
 * + 2026-07-09 R3 — `gradEnd` 파생 신설(히어로 130deg 그라데이션 종점 — R4 C-12 에서 초록 기준
 *   #92D5CE 로 재실측 정정. light 보다 한 단계 진한 톤. 기존 필드·앵커 불변)
 * + 2026-07-09 R4 C-9 — `heroChip` 파생 신설(히어로 태그 칩 솔리드 배경, 초록 기준 #13887B —
 *   구 반투명 오버레이 rgba(0,88,71,.40) 폐기·솔리드화):
 *   디자인 명세는 초록(#029688 contour) 기준 tint=#E7F9F8 / chip=#CDF0EC / light=#B4E4DF 만 제시.
 *   타 카테고리는 "같은 명도·채도, 카테고리 고유 hue 유지" 규칙으로 결정론 파생한다
 *   (명세색의 S·L 을 그대로 목표값으로 사용 — HSL 변환 후 hue 만 카테고리 색을 따름).
 *   단 명세 원본 hex 는 hue 가 기준색과 1~2° 어긋나 있어 순수 파생만으로는 초록이
 *   1/255 오차(#E7F9F7 등)가 남으므로, 초록만 명세 hex 를 정확히 반환하는 앵커를 둔다.
 *   기존 color/soft 반환은 불변(기존 소비처 무회귀).
 */
import { CATEGORIES } from "@/lib/categories";
import type { ProcedureCategory } from "@/lib/procedure-report";

export type CategoryTheme = {
  /** 강조 글자색 (브랜드 라벨·시술명) */
  color: string;
  /** 헤더 칸 솔리드 배경 틴트 (그라디언트 아님). null 분류는 'transparent'. */
  soft: string;
  /** 카드 접힘 배경 — 아주 밝은 톤 (초록 기준 #E7F9F8). */
  tint: string;
  /** 태그 칩 배경 — tint 보다 한 단계 진한 밝은 톤 (초록 기준 #CDF0EC). */
  chip: string;
  /** (구)히어로 그라데이션 상단 — 기준색보다 약간 진한 톤. R2-1 부터 히어로는 light 체계 — 허브 등 타 소비처 존치. */
  deep: string;
  /** 히어로 그라데이션 하단(140% 지점) — 밝은 파스텔 (초록 기준 #B4E4DF). R2-1 신설. */
  light: string;
  /** 히어로 130deg 그라데이션 종점 — light 보다 진한 중간 파스텔 (초록 기준 #92D5CE — R4 C-12). R3 신설. */
  gradEnd: string;
  /** 히어로 태그 칩 솔리드 배경 — 기준색보다 어두운 딥 톤 (초록 기준 #13887B). R4 C-9 신설. */
  heroChip: string;
};

function hexToSoft(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},0.12)`;
}

/* ---------- HSL 유틸 (파생 색 계산 전용 — #RRGGBB 만 취급) ---------- */

type Hsl = { h: number; s: number; l: number };

function hexToHsl(hex: string): Hsl {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return { h: 0, s: 0, l };
  const s = d / (1 - Math.abs(2 * l - 1));
  let h: number;
  if (max === r) h = 60 * (((g - b) / d + 6) % 6);
  else if (max === g) h = 60 * ((b - r) / d + 2);
  else h = 60 * ((r - g) / d + 4);
  return { h, s, l };
}

function hslToHex(h: number, s: number, l: number): string {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let r = 0;
  let g = 0;
  let b = 0;
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  const to255 = (v: number) =>
    Math.round((v + m) * 255)
      .toString(16)
      .padStart(2, "0");
  return `#${to255(r)}${to255(g)}${to255(b)}`;
}

/* ---------- 파생 규칙 (결정론 — 카테고리 hue 유지, 명세색의 S·L 목표) ---------- */

/** tint 의 채도·명도 목표 — 명세 #E7F9F8 에서 취득(모듈 로드 시 1회 계산). */
const TINT_REF = hexToHsl("#E7F9F8");
/** chip 의 채도·명도 목표 — 명세 #CDF0EC 에서 취득. */
const CHIP_REF = hexToHsl("#CDF0EC");
/** deep 명도 배율 — 기준색보다 "약간 진한" 히어로 상단 톤(명세 별도 hex 없음 → 순수 파생). */
const DEEP_L_FACTOR = 0.78;
/** light 의 채도·명도 목표 — 명세 #B4E4DF 에서 취득(R2-1 히어로 그라데이션 하단). */
const LIGHT_REF = hexToHsl("#B4E4DF");
/** gradEnd 의 채도·명도 목표 — 명세 #92D5CE 에서 취득(R3 히어로 130deg 종점 — R4 C-12 정정). */
const GRADEND_REF = hexToHsl("#92D5CE");
/** heroChip 의 채도·명도 목표 — 명세 #13887B 에서 취득(R4 C-9 히어로 칩 솔리드). */
const HEROCHIP_REF = hexToHsl("#13887B");

/** 명세 원본 hex 앵커 — 초록(#029688)만 디자인 명세 값 그대로.
 *  (명세색 hue 가 기준 hue 와 미세하게 달라 파생 결과가 1/255 어긋나는 것을 흡수.) */
const SPEC_ANCHORS: Record<
  string,
  Pick<CategoryTheme, "tint" | "chip" | "light" | "gradEnd" | "heroChip">
> = {
  "#029688": {
    tint: "#E7F9F8",
    chip: "#CDF0EC",
    light: "#B4E4DF",
    gradEnd: "#92D5CE",
    heroChip: "#13887B",
  },
};

function deriveTint(base: string): string {
  const anchor = SPEC_ANCHORS[base.toUpperCase()];
  if (anchor) return anchor.tint;
  const { h } = hexToHsl(base);
  return hslToHex(h, TINT_REF.s, TINT_REF.l);
}

function deriveChip(base: string): string {
  const anchor = SPEC_ANCHORS[base.toUpperCase()];
  if (anchor) return anchor.chip;
  const { h } = hexToHsl(base);
  return hslToHex(h, CHIP_REF.s, CHIP_REF.l);
}

function deriveDeep(base: string): string {
  const { h, s, l } = hexToHsl(base);
  return hslToHex(h, s, l * DEEP_L_FACTOR);
}

function deriveLight(base: string): string {
  const anchor = SPEC_ANCHORS[base.toUpperCase()];
  if (anchor) return anchor.light;
  const { h } = hexToHsl(base);
  return hslToHex(h, LIGHT_REF.s, LIGHT_REF.l);
}

function deriveGradEnd(base: string): string {
  const anchor = SPEC_ANCHORS[base.toUpperCase()];
  if (anchor) return anchor.gradEnd;
  const { h } = hexToHsl(base);
  return hslToHex(h, GRADEND_REF.s, GRADEND_REF.l);
}

function deriveHeroChip(base: string): string {
  const anchor = SPEC_ANCHORS[base.toUpperCase()];
  if (anchor) return anchor.heroChip;
  const { h } = hexToHsl(base);
  return hslToHex(h, HEROCHIP_REF.s, HEROCHIP_REF.l);
}

export function categoryTheme(
  category: ProcedureCategory | null | undefined,
): CategoryTheme {
  const found = CATEGORIES.find((c) => c.slug === category);
  if (!found) {
    // 미발견 폴백 — 기존 파란 톤 유지. 파생 3종은 CSS var(색 문자열이 아니라서 HSL 파생
    //   불가)라 globals.css 브랜드 토큰으로 대응(tint·chip 은 연한 브랜드 톤 공유).
    return {
      color: "var(--primary)",
      soft: "transparent",
      tint: "var(--primary-soft)",
      chip: "var(--primary-soft)",
      deep: "var(--primary-dark)",
      light: "var(--primary-soft)",
      gradEnd: "var(--primary-soft)",
      // null 카테고리 고정 hex 폴백(R4 C-9 명기) — --primary(#4CBFF2) hue 에 #13887B 의
      //   S·L 을 적용해 사전 계산한 상수(CSS var 는 런타임 HSL 파생 불가).
      heroChip: "#136488",
    };
  }
  return {
    color: found.color,
    soft: hexToSoft(found.color),
    tint: deriveTint(found.color),
    chip: deriveChip(found.color),
    deep: deriveDeep(found.color),
    light: deriveLight(found.color),
    gradEnd: deriveGradEnd(found.color),
    heroChip: deriveHeroChip(found.color),
  };
}
