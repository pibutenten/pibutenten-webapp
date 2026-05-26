# 0011. Active identity 단위 권한 시스템 (Phase 1)

- **Status**: Accepted
- **Date**: 2026-05-26
- **Related**: ADR 0001 (multi-profile identity), ADR 0005 (active identity cookie), ADR 0006 (RLS policy strategy), 마이그레이션 0153 / 0155 (구 묶음 단위 — 본 ADR 로 정합), 마이그레이션 0158 (get_active_doctor_id), 0159 (헬퍼 + 함수 본문 교체), 0160 (cards RLS 재작성)

## Context

ADR 0001 의 원칙은 "같은 auth_user_id 묶음의 모든 profile row 가 **동등하게 독립** + 권한은 **현재 active 신분 단위**" 이다. 그러나 구현 단계에서 점진적으로 다음 회귀가 누적됨:

- **마이그레이션 0153**: `is_admin()` 함수가 "묶음 안 admin profile 이 있으면 admin 인정" 으로 확장 → 너구리(회원) 로 active 인데도 묶음에 admin 있으면 admin 권한 자동 상속.
- **마이그레이션 0155**: `cards_owner_update/delete` RLS 가 `author_id IN same_group_profile_ids(uid)` → 너구리로 active 인데 의사 본계 카드 수정/삭제 가능.
- **`current_doctor_id()` 함수**: 묶음 안에서 doctor 매핑 있는 아무 profile 의 doctor_id 반환 → active 와 무관한 의사 권한.
- **`cards_open_all_to_auth` 정책** (UPDATE, USING=true, WITH CHECK=true, PERMISSIVE, authenticated): 모든 authenticated UPDATE 무조건 통과 — 위 owner/doctor 정책을 사실상 무력화.

증상 예시 — **정한미 원장**: 너구리(회원) 로 가입 후 의사 본계가 sub-identity 로 추가. 의사 본계로 신분 전환해도 `getDoctorIdForProfile` 의 `doctor_accounts` 직접 SELECT 가 RLS `(auth.uid()=profile_id OR is_admin())` 에 차단 → /doctor 진입 불가. 본계가 primary 가 아닌 의사 1명만 해당되는 회귀이지만, 묶음 단위 권한 모델 자체의 한계.

## Decision

**RLS / 핵심 함수가 active identity 를 인식**하도록 정합. ADR 0001 원칙 그대로 유지하며 구현만 정합.

### 메커니즘 — HTTP 헤더 GUC 기반

1. **클라이언트** (`src/lib/supabase/server.ts`, `src/lib/supabase/client.ts`):
   - cookie 의 active identity (`pibutenten:identity` server / `pibutenten:identity-mirror` browser) 가 UUID 면 매 supabase 요청에 `x-active-profile-id` HTTP 헤더 추가.
   - cookie 가 `primary` 또는 부재 → 헤더 미설정.

2. **PostgREST**: HTTP 헤더를 GUC `request.headers` (JSON) 로 노출.

3. **DB 헬퍼** (`current_active_profile_id()`, 마이그레이션 0159):
   - `current_setting('request.headers', true)::json ->> 'x-active-profile-id'` 읽음
   - UUID 형식 검증 (위조 차단 1차)
   - 헤더 없으면 NULL 반환

4. **핵심 함수 재작성** (마이그레이션 0159):
   - `is_admin(uid)`: profile.role='admin' AND profile.id = `COALESCE(current_active_profile_id(), uid)` AND `(p.id=uid OR p.auth_user_id=uid)` (위조 차단)
   - `current_doctor_id(uid)`: doctor_accounts JOIN profile.id = `COALESCE(current_active_profile_id(), uid)` (위조 차단 동일)

5. **RLS 정책 재작성** (마이그레이션 0160):
   - `cards_owner_update/delete`, `cards_user_own_post/_delete`: `author_id = COALESCE(current_active_profile_id(), auth.uid())`
   - `cards_user_post_insert`: 3중 OR 분기 모두 active 단위
   - `cards_open_all_to_auth` DROP (보안 구멍 — 모든 정책 무력화하던 PERMISSIVE true/true 정책)

### Fallback 으로 회귀 0

`COALESCE(current_active_profile_id(), auth.uid())` 패턴으로 헤더 미설정 호출자도 primary profile.id 기준으로 정상 동작. 헤더 추가 작업이 모든 호출 경로에 도달하기 전 일시 회귀 없음.

### 위조 차단 (정의 다층)

- 1차 (`current_active_profile_id`): UUID 형식 정규식 검증
- 2차 (`is_admin`, `current_doctor_id`): `WHERE (p.id = uid OR p.auth_user_id = uid)` — active profile 이 호출자 묶음에 속하는 경우만 권한 인정
- 3차 (RLS 정책의 `auth.uid() IS NOT NULL` 가드)

## Consequences

### 긍정

- ADR 0001 의 "동등 독립 + active 단위 권한" 원칙이 코드와 일치
- 정한미 원장 같은 본계≠primary 케이스 자동 해소
- 너구리로 active 시 의사/admin 권한 자동 상속 차단 — 신분 분리 의도 회복
- 보안 구멍 `cards_open_all_to_auth` 제거 → owner/doctor 정책이 실제 동작

### 부정

- 클라이언트가 헤더를 반드시 전송해야 active 단위 동작. server / browser 양쪽 모두 client wrapper 에서 처리하므로 일반 호출 경로는 안전. 단 외부 직접 supabase 호출(scripts, mcp tool 등) 은 `auth.uid()` fallback 으로 primary 단위 동작.
- `current_setting('request.headers')` 가 매 함수 호출마다 실행 — 다만 STABLE 선언이라 same query 안에서 caching.

### 미적용 영역 (Phase 2 후속)

본 ADR (Phase 1) 은 cards 테이블 RLS + 핵심 함수 정합. 후속 단계에서 추가 정합 필요한 영역:

- `card_likes`, `card_saves`, `comments` 등 인터랙션 RLS 가 묶음 단위인지 active 단위인지 점검
- admin 화면의 다양한 RPC 호출 (`get_*_kpi_inner`, `get_card_activity_users` 등) 의 active 인식 여부 점검
- `same_group_profile_ids` 함수 자체는 묶음 단위 lookup 으로 유지 (위조 차단 검증용)

이는 후속 ADR (0012+) 또는 별도 phase 로 진행.

### 검증

- `tsc --noEmit` + `npm run build` 통과
- production 마이그레이션 0159 / 0160 적용 + 함수/정책 본문 검증
- 두 원장님 실제 동작 검증은 deploy 후 cookie 컨텍스트에서 가능 (Management API 의 service_role 컨텍스트에선 `auth.uid()` NULL 이라 직접 시뮬레이션 불가)
