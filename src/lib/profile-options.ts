/**
 * 프로필 옵션 상수 — onboarding + /settings/profile 통합 폼에서 공유.
 */

export const GENDERS: { key: "male" | "female" | "other"; label: string }[] = [
  { key: "female", label: "여성" },
  { key: "male", label: "남성" },
];

export const FACE_SHAPES: { key: string; label: string }[] = [
  { key: "oval", label: "달걀형" },
  { key: "peanut", label: "땅콩형" },
  { key: "oblong", label: "장방형" },
  { key: "square", label: "각진형" },
  { key: "round", label: "둥근형" },
];

export const SKIN_TYPES: { key: string; label: string }[] = [
  { key: "extreme_dry", label: "극건성" },
  { key: "dry", label: "건성" },
  { key: "normal", label: "중성" },
  { key: "combination", label: "복합성" },
  { key: "dehydrated_oily", label: "수부지" },
  { key: "oily", label: "지성" },
  { key: "extreme_oily", label: "극지성" },
];

// 피부 고민 — 온보딩/설정 공유 (2026-06-02 11종 개편).
//   순서: 처짐·탄력·볼륨·피부결·주름·피부톤·모공·윤곽·속건조·트러블·홍조.
//   기존 키 유지(elasticity/volume/wrinkle/tone/pores/contour/texture/trouble) +
//   신규 sagging/inner_dry/redness. 폐지 aging/sensitive 는 0207 로 기존 데이터 정리.
export const SKIN_CONCERNS: { key: string; label: string }[] = [
  { key: "sagging", label: "처짐" },
  { key: "elasticity", label: "탄력" },
  { key: "volume", label: "볼륨" },
  { key: "texture", label: "피부결" },
  { key: "wrinkle", label: "주름" },
  { key: "tone", label: "피부톤" },
  { key: "pores", label: "모공" },
  { key: "contour", label: "윤곽" },
  { key: "inner_dry", label: "속건조" },
  { key: "trouble", label: "트러블" },
  { key: "redness", label: "홍조" },
];

export const PROCEDURES: { key: string; label: string }[] = [
  { key: "lifting", label: "리프팅" },
  { key: "laser", label: "레이저" },
  { key: "booster", label: "스킨부스터" },
  { key: "botox", label: "보톡스" },
  { key: "filler", label: "필러" },
  { key: "cosmetic", label: "화장품" },
];

export type FieldVisibility = {
  birthdate: boolean;
  gender: boolean;
  face_shape: boolean;
  skin_type: boolean;
  skin_concerns: boolean;
  interested_procedures: boolean;
  bio: boolean;
  // v4 — 프로필 탭 노출 (다른 사람이 내 프로필 볼 때 어떤 탭이 보일지)
  tab_posts: boolean;
  tab_reviews: boolean;
  tab_comments: boolean;
  tab_likes: boolean;
  tab_saves: boolean;
  tab_skin: boolean;
};

export const DEFAULT_VISIBILITY: FieldVisibility = {
  birthdate: true,
  gender: true,
  face_shape: true,
  skin_type: true,
  skin_concerns: true,
  interested_procedures: true,
  bio: true,
  tab_posts: true,
  tab_reviews: true,
  tab_comments: true,
  tab_likes: true,
  tab_saves: true,
  tab_skin: true,
};

export const TAB_LABELS: { key: keyof FieldVisibility; label: string }[] = [
  { key: "tab_posts", label: "작성 글" },
  { key: "tab_reviews", label: "내 후기" },
  { key: "tab_comments", label: "댓글" },
  { key: "tab_likes", label: "좋아요" },
  { key: "tab_saves", label: "저장" },
  { key: "tab_skin", label: "피부고민" },
];

// ─────────────────────────────────────────────────────────────
// 키 → 라벨 빠른 lookup — ProfileTabs 등에서 사용 (이전 중복 정의 통합)
// ─────────────────────────────────────────────────────────────

function toLabelMap<T extends { key: string; label: string }>(
  arr: readonly T[],
): Record<string, string> {
  return Object.fromEntries(arr.map((o) => [o.key, o.label]));
}

export const FACE_LABEL = toLabelMap(FACE_SHAPES);
export const SKIN_LABEL = toLabelMap(SKIN_TYPES);
export const CONCERN_LABEL = toLabelMap(SKIN_CONCERNS);
export const PROCEDURE_LABEL = toLabelMap(PROCEDURES);
