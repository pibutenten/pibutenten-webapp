# 0003. Email 기반 중복 가입자 식별 (legal_name 폐기)

- **Status**: Accepted (Supersedes 0098 legal_name 방식)
- **Date**: 2026-05-16 (Phase 7-extra)
- **Related**: 마이그레이션 0098 (legal_name + RPC, 폐기됨), 0102 (enumeration 차단), 0110 (legal_name drop), 0111 (contact_email RPC)

## Context

ADR 0002 (soft-delete in-place 익명화) 결과로 탈퇴자가 재가입할 가능성이 생김. 또한 한 사람이 여러 OAuth provider (Google + Naver + Kakao) 로 가입 시도 시 중복 식별이 필요.

### 옵션 1 — legal_name 기반 (0098, 폐기)
- 온보딩 폼에 "실명" 입력 받음
- `profiles.legal_name` 컬럼 + `find_duplicate_profiles(p_name, p_birthdate, p_gender)` RPC
- 같은 (이름, 생년월일, 성별) 조합 검색

**문제점**:
- 실명 입력은 사용자 부담 (PII 추가 수집)
- 동명이인 식별 어려움
- legal_name 컬럼이 별도 PII → 보안 점검 부담
- enumeration 공격 가능 (`find_duplicate_profiles` 가 handle/display_name 반환 → 0102 보강 필요)

### 옵션 2 — OAuth provider email 기반
- OAuth 가입 시 provider 가 전달하는 이메일을 `contact_email` 컬럼에 저장
- 사용자 수정 가능 (다른 메일 쓰고 싶을 때)
- 중복 식별: 같은 (email, birthdate, gender) 조합

## Decision

**옵션 2 채택**. `legal_name` 폐기.

### 구현
- 마이그레이션 **0110**: `profiles.legal_name` 컬럼 drop + dedup index drop
- 마이그레이션 **0111**: `profiles.contact_email TEXT` 컬럼 + `find_duplicate_profiles(p_email, p_birthdate, p_gender)` RPC
- 마이그레이션 **0134**: enumeration 보강 (count + provider 힌트만 반환, handle/display_name 노출 X)
- 온보딩 폼: OAuth provider email 자동 prefill, 수정 가능

### `contact_email` 정책
- 중복 가입자 식별 전용 (dedup) — 다른 곳 미표시
- anon SELECT 차단 (0122 PII lockdown 에 포함)
- 사용자 수정 가능

## Consequences

### 긍정
- PII 1개 컬럼 (legal_name) 폐기 → 보안 점검 부담 감소
- 사용자 입력 부담 감소 (이메일은 OAuth 자동 prefill)
- 동명이인 식별 우려 해소 (이메일 = 사실상 unique)
- enumeration 차단 강화

### 부정
- 같은 사람이 다른 이메일로 가입 시도하면 식별 실패 가능 (birthdate + gender 보강이 부분 해소)
- 사용자가 임의 이메일로 수정 시 dedup 정확도 하락 (대신 본인 의도라 OK 판단)

### 후속 회귀
- 0111 적용 후 회귀 없음. 운영 안정적.
