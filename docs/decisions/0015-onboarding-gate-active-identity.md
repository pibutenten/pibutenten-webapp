# 0015. 온보딩 게이트 active 명함 기준 정합

- **Status**: Accepted
- **Date**: 2026-05-29
- **Related**: ADR 0001 (multi-profile identity), ADR 0012 (명함 단위 독립 5원칙), ADR 0014 (컬럼 명명), 첫 점검 보고서 POLICY-1 / POLICY-2
- **마이그레이션**: 본 ADR 은 코드·문서 정책. DB 변경 0. 단 일회성 백필 (B-1) 은 production 에 직접 적용 (마이그 파일 없음, 트랜잭션 SQL 단발).

---

## Context

ADR 0001 / 0011 / 0012 가 "active 명함 단위 권한" 을 RLS · 핵심 RPC · application 가드 까지 일관 적용했으나, **온보딩 게이트** 만 base profile 단위 검사가 남아 있었음 — 첫 점검 보고서 POLICY-1 의 잔여 패턴.

### 발견된 회귀 (2026-05-29)

사용자 사례:
- `jminbae` (auth_user_id `929fc408...` 묶음의 user sub 명함, PII NULL) 명함으로 active 전환 후 댓글 작성 시도.
- middleware 는 base profile (`bae-jungmin` doctor, PII 채워짐) 만 검사 → 통과.
- 그 후 댓글 라우트 `POST /api/comments` 는 active 명함 (`jminbae`) 의 `birthdate / terms_agreed_at` 검사 → NULL → 403 forbidden + `userMessage="프로필 기본 정보를 먼저 입력해주세요."`.
- 클라이언트 (`CommentsBlock.tsx`) 가 응답의 `j.error` (kind enum = "forbidden") 만 토스트로 표시 → 사용자에게 **"forbidden"** 만 노출. 정작 친절한 한글 `j.message` 는 무시됨.
- 사용자는 "왜 forbidden 이 떴는지" 모르고 온보딩 화면도 못 봄 → 회귀 모순.

### POLICY-2 (묶음 PII propagation 일관성 누락) 도 함께 발견

`profiles` 테이블 production DB 전수 (46 row) 조사 결과:
- 다명함 묶음 9개 중 5개는 sub 명함도 PII 채워짐 (propagate 정상).
- 4개 묶음의 5개 sub 명함 (developer, jminbae, kim-soohyung, kang-hyunjin, park-hyojin) 은 PII NULL — propagate 누락.

원인 추정: 0106 마이그의 `propagate_onboarding_to_doctor_bundle` RPC 가 의사 멀티 계정 묶음 (`profiles.doctor_id IS NOT NULL`) 한정으로 작동. 일부 묶음에서 sub 명함이 신규 생성된 시점에 base 가 의사 자격을 아직 안 가지고 있었거나, sub 명함이 admin 매핑 라우트 (CRITICAL-3) 로 생성되면서 propagate 호출 누락된 시나리오로 추정.

---

## Decision

### 1. 온보딩 게이트는 active 명함 단위 (확정)

- **middleware** (`src/middleware.ts`): 옛 `.eq("id", user.id)` (base 만) → `IDENTITY_COOKIE` 기반 candidate + 묶음 보안 검증 → active 명함의 `birthdate / terms_agreed_at` 검사. 묶음 외 ID 는 base fallback (남의 명함 ID 우회 차단).
- **onboarding 페이지** (`src/app/onboarding/page.tsx`, `src/app/onboarding/OnboardingClient.tsx`): `targetProfileId` 를 active 명함 ID 로 결정 (같은 보안 검증). `profiles UPDATE .eq("id", targetProfileId)` 로 저장.
- **댓글 라우트** (`POST /api/comments`): 이미 active 단위 검사 (`idCtx.active.birthdate / termsAgreedAt`). 그대로 유지.
- **카드 작성/수정 라우트** (`POST /api/articles`, `PUT /api/articles/[id]`): active 단위 검사 (자동검수 정책 ADR 0007 정합).

### 2. 첫 명함 완료 시 묶음 빈 명함에 1회 COALESCE 복제 (확정)

- `propagate_onboarding_to_doctor_bundle(uuid)` RPC (0106 마이그 정의 기준):
  - source = 방금 채운 active 명함.
  - 같은 묶음 (`same_group_profile_ids(auth.uid())`) 의 다른 profile 의 NULL 칸만 COALESCE 복사. 이미 채워진 칸 보존.
  - 의사 멀티 계정 묶음 (`profiles.doctor_id IS NOT NULL`) 한정 작동 — 일반 사용자 단일 명함은 RPC 가 0 반환 (무해).
- 복제 후엔 명함마다 PII 독립 수정. ADR 0012 5원칙과 정합.

### 3. ONBOARDED_COOKIE 도 active 단위 (확정)

- middleware fast path 2b 의 `ONBOARDED_COOKIE` 매칭을 active 단위로 좁힘 (`activeIdHint === cookie`).
- active 명함이 바뀌면 mismatch 감지 → 슬로 path 재검사. 무한 redirect 루프 차단.
- OnboardingClient 가 `document.cookie = pibutenten_onboarded=${targetProfileId}` 로 set.

### 4. 보안 — 묶음 우회 차단 (확정)

- candidate ID 가 호출자 묶음 (`id = user.id` 또는 `auth_user_id = user.id`) 에 속할 때만 active 단위 검사 사용.
- middleware 의 단일 SELECT 안에서 `inBundle = row.id === user.id || row.auth_user_id === user.id` 로 검증. 묶음 외 ID 는 base fallback.
- onboarding/page.tsx 도 동일 패턴.

### 5. settings/profile POLICY-1 잔여 — **완료 (2026-05-29, commit `fd1b64b`)**

- 옛 `src/app/settings/profile/page.tsx:57` 의 `.eq("id", user.id)` (base only) → `getIdentityContext` SSOT 사용으로 active 명함 단위 정합 완료.
- 읽기·쓰기 한 세트 보장: `targetProfileId = idCtx?.active?.profileId ?? user.id` 단일 결정. `page.tsx` PII SELECT + `ProfileEditClient` 의 `saveAll()` / `saveMarketing()` 모두 동일 ID 사용.
- 옛 `saveMarketing` 의 `.eq("id", userId)` (base 저장) — 핵심 엇갈림 정정.
- 보안: `resolveActiveIdentity` 내부 묶음 검증 (`auth_user_id == user.id`) 으로 남의 명함 위조 차단 자동.
- 본 ADR 본문은 이로써 settings/profile 까지 active 명함 단위 정합 100%.

### 6. 새 sub 명함 생성 시 자동 propagate (현재 미구현 — 정책 보류)

- `src/` 안 `profiles INSERT` 0건 / `create_sub_profile` 류 RPC 0건 확인.
- 옛 `/api/admin/users/[id]/role/route.ts` (CRITICAL-3) 가 유일한 sub 생성 경로였으나 **2026-05-29 commit `b8251bb` 로 라우트 + RoleChangeForm UI 일괄 제거** (ADR 0012 위반 백필 흐름 종결). 현재 코드베이스에 sub 명함 생성 경로 부재 — 의도된 상태.
- 향후 정상 sub 생성 경로 (관리자가 의사 명함 신설·연결) 도입 시점에 propagate 호출을 같은 commit 에서 추가하는 정책 명시.

---

## Consequences

### 긍정

- 사용자 회귀 (forbidden 토스트 + 온보딩 안내 안 뜸) 의 근본 원인 차단.
- ADR 0012 (active 명함 단위 독립) 의 마지막 application 잔여 (POLICY-1 의 핵심 게이트 3곳 + 4번째 잔여 1곳) 정합.
- 보안 강화: candidate ID 묶음 검증 — 다른 사람 명함 ID 를 쿠키에 넣어 우회 차단.

### 부정 (한정)

- middleware 의 단일 쿼리에서 묶음 검증을 위한 row 검사 추가 — DB 비용 무시할 수준 (1 row maybe Single).
- ONBOARDED_COOKIE 가 active 단위로 set 되어, 사용자가 빠르게 명함 전환 시 fast path 2b 가 자주 통과 못함 → 슬로 path 재검사. DB 1 row 추가 SELECT (캐시는 active 명함 단위로 다시 set).

### 미래 부담

- settings/profile (POLICY-1 4번째 게이트) 정합 별도 안건 — 본 ADR 직후 진행 권장.
- POLICY-2 정상 sub 생성 시 자동 propagate 정책 — 정상 sub 생성 경로 도입 시점에 적용. 현재 그 경로 부재.
- 일회성 백필 (B-1, 5명함) 은 완료. 단독 명함 NULL 5건 (lhjcjstk79 외 4명) 은 다음 로그인 시 middleware 가 자동 `/onboarding` 안내 → 별도 처리 불필요.

---

## 부록 — B-1 백필 사실 기록

production DB 일회성 트랜잭션 적용 (2026-05-29):
- 백업 테이블 `public.profiles_backup_20260529` 생성 (46 row).
- 5 sub 명함 (developer / jminbae / kim-soohyung / kang-hyunjin / park-hyojin) 의 PII 를 base 명함 값으로 COALESCE 복사. 이미 채워진 칸 보존.
- 사전·사후 DO 검증 블록 통과. `remaining_sub_null = 0` 재확인.
- B-2 코드 정합 (본 ADR) 적용 후, 동일 회귀 미래 차단.
