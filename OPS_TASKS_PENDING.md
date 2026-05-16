# 운영 작업 대기 목록 (수동 실행 필요)

> 코드 cleanup은 완료. 다음 작업은 production 환경 접근이 필요하므로 별도 운영 시점에 진행.

---

## 1. push_subscriptions endpoint hostname 통계 확인 후 화이트리스트 적용

### 현재 상태
- `/api/push/subscribe` 가 임의 hostname endpoint 수락 중 (이론적 위험).
- 실제 브라우저들은 fcm/mozilla/windows 셋 중 하나만 사용.

### 실행 순서

#### Step 1: 현재 endpoint 통계 조회 (Supabase SQL Editor)
```sql
SELECT
  split_part(split_part(endpoint, '://', 2), '/', 1) AS host,
  count(*)
FROM push_subscriptions
GROUP BY host
ORDER BY count DESC;
```

#### Step 2: 결과에 나타난 호스트만 화이트리스트로 코드에 추가
일반적으로 다음 3종이 나타남:
- `fcm.googleapis.com` (Chrome / Android)
- `updates.push.services.mozilla.com` (Firefox)
- `*.notify.windows.com` (Edge)
- `*.push.apple.com` (Safari macOS / iOS 16+)

#### Step 3: 화이트리스트 코드 추가
`src/app/api/push/subscribe/route.ts` 의 endpoint 검증 부분에 hostname 검사 로직 추가
(통계 확인 후 정확한 도메인 목록을 확정해서 PR 작성)

### 위험
- 화이트리스트를 너무 좁게 잡으면 **신규 사용자 푸시 등록 실패** 발생
- 반드시 Step 1 결과 기반으로 결정

---

## 2. 0086 webhook secret 폐기 검증 + 새 키 발급 (필요 시)

### 현재 상태
- `0086_push_webhook_trigger.sql` 의 평문 secret 은 0103 에서 vault 로 이관됨
- 이미 폐기 완료라고 추정되나 production 검증 필요
- `SECURITY.md` 에 기록됨

### 실행 순서

#### Step 1: Supabase Vault 의 현재 secret 확인
```sql
-- vault 에서 push_webhook_secret 조회
SELECT name, length(decrypted_secret) AS len
FROM vault.decrypted_secrets
WHERE name = 'push_webhook_secret';
```

#### Step 2: 0086 노출값과 일치하는지 확인
일치 여부를 코드/터미널에서 비교. **일치하면 즉시 로테이션.**

```sql
-- 새 secret 생성 (32 bytes hex)
SELECT vault.create_secret(
  encode(gen_random_bytes(32), 'hex'),
  'push_webhook_secret_new'
);
```

#### Step 3: 3곳 동시 업데이트 (순서 중요)
1. **Vercel env**: `PUSH_WEBHOOK_SECRET` 값을 새 secret 으로
2. **Supabase DB Webhook 설정**: notification INSERT webhook 의 `x-pibutenten-push-secret` 헤더값 갱신
3. **Vault**: 기존 secret 삭제, 새 secret 이름을 `push_webhook_secret` 으로 변경

#### Step 4: 검증
- 테스트 알림 1건 발송 → push 수신 확인
- `push_errors` 테이블에 401/403 미발생 확인

### 위험
- 3곳 순서가 어긋나면 **1~2분간 push 알림 다운**. 새벽 시간대 작업 권장.

---

## 3. notifications 테이블 스키마 확인 (qa_id vs card_id)

### 실행
```sql
\d notifications
```

또는:
```sql
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'notifications'
ORDER BY ordinal_position;
```

### 확인 사항
- `card_id` 컬럼 있는지 (0073 에서 추가됐는지)
- `qa_id` 컬럼이 잔존하는지

### 후속 조치 (결과에 따라)
- `qa_id` 만 있고 코드는 `card_id` 참조 → rename 마이그레이션 필요 (운영 위험)
- 둘 다 있음 → `qa_id` 폐기 마이그레이션
- `card_id` 만 있음 → 정상, 조치 불필요

이 항목은 결과 확인 후 별도 결정.

---

## 4. 거대 에디터 통합 (WriteClient + admin EditClient → CardEditorBase)

### 현재 상태
- `src/app/write/WriteClient.tsx` — 933줄
- `src/app/admin/cards/[id]/edit/EditClient.tsx` — 773줄
- 둘의 도메인 약 90% 중복 (MarkdownBoldEditor + 카테고리 + 키워드 + pubmed_refs + 외부 URL preview)
- `src/app/write/[shortcode]/EditClient.tsx` (189줄, 회원 글 수정) 은 기능 축소판이라 별개 유지 가능

### 권장 절차 (별도 PR 단계 분리)
1. 공통 hook `useCardEditorState()` 우선 추출 (state 관리만)
2. UI sub-component 단계적 분리 (CategorySelector / KeywordsEditor / PubmedRefsEditor / ExternalUrlPreview)
3. `CardEditorBase` 컨테이너로 최종 통합
4. write/admin 페이지는 thin wrapper

### 위험
- 핵심 사용자 흐름 (글쓰기). 깨지면 즉시 사용자 피드백
- 새벽/오프피크 배포 권장
- 각 단계 별도 PR + 글쓰기/admin 수정 양쪽 회귀 테스트

---

## 5. HMAC 쿠키 서명 (`pibutenten_onboarded`) — **보류**

### 결정 사유 (2026-05-17)
- 쿠키는 fast-path 캐시 마커. 위변조 시 미들웨어 통과 → RSC 단 supabase getUser() 가 재검증 → 진짜 보호 레이어 있음
- 트래픽 작은 사이트에서 HMAC 추가 효과 marginal
- **변경 비용 큼**: 키 교체 시 모든 기존 사용자 쿠키 무효화 → 강제 재로그인
- defense-in-depth 측면에서 가치는 있으나 ROI 낮음

### 향후 적용 시점
- 트래픽이 늘어 fast-path 의존도 커지거나
- security audit 권고 시
- 키 교체 절차/사용자 안내 미리 준비 후 적용

---

## 6. CSP enforce 전환 — **보류 (SEO 우선 정책)**

### 결정 (2026-05-17)
- production / development 모두 `Content-Security-Policy-Report-Only` 유지
- 결정 사유:
  - enforce 시 GoogleBot 이 CSP 로 차단된 리소스를 못 읽어 **SEO 풍부도(structured data, 이미지, 임베드) 영향 가능성**
  - 본 사이트는 SEO 가 핵심 채널이라 SEO 리스크가 보안 ROI 보다 우선
- Report-Only 모드는 위반 로그 수집은 계속됨 — 향후 정책 보완에 활용 가능

### 보완 보안 레이어 (enforce 없이도 enforce 되는 항목)
- `X-Frame-Options: DENY` — 클릭재킹 방어 (CSP 와 별개로 동작)
- `X-Content-Type-Options: nosniff`
- `Strict-Transport-Security` — HTTPS 강제
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy` — geolocation/microphone/camera 비활성

### 향후 재검토 시점
- 의료 정보 보안 audit 요구 발생 시
- 트래픽 증가 + XSS 공격 시도 패턴 감지 시
- 그때는 nonce 기반 CSP 도입 + GoogleBot User-Agent 예외 처리 검토
