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

// I-Phase2(2026-06-06): key 를 한글로 통일 — profiles 저장값을 글 태그(cards.keywords 한글)와
//   동일 도메인으로 맞춰 관심 알림(run_keyword_digest) 매칭 부활. 마이그 0262 로 기존 영문 데이터 변환.
//   (face_shape 는 이번 범위 제외 — 영문 key 유지.)
export const SKIN_TYPES: { key: string; label: string }[] = [
  { key: "극건성", label: "극건성" },
  { key: "건성", label: "건성" },
  { key: "중성", label: "중성" },
  { key: "복합성", label: "복합성" },
  { key: "수부지", label: "수부지" },
  { key: "지성", label: "지성" },
  { key: "극지성", label: "극지성" },
];

// 피부 고민 — 온보딩/설정 공유. key 한글 통일(I-Phase2). 순서: 처짐·탄력·볼륨·피부결·주름·피부톤·모공·윤곽·속건조·트러블·홍조.
export const SKIN_CONCERNS: { key: string; label: string }[] = [
  { key: "처짐", label: "처짐" },
  { key: "탄력", label: "탄력" },
  { key: "볼륨", label: "볼륨" },
  { key: "피부결", label: "피부결" },
  { key: "주름", label: "주름" },
  { key: "피부톤", label: "피부톤" },
  { key: "모공", label: "모공" },
  { key: "윤곽", label: "윤곽" },
  { key: "속건조", label: "속건조" },
  { key: "트러블", label: "트러블" },
  { key: "홍조", label: "홍조" },
];

export const PROCEDURES: { key: string; label: string }[] = [
  { key: "리프팅", label: "리프팅" },
  { key: "레이저", label: "레이저" },
  { key: "스킨부스터", label: "스킨부스터" },
  { key: "보톡스", label: "보톡스" },
  { key: "필러", label: "필러" },
  { key: "화장품", label: "화장품" },
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
  { key: "tab_skin", label: "내 피부" },
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

/**
 * birthdate(YYYY-MM-DD) → 연령대 라벨("30대" 등). 만 나이를 10년 단위로 내림.
 *   미입력(null)·파싱 실패·범위 밖(0~130 외)이면 null → 프로필 태그칩 생략.
 *   (구 /my/page.tsx 로컬 함수 — UI 개편 Phase 4 에서 /{handle} 프로필 태그칩도
 *    같은 계산을 쓰게 되어 단일 출처로 승격. 로직 무변경.)
 */
export function ageGroupFromBirthdate(birthdate: string | null): string | null {
  if (!birthdate) return null;
  const b = new Date(birthdate);
  if (Number.isNaN(b.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - b.getFullYear();
  const m = now.getMonth() - b.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < b.getDate())) age -= 1;
  if (age < 0 || age > 130) return null;
  if (age < 10) return "10대 미만";
  const decade = Math.floor(age / 10) * 10;
  return `${decade}대`;
}
