# ADR 0016 — 원장 명함 신설·연결 (CRITICAL-3 대체)

- 상태: 채택 (2026-05-30)
- 관련: ADR 0012 (명함 단위 완전 독립), ADR 0014 (사람 ID 컬럼 명명), ADR 0015 (온보딩 게이트·묶음 PII 복제)

## 맥락

2026-05-29 에 CRITICAL-3 (`/api/admin/users/[id]/role`) 을 제거했다. 이 라우트는
회원 명함의 role 을 사후에 doctor 로 바꾸고, 회원 시절 글에 `doctor_id` 를 소급
백필했다 — ADR 0012 (명함 단위 완전 독립) 위반. 제거하면서 "의사 자격은 관리자가
별도 의사 명함을 신설·연결하는 흐름으로 대체 (별도 안건)" 로 남겨 두었다. 본 ADR 이
그 대체 흐름을 정의한다.

## 결정

관리자(super admin)가 기존 회원 계정에 **새 원장 명함을 신설**하고 같은 묶음
(`auth_user_id`) 으로 연결한다. 흐름:

1. admin 이 회원 명함을 선택하고 원장 정보(slug·이름·병원·지점·직함)를 입력.
2. 단일 트랜잭션 RPC `admin_create_doctor_profile` 가:
   - `doctors` row 신설 (slug·name 필수, clinic/title 기본값, branch 선택).
   - `profiles` row 신설 (role=doctor, doctor_id 인라인, 같은 `auth_user_id` 묶음, slug 기반 handle).
   - 선택한 회원 명함의 온보딩 PII 9컬럼을 새(빈) 원장 명함에 복사.
3. 이후 두 명함은 독립 운영 (IdentitySwitcher 전환). PII 는 명함별 독립 수정.

### ★ 하지 않는 것 (CRITICAL-3 재발 방지)
- 회원 명함의 role 변경 안 함 (회원은 회원 유지).
- 회원 글(cards)에 `doctor_id` 소급 백필 안 함.
- 원장 명함은 새 빈 명함에서 시작. 회원 글을 물려받지 않음.
- RPC 는 회원 명함 row 를 UPDATE 하지 않는다 (INSERT 2건 + 회원에서 읽기만).

## 대안과 기각 사유

- **기존 `propagate_onboarding_to_doctor_bundle` RPC 재사용**: 기각.
  이 RPC 는 `auth.uid()` 가 묶음 주인일 때만 동작(`'not your bundle'` 가드)하므로
  admin 이 **타인 묶음**에 호출하면 거부된다. 본인 온보딩 전파 전용이다.
- **미연결 doctors row 선택 연결**: 현 시점 미연결 doctors 0개 → 선택지 없음.
  새 doctors row 생성이 유일 경로 (`slug`·`name` NOT NULL·기본값 없음).
- **PII 복사 생략**: 기각. 생략 시 새 원장 명함이 온보딩 게이트(ADR 0015)에 걸려
  전환 시 마찰 발생. 사용자 결정으로 복사 채택 (이후 독립 수정).

## 권한·보안

- 권한 게이트: 애플리케이션 계층 `requireAdmin` (active 명함 admin, ADR 0012).
- RPC 는 **service_role 전용 GRANT** (authenticated·public REVOKE), `auth.uid()` 비의존.
  admin 라우트가 service_role admin client 로만 호출.
- 안전장치(RAISE): 잘못된 slug / 회원 미온보딩 / 묶음 내 기존 원장 명함 / slug 중복.
- `audit_logs` 적재 (`admin.doctor_profile_create`).

## 구현 위치

- 마이그: `supabase/migrations/0192_admin_create_doctor_profile.sql` (+ `0192b` 롤백).
- 라우트: `src/app/api/admin/users/[id]/doctor-profile/route.ts`.
- UI: `src/app/admin/users/[id]/CreateDoctorProfileForm.tsx` + `page.tsx` 연결.
