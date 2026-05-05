/**
 * 원장님별 파스텔 배경 테마.
 * 가운이 비슷해 사진만으로 구분이 어려워서, 카드 배경에 부드러운 색을 깔아 식별성을 높인다.
 */
export type DoctorTheme = {
  bg: string;          // 카드 메인 배경 (파스텔)
  bgSoft: string;      // 카드 외곽 그라데이션 보조
  ring: string;        // 사진 원형 테두리/링
  accent: string;      // 텍스트·뱃지 강조용
  /** /doctors 96px 사진 미세 위치 보정 (px). 양수 = 우측. 기본 0. */
  offsetX?: number;
  /** /doctors 96px 사진 미세 위치 보정 (px). 양수 = 아래. 기본 0. */
  offsetY?: number;
  /** QACard 44px 아바타 X 보정 (px). 미지정 시 offsetX × 0.46. */
  avatarOffsetX?: number;
  /** QACard 44px 아바타 Y 보정 (px). 미지정 시 offsetY × 0.46. */
  avatarOffsetY?: number;
};

const THEMES: Record<string, DoctorTheme> = {
  jeonghanmi:  { bg: "#FCE7F0", bgSoft: "#FFF1F6", ring: "#F8C0D2", accent: "#B8517A" }, // 핑크
  baejungmin:  { bg: "#FAF0D7", bgSoft: "#FCF6E5", ring: "#E8D9A8", accent: "#8A6F1F", offsetX: 6 }, // 아이보리
  kwonsuhyun:  { bg: "#EAE2F8", bgSoft: "#F4EFFA", ring: "#C8B8E5", accent: "#6648A8" }, // 라벤더
  kimsoohyung: { bg: "#FFF6CF", bgSoft: "#FFFBE6", ring: "#F2E08F", accent: "#9A7B12" }, // 노랑
  gohyerim:    { bg: "#B2DFDB", bgSoft: "#D4ECEA", ring: "#80CBC4", accent: "#00695C" }, // 진한 민트 (Teal 100)
  kimjongsik:  { bg: "#F4E9DA", bgSoft: "#FAF3E8", ring: "#DCC5A1", accent: "#8A6B3A" }, // 베이지
  leedoyoung:  { bg: "#BFD7E5", bgSoft: "#D9E7EF", ring: "#9ABFD3", accent: "#3D5A6B", offsetX: 14, offsetY: 5, avatarOffsetX: 7 }, // 연한 하늘 (이전 회색에서 변경)
  kanghyunjin: { bg: "#E8DEF6", bgSoft: "#F2EBFA", ring: "#C8B8E5", accent: "#5E4B96" }, // 라일락
  parkhyojin:  { bg: "#FAD2C7", bgSoft: "#FCE3DC", ring: "#F0B0A0", accent: "#A04A30" }, // 연한 산호 (보라 3개 겹침 회피)
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
