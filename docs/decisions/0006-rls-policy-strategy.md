# 0006. RLS 정책 전략

- **Status**: Accepted
- **Date**: 2026-05 ~ 2026-05-23 (지속 진화)
- **Related**: 0099 (RLS Phase 9 rewrite), 0122/0123 (anon PII lockdown), 0132 (cards.deleted_at), 0152/0153/0155 (hidden status + same_group + owner update), 0156 (soft_delete_card RPC SECURITY DEFINER)

## Context

Supabase Postgres 의 Row Level Security (RLS) 가 본 프로젝트의 권한 모델 단일 진입점. 어떤 정책 전략을 채택할지 결정 필요.

### 옵션 1 — 애플리케이션 레이어 권한 (RLS 끄고 API 단에서만 검증)
- 코드 단에서 매 요청마다 권한 체크
- 문제: 직접 supabase 클라이언트 호출 (`supabase.from(...).select()`) 시 우회 가능
- 문제: service_role 키 노출 시 모든 데이터 접근

### 옵션 2 — RLS 우선 (DB 단 SSOT)
- 모든 테이블 RLS 활성
- 클라이언트는 anon key 만 보유
- 서버는 사용자 session 으로 인증 → DB 가 자동 권한 체크
- service_role 은 server-only 모듈 한정 사용

## Decision

**옵션 2 채택**. RLS 우선 전략.

### 핵심 정책 패턴

#### `cards`
- `cards_public_read`: `status='published' OR is_admin() OR doctor_id=current_doctor_id() OR author_id IN same_group_profile_ids(auth.uid())` + `deleted_at IS NULL` 강제 (0132)
- `cards_admin_all` / `cards_doctor_update`/`_delete` / `cards_user_own_post`/`_delete`
- `cards_owner_update`/`_delete` (0155 신설 → **0160 active 단위 재작성**): `author_id = COALESCE(current_active_profile_id(), auth.uid())` (ADR 0011)
- `cards_user_post_insert` (0160 재작성): 3중 OR 분기 모두 active 단위
- 폐기: `cards_open_all_to_auth` (0160 DROP — USING=true/CHECK=true PERMISSIVE 라 owner/doctor 정책 무력화하던 보안 구멍)

#### `profiles`
- `profiles_public_select` (qual=true) — 안전 컬럼만 anon SELECT (0122/0123)
- `profiles_self_select`
- PII 8개 컬럼 anon REVOKE (birthdate/gender/face_shape/skin_type/skin_concerns/interested_procedures/liked_procedures/contact_email)
- `public_profiles_view` (안전 컬럼 19개만 노출)

#### `is_admin()` / `current_doctor_id()` 함수
- **2026-05-26 정합 (0159 — ADR 0011)**: active 신분 단위로 본문 교체. `profile.id = COALESCE(current_active_profile_id(), uid)` AND `(p.id=uid OR p.auth_user_id=uid)` (위조 차단).
- 옛 패턴 (0153 묶음 인식 확장) 은 ADR 0001 의 active 단위 권한 원칙과 충돌 → 폐기.
- HTTP 헤더 `x-active-profile-id` 가 없으면 fallback 으로 auth.uid() (primary profile.id) — 회귀 0.

### RLS 정책 명명 규칙
- `{table}_{actor}_{action}` 패턴 (예: `cards_owner_update`)
- 0099 에서 옛 `qa_*` → `cards_*` cosmetic 리네임

### 우회 패턴: SECURITY DEFINER RPC
**필요 시점**: RLS 평가에 미묘한 PostgreSQL 내부 이슈가 있을 때.

**사례** (0156): 카드 [지우기] 시 `cards.deleted_at` UPDATE 가 RLS 정책 평가 통과하는데도 막힘.
- 진단: ⓐ `is_admin()` = false, ⓑ `cards_owner_update` WITH CHECK 표현식 직접 평가 = TRUE, ⓒ 같은 컨텍스트 status/question/keywords UPDATE 는 모두 통과, ⓓ 오직 `deleted_at` UPDATE 만 막힘
- 원인: PostgreSQL RLS evaluator 의 sub-select 평가 미묘 이슈로 추정 (정확한 root-cause 확정 어려움)
- 해결: `soft_delete_card(p_card_id)` SECURITY DEFINER RPC 신설
  - 함수 내부에 권한 체크 명시 (admin OR same_group_profile_ids 포함 author OR current_doctor_id = doctor_id)
  - SECURITY DEFINER 컨텍스트(postgres) 로 UPDATE → RLS 우회
  - 권한 없으면 `RAISE EXCEPTION 'forbidden'`

## Consequences

### 긍정
- DB 가 SSOT → 어떤 클라이언트로 접근해도 권한 일관
- service_role 노출 시에도 server-only 모듈 격리로 영향 한정
- 정책 변경이 코드 변경 없이 즉시 반영

### 부정
- RLS 정책 평가의 미묘한 PostgreSQL 내부 동작 (옵티마이저·sub-select) 으로 인한 디버깅 어려움
- SECURITY DEFINER RPC 우회는 "진짜 root-cause 가 아닌 격리된 우회" — 향후 PostgreSQL 버전 변경 시 재발 가능
- admin RPC 들이 `is_admin()` 가드 누락 시 보안 회귀 (보안 1차 점검에서 3개 발견 → 0124/0125 보강)

### 정기 점검 (분기 1회)
- `pg_proc` SECURITY DEFINER + authenticated EXECUTE sweep
- admin 가드 누락 회귀 방지
