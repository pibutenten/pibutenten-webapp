# Security Notes (pibutenten-app)

## Known Git History Exposures

### 0086 push webhook secret 평문 노출
- **파일**: `supabase/migrations/0086_push_webhook_trigger.sql`
- **노출 값**: `MUfWMCnutoE4sBp4EGVcyUiPRWfNybXFy-qd3uHsiOY` (이전 push webhook secret)
- **상태**: ✅ **폐기 완료** — 0103 마이그레이션에서 Supabase Vault 기반으로 이관, 시크릿 로테이션 적용.
- **영향**: 현재 production에서는 위 값을 사용하지 않음. Git history에는 영구 보존되나 키 자체는 무효.
- **금지 사항**: 위 시크릿 값을 어떤 환경에서도 재사용하지 말 것.
- **history rewrite 정책**: BFG/filter-repo 등 force-push는 적용하지 않음 (다른 부작용 위험이 더 큼).

## 시크릿 관리 정책

1. 시크릿은 `.env.local` 또는 Vercel/Supabase env 변수로만 관리.
2. 마이그레이션 SQL에 시크릿 평문 직접 기재 금지. 필요 시 Supabase Vault 또는 환경변수 참조.
3. `.env*` 는 `.gitignore` 적용됨 (`.env*.example` 제외).
4. service_role 키는 서버 코드(`src/lib/supabase/admin.ts`)에서만 사용. 클라이언트 번들 노출 금지.

## 향후 점검 권고

- 정기 시크릿 로테이션 (분기 1회): VAPID, NAVER_CLIENT_SECRET, ANTHROPIC_API_KEY, SUPABASE_SERVICE_ROLE_KEY
- Dependabot/Snyk 등 의존성 보안 알림 모니터링
- CSP `Content-Security-Policy-Report-Only` → enforce 모드 전환 검토 (Report-Only 로그 수집 후)
