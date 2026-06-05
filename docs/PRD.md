# 피부텐텐 PRD (Product Requirements Document)

> 제품의 **"왜·무엇"** 을 정의하는 문서. 기술 구조는 `ARCHITECTURE.md`, 변경 이력은 `CHANGELOG.md`, 의사결정 근거는 `decisions/` 참조.

---

## 1. 제품 개요

**피부텐텐 (Pibutenten)** — 피부과 전문의가 함께하는 피부 미용 SNS / Q&A 검색 엔진.

- **도메인**: https://pibutenten.kr (구 pbtt.kr → 영구 308 리다이렉트, 폐기 안 함)
- **운영사**: 주식회사 진솔컴퍼니 (pibutenten@gmail.com)
- **YouTube**: https://www.youtube.com/@pibutenten

---

## 2. 핵심 가치 제안

> "피부과 전문의가 직접 답하는 리프팅 · 스킨부스터 · 안티에이징 · 피부시술 커뮤니티"

- 일반 사용자의 피부 고민 → **검증된 피부과 전문의 답변** 검색 가능
- 피부과 전문의 답변·칼럼 → **SEO 최적화로 자연 유입 확보**
- 일반 회원의 피부 일기·시술 후기 → **커뮤니티 형 데이터 축적**
- YouTube 영상 → AI 추출 Q&A 카드 → 검색 가능한 형태로 재배포

---

## 3. 사용자 페르소나

### 3.1. 일반 회원 (user)
- 피부 고민/시술 질문 작성, 다른 회원/원장 답변 검색
- 피부 일기, 시술 후기, 외부 글 공유
- 카테고리: `doodle` (끄적끄적) — 일반 포스팅 단일 카테고리 (P2, 2026-06-01 통합)

### 3.2. 피부과 전문의 (doctor)
- Q&A 답변, 칼럼 작성, 회원 질문 검수
- 본인 글의 SEO URL: `/doctors/{slug}/{year}/{post-slug}`
- 같은 사람이 의사 역할 profile + 일반 회원 역할 profile 두 신분으로 동등하게 활동 가능 (같은 auth_user_id 묶음, 위계 없음, ADR 0001)
- 카테고리: `qa` (Q&A) 추가 작성 권한 (의사·관리자 전용, 인덱싱)

### 3.3. 관리자 (admin)
- 운영 전반: 카드/댓글/회원 관리, AI 글 초안 생성, KPI 대시보드
- AI 글 초안 워크플로 (`/admin/draft`): YouTube → 검수 → 발행
- 보안·신고 처리, 콘텐츠 자동 검수 결과 대응

---

## 4. 핵심 기능

### 4.1. 글 (카드) 시스템
- 통합 테이블 `cards` (구 `qas`, 2026 리네임 — ADR 0004)
- 타입: `qa` (Q&A), `post` (일반 글)
- 카테고리 4종: `qa`(의사 Q&A, index) / `doodle`(일반 '끄적끄적', noindex) / `review`(개별 시술후기, noindex) / `review_summary`(시술 리포트 집계, index) — P3 완료
- 상태: `draft` / `pending_review` / `published` / `hidden` / `archived`
- soft-delete + in-place 익명화 (ADR 0002)
- 외부 링크 OG 카드 첨부, YouTube 영상 시작시간 sync

### 4.2. 검색 / 피드
- 메인 RPC: `search_cards_scored`
- HOT 카드 자동 마킹 (`get_hot_card_ids_v2`)
- 같은 원장 3연속 방지, 첫 4카드 다양화
- 인기 키워드 칩 5탭 (피부고민/리프팅/스킨부스터/홈케어/피부상식)

### 4.3. 시술 후기 & 리포트 (P3)
- 전용 폼: `/review/new`(작성) · `/review/[shortcode]/edit`(수정). 시술 선택(잠금형 탭) + 만족도·통증·재시술 의향(필수) + 효과·생생한 후기(선택). 병원·의사명 자동 마스킹 + 소프트 검수. 수정 진입은 일반 글 에디터가 아닌 후기 전용 에디터로(카드 ⋮·관리자 모두).
- `procedure_reviews`(card_id 1:1)에 정량값 저장. 개별 후기 = noindex.
- **시술 리포트** `/reports/[procedure]`: `procedure_reviews` 를 **실시간 집계**(저장 카드 없음 → 후기 추가 시 자동 반영)한 단일 카드. 만족도(분포)·통증·재시술 의향·체감 효과 + 작성자 성별·연령(집계 RPC, 개별 PII 비노출). index + JSON-LD `MedicalWebPage` + `Service`(additionalType=`MedicalProcedure`) + `AggregateRating`(만족도)·재시술%·통증 + `BreadcrumbList` (의료 시술이라 `Product` 폐기 2026-06-05). 시술명 검색(`/search`) 결과 **최상단** 노출. 정식 URL=`/reports/{ko}`(한글, 영문은 308 전용). **`/topics`(전문의 Q&A 허브)와는 분리** — 자기잠식 방지로 /topics 에 리포트 카드 미노출, 양쪽 얇은 링크만(2026-06-05).

### 4.3. 사용자 시스템 (Identity — ADR 0001, ADR 0011, **ADR 0012**)
- 한 auth user 가 여러 profile row 보유 가능 — 모든 profile 은 **동등하게 독립**. 위계 / "본계·부계" 개념 없음
- 쿠키 기반 active identity 전환
- 모든 인터랙션 (좋아요/저장/댓글/글) 의 `user_id`/`author_id` = active profile.id
- **권한은 현재 active 신분 단위** — RLS / 핵심 함수 (ADR 0011) + TypeScript 가드 / API 라우트 (ADR 0012) 모두 active 단위

**명함 단위 완전 독립 5원칙 (ADR 0012, 2026-05-26)**:
1. 데이터 (글·댓글·좋아요·저장·알림) 는 작성·발생한 명함에만 귀속. 같은 사람의 다른 명함은 접근 불가.
2. 권한 판정은 active 명함만. 묶음 합산 금지 (admin 운영진이 회원 명함이면 admin 페이지 차단).
3. 의사 명함으로 쓴 글 = 의사 글, 회원 명함으로 쓴 글 = 회원 글. 사이에 교차·합산 없음.
4. 묶음 (bundle) 의 유일한 효용은 IdentitySwitcher dropdown + 빠른 전환.
5. 의사 정보 (doctor_id) 는 명함 row 안에 인라인. 별도 매핑 표 (`doctor_accounts`) 직접 조회 점진 폐기.

**사람 ID 컬럼 명명 원칙 (ADR 0014, 2026-05-29)**:
- 사람을 가리키는 ID 는 3계층: `auth.users.id` (로그인 계정, 코드의 `user.id`) / `profiles.id` (명함, 활동 단위) / `profiles.auth_user_id` (묶음 표시, FK 없음).
- `profiles.id` 를 가리키는 컬럼명 규칙: 콘텐츠 책임 주체는 `author_id` (cards, comments), 그 외 명함 소유·행위자는 `profile_id`. `user_id` 는 신규 사용 금지.
- 한 row 안에 명함 ID 가 둘 이상 등장하는 경우만 역할 접두사 (`actor_/recipient_/reporter_/resolved_by`).
- 본 원칙은 즉시 발효. 9개 테이블 컬럼 `user_id` → `profile_id` RENAME 은 Phase 2 (마이그 0186, commit `f8d1c93`) + Phase 3 (마이그 0187, commit `91477c2`) 로 2026-05-29 production 적용 완료 — `cards/comments.author_id` 는 §4 결정에 따라 의도된 유지 (Phase 4 보류).

### 4.4. 온보딩 (필수 게이트)
- 약관 동의 + 생년월일·성별·얼굴형·피부타입 입력 강제
- 14세 미만 차단 (CHECK constraint)
- 중복 가입자 식별 (OAuth provider email 기반 — ADR 0003)
- **게이트 단위 (ADR 0015, 2026-05-29)**: 온보딩 검사는 **active 명함 단위**. middleware / onboarding 페이지 / 댓글 라우트 모두 active 명함 (IDENTITY_COOKIE 기반 + 묶음 보안 검증) 의 birthdate/terms_agreed_at 검사. 묶음 외 ID 는 base fallback. 단 `settings/profile` 페이지의 base-only 읽기는 POLICY-1 잔여 — 별도 안건.
- **묶음 PII 복제 (ADR 0015)**: 첫 명함이 온보딩 완료하면 같은 묶음의 빈 명함에 1회 COALESCE 복제 (NULL 칸만, 의사 멀티 계정 묶음 한정). 복제 후엔 명함별 독립 수정. RPC: `propagate_onboarding_to_doctor_bundle(uuid)`.

### 4.5. 알림 / 푸시
- DB 트리거 → webhook → Web Push (VAPID)
- 댓글·좋아요·저장·답변 알림 채널별 설정

### 4.6. AI 글 초안 (`/admin/draft`)
- Anthropic Claude 기반 2단계 워크플로
- Step 1: YouTube transcript → Q&A 후보 추출
- Step 2: 후보 → Q&A 본문 생성 + PubMed 참고문헌 자동 첨부

### 4.7. 콘텐츠 자동 검수
- 의료법 §56② 14금지 + 약사법 §68 + 환자후기 키워드 사전
- 의사·관리자 자동 통과, 일반 회원만 적용
- 적용 범위: 카드(글) + **댓글** (모두 active 신분의 role 기준, ADR 0012)
- 임계 초과: 카드 `status='pending_review'` / 댓글 `status='hidden'` + 작성자에게 1회 안내 (silent fail 방지)
- 자살/자해 키워드 감지 시 안전 메시지 모달 (109/1577-0199/1388) — 카드 작성·댓글 작성 모두 적용

### 4.8. 운영 모더레이션 (배치 ④, 2026-05-28)
- 운영 화면: `/admin/reports` — 신고 큐 + 액션 2개 + 기각.
- **숨김** (`moderation.hide`): 영구 비공개(`status='hidden'`, 복구가능). 30일 임시조치 폐기 — 기한 제한 없음.
- **완전삭제** (`moderation.delete`, 카드 한정): soft-delete 익명화 (ADR 0002 `soft_delete_card` RPC 재사용).
- **기각** (`moderation.dismiss`): 신고만 처리, 대상 변경 없음.
- 모든 액션 `audit_logs` 적재. 작성자에게 개별 푸시·알림 통지 안 함.
- 숨김된 카드 단일 URL 직접 접근 시 placeholder ("운영정책에 따라 비공개된 게시물입니다") + `noindex`.
- 숨김된 댓글: 일반 viewer 에겐 "(비공개 처리된 댓글입니다)" 한 줄. 본인·admin·doctor 는 본문 + 회색으로 검토 가능.

---

## 5. 비기능 요구사항

### 5.1. 보안
- RLS (행 단위 권한) 전체 적용 (ADR 0006)
- CSRF Origin 검증 (allow-list 좁힘)
- SSRF 가드 (DNS + IPv4/IPv6 사설 대역 + 메타데이터 호스트 + redirect 매 hop)
- 업로드: magic byte 검증 + sharp EXIF 제거 + 8MB 한도
- audit_logs 1년 보관 (민감 API: 회원 탈퇴, 권한 변경, identity 전환)
- 상세 보안 정책: `SECURITY.md`

### 5.2. 개인정보보호 (PIPA)
- 탈퇴 시 soft-delete in-place 익명화 (네이버 카페식, ADR 0002)
- anon 권한 컬럼 화이트리스트 (PII 8개 컬럼 anon SELECT 차단)
- 처리방침 국외이전 표 명시 (Supabase/Vercel/Anthropic/Google/Web Push/PubMed)
- 30일 임시조치 절차 (정통망법 §44조의2)

### 5.3. 의료법 준수
- 의료광고 14금지 자동 검수
- 환자 후기 차단
- 의료 면책 페이지 (`/disclaimer`)
- 처방·진단 행위 금지 안내

### 5.4. SEO · AEO · GEO
- 동적 sitemap, robots, manifest
- **메타 규칙 (2026-06-05 통일)**: title 템플릿 `%s | 피부텐텐` — 콘텐츠 페이지는 주제(키워드) first·브랜드 last, 홈만 brand-first(absolute). title↔description 비중복(title=주제/질문, desc=답변/데이터). desc 에 브랜드 반복 금지, 수치(Q&A수·후기수·만족도·재시술%·전문의수)는 전부 라이브 동적, 최상급·효과 단정·후기 보증 문구 금지. 원장 글 desc 는 본문 문장경계 트림(~150, 단어 중간 잘림 방지).
- OG 메타: 원장님 페이지·단일 글 페이지 모두 `generateMetadata`
- 의사 글 URL: `/doctors/{slug}/{year}/{post-slug}` 키워드 기반 slug
- 회원 글 URL: `/{handle}/{shortcode}` 8자 base58
- **공개 HOLD 스위치** (2026-05-28): `SITE_PUBLIC` 환경변수. `!== "true"` 면 robots fail-safe 전체 차단. 공개는 운영자가 Vercel 환경변수 추가 후 redeploy.
- 공개 시 3-tier AI 크롤러 정책 (학습 차단 / 검색·답변 허용 / 일반 검색 허용)
- RSS: `app/rss.xml/route.ts` — 의사 Q&A 글 최신 50건 (네이버 freshness signal)
- `/.well-known/`: security.txt (RFC 9116) / agent-card.json / ai-policy.json
- llms.txt 풀버전 (llmstxt.org 표준)
- 신뢰 페이지 풀세트 (Mayo/Cleveland Clinic 벤치마크): `/about` · `/editorial-policy` · `/medical-review` · `/corrections` · `/disclosures` · `/disclaimer` · `/doctor-guidelines` · `/contact` · `/terms` · `/privacy`
- CSP report-uri / report-to → `/api/csp-report` endpoint 적재
- 검색엔진 verification 토큰 자리 (env 기반, 발급 후 활성): Naver / Google / Bing

### 5.5. PWA
- manifest.json + Service Worker
- 아이콘 2그룹 구조 (favicon=원형 / OS 아이콘=사각, ADR 0009)
- iOS apple-touch-startup-image, Android native splash 지원

### 5.6. 접근성
- 모바일 우선 PWA (모바일 1단 / 데스크탑 ≥900px 2단, 최대 너비 1080px)
- 한국어 폰트 (Pretendard)
- 시각 대비 WCAG AA 수준 (글자색 4톤, ADR 0010)

---

## 6. 성공 지표 (KPI)

### 6.1. 운영 KPI (관리자 대시보드, 기본 24h)
- 방문자 (1일 1방문 KST dedup, ADR 0010)
- 조회수 (distinct visitor)
- 댓글·좋아요·저장·공유 수
- 신규 회원·신규 카드 수

### 6.2. 비즈니스 KPI
- 베타 기간 (~2026-06-01): 의사 9명 + 회원 ~100명 + 카드 ~2300개
- 공개 후 목표: 월간 DAU 1만 (분기별 재검토)

---

## 7. 제외 범위 (Out of Scope)

- 결제·구독·유료 콘텐츠 (현 무료)
- 실시간 채팅·DM
- 화상 진료·온라인 처방 (의료법상 불가)
- 19금 콘텐츠 차단 기능 (콘텐츠 없음 — 약관 1줄 명시만)
- 광고 시스템 (베타 기간 보류)

---

## 8. 관련 문서

| 영역 | 위치 |
|---|---|
| 시스템 구조 | `ARCHITECTURE.md` |
| DB 스키마 | `DATABASE.md` |
| 기술 명세 (온보딩/검색/키워드/OG/알림/AI) | `TECH_SPEC.md` |
| 배포 절차 | `DEPLOYMENT.md` |
| 향후 계획 | `ROADMAP.md` |
| 변경 이력 | `CHANGELOG.md` |
| 운영 매뉴얼 | `RUNBOOK.md` |
| 보안 | `SECURITY.md` |
| 의사결정 기록 | `decisions/` |
| 점검 보고서 | `reports/` |

---

**이 문서 변경 시**: 라우트·핵심 컴포넌트 변경이 함께 있을 경우 `ARCHITECTURE.md` 도 같이 갱신 (CLAUDE.md §5 동기화 규칙).
