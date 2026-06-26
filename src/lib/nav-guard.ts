/**
 * 글쓰기 이탈 가드 — 모듈 레벨 스토어 (feed-tab.ts 패턴 참고).
 *
 * 왜 모듈 상태인가:
 *   BottomNav 의 하단 5탭은 next/link `<Link>` 전방향 이동이라
 *   훅 내부의 popstate/beforeunload 가드가 못 잡는다.
 *   useUnsavedChangesGuard 가 자신을 여기 등록하면, BottomNav 의 Link onClick 이
 *   maybeBlockNavigation 으로 "이동을 가로채야 하는지" 동기 조회 → 모달을 띄울 수 있다.
 *
 * 한 번에 하나의 가드만 활성(현재 화면에 글쓰기 에디터는 하나뿐).
 */

type GuardEntry = {
  /** 현재 가드 대상(작성 중·dirty)인지 */
  isDirty: () => boolean;
  /** 이동을 막아야 할 때 호출됨. 사용자가 모달에서 이탈을 확정하면 proceed() 실행. */
  requestLeave: (proceed: () => void) => void;
};

let active: GuardEntry | null = null;

export function registerNavGuard(entry: GuardEntry): () => void {
  active = entry;
  return () => {
    if (active === entry) active = null;
  };
}

/**
 * 이동을 막아야 하면(가드 활성 + dirty) requestLeave 를 호출하고 true 반환.
 * 막을 필요 없으면 false (호출 측이 정상 이동 진행).
 */
export function maybeBlockNavigation(proceed: () => void): boolean {
  if (active && active.isDirty()) {
    active.requestLeave(proceed);
    return true;
  }
  return false;
}
