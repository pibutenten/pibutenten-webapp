# Security Notes (pibutenten-app)

## Known Git History Exposures

### 0086 push webhook secret 평문 노출 (1차)
- **파일**: `supabase/migrations/0086_push_webhook_trigger.sql`
- **노출 값**: `MUfWMCnutoE4sBp4EGVcyUiPRWfNybXFy-qd3uHsiOY` (이전 push webhook secret)
- **상태**: ✅ **폐기 완료** — 0103 마이그레이션에서 Supabase Vault 기반으로 이관, 시크릿 로테이션 적용.
- **영향**: 현재 production에서는 위 값을 사용하지 않음. Git history에는 영구 보존되나 키 자체는 무효.
- **금지 사항**: 위 시크릿 값을 어떤 환경에서도 재사용하지 말 것.

### 0103 push webhook secret 평문 노출 (2차)
- **파일**: `supabase/migrations/0103_push_webhook_vault.sql:24`
- **노출 값**: `73qpLpercXjzz4Ezdk0ESoc_7390lTYI8AGgFn5qyn1SGC6VBkLhkMYbyBJhK2cs`
- **상태**: ✅ **폐기 완료 (2026-05-17)** — 0120 마이그레이션 + 수동 로테이션 절차로 이관.
- **인지 시점**: 2026-05-17 보안 1차 점검 (`260517 보완 점검 1차.md` A2 항목).
- **영향**: Vault 이관 마이그레이션 자체가 신규 secret 을 또 SQL 본문에 박은 anti-pattern 반복. git history 영구 보존.
- **금지 사항**: 위 시크릿 값을 어떤 환경에서도 재사용하지 말 것.

### history rewrite 정책
- BFG/filter-repo 등 force-push 적용하지 않음 (다른 부작용 위험이 더 큼).
- 노출된 시크릿은 즉시 폐기 + 신규 시크릿 발급 + 운영 환경 갱신으로 무력화.

## 시크릿 관리 정책

1. 시크릿은 `.env.local` 또는 Vercel/Supabase env 변수로만 관리.
2. **마이그레이션 SQL 본문에 시크릿 평문 직접 기재 금지** (0086/0103 반복 사례 방지).
   - 새 시크릿을 Vault 에 set 할 때는 `public.rotate_push_webhook_secret(<신규시크릿>)` RPC 를
     Supabase Dashboard SQL Editor 에서 **수동 1회 실행**.
   - 마이그레이션 파일은 헬퍼 함수 정의·검증 쿼리만 포함. 실제 시크릿 값은 절대 포함 X.
   - 적용 후 SQL Editor History 에서 해당 쿼리 즉시 삭제.
3. `.env*` 는 `.gitignore` 적용됨 (`.env*.example` 제외).
4. service_role 키는 서버 코드(`src/lib/supabase/admin.ts`)에서만 사용. 클라이언트 번들 노출 금지.
   - 2026-05-17 부터 `import "server-only"` 강제 (admin.ts 외 5개 server-only 모듈도 동일 적용:
     `src/lib/ai/step1.ts`, `step2.ts`, `youtube-oauth.ts`, `python-transcript.ts`, `src/lib/auth/naver.ts`).

## 시크릿 로테이션 절차 (push webhook secret 기준)

상세 절차는 `supabase/migrations/0120_push_webhook_secret_rotate.sql` 상단 주석 참조.

요약:
1. `python -c "import secrets; print(secrets.token_urlsafe(48))"` 신규 발급.
2. Supabase Dashboard SQL Editor 에서 `SELECT public.rotate_push_webhook_secret('<신규>');` 실행.
3. Vercel env `PUSH_WEBHOOK_SECRET` 동일 값으로 갱신 + 재배포.
4. `SELECT public.push_webhook_secret_status();` 로 검증.
5. SQL Editor History 에서 1·2 단계 쿼리 즉시 삭제.

## 향후 점검 권고

- 시크릿 노출 점검 (분기 1회 스캔): 평시 정기 로테이션은 하지 않고, 분기엔 노출 여부 점검만. 노출 의심 시에만 즉시 로테이션. 대상: VAPID, NAVER_CLIENT_SECRET, ANTHROPIC_API_KEY, SUPABASE_SERVICE_ROLE_KEY, PUSH_WEBHOOK_SECRET, GOOGLE_CLIENT_SECRET, APPLE_SIGNIN_KEY(.p8)
  - **APPLE_SIGNIN_KEY 는 예외적으로 정기 로테이션 대상**: Apple Client Secret(JWT)이 6개월 만료라 GitHub Actions 가 매월 자동 재발급(.p8 자체는 GitHub Secrets 에만 보관, 서버 미노출). 절차·키 교체는 `RUNBOOK.md` §9 참조.
- Dependabot/Snyk 등 의존성 보안 알림 모니터링
- CSP `Content-Security-Policy-Report-Only` → enforce 모드 전환 검토 (Report-Only 로그 수집 후)
- 분기마다 `pg_proc` SECURITY DEFINER 함수 전수 점검 (admin 가드 누락 + `search_path` 미고정 회귀 방지). search_path 미고정 시 search_path hijacking 위험 — SECURITY DEFINER 함수는 `SET search_path = public, pg_temp`(auth 접근 함수는 `public, auth, pg_temp`) 고정 필수. (마이그 0274 에서 recalc_user_level·anonymize_user_content_before_delete·propagate_onboarding_to_doctor_bundle 고정 완료)
- 임의 호출 가능 RPC 점검: `proacl` 에 PUBLIC(`=X`)/anon EXECUTE 가 부여된 SECURITY DEFINER 함수는 내부 `auth.uid()`/`is_admin()` 가드 + GRANT 최소화 (0274 recalc_user_level, 0276 find_other_auth_user_by_email, **0284 award_points · 0285 award_daily_login** 정리 완료 — 2026-06-14 보안 감사)
  - **award_points (0284) · award_daily_login (0285), P2-1**: 가드 없는 write 함수(activity_score/level/daily_logins 적립)가 PUBLIC+authenticated EXECUTE 였음 → REVOKE. award_points 는 `{postgres=X, service_role=X}`, award_daily_login 은 `{postgres=X}`(미사용 dead 함수). award_daily_login 은 award_points 의 유일 호출자이자 옆문이라 한 세트로 봉쇄. **포인트가 금전 가치를 갖는 커머스 오픈 시 P0 격상**. 상세: `reports/2026-06-14-보안감사-종합보고서.md`.
  - **미조치 [권고] (별도 안건, 베타 운영 전환 후)**: KPI 읽기 함수 `get_admin_kpi_inner`·`get_doctor_kpi_inner`·`get_top_new_members_inner` 가 `authenticated` 에 내부 admin 가드 없이 노출(읽기 전용 — KPI·신규회원 준-PII). `save_my_notification_prefs` 는 `current_active_profile_id()`/`validate_active_profile_id()` 미사용으로 다중 명함 시 저장 대상 비결정(ADR 0011 미준수 설계 결함, 보안 취약은 아님).
  - 잔여 권고: `proacl` 에 PUBLIC/anon EXECUTE + 내부 가드 없는 write SECURITY DEFINER 함수를 자동 검출하는 점검 쿼리를 분기 루틴/CI 에 편입.
