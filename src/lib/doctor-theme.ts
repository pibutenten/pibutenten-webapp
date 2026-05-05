/**
 * 원장님별 파스텔 배경 테마.
 * 가운이 비슷해 사진만으로 구분이 어려워서, 카드 배경에 부드러운 색을 깔아 식별성을 높인다.
 */
export type DoctorTheme = {
  bg: string;          // 카드 메인 배경 (파스텔)
  bgSoft: string;      // 카드 외곽 그라데이션 보조
  ring: string;        // 사진 원형 테두리/링
  accent: string;      // 텍스트·뱃지 강조용
  /** 사진 미세 위치 보정 (px). 양수 = 우측, 음수 = 좌측. 기본 0. */
  offsetX?: number;
  /** 사진 미세 위치 보정 (px). 양수 = 아래, 음수 = 위. 기본 0. */
  offsetY?: number;
};

const THEMES: Record<string, DoctorTheme> = {
  jeonghanmi:  { bg: "#FCE7F0", bgSoft: "#FFF1F6", ring: "#F8C0D2", accent: "#B8517A" }, // 핑크
  baejungmin:  { bg: "#DCEEFB", bgSoft: "#EEF7FD", ring: "#A8D2EE", accent: "#2A6BAC", offsetX: 6 }, // 하늘
  kwonsuhyun:  { bg: "#EAE2F8", bgSoft: "#F4EFFA", ring: "#C8B8E5", accent: "#6648A8" }, // 라벤더
  kimsoohyung: { bg: "#FFF6CF", bgSoft: "#FFFBE6", ring: "#F2E08F", accent: "#9A7B12" }, // 노랑
  gohyerim:    { bg: "#DCF5E7", bgSoft: "#EEF9F1", ring: "#A8E0BF", accent: "#2F8A56" }, // 민트
  kimjongsik:  { bg: "#F4E9DA", bgSoft: "#FAF3E8", ring: "#DCC5A1", accent: "#8A6B3A" }, // 베이지
  leedoyoung:  { bg: "#FFE0CC", bgSoft: "#FFEEDF", ring: "#F5BE99", accent: "#B85A1F", offsetX: 14 }, // 복숭
  kanghyunjin: { bg: "#E8DEF6", bgSoft: "#F2EBFA", ring: "#C8B8E5", accent: "#5E4B96" }, // 라일락
  parkhyojin:  { bg: "#D6EFEF", bgSoft: "#E8F5F5", ring: "#A0D5D5", accent: "#2C7A7A" }, // 시폼
};

const FALLBACK: DoctorTheme = {
  bg: "#EDF2F7",
  bgSoft: "#F5F7FA",
  ring: "#CBD5E1",
  accent: "#475569",
};

export function getDoctorTheme(slug: string): DoctorTheme {
  return THEMES[slug] ?? FALLBACK;
}

/**
 * slug → 사진 경로. DB photo_url 비어있을 때 fallback.
 */
export function getDoctorPhoto(slug: string): string {
  return `/doctors/${slug}.png`;
}
