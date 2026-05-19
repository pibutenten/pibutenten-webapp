# Incident: Secret Rotation Procedure

> 시크릿이 외부에 노출되었을 가능성이 발견되었을 때의 대응 절차.
> 평시 정기 로테이션은 비용 대비 효과 낮아 운영하지 않음 — 사고 시점에만 본 문서대로 처리.

## 0. 노출 의심 트리거

다음 중 하나가 발생했을 때 본 절차를 즉시 시작한다:
- git 커밋 히스토리에서 시크릿 발견
- `scripts/secret-scan.js` pre-commit 훅이 우회된 commit 발견
- Vercel logs / Supabase logs / Sentry 에서 시크릿 값 출력 확인
- 노트북 도난 / 운영자 PC 침해
- 협력사 / 외부 공유 채널(슬랙·이메일)에 실수로 시크릿 평문 전송
- API 콘솔(Anthropic / Supabase / Naver)에서 비정상 사용량 알림

## 1. 영향 범위 식별

```
영향 시크릿 목록 (.env.local 기준):
[ ] NEXT_PUBLIC_SUPABASE_URL          ← 공개 가능, 회전 불필요
[ ] NEXT_PUBLIC_SUPABASE_ANON_KEY     ← 공개 가능, 회전 불필요 (RLS 의존)
[ ] SUPABASE_SERVICE_ROLE_KEY         ← 회전 필수 — DB 우회 권한
[ ] SUPABASE_ACCESS_TOKEN             ← 회전 필수 — Management API
[ ] ANTHROPIC_API_KEY                 ← 회전 필수 — 비용 폭주 가능
[ ] VAPID_PUBLIC_KEY / PRIVATE_KEY    ← 회전 시 모든 푸시 구독 재등록 필요
[ ] VAPID_SUBJECT                     ← 정보만, 회전 불필요
[ ] NAVER_CLIENT_ID / SECRET          ← 회전 필수 — 사용자 사칭 위험
[ ] GOOGLE_CLIENT_ID / SECRET         ← 회전 필수 — Google OAuth (admin Q&A 추출)
[ ] PUSH_WEBHOOK_SECRET               ← 회전 필수 — Supabase webhook 인증
```

각 시크릿별로 아래 § 2 절차를 수행.

## 2. 시크릿별 회전 절차

### 2-A. SUPABASE_SERVICE_ROLE_KEY

1. Supabase Dashboard → Project Settings → API → `service_role` 키 옆 **Regenerate**.
2. 새 키 복사. **이전 키는 즉시 무효.**
3. Vercel Dashboard → Project Settings → Environment Variables → `SUPABASE_SERVICE_ROLE_KEY` 갱신 (Production / Preview / Development 모두).
4. 로컬 `.env.local` 갱신.
5. Vercel 재배포 트리거 (다음 git push 시 자동 또는 수동 redeploy).
6. 배포 완료 후 핵심 API(예: `/api/cards`) 200 확인.

### 2-B. SUPABASE_ACCESS_TOKEN

1. Supabase Account → Access Tokens → 노출된 토큰 **Revoke**.
2. **Generate new token** → 새 토큰 복사.
3. `.env.local` + Vercel env 갱신.
4. (CI 사용 시) GitHub Actions Secrets 갱신.

### 2-C. ANTHROPIC_API_KEY

1. console.anthropic.com → API Keys → 노출된 키 **Delete**.
2. 새 키 생성 → 사용량 한도 설정 권고($/day cap).
3. `.env.local` + Vercel env 갱신.
4. 즉시 사용량 모니터링 — 비정상 호출 발견 시 Anthropic 지원에 신고.

### 2-D. VAPID 키 쌍

1. 로컬에서 신규 생성:
   ```bash
   npx web-push generate-vapid-keys
   ```
2. `.env.local` + Vercel env 의 `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` 갱신.
3. **주의**: 공개 키가 바뀌면 **모든 기존 푸시 구독 무효화**. 사용자 재구독 필요.
4. `push_subscriptions` 테이블 truncate 또는 user에게 재구독 안내.

### 2-E. NAVER_CLIENT_SECRET

1. developers.naver.com → 내 애플리케이션 → `Client Secret` **재발급**.
2. `.env.local` + Vercel env 갱신.
3. Naver OAuth 로그인 즉시 테스트.

### 2-F. GOOGLE_CLIENT_SECRET

1. console.cloud.google.com → APIs & Services → Credentials → OAuth 2.0 Client → **Reset Secret**.
2. `.env.local` + Vercel env 갱신.

### 2-G. PUSH_WEBHOOK_SECRET (Supabase webhook 인증)

1. 신규 64-byte 시크릿 생성:
   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```
2. Supabase Vault `rotate_push_webhook_secret(<new_secret>)` RPC 실행 (마이그레이션 0120 참고).
3. Vercel env 의 `PUSH_WEBHOOK_SECRET` 갱신.
4. `/api/push/send` 에 신규 시크릿으로 ping → 200 확인. 옛 시크릿 → 403 확인.

## 3. 무효화 검증

각 시크릿 회전 후 옛 키로 API 호출 시 401/403 응답 확인.

## 4. git history 처리

git log 또는 commit diff 에 시크릿이 잔존하면:
- **public repo 인 경우**: 시크릿은 이미 영구 노출로 간주. 회전이 유일한 대응.
- **private repo 라도**: `git filter-repo` 또는 BFG Repo-Cleaner 로 히스토리 재작성 검토.
  - 단, force push 는 협업자 모두 영향. 신중.
- 자체 정규식 스캔: `git log -p | grep -E '(sk-ant-|sbp_|eyJhbGc)'`.

## 5. 사용자 통지 (PIPA 제34조)

다음 중 하나에 해당하면 **72시간 이내** PIPC/KISA(privacy.go.kr) 신고 + 정보주체 통지:
- 1천 명 이상 정보주체 정보 유출
- 민감정보(건강정보 — 피부타입 등) / 고유식별정보 유출
- 외부 불법접근에 의한 유출

본 사고가 시크릿 회전만으로 막을 수 있는 단계라면(실제 DB row 유출 없음) 통지 의무 불발생.
DB 유출 흔적이 있으면 즉시 변호사 자문 + 신고.

## 6. 사후 기록

`SECURITY.md` 끝부분에 사고 요약 추가:
- 발견 일시 / 회전 일시
- 영향 시크릿 목록
- 무효화 검증 결과
- 재발 방지 대책 (예: pre-commit 훅 보강, 코드 리뷰 강화)

## 부록 — 회전 비용 / 영향 빠른 참조

| 시크릿 | 회전 비용 | 사용자 영향 |
|---|---|---|
| SUPABASE_SERVICE_ROLE_KEY | 낮음 | 없음 (배포 직후) |
| SUPABASE_ACCESS_TOKEN | 낮음 | 없음 |
| ANTHROPIC_API_KEY | 낮음 | 없음 (admin 도구만 영향) |
| VAPID 키 쌍 | 중간 | **모든 푸시 구독 무효** |
| NAVER / GOOGLE_CLIENT_SECRET | 낮음 | 없음 |
| PUSH_WEBHOOK_SECRET | 낮음 | 없음 |
