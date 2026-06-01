# Changelog

[Keep a Changelog](https://keepachangelog.com/) 표준. 모든 변경은 여기에 기록. 도메인 문서 (PRD/ARCHITECTURE/DATABASE 등) 헤더에는 절대 누적 금지 (CLAUDE.md §6).

> **2026-05-15 이전 변경 이력**: `_archive/docs/prd-monolith-2026-05-23.md` 및 `_archive/docs/PRD_changelog_2026-05-15-16.md` 참조.

---

## [2026-06-01] — 정렬 RPC reviewed_at 기준 통일 (P1-c)

### Changed
- `feed_cards_scored` / `search_cards_scored` / `tag_cards_scored` 의 시간감쇠·New부스트 기준을 `created_at` → `COALESCE(reviewed_at, created_at)` 로 변경. RETURNS TABLE + 반환 목록에 `reviewed_at` 추가(마이그 0197). Q&A 는 검수일 기준 정렬(과거 영상 카드도 최근 검수면 신선하게 취급), post 는 reviewed_at NULL 이라 created_at 유지. **표시일과 정렬 기준이 완전 일치**.
- 반환 타입(RETURNS TABLE) 변경이라 `CREATE OR REPLACE` 불가 → `DROP FUNCTION` 후 재생성. proacl=null(기본 PUBLIC EXECUTE)이라 재GRANT 불필요.
- 앱은 피드/검색/태그가 RPC 결과를 `data as CardData[]` 로 그대로 매핑 → reviewed_at 자동 포함(앱 코드 변경 없음).

> 카테고리 라벨 직접검색(`search-query.ts` 카테고리 경로 `.order("created_at")`)·마이페이지 본인글 정렬은 P2 카테고리 개편 시 함께 정리 예정.

---

## [2026-06-01] — reviewed_at(의료 검토일 SSOT) 도입 + 표시처 통일 (P1-b)

### Added
- `cards.reviewed_at timestamptz` 컬럼 신설(마이그 0196). **의료 검토일 SSOT**. Q&A = 의사 검수 확정 시각, post(끄적끄적) = NULL.
- 과거 백필(Q&A published): 3월까지 = 영상 게시일(KST 자정) / 4월 이후 = 검수일(updated_at), 단 bold 일괄수정으로 검수일이 덮인 15건은 발행일(created_at) 근사.

### Changed
- **표시처 SSOT 통일**: 모든 사용자 노출 날짜 = `COALESCE(reviewed_at, created_at)`. 적용처 — 목록 카드(`CardHeader`), 의사 글 상세 JSON-LD(`datePublished`/`lastReviewed`), RSS `pubDate`, sitemap `lastmod`. JSON-LD `lastReviewed` 가 기존 `updated_at` 가공값이었던 것을 `reviewed_at` 으로 교정. `dateModified` 는 `updated_at`(실제 수정일) 의미 유지.
- **검수 시 reviewed_at 자동 기록**: 의사/관리자가 Q&A 를 published 로 확정·편집(`PUT /api/articles/[id]`)하면 `reviewed_at = now()`. 관리자 발행(`/api/admin/draft/publish`)은 published 면 now, draft·pending_review 면 null. 기계적 수정(직접 SQL)엔 트리거가 updated_at 만 갱신하므로 reviewed_at 보존.
- `card-select.ts`(CARD_LIST/DETAIL_SELECT) + `types/card.ts` 에 `reviewed_at` 추가.

### Fixed
- 백필 1차 실행 시 `cards_set_updated_at` 트리거가 updated_at 을 now() 로 덮어 4월 이후 15건의 reviewed_at 이 now() 로 잘못 들어간 것을 즉시 created_at 으로 보정. 0196 파일은 트리거 안전한 단일 UPDATE+CASE 로 정합화.

> 검수일 전용 기록 부재 규명: 기존엔 status 전환 시각이 `cards.updated_at` 에만 남았고 audit_logs 는 2026-05-30 부터 카드 3건뿐(트리거는 알림 발송용). reviewed_at 도입으로 향후 검수일이 기계적 수정에 덮이지 않고 보존됨.

---

## [2026-06-01] — Q&A 영상 게시일(upload_date) 백필 + 발행 영상정보 정합성 (P1-a)

### Fixed
- 영상 게시일(`videos.upload_date`)이 비어있던 Q&A 영상 9개(귀속 카드 37장) 백필. 각 영상 watch 페이지 메타에서 게시일을 추출해 채움. 형식은 기존 944건과 동일하게 "게시시각의 KST 변환 날짜"(`AT TIME ZONE 'Asia/Seoul'`) 기준으로 통일. 스크립트: `scripts/backfill_video_upload_dates_260601.sql`. 결과: `upload_date` NULL 인 활성 Q&A 카드 0.
- 영상정보 누락 원인 규명: `meta.video_id` 의 빈값·한글 파일명은 검수 중 소실이 아니라 발행 시점의 video_id 형식 무검증 + videos UPSERT 시 `upload_date` 미기록 때문. 카드의 정식 연결(`cards.video_id` FK)은 정상이었음.

### Added
- `src/lib/ai/youtube-upload-date.ts`: 영상 watch 페이지에서 게시일을 KST 날짜(YYYY-MM-DD)로 추출하는 best-effort 유틸. 실패 시 throw 없이 null 반환. (기존 YouTube Data API OAuth refresh_token 만료(invalid_grant) 대체 수단)

### Changed
- `/api/admin/draft/publish`: videos UPSERT 시 `upload_date` 를 best-effort 자동 채움(새값 ?? 기존값 ?? null 우선순위로 기존값 null 덮어쓰기 방지). 발행 입력 `videoId` 에 11자 유튜브ID 형식 검증 추가(빈값·한글 파일명 차단).
- `src/lib/ai/step1.ts`: LLM 이 반환한 `source.video_id` 가 11자 형식이 아니면 analyze 단계의 입력 videoId 로 교정.

> 알려진 한계: watch fetch 가 production(Vercel) 데이터센터 IP 에서 봇 차단/동의 인터스티셜로 막힐 수 있음. 그 경우 유틸은 null 을 반환하고 발행은 정상 진행되며, 필요 시 게시일은 주기적 백필로 보완. 개별 fetch timeout 가드는 없으나 라우트 `maxDuration=60` 가 상한.

---

## [2026-05-31] — AI 협업 룰: 조사 깊이 기본 절차 추가 (CLAUDE.md §2)

### Changed
- 루트 `CLAUDE.md` §2 "수정 요청 처리 절차" 에 **"조사 깊이 기본 절차 (필수)"** subsection 추가. 조사·질문 요청 시 컬럼명 패턴 매칭 등 단일 출처로 끝내지 말고 4계층(① 스키마 전수 ② JSON·구조 내부 ③ 관련 테이블·로그·트리거 ④ 코드 워크플로 추적) 전수 확인 후 "DB 직접 저장값 vs 코드 파생·가공값 vs 미기록" 구분 명시하도록 규정.

> 배경: `cards` date 필드 조사에서 컬럼명 패턴만 보고 끝내 JSON-LD `lastReviewed`(= `updated_at` 가공 SEO 값) 와 검수 시점 기록 부재를 초기에 놓친 사례. 향후 모든 세션에 적용되는 영구 룰로 승격.

---

## [2026-05-31] — PWA 설치 아이콘 여백 보정 (maskable 안전영역)

### 배경
홈 화면 설치 아이콘의 `tt:` 글자가 캔버스 가로 64% 를 차지해, 안드로이드/삼성 런처의 adaptive 마스크(중앙부 크롭) 적용 시 모서리에 닿아 답답하게 보임. `icon-maskable-512.png` 가 `icon-512.png` 와 동일 파일이라 maskable 안전여백이 0 이었음.

### Changed
- `tt:` 글자를 한 덩어리로 원위치 축소(가로 64% → **55%**). 콜론 위치·자간 불변, 배경 `#4CBFF2` 풀블리드 유지(흰 모서리 없음). 광학 보정 미적용.
- 재생성 파일: `icon-512.png`, `icon-maskable-512.png`, `icon-192.png`, `apple-touch-icon.png`(180, iOS 용 RGB).

### Added
- `icon-maskable-192.png` 신규 + `manifest.webmanifest` 에 `purpose:maskable` 192 항목 추가(192·512 모두 maskable 등록).

### Fixed
- 아이콘 캐시 무력화 — `/icons/(.*)` 는 `vercel.json` 에서 1년 `immutable` 이라 같은 파일명은 클라이언트가 재요청 안 함. 파일명 버전 누적(`-v2`) 대신 manifest/layout 아이콘 src 에 `?v=2` 쿼리만 부여(파일명은 원래대로 유지). 미세조정 시 파일 덮어쓰고 쿼리 숫자만 증가, 확정 시 정리할 잔여 파일 없음. (manifest 는 `max-age=0, must-revalidate` 라 새 쿼리가 즉시 도달.)

> 55% 사용자 승인·확정(2026-05-31). 쿼리 캐시버스팅이라 별도 테스트·잔여 파일 없음 — canonical 파일 + `?v=2` 가 최종본. 향후 크기 변경 시 파일 덮어쓰고 `?v` 만 증가.

---

## [2026-05-31] — 도메인 이전 `pbtt.kr` → `pibutenten.kr` (A-1 코드 + A-2 전환)

### 배경
한국 사이트 도메인을 `pbtt.kr` → `pibutenten.kr` 로 이전. `SITE_PUBLIC` HOLD 로 색인이 거의 없는 시점이라 SEO 손실 최소. 전환 원칙: 새 도메인 "추가" 완료(Phase 0·1) 후 깃발 넘김(A-2). 정합성 원칙: 동작용 도메인은 `SITE_URL`(`src/lib/site.ts`, env `NEXT_PUBLIC_SITE_URL`) 한 곳으로 수렴, 흩어진 하드코딩 제거.

### Added
- ADR 0017 — 콘텐츠에 자기 사이트 절대 URL 저장 금지(내부 링크는 상대경로/ID). production 전수 스캔 결과 레거시 0건(이미 준수), 규칙만 명문화.
- `next.config.ts` — 레거시 `pbtt.kr`/`www.pbtt.kr` → canonical 301(308) 리다이렉트. `IS_NEW_DOMAIN`(env=pibutenten.kr) 게이트로 전환 전 비활성.
- 마이그 0195 — `notifications_push_webhook()` `v_url` → `pibutenten.kr`(net.http_post 는 POST 라 301 미추종).

### Changed
- **`NEXT_PUBLIC_SITE_URL` → `https://pibutenten.kr`** (Vercel Production + Preview). 재배포로 canonical/robots/sitemap/JSON-LD/OG 전부 새 도메인 반영 + next.config 301 게이트 활성화.
- `src/middleware.ts` — CSRF allow-list 에 `pibutenten.kr`/`www` 추가(레거시 `pbtt.kr`/`www` 유지).
- `src/app/auth/callback/route.ts` — `sanitizeNext` 하드코딩 `pbtt.kr` 가드 → `SITE_URL` 기반.
- 정적파일(`.well-known/agent-card·ai-policy·security.txt`, `llms.txt`, `manifest.webmanifest`) + 약관 본문 + report placeholder + 주석 → 새 도메인.
- Supabase Auth `site_url` → `https://pibutenten.kr` (redirect 허용목록은 두 도메인 유지).
- `www.pbtt.kr` Vercel 도메인 리다이렉트 목적지 `pbtt.kr` → `pibutenten.kr`(단일 hop).

### 인프라 (Phase 0·1, 선행 완료)
- Supabase Pro + Daily Backups + Custom Domains(`auth.pibutenten.kr` active), Vercel Pro + Spend($50).
- 외부 콘솔 새 도메인 추가: Supabase Auth redirect, 네이버 콜백(PC/모바일), 구글 OAuth 승인도메인, Google·Bing 검색엔진 DNS 검증. (네이버 서치어드바이저는 B 단계 이연.)

### B 단계 (auth 컷오버 · 검색엔진 · OAuth 브랜딩 — 2026-05-31 완료)
- **auth 커스텀 도메인 컷오버** — 구글·카카오 OAuth redirect URI 에 `auth.pibutenten.kr/auth/v1/callback` 추가 후 `NEXT_PUBLIC_SUPABASE_URL` → `https://auth.pibutenten.kr` (Prod). CSP `connect-src`/`img-src` 가 새 도메인으로 서빙됨을 라이브 헤더로 검증. (카카오 redirect URI 위치: 앱 > 플랫폼 키 > REST API 키 > 로그인 리다이렉트 URI.)
- **검색엔진** — GSC 주소 변경 도구(pbtt.kr → pibutenten.kr) + sitemap·RSS 재제출, Bing sitemap·RSS 제출, 네이버 서치어드바이저 신규 등록. 네이버 검증 토큰 교체 → `NEXT_PUBLIC_NAVER_SITE_VERIFICATION`(Vercel env) 갱신·재배포, 메타태그 서빙 확인.
- **구글 OAuth 동의화면 브랜딩** — 앱 이름 "피부텐텐", 홈페이지·개인정보·약관 링크 pibutenten.kr, 승인 도메인 갱신 → 브랜드 인증 제출(검토 중).
- **SITE_PUBLIC 상태** — 이미 공개(`true`)였으므로 색인 손실 없이 전환.

---

## [2026-05-31] — 피드 점수 공식 교체: 참여 가중치 확대 + New 부스트

### 배경
새로 올라온 글이 점수순(인기·시간감쇠) 정렬에 묻혀 상단에 안 보이던 문제. 갓 발행한 글을 일정 시간 최상단에 띄우고, 반응이 없으면 빠르게 식어 인기글에 자리를 내주도록 점수 공식을 교체. 동시에 참여 신호에 공유·댓글을 반영.

### Changed (마이그 0194 — 함수 본문만, 컬럼/트리거 추가 없음)
- **참여 가중치 확대**: 인기 점수 원점수 = 좋아요×1 + 저장×2 + **공유×2** + **댓글×2** + 조회×0.1(=/10) → `ln(·)` 압축. 공유는 기존 `cards.share_count`, 댓글은 `comments(status='visible')` 를 점수 계산 시 즉시 count(LEFT JOIN, 새 컬럼·트리거 없음).
- **New 부스트 추가**: 점수에 `1.5 × 0.5^(글 나이[시간])` 가산 (반감기 1시간). 갓 올라온 글 +1.5(현재 1등 ~1.7 위) → 약 1시간이면 인기글과 교차 → ~6시간이면 ≈0(묻힘). 반응이 붙으면 인기 점수가 올라 부스트가 식어도 상위 유지. 시간 기준 `created_at`(별도 `published_at` 미도입).
- `feed_cards_scored`(홈 첫 페이지) + `search_cards_scored`(검색·홈 스크롤) **양쪽 동일 적용** → 첫 페이지·스크롤·검색에서 신규 글 노출 일관.
- recency 반감기(14일)·의사 글 ×2·jitter 는 기존 유지. 검색 키워드 매칭 점수도 유지(가산 위에 얹힘).

### 검증
- production 적용 후 두 함수 정상 실행, jitter 0 조회로 점수 합리성 확인(공유·댓글 반영 실측). PL/pgSQL 반환 변수 `status` 충돌은 comments 서브쿼리 컬럼 별칭(`cm2.status`)으로 표준 처리.

---

## [2026-05-31] — "방금 쓴 글" prepend 그리드 정합화 (1단 깨짐·중복 노출 수정)

### 배경
홈 피드에서 본인이 방금 발행한 글이 ① 2단 그리드를 깨고 혼자 1단(전체폭)으로 표시되고 ② 같은 글이 두 번 노출되던 문제. 원인은 `JustPublishedPrepend` 가 Feed 의 Masonry 그리드 **밖**에 별도 블록으로 카드를 렌더(2026-05-28 배치 ⑤ H4 의 지름길 구현)했기 때문. "모든 피드 카드는 한 그리드를 통과한다" 불변식 위반. 본인·발행 직후·새로고침 전 한정 증상(타인·SEO 영향 0)이나 구조적 예외라 정합화.

### Fixed
- **1단 깨짐**: prepend 로직을 `Feed` 안으로 흡수 → 방금 쓴 글을 `items` 맨 앞에 unshift 하여 Masonry 첫 칸으로 그리드 안에서 렌더(2단 정상).
- **중복 노출**: 주입 전 `items` 에 동일 id 존재 여부 검사 → 이미 피드에 있으면 미주입(마킹만). `loadMore` append 시에도 id 기준 중복 제거 가드 추가(offset 페이지네이션 창 밀림 대비).

### Changed
- `Feed.tsx`: `enableJustPublished?: boolean` prop 추가. 홈 Feed 인스턴스만 true(검색·의사·프로필탭은 미전달 → 동작 불변). sessionStorage `pbtt:justPublished` 시그널 읽어 5분 윈도우 + shown 마킹 1회 노출.
- `page.tsx`: 별도 `<JustPublishedPrepend />` 제거 → `<Feed enableJustPublished />` 로 위임.
- `api/cards/route.ts`: `ids` 단일조회에 `.is("deleted_at", null)` 추가 — 발행 직후 soft-delete 된 글이 prepend 되는 것 방지(`feed_cards_scored` 와 동일 불변식 정합).

### Removed
- `components/JustPublishedPrepend.tsx` — 역할이 `Feed` 로 흡수되어 삭제(병렬 렌더 경로 제거).

### 검증
- `npx tsc --noEmit` 에러 0, `npm run build` Compiled successfully.

### 손대지 않은 것 (과설계 회피)
- `Feed.tsx` / `CardMasonry.tsx` 두 그리드 컴포넌트는 breakpoint·CSS 클래스(`feed-masonry`)를 공유해 이미 일관 — 통합은 본 건과 무관한 별도 안건으로 보류.

---

## [2026-05-30] — 의사 글 slug 편집 UI + 5층 방어 + 발송 버그 3건 수정

### 배경
slug 사고(영상ID-인덱스 발행) 재발 방지. Q&A 추출·검수 과정에서 slug 를 화면에 노출하고
관리자가 확인·수정할 수 있게 하며, 중복·동시저장을 5층으로 방어.

### Added
- 마이그 `0193_cards_post_slug_unique.sql` — `cards(doctor_id, post_year, post_slug)` 부분 UNIQUE 인덱스 (동시저장 23505 최후 방어선). 회원글/빈 slug 제외. production 적용(중복 0 확인). 0193b 롤백.
- `GET /api/admin/slug-check` — 공용 형식·중복 검사 (가드=active 명함 admin). draft·edit 화면 공유. `doctorId|doctorSlug + year + slug + excludeCardId` → `{available, reason, normalized, suggestion}`.
- `slug-mapping.ts`: `isValidPostSlug` / `normalizeToSlug` 공용 함수. `slug-conflict.ts`: 23505 → "이미 사용 중" 공용 변환.
- `/admin/draft`: 카드별 "URL slug" 입력칸 + 추출 직후 buildSlug 자동 제안 + 같은 영상 카드끼리 `-2` 충돌 회피 + blur 중복 검사 뱃지. 발송 버튼 근처 중복/형식 안내.
- `/admin/cards/[id]/edit` + `CardEditor`: 의사 글 slug 필드 (`SlugField`). active 명함 admin 만 노출(원장 명함 숨김), `status='draft'` 만 편집(그 외 read-only 잠금).

### Changed
- `publish/route.ts`: post_slug 결정을 1순위 관리자 확정 slug(형식검증 통과 시) → 2순위 buildSlug 로. 관리자 확정 slug 가 중복이면 자동 -2 금지·발송 차단(409). 빈 칸 자동제안 -2 는 유지.
- `PUT /api/articles/[id]` + zod: `post_slug` 수용 + 서버 5중 재검증 (active admin / 의사글 / draft / 형식 / 중복). 23505 변환.

### Fixed (발송 버그 3건)
- **데이터 소실**: 제목 dedup 으로 skip 된 카드가 클라이언트의 무조건 navigate 로 조용히 사라지던 문제 → skipped 카드 화면 유지 + 명시 (소실 0).
- **자동 -2 무단 통과**: 관리자가 같은 slug 를 넣어도 서버가 -2 붙여 통과 → 클라 preflight + 서버 409 로 발송 차단.
- (선행) 의사 글 slug 영상ID-인덱스 → 키워드 slug 교정 (아래 별도 블록).

### Security (5층 방어)
형식(즉시) → 중복(blur, 공용 API) → 서버 재검증(저장) → 검수발송 잠금(status≠draft) → DB 부분 UNIQUE.
slug 편집 권한 = active 명함 admin (ADR 0012). 검수 발송·발행 글 잠금.

### 조사 결론 (수정 없음)
- `/write/{shortcode}` 편집 경로는 방어 우회 아님: 저장은 `PUT /api/articles/[id]` 단일 통로(가드 동일) + DB 인덱스가 모든 경로 보호. shortcode 는 slug 와 분리된 안정적 내부 편집 핸들(의도된 설계).
- JSON-LD `lastReviewed`/`dateModified` 는 둘 다 `cards.updated_at` 소스(별도 검수일 컬럼 없음).

### 검증
- tsc OK, build ✓ Compiled successfully, dev 부팅 에러 0, 라우트 가드 401, DB 23505 거부 실증.
- 커밋: `6d06da5`(0193) → `b0096fa`(공용+API) → `8338a5f`(draft) → `1f141fe`(edit) → `498ca60`(소실) → `a506e5a`(중복차단) → `b97d03f`(안내).

### 문서
- DATABASE(0193) / ARCHITECTURE(slug-check API) / TECH_SPEC(§6.8 slug 편집·잠금·5층 방어) 동기 갱신.

### 잔여
- 미발행 테스트 카드 #2324/#2325(`rejuran-painpain~`) — 정민님 정리 대기 (노출 영향 없음).
- 실제 auth UI 실증(같은 slug 2개 발송 차단 화면)은 정민님 재확인 예정.

---

## [2026-05-30] — 의사 글 URL slug 오류 수정 (영상ID-인덱스 → 키워드 slug)

### 배경
YouTube 일괄 발행(`/api/admin/draft/publish`)이 키워드 slug 함수(`buildSlug`)를 호출하지 않고
`{영상ID}-{인덱스}`(예: `gmTaKoFiZn0-6`)를 `post_slug` 로 박아, 최근 의사 Q&A 글 URL 이
`/doctors/{slug}/{year}/gmTaKoFiZn0-6` 처럼 비-SEO 형태로 생성됨. 회원/의사 직접 글 경로
(`/api/articles`)는 정상이었으나 발행 위저드 경로에만 호출이 누락 (회귀 아닌 미구현).

### Fixed
- **생성 로직** (`src/app/api/admin/draft/publish/route.ts`): `post_slug` 를 `/api/articles` 와
  동일하게 `normalizeTags(keywords) → buildSlug → resolveSlugCollision` 으로 교체. 같은
  `(doctor_id, post_year)` 기존 slug + 배치 내 카드끼리 충돌 회피 (-2/-3). 키워드 매핑 실패 시에만
  영상ID-인덱스 fallback. line 237 잘못된 주석("8자 base58") 정정.
- **기존 데이터 21건** (published 8 + pending_review 13): `post_slug` 를 본문 기반 키워드 slug 로
  일괄 UPDATE (production, 단일 statement, 옛 패턴 가드). (doctor_id, post_year) 중복 0건 검증.

### Added (SEO)
- `next.config.ts redirects()` 에 **published 8건 301 리다이렉트** (옛 영상ID-인덱스 URL → 새 키워드 URL).
  검수중 13건은 미노출이라 불필요. 라이브 검증: 옛 URL → 301 → 새 URL(200).

### 검증
- `npx tsc --noEmit` 통과. `npm run build` ✓ Compiled successfully. dev 서버 실증: 새 발행 키워드 slug
  생성, 옛 published URL 8건 301 동작, 새 URL 200, DB 중복 0 / 잔여 BAD 패턴 0.

### 롤백 (필요 시 — 21건 옛 slug 복원)
- park-hyojin/2026: pre-event-skin-prep→U42sb6TMu5c-1, skin-botox-oily-skin→U42sb6TMu5c-2, acne-scar-fractional-treatment→U42sb6TMu5c-3, cheekbone-botox-reduction→U42sb6TMu5c-4, skin-botox-titanium-lifting→6WMKxFOQQhc-3, nasolabial-fold-treatment→6WMKxFOQQhc-4
  (주의: 위 목록의 round-face-lifting-botox(2305)=6WMKxFOQQhc-3, peanut-face-contouring(2303)=6WMKxFOQQhc-1)
- kim-soohyung/2026: peanut-face-contouring→6WMKxFOQQhc-1, chin-filler-v-line→6WMKxFOQQhc-2
- jung-hanmi/2026: rejuran-ineffective-reason→gmTaKoFiZn0-1, skin-booster-sebum-hydration→gmTaKoFiZn0-2, painless-cannula-skin-booster→gmTaKoFiZn0-3, sculptra-nasolabial-fold→gmTaKoFiZn0-4, alltite-rf-thick-skin→gmTaKoFiZn0-5, ultherapy-botox-treatment-order→gmTaKoFiZn0-6, re2o-cadaver-safety→gmTaKoFiZn0-7
- rhee-doyoung/2026: rejuran-injection-pain→vB7Bk87M6Ro-1, rejuran-no-wheal-effect→vB7Bk87M6Ro-2, rejuran-polynucleotide-mechanism→vB7Bk87M6Ro-3, rejuran-vs-re2o-comparison→vB7Bk87M6Ro-4, pre-treatment-consultation→XUEGKSWbSnA-1
- kwon-soohyun/2026: natural-aesthetic-philosophy→XUEGKSWbSnA-2

### 미해결 (별도 안건)
- `buildSlug` 사전(한글→영문 매핑)에 없는 키워드(추구미·자연스러움 등)는 자동 slug 가 빈약/실패.
  이번 21건은 본문 기반 수동 확정으로 보강. 사전 확충은 추후.

---

## [2026-05-30] — 원장 계정 연결 기능 신설 (CRITICAL-3 제거 자리 대체)

### 배경
2026-05-29 제거한 CRITICAL-3 (`/api/admin/users/[id]/role`) 의 자리를, ADR 0012 를
위반하지 않는 안전한 흐름으로 대체. 관리자가 기존 회원 계정에 **새 원장 명함을 신설**해
같은 묶음 (`auth_user_id`) 으로 연결. 회원 명함의 role·글은 건드리지 않음.

### 사전조사에서 드러난 설계-현실 차이 (구현 전 사용자 확인)
- 기존 `propagate_onboarding_to_doctor_bundle` RPC 는 `auth.uid()` 가 묶음 주인일 때만
  동작 (`'not your bundle'` 가드) → admin 이 **타인 묶음**에 호출 불가. 그대로 재사용 불가.
- `doctors.slug`·`name` 은 NOT NULL·기본값 없음 + 미연결 doctors row 0개 →
  원장 정보(slug·이름·병원·지점·직함)는 admin 이 입력 (사용자 결정: 전체 입력).
- 마이그 최신 번호 0191 존재 → 0192 사용.

### Added
- 마이그 `0192_admin_create_doctor_profile.sql` — `admin_create_doctor_profile(uuid, text, text, text, text, text)` RPC.
  - 단일 트랜잭션: `doctors` INSERT (slug·name 필수, clinic/title 기본값) + `profiles` INSERT (role=doctor, doctor_id 인라인, 같은 묶음) + 회원 명함 온보딩 PII 9컬럼 복사.
  - 안전장치 (RAISE): 잘못된 slug / 회원 미온보딩 / 묶음에 이미 원장 명함 / slug 중복.
  - handle 은 slug 기반 자동 생성 (UNIQUE + reserved_handles 회피).
  - **service_role 전용 GRANT** (authenticated·public REVOKE). `auth.uid()` 비의존.
  - 롤백: `0192b_admin_create_doctor_profile_rollback.sql`.
- `POST /api/admin/users/[id]/doctor-profile` — `requireAdmin` (super admin) + rate limit + Zod + audit_logs (`admin.doctor_profile_create`). RPC 호출 (service_role admin client).
- `src/app/admin/users/[id]/CreateDoctorProfileForm.tsx` — 원장 명함 생성 폼. super admin & 묶음에 원장 명함 없을 때만 노출. 회원 미온보딩 시 비활성 안내.

### Changed
- `src/app/admin/users/[id]/page.tsx` — CRITICAL-3 자리표시 주석을 실제 폼 렌더링으로 교체. `bundleHasDoctor` 계산 추가.

### Security (CRITICAL-3 재발 방지 — DB 실증)
- RPC 는 회원 명함 row 를 **UPDATE 하지 않음** (INSERT 2건 + 회원에서 읽기만).
- production BEGIN/ROLLBACK 실증: 생성 후 회원 명함 `role='user'` 불변, 회원 글 `doctor_id` 백필 0건.
- 가드 실증: 중복 slug / 묶음 내 기존 의사 / 잘못된 slug 모두 RAISE 차단 확인. 테스트 잔재 0건.

### 검증
- `npx tsc --noEmit` 통과. `npm run build` ✓ Compiled successfully (새 라우트 등록 확인).
- 잔재 grep 0건 (RoleChangeForm / 옛 role 라우트 참조 / 임시파일).

### 관련 문서
- ADR `0016-doctor-profile-linking.md` 신규.
- `ARCHITECTURE.md` (라우트), `DATABASE.md` (마이그 0192) 동기 갱신.

---

## [2026-05-29] — CRITICAL-3: ADR 0012 위반 라우트 `/api/admin/users/[id]/role` + 호출 UI 제거

### 배경
회원 계정과 의사 계정은 처음부터 독립 (ADR 0012 명함 단위 완전 독립 5원칙).
"회원 → 의사 사후 role 변경" 정책상 존재하지 않음. 의사 자격 신설은 관리자가
별도 의사 명함을 신설·연결하는 흐름으로 갈 예정 (별도 안건).

`/api/admin/users/[id]/role/route.ts` 가 ADR 0012 채택 전 정책 잔존물:
1. 회원 role 을 doctor/admin 으로 사후 변경
2. 매핑 시 두 명함을 강제로 같은 묶음 (`auth_user_id` 동기화) 으로 결합
3. **회원 시절 글에 doctor_id 소급 자동 백필** (route.ts:178-190) — 가장 위험.
   회원 명함으로 쓴 일반 post 글이 갑자기 "의사 글" 처럼 보이게 되거나, 익명 doctor
   글이 그 회원의 작성 글 목록에 등장 → 글 귀속 오염.

### Removed
- `src/app/api/admin/users/[id]/role/route.ts` (전체 216줄, ADR 0012 위반 백필 포함)
- `src/app/admin/users/[id]/RoleChangeForm.tsx` (전체 185줄, "🔐 역할 / 매핑 변경" UI)
  - fetch 호출처 단 1개 (RoleChangeForm:58), 본 라우트 전용.

### Changed (`src/app/admin/users/[id]/page.tsx` — RoleChangeForm 전용 dead code 일괄 정리)
- L11: `import RoleChangeForm` 제거
- L115: `const viewerIsAdmin = viewerCtx.isSuperAdmin` 변수 제거 (다른 사용처 0)
- L256-308: RoleChangeForm 전용 데이터 수집 블록 53줄 제거 (`currentDoctorId`,
  `allDoctors`, `mappedProfilesData`, `mappedProfileByDoctor`, `doctorsForForm`)
- L441-449: JSX 분기 (`{viewerIsAdmin && <RoleChangeForm ... />}`) 제거 + ADR 0012
  정합 사유 주석으로 대체

### 부르는 RPC 0건
- 라우트가 `supabase.rpc(...)` 호출 안 함. 모두 `from("profiles" | "cards").update`
  직접 UPDATE → 추가 RPC 정리 안건 없음.
- 옛 RPC `link_doctor_to_profile`/`unlink_doctor_from_profile` 은 본 라우트와 무관
  (이미 0176 에서 backward-compat 래퍼화, 코드/DB 호출처 0건). 별도 안건.

### ★ production 잘못 백필 데이터 (사전조사 SELECT 결과 — 본 작업으로 수정 X)
| 검증 | 결과 |
|---|---|
| `role='user'` + `doctor_id` 설정된 profile | **0건** |
| `doctor_id` 있고 `author_id` NULL 인 카드 (Q&A 백필 흔적) | **0건** |
| 회원 author + doctor_id 박힌 카드 | **0건** |

→ **2단계 데이터 정리 작업 자체가 자동 해소** (production 잔재 0). 보고서 보관 목적
으로만 기록.

### 검증
- 잔재 grep 0건 (`RoleChangeForm` / `/api/admin/users/[id]/role` / `viewerIsAdmin` /
  `doctorsForForm` 등 모두 0).
- `npx tsc --noEmit` 통과 (`.next/types` 캐시 무효화 후).
- `npm run build` `✓ Compiled successfully in 2.8s`. 빌드 라우트 표에 옛
  `admin/users/[id]/role` 사라짐 확인. `/admin/users/[id]` 정상 등록.
- preview server 에러 0건. reload 후에도 정상.

### 변경하지 않음 (의도)
- audit_logs 의 기존 `admin.role_change` row 들 — 운영 추적 보존.
- 옛 RPC `link_doctor_to_profile`/`unlink_doctor_from_profile` 및 `doctor_accounts` view —
  별도 안건 (0176 backward-compat 의도 검토 필요).
- 데이터 정리 — production 잔재 0건이라 작업 자체 불요.
- 롤백: `git revert <commit>` — 단일 commit, 단순 복원.

### 다음 작업
관리자가 의사 명함을 신설·연결하는 신규 흐름 (별도 안건 — 정민님이 "내일 2단계"
로 명명한 작업). 본 라우트 자리는 그 흐름으로 대체 예정.

---

## [2026-05-29] — POLICY-1 잔여 정리: `settings/profile` active 명함 단위로 정합

### 배경
ADR 0015 (트랙 B B-2) 가 온보딩 게이트를 active 명함 단위로 정렬. middleware /
onboarding / 댓글은 모두 active 명함 정합 완료. `settings/profile/page.tsx` 만
**옛 base-only 읽기** 잔존 (POLICY-1 잔여, 23종 검수 #12). 의사 명함 active 시:
- 읽기: `.eq("id", user.id)` → base 의 옛 PII (birthdate/gender/skin 등) 표시
- 저장 (saveAll): `targetProfileId = activeIdentityId ?? userId` = active 명함 → 저장 OK
- 저장 (saveMarketing): `.eq("id", userId)` = base → **읽기↔쓰기 엇갈림**
- 결과: 의사 명함의 PII 가 안 보이고, marketing 토글이 다음 진입 시 base 값으로 표시

### Changed (한 세트 — 읽기·쓰기 일관)
- `src/app/settings/profile/page.tsx`:
  - SSOT 헬퍼 `getIdentityContext` 사용 (옛 자체 active 결정 — IDENTITY_COOKIE +
    UUID_RE + bundleProfileFilter — 폐기). 내부 `resolveActiveIdentity` 가 묶음
    검증 (`auth_user_id == user.id`) 으로 남의 명함 위조 차단 자동.
  - `targetProfileId = idCtx?.active?.profileId ?? user.id` 단일 결정 (base fallback).
  - PII SELECT 의 `.eq("id", user.id)` → `.eq("id", targetProfileId)` — birthdate /
    gender / skin PII / field_visibility / marketing / bio / avatar / handle /
    display_name / role 한 곳에서 active 명함 기준.
  - 옛 multi-identity 별도 fetch + display 정보 mix 로직 폐기 (target 명함 단일
    fetch 로 통합).
  - `isDoctorTarget = profile.role === ROLES.DOCTOR` — 의사 명함 active 면 항상
    사진·이름 read-only (옛 `isDoctorPrimary = role==DOCTOR && !activeIdentity` 의
    의미를 active 명함 단위로 확장).
  - `IdentityRow` 타입 / `cookies()` import / `IDENTITY_COOKIE`/`UUID_RE`/
    `bundleProfileFilter` import 삭제.
- `src/app/settings/profile/ProfileEditClient.tsx`:
  - props 정리 — 옛 `activeIdentityId`/`activeIdentityKind` 폐기. 신규 prop
    `targetProfileId` (서버 결정 단일 ID).
  - `saveAll()` 의 옛 클라이언트 로컬 결정 `const targetProfileId =
    activeIdentityId ?? userId` → `props.targetProfileId` 사용.
  - **`saveMarketing()` 의 옛 `.eq("id", userId)` (base only) → `.eq("id",
    targetProfileId)` — 핵심 정정**. saveAll() 와 동일 명함.

### 누더기 방지
- settings/profile/page.tsx 의 자체 active 결정 코드 폐기 → `getIdentityContext`
  SSOT 사용. 4번째 패턴 흩어짐 방지 (middleware / onboarding / `getIdentityContext`
  내부 헬퍼와 같은 정책).
- 호환 별칭 / 임시파일 0.

### 사후 시나리오 분석 (회귀 확인)
| 시나리오 | 결과 |
|---|---|
| 단일 명함 사용자 (base 만) 진입 | `idCtx.active.profileId === user.id` 또는 null fallback → `targetProfileId = user.id` → base PII 읽기·저장 (옛 동작 유지) |
| doctor admin (정한미) 의사 명함 active 진입 | **doctor 명함의 PII 표시** (옛: base 의 옛 값. 신: active 명함 정합) |
| 의사 명함에서 skin/marketing 수정·저장 | **doctor 명함에 저장**. 다음 진입 시 새 값 표시 (읽기↔쓰기 일치) |
| 회원 base 명함 active 진입 (의사 멀티 계정의 회원 명함) | 회원 명함의 PII 읽기·저장 (옛 동작 유지) |
| 남의 명함 ID 쿠키 위조 시도 | `resolveActiveIdentity` 의 묶음 검증 (`auth_user_id == user.id`) 으로 차단 → idCtx.active = null → targetProfileId = user.id (안전 fallback) |
| idCtx === null (인증 race) | `?? user.id` base fallback — 정상 동작 |

### 보안 (남의 명함 차단)
`src/lib/identity-server.ts:106` — `resolveActiveIdentity` 가 "본인 묶음 멤버 검증
— 다른 사람 profile cookie 위조 차단" 명시. 이번 SSOT 사용으로 동일 정책 자동 적용.

### 검증
- `npx tsc --noEmit` 통과.
- `npm run build` `✓ Compiled successfully in 3.0s`.
- preview server `/` 렌더링 정상 (snapshot 헤더/푸터 정상). 서버 에러 0건.

### 변경하지 않음 (의도)
- 다른 라우트 (middleware/onboarding/articles 등) — 이미 active 명함 정합.
- doctors GRANT (0190/0191) 무관.
- CRITICAL-3 (`/api/admin/users/[id]/role/route.ts`) 별도 안건.
- 롤백: `git revert <commit>` — 단일 commit, 단순 복원.

---

## [2026-05-29] — doctors GRANT 누락 후속 정리 (마이그 0190 + 0191)

### 배경 (d4ceff8 의 진짜 미해결 원인)
d4ceff8 (방식 B) 가 신규 PUT 라우트 + `createSupabaseAdminClient()` (service_role)
경로로 통일했으나 **production 에 doctors UPDATE 가 여전히 "저장에 실패했습니다."
로 차단**. 정한미 원장 재제보로 발견.

진짜 원인 — 서브에이전트 사전조사의 두 단계 잘못된 가정:
1. "service_role 은 BYPASSRLS + 모든 권한 attribute 부여 → GRANT 없이 통과" 가정.
2. 실제: `rolbypassrls=true` 는 RLS 만 우회. **PostgreSQL GRANT 체크는 별도**.
   - `rolsuper=false`, owner=postgres → GRANT 부재 컬럼/테이블 접근 시 42501.
   - admin write 5 테이블 (audit_logs/cards/comments/content_reports/profiles)
     모두 service_role 에 SELECT/INSERT/UPDATE/DELETE 부여됨 → 동작.
   - **doctors 만 0001_init 부터 service_role 에 SIUD 0개** (REFERENCES/TRIGGER/
     TRUNCATE 만). 일관된 누락 패턴.
3. 추가: PostgreSQL Privileges 정확 모델 — `UPDATE WHERE 절 / SET RHS 컬럼 참조`
   는 SELECT 권한도 함께 요구. 0190 가 UPDATE 만 부여한 뒤에도 WHERE id 평가가
   SELECT 부재로 차단.

d4ceff8 시점의 검증 누락 — "401/400 분기" 만 확인하고 **실제 UPDATE 도달 실증을
생략** → 잘못된 "처리완료" 보고. 정민님 재제보로 발견 + 즉시 진단 후 0190/0191 로
정확 정리.

### Added — 마이그 0190 + 0191 (단일 트랜잭션 × 2, production 적용 완료)
- `supabase/migrations/0190_doctors_profile_data_grant.sql`:
  - `GRANT UPDATE (profile_data) ON public.doctors TO service_role` (컬럼 한정).
  - 사전·사후 DO 검증 블록. HTTP 201.
- `supabase/migrations/0190b_doctors_profile_data_grant_rollback.sql` — 정확한 역방향.
- `supabase/migrations/0191_doctors_service_role_select.sql`:
  - `GRANT SELECT ON public.doctors TO service_role` (WHERE id 평가 SELECT 권한 충족).
  - doctors 는 이미 `doctors: public read` RLS (USING true) — anon/authenticated 도
    전체 컬럼 SELECT 가능. service_role 부여로 외부 노출 변화 0.
  - INSERT/DELETE 는 부여 안 함 (의사 신규 생성/삭제는 admin client 경로 아님).
  - 사전 (0190 의 UPDATE 존재 가드) + 사후 DO 검증. HTTP 201.
- `supabase/migrations/0191b_doctors_service_role_select_rollback.sql` — 정확한 역방향.

### 최종 GRANT 상태 (service_role × doctors)
| 권한 | 부여 |
|---|---|
| SELECT (전체 컬럼) | ✓ (0191) |
| UPDATE (profile_data 컬럼) | ✓ (0190) |
| INSERT / DELETE | — (의도된 부재 — 최소 표면) |
| 그 외 (REFERENCES/TRIGGER/TRUNCATE) | ✓ (0001_init 기본) |

### ★ end-to-end 실증 (헛보고 재발 방지)
production Management API 로 직접 `SET LOCAL role service_role; ... ROLLBACK;`
시퀀스 실행 — 데이터 무변경 보장:

| 검증 | 결과 |
|---|---|
| **POSITIVE 1** — `UPDATE doctors SET profile_data=$1 WHERE id=$2` (라우트 실제 쿼리) | **201 통과** (이전 42501) |
| **POSITIVE 2** — 새 jsonb 값 UPDATE + 사후 SELECT 로 반영 확인 + ROLLBACK | probe 값 정확 반환. 트랜잭션 종료 후 production 데이터 그대로 |
| **NEGATIVE 1** — `UPDATE name` 시도 | 42501 차단 ✓ |
| **NEGATIVE 2** — `DELETE FROM doctors` 시도 | 42501 차단 ✓ |
| **NEGATIVE 3** — `INSERT INTO doctors` 시도 | 42501 차단 ✓ |
| production 데이터 무변경 | jung-hanmi.youtube = `https://www.youtube.com/@pibutenten` 그대로 |

### 코드 변경 0건
- 라우트 / 클라이언트 / RLS 모두 무변경. 마이그 2건만으로 권한 부재 종결.

### 검증
- `npx tsc --noEmit` 통과.
- `npm run build` `✓ Compiled successfully in 23.5s` — 신규 라우트 빌드 등록 유지.

### 변경하지 않음 (의도)
- doctors RLS 정책 (그대로 — service_role 은 BYPASSRLS 라 정책 추가 무의미).
- INSERT/DELETE GRANT 미부여 (현 admin client 경로 미사용 + 최소 표면).
- 다른 admin write 5 테이블의 GRANT (이미 정합).

### 다음 작업
정민님 production 환경 (의사 admin 으로 본인 프로필 저장) 실제 통과 확인 요청.
이후 CRITICAL-3.

---

## [2026-05-29] — doctors 프로필 편집 권한 복구 (방식 B: API 라우트 통일)

### 배경
`admin/doctors/[slug]/edit/DoctorProfileEditForm` 이 브라우저 supabase client 로
`doctors` 테이블 직접 UPDATE 시도. production `doctors` 는:
- RLS UPDATE 정책 0개 (`doctors: public read` SELECT 만 존재)
- `authenticated` GRANT UPDATE 부재 (anon/authenticated 둘 다 SELECT 만)
→ super admin 이든 본인 doctor admin 이든 **`permission denied for table doctors`
로 항상 실패**. 0001_init (2026-05 초기) 이후 한 번도 동작한 적 없는 코드.

production 9명 doctor 의 `profile_data` 가 채워져 있는 건 SQL 또는 service_role
직접 backfill 의 결과 — 본 폼이 아니라 별도 경로로 입력된 데이터.

CHANGELOG 의 status 가드 정정 블록(`a06d732`) 동반 조사 #1 의 CRITICAL 후보 확정.

### 결정 방식 (사용자 지시 + 사전 조사)
**방식 B (API 라우트 통일)** 선택:
- ADR 0006 의 "RLS=SSOT + admin write = 서버 격리" 원칙 정합.
- 504d6ee (cards), d03e8c1 (role) 등 코드베이스 추세 (admin write = API 라우트)
  의 마지막 누락분.
- `doctors` 표면적은 SELECT-only 유지 → 잠재 write 경로 자동 차단 (방식 A 대비).
- audit_logs 적재 + Zod 화이트리스트 검증 자동 확보.

### Added
- `src/app/api/admin/doctors/[slug]/profile/route.ts` — `PUT` 신설:
  - slug 형식 가드 (`/^[a-z0-9-]+$/`, 60자).
  - 인증 + active 명함 확인 + 분당 10회 rate limit.
  - Zod `ProfileDataSchema` (DoctorProfileData 12 필드 화이트리스트, `.strict()`).
  - 대상 doctor SELECT (slug → id) — RLS public read 통과.
  - **권한 가드**: `super admin (active role='admin')` OR `(doctor admin AND
    activeDoctorId === target.id)`. 그 외 403 "본인 의사 프로필만 수정할 수 있습니다."
  - DB write: `createSupabaseAdminClient()` (service_role) 로 직접 UPDATE —
    `doctors` UPDATE 권한 부재 회피. 라우트 가드가 권한 책임.
  - audit_logs 적재: `action='doctor.profile_update'`,
    `target_table='doctors'`, `target_id=doctor.id`, metadata = `{slug, keys, via:
    super_admin|self_doctor}`.

### Changed
- `src/app/admin/doctors/[slug]/edit/DoctorProfileEditForm.tsx`:
  - `import { createSupabaseBrowserClient }` → `import { pickErrorMessage }`.
  - `save()` 의 `supabase.from("doctors").update({profile_data}).eq("slug", slug)`
    → `fetch('/api/admin/doctors/{slug}/profile', { method: 'PUT', body: ... })`.
  - 에러 메시지는 `pickErrorMessage(j, res.status)` (한글 message 우선).

### DB 변경 없음
- doctors RLS / GRANT 그대로 유지. 마이그 0190 미사용.
- 권한 가드는 라우트 한 곳에 집중 (누더기 방지).

### 검증
- `npx tsc --noEmit` 통과.
- `npm run build` `✓ Compiled successfully in 3.5s` — 신규 라우트
  `ƒ /api/admin/doctors/[slug]/profile` 빌드 등록 확인.
- preview server `/` & `/api/cards` = 200 / 에러 0건.
- 미인증 PUT 호출 → `401` 분기 정상.
- 사후 시뮬레이션 (라우트 권한 가드 정확성):
  | 시나리오 | 결과 |
  |---|---|
  | super admin 어느 의사 프로필 수정 | OK (service_role UPDATE) |
  | doctor admin **본인 의사** (정한미 → jung-hanmi) 수정 | **OK (해소)** |
  | doctor admin **타인 의사** (예: 정한미가 jung-doyoung 시도) | **차단 403** ("본인 의사 프로필만 수정할 수 있습니다.") |
  | 회원 (role=user) 또는 비로그인 | 401 / 403 |
  | 존재하지 않는 slug | 404 |
  | 알 수 없는 필드 (Zod strict) | 400 (form 필드 화이트리스트만 통과) |

### 변경하지 않음 (의도)
- doctors RLS / GRANT (방식 B 채택 — 표면적 최소화).
- 진입 가드 (`admin/doctors/[slug]/edit/page.tsx`) — 기존 `super admin || 본인
  doctor admin` 정합 유지.
- CRITICAL-3 (`role/route.ts`) 별도 안건.

---

## [2026-05-29] — PUT /api/articles/[id] status 가드 비대칭 정정 (504d6ee 회귀)

### 배경
정한미 원장 제보 — 의사 admin 으로 본인 글 "올리기" 시 "저장 실패: status 변경은
admin 만 가능합니다." 토스트. 회귀 추적 결과:
- 가드 (`route.ts:247`) 자체는 2026-05-18 (`fa2a676`) Phase 3 신설 시점부터 `!isAdmin`
  단독 (super admin only) 으로 동일. 본 가드는 한 번도 변경되지 않음.
- 옛엔 admin EditClient 가 `supabase.from('cards').update()` 를 직접 호출 →
  `cards_doctor_update` / `cards_owner_update` RLS 가 doctor admin 본인 글 통과 →
  가드가 표면화되지 않았음.
- 2026-05-28 `504d6ee` ("admin EditClient → PUT 통일") 가 직접 update 경로를
  끊으면서 PUT 가드가 처음으로 doctor admin 차단을 노출 (회귀).
- 진입 가드 (`admin/cards/[id]/edit/page.tsx:34`) 는 `isSuperAdmin || isDoctorAdmin`
  둘 다 허용 → "진입은 허용 / status 변경은 차단" 비대칭. 같은 라우트의 옆 줄
  `is_pick` 가드는 이미 `isAdmin || isDoctorOfQa` 패턴 — status 만 빠져 있던 비대칭.

### Changed (단일 수정)
- `src/app/api/articles/[id]/route.ts:246-258` status 가드:
  - 옛: `if (!isAdmin) → forbidden`
  - 신: `if (!isAdmin && !isAuthor && !isDoctorOfQa) → forbidden`
  - userMessage 정정: "status 변경은 관리자 또는 본인 글만 가능합니다."
  - 정합 근거: 같은 라우트의 `is_pick` 가드 (`isAdmin || isDoctorOfQa`) 패턴 + 진입
    가드 (`isSuperAdmin || isDoctorAdmin`) 의도와 일치.

### 사후 시나리오 분석
| 시나리오 | 결과 |
|---|---|
| super admin 어느 카드 status 변경 | OK |
| doctor admin 본인 doctor 글 status 변경 (정한미 케이스) | **OK (해소)** |
| doctor admin 다른 의사 글 status 변경 | 차단 (page.tsx 진입가드 + 본 가드 둘 다) |
| 작성자 본인이 본인 글 status 변경 | OK (단 실효 경로 없음 — write/[shortcode]/EditClient 는 status 미전송) |
| 회원이 타인 글 status 변경 | 차단 (canEdit 가드가 먼저 막음, L161-166) |

### 검증
- 추적 1 (`git log -L`): 가드 도입 커밋 `fa2a676` (2026-05-18) 부터 의미 무변경 확인.
- 추적 2: 결정타 커밋 `504d6ee` (2026-05-28) 의 PUT 통일이 직접 회로 차단.
- 추적 3 (production): 정한미 doctor 카드 360건 100% 시드 import (`meta.video_id`
  있음). audit_logs `target_table='cards'` 시스템 전체 0건. 의사 명함 role='doctor'
  (super admin 아님). 코드/이력상 본인 직접 발행 흔적 없음 — 옛 직접 update 경로의
  RLS 통과가 표면적 동작을 만들어줬을 가능성.
- `npx tsc --noEmit` 통과 / `npm run build` `✓ Compiled successfully in 4.1s` /
  preview server `/` & `/api/cards` = 200, 에러 0건.

### 동반 조사 결과 (수정하지 않음 — 별도 판단 대기)
동반 서브에이전트 전수 조사로 같은 "옛 직접 supabase.update → API 통일 / 진입가드 ↔
API 가드 비대칭" 패턴을 추가 점검:
1. **CRITICAL 후보** — `admin/doctors/[slug]/edit/DoctorProfileEditForm.tsx:209-212`
   `supabase.from("doctors").update({profile_data})` 가 production `doctors` 테이블에
   UPDATE RLS 정책 부재 + GRANT 부재로 **누가 호출하든 항상 실패**할 가능성. 본 회귀
   패턴의 정확한 매칭은 아니나 같은 부류 (클라이언트 직접 write / 권한 미비). 별도
   확인 필요.
2. **LOW (데드코드)** — `src/app/admin/cards/RestoreButton.tsx` 가 클라이언트 직접
   `supabase.from('cards').update({deleted_at:null})` 호출. doctor admin 호출 시 RLS
   차단되나 현재 어느 컴포넌트도 import 안 함 (데드코드). 실효 영향 0.
3. **이론적 비대칭 (실효 무)** — `is_pick` 필드도 EditClient 가 항상 전송하지만 진입
   가드가 doctor admin 의 다른 의사 글 진입을 막아 실효 위험 LOW.
4. **그 외 admin 라우트** — `/admin/reports` / `/admin/users/[id]/role` /
   `/admin/comments` / `/admin/draft` / `/admin/stats` 모두 진입↔API 가드 정합 (의도된
   super only 또는 의도된 super OR doctor).

→ 즉 504d6ee 회귀 패턴의 **직접 매칭은 본 status 단건**. doctor 프로필 편집은 별도
부류로 시급도 CRITICAL 후보.

### 변경하지 않음 (의도)
- 클라이언트 보조책 (`admin/cards/[id]/edit/EditClient.tsx:230` status 무변경 시 omit)
  은 사용자 지시 "수정은 단일" 에 따라 보류. 서버 가드 해소만으로 회귀 차단 완료.
- 동반 조사 결과의 CRITICAL/LOW 항목 별도 판단 대기.
- CRITICAL-3 (`role/route.ts`) 별도 안건.

---

## [2026-05-29] — CRITICAL-2: `content_reports.status` CHECK constraint 신값 4종으로 갱신 (마이그 0185)

### 배경
0137 (2026-05-19) 도입 옛 CHECK 가 5값 (`pending/investigating/resolved/rejected/temp_blocked`)
만 허용. 배치 ④ 운영 정의에서 `api/admin/reports/[id]/route.ts` 가 `resolved_hidden /
resolved_deleted / dismissed` 로 UPDATE 하도록 갱신됐지만 DB CHECK 가 동반 갱신 안 됨 →
첫 신고 처리 시 23514 violation → 500 회귀 잠복. `content_reports` row 수 = 0 이라 아직
안 터졌을 뿐. 사용자 점검에서 발견.

### Added (마이그 0185)
- `supabase/migrations/0185_content_reports_status_check.sql` — 단일 트랜잭션:
  - 사전 DO 검증 — 옛 CHECK 존재 + `investigating` 토큰 포함 확인.
  - `DROP CONSTRAINT IF EXISTS content_reports_status_check`.
  - `ADD CONSTRAINT ... CHECK (status IN ('pending','resolved_hidden','resolved_deleted','dismissed'))`.
  - 사후 DO 검증 — 신 4값 모두 등장 + `investigating` 잔재 부재.
  - `NOTIFY pgrst, 'reload schema'`.
- `supabase/migrations/0185b_content_reports_status_check_rollback.sql` — 정확한 역방향.
- production 적용 HTTP 201. 사전·사후 DO 검증 통과.

### Changed (문서)
- `docs/DATABASE.md` §1.3 `content_reports` 박스 — `status` 컬럼 스펙 갱신
  (NOT NULL DEFAULT `'pending'` 명시 + 옛 enum 호환 표기 제거).
- `docs/DATABASE.md` §5 마이그 번호 예약 표 — 0185 "예약" → "적용 완료 (2026-05-29)".

### 사전확인 결과 (수정 전, production 직접 조회)
- `status`: `text NOT NULL DEFAULT 'pending'::text` — 보정 불필요.
- 옛 CHECK 정의: `CHECK ((status = ANY (ARRAY['pending'::text, 'investigating'::text, 'resolved'::text, 'rejected'::text, 'temp_blocked'::text])))`.
- row 수: **0** (status 분포 빈 결과). 데이터 마이그 불필요.
- `pg_get_functiondef` 안 `content_reports` 참조 RPC: **0건**.
- RLS 정책 4개 (admin select/update/delete + anyone insert) 모두 status 미참조.
- INSERT 라우트 (`api/reports/route.ts:104`): `status: "pending"` 명시 — 현행·신 CHECK 모두 통과.
- UPDATE 라우트 (`api/admin/reports/[id]/route.ts:134-149`): 신값 3종만 SET.
- 0185 번호 충돌: 없음 (0184 → 다음 사용 마이그 0186).

### 검증 (production)
- 사후 CHECK 정의: `CHECK ((status = ANY (ARRAY['pending'::text, 'resolved_hidden'::text, 'resolved_deleted'::text, 'dismissed'::text])))`.
- 시뮬레이션 (단일 트랜잭션 안에서 INSERT → 4값 UPDATE → 옛값 차단 확인 → ROLLBACK):
  - INSERT (status 미명시) → DEFAULT `'pending'` 자동 부여 OK.
  - UPDATE `pending` / `resolved_hidden` / `resolved_deleted` / `dismissed` 4값 모두 통과.
  - UPDATE `investigating` (옛값) → check_violation 정확히 차단.
  - ROLLBACK 후 row 0건 유지 (운영 데이터 영향 0).
  - 부수: INSERT 시 sequence 가 1 소비 — 운영 영향 없음.
- `npx tsc --noEmit` 통과. `npm run build` `✓ Compiled successfully`. preview server 200 / 에러 0건.

### 변경하지 않음 (의도)
- `src/app/admin/reports/page.tsx:39-43` 옛 enum 호환 라벨 (`investigating/resolved/rejected/temp_blocked`)
  — row 0건이라 사문(死文). 코드 변경 시 무관계 회귀 가능성 있어 본 작업 범위 외로 유지.
- 코드는 일절 변경하지 않음 (모든 status SET 지점이 이미 신값 정합).
- 트랙 A (ADR 0014) 무관.
- CRITICAL-3 (`role/route.ts`) 별도 안건.

---

## [2026-05-29] — Phase 5: 트랙 A 종료 청소 + 위험 파일 정리 (CRITICAL-4)

### Changed (블록 2 — 문서 "예정 → 완료" 정정, production DB 사실 검증 후)
- `docs/decisions/0014-unify-profile-id-naming.md` §헤더 / §2(B) / §6 / §7 / Consequences / 미래 부담
  — Phase 2 (0186, `f8d1c93`) + Phase 3 (0187, `91477c2`) 적용 완료 사실 반영. Phase 4 보류 유지.
- `docs/DATABASE.md` §1.4 인터랙션 표 + ADR 0014 인용 박스 — PK 표기 `(card_id, profile_id)` /
  `(comment_id, profile_id)` 갱신, "RENAME 예정" → "RENAME 완료" 정정.
- `docs/DATABASE.md` §5 끝 마이그 번호 예약 표 — 0186/0187 "예약" → "적용 완료 (commit 해시)",
  0189 행 추가. production `information_schema.columns` 직접 조회 결과 명시.
- `docs/PRD.md` §4.3 마지막 단락 — "변경 전 ... 예정" → "Phase 2 + Phase 3 마이그로 2026-05-29
  적용 완료". cards/comments author_id 유지 사유 명시.
- `src/lib/active-identity.ts:17` 주석 — "author_id/user_id = 이 값" → "author_id(콘텐츠) /
  profile_id(그 외) = 이 값".

### Changed (블록 3 — column-naming hook 오탐 보정)
- `scripts/column-naming-check.js`:
  - 신규 `stripComments(src)` 헬퍼 — 줄 주석 + 블록 주석 사전 제거.
  - 패턴 A 매칭 호출부에서 `content` 대신 `stripComments(content)` 사용.
  - 정규식 본문은 `\buser_id\b` 유지 (이미 `auth_user_id` 와 매칭 안 됨 — `_` 와 `u` 사이
    단어 경계 없음).
- false positive 원인이 `.from("comments")` 윈도 안 **주석 텍스트** 였음을 확인 후 보정.
- 단위 테스트 9 케이스 통과: Phase 3 false positive 2건 / auth_user_id / 진짜 위반 3종 /
  card_likes 정상 / 블록 주석·JSDoc.
- 통합 테스트: Phase 3 의 `[handle]/page.tsx` + `admin/users/[id]/page.tsx` 사본 staging 시
  `--no-verify` 없이 통과. 인위적 진짜 위반 (`.from("cards").eq("user_id"...)`) 차단 확인.

### Removed (블록 4 — 위험 파일 + tmp 정리, CRITICAL-4)
- `pibutenten-app/scripts_phase7/` 9개 파일 (총 ~1.85 MB, `01_db_wipe.sql` destructive SQL +
  Phase 7 시드 INSERT SQL 6 part + python 적용 스크립트) — `_archive/legacy/scripts_phase7_app-side-2026-05-29/`
  로 이동 (history 보존). git tracking 제거. 기존 사료 `_archive/legacy/scripts_phase7/` 와
  별개 보존 (파일명 일부 겹쳐 덮어쓰기 회피).
- `pibutenten-app/E` (60,805 bytes, `/login` SSR HTML dump — `curl` 출력 잘못 commit 잔재).
  코드 import 0건 사전 확인 후 `git rm`.
- `*.tmp.*` 17건 (전부 untracked, 디스크 잔재) — `find ... -delete`. `.gitignore` + pre-commit
  패턴 C 가 이미 재발생 차단.
- `src/lib/ai/identify-doctors.ts:11` JSDoc — 옛 `scripts_phase7/30_identify_doctors.py` 경로
  참조를 일반화 ("Phase 7 시드 식별 스크립트 (현재 _archive/legacy/scripts_phase7_* 폴더에
  보존)").

### 검증 (블록 1 + 종합)
- **9 테이블 user_id 잔재 0건** (src/ + supabase/migrations/ + scripts/ 27 셀 매트릭스).
  서브에이전트 전수 grep — 진짜 위반 0건. 검사 외 발견: 0186 이전 작성된 옛 일회성 진단
  스크립트 8개의 옛 컬럼명 잔재 — 데이터 손실 위험 0, 별도 cleanup 안건.
- production `information_schema.columns` 9 테이블 × {user_id 부재 / profile_id 존재} 매트릭스
  100% 통과 → 문서 정정 사실 정당화.
- `npx tsc --noEmit` 통과 (identify-doctors.ts JSDoc 안 `*/` 종료 글자 충돌 1건 정정 후).
- `npm run build` `✓ Compiled successfully in 3.4s`.
- preview server 에러 0건. `fetch('/').status === 200`.

### Phase 누적 (트랙 A 종료)
- Phase 1 (`8af897a`) — ADR 0014 + pre-commit hook + 문서 동기화.
- Phase 2 (`f8d1c93`) — 마이그 0186 — 6 통계/인터랙션 테이블.
- Phase 3 (`91477c2`) — 마이그 0187 — 3 인터랙션 테이블.
- **Phase 5 (이번 커밋) — 잔재 검증 + 문서 정정 + hook 오탐 보정 + 위험 파일 정리.**
- Phase 4 (cards/comments author_id) — ADR 0014 §6 보류 (6개월 운영 후 재검토).

### 변경하지 않음 (의도)
- CRITICAL-2 (`content_reports.status` CHECK constraint) — 마이그 0185 예약 유지, 별도 안건.
- CRITICAL-3 (`/api/admin/users/[id]/role/route.ts`) — 별도 안건.
- 트랙 A 외 로직 변경 일절 없음.
- 옛 일회성 진단 스크립트 8개 — Phase 5 범위 외 (별도 cleanup 권고).
- POLICY-1 잔여 (`settings/profile/page.tsx` base-only 읽기) — 별도 안건.

---

## [2026-05-29] — ADR 0014 Phase 3: card_likes / card_saves / comment_likes `user_id → profile_id` 통일

### Changed (DB — 마이그 0187, 단일 트랜잭션, production 적용 완료)
- `card_likes.user_id → profile_id` (컬럼 + PK + index + FK 제약 + RLS 정책 8건).
- `card_saves.user_id → profile_id` (동일).
- `comment_likes.user_id → profile_id` (동일).
- 트리거 함수 (`bump_card_like_count` / `bump_card_save_count` / `bump_comment_like_count`) 는 `NEW.card_id` / `NEW.comment_id` 만 참조 — 본문 변경 X (사전 RPC body 조사로 확정).
- RPC 10건 정합:
  - `toggle_card_like` / `toggle_card_save` / `toggle_comment_like` — DML 의 `user_id` → `profile_id`.
  - `get_recent_likers(qa_id, limit)` / `get_recent_card_likers_batch(card_ids[], limit)` — **RETURNS TABLE 반환 컬럼 rename** 으로 `CREATE OR REPLACE` 불가 (42P13). `DROP FUNCTION IF EXISTS` 후 재정의.
  - `count_unread_notifications` / `fetch_qa_for_user` / `update_qa_state` / `submit_doctor_answer` 등 내부 SELECT `card_likes.user_id` → `profile_id`.
- 트랜잭션 내부 DO 검증 블록 — 사전 (3 컬럼 존재) + 사후 (3 컬럼 부재) 모두 통과.
- PostgREST 스키마 캐시 `NOTIFY pgrst, 'reload schema'` 반영.

### Changed (코드 — 9 파일)
- `src/lib/likers-batch.ts` — `Liker.user_id` → `profile_id` (타입 + row 매핑).
- `src/components/LikersDialog.tsx` — `Liker.user_id` → `profile_id` + `key={l.profile_id}`.
- `src/components/RecentLikers.tsx` — 동일 패턴.
- `src/app/api/comments/route.ts:181-184` — `comment_likes.eq("user_id", viewer.id)` → `.eq("profile_id", viewer.id)`.
- `src/lib/viewer-states.ts:36, 41` — `card_likes` / `card_saves` `.eq("user_id", activeId)` → `.eq("profile_id", activeId)`.
- `src/components/card/hooks/useCardEngagement.ts:135, 142` — 동일 (active identity 기반 viewer 상태 fetch).
- `src/app/[handle]/page.tsx:214, 218` — 본인 프로필 좋아요/저장 카운트 prefetch `.eq("user_id", profile.id)` → `.eq("profile_id", profile.id)`.
- `src/components/ProfileTabs.tsx:162` — 좋아요/저장 탭 동적 fetch `.eq("user_id", profileId)` → `.eq("profile_id", profileId)`.
- `src/app/admin/users/[id]/page.tsx:252` — admin 사용자 상세 좋아요 카운트 동일.

### 마이그레이션 파일
- `supabase/migrations/0187_phase3_user_id_to_profile_id.sql` — 단일 트랜잭션, 사전·사후 DO 검증.
- `supabase/migrations/0187b_rollback.sql` — 정확한 역방향 (재현 가능).

### 검증 절차 (모두 통과)
- 사전 RPC body 조사 서브에이전트 — 트리거 3건 본문 무관 확정, RETURNS TABLE 시그니처 변경 함수 2건 식별 (DROP 패턴 적용).
- production 적용 HTTP 201. 사후 `information_schema.columns` `user_id` 부재 + `profile_id` 존재 확정.
- 전수 grep `(card_likes|card_saves|comment_likes).*user_id` — src/ 0건 / RPC 0건 / RLS 0건 / 트리거 0건.
- `npx tsc --noEmit` 통과.
- `npm run build` `✓ Compiled successfully`.
- preview server 200 (홈 + /api/cards).

### Phase 누적 (트랙 A)
- Phase 1 (8af897a) — ADR 0014 + pre-commit 훅 + 문서 동기화.
- Phase 2 (f8d1c93) — 마이그 0186 — 6 통계/인터랙션 테이블 (daily_logins / site_visits / activity_points / card_shares / card_views / card_impressions).
- **Phase 3 (이번 커밋) — 마이그 0187 — 3 인터랙션 테이블 (card_likes / card_saves / comment_likes).**
- Phase 4 (author_id 통일) — ADR 0014 §6 보류. 진행 여부 결정 대기.

### 변경하지 않음 (의도)
- `cards.author_id` / `comments.author_id` — Phase 4 별도.
- 좋아요 토글 RPC 의 `p_identity_id` 인자명 — active identity 의미 보존 (profile_id 별칭 미부여).

---

## [2026-05-29] — B-3/B-4/B-5: 에러 메시지 친절화 + ADR 0015 + age_confirmed_at DROP (트랙 B 종료)

### Added
- `src/lib/api-error.ts` — 신규 헬퍼 `pickErrorMessage(j, status?)`. 응답 `message` (한글) 우선, `error` (kind enum) fallback, 마지막에 `HTTP {status}` 또는 "오류가 발생했어요". 클라이언트 토스트에 영문 enum 노출되던 회귀의 단일 출처 차단 (P1-F).
- `docs/decisions/0015-onboarding-gate-active-identity.md` — ADR 신규. 온보딩 게이트는 active 명함 단위. settings/profile 은 POLICY-1 잔여 (별도 안건). 첫 명함 완료 시 묶음 빈 명함에 COALESCE 복제. B-1 백필 + B-2 코드 정합 사실 기록.
- `supabase/migrations/0189_drop_age_confirmed_at.sql` — dead 컬럼 DROP (idempotent + 검증). production HTTP 201 + 사후 SELECT 부재 확인.
- `supabase/migrations/0189b_rollback.sql` — 정확한 역방향.

### Changed (B-3 — 11곳 + import 7곳)
- `CommentsBlock.tsx` 4건 (목록 fetch / 작성 / 수정 / 삭제). fetch 분기는 `r.ok` 우선 (in 검사 narrow 약함 회피).
- `IdentitySwitcher.tsx` (스위치 실패 토스트), `ProfileEditClient.tsx` (탈퇴 실패), `RoleChangeForm.tsx` (역할 변경 실패).
- `DraftClient.tsx` 4건 (analyze / step1 / step2 참고문헌 / publish).
- `PubmedRefsField.tsx` (PMID 호출 실패).
- `WriteClient.tsx`, `write/[shortcode]/EditClient.tsx` — wrapper return 값에 `message` 우선.

### Changed (B-4 — 문서)
- `docs/decisions/README.md` ADR 0015 등재.
- `docs/PRD.md §4.4` 게이트 단위 + 묶음 PII 복제 단락 추가.
- `CLAUDE.md §5` 동기화 페어 — 온보딩 게이트 정책 ↔ ADR 0015.

### Changed (B-5 — 코드)
- `src/app/signup/SignupForm.tsx:48-58` — `age_confirmed_at: now` SET 라인 제거. 만 14세 차단은 OnboardingClient 의 birthdate 재계산.

### 검증 절차 (모두 통과)
- B-3 조사 서브에이전트: P1-F 지목 5건 + 추가 8건 + wrapper 2건 = 11곳 + 2 wrapper 정합.
- B-5 조사 서브에이전트: src/ READ 0건 / RPC 0건 / RLS 0건 / 트리거 0건 / 인덱스 0건 / 제약 0건 / view 0건 / 데이터 (NOT NULL 36 / NULL 10 / total 46). 삭제 안전 확정.
- 마이그 0189 production 적용: HTTP 201, 사후 `information_schema` SELECT 부재 확인.
- `npx tsc --noEmit` 통과 (CommentsBlock union narrow 1건 정정 후).
- `npm run build` `✓ Compiled successfully in 2.9s`.
- preview server 에러 0건. 홈 + /api/cards 200.

### 변경하지 않음 (의도)
- `src/app/api/admin/users/[id]/role/route.ts` (CRITICAL-3, 별도 안건).
- `src/app/settings/profile/page.tsx` 의 base-only 읽기 (POLICY-1 잔여, 별도 안건).
- 컬럼 통일 트랙 A (Phase 3 / 4) 일절 무관.
- `marketing_email_consent` dead 후보 — 동의 데이터 보존 권고로 유지.
- `level` / `activity_score` dead 후보 — admin SELECT 잔재로 별도 cleanup 안건.
- B-1 백업 테이블 `public.profiles_backup_20260529` 유지 (롤백 source).

### 마이그 번호 예약 상태
- 0185 — CRITICAL-2 (예약)
- 0186 — Phase 2 (적용 완료)
- 0187 — Phase 3 (예약)
- 0188 — Phase 4 보류
- **0189 — age_confirmed_at DROP (적용 완료, 2026-05-29)**

---

## [2026-05-29] — POLICY-1 B-1/B-2: 묶음 PII 백필 + 온보딩 게이트 active 명함 단위 정합

> 첫 점검 보고서 POLICY-1 / POLICY-2 의 실제 사례가 production 에서 발견됨. forbidden 토스트만 보이고 온보딩 화면이 안 뜨던 회귀의 근본 원인 (사용자가 jminbae sub 명함으로 active 전환 후 댓글 작성 시도) 처리.

### Changed (B-1 — production DB 일회성 백필, 단일 트랜잭션)
- 백업 테이블 `public.profiles_backup_20260529` 생성 (46 row 동일).
- 단일 트랜잭션 `UPDATE profiles ... COALESCE` 로 묶음 안 빈 sub 명함 5개 (developer / jminbae / kim-soohyung / kang-hyunjin / park-hyojin) 의 PII (10개 컬럼) 를 같은 묶음 base 명함 값으로 복사. 이미 채워진 칸은 보존.
- 트랜잭션 내부 사전·사후 DO 검증 블록 모두 통과. 사후 `remaining_sub_null = 0`.
- 단독 명함 (sub 없는 base) NULL 5건 (lhjcjstk79 외 4명) 은 별도 정책 결정 — 본 작업 범위 외 (단 B-2 적용 후 다음 로그인 시 middleware 가 자동 `/onboarding` 안내).

### Changed (B-2 — 온보딩 게이트 코드 정합, 3파일 한 세트)
- `src/middleware.ts` — POLICY-1 정정:
  - 옛 `.eq("id", user.id)` (base 만) → IDENTITY_COOKIE 기반 active 명함 + 묶음 보안 검증.
  - candidate ID 가 호출자 묶음 (id = user.id 또는 auth_user_id = user.id) 에 속할 때만 active 단위 검사 사용. 묶음 외 ID 는 base fallback. **남의 명함 ID 우회 차단**.
  - Fast path 2b 의 ONBOARDED_COOKIE 매칭을 active 단위로 좁힘. active 명함이 바뀌면 mismatch 감지 → 슬로 path 재검사. 무한 루프 차단.
  - ONBOARDED_COOKIE set 시 값을 `profile.id` (검사 통과 명함 ID) 로 — 옛 `user.id` 고정 → active 정합.
  - `UUID_RE` import 추가.
- `src/app/onboarding/page.tsx`:
  - IDENTITY_COOKIE + 묶음 보안 검증으로 `targetProfileId` 결정. 그 명함의 PII 를 prefill.
  - `OnboardingClient` 에 `targetProfileId` prop 전달.
- `src/app/onboarding/OnboardingClient.tsx`:
  - 새 prop `targetProfileId` 추가.
  - `profiles UPDATE .eq("id", targetProfileId)` — 옛 base 고정 (userId) → active 명함 저장.
  - `propagate_onboarding_to_doctor_bundle({p_source_profile_id: targetProfileId})` — source 도 active 명함.
  - `document.cookie = pibutenten_onboarded=${targetProfileId}` — middleware fast path 2b 정합.

### 누더기 차단 (의도)
- 호환 별칭 / 옛 user_id-style wrapper 일체 도입 안 함.
- middleware / page.tsx / OnboardingClient 세 곳이 같은 정책 (active 단위 + 묶음 검증). 무한 redirect 루프 차단.

### 검증 절차 (모두 통과)
- B-1 백필 트랜잭션 HTTP 201 + DO 검증 블록 2개 통과. 사후 `remaining_sub_null = 0`.
- jminbae 명함 birth/terms/gender/skin 모두 채워짐 확인 — 다음 댓글 작성 시 POST /api/comments 의 onboarding_required 가드 통과.
- `npx tsc --noEmit` 통과. `npm run build` `✓ Compiled successfully in 3.1s`.
- preview server 에러 0건, 홈 + /api/cards 정상 응답.
- 시나리오 코드 흐름:
  - (a) sub PII NULL 상태 active → middleware active 검사 → birthdate NULL → `/onboarding`. forbidden 토스트 X.
  - (b) 온보딩 완료 시 active 명함에 저장 + ONBOARDED_COOKIE=targetProfileId → fast path 2b 매칭 → 통과. **무한 루프 없음**.
  - (c) propagate RPC source = targetProfileId → 묶음 다른 명함 NULL 칸 COALESCE 복사 (이미 채워진 칸 보존).
  - (d) 남의 명함 ID 쿠키 우회 → `inBundle` 검증 fail → base fallback. 우회 차단.

### 변경하지 않음 (의도)
- `src/app/settings/profile/page.tsx` 의 base-only 읽기 (POLICY-1 잔여 — 별도 안건).
- `src/app/api/admin/users/[id]/role/route.ts` (CRITICAL-3 — 별도 안건).
- `propagate_onboarding_to_doctor_bundle` RPC 본문 — 이미 호출자 묶음 검증 포함. 그대로 사용.
- 새 sub 명함 생성 시 자동 propagate — src/ 안 `profiles INSERT` 0건 / `create_sub_profile` 류 0건 확인. 정상 sub 생성 경로 현재 부재 → 코드 수정 불필요 (미래 도입 시점 적용 정책).

---

## [2026-05-29] — ADR 0014 Phase 2: 인터랙션·통계 6 테이블 user_id → profile_id RENAME (마이그 0186)

### Changed (DB — 마이그 0186, 단일 트랜잭션 production 적용 완료)
- 6 테이블 컬럼 `user_id` → `profile_id` RENAME:
  - `daily_logins` (12) + FK `_profile_id_fkey`
  - `site_visits` (41) + FK + 인덱스 `idx_site_visits_profile_created`
  - `activity_points` (167) + FK + 인덱스 2개 (`idx_activity_points_profile_action/created`)
  - `card_shares` (29) — FK 없음
  - `card_views` (985) — FK 없음
  - `card_impressions` (3869) — FK 없음
- RLS 정책 2개 본문 재정의 (의미 100% 동일, 컬럼명만 치환): `ap_self_select`, `dl_self_select` 의 `auth.uid() = user_id` → `auth.uid() = profile_id`. 권한 과부여 없음.
- RPC 10개 본문 재정의 (인자명·시그니처·RETURNS TABLE·SECURITY DEFINER·STABLE·search_path 모두 불변, 6 테이블 컬럼 참조만 치환): `award_daily_login`, `award_points`, `get_admin_kpi_inner`, `get_card_activity_users_inner`, `get_doctor_kpi_inner`, `get_my_stats`, `get_top_cards_by_shares_inner`, `get_top_cards_by_views_inner`, `get_top_visitors_inner`, `get_users_kpi_inner`. cross-Phase 함수의 Phase 3 (card_likes/saves) · Phase 4 (cards/comments.author_id) 부분은 그대로 보존.
- 트리거 함수 3개 (`card_shares_count_sync`, `on_card_impression_insert`, `on_card_view_insert`) 는 `NEW.card_id` 만 사용 — 변경 불필요.
- 트랜잭션 마지막에 `NOTIFY pgrst, 'reload schema'`.

### Changed (code, 5곳)
- `src/middleware.ts:299-302` — `site_visits.insert({ user_id })` → `profile_id`. 주석 정합.
- `src/components/card/hooks/useCardViewer.ts:128-132` — `card_views.insert({ user_id })` → `profile_id`. 변수명 `userId` → `profileId`.
- `src/components/card/hooks/useCardEngagement.ts:269-279` — `card_shares.insert({ user_id })` → `profile_id`. 변수명 동일 변경.
- `src/lib/impression-queue.ts:78-84` — `card_impressions` upsert row 의 `user_id` 키 → `profile_id`. 주석 추가.
- `scripts/check-impressions-today.mjs:30` — `select("...user_id")` → `profile_id`.

### Added
- `supabase/migrations/0186_phase2_user_id_to_profile_id.sql` — 본 작업 마이그 본문 (단일 트랜잭션 + 검증 블록).
- `supabase/migrations/0186b_rollback.sql` — 0186 의 정확한 역방향. 평소 미실행, 비상 시 사용.

### 검증 절차 (모두 통과)
- 마이그 적용: HTTP 201 + 트랜잭션 내부 `DO $$ ... $$` 검증 블록 통과 (6 테이블 profile_id 존재 + user_id 부재 + RLS 정책 2개 재생성 확인).
- 잔재 grep: src/ 6 테이블 대상 `user_id` 참조 0건. scripts/ 0건. RPC 10개 본문 6 테이블 대상 user_id 잔재 0건 (Python 으로 line-by-line 분석).
- TypeScript + Build: `npx tsc --noEmit` 통과, `npm run build` `✓ Compiled successfully in 2.8s`.
- preview server 에러 0건.
- 실시간 적재 확인 (production DB SELECT): `site_visits.id=42`, `card_views.id=1020~1024`, `card_impressions.id=8072~8115` 모두 `profile_id` 정상.
- RPC 호출 sanity: `award_daily_login('1f54be8d-...')` → `1` 반환 (정상).
- RLS sanity: `ap_self_select`/`dl_self_select` 본문 = `auth.uid() = profile_id`. 권한 좁아짐도 넓어짐도 없음.

### 변경하지 않음 (의도)
- `card_likes`, `card_saves`, `comment_likes` 의 `user_id` — Phase 3 (마이그 0187) 소관. 그대로.
- `cards.author_id`, `comments.author_id` — Phase 4 보류 (ADR 0014 §6). 그대로.
- 함수 인자명·변수명·RETURNS TABLE 컬럼 별칭 — 호출자 인터페이스·응답 형식 불변.
- 호환 별칭 (옛 user_id 도 받는 wrapper 등) 일체 도입 안 함 (누더기 차단).

### 마이그 번호 예약 상태 업데이트
- 0185 — CRITICAL-2 (예약 유지)
- **0186 — Phase 2 (적용 완료, 2026-05-29)**
- 0187 — Phase 3 (예약 유지)
- 0188 — Phase 4 보류

---

## [2026-05-29] — ADR 0014 Phase 1: profile_id 컬럼 명명 통일 (문서·hook 만, DB 변경 0)

### Added
- `docs/decisions/0014-unify-profile-id-naming.md` — ADR 신규. `profiles.id` 를 가리키는 컬럼 명명 규칙 확정. 콘텐츠 책임 주체 = `author_id` (cards/comments) / 그 외 = `profile_id` / 로그인 계정 = `auth_user_id`. 한 row 둘 이상 등장 시 역할 접두사 (`actor_/recipient_/reporter_`). `user_id` 신규 사용 금지. 본 ADR 즉시 발효, production DB 컬럼 RENAME 은 Phase 2~4 (마이그 0186~0187) 로 분할.
- `scripts/column-naming-check.js` — pre-commit hook. 패턴 A (cards/comments 쿼리에 user_id 등장 시 차단), 패턴 B (신규 마이그 SQL 에 user_id 컬럼 정의 시 경고), 패턴 C (`.tmp.*` 파일 staging 시 차단). 정당한 false positive 는 `git commit --no-verify` 우회 가능.
- `package.json` — `simple-git-hooks` 의 `pre-commit` 에 `column-naming-check.js` 체이닝 + `scripts.column-naming-check` 신설.

### Changed
- `CLAUDE.md §5` 동기화 페어 표에 1줄 — 사람 ID 컬럼 명명 ↔ ADR 0014.
- `docs/PRD.md §4.3` — 사람 ID 컬럼 명명 원칙 단락 신설 (ADR 0012 5원칙 직후).
- `docs/ARCHITECTURE.md §5.1.1`, `§5.1.2` — 사람 ID 3계층 표 + `profiles.id` 참조 컬럼 명명 표 신설.
- `docs/DATABASE.md §1.4` — 인터랙션 테이블 비고에 "Phase 3 에서 `profile_id` 로 RENAME 예정" 명시. `§5` 직후에 "마이그 번호 예약 (0185/0186/0187/0188)" 표 신설.
- `docs/decisions/README.md` — ADR 목록 표에 0011/0012/0014 등재 (옛 누락분 보강).

### 검증 절차 (모두 통과)
- hook 4가지 테스트 통과:
  - TEST 1: `cards` + `user_id` → **차단** (exit 1, rule A)
  - TEST 2: `card_likes` + `user_id` / `cards` + `author_id` → **통과** (exit 0)
  - TEST 3: `.tmp.*` 파일 → **차단** (exit 1, rule C)
  - TEST 4: 신규 마이그에 `user_id` → **경고만, 통과** (exit 0, rule B)
- `npx tsc --noEmit` + `npm run build` 통과.

### 변경하지 않음 (의도)
- DB 컬럼·FK·인덱스·RLS 정책·RPC·트리거 일체 무변경. Phase 1 은 정책 명문화 + 재발방지 장치 한정.
- 옛 마이그레이션 (0001~0184) 본문의 옛 컬럼명 (`user_id`) 그대로 유지 — 사료 동결 (CLAUDE.md §6 룰).
- 호환 별칭 (옛 user_id 도 받는 wrapper 등) 일체 도입 안 함 (누더기 차단).

### 마이그 번호 예약 (선점)
- 0185 — CRITICAL-2 `content_reports.status` CHECK 갱신
- 0186 — Phase 2 인터랙션·통계 6 테이블 RENAME
- 0187 — Phase 3 좋아요·저장 3 테이블 RENAME
- 0188 — Phase 4 보류

---

## [2026-05-29] — CRITICAL-1: 댓글 PATCH/DELETE 의 user_id → author_id 정정

### Fixed
- `src/app/api/comments/[id]/route.ts` — PATCH(144행) · DELETE(206·219행) 가 존재하지 않는 컬럼 `user_id` 를 참조하던 문제 정정. `comments` 테이블 작성자 컬럼은 마이그 0013/0085 이래 `author_id` 가 SSOT. 옛 잔재로 `user_id` 캐스트가 남아있어 `ownerId` 가 항상 `null` → `isOwn` 판정 깨짐 → PIPA §8 audit 가 본인 액션을 admin/doctor 액션으로 잘못 기록하던 문제 해소. DELETE 의 `.select("id, user_id")` 도 PostgREST 환경에 따라 500 가능성 잠재 → `.select("id, author_id")` 로 정정.

### 검증 절차
- production DB 직접 조회로 `comments` 스키마 확인: 작성자 컬럼은 `author_id (uuid, nullable)` 단 1개. `user_id` 컬럼 부재.
- `user_id` 전수조사: DB 의 `user_id` 보유 9개 테이블 (`activity_points`, `card_impressions`, `card_likes`, `card_saves`, `card_shares`, `card_views`, `comment_likes`, `daily_logins`, `site_visits`) 의 정상 사용처는 모두 보존. `comments` 테이블 사용처 4건만 정정 (코드 3건 + 주석 1건).
- `npx tsc --noEmit` + `npm run build` 통과 확인.

### 변경하지 않음 (의도)
- `api/comments/route.ts:183` `.from("comment_likes").eq("user_id", viewer.id)` — comment_likes 테이블의 정상 컬럼 사용.
- `ProfileTabs.tsx:162`, `admin/users/[id]/page.tsx:252`, `[handle]/page.tsx:214/218`, `useCardEngagement.ts:135/142/276`, `useCardViewer.ts:131`, `viewer-states.ts:36/41`, `impression-queue.ts:82`, `middleware.ts:300` 등 — 각 사용처가 다루는 테이블 (`card_likes`/`card_saves`/`card_views`/`card_impressions`/`site_visits`) 의 정상 컬럼.

---

## [2026-05-29] — schema 브랜드 일관성 + 페이지별 MedicalClinic scope + 표기 통일

### Fixed
- `src/lib/schema/clinic.ts` — 브랜드 식별자 `hillhouse` → `healhouse` 정정 (4 occurrences). 그룹·5개 지점 `@id` fragment 모두 정답 표기로. 외부 도메인 `healhouse*.com` · 한국어 정식 명칭 `힐하우스피부과` 는 변경 없음. (commit `faed0b0`)

### Changed (페이지별 MedicalClinic scope — commit `4c26a7b`)
- `src/lib/schema/clinic.ts` — 신규 헬퍼 `groupOnlySchema()` / `clinicSchemaForDoctor(slug)` / `clinicIdRefForDoctor(slug)` 추가. `allClinicsSchema()` 기존 유지.
- `src/app/layout.tsx` — `allClinicsSchema()` → `groupOnlySchema()`. Organization + WebSite + 그룹 MedicalOrganization 만 전역 노출. 5개 지점 MedicalClinic 제거.
- `/`, `/about`, `/contact` — `allClinicsSchema()` 인라인 inject. 그룹 전체를 다루는 페이지에서만 5개 지점 풀세트 노출.
- `/doctors/[slug]`, `/doctors/[slug]/[year]/[postSlug]` — `clinicSchemaForDoctor(slug)` 단일 지점 inject. `Person.worksFor: { "@id": <single clinic @id> }` 보장. 이도영(건대점) 글에는 건대점만, 정한미(강남점) 글에는 강남점만.
- 효과: 의사 글 페이지 응답 -8KB (-9.4%). 페이지별 핵심 entity 신호 분산 해소. Knowledge Graph 가 "이도영 → 건대점 → 그룹" 3단 체인 정확히 인식 가능.

### Changed (표기 통일 + topics 인라인 정합성 — commit `698f738`)
- `src/lib/schema/clinic.ts` — 5개 지점 `name` 표기 통일: `힐하우스피부과의원 {지점}` → `힐하우스피부과 {지점}`. 외부 사이트(`healhouse*.com`) 표기 관행과 일치. 그룹 name `힐하우스피부과` 그대로 유지 (지점과 자동 구분).
- `src/app/topics/[tag]/page.tsx` — `doctorPersonRef` 의 `worksFor` 인라인 `{ "@type": "MedicalClinic", name: ... }` → `clinicIdRefForDoctor(slug)` 의 `@id` 참조로 통일. graph 에 등장 의사들의 단일 지점 schema `@id` dedup 후 inject.

### Added
- `public/.well-known/agent-card.json` — `physicians` 배열에 9인 풀세트 입력 (slug / name / alternateName / url). `_comment` placeholder 제거. `lastUpdated` 2026-05-29. (commit `67d06cf`)
- `docs/decisions/0011-seo-aeo-geo-rejected-recommendations.md` — SEO/AEO/GEO 감사 보고서 권고 중 운영자 결정 폐기 11항목 ADR. 향후 작업 추천 시 제외 기준.

### 변경하지 않음 (의도)
- `supabase/migrations/0001_init.sql:20` `doctors.clinic` default `'힐하우스피부과'` — 마이그레이션 동결.
- `src/lib/doctor-profile.ts:10` JSDoc 예시 / `src/app/admin/doctors/[slug]/edit/DoctorProfileEditForm.tsx:57` form helper — 비-schema 자유 입력 영역 (UI 안내).
- 코드 주석·docs 보고서의 자유 텍스트.
- 외부 도메인 `healhouse{gn,sw,pg,gd,dg,skin}.com` — 무관.

---

## [2026-05-29] — production 정합성 복구 + 미배포 작업 32 파일 4그룹 정리

> 라이브 사이트 `https://pbtt.kr/{editorial-policy,medical-review,disclosures,corrections,contact}` 가 not-found 페이지로 응답하던 문제 해소. 원인 분석·진단·복구 한 세션.

### 진단 (서버 측 사실 확인)
1. **사용자 신고**: 정책 페이지 chip 클릭 시 "페이지를 찾을 수 없어요" 표시. localhost 정상, pbtt.kr 만 깨짐.
2. **현장 검증 한계**: 이전 점검 보고서의 "11개 정책 페이지 200 PASS" 는 (a) dev `localhost:3000` 측정 + (b) status code 만 확인, **본문 미확인**. prod 도 200 응답하지만 본문이 `/[handle]` catch-all 의 회원 not-found 였음.
3. **root cause**: 5개 정책 페이지 디렉토리 + 인프라 파일들이 git 에 한 번도 add 된 적 없는 **untracked 상태** (mtime 2026-05-28 15:17~17:37). origin/main 에 없어서 Vercel 빌드 미포함.
4. **2차 발견** (Dropbox sync 충돌): dev 환경에서 chip 클릭 시 일시 not-found 폴백이 보이던 별개 이슈 — `.next/dev/fallback-build-manifest.json` 의 atomic rename 을 Dropbox sync 가 file lock 으로 차단 → router state header parse 실패 → 500 → not-found fallback. Dropbox 동기화 종료 + `.next` 정리 + dev 재시작으로 해소.

### Added (Commit-1 `096e46b` — 신뢰 페이지 풀세트 + SEO/AEO/GEO 인프라, 17파일)
- **신규 정책 페이지 5종** (Mayo/Cleveland Clinic 벤치마크):
  - `src/app/editorial-policy/page.tsx` 편집 정책
  - `src/app/medical-review/page.tsx` 의학 검수 프로세스 (4-date 모델)
  - `src/app/disclosures/page.tsx` 이해상충 공개
  - `src/app/corrections/page.tsx` 정정 정책 (30일 이력)
  - `src/app/contact/page.tsx` 문의
- **인프라**:
  - `src/components/info/InfoPageLayout.tsx` — 적용 대상 6개→11개 확장, `max-w-720` 제거, 외부 `max-w-1080` 컨테이너 활용, H1 24px, admin/cards 헤더 1:1.
  - `src/components/info/InfoPageFooter.tsx` — 사업자등록번호 `110-86-12345`(플레이스홀더) → **`261-86-01781`**(확정값) + 주소 강남대로 518, 4층 + 전화 02-6953-0167.
  - `src/app/about/page.tsx` — JSON-LD `publishingPrinciples` / `correctionsPolicy` / `ownershipFundingInfo` (Mayo/Cleveland 벤치마크 schema), 사업자 정보 확정, 의료기관 소속 관계 섹션, "관련 문서" 5 링크.
  - `src/app/terms/page.tsx` — "이용 안내 허브 바로가기" nav 추가.
- **부가**: `src/app/api/csp-report/route.ts` (CSP report endpoint), `public/.well-known/{agent-card.json, security.txt}` (RFC 9116), `docs/ARCHITECTURE.md` (11개 정책 라우트 명시 + SEO/AEO/GEO), `docs/PRD.md` (§5.4 SEO·AEO·GEO), `docs/AUTHOR_GUIDE.md` (신규), `docs/reports/2026-05-28-SEO-AEO-GEO-{종합보고서,초안문서부록}.md` (신규).
- ★ **분리 불가 사유**: InfoPageLayout 의 11개 적용 주석, about JSON-LD 의 5개 정책 URL 참조, footer link 깨짐 해소가 모두 정책 페이지 5개 존재에 의존 → 한 묶음 commit 필수.

### Changed (Commit-2 `cdc34f2` — 9명 → 참여 전문의 일반화, 11파일)
- 사용자 가시 metadata 2건: `src/app/page.tsx`, `doctors/page.tsx` 의 description.
- 주석·UI 안내 9건: admin 카드/draft 클라이언트, card-editor, ai/identify-doctors, schema/clinic·doctor, admin-card-extras.
- **코드 동작 변경 0**, 미래 참여 전문의 수 변동 대비.

### Security / Privacy (Commit-3 `10ea180` — 개인 이메일 일괄 정리, 3파일)
- `src/app/onboarding/OnboardingClient.tsx` — 사용자 가시 관리자 안내 이메일 `jminbae@gmail.com` → `pibutenten@gmail.com`.
- `src/app/auth/callback/route.ts` — 주석 예시 이메일 익명화 (`jminbae` → `user`).
- `docs/TECH_SPEC.md` — VAPID_SUBJECT 환경변수 예시 갱신.
- 개인 식별 이메일이 공개 사이트 안내 + 운영 docs 에 노출되던 것 회수.

### Changed (Commit-4 `09a77f8` — `.gitignore /all.json` 추가)
- `all.json` (Vercel API 응답 수동 fetch dump) — 한 번도 tracked 된 적 없어 `git rm --cached` 불필요, 파일 삭제 + ignore 추가만.

### production 검증 결과 (Commit-1 push 직후 Vercel 자동 배포 후)
| URL | 본문 키워드 hits | title |
|---|---:|---|
| `/editorial-policy` | 2 | 피부텐텐 \| 편집 정책 |
| `/medical-review` | 2 | 피부텐텐 \| 의학 검수 프로세스 |
| `/disclosures` | 2 | 피부텐텐 \| 이해상충 공개 |
| `/corrections` | 2 | 피부텐텐 \| 정정 정책 |
| `/contact` | 2 | 피부텐텐 \| 문의 |

이전: 5개 모두 `<title>피부텐텐 \| 찾을 수 없는 회원</title>` (`/[handle]` catch-all) → 이후: 정상 정책 페이지.

### 운영 교훈 (재발 방지)
1. **점검·검증은 dev 가 아닌 production 측정 우선**. 동일 라우트라도 dev 에는 untracked 파일이 살아 응답하고 prod 에는 없는 경우 status code 만 보면 가짜 PASS.
2. **status code 만으로 PASS 판정 금지**. 본문 키워드 또는 title 확인 필수. `/[handle]` catch-all 같은 fallback 라우트가 있는 사이트에서는 not-found 도 200 응답하므로 특히 그렇다.
3. **Windows + Dropbox sync + Next.js dev 충돌**: `.next` 디렉토리는 Dropbox sync 제외 권장 (또는 작업 폴더를 Dropbox 밖으로). `EPERM rename fallback-build-manifest.json` 에러가 신호.
4. **단독 커밋 원칙 유지**: `git add .` 금지, 의미 그룹 단위 명시적 stage. 본 세션의 4 그룹 분리 commit 이 정확한 사례.

### 커밋 (각 단독)
- ① `096e46b` feat: 신뢰 페이지 풀세트 + SEO/AEO/GEO 인프라 (17파일)
- ② `cdc34f2` refactor: 의사 수 일반화 9명 → 참여 전문의 (11파일)
- ③ `10ea180` chore: 개인 이메일 → pibutenten@gmail.com (3파일)
- ④ `09a77f8` chore: .gitignore 에 /all.json 추가 (1+삭제)

---

## [2026-05-29] — P1-③ + P1-⑥ + P2 8건 잔재 청소 (점검 보고서 §3)

> 항목별 단독 커밋 분리. 호출처 0건 확인 후 제거 원칙. 의심되는 항목은 보존.

### Changed (P1)
- **P1-③** (`4d59099`) — 숨김 댓글 doctor 분기 추가. PRD §4.8 "본인·admin·doctor 검토 가능" 정합. `card-select.ts` 의 doctor SELECT 절에 `id` 추가, CardData.doctor 타입에 `id` 추가, Card → CommentsBlock → CommentItem props 체인으로 `cardDoctorId` 전달. `canViewHidden = isAdmin || isAuthor || isDoctorOfCard`. RLS 우회 0 (UI 분기만).
- **P1-⑥** (`ce2de02`) — 검색 ILIKE escape 보강. backslash → `\\\\`, % _ 와일드카드 → escape, ()[],* → 공백 치환 순서. PostgREST `.ilike.` 가 PostgreSQL default escape(backslash) 호환. SQL injection 안전성은 parameterize 가 보장 — 검색 정확도 개선 목적.

### Removed / Changed (P2 잔재 청소)
- **P2-1** (`f516d8d`) — `admin-guard.ts` deprecated alias 3건 제거 (`requireActiveSuperAdmin` / `requireActiveSuperOrDoctorAdmin` / `ActiveAdminGuardResult`). 호출처 0건 확인. API_POLICY.md 의 함수 명단 정리. `adminProfileId` 필드는 `publish/route.ts` 2건 사용 중이라 보존.
- **P2-2** (`bf535c9`) — `articles/[id]/route.ts` 주석의 옛 `question/answer` → `title/body` 갱신 (0171 마이그 후속 누락분).
- **P2-3** (`23e43e4`) — `LEGACY_CATEGORY_LABELS` + `ALL_CATEGORY_LABELS` 제거. DB 데이터 잔존 0건 + 외부 호출 0건. `stripCategoryLabels` 는 `POST_CATEGORY_LABELS` Set 기반으로 단순화.
- **P2-4** (`6c53e90`) — `ai-policy.json` + `llms.txt` 의 폐기된 `/u/*` 경로 제거 (ADR 0001 회원 글 경로 단일화).
- **P2-5** (`a2c7d5f`) — hidden 카드 placeholder 로직 DRY 추출 → `src/lib/hidden-card.ts` 신설. `checkHiddenByShortcode` (회원) + `checkHiddenByDoctorPost` (의사) 두 헬퍼. 두 라우트 중복 구현 통합.
- **P2-6** (`dc96486`) — `CardData.type` 유니온 정합 (`"card" | "post" | "link"` → DB enum `"qa" | "post"`). 옛 리터럴 비교 호출처 0건 확인.
- **P2-7** (`2082757`) — `rss/route.ts` 의 `pubmed_refs` 미포함 의도 주석 명시 (외부 리더 간결성 우선, 단일 페이지 JSON-LD citation 에만 노출).
- **P2-8** (`52bb8fd`) — "폐기됨" 잔재 주석 4건 제거 (site.ts/me-cache.ts/handle.ts/post-category.ts).

### Added (SSOT 보강)
- **P2-9** — 루트 `CLAUDE.md §5` 동기화 페어 표에 2건 추가:
  - `POST_CATEGORIES` ↔ `cards.category` CHECK constraint
  - `ActiveIdentity` ↔ `resolveActiveIdentity` SELECT 절

### 보존 (호출처 발견 또는 의도 유지)
- `admin-guard.ts::adminProfileId` — `publish/route.ts` 2건 사용 (`activeProfileId` 동등 값이지만 기존 호출처 유지).
- `post-category.ts::CATEGORY_LABEL_TO_SLUG` 안 옛 "공유하기" 매핑 — 검색 입력 호환용.

---

## [2026-05-29] — site_visits 명함 단위 전환 (P1-④)

### Changed
- `src/middleware.ts` site_visits INSERT — `user_id` 를 base profile.id (`user.id`) 에서 **active profile.id** 로 전환. ADR 0012(명함 단위 완전 독립) 준수.
- IDENTITY_COOKIE 값이 UUID 면 그 active profile.id, "primary" 또는 미설정이면 base profile.id 로 fallback. **DB 조회 없이 쿠키만 읽음** (성능 영향 0).

### 단절 시점
- **2026-05-29 시점 기준 단절**: 이전 데이터는 base profile.id 로 저장되어 있어, 한 사람이 의사+회원 두 명함을 가졌어도 base id 로 합산됨. **이 시점 이후 INSERT 부터 active profile.id 로 기록** → 명함별 시계열 통계 산출 가능.
- 미래에 명함별 시계열 KPI 산출 시 이 단절점을 기점으로 cohort 분리 필요.

### KPI 회귀 점검
- `get_top_visitors_inner` RPC 는 `JOIN profiles p ON p.id = e.user_id` — base id 든 active id 든 `profiles.id` 매칭. 자동 호환, 추가 코드 변경 0.

---

## [2026-05-29] — profiles 테이블 정비 (7개 항목 일괄, 마이그 6개 + 코드 임시 숨김 1개)

> 온보딩이 줄어들면서 더 이상 안 받는 컬럼이 DB·UI 에 유령처럼 남아 있던 것을 한 번에 정리. 각 항목 단독 마이그·단독 커밋. 마이그 0179~0184 + 항목 7 코드 변경.
> **컬럼 수: 29 → 25 (4개 영구 제거: `birth_visibility`, `birth_date`, `is_public`, `liked_procedures`).**

### Removed (컬럼 DROP)
- **0179** `birth_visibility` (text) — 코드 사용 0건 + 데이터 non-default 0건. 단순 DROP.
- **0180** `birth_date` (date, 옛 컬럼) — 데이터 0%, 현행 `birthdate` 와 별개. `admin/users/[id]/page.tsx` SELECT·타입·표시줄 3건 + `error-response.ts` mask 키 1건 동시 정리.
- **0183** `is_public` (bool) — 변경 UI 없는 unused. 정책상 모든 프로필 공개 확정.
  - `public_profiles_view` (0122 anon GRANT view) CASCADE 금지하고 컬럼만 빼서 재정의.
  - `anonymize_user_content_before_delete` 함수 재정의 (is_public=false 라인 제거).
  - 코드: `[handle]/page.tsx` robots 분기 → 항상 index, `admin/users/[id]` "공개:" 표시줄 제거, `ProfileTabs.tsx` 주석 정리.
- **0184** `liked_procedures` (text[]) — 데이터 6.8%, 온보딩 §5 관심 키워드와 의미 중복.
  - `anonymize_user_content_before_delete` 재정의 (라인 제거).
  - `propagate_onboarding_to_doctor_bundle` 재정의 (SELECT + UPDATE 두 곳 라인 제거).
  - `field_visibility` JSON 키 일괄 제거 (44명 전원 → 0건).
  - 코드 5파일: `profile-options.ts` 타입·DEFAULT, `settings/profile/page.tsx` SELECT·prop, `settings/profile/ProfileEditClient.tsx` 섹션 9 + 상태·핸들러·저장 payload, `[handle]/page.tsx` SELECT·skinInfo, `ProfileTabs.tsx` "제가 좋아하는 시술은요.." 분기 제거.

### Changed (스키마·데이터 정비)
- **0181** `marketing_email_consent` — `DROP NOT NULL` + `DROP DEFAULT`. NULL=미응답 / false=명시 거부 / true=동의 3-state. 정통망법상 동의 누락 vs 명시 거부 구분. **데이터 변경 0** (true 20, false 24 유지).
- **0182** `bio` — `ALTER DEFAULT ''` + 기존 NULL 31명 일괄 빈 문자열로 통일. 이후 NULL 안 나타남. 실제 자기소개 13명 그대로. "만나서 반갑습니다." 텍스트는 DB 에 0건이라 별도 UPDATE 불필요.

### Changed (코드 임시 숨김 — 컬럼 유지)
- 항목 ⑦ `level` / `activity_score` — `admin/users/[id]/page.tsx` 의 "Lv.0 일반" 뱃지(line 400~407) + "활동점수: 0" 표시줄(line 425) 주석 + TODO 마커. 컬럼·SELECT·타입·`LEVEL_COLORS`/`LEVEL_LABELS` import 모두 유지(향후 산정 로직 도입 시 즉시 활성화).

### 사전 조사 결과 (DB 의존 객체 스캔)
- 코드 grep + `pg_proc`·`pg_views`·`pg_policies`·`pg_indexes` 통합 ILIKE 스캔 → 4건 의존성 발견:
  - `is_public` → `public_profiles_view` (view) + `anonymize` (function)
  - `liked_procedures` → `anonymize` + `propagate_onboarding_to_doctor_bundle` (function 2개)
- `birth_visibility`·`birth_date` 는 DB 의존 객체 0건. 단순 DROP 만으로 안전.

### 검증
- 각 단계 끝마다 `tsc --noEmit` + `npm run build` 통과. production 마이그 6개 Supabase Management API 로 즉시 적용 후 컬럼·view·field_visibility 키 검증 쿼리로 확인.
- DB 데이터 손실: `liked_procedures` 3명 입력값 + `birth_date` 0건 + `birth_visibility` 0건 + `is_public` non-true 0건 = 실질 3행 분량 (4개 컬럼 DROP). 6번·5번은 데이터 보존.

### 커밋 (각 단독)
- ① `46e42e2` 0179_drop_birth_visibility
- ② `a2ae574` 0180_drop_birth_date_legacy
- ⑦ `115321c` admin level/activity_score 표시 숨김 (마이그 없음)
- ⑥ `09b8e32` 0181_marketing_consent_nullable
- ⑤ `61bb179` 0182_bio_empty_string
- ④ `bcd685f` 0183_drop_is_public
- ③ `1e23de9` 0184_drop_liked_procedures

---

## [2026-05-28] — audit_logs 누락 액션 3종 보강 (P1-⑤)

### Added (audit action)
- `comment.screening_hide` — `src/app/api/comments/route.ts` POST: 회원 댓글이 자동검수에 걸려 `status='hidden'` 처리될 때 적재. metadata: `{cardId, parentId, reasons}`.
- `card.status_change` — `src/app/api/articles/route.ts` POST + `src/app/api/articles/[id]/route.ts` PUT: 회원 글이 검수에 의해 `status='pending_review'` 로 강제 전환될 때 적재. metadata: `{from_status, to_status: "pending_review", cause: "screening_auto", reasons}`. admin 명시 status 변경은 기존 `card.admin_update` 가 잡음 (중복 회피).

### Changed (audit metadata)
- `admin.role_change` (`src/app/api/admin/users/[id]/role/route.ts`) — `actorProfileId: guard.activeProfileId` 보강. 어느 admin 명함이 실행했는지 추적 (기존엔 `actorAuthUserId` 만).

### 배경
- PRD §5.1 "audit_logs 1년 보관 (민감 API: 회원 탈퇴, 권한 변경, identity 전환)" 명시 범위를 콘텐츠 자동 차단(댓글 hidden, 카드 pending_review) 까지 확장. PIPA 안전성 확보조치 §8 추적 보강.
- 점검 보고서 §2 P1-⑤ 근거.

### 검증
- `tsc --noEmit` 통과 / `npm run build` 통과 (54 라우트).
- `logAudit` 가 try/catch 내부 처리 (`src/lib/audit-log.ts:62~88`) → 본 흐름 차단 0. append-only.
- DB 스키마·마이그레이션 변경 0.

---

## [2026-05-28] — 카드 자동검수 silent fail 해소 (P1-②)

### Changed (API 응답)
- `src/app/api/articles/route.ts` (POST) — 회원 글이 검수에 걸려 `status='pending_review'` 로 전환될 때 응답에 `screening: { status, reasons, userMessage } | null` 필드 포함. 정상 글은 `null`.
- `src/app/api/articles/[id]/route.ts` (PUT) — 회원이 본문/제목 수정 시 동일 패턴 적용. POST 와 응답 구조 동일.

### Changed (클라이언트 토스트)
- `src/app/write/WriteClient.tsx` — 응답의 `screening` 객체 존재 시 `showToast(...,{ tone: "danger" })` 1회 노출 후 1.5초 대기 → redirect. 정상 글은 즉시 redirect (회귀 0).
- `src/app/write/[shortcode]/EditClient.tsx` — 동일 패턴. 수정 흐름의 silent fail 도 함께 해소.
- 메시지 톤: `CommentsBlock` 댓글 검수 안내와 일관 (광고성·대가성·단정 표현 안내 + 검토 대기 전환).

### 배경 / 정책
- PRD §4.7 "임계 초과: 카드 status='pending_review' / 댓글 status='hidden' + **작성자에게 1회 안내 (silent fail 방지)**".
- 댓글 라우트는 2026-05-28 추가 시 응답에 screening 필드를 포함했으나, 카드 라우트는 status 변경만 하고 응답 확장이 누락 → 회원은 자기 글이 왜 안 보이는지 모름. 본 PR 로 닫음.
- 점검 보고서 §2 P1-② 근거. 보고서는 POST 만 언급했으나 PUT 도 동일 silent fail 이라 본 PR 에 함께 포함.

### 검증
- `tsc --noEmit` 통과 / `npm run build` 통과 (54 라우트 전체).
- 응답 필드 "추가" 라 기존 클라이언트 회귀 0. 정상 글은 분기 미진입 → 1.5초 대기 미발생.
- DB 스키마·마이그레이션 변경 0.

---

## [2026-05-28] — 자살·자해 안전 키워드 사전 보강 (P1-①)

### Changed
- `src/lib/content-screening-dict.ts::SUICIDE_SELF_HARM_KEYWORDS` — 10개 → **26개로 확장 (16개 추가)**.
  - 위기 평가 임상 1순위 완곡: `그만 살고 싶`, `더 이상 살고 싶지 않`, `없어지고 싶`
  - "사라" 계열 좁힌 형태: `내가 사라`, `나도 사라`, `그냥 사라졌으면` (피부 콘텐츠 "흉터/기미가 사라" 오탐 회피)
  - 자해 행동: `스스로 다치`, `스스로를 다치`, `그었`, `긋고`, `손목을 그어/그었`, `팔을 그어/그었` (단순 `손목/팔을 그`는 "그늘" 일상 충돌로 제외)
  - 띄어쓰기·줄임말 변형: `극단적선택`, `극단선택`
- 사용처(SSOT): CardEditor / WriteClient / CommentForm 3곳 자동 동기.

### 검증
- Node 정적 매치 60건: 위기군(A/B/C) 25/32 = 78% (이전 46%), 회귀 0건, 카드 피부 콘텐츠 F1~F8 오탐 0건.
- 남은 오탐 2건(`선을 긋고` / `줄 그었어요` — 그림·낙서 맥락) — 사용자 정책상 허용 범위(위기 캡처 우선).
- 점검 보고서 §1.A 의 임상 1순위 누락 B3/B4/C3/E1 4건 모두 해소.

### 미보강 (사용자 사후 결정 사안)
- 은유 표현 B5/B6/B7/B8/B9/B10 (사라졌으면/눈 감고/내일이 안 왔/그만하고 싶/끝내버리고/이대로 사라졌으면) — substring 매치로는 안전 확장 불가, 정규식 도입 시 별도 검토.
- 자해 행동 묘사 C5 (`팔에 자국`) — 짧은 phrase 일반어 충돌 가능.

### 관련
- 점검 보고서 §2 P1-① (2026-05-28). P1-① CommentForm 모달 코드는 이미 정상 구현됨(거짓 양성), 본 PR 은 탐지 사전만 보강.

---

## [2026-05-28] — 문서 동기화 (env + DEPLOYMENT.md)

### Added
- `.env.local.example` — 오늘 추가된 env 9개 명시:
  - `SITE_PUBLIC` (사이트 공개 스위치, Production only)
  - `NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION` / `_NAVER_` / `_BING_` (검색엔진 인증)
  - `NEXT_PUBLIC_GA4_MEASUREMENT_ID` / `NEXT_PUBLIC_NAVER_ANALYTICS_ID` (Analytics)
  - `INDEXNOW_KEY` / `CRON_SECRET` (IndexNow + Vercel Cron)
  - `VERCEL_TOKEN` (로컬 자동화)
- `docs/DEPLOYMENT.md` §10 — 환경변수 매트릭스 (카테고리·target·민감도 분류).

### Changed
- `docs/DEPLOYMENT.md` §9 "베타 → 공개 전환 (예정)" → "공개 완료 (2026-05-28)" 로 갱신. robots fail-safe / 검색엔진 등록 / Analytics 가동 / IndexNow Cron 완료 반영.

### Removed
- `docs/CHANGELOG.md.tmp.*` 임시 파일 2개 정리.

---

## [2026-05-28] — Naver Analytics 스크립트 도메인 수정 (wcs.pstatic.net)

### Fixed
- `src/app/layout.tsx` — 네이버 Analytics script src 를 `wcs.naver.net` → `wcs.pstatic.net` 으로 수정. 네이버 공식 안내 도메인 일치.
- `next.config.ts` CSP `script-src` 도 동일 수정.

### 운영
- Vercel env `NEXT_PUBLIC_NAVER_ANALYTICS_ID=5d1db0791001f8` 추가 완료 (Production/Preview/Development).

---

## [2026-05-28] — Analytics 스택 설치 (Vercel + GA4 + Naver)

### Added
- `@vercel/analytics` + `@vercel/speed-insights` 설치 — CWV field data + page view 자동 측정.
- `src/app/layout.tsx`:
  - `<Analytics />` + `<SpeedInsights />` body 끝에 삽입.
  - GA4 gtag script — `NEXT_PUBLIC_GA4_MEASUREMENT_ID` 있을 때만 로드. `anonymize_ip:true`, `allow_google_signals:false`, `allow_ad_personalization_signals:false` 강제 + `send_page_view:false` 후 sanitized page_view 직접 발화 — `/search` query string 제거하여 의료 검색어 GA4 적재 회피.
  - Naver Analytics (wcs) — `NEXT_PUBLIC_NAVER_ANALYTICS_ID` 있을 때만 로드.

### Changed (CSP)
- `next.config.ts` CSP-Report-Only 화이트리스트 확장:
  - `script-src` += `va.vercel-scripts.com`, `www.googletagmanager.com`, `wcs.naver.net`.
  - `connect-src` += `va.vercel-scripts.com`, `www.googletagmanager.com`, `www.google-analytics.com`, `analytics.google.com`, `wcs.naver.com`.
  - `img-src` += `www.google-analytics.com`, `www.googletagmanager.com` (GA4 GIF beacon).

### 운영자 발급 대기 ID
- `NEXT_PUBLIC_GA4_MEASUREMENT_ID` — GA4 측정 ID (예: `G-XXXXXXXXXX`).
- `NEXT_PUBLIC_NAVER_ANALYTICS_ID` — 네이버 Analytics 발급 코드 (예: `s_xxxxxxxxxxx`).
- 미발급 상태에서는 해당 스크립트 자체가 로드 안 됨 (fail-safe).

---

## [2026-05-28] — IndexNow 자동 ping (Bing/Yandex/Seznam/Yep)

### Added
- `src/app/api/cron/indexnow/route.ts` — Vercel Cron 핸들러. 직전 26h 내 발행/갱신된 의사 Q&A 글 URL 을 IndexNow API 에 일괄 통보.
  - 회원 글 제외 (`category='qa' AND doctor_id IS NOT NULL`).
  - Authorization: Bearer `CRON_SECRET` 검증으로 외부 무단 호출 차단.
  - 빈 응답 시 ping 0건 정상 종료.
- `public/{INDEXNOW_KEY}.txt` — IndexNow 소유권 증명 파일.
- `vercel.json` `crons` 추가 — `0 19 * * *` (UTC 19:00 = KST 04:00 매일 1회).
- Vercel env — `INDEXNOW_KEY` (production/preview/development), `CRON_SECRET` (production only).

### 배경
- Google·Naver 는 IndexNow 미지원이지만 Bing 색인 = ChatGPT 검색 기반 → AI 답변 인용 가속 간접 효과.
- 비용 0, 단일 실패점 없음 (IndexNow 다운돼도 sitemap 일반 색인은 계속).

---

## [2026-05-28] — RSS 라우트 경로 정리

### Fixed
- `src/app/rss.xml/route.ts` → `src/app/rss/route.ts` 로 이동.
  - 사유: Next.js dot-in-path 라우트 폴더 (`app/rss.xml/`) 가 production 에서 정적 fallback 으로 잘못 매칭되어 `pbtt.kr/rss.xml` 응답이 RSS XML 이 아닌 HTML 페이지를 반환하던 회귀 해소. 네이버 서치어드바이저 RSS 제출 시 "사이트맵/RSS 형식이 올바르지 않습니다" 오류 차단.
- `next.config.ts` — `rewrites()` 추가. 외부 노출 URL `/rss.xml` → 내부 라우트 `/rss` 매핑. 색인 URL 변경 없음.

---

## [2026-05-28] — robots/sitemap force-dynamic + SITE_PUBLIC 공개 전환

### Changed
- `src/app/robots.ts` / `src/app/sitemap.ts` — `export const dynamic = "force-dynamic"` 추가.
  - Vercel build cache 가 robots/sitemap 산출물을 재사용하여 SITE_PUBLIC env 변경 후에도 fail-safe 응답이 잔존하는 회귀 차단.
  - 매 요청 evaluation 으로 SITE_PUBLIC 토글이 즉시 반영.

### Operational
- Vercel Production env 에 `SITE_PUBLIC=true` 추가 → 사이트 공개 (HOLD 해제).
- robots.txt 가 3-tier 정책 (검색엔진 Allow / AI 답변봇 Allow / AI 학습봇 Disallow) 으로 정상 출력.

---

## [2026-05-28] — 검색엔진 verification 빈 메타태그 방지

### Fixed
- `src/app/layout.tsx` — `metadata.verification` 빈 문자열 폴백(`|| ""`) 제거. 토큰 미발급 상태에서 `<meta name="naver-site-verification" content="" />` 같은 빈 메타가 렌더되어 Naver Search Advisor 가 "잘못된 토큰" 으로 오판할 위험 차단.
- `buildVerification()` 헬퍼 신설 — env 값(`NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION` / `NEXT_PUBLIC_NAVER_SITE_VERIFICATION` / `NEXT_PUBLIC_BING_SITE_VERIFICATION`) 이 비었으면 해당 키를 객체에서 완전 제외. `trim()` 으로 공백만 입력된 경우도 차단.

### 운영 절차
- 운영자가 3개 콘솔(GSC / 네이버 서치어드바이저 / Bing Webmaster)에서 토큰 발급 후 Vercel 환경변수에 입력 → redeploy 만으로 즉시 활성.

---

## [2026-05-28] — 정책 chip 2단 구조 + Footer 8개 정제 (SSOT 도입)

> 칩 4 vs Footer 11 인지 부조화 해소. SSOT 도입으로 chip nav 와 footer 자동 동기화 → 누더기 차단.

### Added (SSOT)
- `src/lib/policy-nav.ts` 신설 — 11개 정책·안내 페이지 4개 대분류 매핑 단일 출처.
  - `POLICY_NAV`: 3/4/2/2 분배 (소개 / 콘텐츠 정책 / 이용 안내 / 문의·신고)
  - `PAGE_TO_CATEGORY`: 페이지 key → 카테고리 역인덱스
  - `FOOTER_ITEMS`: `inFooter: true` 필터링된 8개 (정의 순서 유지)
  - `getCategory(key)`: 카테고리 lookup

### Changed (chip nav 2단 구조)
- `src/components/info/InfoPageNav.tsx` — 1단 chip 4개 + 2단 sub-chip (활성 카테고리 sub) 2단 구조로 재작성.
  - 1단 active: solid primary (진한 채움) / inactive: outline + muted
  - 2단 active: soft primary (옅은 배경 + primary 텍스트) / inactive: outline + muted
  - `<nav aria-label>` 2개 (대분류 / 세부 정책) 명시 + `aria-current="page"` 활성 표시
  - sub 항목 1개뿐이면 sub-chip 미노출 (현재 모든 카테고리 ≥2 이므로 항상 노출)
  - 매핑 SSOT 의존 — PARENT_HUB·PAGES 상수 제거 (policy-nav.ts 로 이전)

### Changed (footer 8개 정제)
- `src/components/SiteFooter.tsx` — 하드코딩 11개 링크 → `FOOTER_ITEMS.map()` 으로 SSOT 의존.
  - footer 노출 8개: 사이트 안내 / 편집 정책 / 의학 검수 프로세스 / 의료 정보 안내 / 이용약관 / 개인정보 처리방침 / 문의 / 콘텐츠 신고
  - footer 제외 3개 (sub-chip + sitemap 으로 접근): 이해상충 공개 / 정정 정책 / 의사 답변 가이드라인
  - 분류 근거: 법적 의무 4 (이용약관·개인정보·문의·신고) + 신뢰성 4 (Mayo/Cleveland Clinic 벤치마크 YMYL/E-E-A-T signal)
  - footer `<nav aria-label="사이트 정책">` 명시

### 카테고리 매핑 표 (3/4/2/2)
| 1단 chip | sub-chip | URL | footer |
|---|---|---|---|
| **소개** | 사이트 안내 | `/about` | O |
|  | 편집 정책 | `/editorial-policy` | O |
|  | 의학 검수 프로세스 | `/medical-review` | O |
| **콘텐츠 정책** | 의료 정보 안내 | `/disclaimer` | O |
|  | 이해상충 공개 | `/disclosures` | X (sub-chip만) |
|  | 정정 정책 | `/corrections` | X (sub-chip만) |
|  | 의사 답변 가이드라인 | `/doctor-guidelines` | X (sub-chip만) |
| **이용 안내** | 이용약관 | `/terms` | O |
|  | 개인정보 처리방침 | `/privacy` | O |
| **문의·신고** | 문의 | `/contact` | O |
|  | 콘텐츠 신고 | `/report` | O |

### SEO/AEO/GEO 영향 분석
- **SEO 색인**: 모든 11페이지 sitemap.ts 등재 유지 → 색인 누락 없음.
- **AEO**: llms.txt + 본문 콘텐츠가 메인 신호. footer 노출 여부 무관.
- **GEO** (E-E-A-T / YMYL): 의료 사이트 신뢰 핵심 3개 (편집 정책 / 의학 검수 / 의료 정보 안내) footer 유지 → GEO signal 보존.
- footer 제외 3개의 internal link PR 가중치만 약간 감소 (색인은 100% 보장).

### 회귀 위험·완화
- 카테고리 매핑 변경으로 기존 chip 활성 표시가 일부 페이지에서 달라짐 (예: editorial-policy 가 "콘텐츠 정책" → "소개" 로 이동).
  - sitemap·URL 모두 불변 → 외부 검색엔진·북마크에 영향 없음.
- chip 컴포넌트 props 시그니처 (`current: InfoPageKey`) 불변 → 11페이지 호출처 코드 변경 0건.
- `InfoPageKey` type 재export 유지 → 외부 import 호환.

---

## [2026-05-28] — InfoPageLayout 폭·헤더 통일 + 9명/9인 일반화 + 대표 한 줄 통합

> 인지 부담 축소 + 미래 확장성 + 대시보드 레이아웃 정합. SITE_PUBLIC HOLD 유지.

### Changed (InfoPageLayout 폭·헤더 통일 — 대시보드 패턴)
- `src/components/info/InfoPageLayout.tsx` — 대시보드 (admin/*, doctor/*) 페이지와 1:1 정합 적용:
  - `max-w-[720px]` 제거 → 외부 layout 의 `max-w-1080` 컨테이너 활용 (본문 폭 확대)
  - `<div className="mx-auto w-full max-w-[720px] px-4 py-6 sm:px-6">` → `<section className="w-full py-6">` (admin/cards 와 동일)
  - BackButton wrapper: `mb-1 -ml-1` (변경 없음, admin 과 동일)
  - 헤더 박스: `<div className="mb-5 pl-1">` 추가 (admin 헤더 패턴)
  - H1: `text-[26px] sm:text-[30px]` → **`text-2xl`** (=24px, admin/cards/comments/users/reports/doctor 전부와 동일)
  - subtitle: `text-[13px]` → **`mt-1 text-xs`** (=12px, admin 헤더 보조와 동일)
- 적용 대상: /about, /terms, /privacy, /doctor-guidelines, /disclaimer, /report, /contact, /editorial-policy, /medical-review, /corrections, /disclosures (전 11페이지 일괄)

### Changed (대표 + 운영책임자 한 줄 통합)
- `src/app/about/page.tsx` 운영 주체 섹션, `src/app/contact/page.tsx` 회사 정보 섹션 — 두 줄 `대표: 배정민 / 운영 책임자: 배정민` → 한 줄 **`대표 및 운영책임자: 배정민`**.

### Changed (9명/9인 일반화 — 미래 참여 전문의 수 변동 대비)
- 사용자 가시 텍스트 전수 일반화:
  - `src/app/about/page.tsx` — metadata description / schema description / UI 본문 "9명" link / "참여 전문의 9명은" 4곳
  - `src/app/disclosures/page.tsx` §3 — "참여 전문의 9인은" → "참여 전문의는"
  - `src/app/doctors/page.tsx` — metadata + OG description 2곳
  - `src/app/editorial-policy/page.tsx` §5 — "9명 의사 답변·작성자" → "참여 전문의의 답변·작성자"
  - `src/app/page.tsx` 홈 — metadata description
  - `public/llms.txt` — 사이트 설명·참여 전문의 목록 항목
  - `public/.well-known/agent-card.json` — description + `_comment`
- 코드 주석·내부 문자열 일반화 (변수명·로직 불변): EditClient.tsx, DraftClient.tsx (admin UI "이 자막에는 등록된 원장 9명 중" → "등록 원장님들 중"), analyze/route.ts, layout.tsx, robots.ts, sitemap.ts, WriteClient.tsx, CardEditor.tsx, CardEditorMeta.tsx, admin-card-extras.ts, identify-doctors.ts, schema/clinic.ts, schema/doctor.ts, docs/ARCHITECTURE.md
- 미래 참조 운영 문서 일반화: `docs/AUTHOR_GUIDE.md`, `docs/TECH_SPEC.md`
- **시점 기록 문서 의도적 보존**: `docs/CHANGELOG.md` 과거 블록, `docs/PRD.md` §6 KPI (베타 기간 통계), `docs/decisions/*`, `docs/reports/*` — 작성 시점 사실 그대로
- 검수: `grep -rn "9명\|9인" src public` 결과 **0건**

### 칩 vs Footer 일관성 — 운영자 확인 대기
- 사용자 지적: 칩 4개 vs Footer 11개 인지 부조화. **A안 (Footer 도 4개로 축소) 권장**. 본 배치에선 미실행 — 운영자 결정 후 후속 PR 로 처리.

### 보존 (의도 유지)
- robots.ts SITE_PUBLIC HOLD 유지
- sitemap.xml 의 정책 페이지 11종 URL 유지
- 각 페이지 JSON-LD schema 변경 없음

---

## [2026-05-28] — InfoPageNav 칩 통합 (11→4) + disclosures §1 정리 (HOLD 유지)

> SITE_PUBLIC 은 계속 false (HOLD). 기존 페이지 URL·JSON-LD·sitemap 모두 유지 → SEO 손실 0. nav 진입점만 사용자 인지 부담 축소 목적으로 통합.

### Changed (InfoPageNav 통합)
- `src/components/info/InfoPageNav.tsx` — 칩 11개 → **4개로 통합**: `소개(/about)` · `콘텐츠 정책(/editorial-policy)` · `이용 안내(/terms)` · `문의·신고(/contact)`. InfoPageKey 11개는 그대로 유지하고 `PARENT_HUB` 매핑으로 비-칩 페이지 (medical-review/corrections/disclosures/doctor-guidelines/privacy/disclaimer/report) 가 어느 허브 칩 active 상태로 표시될지 결정.
- aria-current 매핑 검증 11/11 정확: medical-review/corrections/disclosures/doctor-guidelines → 콘텐츠 정책 / privacy/disclaimer → 이용 안내 / report → 문의·신고.

### Added (각 허브 본문에 바로가기 블록)
- `src/app/editorial-policy/page.tsx` — H1 직후 "관련 정책 바로가기" 블록: 의학 검수 / 정정 정책 / 이해상충 공개 / 의사 답변 가이드라인 4링크.
- `src/app/contact/page.tsx` — H1 직후 "빠른 접근" 블록: 콘텐츠 신고 / 보안 취약점 제보 / 정정 요청 / 이해상충 공개 4링크.
- `src/app/terms/page.tsx` — H1 직후 "관련 안내 바로가기" 블록: 개인정보 / 의료 정보 안내 / 의사 답변 가이드라인 3링크.

### Changed (전 페이지 접근 보장)
- `src/components/SiteFooter.tsx` — footer nav 6 → **11개 링크로 확장**. 칩 축소로 인한 비-칩 페이지 도달 보장 (전 11페이지: about/editorial-policy/medical-review/corrections/disclosures/doctor-guidelines/disclaimer/terms/privacy/contact/report). 검수 11/11 PASS.

### Changed (disclosures §1)
- `src/app/disclosures/page.tsx` — §1 라벨 "운영주체 자본 관계" → **"운영주체 측 이해상충"**. 본문은 운영자 지시 3줄로 교체:
  - "운영 주체: 주식회사 진솔컴퍼니 (사업자등록번호 261-86-01781)"
  - "본 서비스는 광고·협찬을 받지 않으며, 특정 의료기관·의료법인과 광고·송객·수수료 계약을 체결하지 않습니다."
  - "본 서비스는 의료기관이 아닌 정보 플랫폼이며, 운영 주체는 진료·처방 행위를 하지 않습니다."
- **"겸직" / "대표이사" / "참여 전문의는 운영사와 관계 없음" 단정 문장 모두 삭제** (grep 검수 0건). 사유: 전문의-운영사 관계를 단정하지 않는 정책으로 통일.

### 보존 (의도 유지)
- /privacy 와 /terms 는 독립 URL 그대로 유지 (PIPA §30 의무 + 약관 단독 문서).
- `src/app/sitemap.ts` 의 정책 페이지 11종 URL 그대로 유지 (sitemap 에서 칩 축소 영향 없음).
- 각 페이지 JSON-LD schema 변경 없음.
- robots.ts SITE_PUBLIC HOLD 유지.

---

## [2026-05-28] — SEO/AEO/GEO 일괄 생성 (HOLD 모드)

> 4명 독립 분석 (보고서 `docs/reports/2026-05-28-SEO-AEO-GEO-종합보고서.md` + 부록) 기반 일괄 적용.
> **공개 차단 유지**: `SITE_PUBLIC` env 기본값 미설정 → robots fail-safe 전체 차단. 공개는 운영자가 Vercel 환경변수 `SITE_PUBLIC=true` 추가 후 redeploy.

### Added (노출 인프라)
- `src/app/robots.ts` — **SITE_PUBLIC 스위치** + 3-tier AI 크롤러 정책 (학습 차단 / 검색·답변 허용 / 일반 검색 허용). 접두 매칭 함정 회피: `/doctor` `/me` 를 DISALLOW_COMMON 에서 제외 (→ `/doctors/*` `/doctor-guidelines` `/medical-review` 차단 방지).
- `src/app/rss.xml/route.ts` — RSS 2.0, 의사 Q&A 최신 50건. 회원 글 누출 방지 필터 (status=published + doctor_id IS NOT NULL + category=qa). 네이버 freshness signal.
- `src/app/api/csp-report/route.ts` — CSP 위반 보고 endpoint. console.warn 적재. POST/OPTIONS 처리.
- `public/.well-known/security.txt` — RFC 9116. Contact 단일 `pibutenten@gmail.com`. Expires 2027-05-28.
- `public/.well-known/agent-card.json` — AI 에이전트 인터페이스. citationPolicy + endpoints + structuredData + publisher (회사 정보 + 사업자번호 + 주소 + 전화).
- `public/.well-known/ai-policy.json` — IETF AI Preferences draft. training:disallow / search:allow / answerWithCitation:allow. 회원 글 path exception.
- `public/llms.txt` — minimal 22줄 → 풀버전 (llmstxt.org). 9명 의사 슬러그 플레이스홀더 (의사목록 링크). `/qa/*` 폐기 라우트 제거. 회사 정보 (사업자번호·주소·전화) 명시.
- `vercel.json` — 정적 자산 (`/fonts`, `/icons`, `/og`, `/_next/static`) Cache-Control immutable + CORP cross-origin.

### Added (신뢰 페이지 — Mayo/Cleveland Clinic/Healthline/WebMD 벤치마크)
- `src/app/contact/page.tsx` — 회사 정보 + 8 채널 메일 태그 (일반/정정/컴플라이언스/보안/의사등록/언론). ContactPage schema.
- `src/app/editorial-policy/page.tsx` — 5단계 워크플로우 + 출처 우선순위 + **AI 사용 정책 [확정정보]** (유튜브·릴스 영상 → AI 가독성·구성 보조 → 전문의 검수). AboutPage schema.
- `src/app/medical-review/page.tsx` — 6단계 검수 흐름 + 4-date 모델. AboutPage schema.
- `src/app/corrections/page.tsx` — 30일 정정 이력 + 5분류 표 + 정정 표시 형식 + "현재 공개된 정정 이력이 없습니다." 정적.
- `src/app/disclosures/page.tsx` — **운영자 [확정정보] 옵션 3** 적용: §1 배정민 운영사 대표 겸직 / §3 의사별 표 없음 (관련 답변 발생 시 개별 고지) / §6 갱신 주기 단순화.

### Added (운영 문서)
- `docs/AUTHOR_GUIDE.md` — 의사 작성 가이드 (GEO 패턴: 통계 1개·PubMed 1개·blockquote 1개 + 의료법 회피 표현 사전 + 4-date 모델 + 재검수 주기).

### Changed (기존 파일 부분 수정)
- `src/app/about/page.tsx` — 미션 섹션 추가 ("피부 시술에 대한 궁금증, 검증된 피부과 전문의가 답해드립니다."). 회사 정보 완성 (대표·주소·전화). 의료기관 소속 관계 섹션 추가. 관련 문서 9링크로 확장. MedicalOrganization schema 에 publishingPrinciples/ethicsPolicy/correctionsPolicy/ownershipFundingInfo + parentOrganization.taxID/address/telephone + contactPoint.telephone 추가.
- `src/app/sitemap.ts` — 정책 페이지 9종 staticRoutes 추가 (editorial-policy/medical-review/corrections/disclosures/disclaimer/doctor-guidelines/contact/terms/privacy). cards.updated_at select 추가 + lastModified `updated_at ?? created_at` 우선순위 (Freshness signal 강화).
- `next.config.ts` — CSP `report-uri /api/csp-report` + `report-to default` + Report-To 헤더 + COOP/CORP same-origin + Permissions-Policy 확장 (payment/usb/interest-cohort/browsing-topics).
- `src/app/layout.tsx` — metadata.verification env 기반 플레이스홀더 (NEXT_PUBLIC_NAVER_SITE_VERIFICATION / GOOGLE / BING).
- `src/components/info/InfoPageNav.tsx` — InfoPageKey 5개 확장 (contact/editorial-policy/medical-review/corrections/disclosures). 칩 11종.
- `src/components/info/InfoPageFooter.tsx` — **사업자등록번호 교정**: `110-86-12345` (플레이스홀더였음) → `261-86-01781` ([확정정보]). 주소 + 전화 추가.

### Fixed (운영자 개인메일 노출 정리)
- 운영자 개인메일 노출 0건 (검수: src/public/docs 전수 grep 0건). 전 채널 `pibutenten@gmail.com` 단일 통일.
- `src/app/onboarding/OnboardingClient.tsx:722` — UI 메시지 안의 운영자 개인메일 → `pibutenten@gmail.com` (사용자 가시 텍스트, 가장 중요).
- `docs/PRD.md` §1 운영사 이메일 교체.
- `docs/TECH_SPEC.md` VAPID_SUBJECT 예시 교체.
- `src/app/auth/callback/route.ts` / `src/app/[handle]/page.tsx` / `src/lib/error-response.ts` 코드 주석 예시 교체 (`user@gmail.com` 일반화).
- `docs/reports/2026-05-28-SEO-AEO-GEO-*` 부록 보고서 일괄 치환.

### Notes (운영자 결정 대기 — 플레이스홀더)
- `metadata.verification` 토큰 발급 후 Vercel env 입력 (Naver/Google/Bing).
- `agent-card.json` physicians 배열은 9명 slug 운영자 입력 대기 (현재는 `/doctors` 목록 링크).
- `procedures` 마스터 테이블 + 부작용 자동 삽입 시스템은 본 배치에서 **제외** (시술별 부작용 텍스트는 9명 의사 합의 검수 필수 — 임의 생성 금지).
- ⚠ 의사별 이해상충 표 미작성 (옵션 3, 관련 답변 발생 시 개별 고지).
- ⚠ `SITE_PUBLIC` env 추가는 운영자가 직접 — 본 배치는 HOLD 유지.

### 공개 전환 절차
1. Vercel Project → Environment Variables 에 `SITE_PUBLIC=true` 추가 (Production)
2. Redeploy → `/robots.txt` 가 3-tier 정책으로 환원되는지 확인
3. Naver Search Advisor / Google Search Console / Bing Webmaster 등록 + sitemap·RSS 제출
4. verification 토큰 발급 → `NEXT_PUBLIC_NAVER_SITE_VERIFICATION` / `_GOOGLE_` / `_BING_` env 입력
5. Vercel logs 에서 GPTBot/ClaudeBot 등 AI 봇 user-agent 정책 일치 검증 (주별)

---

## [2026-05-28] — 사용자 보고 UX fix 묶음 (BackButton·admin/reports 헤더·삭제 카드 라벨)

### Fixed (UX·UI 정합)
- **BackButton 위·아래 여백 축소** (`src/components/BackButton.tsx`): `paddingTop/Bottom 16px → 6px`, `min-h-[48px] → min-h-[32px]`. 모바일에서 `← 뒤로` 위 빈 공간이 과해 보이는 회귀 해소 (전 페이지 공통).
- **`/admin/reports` BackButton 누락 추가** (`src/app/admin/reports/page.tsx`): 다른 admin 페이지와 동일 `<div className="mb-1 -ml-1"><BackButton /></div>` 패턴.
- **`/admin/reports` 헤더 규격 통일**: 옛 `<main mx-auto max-w-5xl px-4>` (들여쓰기 발생) → `<section className="w-full py-6">` + `<div className="mb-5 pl-1">` + `text-2xl` 제목 + `text-xs` 서브설명. admin/cards / admin/comments 와 1:1 정합.

### Fixed (admin/cards 삭제됨 탭)
- **Pick 위치는 PickToggle 만**: 옛 동작은 `r.deleted_at` 일 때 `<RestoreButton/>` 로 바뀌어 Pick 토글이 사라지던 회귀. `<PickToggle/>` 만 유지하도록 정정 (RestoreButton import 제거).
- **상태 컬럼 "삭제" 라벨**: `STATUS_STYLE.deleted` 신설 (빨간 톤 "삭제"). row 렌더에서 `r.deleted_at` 있으면 원 status (발행/대기) 대신 "삭제" 라벨 override. 옛 동작은 삭제됨 탭에서도 발행/대기로 표시되어 혼란.
- **본문 [올리기] → 자동 복구**: EditClient `handleSubmit` 에서 `action === "publish"` 이고 카드가 `deleted_at` 일 때 `apiPayload.deleted_at = null` 추가 → 발행 + 복구가 한 액션으로. 본문 [지우기] 는 `soft_delete_card` RPC 그대로. 흐름 통일.
- `EditClient` Card type + `edit/page.tsx` select 절에 `deleted_at` 컬럼 노출.

---

## [2026-05-28] — 검수 v2 + 검색 SSOT + 방금 쓴 글 1회 + EditClient 통일 (배치 ⑤, 공개 전 마지막)

### Changed (검수 v2)
- `FLAG_THRESHOLD` v1 5 → **v2 7** (`src/lib/content-screening.ts`). 거짓양성 비율 축소 — 단일 카테고리 통과, 두 신호 결합 시 잡힘. 카드·댓글 검수 모두 동일 임계점 사용.
- **`paid_sponsorship` 카테고리 신설** (+4 first-match) — 약관 ④ 명시 금지 유형. 키워드: 협찬받/광고료를 받/원고료/제공 받았/무상 제공/체험단/서포터즈/후원 받/소정의 대가/PPL/대가를 받/제품을 제공. 단독 +4 → 다른 신호 1개 결합 시 임계 7 도달.
- 기타 카테고리 가중치·키워드는 **변경 없음** (배치 ⑤ 정책 — "나머진 그대로").

### Added (admin 가시성·복구)
- `/admin/comments?status=hidden` 탭 신설 — 자동검수 hidden 댓글 검토. 행별 `screening_flags` 표시 + "복구 (visible)" 버튼 (PATCH `/api/comments/[id] { status: "visible" }` 재사용, 기존 audit 적재).
- `/api/admin/comments?status=hidden` 분기. CommentsClient 에 `statusFilter` prop + `restoreComment` 액션.
- (카드의 pending_review/hidden 큐는 기존 `/admin/cards?status=...` 탭이 이미 제공 — 변경 없음 확인.)

### Changed (검색 SSOT — H3)
- `src/lib/search-query.ts` 신설 — `fetchCardList(supabase, { q, doctorSlug, boostDoctorSlug, offset, limit })` 헬퍼. q 가 카테고리 라벨이면 `.eq("category", slug)` 직접 필터, 아니면 RPC.
- 3 호출처 (`/search/page.tsx`, `/api/cards`, `/doctors/[slug]/page.tsx`) 가 모두 본 헬퍼 사용 → 카테고리 라벨 검색 시 첫 페이지·무한스크롤 결과 집합 일관성 보장. `/search` 카운트 쿼리도 카테고리/텍스트 분기 정합.

### Changed (홈 "방금 쓴 글" — H4)
- 홈 `page.tsx` 영구 prepend 로직 제거 (옛 매번 prepend 폐기 — SEO·UX 회귀).
- 신규 client `<JustPublishedPrepend />` (`src/components/JustPublishedPrepend.tsx`) — sessionStorage `pbtt:justPublished = {id, ts}` 5분 윈도우 + `:shown` 마킹으로 1회 노출. 다른 사용자 영향 0.
- WriteClient publish 성공 시 sessionStorage 저장.
- `/api/cards?ids=...` 분기 추가 — 단일 카드 fetch.

### Changed (admin EditClient → PUT API — ROADMAP HIGH 잔존)
- `src/app/admin/cards/[id]/edit/EditClient.tsx` `handleSubmit`: cards 직접 update → PUT `/api/articles/[id]` 통일. PUT 가드 (active 단위 권한·zod·rate-limit·audit_logs) 자동 적용.
- PUT API 가 `author_id` (admin only) + `meta` (admin/doctor) 두 필드 신규 수용. `ArticleUpdateSchema` 확장 + status enum 에 `"hidden"` 추가.

### Documentation
- TECH_SPEC §10: 임계점 7, paid_sponsorship 카테고리, 가중치 표, admin 복구 경로.
- TECH_SPEC §4.1: 검색 SSOT 헬퍼 명시 + 방금 쓴 글 1회 정책.
- ROADMAP: H3·H4 및 admin EditClient HIGH 완료 이동.

### Permission audit (검수 시나리오)
- (i) "협찬받아서 써봤는데 다녀왔어요 만족" → paid_sponsorship +4 + patient_testimonial +3 = **7 → 걸림** (hidden + screening_flags).
- (ii) "○○ 다녀왔는데 부작용 없이 100% 만족" → patient_testimonial +1 (1 hit) + exaggerated_efficacy +3 = 4 → **통과** (단일 +3 카테고리만으로는 임계 미달).
- (iii) 깨끗한 글/댓글 → 모든 카테고리 미히트 → 통과.
- (iv) 의사 신분 → `authorRole !== "user"` 분기로 무조건 통과.

---

## [2026-05-28] — 운영 모더레이션 화면 + 영구 숨김 정책 (배치 ④)

### Added
- `/admin/reports` 신고 검토 큐 (`requireAdminPage superAdminOnly`). 액션 3개:
  - **숨김** (`moderation.hide`): 카드 `toggle_card_hide('hidden')` 또는 댓글 `status='hidden'`. 영구·복구가능.
  - **완전삭제** (`moderation.delete`, 카드 한정): `soft_delete_card` RPC (ADR 0002 익명화).
  - **기각** (`moderation.dismiss`): 대상 변경 없음.
- API: `PATCH /api/admin/reports/[id]` — 모든 액션 `audit_logs` 적재 + `content_reports.{status, action_taken, resolved_at, resolved_by, resolution_note}` 갱신. rate-limit 30/분.
- admin 대시보드 운영 프로그램 카드에 "신고 검토" 진입점 추가 (super admin 전용).

### Changed
- **숨김 카드 공개 측 표시**: `[handle]/[shortcode]` + `doctors/[slug]/[year]/[postSlug]` 페이지에서 fetch 가 null 일 때 admin client (RLS 우회) 로 status mini-fetch → `hidden` 이면 본문 대신 placeholder ("운영정책에 따라 비공개된 게시물입니다") + `noindex`. 진짜 없는 글이면 기존 404/글없음 화면 그대로.
- **숨김 댓글 표시**: 일반 viewer 에게 본문 대신 "(비공개 처리된 댓글입니다)" 한 줄. 본인·admin·doctor 는 회색 본문 + "숨김됨" 라벨로 검토 가능.
- **CommentsBlock 검수 안내**: 댓글 POST 응답의 `screening` 객체 받으면 toast 로 사유 안내 — silent fail 방지.

### Documentation
- `terms/page.tsx`: 옛 30일 임시조치 + 이의제기 단락 제거. 영구 숨김 명시 + 의료광고 자동 검수 사전 고지 (대가성 후기·효과 단정·내원 유도 3유형) 추가. subtitle 갱신.
- `privacy/page.tsx`: 보유 항목에 "운영정책 위반으로 비공개 처리된 게시물" 추가.
- PRD §4.7 + §4.8 (모더레이션 신설). TECH_SPEC §10.1 신설. DATABASE.md `content_reports` 표 + `comments.status='hidden'` 의미 명시. ARCHITECTURE 라우트 표 갱신.

### Permission audit
- `requireAdmin()` / `requireAdminPage()` active 단위 정합 — ROADMAP HIGH 항목은 이미 해결된 stale 잔재로 확인됨.

---

## [2026-05-28] — 댓글 자동검수 + 안전(자살/자해) 모달 SSOT (배치 ③)

### Added
- `src/lib/safety.ts` — 자살·자해 신호 검출 SSOT 헬퍼 + 안전 모달 문구. CardEditor / CommentForm / 향후 다른 입력 컴포넌트 공용.
- `comments.screening_flags text[]` 컬럼 (마이그레이션 0178) — 카드와 동일 추적성.

### Changed
- **댓글 POST/PATCH 에 자동검수 적용** (`src/app/api/comments/route.ts`, `comments/[id]/route.ts`):
  - active 신분의 role 이 USER 면 `screenContent` 호출 (ADR 0012). 의사·관리자는 자동 통과.
  - 임계 5 초과 시 `status='hidden'` + `screening_flags` 저장 (comments enum 에 pending_review 가 없어 hidden 으로 카드 패턴 미러링).
  - 응답에 `screening` 객체 포함 — 회원이 hidden 처리 사유 인지 가능.
- **CommentForm 자살/자해 안전 모달**: CardEditor 와 동일 패턴 (1회 ack 가드). 모든 댓글 입력 진입점 (root + reply + edit) 에 자동 적용.
- CardEditor: 인라인 `detectSuicideRisk` 와 모달 문구를 `lib/safety.ts` 의 SSOT 함수·상수로 교체. 동작 동일.
- WriteClient: CardEditor 를 wrap 만 하므로 별도 추가 없음 — CardEditor SSOT 통해 자동 적용됨 (ROADMAP 항목 자동 해소).

### Migration
- `supabase/migrations/0178_comments_screening_flags.sql` — production 적용 + 컬럼 추가 확인.

### Documentation
- PRD.md §4.7 — 적용 범위에 "카드 + 댓글" 명시.
- TECH_SPEC.md §10 — 댓글 검수 정책·comments.screening_flags 명시 + safety.ts SSOT 명시.
- DATABASE.md §1.3 — comments.screening_flags + status enum 정합.

---

## [2026-05-28] — 8-agent 종합 점검 후속 배치 ② (H1/H6/H7/M1/M3/M5/M11/H2)

### Added
- **H6 audit_logs 4종 신규 적재** (PIPA 안전성 확보조치 §8 분쟁 추적):
  - `card.admin_update` — admin 의 status / deleted_at / is_pick / doctor_id 변경 (articles/[id] PUT)
  - `comment.admin_update` — status 변경 또는 타인 댓글 본문 변경 (comments/[id] PATCH)
  - `comment.admin_delete` — 타인 댓글 삭제 (comments/[id] DELETE)
  - `card.publish` — admin 대량 카드 발행 (admin/draft/publish, video/카드 id/skipped 포함)
  - `auth.signup` — 신규 가입자 생성 (auth/callback profile 미존재 + naver/callback createUser)
  - profile.update: 전용 mutation 엔드포인트 없음 (클라이언트 직접 update) — 미적용 보고.
- **M3 rate-limit 6종 신규 적용**:
  - `comments-patch` / `comments-delete` 분당 20회
  - `notif-read` 분당 30회, `push-unsubscribe` 분당 10회
  - `identity-switch` 분당 20회, `admin-extract-keywords` 분당 15회 (Anthropic 비용 폭주 방어)

### Changed
- **H1 OAuth callback contact_email 자동 prefill** (ADR 0003 dedup 정확도 향상):
  - `src/app/auth/callback/route.ts` — Supabase OAuth callback 에서 비어있을 때 `user.email` 채움.
  - `src/app/api/auth/naver/callback/route.ts` — Naver admin SDK 경로 동일 정책.
- **H7 preview-link SSRF SSOT 통일**:
  - `fetchWithTimeout` → `lib/ssrf-guard.ts::safeFetchExternal` 의 thin wrapper. 보호 정책 (hop별 host 재검증·redirect manual·streaming·MAX_BYTES) 모두 SSOT 위임.
  - Innertube native fetch 에 `redirect: "manual"` 옵션 추가 (hop 하이재킹 방어).
- **M1 publish KST 보정** — `admin/draft/publish` 의 `post_year`/`created_at` 산정을 +9h offset 후 UTC 메서드 사용. UTC 자정~KST 자정 사이 publish 시 전날로 잡히는 결함 방어.
- **M5 sitemap 의사 글 쿼리에 `category='qa'` 필터 추가** — 의사 비-qa 카드가 doctor canonical URL 로 sitemap 에 들어가 soft 404 발생하던 결함 차단.
- **M11 의사 카드 단독 페이지 회원 라우트 noindex** — `[handle]/[shortcode]` 의 generateMetadata 에서 doctor 매핑 카드는 무조건 noindex (회원 글 tip indexable 정책은 그대로).
- **H2 옛 `/{handle}/{year}/{shortcode}` URL 잔재** — 라우트/링크 빌더/sitemap 모두 사용 0건 확인. 잘못된 주석 1줄만 정정.

### Documentation
- DATABASE.md — `profiles.role` 타입을 `user_role enum` 으로 정정 + `developer` value 보존 명시.
- DATABASE.md / TECH_SPEC.md — HOT 함수 실제 이름 `get_hot_card_ids` (v2 본문 = 시간 가중 + 임계 5) + 0177 의 deleted_at 가드 명시.
- TECH_SPEC.md — `find_duplicate_profiles` 시그니처 `(p_email, p_birthdate, p_gender)` 명시.

---

## [2026-05-28] — 8-agent 종합 점검 후 DB·함수 정합 3건 (마이그레이션 0177)

### Fixed
- **CRITICAL** `find_duplicate_profiles` — production 함수가 옛 `p_legal_name` 시그니처로 `p.legal_name` 컬럼 매칭을 시도하나 해당 컬럼은 0110 에서 이미 DROP 됨. 코드(`OnboardingClient.tsx:289`) 는 `p_email` 키워드로 호출 중이라 dedup 가 silent 실패 상태였음. ADR 0003 / 0111 의 `contact_email + birthdate + gender` 기반으로 회복. 0134 의 enumeration 차단 (providers 빈 배열) + rate-limit (60s/3회, 24h/30회) 정책 유지.
- **HIGH** `videos` / `card_impressions` RLS 정책 3건 — 폐기된 `'developer'` role 매칭 잔재 제거 (실 데이터 0건, 0050 에서 admin 으로 회수 완료). `user_role` enum value 자체는 보존 (DROP TYPE drift 회피).
- **MEDIUM** `get_hot_card_ids` — SECURITY DEFINER 함수가 RLS 의 `deleted_at IS NULL` 제약을 우회하던 점 보강. 0172 의 다층 방어 패턴(`scored` RPC 시리즈) 과 일관성 회복. ADR 0002 soft-delete 정합.

### Migration
- `supabase/migrations/0177_fix_email_dedup_drop_developer_hot_deleted.sql` — production 적용 완료. 검증: 시그니처 `p_email text, p_birthdate date, p_gender text` / 정책 4건 모두 `role = 'admin'` 단일 매칭 / 함수 본문에 `c.deleted_at IS NULL` 확인.

---

## [2026-05-28] — 론칭 QA 막판 CRITICAL fix: admin/users/role route 의 doctor_accounts view 직접 변경 → profiles.doctor_id SSOT UPDATE

### Fixed
- **CRITICAL** `src/app/api/admin/users/[id]/role/route.ts` — 0176 후 `doctor_accounts` 는 view (SELECT only) 인데 본 라우트는 옛 `.from("doctor_accounts").update/insert/delete` 패턴 유지 → admin 이 회원 역할/의사 매핑 변경 시 즉시 500 ("cannot insert into view" 류). QA 검진에서 발견.
  - 변경: SSOT 인 `profiles.doctor_id` 직접 UPDATE 로 통합 (existing-row 분기 불필요 — UPDATE 가 row 부재 시 0건 영향, 의도된 no-op).
  - doctor_id 가 있으면 set/교체, null 이면 NULL 로 해제.
  - 부수: 미사용 `getDoctorIdForProfile` import 제거.

### Removed
- 누적된 `.tmp.*` 임시 파일 32개 일괄 삭제 (Dropbox/에디터 충돌 잔재, git ignore 됨).

---

## [2026-05-28] — 론칭 전 최종 마이크로 디테일: Escape A11y + YouTube regex 상수 + OG 메타 헬퍼 + 문서 최신화

### Added
- 새 모듈 `src/lib/og-meta.ts` — OG/Twitter 메타 boilerplate 통합 SSOT. 2개 export.
  - `buildOgImage(doctorSlug)` — `/og/{slug}.png` 우선, 없으면 `/og.png`.
  - `buildSocialMeta({ title, description, canonical, ogImage, ogType, ogImageAlt })` — `openGraph` + `twitter` 객체 반환 (1200×630 표준).
- `src/components/card/CardMedia.tsx` — `YOUTUBE_HOST_RE` 모듈 상수 도입 (매 렌더 정규식 재컴파일 방지 + 재사용 가능).

### Changed
- `src/components/card/CardHeader.tsx` + `src/components/comments/CommentItem.tsx` 의 메뉴 useEffect 에 `keydown` Escape 키 핸들러 추가 (A11y). 외부 클릭 닫기 + Escape 닫기 정합.
- `src/lib/categories.ts` 헤더 — "Q&A 답변 페이지 5색 색상 칩 전용 메타. cards.category 와 무관" 명시 + `post-category.ts` 상호 참조.
- `src/lib/post-category.ts` 헤더 — "글 분류 cards.category SSOT. categories.ts (UI 색상 칩) 와 무관" 명시 + 상호 참조.
- 3개 RSC 페이지의 `generateMetadata` 가 `buildOgImage` + `buildSocialMeta` 헬퍼 호출로 경량화:
  - `src/app/doctors/[slug]/page.tsx` (의사 프로필, `ogType: "profile"`)
  - `src/app/doctors/[slug]/[year]/[postSlug]/page.tsx` (의사 글, `ogType: "article"`)
  - `src/app/[handle]/[shortcode]/page.tsx` (회원 글, `ogType: "article"`) — OG 메타 신규 추가 (옛 코드는 누락)
- `docs/ROADMAP.md` — ADR 0012 application layer 정합 4개 미완료 항목에 마감일 **(2026-06-02 — 론칭 직후)** 명시.
- `docs/DEPLOYMENT.md §9.3` — secret 로테이션 분기 일정 (1월·4월·7월·10월 첫 영업일) + 사고 시 즉시 로테이션 정책 + 일주일 grace period 명문화.

---

## [2026-05-28] — 론칭 전 4묶음: CommentsBlock 분해 + CardData alias + 0176 doctor_accounts→view + 문서 sync

### Added
- 새 모듈 `src/lib/types/comment.ts` — 댓글 도메인 타입 SSOT. `CommentStatus` / `CommentAuthor` / `CommentRow` / `CommentWithReplies` / `CommentViewer` 5종. CommentsBlock 과 `/api/comments` 양쪽 import.
- 새 폴더 `src/components/comments/` — 옛 단일 `CommentsBlock.tsx` (863줄) 분해.
  - `CommentForm.tsx` (입력 폼, 148줄)
  - `CommentItem.tsx` (댓글 1개, 365줄)
  - `CommentsBlock.tsx` (root, 320줄)
- `src/lib/types/card.ts` 에 `CardDataList` + `CardDataDetail` alias 신설 (의미 명확화).
- 새 마이그레이션 `0176_replace_doctor_accounts_with_view.sql` — doctor_accounts 안전 폐기 Phase 1 (사용자 결정).
  - 9개 RPC 재정의 (doctor_accounts → profiles.doctor_id SSOT):
    `current_doctor_id`, `get_card_activity_users_inner` (4개 분기), `get_notifications`, `get_recent_card_likers_batch`, `get_recent_likers`, `on_card_status_for_notification` (trigger), `propagate_onboarding_to_doctor_bundle`, `link_doctor_to_profile` (INSERT→UPDATE profiles.doctor_id), `unlink_doctor_from_profile` (DELETE→SET NULL)
  - `ALTER TABLE doctor_accounts RENAME TO doctor_accounts_deprecated` — 데이터 보존, DROP 아님.
  - `CREATE VIEW doctor_accounts AS SELECT p.id AS profile_id, p.doctor_id, p.created_at FROM profiles p WHERE doctor_id IS NOT NULL` — 외부 SELECT 호환성 + INSERT/UPDATE 는 view 라 의도된 실패.
  - GRANT SELECT (authenticated + anon) + `NOTIFY pgrst 'reload schema' + 'reload config'` 양방향
  - 검증: view 9 rows ↔ deprecated 9 rows 일치, 살아있는 RPC 본문의 SQL FROM/JOIN doctor_accounts 잔재 0건 (주석만 남음).
  - 보너스 fix: `get_recent_likers` 의 `card_likes.persona` 컬럼 (0090 에서 폐기, 옛 함수에 lazy 잔재) NULL::text 로 정정.

### Changed
- `src/app/api/comments/route.ts` + `src/components/CommentsBlock.tsx` — Author/CommentRow 로컬 재정의 제거 → `@/lib/types/comment` import 로 통일.
- `src/components/CommentsBlock.tsx` — 옛 위치는 호환성 re-export 한 줄로 축소 (`export { default } from "./comments/CommentsBlock"`). 외부 호출자 import 경로 보존.
- `src/components/Feed.tsx`, `src/components/CardMasonry.tsx`, `src/lib/feed-shuffle.ts` — `CardData` → `CardDataList` 의미 명확화 (alias 라 동작 동일).
- `src/components/Card.tsx` — `CardDataList` / `CardDataDetail` 도 re-export.
- `docs/ARCHITECTURE.md` "관련 ADR" 섹션에 0011, 0012 양방향 참조 추가.
- `docs/DATABASE.md` 마이그레이션 표에 0173, 0174, 0175 누락분 추가 (0176 도 함께).

---

## [2026-05-28] — 0174 wrapper 6개 `question text → title text` (사용자 보고된 "(제목 없음)" 근본 원인) + Vercel 캐시 무효화

### Added
- 새 마이그레이션 `0174_fix_top_cards_wrappers_question_legacy.sql` — `pg_get_function_result()` 팩트 체크로 발견: 0171 이 `*_inner` 함수만 재정의하고 wrapper 6개의 `RETURNS TABLE` 시그니처는 누락 → `question text` 잔재. PostgREST 가 wrapper 시그니처의 컬럼명으로 응답하므로 클라가 `row.title` 접근 시 undefined → UI "(제목 없음)" 표시. 6개 (get_top_cards_by_{comments,likes,saves,shares,views}, get_top_new_cards) DROP+CREATE 로 시그니처만 `title text` 로 교체, 본문/권한/SECURITY DEFINER/search_path 보존. 끝에 `NOTIFY pgrst 'reload schema'` + `'reload config'`.

### Changed
- `package.json` version `0.1.1` → `0.1.2` (Vercel 빌드 캐시 무효화 강제 — 사용자 결정).

### Confirmed (팩트 체크)
- `get_top_cards_by_views` 외 5개 wrapper 의 production DDL 에 `question text` 잔재 확인 (적용 전).
- 적용 후 6개 모두 `RETURNS TABLE(card_id bigint, title text, shortcode text, ...)` 로 정합.
- `search_cards_scored` / `get_card_activity_users` 는 깔끔 (수정 불필요).

---

## [2026-05-28] — 5건 묶음: PostgREST 캐시 reload + 0044 충돌 해소 + Identity SSOT + comments Zod + tmp 청소

### Added
- 새 마이그레이션 `0173_fix_rpc_legacy_columns.sql` — `/admin/cards` 500 대응. Deep scan 결과: DB 살아있는 함수·View·응용 코드 `.select()`·FK 모두 question/answer 잔재 0건 확인. 실질 변경 없는 `COMMENT ON TABLE cards` + 끝에 `NOTIFY pgrst, 'reload schema'` + `NOTIFY pgrst, 'reload config'` 강제 양방향 캐시 reload (0171/0172 직후 PostgREST 가 옛 schema cache 를 일시적으로 잡고 있던 회귀 차단).
- 새 헬퍼 `src/lib/identity-server.ts` 의 `normalizeLegacyIdentityValue()` — Critical-5 호환성 정규화 SSOT. 옛 sentinel `"primary"` → authUserId UUID 정규화 + UUID 검증을 단일 함수로. cookie/payload 진입점 어디서든 동일 규칙.
- 새 스키마 `src/lib/schema/api/comments.ts` — `CommentCreateSchema` + `CommentGetQuerySchema`. articles 와 동일 Zod 패턴 (`.strict()`, transform trim, devOnly issues).

### Changed
- `supabase/migrations/0044_*.sql` 두 파일을 `0044_01_*.sql` / `0044_02_*.sql` 로 rename. 같은 번호 두 마이그레이션의 적용 순서 불확실성 해소 (이미 production 적용 완료, 신규 환경 세팅 시점만 영향).
- `src/lib/identity-server.ts` `readTargetProfileId()` — cookie 파싱·"primary" fallback 로직을 `normalizeLegacyIdentityValue()` 호출로 통합.
- `src/app/api/identity/switch/route.ts` — 하드코딩 `targetRaw === "primary" ? user.id : targetRaw` + 별도 `UUID_RE.test()` 분기 제거. `normalizeLegacyIdentityValue()` 단일 호출로 정규화+검증 통합.
- `src/lib/admin-page-guard.ts` — `isSuperAdmin`/`isDoctorAdmin` 직접 구현을 `deriveIdentityFlags(active)` SSOT 호출로 교체. identity.ts 와 권한 판정 로직 일치.
- `src/app/api/comments/route.ts` GET/POST — typeof + parseInt + Math.min/max + trim 수동 검증을 Zod safeParse 로 일괄 치환. 옛 사용자 메시지 (`"댓글 내용을 입력해 주세요."`, `"댓글은 2000자 이내로 작성해주세요."`) 는 schema 의 message 로 이전하여 첫 issue.message 를 그대로 노출.

### Removed
- `src/lib/**/*.tmp.26376.*` 임시 파일 7건 일괄 삭제 (에디터 충돌 잔재).

---

## [2026-05-28] — RPC deleted_at 다층 방어 + visitors Mojibake fix + 캐싱 + 로그아웃 쿠키 정리

### Added
- 새 마이그레이션 `0172_fix_rpc_deleted_at_and_visitors.sql`
  - `feed_cards_scored` / `search_cards_scored` / `tag_cards_scored` 3개 RPC 본문에 `AND c.deleted_at IS NULL` 명시. status='published' 만 보던 옛 조건이 향후 status/deleted_at 불일치 row 가 생길 때 즉시 누출하던 위험 차단.
  - `get_top_visitors_inner` 재정의 — 비로그인 합계 행의 `display_name` 을 옛 한글 `'비로그인 방문자'` 에서 `NULL` 로 변경. 일부 환경의 Mojibake 근본 차단. profile_id IS NULL 신호만 보내고 라벨링은 UI 책임.

### Changed
- `src/app/admin/stats/[kind]/StatsListClient.tsx` — 방문자 칩 렌더에서 `row.profile_id == null` 이면 "비로그인" 라벨 표시. RPC 가 보낸 NULL display_name 을 UI 에서 일관 처리.
- `src/components/card-editor/fields/PubmedRefsField.tsx` — 등록된 ref 칩 모드의 메타 표시에서 앞 엠대시(` — `) prefix 만 공백으로 시각 치환. 저장값과 등록 판정 마커는 그대로 유지 (CardBody.tsx 의 색상 위계와 일치).
- `src/app/doctors/[slug]/[year]/[postSlug]/page.tsx` — `fetchQaByDoctorYearSlug` 를 React `cache()` 로 메모이즈. 같은 request 안의 `generateMetadata` + page component 호출이 DB 왕복 2회 → 1회.
- `src/components/LogoutButton.tsx` — `supabase.auth.signOut()` 후 `pibutenten:identity-mirror` + `pibutenten_onboarded` 쿠키 명시 삭제. 비-httpOnly 쿠키가 다음 사용자/계정 전환 시 잔존하던 회귀 방지.
- `docs/DATABASE.md` 마이그레이션 히스토리 표에 0171, 0172 행 추가 (옛 0171 누락 보완).

---

## [2026-05-27] — Critical 1~6 + 회귀 fix 묶음 (e0852c6 → 443cb45)

### Critical-1 ~ Critical-6 (e0852c6 → af4267c)

#### Added
- 새 마이그레이션 `0168_notifications_active_only.sql` — `validate_active_profile_id(uuid)` 헬퍼 + 5개 notification RPC 에 `p_active_profile_id` 파라미터 추가. Critical-2 DB 측 정합.
- 새 마이그레이션 `0169_normalize_pubmed_refs.sql` — `cards.pubmed_refs` 안 858 ref `year` string→int, 64 ref `doi_url` ""→null 정규화. Critical-4 SSOT.
- `src/lib/doctor-mapping.ts` 3개 헬퍼 (`getDoctorIdForProfile`, `getDoctorSlugForProfile`, `getDoctorMetaBatch`) — `profiles.doctor_id` 인라인 컬럼 단일 출처. Critical-1.
- `src/lib/schema/api/articles.ts` 의 `normalizePubmedRefWire` 함수 — PubMed eutils wire format → SSOT 정규화 boundary.

#### Changed
- **Critical-1 (SSOT)**: 앱 코드 12개 위치의 `doctor_accounts` SELECT → 새 헬퍼 호출로 일괄 치환. `profiles.doctor_id` 단일 진실 강제.
- **Critical-2 (active-only)**: `write/[shortcode]/page.tsx` `isAuthor`, `api/push/subscribe`, `(settings/)notifications/page.tsx` role 결정 모두 `active.profileId` 단일 매칭으로 통일. 옛 bundle OR 패턴 폐기.
- **Critical-3 (errorResponse 통일)**: 27개 API 라우트, 60+ 위치의 `NextResponse.json({error})` 패턴을 `errorResponse` 헬퍼 호출로 일괄 치환. PII 누출 방어 통합 + `userMessage`/`devOnly`/`bodyExtra` 옵션 추가.
- **Critical-4 (PubmedRef SSOT)**: `PubmedRefSchema` 타입 단순화 (`year: number int`, `doi_url: string.url().nullable()`). 6곳 로컬 `PubmedRef` 재정의 제거 + 통합 formatter (`pubmedRefObjToString`).
- **Critical-5 (sentinel "primary" 멸종)**: `PRIMARY_IDENTITY_ID` 상수·`PrimaryIdentityId` 타입 폐기. `ActiveIdentity.id` / `SessionInfo.activeIdentityId` 모두 UUID 만 운반. `layout.tsx` `identities[].id = r.id`, `activeIdentityId` 폴백 = `user.id`. cookie "primary" 호환은 `/api/identity/switch` 진입 시 UUID 정규화 1줄로 한정.
- **Critical-6 (PubmedRef 본문 평문 차단)**: `CardEditor.buildPayload` 의 `appendReferencesToBody` 호출 제거 + `PubmedRefsField` 의 함수 정의 폐기. `renderAnswerBody`·`stripMarkdown` 에 `stripLegacyReferencesTail` 정규식 다층 방어 (옛 row 평문 꼬리 시각 차단). CardBody 의 ref 섹션 CSS 강화 (`relative isolate`, `pointer-events: auto`, `inline-block py-0.5`, title 빈 값 `(제목 없음)` placeholder).

#### Fixed
- `ArticleCreateSchema` 에 `pubmed_refs` 누락 → POST `/api/articles` 가 `invalid_input` 400 반환하던 회귀 (31d49d3).
- 9개 critical catch 블록에 prefixed `console.error` 추가 (`[auth-identity]`, `[csrf-origin]`, `[auth-callback]`, `[comment-first-save]`, `[push-unsubscribe]`, `[notif-read]`, `[notif-bell]`, `[notif-read-mark]`) — silent failure 운영 가시성. Sub-4.

---

### Critical-1~6 직후 회귀 fix 묶음 (2109aa9 → 443cb45)

#### Added
- 새 마이그레이션 `0170_feed_rpcs_add_pubmed_refs.sql` — `feed_cards_scored` / `tag_cards_scored` RPC RETURNS TABLE 에 `pubmed_refs jsonb[]` 컬럼 추가. `search_cards_scored` 는 이미 포함.

#### Changed
- `CARD_LIST_SELECT` 에 `pubmed_refs` 컬럼 포함 — Critical-6 의 `stripLegacyReferencesTail` 가 옛 본문 평문 ref 꼬리를 잘라낸 뒤 리스트 뷰에서 참고문헌이 완전 부재하던 회귀 해소.
- `SessionInfo` 를 **active 신분 단위**로 정합화 (`layout.tsx getSessionInfo` 재작성). `role`/`displayName`/`avatarUrl`/`handle`/`doctorSlug` 모두 active row 기준. 옛: base profile (`user.id`) 종속 → admin 묶음의 doctor 가 base 이면 admin active 라도 `me.role='doctor'` 박혀 카드 메뉴 전부 가림 회귀 발생. ADR 0001 정합 강화.
- `SessionInfo.baseUserId` 필드 폐기 + IdentitySwitcher "대표" 배지 제거 (사용자 결정 — 동등 독립 원칙과 충돌).
- CardBody 참고문헌 렌더: `<a>` `inline-block py-0.5` 폐기 → 순수 inline. title (primary 하늘색) + 한 칸 공백 + meta wrapper span (저자/저널/연도, muted 회색) 단일 인라인 흐름. em-dash 제거 — 색상으로만 시각 위계.

#### Fixed
- CardEditor admin "Pick (원장님 추천)" 체크박스 토글 시 카운터 (0/5 → 1/5) 가 변하지 않던 회귀 — optimistic 가감 (`initialIsPick` 와 현재 `isPick` 차이로 +1/-1).
- 참고문헌 title 끝 em-dash 가 wrap 위치에 따라 새 줄 머리에 외롭게 시작하던 비일관 회귀.

---

### Sub-5 — 권한 문자열 상수화

#### Added
- `src/lib/identity-shared.ts` 에 `ROLES = { ADMIN: "admin", DOCTOR: "doctor", USER: "user" } as const` 단일 출처 상수 추가. DB profiles.role CHECK 제약과 1:1 매칭.

#### Changed
- 25개 파일, 약 50건의 `role === "admin"`/`role !== "doctor"`/`role === "user"` 류 비교 리터럴을 `ROLES.ADMIN`/`ROLES.DOCTOR`/`ROLES.USER` 상수 참조로 일괄 치환. 오타·중복 매직스트링 표면 차단.
- 변경 대상: lib (`admin-page-guard`, `post-category`, `identity-shared` 자체), components (`Card`, `CommentsBlock`, `TopNav`, `NotificationPreferences`), app/admin 8개 파일, app/api 4개 라우트, app 기타 (`write`, `signup`, `settings`, `settings/profile`, `doctor`, `onboarding`, `auth/callback`).
- 보존 영역 (의도적 비치환): TypeScript union 타입 자리 (`role: "admin" | "doctor" | "user"`), Anthropic AI SDK `{ role: "user", content }` 파라미터 (도메인 다름), legacy 호환 함수 이름·내부 로직 (`requireActiveSuperAdmin` 등).

---

### Sub-1 — layout.tsx getSessionInfo 분리

#### Added
- `src/lib/session-info.ts` 신설 — `getSessionInfo` 서버 헬퍼 단일 모듈. 함수 본문·주석·cookie 가드 로직 1바이트 변경 없이 그대로 이전.

#### Changed
- `src/app/layout.tsx` 282줄 → 184줄 (98줄 감소). `getSessionInfo` 인라인 정의 제거 + `import { getSessionInfo } from "@/lib/session-info"` 1줄 추가. layout 모듈 그래프 경량화 부수효과로 build 시간 3.9s → 3.5s 단축.
- 분리에 따라 layout.tsx 에서 더 이상 직접 쓰지 않는 import 제거: `type { SessionInfo }`, `createSupabaseServerClient`, `IDENTITY_COOKIE`, `UUID_RE`, `getDoctorMetaBatch`.

#### Preserved (의도적 비변경)
- `export const dynamic = "force-dynamic"` — layout 파일에 남겨야 페이지 캐시 무효화 효과 유지.
- 함수 내 cookie 가드 (`IDENTITY_COOKIE` 조회 → `UUID_RE` 검증 → `rows.some` 묶음 매칭 → `user.id` 폴백) 와 ADR 0001 / Critical-5 회귀 fix 주석 전부.

---

### Sub-6 — 카테고리 라벨 SSOT 통합

#### Added
- `src/lib/post-category.ts` 에 5개 신규 export: `LEGACY_CATEGORY_LABELS` (옛 5라벨 보존), `POST_CATEGORY_LABELS` (POST_CATEGORIES derive Set), `ALL_CATEGORY_LABELS` (현재+옛 합성), `stripCategoryLabels()` (헬퍼 이전), `CATEGORY_LABEL_TO_SLUG` (POST_CATEGORIES derive + "공유하기"→"link" 호환 매핑).

#### Removed
- `src/lib/category-labels.ts` 파일 삭제 (47줄). 모든 정의가 `post-category.ts` 로 흡수. SSOT 단일화.

#### Changed
- `src/components/Card.tsx`: `@/lib/category-labels` import 제거 → `@/lib/post-category` 단일 import.
- `src/app/api/articles/route.ts`: 동일 (1줄).
- `src/app/admin/cards/page.tsx`: 하드코딩 `CATEGORY_LIST` 5개 명시 → `POST_CATEGORIES.filter((c) => c.slug !== "qa").map(...)` derive.
- `src/app/search/page.tsx`: 인라인 `CATEGORY_LABEL_TO_SLUG` 7쌍 명시 → `@/lib/post-category` import.

#### Preserved
- `LEGACY_CATEGORY_LABELS` 5개 (꿀팁·공유하기·답해드려요·물어봐요·새소식) — 옛 데이터 row keywords 잔재 호환 strip.
- "공유하기" → "link" 검색 입력 호환 매핑.

---

### Sub-3 — hot-ids.ts RPC 타입 좁히기

#### Changed
- `src/lib/hot-ids.ts` 의 `as unknown[]` + 다단계 typeof 추측 매핑 (12줄) → Supabase 명시 제네릭 `.returns<{ id: number }[]>()` (2줄). 타입 안전성 향상 + 가독성 회복.
- `Array.isArray` 가드 1줄 — supabase-js 가 `.single()` chain 검증용으로 만드는 `T[] | { Error: ... }` discriminator union 중 array 분기 좁히기.

---

### P2-4 — cards 컬럼 리네임 (question/answer → title/body)

#### Added
- 마이그레이션 `0171_cards_rename_question_answer.sql` — `cards.question → title`, `cards.answer → body` RENAME + 인덱스 2개 RENAME + RPC 10개 재정의 + PostgREST 스키마 캐시 reload.

#### Changed (DB)
- 컬럼 2개 RENAME (data 보존). NOT NULL/타입/제약 모두 유지.
- 인덱스 2개: `cards_question_trgm_idx → cards_title_trgm_idx`, `cards_answer_trgm_idx → cards_body_trgm_idx`.
- RPC 재정의 (RETURNS TABLE 시그니처 + 본문 모두 갱신):
  - `feed_cards_scored`, `search_cards_scored`, `tag_cards_scored` — `question/answer` 반환 컬럼 + ILIKE 검색 본문 모두 `title/body`.
  - `get_notifications` — 반환 alias `card_question → card_title`.
  - `get_top_cards_by_{comments|likes|saves|shares|views|new_cards}_inner` — `question` 반환 컬럼 → `title`.
- RLS policies / 트리거 함수 / View `public_profiles_view` 영향 없음 (해당 컬럼 미참조).

#### Changed (코드)
- 타입 정의 `CardData` (lib/types/card.ts) — `title/body` 단일.
- Zod 스키마 (lib/schema/api/articles.ts) — `ArticleCreateSchema/ArticleUpdateSchema` 모두 `title/body` 단일.
- SQL select 문자열 다수: card-select.ts, doctor-dashboard.ts, admin/users/[id]/page.tsx, admin/cards/page.tsx (+검색 ILIKE), admin/cards/[id]/edit/page.tsx, admin/comments/page.tsx, write/[shortcode]/page.tsx, ProfileTabs.tsx, api/admin/comments/route.ts.
- ILIKE 검색 패턴: admin/cards/page.tsx (2), search/page.tsx.
- DB write: api/articles/route.ts, api/articles/[id]/route.ts, admin/cards/[id]/edit/EditClient.tsx, write/[shortcode]/EditClient.tsx, api/admin/draft/publish/route.ts.
- API 계약 키: WriteClient.tsx, write/[shortcode]/EditClient.tsx, CardEditor.tsx의 extract-keywords 호출, api/admin/extract-keywords/route.ts.
- 프론트엔드 표시: Card.tsx, CardBody.tsx, card-share.ts, admin/cards, admin/comments, admin/users, admin/stats StatsListClient, ProfileTabs, topics, doctors, [handle], NotificationsClient.
- AI 파이프라인 일관화 (사용자 결정): step1.ts, step2.ts, prompts/step1_v5.md, prompts/step2_v2.md, api/admin/draft/{step2,publish}/route.ts, DraftClient.tsx 모두 `title/body` 통일. 옛 question/answer 변환 boundary 제거.
- 알림 RPC 반환 필드명: `card_question → card_title` (DB RPC + NotificationsClient.tsx).

#### Removed
- `ScreeningInput.question`, `ScreeningInput.answer` (lib/content-screening.ts) — `title/body`로 단일화.

#### Preserved (의도적 비변경)
- CSS 클래스명 `card-answer-speakable`, `card-answer--more` — 내부 UI 식별자, 외부 노출 없음.

---

### P2-2 — CardEditor 컴포넌트 4분할

#### Added
- `src/components/card-editor/parts/CardEditorMeta.tsx` (196줄) — 카테고리 picker + admin author/Pick + create admin author select. Presentational only.
- `src/components/card-editor/parts/CardEditorBody.tsx` (90줄) — 제목 input + 본문 (Q&A 면 MarkdownBoldEditor, 그 외 textarea).
- `src/components/card-editor/parts/CardEditorAttachments.tsx` (185줄) — 외부 링크 + 영상 시작시각 + PubMed refs + link 첫 댓글. `renderSection` prop ("external" | "post-body") 으로 본문 위/아래 위치 분기.

#### Changed
- `src/components/card-editor/CardEditor.tsx` 1097줄 → 950줄. 상위 컨테이너 책임 명확화: 모든 state·useEffect·`buildPayload`·`submit`·`handleSoftDelete`·`handleToggleHide`·헤더·KeywordsEditor·액션 버튼·ConfirmDialog 보유. JSX 본문은 3개 자식 컴포넌트 호출로 교체.
- 모든 자식은 state 없음 (Presentational). 상태와 setter 는 부모에서 strict-typed props 로 전달. Zod 검증·payload 빌드·LLM 호출 흐름 전부 컨테이너에 보존.
- create 모드 admin 의 글쓴이 dropdown 위치를 메타 블록 안으로 이동 (옛: 키워드 아래). 같은 "글쓴이 메타" 묶음에 통합. 동작·검증 동일.

#### Preserved (의도적 비변경)
- 외부 export 타입 (`CardEditorInitial`, `CardEditorPayload`, `SubmitAction`, `AdminExtras`, `AuthorOption`, `DoctorOption`, `CardStatus`) 모두 CardEditor.tsx 에 그대로 유지 — wrapper (`/write`, `/write/[shortcode]`, `/admin/cards/[id]/edit`) 의 import 경로 0 변경.
- 모든 비즈니스 헬퍼 (`formatMMSS`/`parseMMSS`/`extractStartSeconds`/`buildExternalUrl`/`detectSuicideRisk`/`STATUS_LABELS`/`STATUS_COLORS`/`SAME_GROUP`/`isCrossGroupSwitch`/`changeCategory`/`commitStartInput`/`extractKeywordsLlm`/`fetchOembedTitle`/`buildPayload`/`doSubmit`/`submit`/`handleSoftDelete`/`handleToggleHide`/`cancelEdit`) 컨테이너 유지.
- 자살/자해 키워드 감지 로직, optimistic Pick 카운트, useTransition pending 흐름, suicideRiskAcknowledged 게이트 모두 컨테이너에 그대로.

---

## [2026-05-26] (X) — 세션 종료 정리 + 미해결 회귀 + 다음 세션 우선순위

### Session log (af15ce1 → cb2a60d → 5e8d3b4 → bdbe933 → e3f3280)
서브에이전트 8명 종합 누더기 진단 + ADR 0012 정착 + 마이그레이션 0164~0167 적용 + SW auto-reload + Vercel cache invalidate. 상세는 `docs/reports/2026-05-26-session-final-report.md`.

### Unresolved — 정한미·고혜림 원장 회귀
- **증상**: admin/cards/[id]/edit 화면에서 글 수정 → "올리기" 클릭 시 `"Could not find the 'pubmed_ref' column of 'cards' in the schema cache"` 에러
- **진단 결과 (모두 통과)**:
  - local code `pubmed_ref` 단수 참조 0건
  - production 24개 chunk 전수 검사 0건
  - DB cards 컬럼 목록에 `pubmed_ref` 없음
  - DB 함수·view·트리거 0건
  - PostgREST schema cache 정상 (`NOTIFY pgrst, 'reload schema'` 완료)
  - 직접 PATCH `{"pubmed_refs": null}` → 정상
  - 직접 PATCH `{"pubmed_ref": null}` → 사용자 본 에러 정확히 재현
- **시도된 fix**: `bdbe933` (SW auto-reload), `e3f3280` (package.json version bump → Vercel build cache full invalidate)
- **사용자 단서**: "고친지 한두 시간 후" — stale page 캐시 아님, 진짜 production 코드 잔재 의심

### Next session — 우선순위 액션

#### P0 — 정한미·고혜림 회귀 종결
1. **e3f3280 deploy 완료 후 두 원장 재시도 결과 확인** — 정상이면 종결
2. **여전히 에러 시 안전망 추가**: `src/app/admin/cards/[id]/edit/EditClient.tsx` 의 `.from("cards").update(update)` 직전에 **cards 테이블 실제 컬럼 화이트리스트** 필터 박기 — 어떤 코드 path 가 옛 컬럼 추가해도 자동 차단:
   ```typescript
   const CARDS_COLUMNS = new Set([/* DB introspect 결과 */]);
   const filtered = Object.fromEntries(
     Object.entries(update).filter(([k]) => CARDS_COLUMNS.has(k))
   );
   await supabase.from("cards").update(filtered).eq("id", card.id);
   ```
3. **Vercel CLI/dashboard 에서 production alias 직접 확인** — pbtt.kr 가 어느 commit 빌드에 alias 됐는지 확정

#### P1 — ADR 0012 잔여 정합 (단기, 1~2주)
- `doctor_accounts` 직접 SELECT 9곳 → `getDoctorIdForProfile` 헬퍼 통일 (정한미식 회귀 잠재 표면 차단)
- `audit_logs` 4건 보강 (Naver callback / `/api/upload` / `/api/reports` / admin OAuth) — PIPA §8 정합
- middleware `pibutenten_onboarded` 쿠키 HMAC 서명화 (위조 차단)
- `acting_profile_id()` 헬퍼로 RLS/RPC 인라인 34곳 일괄 치환

#### P2 — 중기 (2~4주)
- 옛 함수 7회 재정의 squash (`anonymize_user_content_before_delete`, `find_duplicate_profiles`, scored RPCs)
- `layout.tsx` `getSessionInfo` 105줄 → `lib/session-info.ts` 분리 + force-dynamic/revalidate/fetchCache 트리플 정리
- doctor legacy role 6 profile 데이터 마이그레이션 + UI 분기 단순화
- CardEditor.tsx 1093줄 분할 (CategoryPicker / StartTimeField / AdminExtrasPanel / OwnerActionsBar)

#### P3 — 장기 (베타 종료 2026-06-01 이후, 무트래픽 시점)
- 마이그레이션 baseline squash (`0000_baseline.sql` 1장) — production drift 0 확인 후
- `cards.question`/`answer` → `title`/`body` 컬럼 리네임 + 모든 검색 RPC 본문 갱신
- Dialog 베이스 마이그레이션 (6 모달 wrapper 중복 제거)
- CSS 색상 토큰 일괄 치환 (Tailwind v4 `@theme inline`)
- SSRF 가드 통합 (`safeFetchExternal` 단일)

### Lessons (다음 세션이 참고)
1. **DB 컬럼 DROP 직후 stale client chunk 잔존** — column DROP 마이그레이션 시 (a) PostgREST schema reload + (b) SW auto-reload (이미 도입됨) + (c) update payload 화이트리스트 필터 (방어 심층화) 3박자 필수.
2. **column 검사는 client + server 양쪽 모두 필요** — production client chunk grep 만으로는 server function bundle 잔재 못 잡음. 차후 Vercel CLI `vercel inspect <deployment>` 로 server function 검사 절차 추가.
3. **사용자 결정 → ADR 박기 → 적용 검증** 패턴이 누더기 방지에 가장 효과적 — ADR 0012 가 향후 같은 회귀 재발의 단일 판단 기준.
4. **8명 검토 합의도 ≥ 4명** 항목은 100% 진짜 누더기 — 거짓 양성 거의 0.

---

## [2026-05-26] (IX) — ADR 0012 명함 단위 완전 독립 원칙 정착 (서브에이전트 8명 종합 누더기 진단 → 일괄 정합)

사용자 결정 — "의사 명함으로 쓴 글은 의사 글, 회원 명함으로 쓴 글은 회원 글. 그 사이 교차·합산 없음. 묶음의 유일한 효용은 빠른 전환." — 을 단일 원칙으로 박고 application layer 의 절반 정합 상태를 끝까지 정합. 5월 한 달 이도영·정한미·김수형 원장 회귀 3연속의 근본 차단.

### Added
- **`docs/decisions/0012-profile-unit-complete-independence.md`** 신설: 명함 단위 완전 독립 5원칙 명문화. ADR 0011 (DB layer) 이후 application layer 정합 정책.
- **`docs/PRD.md` §4.3 갱신**: 5원칙 inline 추가.
- **`scripts/check-migration-naming.mjs`** 신설: 마이그레이션 동일 번호 충돌 + `_fix_`/`_hotfix_`/`_again`/`_revert`/사람 이름 + `.template` 박제 검출. 신규 (>= 0164) 차단, 옛 누적은 경고. `npm run check-migrations`.

### Migration (production 적용 완료)
- **0164** `acting_profile_id() helper` — `COALESCE(current_active_profile_id(), auth.uid())` SQL 패턴 34곳 인라인 반복의 단일 출처. 향후 fallback 정책 변경 시 1곳만 수정.
- **0165** `profiles.doctor_id 인라인` — `doctor_accounts` 표 SELECT 18곳 분산의 근본 해결. profiles row 안에 doctor_id 컬럼 직접 박음 + 백필 (의사 명함 9개) + doctor_accounts 변경 자동 sync 트리거 (호환). `get_active_doctor_id()` RPC 본문 단순화. doctor_accounts 표 DROP 은 호출 측 정합 후 별도 마이그레이션.
- **0166** `pubmed_ref 컬럼 제거` — 옛 단일 자리 + 새 배열 자리 이중 저장 (김수형 회귀 패턴) 통합. production 분포 점검 (only_old 15건 / both 844건 mismatch 0건) 후 백필 + DROP COLUMN.

### Changed (application layer 정합)
- **`src/lib/admin-guard.ts`** — `requireAdmin()` / `requireAdminOrDoctor()` 가 묶음 OR (`profiles.or(bundleProfileFilter)`) → active 단위 (`getIdentityContext().isSuperAdmin`) 로 통합. 사용자 결정 "관리자 명함이 아니면 차단 — 안내 불필요" 반영. 옛 `requireActiveSuperAdmin` / `requireActiveSuperOrDoctorAdmin` 는 호환 alias 로 유지.
- **`src/lib/admin-page-guard.ts`** — RSC 페이지 가드도 active 단위로. 묶음 admin profile lookup SQL 제거.
- **`src/lib/me-cache.ts`** — base profile (id=user.id) 만 읽던 옛 패턴 → active profile (`getActiveIdentityId() ?? user.id`) 의 role 읽음. sub-identity 의사 사용자 (정한미 원장 패턴) 의 권한 표시 회귀 차단.
- **`src/components/card/hooks/useCardViewer.ts`** — me 결정 SSR session 단일 출처. 옛 useEffect 안 `auth.getUser()` + `profiles.select()` 중복 fetch 제거. 카드 1장당 RPC 2회 → 0회 (페이지 카드 20장이면 40회 호출 감소).
- **`src/app/api/articles/[id]/route.ts`** — `isAuthor` 가 `myProfileIds.has(card.author_id)` (묶음 OR) → `card.author_id === active.profileId` (active 단위). 의사 명함으로 쓴 글을 회원 명함으로 active 인 채 수정 시도하면 차단 (silent UPDATE 0 rows 회귀 방지). 안내 메시지에 "다른 명함이면 그 명함으로 전환 후 편집" 추가.
- **`src/app/api/articles/route.ts`** — 카테고리 라벨 strip 11줄 인라인 배열 → `stripCategoryLabels` 헬퍼 1줄 import. SSOT 일치.
- **`src/middleware.ts`** — CSRF allowlist 의 개인 LAN IP (`192.168.0.20`) 하드코딩 → `CSRF_ALLOWED_ORIGINS` 환경변수. 개발자 인수 시 코드 수정 불필요.

### Changed (pubmed_refs 단일 출처화 — 코드 측 정합)
0166 마이그레이션과 함께 다음 12개 파일에서 옛 `pubmed_ref` (단수) 참조 일괄 제거:
- `src/lib/card-select.ts` (CARD_LIST_SELECT / CARD_DETAIL_SELECT)
- `src/lib/types/card.ts` (CardData.pubmed_ref 필드)
- `src/lib/schema/api/articles.ts` (ArticleUpdateSchema.pubmed_ref)
- `src/components/card/CardBody.tsx` (fallback 분기)
- `src/app/admin/cards/[id]/edit/page.tsx` (SELECT)
- `src/app/admin/cards/[id]/edit/EditClient.tsx` (Card type + initialPubmedRefs + payload)
- `src/app/api/admin/draft/publish/route.ts` (insert payload — `pubmed_refs` array 로 변경)
- `src/app/write/[shortcode]/page.tsx` (QaRow + 2개 SELECT + initialPubmedRefs)
- `src/app/write/[shortcode]/EditClient.tsx` (apiPayload)
- `src/app/write/WriteClient.tsx` (apiPayload)
- `src/app/api/articles/[id]/route.ts` (PubmedRefObj type 사용처 + payload field + update field)
- `src/app/doctors/[slug]/[year]/[postSlug]/page.tsx` (Schema.org Citation fallback)

### Added (env)
- `.env.local.example` 에 `SUPABASE_ACCESS_TOKEN`, `SUPABASE_PROJECT_REF` (Management API 용), `CSRF_ALLOWED_ORIGINS` 명시.
- `package.json` 에 `npm run check-migrations` 추가.

### 회귀 검증 영역 (이번 릴리즈 후 점검 필요)
- `/admin/cards`, `/admin/draft`, `/admin/users`, `/admin/comments`, `/admin/stats` 5개 admin 라우트 — 묶음 → active 가드 변경. admin 운영진이 회원 명함으로 active 인 채 접근 시 차단됨 (의도).
- `/write/[shortcode]` 본인 글 편집 — active 명함 = 작성 명함 일치 시만 통과.
- 카드 좋아요/저장/공유 클릭 — me 결정이 SSR session 단일 출처라 첫 paint 즉시 정확.
- 의사 9명 페이지 표시 — `get_active_doctor_id()` RPC 본문 단순화 후 정상 동작.

### 보류 (별도 후속 처리 필요)
- **`doctor_accounts` 표 DROP** — 호출 측 9~18곳이 모두 헬퍼 또는 `profiles.doctor_id` 컬럼 직접 사용으로 정합된 후, 별도 마이그레이션 (가칭 0167) 에서 DROP. CLAUDE.md §10 ("파괴적 DB 변경 자동 실행 금지") 룰 준수.
- **`audit_logs` 4건 보강** (naver callback 신규 user 생성 / upload / reports / admin youtube-oauth callback) — 별도 세션에서 PIPA §8 안전성 확보조치 정합.
- **옛 함수 squash** (anonymize 7회 재정의, find_duplicate_profiles 5회, scored RPCs 4회) — 베타 종료 (2026-06-01) 직후 무트래픽 시점 baseline + squash.
- **`cards.question/answer` 컬럼 → `title/body` 리네임** — 모든 RPC 본문 갱신 필요. 별도 세션.

---

## [2026-05-26] (VIII) — 세션 종료 정리 (`350c899`) + Phase 3 후속 로드맵

### Changed
- **`UrlOrEmpty` 주석 의미 명확화** (`src/lib/schema/api/articles.ts`): 옛 주석 "회귀 차단" 관점이 땜빵 인상 → "DOI 도입(2000년대) 이전 발표된 옛 논문은 PubMed 등록은 됐지만 DOI 없는 정상 데이터 케이스를 수용" 으로 의미 정정. 동작 변경 없음. 사용자 통찰 — "오래된 논문은 PubMed 검색은 되지만 doi 주소 없을 때도 있어" — 반영.

### Docs
- **`docs/ROADMAP.md` Phase 3 추가**: 서브에이전트 외부 감사 (commit 7aeba53 시점) 에서 발견된 application layer 정합 누락 5건 (HIGH·MEDIUM) + 위계 표현 잔재 + 보안 방어 심층화 후속 항목 명문화. SQL 정합은 완료됐으나 TypeScript 가드·API 라우트·layout 의 동일 정합이 미완 — Phase 3 로 분리.

---

## [2026-05-26] (VII) — PubmedRef url 빈 문자열 허용 (DOI 없는 옛 논문 수용)

### Fixed
- **doi 없는 참고문헌이 붙은 카드 (production 65건) 의 잠재 invalid_input 회귀**: `pubmed_url`/`doi_url` 의 zod `.url()` 검증이 빈 문자열 `""` 거부. DraftClient.tsx:469 가 `doi_url: cand.doi ? \`https://doi.org/...\` : ""` 패턴 — doi 없는 ref 는 doi_url 에 빈 문자열 저장. production 분포: `doi_url` 빈 문자열 65건 / null 5건 / 유효 URL 773건. **DOI 가 도입된 건 2000년대 이후 — 그 이전 발표된 옛 논문은 PubMed 등록은 됐지만 DOI 자체가 본래 없는 정상 데이터 케이스**. `UrlOrEmpty = z.union([z.string().url().max(2048), z.literal("")])` helper 로 빈 문자열도 합법 표현으로 수용.

### Lesson (검증 강화)
김수형 원장 보고 (V/VI commit) 이후 production 의 모든 PubMed ref 필드를 빈 문자열 vs null vs 유효값 분포로 cross-check 한 결과 추가 65건 잠재 회귀 발견. 향후 zod schema 추가 시 production 실데이터의 실제 분포 검증 단계를 정합 체크리스트에 포함.

---

## [2026-05-26] (VI) — 김수형 원장 회귀 2차 fix: pubmed_refs nullable 누락

### Fixed
- **참고문헌이 아예 없는 카드 수정 시에도 `invalid_input` 에러**: 직전 (V) commit 으로 PubMed 필드명 정합 + SSOT 했으나, **`pubmed_refs` 자체의 nullable() 누락** 별개 버그를 못 잡음. EditClient `handleSubmit` 의 `payload.pubmedRefs.length > 0 ? payload.pubmedRefs : null` 로직이 0개일 때 `null` 전송 → zod schema `z.array(...).max(20).optional()` 가 array 또는 undefined 만 허용 (nullable() 없음) → reject. 김수형 원장 카드 #2188 (미간 주름 — pubmed_refs=null) 도 동일 차단. 참고문헌 유무와 무관하게 모든 카드 수정 막혔던 회귀. nullable() 추가로 해소.

### Lesson
직전 V commit 검증 시 "참고문헌 있는 카드만 영향" 으로 잘못 진단. 실제는 null 자체도 막던 더 광범위한 버그. 검증 단계에서 production 의 김수형 원장 실제 카드 데이터 (pubmed_refs=null) 를 미리 확인했어야 함. payload 의 모든 nullable 필드를 zod 와 cross-check 하는 점검 누락.

---

## [2026-05-26] (V) — 김수형 원장 회귀 fix + PubMed schema SSOT 패턴 적용

### Fixed
- **PubMed 참고문헌이 붙은 모든 카드 수정 시 `invalid_input` 에러** (`src/lib/schema/api/articles.ts`): `PubmedRefSchema` 의 필드명이 클라이언트 (`PubmedRefsField.tsx` 의 `PubmedRefObj` 타입) 실제 전송 필드와 불일치. zod schema 는 `authors`/`url` 기대했으나 클라이언트는 `authors_short`/`pubmed_url`/`doi_url` 전송. `.strict()` 모드라 정의되지 않은 필드 reject → PUT `/api/articles/[id]` 진입점에서 차단. 이번 commit 들 (0158~0163) 과 무관한 기존 버그였으나 김수형 원장 보고로 발견. PubMed 참고문헌 갖춘 9명 의사 카드 전체 수정 차단됐을 가능성. 필드명 일치 + 모든 필드 nullable 처리로 즉시 해소.

### Changed
- **SSOT (단일 출처) 패턴 적용** — PubMed 참고문헌 타입 정의가 zod schema (`articles.ts`) 와 TypeScript type (`PubmedRefsField.tsx`) 두 곳에 분산되어 동기화 누락 가능성 (이번 회귀의 근본 원인). zod schema 한 곳에서 정의 + `z.infer<typeof PubmedRefSchema>` 로 type 추출 → `PubmedRefsField.tsx` 가 그것을 import + re-export. 향후 형식 변경 시 한 곳만 수정하면 클라이언트/서버 양쪽 자동 정합. 같은 패턴의 회귀 재발 차단.

---

## [2026-05-26] (IV) — Phase 2-C 정리 + admin 가드 방어 심층화 (0163)

사용자 정책 확정 — propagate_onboarding 의 복사 대상 컬럼은 "사람 단위 사실 정보 + 동의(구두 별도 받음)" 만, "신분별 다른 노출 정책 (field_visibility)" 은 제외.

### Security
- **마이그레이션 0163**:
  - `propagate_onboarding_to_doctor_bundle` 복사 대상 정정 — 유지: birthdate/gender/face_shape/skin_type/skin_concerns/interested_procedures/liked_procedures (PII 7개) + bio + terms_agreed_at + marketing_email_consent (총 10개). 제외: field_visibility (의사 신분 노출 다름), legal_name (컬럼 drop 됨). COALESCE 라 빈 경우만 복사 → "초기 복사 후 독립" 보장.
  - `find_auth_user_by_email_with_providers` 가드 추가 — `auth.role() = 'service_role'` 또는 `is_admin()` 만 통과. 일반 authenticated/anon 차단. PIPA enumeration attack (임의 이메일로 가입 여부 + OAuth provider 노출) 방어. Naver/Google OAuth callback route 의 service_role 호출은 그대로 통과.
  - `rotate_push_webhook_secret` 가드 추가 — `is_admin()` 본문 체크. grant 만 의존하지 않는 방어 심층화.
  - `search_logs` 옛 콜론 정책 (`search_logs: admin select`, `search_logs: anyone insert`) DROP — 새 underscore 정책 (`search_logs_*`) 만 유지. 중복 정리.

### Changed
- `src/components/Card.tsx` `performHide` → `toggle_card_hide` RPC 호출. admin EditClient 의 `handleToggleHide` (0162) 와 동일 진입점 — 일반 카드 케밥 메뉴 [숨기기] 도 같은 RPC 사용. 옛 직접 `cards.update({status})` 패턴 폐기.

### 의사 계정 생성 흐름 명문화
사용자 확정 — 옛 흐름 (의사 계정 admin 생성 → 개인 가입 → 묶음 연결) 폐기. **새 흐름: 개인 계정으로 가입 후 admin 이 의사 계정을 묶음에 추가**. 이때 `propagate_onboarding_to_doctor_bundle` 호출로 PII 10개 초기 복사. 이후 각 계정 독립.

---

## [2026-05-26] (III) — Phase 2 정합 (인터랙션·알림·RPC 전체 계정 단위)

사용자 정책 확정: **"모든 데이터는 계정별 완전 독립. 묶음은 전환 메커니즘일 뿐 권한·기록 공유 X."**

### Security
- **마이그레이션 0161** (Phase 2-A 인터랙션 RLS 일괄):
  - `cards_public_read` SELECT 정책 마지막 분기 계정 단위 (`author_id = COALESCE(active, auth.uid())`)
  - `card_likes` / `card_saves` / `comment_likes` insert/delete/select 전부 계정 단위
  - `comments` insert/update/delete/select 전부 계정 단위
  - `notifications` 중복 정책 정리 (옛 `_self_select`/`_self_update` DROP) + 단일 정책 계정 단위
  - `notification_preferences`, `push_subscriptions` 계정 단위 (사용자 정책 — device 단위 공유 X)
- **마이그레이션 0162** (Phase 2-B RPC 일괄):
  - 신규 `toggle_card_hide(p_card_id, p_next_status)` RPC — admin EditClient `[숨기기]` 의 안전한 통일 진입점
  - `soft_delete_card`, `get_my_stats`, `get_my_notifications`, `mark_my_notifications_read`, `toggle_card_like`, `toggle_card_save`, `toggle_comment_like`, `toggle_card_pick`, `_check_doctor_kpi_access`, `get_doctor_kpi`, `anonymize_user_content_before_delete` 본문 모두 계정 단위로 교체
  - **`get_my_stats` 회귀 fix**: Phase 9 이전의 `author_id = auth.uid()` 직접 비교 패턴이 잔존해 sub-profile 사용자(예: 정한미 의사 계정)는 통계가 깨져 있었음. 본 fix 로 정상화
  - `anonymize_user_content_before_delete` 묶음 일괄 익명화 → active 계정 1개만 익명화 (정책 일관)

### Changed
- `src/app/admin/cards/[id]/edit/EditClient.tsx`: `handleToggleHide` 가 직접 `cards.update({status})` 대신 새 RPC `toggle_card_hide` 호출. soft-delete 와 일관된 RPC 패턴.
- `src/components/IdentitySwitcher.tsx`: `KIND_LABEL` 에서 `primary: "기본"` 제거 (위계 함의). `aria-label`/`title` 분기에서 `active.kind === "primary"` 제거 — role 만 기준.
- `src/app/layout.tsx`: identities 정렬 코멘트 명확화 ("dropdown 정렬 — 역할 우선도, 권한 부여와 무관").
- `src/lib/doctor-mapping.ts`: 주석의 "본계/부계" → "base auth_user_id / sub-identity" 용어로 통일.
- `docs/DATABASE.md`: cards 섹션 + comments/likes/saves/notifications 섹션 0161/0162 반영. 마이그레이션 표에 0153 의 폐기 사실 명시 + 0161/0162 추가.
- `docs/decisions/0011-active-identity-permission-system.md`: Phase 2 완료 사실 명문화 + `same_group_profile_ids` 정합된 용도 (위조 차단 + dropdown 표시만) 명시.

### 용어 통일
사용자 확정 — "신분" 보다 **"계정"** 표현 사용. 코드 주석·문서·ADR 모두 "계정 단위 (active profile 단위)" 로 통일.

---

## [2026-05-26] (II) — Active identity 단위 권한 시스템 정합 (ADR 0011)

### Security
- **마이그레이션 0159**: `current_active_profile_id()` GUC 헬퍼 신설 (`current_setting('request.headers')::json ->> 'x-active-profile-id'` 읽음, UUID 형식 검증). `is_admin()` / `current_doctor_id()` 본문 active 인식으로 교체 — `profile.id = COALESCE(current_active_profile_id(), uid)` AND `(p.id=uid OR p.auth_user_id=uid)` (위조 차단). 옛 0153 "묶음 안 admin profile 도 admin 인정" 패턴 폐기.
- **마이그레이션 0160**: cards RLS 정책 재작성. `cards_owner_update/delete`, `cards_user_own_post/_delete` 의 `author_id IN same_group_profile_ids(uid)` → `author_id = COALESCE(current_active_profile_id(), auth.uid())`. `cards_user_post_insert` 3중 OR 분기 모두 active 단위. **`cards_open_all_to_auth` 정책 DROP** — USING=true/WITH CHECK=true PERMISSIVE 라 모든 owner/doctor 정책을 무력화하던 보안 구멍.

### Changed
- `src/lib/supabase/server.ts`: cookie `pibutenten:identity` 값이 UUID 면 `x-active-profile-id` HTTP 헤더 자동 추가. PostgREST GUC 로 노출 → RLS/RPC 가 active 신분 단위 동작.
- `src/lib/supabase/client.ts`: mirror cookie `pibutenten:identity-mirror` 읽어 동일 헤더 추가.
- `docs/decisions/0001-multi-profile-identity.md`: "동등 독립 + active 단위 권한" 원칙 명시. 옛 0153/0155 묶음 단위 패턴이 본 원칙 위배였음 + 0159/0160 정합 사실 명기.
- `docs/decisions/0006-rls-policy-strategy.md`: `is_admin()` / `current_doctor_id()` 가 active 인식 (0159) 임을 명시. 옛 묶음 인식 확장 폐기.
- `docs/PRD.md`, `docs/ARCHITECTURE.md`, `docs/RUNBOOK.md`, `docs/DATABASE.md`: "본계/부계" / "본명/부계정" / "의사 본인" 등 위계 표현 일괄 정정 (동등 독립 표현으로). DATABASE.md 의 옛 잘못된 RLS 정책 문자열도 실제 구현과 일치하게 정정.

### Added
- **`docs/decisions/0011-active-identity-permission-system.md`** ADR 신설: HTTP 헤더 GUC 기반 active identity 단위 권한 시스템 (Phase 1 — cards 테이블 정합). 후속 Phase 2 에서 card_likes/saves/comments + admin RPC 등 추가 정합 예정.

### Background
ADR 0001 본문은 "묶음 동등 독립 + active 신분 단위 권한" 이라고 선언했으나, 마이그레이션 0153/0155 와 핵심 함수 (`is_admin`, `current_doctor_id`) 가 점진적으로 "묶음 단위 권한 합산" 으로 짜여 ADR 정신과 어긋남. 새 세션의 AI 가 코드 패턴부터 학습하다 보니 "묶음 단위가 우리 규칙" 으로 잘못 이해 → 사용자 정정 반복. 본 commit 으로 코드와 ADR 일치.

---

## [2026-05-26] — 두 원장 회귀 fix (이도영 카드 삭제 + 정한미 의사 대시보드 진입)

### Fixed
- **이도영 원장 카드 #2316 [지우기] 회귀** (`admin/cards/[id]/edit/EditClient.tsx`): 2026-05-23 의 [지우기] RPC 통일 작업에서 admin EditClient 의 `handleSoftDelete` 만 누락되어 직접 `cards.update({deleted_at})` 호출이 남아 있었음. doctor admin 본인이 본인 카드 `/admin/cards/{id}/edit` 진입 → [지우기] 클릭 시 PostgreSQL RLS WITH CHECK 의 sub-select 평가 미묘 이슈로 `new row violates row-level security policy for table "cards"` raw 에러가 form 빨간 박스에 노출. `soft_delete_card` RPC 호출로 통일 — 다른 [지우기] 경로와 동일 패턴.
- **정한미 원장 우상단 프로필 클릭 → 홈으로 튕김 회귀** (마이그레이션 0158 + `src/lib/doctor-mapping.ts`): 의사 본계로 신분 전환한 상태에서 `/doctor` 진입 시 시스템이 의사 매핑을 묻는데, 이걸 일반 SELECT 로 묻다 보니 `doctor_accounts_select` RLS 정책 `(auth.uid() = profile_id) OR is_admin()` 에 막힘. PostgreSQL `auth.uid()` 는 active identity 전환을 모르고 항상 primary auth user 만 가리킴. 정한미 본계 = sub-identity (auth_user_id != profile.id) 라 본인 의사 매핑조차 못 봄 → doctorId=null → `/` redirect. 본계가 primary 가 아닌 의사 = 정한미 1명만 해당되는 회귀.

### Security
- **마이그레이션 0158**: `get_active_doctor_id(p_profile_id)` SECURITY DEFINER RPC 신설. ADR 0001 의 "묶음 동등 독립 + active 신분 단위 권한" 원칙 준수 — RLS 정책 `doctor_accounts_select` 를 "묶음 전체" 로 확장하지 않고, active 신분의 profile.id 를 명시적으로 전달받아 그 신분 단독 매핑만 lookup. 위조 차단은 함수 내 `same_group_profile_ids` 검증으로 보장. 너구리로 active 전환 시 너구리 profile.id 전달 → null → 의사 권한 자동 상속 차단 (ADR 원칙 일치).

### Changed
- `src/lib/doctor-mapping.ts` `getDoctorIdForProfile` 가 `doctor_accounts` 직접 SELECT 대신 `get_active_doctor_id` RPC 호출. 호출 측 (`identity-server.ts resolveActiveIdentity` 등) 인터페이스 동일 — 내부 구현만 active 권한 단위로 정정.

---

## [2026-05-23] — 온보딩 UI 후속 + 방문자 정의 확장

### Added
- **site_visits 테이블** (마이그레이션 0157): 24h 1회 사이트 진입 추적. `path` + `session_id` + `user_id` 컬럼, 3개 부분 인덱스, RLS (admin SELECT + anon/authenticated INSERT). `get_top_visitors_inner` + `get_admin_kpi_inner` events CTE 에 UNION 추가. 미들웨어 `pibutenten_visited` 쿠키 (24h) 로 가드. ADR 0010 참조.
- **InterestPicker 자유 추가 입력** (`a8bcb14`): onAddCustom prop, h-9 input + "추가" 버튼, Enter 키 지원, IME composition 가드, maxLength 30.

### Changed
- **온보딩 안내문 두 문장 크기 통일** (`59e2d4d`): "추후에도 언제든지 변경하실 수 있어요" `text-[12.5px] text-[var(--text-muted)]` → `text-sm text-[var(--text-secondary)]`.
- **온보딩 칩 전부 가운데 정렬** (`59e2d4d`): 얼굴형/피부타입/피부고민 + InterestPicker 미리보기 `flex flex-wrap gap-2` → `flex flex-wrap justify-center gap-2`.
- **피부고민 모바일 5×2 그리드** (`93bce13`): `flex flex-wrap justify-center` → `grid grid-cols-5 place-items-center gap-1.5 sm:flex sm:flex-wrap`.
- **온보딩 칩 활성색 브랜드 통일** (#9CA3AF → #4CBFF2). 5번 InterestPicker 의 칩은 카테고리 색 유지.
- **5번 안내문 페이지 상단 부제 밑으로 이동**.
- **자기소개 선택 항목화** (`57399f5`): bio 미입력 시 "만나서 반갑습니다." 자동 저장.
- **카드 [지우기] RPC 통일** (`Card.tsx` + `EditClient`): `sb.from("cards").update({deleted_at})` → `sb.rpc("soft_delete_card", { p_card_id })`.

### Fixed
- **카드 삭제 RLS silent fail** (마이그레이션 0156): `soft_delete_card` SECURITY DEFINER RPC 신설. 이도영 원장 카드 #2316 [지우기] 시 RLS 회귀 해소. PostgreSQL RLS evaluator sub-select 평가 미묘 이슈 우회.
- **InterestPicker 무한 떨림** (`fcae184`): ResizeObserver 폐기 → effect 두 개 분리 (cutoff reset / 측정).
- **`cards.keywords` '엘라비에리투오' 정규화** (`57399f5`): 14건 UPDATE 로 중복 제거.

---

## [2026-05-23] (이전 II) — 온보딩 섹션 제목 + 관심 키워드 칩 픽커

### Added
- **InterestPicker 컴포넌트** (`5252e87`): /search CategoryWithChips UI 재현. 5개 카테고리 탭 (concerns/lifting/injectables/homecare/knowledge) + 카테고리별 인기 키워드 칩. 최대 10개 (`INTERESTS_MAX`).

### Changed
- **섹션 제목 문장체 일관화**: "프로필 사진" → "프로필 사진을 올려주세요!" 등 7개 섹션 다정한 질문체로 통일.
- **관심 키워드 picker** 가 PROCEDURES enum 의존 제거. `profiles.interested_procedures` 한국어 키워드 저장.

---

## [2026-05-23] — 관리자/원장 대시보드 기본 기간 7일 → 24시간 (`9c2585c`)

### Changed
- 6개 파일 `initialDays` / `DEFAULT_DAYS` 7 → 1: `admin/ActivityKpis.tsx`, `admin/page.tsx`, `admin/PopularCards.tsx`, `admin/stats/[kind]/page.tsx`, `doctor/DoctorActivityKpis.tsx`, `doctor/page.tsx`.

---

## [2026-05-22] — 카드 #2298 복원 + RLS silent block 감지 + 토스트 피드백 (`9f6e1a6`)

### Fixed
- 사용자 보고 "안 지워짐 + 어디 갔어?" 모순 원인: 성공 피드백(토스트) 부재 + vanishing 애니메이션 명확성 부족.
- `Card.tsx performDelete/performHide` `.update(...).select("id")` 패턴 → affected rows 회수, `data.length === 0` 시 RLS silent block 판단 → "권한이 없어 처리할 수 없어요" 토스트.
- `EditClient handleOwnerDelete` 동일 패턴 + 0 rows throw.
- **DB 복원**: `UPDATE cards SET deleted_at = NULL WHERE id = 2298`.

---

## [2026-05-22] (밤 II) — 다중 신분 카드 삭제 silent fail + 회원 [지우기] + BackButton (`88d78ac`)

### Security
- **마이그레이션 0155**: `cards_owner_update` / `cards_owner_delete` 정책 신설. `author_id IN same_group_profile_ids(uid)` — type 제약 없이 모든 type 커버.

### Added
- CardEditor `onOwnerDelete` prop. /write/[shortcode]/EditClient.tsx `handleOwnerDelete`.

### Fixed
- BackButton `min-h-[48px]` 추가 — 일부 부모 컨테이너 높이 충돌 해소.

---

## [2026-05-22] (밤) — 네비 아이콘 SVG 교체 + 댓글 레이아웃 재설계 + 카드 톤 정비 (`9a38a4a`)

### Added
- 디자인 SVG 6종 신규 (`public/icons/`): `ic_nav_search.svg` / `ic_nav_doctor.svg` / `ic_nav_bell.svg` / `youtube.svg` / `comment_btn_enabled.svg` / `comment_btn_disabled.svg`.

### Changed
- **TopNav**: 인라인 SVG 3종 → `<img>` 1:1, 모바일 아이콘 간격 gap-3 통일.
- **CommentsBlock**: flex-wrap items-baseline → `display: flow-root` + `float-right` 메타. CommentForm `rounded-full` → `rounded-[20px]` 고정.
- **BackButton**: text-[13px] / `color: #A2A6AF` / padding 상하 16px.
- **CardMedia 영상 보러가기**: ▶ 이모지 → youtube SVG.
- **CardHeader 배지**: HOT/NEW/Pick `pt-0.5 pb-1` → `py-1` (대칭). ⋮ 메뉴 "숨김 해제" → "해제".
- **CardActions**: 아이콘 `strokeWidth={2}` → `1.5` (얇게, 톤다운).
- **숨김 카드 시각 피드백**: `bg-white` → `bg-[#EEEEEE]` when `isHidden`.
- **CardEditor edit 모드 버튼**: 관리자 3개 (숨기기/지우기/올리기), 일반 1개 (올리기).

### Fixed
- **API /api/articles 끄적끄적 카테고리 버그**: `VALID_CATEGORIES` 배열에 `'doodle'` 누락 → fallback 도 `'diary'` → `'doodle'`.

### Removed
- 원장 글쓰기 "저장" (save_draft) / "검수 요청" (request_review) 두 버튼 제거. 즉시 발행만 가능.

---

## [2026-05-22] (저녁) — 에디터 통합 Phase 4b/4c + 카드/댓글 숨김 기능 + 글쓴이 dropdown 차등 필터

### Security
- **마이그레이션 0151**: `toggle_card_pick` = admin OR self-doctor.
- **마이그레이션 0152**: `qa_status enum 'hidden'` 추가.
- **마이그레이션 0153**: `is_admin()` 묶음 인식 확장 (same_group 안의 admin profile 도 admin 으로 인정).
- **마이그레이션 0154**: `feed_cards_scored` 반환 시그니처에 `status text` 컬럼 추가.

### Changed
- 에디터 통합 (PRD §17 Phase 4b/4c 완료): `/write` WriteClient 697→211 LOC, `/admin/cards/[id]/edit` EditClient 1230→310 LOC. 모든 에디터 진입점 `<CardEditor>` 통합 컴포넌트 사용.
- 글쓴이 dropdown 역할별 차등: 일반회원 readonly / 원장 의사 풀만 / 관리자 admin 풀만.
- 라벨 통일 "숨김" (보관→숨김 환원).
- 에디터 액션바 4개 디자인 통일.

### Added
- `src/lib/admin-card-extras.ts` (admin 공통 fetch 헬퍼).

---

## [2026-05-22] — 8건 배치 (브랜드색 + 카드 톤 + 모달 + 안내페이지 + 의사 대시보드 + 방문자 칩)

### Changed
- 브랜드색 `#4CBFF2` 통일 + 태그 `#595E60` + 하이라이트 200톤 (`bbcbd15`).
- `EngagementPromptDialog` 신설 + Page Visibility API + 임계점 10→6 (ADR 0008, v2). reason별 카피 4종. "3초만에 가입" 트러스트 (`798d9ad`).
- `SiteFooter` 7→6링크, '신고하기'→'콘텐츠 신고'. `InfoPageLayout`/`Nav`/`Footer` 신설, 6개 안내 페이지 wrapper 화 (`cbbaeec`).
- `DoctorDashboardWidget` + `getDoctorDashboardData` 헬퍼. status별 카드 카운트 + 검수 대기 미리보기 (`95a88cd`).

### Security
- **마이그레이션 0145+0146**: `get_top_visitors_inner last_visit_at` 추가 + 비로그인 sticky-top 정렬. `get_admin_kpi_inner new_members/new_cards` 컬럼 +2. `get_top_new_members/cards` 신규 RPC.

---

## [2026-05-21] (저녁) — PWA 아이콘 디자인 최종 정착 + 1일 1방문 dedup + 비로그인 흥미 점수 (`a23ba1e`)

### Added
- **PWA 아이콘 2그룹 구조** (ADR 0009):
  - favicon (16/32/48/192) + splash-circle-512: 원형 + 투명. source = `public/icons/symbol.svg`.
  - PWA OS 홈 아이콘 (apple-touch-icon/icon-192/icon-512/icon-maskable-512): 청색 사각 + 흰 글자. source = `public/icons/symbol-pwa.svg`.
- **마이그레이션 0144**: visitor 1일 1방문 (KST) dedup. 4개 RPC 패턴 통일 (ADR 0010).
- **비로그인 흥미 점수 시스템 Phase 2** (ADR 0008):
  - `src/lib/engagement-score.ts` 신설.
  - `EngagementPromptListener.tsx` layout.tsx mount.
  - 트리거: card-view / card-expand / video-click / search.

### Changed
- `scripts/regen-icons.mjs` 10개 아이콘 일괄 재생성 (sharp + svg 렌더 density 600).
- 임계점 v1=10 → v2=6 → v3=15 (충분한 체험 후 권유).

---

## [2026-05-20] (저녁) — 대시보드 RPC 5개 전수 통일 + 비로그인 모달 정공법 fix (`2c736dc`)

### Security
- **마이그레이션 0143**: `get_admin_kpi_inner` + `get_users_kpi_inner` 를 impression∪view 합산 + distinct visitor 패턴 통일. `get_card_activity_users(_inner)` 에 `p_days` 시간 윈도우 파라미터 추가.

### Fixed
- admin 대시보드 24h 방문자 2 → 8 (정상화).
- "쥬브젠" 카드 TOP cnt 6 → 5 (정확화), 닉네임 칩 14 → 5 (시간 윈도우 일치).
- 비로그인 좋아요 클릭 silent return → 즉시 LoginPromptDialog.

### Added
- `src/lib/session-context.tsx` (SSR session 즉시 me 결정).

---

## [2026-05-20] — 카드 톤 정비 + PWA 자산 갱신 (`5768142` + `faa08b1`)

### Changed
- 카드 강조 하이라이트 5색 (Sky/Mint/Pink/Apricot/Lavender hex 라이트 톤) — `card-highlight.ts`.
- 글자색 4톤 부드러운 검정 — `--text #383F47` / `--text-secondary #595E60` / **`--text-icon #77868F 신규`** / `--text-muted #A2A6AF`.
- CardActions 기본색 `--text-secondary` → `--text-icon`.
- 피부과 전문의 blue badge SVG 교체 (viewBox 24→12).
- PWA manifest.background_color #FFFFFF → #4CBFF2. viewport.themeColor #4CBFF2 → #FFFFFF.
- 파비콘/아이콘 9개 일괄 재생성.

### Added
- `scripts/regen-icons.mjs` 빌드 스크립트.
- `apple-touch-startup-image` 메타 (iOS 흰 빈 화면 해소).

---

## [2026-05-19] — 보안 2.5차 점검 즉시 묶음 D~F + Next.js 16.2.6 패치

### Security
- **묶음 D** (`de11b2e`): Next.js 16.2.6 (High 13 + Mod 1 해결) + zod 입력 검증 (/api/articles POST/PUT) + rate-limit fail-closed + PII 마스킹 헬퍼 + simple-git-hooks secret-scan pre-commit. `docs/incident-secret-rotation.md` 신설.
- **묶음 A** (`e62fd3c`): 약관·처리방침 — 의료법 56조 6개 세부 금지 명시 + 임시조치 30일 절차 + 탈퇴 5단계 + 처리방침 국외이전 표 완성.
- **묶음 B+C** (`e513dc1`): /report 신고 페이지 + ReportForm + POST /api/reports + content_reports 테이블 (0137) + /disclaimer 의료 면책 + 푸터 링크 2개 + 온보딩 피부정보 활용 동의 (0138).
- **묶음 E** (`604b18f`): 콘텐츠 자동 검수기 v1 (ADR 0007) — 의료법 §56② 14금지 + 약사법 §68 + 환자후기 키워드. cards.screening_flags (0139). 자살/자해 안전 메시지 모달 1회.
- **묶음 F** (`b7ea56a`): audit_logs 테이블 (0140) + logAudit() 헬퍼 + 민감 API 3개 자동 기록 — PIPA §8 충족.
- **핫픽스** (`b07bc7e`, 0141): content_reports/audit_logs service_role GRANT 보강.

### Added
- `src/lib/schema/api/articles.ts` zod ArticleCreateSchema / ArticleUpdateSchema.
- `src/lib/content-screening.ts` + `content-screening-dict.ts`.
- `src/lib/audit-log.ts`.
- `src/app/report/page.tsx` + `ReportForm.tsx`.
- `src/app/disclaimer/page.tsx`.
- `scripts/secret-scan.js` (Node 정규식 pre-commit).

---

## [2026-05-19] (오전) — 보안 2차 점검 즉시 항목 전부 (PR-N + PR-A + PR-OPS + PR-B + PR-C)

### Security
- 네이버 OAuth 검수 통과·production 적용 (PR-N, `1078e2f`).
- auth.users 조회 RPC 격리 (0133).
- 잔여 8개 라우트 error.message 일반화 (E2).
- CSP `img-src https:` 와일드카드 제거 (E3).
- `find_duplicate_profiles` enumeration 보강 (0134, E5).
- admin/draft·push/subscribe rate-limit (E6).
- articles 버킷 IaC 명문화 (0136, E7).

### Added
- 운영 프로그램 "회원가입 에러 로그" (0135, `/admin/auth-errors`).
- admin 메뉴 "대시보드/운영 프로그램" 분류 정리.
- 푸터 mailto + 로그인 에러 화면 error_id + 문의 안내.
- SOP 문서 `docs/doctor-onboarding-sop.md`.

---

## [2026-05-18] (저녁) — 에디터 통합 Phase 1·2·2.5·3·4a + 안전망 (`fa2a676` 외)

### Added
- **Phase 1** (`aeb9ca2`): `src/components/card-editor/fields/PubmedRefsField.tsx`, `ExternalLinkField.tsx` 추출. WriteClient 1001→640 LOC.
- **Phase 2** (`367a196`): `/write/[shortcode]/EditClient.tsx` 138→265 LOC 풀폼.
- **Phase 2.5** (`1e9ace0`): 새소식 한도 800 통일 / 영상 URL ⇄ 시작시간 양방향 sync (`src/lib/youtube-start-time.ts`) / 참고문헌 chip PubMed 새 탭 / 카테고리 변경 본인 허용.
- **Phase 3** (`fa2a676`): `PUT /api/articles/[id]` 신규. 권한 검증 `getIdentityContext`. payload validation. rate-limit 분당 10회.
- **Phase 4a** (`8f7ca47`): `src/components/card-editor/CardEditor.tsx` 480 LOC. 회원 EditClient 300→110 LOC wrapper.

### Security
- **마이그레이션 0132**: `cards.deleted_at` + 부분 인덱스 + RLS 강제 (`cards_public_read` 에 `deleted_at IS NULL`). soft-delete.
- `/api/admin/draft/publish` 자동 dedup: 동일 video + (start_seconds + question prefix) skip.

### Changed
- ExternalLinkField **[등록] → [미리보기] 2단계** (참고문헌 UX 동일 패턴).
- 라벨 통일: "영상 URL"/"외부 링크" → "URL 입력". "삭제" → "지우기", "발행" → "올리기".
- MarkdownBoldEditor 버튼 "B 굵게" → "강조".

### Fixed
- 권한 판정 모순 (`4354b79`): `/write/[shortcode]/page.tsx` 가 `supabase.auth.getUser()` 의 base profile.role 만 보고 식별자 전환 무시 → `getIdentityContext()` 통일.
- doctor_accounts 매핑 정정 (`17be120`, 0130): 김수형/박효진/강현진 3명.

### Restored
- 김종식 doctor "수염 제모" 카드 백업에서 복구 (`9c8d252`, 0131): id 2007 자리 누락 → 신규 row (id 2288, shortcode Tom5akqp).

---

## [2026-05-17] — 상용화 준비 + 베타 봇 차단 + PubMed 칩 회귀 fix + 보안 1차 점검 완료

### Added
- **Vercel Pro 결제 완료** — Hobby 약관상 상업적 사용 불가, Pro 한도 1TB/24,000분.
- **보안 1차 (A1~A12)** 전부 적용 — 마이그레이션 0119~0125 (admin RPC is_admin() 가드 + anon PII lockdown + 14세 CHECK + push_webhook_secret Vault + toggle_card_pick admin 가드 등).

### Security
- `robots.ts` 베타기간 전체 봇 차단 (`1a3b764`).
- `@types/jsdom` 버전 정정 `^29.0.0` → `^28.0.3` (`384d86f`).

### Changed
- WriteClient PubMed 칩 박스 제거 (`dcd19de`).

### Fixed
- PubMed 칩 등록 판정 회귀 (`4697bfe`): `isRegistered = ref.trim().length > 0` → `ref.indexOf(" — ") !== -1`.

---

## [2026-05-16] (Phase 7-extra) — soft-delete 익명화 + 이메일 dedup + 회귀 3건 fix

### Security
- **마이그레이션 0109/0110/0111**: sentinel 폐기 → soft-delete in-place 익명화 (ADR 0002). legal_name 폐기 + contact_email dedup (ADR 0003).

### Changed
- 온보딩 폼: 실명 입력 제거, OAuth provider email 자동 채움. Chip 선택 색조 진한회색 → 중간회색.

### Fixed
- IdentitySwitcher dropdown 사라짐 (layout.tsx bundle filter).
- 온보딩 의사 아바타 표시 (page.tsx group rows + role='user' 우선).
- 24h visitor 통계 1명 (`impression-queue.ts onConflict` 키 정정 — `card_id,session_id`). 배포 직후 KPI visitors 1 → 41 회복.

### Removed
- E2E orphan profile 6건 정리.
- @pibutenten 닉네임 `관리자` → `피부텐텐`.

---

## [2026-05-16] (3rd) — 온보딩 강제 + 비로그인 모달 + Identity Phase 2 + qas 청소

### Added
- **마이그레이션 0098**: profiles.legal_name + find_duplicate_profiles RPC (※ 0110 으로 폐기).
- `LoginPromptDialog.tsx` (`2c045d0`): 좋아요/저장/댓글 시도 시 페이지 이동 → 인스타식 인라인 모달.
- `src/lib/identity-server.ts` (`78cade3`): resolveActiveIdentity 헬퍼 추출.

### Changed
- qas → cards 변수명 잔재 청소 8 파일 + 파일명 + 주석 (`10bcb48`).
- 온보딩 강제 게이트 (`f08cd06`): middleware.ts 활성화 (신규/기존 모두 birthdate NULL 차단).

### Fixed
- card_views/card_impressions INSERT 실패 시 console.error 추가 (fire-and-forget 로깅).

---

## [2026-05-16] (2nd) — 보안 강화 + Identity 통합 + 죽은 기능 청소

### Security
- **마이그레이션 0096**: profiles.avatar_bg_color drop (PR-C, 미사용 죽은 기능).
- **마이그레이션 0097**: YouTube OAuth refresh_token DB 이전 (PR-A-1). callback HTML 평문 노출 제거 + .env.local fs write 제거.
- A-2 identity 쿠키 httpOnly 분리: `pibutenten:identity` (httpOnly true) + `pibutenten:identity-mirror` (httpOnly false, UI 표시). ADR 0005.
- A-3 env-fallback dev 가드 강화 (production/VERCEL=1 fs read 차단).
- /api/admin/comments 권한 좁힘 (super admin only).
- /api/upload 매직바이트 검증 (SVG XSS 차단).

### Added
- `src/lib/identity-shared.ts` (PR-B): isomorphic. IDENTITY_COOKIE, UUID_RE, ActiveIdentity 통합.

### Removed
- deprecated `kind` 필드.

---

## [2026-05-16] (1st) — 별점 폐기 + 공유 추적 정상화 + author_id 버그 수정

### Removed
- **마이그레이션 0094**: 별점 시스템 완전 폐기. card_ratings 테이블 + cards.rating_avg/rating_count + 트리거 drop. scored RPC 3종 재정의.
- 코드 8 파일 별점 state/UI/fetch (~130줄). Card.tsx / Feed / ProfileTabs / viewer-states / page들.

### Security
- **마이그레이션 0095**: 공유 추적 정상화. card_shares INSERT 트리거 (like/save 패턴) + `increment_card_share` RPC drop. RLS 정책명 cosmetic 리네임.
- Card.tsx 공유: 'native'/'link-copy' 채널 반환 → 단일 INSERT.

### Fixed
- P0-1: `/api/admin/draft/save` 의 `cards.author_id` 에 `guard.userId` (auth.users.id) → `guard.adminProfileId` (profiles.id) 수정.

---

## [2026-05-15] — Persona 폐기 + 정리 (`251d14a`)

### Removed
- **마이그레이션 0090**: Persona 시스템 완전 폐기. alt_* / posted_as / persona 컬럼·enum 모두 drop.
- 코드 19 파일 정리: persona.ts, persona-server.ts, PersonaSwitcher, DashboardPersonaToggle, /settings/profile/persona/ 삭제.

### Changed
- 검색 RPC (search_cards_scored, feed_cards_scored, tag_cards_scored) 재정의 — alt_*/posted_as 분기 제거.
- handle 검사 트리거 단순화.
- HeroSearch phrase 28개로 정비.

---

## 더 이전 변경 이력

- **2026-05-15 ~ 2026-05-16 상세**: `_archive/docs/PRD_changelog_2026-05-15-16.md`
- **그 이전 전체 이력**: `_archive/docs/prd-monolith-2026-05-23.md` (1836줄 monolith PRD)

---

**기록 규칙** (CLAUDE.md §6 참조):
- 매 커밋·세션 마무리 시 `## [YYYY-MM-DD]` 블록 1개 추가
- `### Added` / `### Changed` / `### Fixed` / `### Security` / `### Removed` / `### Restored` 카테고리
- 도메인 문서 헤더 누적 절대 금지
