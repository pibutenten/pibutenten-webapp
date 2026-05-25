# 0005. Active identity 쿠키 httpOnly 분리

- **Status**: Accepted
- **Date**: 2026-05-16 (2nd 세션, PR-A-2)
- **Related**: `src/lib/identity-shared.ts`, ADR 0001 (multi-profile identity)

## Context

ADR 0001 의 multi-profile identity 시스템은 쿠키 `pibutenten:identity` = `primary` 또는 `profile.id` (UUID) 로 active profile 을 표시.

초기 구현:
- 단일 쿠키, httpOnly false (UI 에서 직접 읽어야 IdentitySwitcher 표시 가능)
- 서버는 이 쿠키를 신뢰하여 인터랙션 user_id 결정

**보안 우려**:
- httpOnly false → XSS 공격 시 attacker 가 다른 profile.id 로 쿠키 위조 가능
- 서버가 위조 쿠키 신뢰 시 다른 사용자의 identity 로 글 작성/좋아요 등 가능

## Decision

**쿠키 2개로 분리**:

1. **`pibutenten:identity`** — httpOnly **true**, 서버 신뢰용
   - 서버가 인터랙션 user_id 결정에 사용
   - JS 에서 읽기 불가 → XSS 탈취 불가

2. **`pibutenten:identity-mirror`** — httpOnly **false**, UI 표시 전용
   - IdentitySwitcher 가 현재 active profile.id 표시에 사용
   - JS 에서 read 가능하나 위조해도 서버 신뢰 안 함

### 전환 시점
- `/api/identity/switch` 가 두 쿠키 동시 set
- 서버 측 헬퍼 (`getIdentityContext()`) 는 `pibutenten:identity` 만 신뢰
- 클라 측 헬퍼 (`getActiveIdentityId()`) 는 `pibutenten:identity-mirror` 읽음

## Consequences

### 긍정
- XSS 탈취 시 attacker 가 서버 신뢰 쿠키 (`pibutenten:identity`) 를 변조 불가
- UI 표시는 mirror 쿠키로 정상 동작
- 기존 사용자 영향 없음 (전환 시 양쪽 set 보장)

### 부정
- 쿠키 2개 동기화 부담 (`/api/identity/switch` 에서 누락 시 mismatch 발생 가능)
- 두 쿠키가 어긋나면 UI 표시 ≠ 서버 실제 active → 디버깅 어려움

### 검증
- 양 쿠키 동기 누락 회귀 가드는 `/api/identity/switch` 라우트 단일 진입점으로 완화
- 0099 RLS rewrite 이후 회귀 없음
