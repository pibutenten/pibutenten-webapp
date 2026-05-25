# 0001. Multi-profile identity (Phase 9)

- **Status**: Accepted
- **Date**: 2026-05 ~ 2026-05-15 (Persona 폐기로 단일 표준 확정)
- **Related**: 마이그레이션 0041~0050 (구 profile_identities 도입·revert), 0060 (qa_author_id Phase 9 fix), 0090 (Persona 폐기), 0099 (RLS rewrite), 0100/0101 (FK 복구·p_identity_id), `src/lib/identity.ts`, `src/lib/identity-shared.ts`

## Context

한 사람이 두 정체성으로 활동해야 하는 케이스가 있다:
- 피부과 전문의가 의사 본계 + 일반 회원 부계 두 모드로 활동
- 같은 사람이 Google 가입 + Naver 가입 등 멀티 채널 통합

초기 접근 (Persona 시스템, alt_* 컬럼):
- `profiles` 한 row 에 `alt_display_name`, `alt_avatar_url`, `alt_bio`, `alt_handle` 등 alternate 컬럼
- `posted_as` enum (official/personal) 로 글 작성 시 어느 정체성인지 표시
- `card_likes.persona`, `card_ratings.persona` 등 인터랙션 테이블에 persona 컬럼

문제점:
- 모든 RLS·RPC·UI 가 persona 분기 추가 → 코드 누더기
- 좋아요 등 인터랙션 권한이 alt vs main 혼동
- profile 1개로 둘을 표현하려니 표시 로직마다 분기

## Decision

**한 사람이 두 모드 활동 → 별개 profile row 를 생성하여 같은 `auth_user_id` 묶음**으로 묶는다.

- 쿠키 `pibutenten:identity` = `primary` 또는 `profile.id` (UUID) — 어느 profile 로 활동 중인지 지정
- 같은 `auth_user_id` 묶음의 모든 profile row 가 동등하게 독립
- 좋아요·저장·댓글 등 모든 인터랙션의 `user_id` / `author_id` = active profile.id
- 의사 vs 회원 구분은 오직 `doctor_accounts` 매핑 유무로 판단
- `getIdentityContext()` 서버 헬퍼 + `IdentitySwitcher` UI 컴포넌트 단일 진입점

## Consequences

### 긍정
- RLS 정책이 단순해짐 (persona 분기 제거)
- profile row 하나가 정체성 하나 → 표시·권한·인터랙션 모두 동일 로직
- 멀티 채널 통합도 자연스러움 (`auth_user_id` 묶음에 row 추가)
- 별점 시스템 폐기 (0094) 도 자연 따라옴 (rating.persona 의존 사라짐)

### 부정
- 사용자 한 명이 2~3개 profile row 보유 → DB row 수 증가 (의사 9명 × 1~2 = ~15 row 정도, 무시 가능)
- IdentitySwitcher UI 가 새로 필요 (TopNav 아바타 클릭 dropdown)
- 묶음 안의 admin 인식 확장 필요 (0153 — `is_admin()` 가 same_group 안 admin profile 도 인정)

### 마이그레이션 부담 (완료)
- 0090: alt_* / posted_as / persona 컬럼·enum drop. 19개 코드 파일 정리
- 0091: card_ratings.persona drop + PK 재구성
- 0099: RLS Phase 9 rewrite (qa_* → cards_* 정책명 통일)
- 0100: FK 복구
- 0101: `toggle_comment_like(p_identity_id)` 파라미터 추가
