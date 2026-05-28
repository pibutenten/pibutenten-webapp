# Changelog

[Keep a Changelog](https://keepachangelog.com/) 표준. 모든 변경은 여기에 기록. 도메인 문서 (PRD/ARCHITECTURE/DATABASE 등) 헤더에는 절대 누적 금지 (CLAUDE.md §6).

> **2026-05-15 이전 변경 이력**: `_archive/docs/prd-monolith-2026-05-23.md` 및 `_archive/docs/PRD_changelog_2026-05-15-16.md` 참조.

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
