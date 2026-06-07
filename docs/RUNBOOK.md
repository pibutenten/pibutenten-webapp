# 운영 매뉴얼 (RUNBOOK)

운영자가 수동으로 수행해야 하는 절차들을 한 곳에 모은 단일 문서. 사고 대응·정기 작업·운영 대기 큐 모두 포함.

---

## 목차

1. [push_subscriptions endpoint hostname 화이트리스트 적용](#1-push_subscriptions-endpoint-hostname-화이트리스트-적용)
2. [0086 webhook secret 폐기 검증](#2-0086-webhook-secret-폐기-검증)
3. [notifications 테이블 스키마 확인](#3-notifications-테이블-스키마-확인)
4. [의료진(doctor) 계정 등록 SOP](#4-의료진doctor-계정-등록-sop)
5. [시크릿 사고 대응 (Secret Rotation)](#5-시크릿-사고-대응-secret-rotation)
6. [보류 항목 결정 기록](#6-보류-항목-결정-기록)
7. [태그 사전 운영 (스냅샷 재생·마이그)](#7-태그-사전-운영-스냅샷-재생마이그)
8. [배포 운영 — 프리뷰 env · 카나리 · 캐시](#8-배포-운영--프리뷰-env--카나리--캐시-v-phase-2026-06-07)

---

## 1. push_subscriptions endpoint hostname 화이트리스트 적용

### 현재 상태
- `/api/push/subscribe` 가 임의 hostname endpoint 수락 중 (이론적 위험).
- 실제 브라우저들은 fcm/mozilla/windows/apple 셋 중 하나만 사용.

### Step 1: 현재 endpoint 통계 조회 (Supabase SQL Editor)
```sql
SELECT
  split_part(split_part(endpoint, '://', 2), '/', 1) AS host,
  count(*)
FROM push_subscriptions
GROUP BY host
ORDER BY count DESC;
```

### Step 2: 결과에 나타난 호스트만 화이트리스트로 코드에 추가
일반적으로 다음 4종이 나타남:
- `fcm.googleapis.com` (Chrome / Android)
- `updates.push.services.mozilla.com` (Firefox)
- `*.notify.windows.com` (Edge)
- `*.push.apple.com` (Safari macOS / iOS 16+)

### Step 3: 화이트리스트 코드 추가
`src/app/api/push/subscribe/route.ts` 의 endpoint 검증 부분에 hostname 검사 로직 추가. 통계 확인 후 정확한 도메인 목록을 확정해서 PR 작성.

### 위험
- 화이트리스트를 너무 좁게 잡으면 **신규 사용자 푸시 등록 실패**.
- 반드시 Step 1 결과 기반으로 결정.

---

## 2. 0086 webhook secret 폐기 검증

### 현재 상태
- `0086_push_webhook_trigger.sql` 의 평문 secret 은 0103 에서 vault 로 이관됨.
- 이미 폐기 완료라고 추정되나 production 검증 필요.
- `SECURITY.md` 에 기록됨.

### Step 1: Supabase Vault 의 현재 secret 확인
```sql
SELECT name, length(decrypted_secret) AS len
FROM vault.decrypted_secrets
WHERE name = 'push_webhook_secret';
```

### Step 2: 0086 노출값과 일치하는지 확인
일치 여부 비교. **일치하면 즉시 로테이션.**

```sql
SELECT vault.create_secret(
  encode(gen_random_bytes(32), 'hex'),
  'push_webhook_secret_new'
);
```

### Step 3: 3곳 동시 업데이트 (순서 중요)
1. **Vercel env**: `PUSH_WEBHOOK_SECRET` 값을 새 secret 으로
2. **Supabase DB Webhook 설정**: notification INSERT webhook 의 `x-pibutenten-push-secret` 헤더값 갱신
3. **Vault**: 기존 secret 삭제, 새 secret 이름을 `push_webhook_secret` 으로 변경

### Step 4: 검증
- 테스트 알림 1건 발송 → push 수신 확인
- `push_webhook_errors` 테이블에 401/403 미발생 확인

### 위험
- 3곳 순서가 어긋나면 **1~2분간 push 알림 다운**. 새벽 시간대 작업 권장.

---

## 3. notifications 테이블 스키마 확인

### 실행
```sql
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'notifications'
ORDER BY ordinal_position;
```

### 확인 사항
- `card_id` / `comment_id` 컬럼 존재 여부

### 현 상태 (2026-06-05 확인 완료)
- notifications 실제 컬럼 = `card_id` + `comment_id`. **`qa_id` 는 부재** (cards 리네임 0171 반영 완료). 정상, 조치 불필요.
- (옛 `qa_id` 잔존 점검 항목은 해소됨 — 위 점검 SQL 은 회귀 의심 시에만 재실행.)

---

## 4. 의료진(doctor) 계정 등록 SOP

> 의료법 §27 (의료인 자격 사칭) 및 §57 (의료광고 사전심의) 방어
> 마지막 업데이트: 2026-05-19

### 4.1. 원칙

피부텐텐의 doctor 권한(`profiles.role = 'doctor'`)은 **운영자가 직접 등록**합니다. 일반 회원이 어떠한 방법(가입 옵션, 자기 신고, 소셜 로그인 등)으로도 doctor 권한을 획득할 수 없습니다.

**구조적 방어**:
- 의료법 §27 — 의료인 자격 사칭 차단
- 의료광고 자율심의(의협 의료광고심의위) 대응 — 게시자 신원 명확화
- E-E-A-T / YMYL 신뢰 신호 — 면허된 전문가 작성·검수 명시

이 정책은 `src/app/about/page.tsx` 의 "콘텐츠 정책 > 의료진 등록" 섹션에 외부 공개되어 있습니다.

### 4.2. 신규 등록 절차

#### Step 1 — 사전 확인 (운영자)

1. **면허번호 확인**
   - 보건복지부「의료인 면허 조회」: <https://www.mohw.go.kr> → 의료인 검색
   - 또는 의료기관 홈페이지 / 명함 / 학회 프로필
   - 면허번호·전문과목·소속을 SOP 기록부에 기재

2. **본인 동의 확보** (서면 또는 이메일)
   - 본인 이름·프로필 사진 공개
   - 의사 답변 가이드라인(`/doctor-guidelines`) 준수
   - 의료광고법 §56·§57 위반 시 게시물 즉시 삭제 동의
   - 향후 의료광고 사전심의 도입 시 협조

3. **신원 일치 확인**
   - 면허번호상 의사와 동의한 사람이 같은 인물인지 확인
   - 의심 시 의료기관·학회를 통한 추가 확인

#### Step 2 — DB 등록 (운영자)

1. **doctor 카드(공개용 프로필) 생성**
   - `/admin/doctors` 에서 신규 doctor 추가 (slug, 이름, 소속, 사진)

2. **회원 계정과 매핑**
   - 해당 의료인이 피부텐텐에 가입 (Google/Kakao/Naver 중 1개)
   - `/admin/users` 에서 해당 회원의 `role` 을 `doctor` 로 변경
   - `/admin/users` 의 doctor 매핑 UI 에서 본인 doctor 카드와 연결

3. **묶음(bundle) 검증**
   - 동일 의사가 여러 채널(예: Google + Naver)로 가입한 경우 묶음 자동 통합되는지 확인

#### Step 3 — 기록 보관 (SOP 기록부)

각 의사 등록마다 다음을 별도 안전 보관 (외부 공개 금지):

```
- 등록일:
- 의사 성명:
- 면허번호:
- 전문과목:
- 소속 의료기관:
- 보건복지부 면허 조회 캡쳐: (스크린샷 파일 첨부)
- 동의 방식: (서면 / 이메일 / 카톡)
- 동의일:
- 피부텐텐 회원 가입 이메일:
- profiles.id (UUID):
- 매핑된 doctors.slug:
- 운영자 확인자:
```

보관 위치 권고: 운영자 클라우드 보안 폴더 또는 1Password Notes 등 접근 통제된 곳. PII 포함이므로 일반 공유 폴더·이메일 본문 금지.

### 4.3. 의사 권한 박탈 절차

#### 박탈 사유
- 면허 정지·취소
- 의료법 §27 환자 유인 알선 적발
- 의료광고법 §56·§57 위반 게시물 반복 게시
- 해당 의료인 본인 요청 (탈퇴 또는 권한 반환)

#### 절차
1. `/admin/users` 에서 해당 회원 `role` 을 `user` 로 변경
2. `/admin/doctors` 에서 doctor 카드를 비공개(또는 삭제)
3. 본인 명의 게시물에 대해 본인 의사 확인 후 보존·익명화 선택
4. SOP 기록부에 박탈일·사유 추가 기재

### 4.4. 분기 점검
- 분기 1회: 등록된 모든 의사 계정의 면허 유효성 재확인 (보건복지부 조회)
- 분기 1회: doctor 매핑 일관성 검사 — `/admin/users` 와 `/admin/doctors` 매칭 누락·중복 확인

### 4.5. 관련 정책 문서
- 외부 공개: `src/app/about/page.tsx` (콘텐츠 정책 > 의료진 등록)
- 의사 답변 가이드라인: `src/app/doctor-guidelines/page.tsx`
- 처리방침: `src/app/privacy/page.tsx`
- 이용약관: `src/app/terms/page.tsx`

---

## 5. 시크릿 사고 대응 (Secret Rotation)

> 시크릿이 외부에 노출되었을 가능성이 발견되었을 때의 대응 절차.
> 평시 정기 로테이션은 비용 대비 효과 낮아 운영하지 않음 — 사고 시점에만 본 절차로 처리.

### 5.0. 노출 의심 트리거

다음 중 하나가 발생했을 때 본 절차를 즉시 시작합니다:
- git 커밋 히스토리에서 시크릿 발견
- `scripts/secret-scan.js` pre-commit 훅이 우회된 commit 발견
- Vercel logs / Supabase logs / Sentry 에서 시크릿 값 출력 확인
- 노트북 도난 / 운영자 PC 침해
- 협력사 / 외부 공유 채널(슬랙·이메일)에 실수로 시크릿 평문 전송
- API 콘솔(Anthropic / Supabase / Naver)에서 비정상 사용량 알림

### 5.1. 영향 범위 식별

```
영향 시크릿 목록 (.env.local 기준):
[ ] NEXT_PUBLIC_SUPABASE_URL          ← 공개 가능, 회전 불필요
[ ] NEXT_PUBLIC_SUPABASE_ANON_KEY     ← 공개 가능, 회전 불필요 (RLS 의존)
[ ] SUPABASE_SERVICE_ROLE_KEY         ← 회전 필수 — DB 우회 권한
[ ] SUPABASE_ACCESS_TOKEN             ← 회전 필수 — Management API
[ ] ANTHROPIC_API_KEY                 ← 회전 필수 — 비용 폭주 가능
[ ] VAPID_PUBLIC_KEY / PRIVATE_KEY    ← 회전 시 모든 푸시 구독 재등록 필요
[ ] NAVER_CLIENT_ID / SECRET          ← 회전 필수 — 사용자 사칭 위험
[ ] GOOGLE_CLIENT_ID / SECRET         ← 회전 필수 — Google OAuth (admin Q&A 추출)
[ ] PUSH_WEBHOOK_SECRET               ← 회전 필수 — Supabase webhook 인증
```

각 시크릿별로 아래 §5.2 절차를 수행합니다.

### 5.2. 시크릿별 회전 절차

#### 5.2-A. SUPABASE_SERVICE_ROLE_KEY
1. Supabase Dashboard → Project Settings → API → `service_role` 키 옆 **Regenerate**
2. 새 키 복사. **이전 키는 즉시 무효.**
3. Vercel Dashboard → Environment Variables → `SUPABASE_SERVICE_ROLE_KEY` 갱신 (Production / Preview / Development)
4. 로컬 `.env.local` 갱신
5. Vercel 재배포 트리거 (다음 git push 시 자동 또는 수동 redeploy)
6. 배포 완료 후 핵심 API(예: `/api/cards`) 200 확인

#### 5.2-B. SUPABASE_ACCESS_TOKEN
1. Supabase Account → Access Tokens → 노출된 토큰 **Revoke**
2. **Generate new token** → 새 토큰 복사
3. `.env.local` + Vercel env 갱신
4. (CI 사용 시) GitHub Actions Secrets 갱신

#### 5.2-C. ANTHROPIC_API_KEY
1. console.anthropic.com → API Keys → 노출된 키 **Delete**
2. 새 키 생성 → 사용량 한도 설정 권고 ($/day cap)
3. `.env.local` + Vercel env 갱신
4. 즉시 사용량 모니터링 — 비정상 호출 발견 시 Anthropic 지원에 신고

#### 5.2-D. VAPID 키 쌍
1. 로컬에서 신규 생성: `npx web-push generate-vapid-keys`
2. `.env.local` + Vercel env 의 `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` 갱신
3. **주의**: 공개 키가 바뀌면 **모든 기존 푸시 구독 무효화**. 사용자 재구독 필요
4. `push_subscriptions` 테이블 truncate 또는 user에게 재구독 안내

#### 5.2-E. NAVER_CLIENT_SECRET
1. developers.naver.com → 내 애플리케이션 → `Client Secret` **재발급**
2. `.env.local` + Vercel env 갱신
3. Naver OAuth 로그인 즉시 테스트

#### 5.2-F. GOOGLE_CLIENT_SECRET
1. console.cloud.google.com → APIs & Services → Credentials → OAuth 2.0 Client → **Reset Secret**
2. `.env.local` + Vercel env 갱신

#### 5.2-G. PUSH_WEBHOOK_SECRET
1. 신규 64-byte 시크릿 생성: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
2. Supabase Vault `rotate_push_webhook_secret(<new_secret>)` RPC 실행 (마이그레이션 0120)
3. Vercel env 의 `PUSH_WEBHOOK_SECRET` 갱신
4. `/api/push/send` 에 신규 시크릿으로 ping → 200 확인. 옛 시크릿 → 403 확인

### 5.3. 무효화 검증
각 시크릿 회전 후 옛 키로 API 호출 시 401/403 응답 확인.

### 5.4. git history 처리
- **public repo**: 시크릿은 이미 영구 노출로 간주. 회전이 유일한 대응
- **private repo**: `git filter-repo` 또는 BFG Repo-Cleaner 로 히스토리 재작성 검토
  - force push 는 협업자 모두 영향. 신중
- 자체 정규식 스캔: `git log -p | grep -E '(sk-ant-|sbp_|eyJhbGc)'`

### 5.5. 사용자 통지 (PIPA 제34조)
다음 중 하나에 해당하면 **72시간 이내** PIPC/KISA(privacy.go.kr) 신고 + 정보주체 통지:
- 1천 명 이상 정보주체 정보 유출
- 민감정보(건강정보 — 피부타입 등) / 고유식별정보 유출
- 외부 불법접근에 의한 유출

본 사고가 시크릿 회전만으로 막을 수 있는 단계라면(실제 DB row 유출 없음) 통지 의무 불발생. DB 유출 흔적이 있으면 즉시 변호사 자문 + 신고.

### 5.6. 사후 기록
`SECURITY.md` 끝부분에 사고 요약 추가:
- 발견 일시 / 회전 일시
- 영향 시크릿 목록
- 무효화 검증 결과
- 재발 방지 대책 (예: pre-commit 훅 보강, 코드 리뷰 강화)

### 5.7. 회전 비용 / 영향 빠른 참조

| 시크릿 | 회전 비용 | 사용자 영향 |
|---|---|---|
| SUPABASE_SERVICE_ROLE_KEY | 낮음 | 없음 (배포 직후) |
| SUPABASE_ACCESS_TOKEN | 낮음 | 없음 |
| ANTHROPIC_API_KEY | 낮음 | 없음 (admin 도구만 영향) |
| VAPID 키 쌍 | 중간 | **모든 푸시 구독 무효** |
| NAVER / GOOGLE_CLIENT_SECRET | 낮음 | 없음 |
| PUSH_WEBHOOK_SECRET | 낮음 | 없음 |

---

## 6. 보류 항목 결정 기록

### 6.1. 거대 에디터 통합 (Phase 4b/4c)
**상태**: Phase 4a 완료 (2026-05-18). Phase 4b/4c 는 `ROADMAP.md` Next 섹션에서 추적.

### 6.2. HMAC 쿠키 서명 (`pibutenten_onboarded`) — 보류

**결정 사유** (2026-05-17):
- 쿠키는 fast-path 캐시 마커. 위변조 시 미들웨어 통과 → RSC 단 supabase getUser() 가 재검증 → 진짜 보호 레이어 있음
- 트래픽 작은 사이트에서 HMAC 추가 효과 marginal
- **변경 비용 큼**: 키 교체 시 모든 기존 사용자 쿠키 무효화 → 강제 재로그인
- defense-in-depth 측면에서 가치는 있으나 ROI 낮음

**향후 적용 시점**:
- 트래픽이 늘어 fast-path 의존도 커지거나
- security audit 권고 시
- 키 교체 절차/사용자 안내 미리 준비 후 적용

### 6.3. CSP enforce 전환 — 보류 (SEO 우선 정책)

**결정** (2026-05-17):
- production / development 모두 `Content-Security-Policy-Report-Only` 유지
- enforce 시 GoogleBot 이 CSP 로 차단된 리소스를 못 읽어 **SEO 풍부도(structured data, 이미지, 임베드) 영향 가능성**
- 본 사이트는 SEO 가 핵심 채널이라 SEO 리스크가 보안 ROI 보다 우선
- Report-Only 모드는 위반 로그 수집은 계속됨 — 향후 정책 보완에 활용 가능

**보완 보안 레이어** (enforce 없이도 enforce 되는 항목):
- `X-Frame-Options: DENY` — 클릭재킹 방어 (CSP 와 별개)
- `X-Content-Type-Options: nosniff`
- `Strict-Transport-Security` — HTTPS 강제
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy` — geolocation/microphone/camera 비활성

**향후 재검토 시점**:
- 의료 정보 보안 audit 요구 발생 시
- 트래픽 증가 + XSS 공격 시도 패턴 감지 시
- 그때는 nonce 기반 CSP 도입 + GoogleBot User-Agent 예외 처리 검토

---

## 7. 태그 사전 운영 (스냅샷 재생·마이그)

SSOT = DB `tag_dictionary`(+`tag_blacklist`·`tag_normalization`). 코드는 빌드타임 스냅샷 `src/data/tag-dictionary.generated.json` 을 읽음(상세 ARCHITECTURE §10, TECH_SPEC §6.9).

### 7.1. 사전 변경 → 사이트 반영 절차
1. DB 수정 — 관리자 `/admin/tags`(인라인·개명·병합) 또는 마이그/Management API(대량).
2. **스냅샷 재생**: 로컬 `node scripts/gen-tag-dictionary.mjs` (DB anon REST 로 읽어 generated.json 산출). `npm run build` 의 prebuild 가 자동 실행하므로, **배포(=Vercel 빌드)되면 자동 반영**.
3. 커밋: generated.json 변경분 포함(타임스탬프만 바뀐 경우 `git checkout -- src/data/tag-dictionary.generated.json` 로 제외).
4. 즉시성: 글 저장 흡수·정규화(트리거)는 DB 라 **즉시**. categoryFor/slugFor/auto-tag(스냅샷)는 **다음 배포** 반영.

### 7.2. 마이그 적용 (Management API)
```bash
curl -s -X POST "https://api.supabase.com/v1/projects/$SUPABASE_PROJECT_REF/database/query" \
  -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" -H "Content-Type: application/json" \
  --data-binary @migration.json   # {"query":"...SQL..."} (한글·정규식은 python json.dumps 로 파일 생성 후 --data-binary)
```
- 병합·삭제 같은 파괴적 변경은 **비파괴 실증 선행**(DO 블록 + `RAISE EXCEPTION` 롤백)으로 영향 확인 후 적용.
- service_role 은 RLS 우회하나 **테이블 GRANT 는 별도 필요**(마이그 0252 교훈) — 새 테이블 추가 시 `GRANT ... TO service_role` 누락 주의.

### 7.3. 자동추천 큐레이션(`is_recommendable`)
- auto-tag(회원 무료) 후보 = `is_recommendable=true`(현 804). 신규 태그 기본 false → 노이즈 차단.
- 추천 편입은 현재 SQL `UPDATE tag_dictionary SET is_recommendable=true WHERE ko = ANY(...)` 로 수행(관리 화면 토글은 제거됨, 향후 거버넌스 별도). 편입 후 스냅샷 재생(7.1)으로 반영.

---

## 8. 배포 운영 — 프리뷰 env · 카나리 · 캐시 (V-Phase 2026-06-07)

### 8.1. 프리뷰 env 누락 → 미들웨어 500 (해소 완료)
- **증상**: Vercel 프리뷰 배포에서 전 페이지 500 `MIDDLEWARE_INVOCATION_FAILED` — 미들웨어가 `createServerClient(NEXT_PUBLIC_SUPABASE_URL!, ...ANON_KEY!)` 를 `undefined` 로 호출(`Your project's URL and Key are required`).
- **원인**: 두 env 가 **dev + prod 스코프만** 설정 → Preview 환경엔 미주입. (프로덕션·로컬은 정상이라 못 보던 갭.)
- **조치(완료)**: Vercel Project → Settings → Environment Variables 에서 `NEXT_PUBLIC_SUPABASE_URL`·`NEXT_PUBLIC_SUPABASE_ANON_KEY` 를 **Preview 스코프에도 추가**(prod 와 동일 공개값. anon key 는 RLS 보호 공개키라 저위험). 추가 후 프리뷰 재배포.
- **교훈**: 새 env 추가 시 **dev/preview/prod 3스코프** 모두 확인.

### 8.2. 배포 후 카나리 (관행 채택)
- 캐싱·렌더링·미들웨어처럼 **프로덕션에서만 드러나는 결함**(예: 한글 URL ISR 헤더 깨짐)이 있으므로, 배포 직후 **최위험 URL 1개를 즉시 점검**한다.
- 예: `curl -sI https://pibutenten.kr/topics/콜라겐`(URL인코딩) → 200 확인. 상세는 `x-vercel-cache` HIT 확인. 500 발견 시 즉시 롤백(8.3).
- V3 배포 시 이 카나리로 토픽 500 을 즉시 포착·복구한 사례.

### 8.3. 롤백
- **방법 A (즉시)**: Vercel 대시보드 → Deployments → 직전 정상 배포 **Promote to Production**(재빌드 없음).
- **방법 B (이력 명시)**: `git revert <commit> && git push`.
- **V-Phase 롤백 커밋**: 카운트 라이브 `fdaa6fa` · 홈 CLS `7fd86ce` · (V3 전체 되돌리려면 상세 ISR 도입 머지 `6170738`). 전부 클라/캐시 한정이라 저위험.

### 8.4. 캐시 무효화 (수동)
- 상세 ISR 은 콘텐츠 변경 라우트가 `revalidateTag("qa-content","max")` 로 자동 무효화. 그래도 강제 갱신이 필요하면 해당 글을 관리자에서 한 번 저장(PUT `/api/articles/[id]`)하면 동일 태그 무효화 발화.
- **한글 URL + ISR 금지**(ADR 0020 §3): 토픽 등 한글 경로는 절대 ISR(`generateStaticParams`+`revalidate`)로 바꾸지 말 것 — `x-next-cache-tags` 헤더가 깨져 500.

---

**이 문서 변경 시**: 보안 정책·secret 회전 절차 변경은 `SECURITY.md` 와 양쪽 갱신 (CLAUDE.md §5).
