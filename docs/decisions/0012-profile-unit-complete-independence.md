# 0012. 명함(profile) 단위 완전 독립 원칙 (Phase 3 — application layer 정합)

- **Status**: Accepted
- **Date**: 2026-05-26
- **Related**: ADR 0001 (multi-profile identity), ADR 0011 (active identity 권한 시스템 — DB layer)

## Context

ADR 0001 / 0011 로 "active 신분 단위 권한" 정책이 SQL 측 (RLS + RPC) 에서는 완전 정합되었으나, application layer (TypeScript 가드 + API 라우트 + me-cache + useCardViewer) 가 일부 옛 패턴 (묶음 OR 합산) 을 유지해 silent mismatch 발생 가능. 5월 한 달 이도영·정한미·김수형 원장 회귀 3연속이 모두 이 절반 정합에서 비롯.

또한 사용자 (2026-05-26) 가 정책을 명시 확정:

> "의사 명함으로 글을 쓰면 의사 글, 회원 명함으로 글을 쓰면 회원 글. 같은 사람의 다른 명함은 그 글·권한에 접근 불가. 묶음의 유일한 의미는 스위처로 빠르게 명함 전환할 수 있다는 것뿐."

본 ADR 은 위 원칙을 application layer 까지 끝까지 적용하기 위한 단일 정책 문서.

## Decision

### 명함(profile) 단위 완전 독립 5개 원칙

1. **데이터 귀속**: 모든 글·댓글·좋아요·저장·알림·view·impression 은 작성·발생한 명함(profile.id) 에만 귀속된다.
2. **권한 판정**: 모든 권한 (super admin / doctor admin / 의사 권한 / 카드 owner) 은 **현재 active profile** 기준으로만 판정한다. 묶음 합산 금지.
3. **데이터 접근**: 같은 사람의 다른 명함은 그 데이터에 접근할 수 없다. 같은 사용자라도 active 명함이 다르면 카드·통계·알림 모두 분리.
4. **묶음(bundle) 의미**: 묶음의 유일한 효용은 IdentitySwitcher dropdown 에 "내가 가진 다른 명함 목록 표시" + 빠른 전환. 묶음에 admin profile 이 있다고 admin 권한이 회원 명함으로 상속되지 않음.
5. **명함 self-contained**: 명함 row 가 자기 정보를 다 들고 있어야 한다. 의사 명함은 의사 정보 (doctor_id) 까지 명함 row 안에 직접 박혀 있어야 한다. 별도 매핑 표 (`doctor_accounts`) 의 직접 조회는 점진 제거.

### Application layer 정합 (Phase 3)

| 영역 | 옛 (묶음 합산) | 새 (active 단위) |
|---|---|---|
| `requireAdmin()` | `profiles.or(bundleProfileFilter)` 검색 | `getIdentityContext().isSuperAdmin` 만 |
| `requireAdminOrDoctor()` | 동일 | `getIdentityContext()` 의 isSuperAdmin OR isDoctorAdmin |
| `requireAdminPage()` | 묶음 admin lookup | `getIdentityContext()` 의 active 단위 flag |
| `articles PUT isAuthor` | `myProfileIds.has(card.author_id)` | `card.author_id === idCtx.active.profileId` |
| `me-cache.ts` role | `eq("id", user.id)` (base) | `eq("id", getActiveIdentityId() ?? user.id)` |
| `useCardViewer me` | SSR + useEffect 중복 fetch | SSR session 만 |

### "묶음 합산이 필요한 곳" 명시 분리

다음 2가지 경우만 묶음 정보 사용:
1. **IdentitySwitcher dropdown 데이터**: 본인 묶음 안 다른 명함 목록 표시 (layout.tsx)
2. **위조 차단 검증**: SECURITY DEFINER 함수 안에서 `(p.id = uid OR p.auth_user_id = uid)` 로 active profile 이 호출자 묶음에 속하는지 확인 (이미 ADR 0011 에서 적용 완료)

권한 판정·데이터 합산 용도의 묶음 OR 는 application 어느 곳에서도 사용 금지.

### 글 작성 시점 명함 고정

글 작성 시작한 순간의 active 명함을 글에 못박는다. 그 명함이 active 가 아닌 상태로 발행 시도 시 발행 버튼이 차단되거나 안내 모달이 뜬다. 의사 명함으로 쓴 글이 회원 글로 둔갑하는 사고를 차단.

## Consequences

### 긍정
- ADR 0001 / 0011 의 의도와 application layer 가 완전히 일치
- 같은 부류 회귀 (이도영·정한미·김수형 패턴) 잠재 표면 9~18곳 일괄 차단
- 신규 작업자가 매번 "묶음 기준인지 active 기준인지" 묻지 않아도 됨 — 답이 명함 단위 1개

### 부정
- admin 운영진이 회원 명함으로 active 인 채 `/admin/*` 접근 시 즉시 차단 (의도된 변화).
  - 사용자 결정 (2026-05-26): "안내문구 없이 차단. 명함 전환 후 다시 시도하는 게 맞음."
- 의사 운영진이 회원 명함으로 active 인 채 의사 카드 수정 시도 시 차단.
  - 사용자 결정: 글 작성 시점 명함 고정 + 발행 가드 활성 시 자동 차단.

## 누더기 재발 차단 — 운영 룰

다음 코드 패턴은 PR 차단:
- `profiles.or(bundleProfileFilter(...))` 호출이 권한 판정에 사용된 경우 (IdentitySwitcher dropdown 외)
- `eq("id", user.id)` 로 base profile role 만 읽는 경우 (me-cache, 카드 hooks, 권한 판정)
- `doctor_accounts` 직접 SELECT (의사 권한 판정용) — `get_active_doctor_id` RPC 만 사용

CI 가 위 패턴을 매 PR 마다 검출 (가능한 grep 룰).

## 검증

- `tsc --noEmit` + `npm run build` 통과
- requireAdmin / requireAdminPage / articles PUT / me-cache / useCardViewer 5개 영역 회귀 검사
- 의사 6명·관리자 운영진 1명 실제 동선 (active 전환 → admin 페이지 차단 / 의사 카드 수정 차단) 확인
