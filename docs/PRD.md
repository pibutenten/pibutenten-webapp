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
- **원장 3토글 모델 (2026-07-05)**: 소속·재직·공개를 독립 관리 — `clinic_id`(근무 지점, 건보 심평원 코드 참조·불변) · `is_affiliated`(재직 여부, 퇴사 시 off) · `is_listed`(공개 페이지 on/off, 퇴사와 독립). **미공개(`is_listed=false`) 원장은 공개 표면 전체에서 실제 404**. 관리자 신설 화면(`PUT /api/admin/doctors/[slug]/settings`)에서 지점·공개·slug(미공개 시에만 변경) 관리.

### 3.3. 관리자 (admin)
- 운영 전반: 카드/댓글/회원 관리, AI 글 초안 생성, KPI 대시보드
- AI 글 초안 워크플로 (`/admin/draft`): YouTube → 검수 → 발행
- 보안·신고 처리, 콘텐츠 자동 검수 결과 대응
- **태그 관리 (`/admin/tags`)**: 태그 사전(`tag_dictionary`, 단일 SSOT) 인라인 편집(분류·영문 slug·부모·시술 후기·온보딩)·개명·병합·사용량/검색량 조회. 동의어·정규화·자동태깅 추천은 DB 사전 기반(§4.x, TECH_SPEC §6.9)

### 3.4. 병원 계정 (clinic)
- 제휴 지점이 회원 시술기록을 **대행 입력**(동의 기반)하는 계정 유형. `role='clinic'` 명함(소속 `clinic_id`), 병원↔회원 비귀속 다대다 연결(`clinic_member_links`), 병원명 비노출·알림 동의 원칙. 상세 계획 SSOT: `docs/plans/260704 병원계정 시술기록 대행입력 계획.md`.
- **현재 상태 = 운영 프로그램 가동**(2026-07-06): 대행입력 RPC 9종(0345) + 시술기록 관리 RPC(0350~0353) + **병원 운영 프로그램**(`/clinic` — 관리자 `/admin` 패턴: 현황 대시보드 · **환자 관리**(정렬·검색·필터 DB 테이블 — 이름·등록번호·아이디·생일·나이·성별, 전 컬럼 가운데정렬·등록번호 정렬 포함) · **시술기록 관리**(지점 전체 대장 = 목록+데스크탑 캘린더 2단[우측 고정+좌측 선택일 목록], 기간 과거방향 — 최근7일·지난달·최근3개월[기본]·직접범위) · 환자별 시술기록 타임라인(진입=읽기→'수정' 눌러 편집)·삭제) + 회원 동의 화면(`/onboarding/clinic-link/[id]`) + `/notes` "병원 입력" 배지 + **회원 본인 시술노트 편집·삭제**(`/notes/[id]/edit`, 병원 대행분 포함·병원 스냅샷 보존) + 프로필 연결관리(해제). 강남 지점(hhskin05) 프로비저닝 완료 — 흐름: 병원이 아이디+실명+생일로 등록 요청 → 회원 알림 → 온보딩형 이중 동의(정보 스냅샷 1회 제공) → 병원이 시술노트 대행 작성(`source='clinic'`) → 회원 `/notes` 자동 수신+알림 → 후기는 회원 본인이(시술노트에서 시술별 '시술후기 쓰기' → 그 시술 지정 prefill, 이미 쓴 시술은 FK[`diary_procedure_id`] 판정으로 '내 후기 보기/수정').
- **5지점 전체 프로비저닝 완료(2026-07-06)**: 수원 16959·판교 16955(김종식 원장 묶음에 병원 명함 별도 신설 — 로그인 후 명함 전환)·건대 16956·대구 16958(둘은 auth 사전 생성 — 첫 구글 로그인 시 자동 링크)·강남 16957.
- **개선(2026-07-07, 원장 검수 15건 반영 — 코드검수 3인 독립검수 수렴, 마이그 0354~0356)**: 등록번호 정렬(0356) · 병원 화면 폭/정렬/컴팩트/블록순서 · 시술기록 대장 기간 과거방향+기본 최근3개월+데스크탑 캘린더 2단 · 편집 진입=읽기→'수정' · 시술노트 폼 admin 톤 통일(전역 라디우스 불변) · **노트↔후기 연결**(0354 `create_procedure_review`+`visit_id`, FK 판정) · 예약일 5년 상한·search_path 하드닝(0355). 잔여 후속: 병원 대시보드 "오늘 작성 건수" RPC · 알림 설정 clinic 토글 UI · **U16 신규 CRM 기능(보류)** — 리콜 알림·지점 통계·시술 템플릿·주의사항/알러지·패키지·before/after 사진·CSV.

---

## 4. 핵심 기능

### 4.0. 내비게이션
- 하단 탭바(모바일)·GNB(데스크탑) 5탭: **투데이 · 내 노트 · 피드 · 리포트 · 쇼핑**. 글쓰기는 탭에서 제외(우하단 FAB / 데스크탑 헤더 '글쓰기' 버튼).
- 글쓰기 FAB(우하단)는 투데이·내 노트·피드·리포트 허브에 노출(데스크탑 ≥900px 은 헤더 '글쓰기' 버튼). 리포트 상세는 FAB 제외 유지(저장·공유는 본문 인라인 바 — 2026-07-09 R4 에서 고정 바 해제).
- '마이'는 탭에서 빠지고 **헤더 우상단 아바타**(active 명함)로만 진입.
- **리포트 탭 = `/reports`** (시술 리포트 허브, §4.3).
- **쇼핑 = 준비중**: 클릭 시 딤드(회색) + 안내 토스트만, 라우팅 없음(텍스트 배지 없음).
- 로고 진입: 데스크탑 = `/`(피드), 모바일 = `/today`(CSS @900px 토글, JS 분기 없음).
- **세부(2뎁스) 페이지 모바일 헤더 = 뒤로가기**(2026-07-09 원장 확정): 리포트 상세·프로필·글상세·시술기록 상세 등 세부 화면은 모바일 헤더 좌측이 tt: 로고 대신 뒤로가기 버튼(우측 검색·알림·아바타 유지, `AppShell backHeader`). 데스크탑은 로고+GNB 유지. 이탈 경고가 있는 작성·수정 폼은 미적용(가드 우회 방지 — 후속 안건).
  - **R5 헤더 승격(2026-07-09)**: 모바일 헤더를 페이지 타이틀·액션까지 한 줄로 흡수하는 두 variant 추가 — ① `/my` = **titleHeader**("마이페이지" 타이틀+벨+설정, 로고·검색·아바타 제거) ② 내 정보(`/{handle}` 본인) = **backHeader title/action** 슬롯(`[< 내정보 … 수정]`). 데스크탑은 모두 로고+GNB 유지.
- **본문 sticky 칩 계층 표준**(2026-07-09, facc6eb): 정렬·필터 등 본문 sticky 바는 셸 헤더 묶음(z-40)보다 **아래 z-30**(복귀 헤더가 위를 덮음) + 모바일 `top=var(--sat)` + 데스크탑은 고정 헤더 "아래"(top 72px)에 **자기 구간 동안만** 고정(피드 칩바와 동일 경험). 헤더(로고·검색)를 가리는 계층 금지. 리포트 허브·상세 정렬 칩에 적용.
- 헤더 검색은 인-헤더 통합(§4.2) — 별도 `/search` 페이지 없음.

### 4.1. 글 (카드) 시스템
- 통합 테이블 `cards` (구 `qas`, 2026 리네임 — ADR 0004)
- 타입: `qa` (Q&A) · `post` (일반 글) · `review` (개별 시술후기) · `review_summary` (시술 리포트 앵커, 1급 카드 — ARCHITECTURE.md 「시술 리포트 앵커 카드」 참조)
- 카테고리 4종: `qa`(의사 Q&A, index) / `doodle`(일반 '끄적끄적', noindex) / `review`(개별 시술후기, noindex) / `review_summary`(시술 리포트 집계, index) — P3 완료
- 상태: `draft` / `pending_review` / `published` / `hidden` / `archived`
- soft-delete (`deleted_at` in-place, ADR 0002) — **본문 보존**. 회원 탈퇴 시에는 **작성자 profile PII만** 익명화(네이버 카페식: 콘텐츠 보존, 작성자는 '(탈퇴한 사용자)' 표시).
- 외부 링크 OG 카드 첨부, YouTube 영상 시작시간 sync

### 4.2. 검색 / 피드
- 메인 RPC: `search_cards_scored`
- HOT 카드 자동 마킹 (`get_hot_card_ids_v2`)
- 같은 원장 3연속 방지, 첫 4카드 다양화
- **인-헤더 통합 검색** (별도 `/search` 페이지 폐기): 검색은 AppShell 헤더에서 직접 입력하고 홈(`/?q=`)으로 라우팅. 입력 박스↔결과 알약은 같은 픽셀 구조를 공유. 전역 규칙 — **← = 검색 닫기(나가기)**, **✕ = 검색어만 지움**(검색창은 유지).
- **검색 결과 = 피드 글상자만**(2026-06-29): 검색(`/?q=`)은 피드 글상자(qa/review/doodle)만 반환. 시술 리포트는 검색 결과에 블렌딩하지 않음(`searchReport` 항상 `null`) — 리포트는 `/reports` 탭에서만 노출. `review_summary` 카드는 홈 피드에도 직접 주입하지 않음(비검색 홈 풀은 `feed_cards_scored`).
- 인기 키워드 칩 9종 카테고리 SSOT (피부고민/리프팅/스킨부스터/필러·볼륨/주름·윤곽/레이저/기타/홈케어/피부상식) — Q&A 답변 페이지 칩용으로 9종 유지. 검색·온보딩·피드 인기태그 탭은 모두 시술 6종(리프팅/스킨부스터/필러·볼륨/주름·윤곽/레이저/기타)만 표시
- **뒤로가기 피드 복원**: 피드 카드 상세에서 뒤로가기 시 이전 스크롤 위치·풀을 복원(인스타식). 새로고침·검색·칩전환·당겨서새로고침은 복원하지 않고 최상단부터 (2026-07-04 R5-3)

### 4.3. 시술 후기 & 리포트 (P3)
- 전용 폼: `/review/new`(작성) · `/review/[shortcode]/edit`(수정). **시술 선택이 폼 맨 위**(검색 입력 + 자동완성 + 카테고리별 인기 칩 상위 18, 잠금형) → 골라야 아래 항목 활성. **만족도·통증·재시술 의향·체감 효과(필수)** + 시술 직후 반응·다운타임·생생한 후기(선택). **시술 직후 반응**(reactions, 다중선택 선택 — 부기/멍/딱지/붉어짐·홍조/화끈거림·열감/멍울·뭉침 + '없음' 단독). **다운타임은 선택 항목**이며 반응에 증상이 1개 이상일 때만 조건부 노출(시술 당일 작성 시 회복기간 미정). 병원·의사명 자동 마스킹 + 소프트 검수. 임시저장 자동복원 없음(항상 빈 폼, 이탈 시 경고 모달만). 수정 진입은 일반 글 에디터가 아닌 후기 전용 에디터로(카드 ⋮·관리자 모두).
- `procedure_reviews`(card_id 1:1)에 정량값 저장. 개별 후기 = noindex. **같은 시술도 후기 여러 개 작성 가능**(1인1시술1후기 제약 해제 — ADR 0023, 2026-06-25). 카드↔후기 1:1 은 유지(후기 1개=카드 1장). **노트↔후기 연결(2026-07-07, 마이그 0354)**: 회원 시술노트(방문)에서 시술별 '시술후기 쓰기'로 작성하면 `source='diary_linked'`+`visit_id`/`diary_procedure_id` 저장, 미연동은 `standalone`(source_link_chk). 노트 상세는 이 FK(`diary_procedure_id`)로만 '이 시술에 이미 썼는지' 판정(procedure_ko 텍스트매칭 금지) → '내 후기 보기/수정' vs '쓰기' 분기.
- **시술 리포트** `/reports/[procedure]`: `procedure_reviews` 를 **실시간 집계**(저장 카드 없음 → 후기 추가 시 자동 반영)한 단일 카드. 만족도(분포)·통증·재시술 의향·체감 효과 + 작성자 성별·연령(집계 RPC, 개별 PII 비노출). index + JSON-LD `MedicalWebPage` + `Service`(additionalType=`MedicalProcedure`) + `AggregateRating`(만족도)·재시술%·통증 + `BreadcrumbList` (의료 시술이라 `Product` 폐기 2026-06-05). 정식 URL=`/reports/{ko}`(한글, 영문은 308 전용). 검색 결과에는 노출하지 않음(2026-06-29 — `/reports` 탭 전용). **`/topics`(전문의 Q&A 허브)와는 분리** — 자기잠식 방지로 /topics 에 개별 후기 미노출·전문 열람은 /reports 에서만. /topics 상단에는 닫힌 리포트 글상자(ReportSummaryBox, 클릭 시 /reports/{ko})만 임베드(2026-07-02 — 구 '얇은 링크 1줄'(2026-06-05) 결정 갱신). /topics 는 검색·AI 유입 전용 밸브(인덱스 라우트 없음 — 직접 진입 `/topics` 는 홈 308). 후기 4건 미만 시술 상세는 noindex(follow·AggregateRating 유지, 2026-07-02).
- **리포트 허브** `/reports`: N≥4 게이트를 통과한 시술 리포트를 후기 수 내림차순으로 나열(리포트 탭 진입점, `force-dynamic`, 자격 0건이면 noindex). 허브는 접힘(재시술%·통증·만족도 요약+헤드라인)/펼침(통증 척도·효과 top3·후기 CTA) 카드 목록, 상세는 히어로 카테고리 그라데이션 표지 + 흰 통계 카드(분리 2장 — 만족도/통증·회복/효과/타임라인/작성자 통계) + 후기 카드(작성자 나이·성별·댓글 수·인라인 댓글) + 본문 인라인 저장/공유 바(진짜 저장 `card_saves`·공유 — 2026-07-09 R4 에서 고정 바 해제) 구성(2026-07-08 개편·07-09 R4 정밀 보정). 히어로 헤드라인은 1뎁스와 동일한 회전 문구 엔진(`report-headline`) 서버 선택. SEO 셸(JSON-LD·canonical·en→ko 308)은 보존(렌더만 교체). 인덱스↔상세 이동은 공유 셸로 상단바·사이드바를 유지하고 좌측 본문만 교체. 구 미리보기 `/reports-new` 는 `/reports` 로 308 영구 리다이렉트.

### 4.3. 사용자 시스템 (Identity — ADR 0001, ADR 0011, **ADR 0012**)
- 한 auth user 가 여러 profile row 보유 가능 — 모든 profile 은 **동등하게 독립**. 위계 / "본계·부계" 개념 없음
- 쿠키 기반 active identity 전환
- 모든 인터랙션 (좋아요/저장/댓글/글) 의 `user_id`/`author_id` = active profile.id
- 프로필·설정 편집(알림 설정·탈퇴 포함)은 전용 화면 **`/my/settings`**(noindex, 회원 전용)로 단일화 — 공개 프로필 `/{handle}` 은 작성물 중심(필터 칩), 피부정보 상세는 `/my` "내 피부 정보" (ADR 0026)
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
- 약관 동의 + 생년월일·성별·얼굴형·피부타입·피부톤(Fitzpatrick) 입력 강제
- 14세 미만 차단 (CHECK constraint)
- 중복 가입자 식별 (OAuth provider email 기반 — ADR 0003)
- **게이트 단위 (ADR 0015, 2026-05-29)**: 온보딩 검사는 **active 명함 단위**. middleware / onboarding 페이지 / 댓글 라우트 모두 active 명함 (IDENTITY_COOKIE 기반 + 묶음 보안 검증) 의 birthdate/terms_agreed_at 검사. 묶음 외 ID 는 base fallback. settings/profile 의 POLICY-1(base-only 읽기)은 해소 완료(2026-05-29 정합 — 현 설정 실화면은 `/my/settings`, ADR 0026).
- **묶음 PII 복제 (ADR 0015)**: 첫 명함이 온보딩 완료하면 같은 묶음의 빈 명함에 1회 COALESCE 복제 (NULL 칸만, 의사 멀티 계정 묶음 한정). 복제 후엔 명함별 독립 수정. RPC: `propagate_onboarding_to_doctor_bundle(uuid)`.

### 4.5. 알림 / 푸시
- DB 트리거 → webhook → Web Push (VAPID)
- 댓글·좋아요·저장·답변 알림 채널별 설정
- **관심사 키워드 다이제스트**: 온보딩 관심(피부고민·피부타입·관심시술)과 새 글 태그를 매칭해 통지. 프로필 옵션을 한글로 통일(마이그 0262)하여 글 태그(한글)와 같은 도메인 → 매칭 부활.

### 4.6. AI 글 초안 (`/admin/draft`)
- Anthropic Claude 기반 2단계 워크플로
- Step 1: YouTube transcript → Q&A 후보 추출
- Step 2: 후보 → Q&A 본문 생성 + PubMed 참고문헌 자동 첨부

### 4.7. 콘텐츠 자동 검수
- 의료법 §56② 14금지 + 약사법 §68 + 환자후기 키워드 사전
- 의사·관리자 자동 통과, 일반 회원만 적용
- 적용 범위: 카드(글) + **댓글** (모두 active 신분의 role 기준, ADR 0012)
- **병원·의사명 자동 마스킹 적용 범위 = 후기 본문 + 시술노트 + 댓글** (지목 표현을 "○○" 로 가림, 제출 차단 아님. 1건 이상 발생 시 작성자에게 1회 안내 토스트)
- 임계 초과: 카드 `status='pending_review'` / 댓글 `status='hidden'` + 작성자에게 1회 안내 (silent fail 방지)
- 자살/자해 키워드 감지 시 안전 메시지 모달 (109/1577-0199/1388) — 카드 작성·댓글 작성 모두 적용

### 4.8. 운영 모더레이션 (배치 ④, 2026-05-28)
- 운영 화면: `/admin/reports` — 신고 큐 + 액션 2개 + 기각.
- **숨김** (`moderation.hide`): 영구 비공개(`status='hidden'`, 복구가능). 30일 임시조치 폐기 — 기한 제한 없음.
- **완전삭제** (`moderation.delete`, 카드 한정): `soft_delete_card` RPC(ADR 0002)로 `deleted_at` 소프트삭제. **본문·작성자 보존**(스크럽 없음), 공개에서 비공개(RLS + 피드 `deleted_at` 필터). `audit_logs`(`moderation.delete`) 적재.
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
- 탈퇴 시 **작성자 profile PII** in-place 익명화 + auth 계정 삭제 (네이버 카페식: 작성 콘텐츠 본문 보존, 작성자만 '(탈퇴한 사용자)' 표시. ADR 0002). 병원 대행 도입 후 익명화가 `legal_name` + `clinic_member_links` 회원 유래 PII 스냅샷도 함께 파기(마이그 0347). `registration_number`(병원 내부 챠트번호)는 개인 단독 식별자가 아니고 병원 진료기록 보존 의무 대상이라 존치.
- profiles 컬럼 권한 화이트리스트 — PII 8개 컬럼(birthdate·gender·contact_email·face_shape·skin_type·skin_concerns·interested_procedures·fitzpatrick) + `legal_name`(0342, 선택 복원용 실명)은 anon·authenticated 모두 SELECT 차단 (anon 은 동의 메타 컬럼도 추가 차단). 본인·관리자 PII 조회는 SECURITY DEFINER RPC 경유 (마이그 0122/0123/0325/0334/0335). 비-PII `clinic_id` 는 authenticated SELECT 허용(0348)
- 처리방침 국외이전 표 명시 (Supabase/Vercel/Anthropic/Google/Web Push/PubMed)
- 30일 임시조치 절차 (정통망법 §44조의2)

### 5.3. 의료법 준수
- 의료광고 14금지 자동 검수
- 환자 후기 차단
- 의료 면책 페이지 (`/disclaimer`)
- 처방·진단 행위 금지 안내

### 5.4. SEO · AEO · GEO
- sitemap(ISR revalidate 3600) · robots · manifest
- **메타 규칙 (2026-06-05 통일)**: title 템플릿 `%s | 피부텐텐` — 콘텐츠 페이지는 주제(키워드) first·브랜드 last, 홈만 brand-first(absolute). title↔description 비중복(title=주제/질문, desc=답변/데이터). desc 에 브랜드 반복 금지, 수치(Q&A수·후기수·만족도·재시술%·전문의수)는 전부 라이브 동적, 최상급·효과 단정·후기 보증 문구 금지. 원장 글 desc 는 본문 문장경계 트림(~150, 단어 중간 잘림 방지).
- OG 메타: 원장님 페이지·단일 글 페이지 모두 `generateMetadata`
- 의사 글 URL: `/doctors/{slug}/{year}/{post-slug}` 키워드 기반 slug
- 회원 글 URL: `/{handle}/{shortcode}` 8자 base58
- **공개 HOLD 스위치** (2026-05-28): `SITE_PUBLIC` 환경변수. `!== "true"` 면 robots fail-safe 전체 차단. 공개는 운영자가 Vercel 환경변수 추가 후 redeploy.
- 공개 시 2-tier AI 크롤러 정책 (인용·도달 최대화, 2026-06-06): 검색봇 + AI 인용봇 + 주요 학습봇(GPTBot·ClaudeBot·CCBot·Google-Extended·Applebot-Extended·Meta-ExternalAgent·Amazonbot·cohere-ai) 허용, 저가치 스크래퍼 4종(Bytespider·Diffbot·Omgilibot·ImagesiftBot)만 차단
- RSS: `app/rss.xml/route.ts` — 의사 Q&A 글 최신 50건 (네이버 freshness signal)
- `/.well-known/`: security.txt (RFC 9116) / agent-card.json / ai-policy.json
- llms.txt + llms-full.txt (정적 큐레이션: 정책·신뢰 페이지 전문 + 진입점 + NAP, llmstxt.org 표준). `public/llms-full.txt` 정적 파일이 `/{handle}` 라우트보다 우선되어 text/plain 서빙 (soft-404 해소)
- **없는 경로 실제 404 (소프트 404 차단, 2026-07-05)**: 미존재 시술 리포트(`/reports/{미등록}`)·회원 핸들(`/{미존재}`)·최상위 미존재 `.xml`(예: `/feed.xml`)은 미들웨어 존재검사로 렌더 이전 **실제 HTTP 404**(+noindex) 반환(스트리밍 소프트 404 우회 — `lib/not-found-response.ts`). 친절 안내 페이지(피드·전문의 링크)는 유지, 자동 리다이렉트 없음(SNS 표준). 온보딩 fast-path 이전 실행이라 로그인·비로그인 동일. 상세: `ARCHITECTURE.md` §6.4.
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
- 모달 포커스 트랩 (`hooks/useFocusTrap` — Tab 순환·닫힘 시 이전 포커스 복원, 확인/로그인유도/저장이탈 모달 적용) + 온보딩 검증 실패 시 첫 실패 필드로 focus·scrollIntoView (2026-07-04 R5-2)

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
