# 0002. Soft-delete in-place 익명화 (탈퇴 정책)

- **Status**: Accepted (Supersedes 0107 sentinel 방식)
- **Date**: 2026-05-16 (Phase 7-extra)
- **Related**: 마이그레이션 0107a~c (sentinel, 폐기됨), 0109 (in-place 익명화), 0132 (cards.deleted_at + RLS 강제)

## Context

회원 탈퇴 시 작성한 카드·댓글의 처리 방법:

### 옵션 1 — Hard delete (cascade)
- profile DELETE 시 작성한 카드·댓글 모두 cascade
- 문제: 다른 사용자의 좋아요·댓글 정보가 같이 사라짐 → 커뮤니티 가치 훼손
- 의료 정보 검색 가치 자체가 소실됨

### 옵션 2 — Sentinel profile 도입 (0107 시도, 폐기)
- `id=00000000-...` 의 sentinel profile 생성
- 탈퇴 시 카드·댓글 `author_id` 를 sentinel 로 이전
- `anonymize_user_content_before_delete` RPC
- 문제:
  - profiles ↔ auth.users FK 부재로 cascade 미발동 보완 필요 (0107c 추가 패치)
  - NOT NULL 컬럼 (marketing_email_consent/liked_procedures/field_visibility) 기본값 set 필요 (0107b)
  - 사용자가 작성한 카드를 sentinel 이 작성한 것처럼 보임 → 동명이인·중복 가입 식별 불가

### 옵션 3 — In-place 익명화 (네이버 카페 / Discord / StackOverflow 방식)
- profile row 그대로 보존
- `deleted_at` 설정 시 handle/display_name/PII NULL 처리 (in-place 마스킹)
- 카드·댓글 `author_id` 는 그대로 → "탈퇴한 사용자" 표시

## Decision

**옵션 3 채택**.

### 구현 (마이그레이션 0109)
- `profiles.deleted_at TIMESTAMPTZ NULLABLE` 컬럼 신설. NULL = 활성
- 설정 시 in-place 마스킹:
  - `handle` → `deleted-{12hex}`
  - `display_name` → "(탈퇴한 사용자)"
  - PII 컬럼 NULL (birthdate/gender/face_shape/skin_type/contact_email 등)
  - `auth_user_id` NULL (auth.users 와 disconnect)
- 카드·댓글 `author_id` 이전 불필요 (그대로 가리키지만 표시 시 "탈퇴한 사용자")
- UI 표시: "(탈퇴한 사용자)" 통일 (네이버 카페식)

### 카드 soft-delete 별도 (마이그레이션 0132)
- 사용자가 본인 카드 삭제 시: `cards.deleted_at` 설정 (별도 컬럼)
- 35개 SELECT 코드 무변경 — `cards_public_read` RLS 가 `deleted_at IS NULL` 자동 필터
- `/admin/cards?status=deleted` 탭 + "복구" 버튼

## Consequences

### 긍정
- 다른 사용자의 좋아요·댓글 정보 보존
- 의료 정보 검색 가치 보존
- sentinel 의 NOT NULL·FK 문제 모두 자연 해소
- 각 탈퇴자 본인 row 그대로 보존 → 통계·로그 추적 가능

### 부정
- profiles row 수 증가 (탈퇴자 누적)
- handle 충돌 방지를 위해 `deleted-{12hex}` 패턴 강제
- in-place 마스킹 후 같은 사람이 재가입하려면 ID 재부여 필요 (`auth_user_id` 가 NULL 이므로 재연결 가능)

### 관련 후속 결정
- 0109 → 0110 (legal_name 폐기) → 0111 (contact_email dedup): 탈퇴 후 재가입 시 중복 가입자 식별 (ADR 0003)
- 0132 카드 soft-delete: 동일 패턴 카드에 적용
