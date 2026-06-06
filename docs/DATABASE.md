# 데이터베이스 (DATABASE)

Supabase Postgres 스키마·RLS 정책·RPC·Storage·마이그레이션 히스토리. 큰 의사결정의 배경은 `decisions/` 참조.

- **Project ID**: `nahznfvouuwxqctwlwfs`
- **마이그레이션 폴더**: `pibutenten-app/supabase/migrations/`
- **실행 순서·동일번호 충돌**: `pibutenten-app/supabase/MIGRATION_HISTORY.md`

> ⚠️ **중요 리네이밍 히스토리**: 0065 마이그레이션에서 `qas → cards` 전면 리네임. RPC 도 `search_qas_scored → search_cards_scored` (0070, 0072). ADR 0004 참조.

---

## 1. 핵심 테이블

### 1.1. `profiles` (auth.users 와 N:1 — Phase 9, ADR 0001)

| 컬럼 | 타입 | 비고 |
|---|---|---|
| `id` | uuid PK | |
| `auth_user_id` | uuid → auth.users(id) | 같은 auth user 가 여러 profile 묶음 가능 |
| `role` | user_role enum | `admin` / `doctor` / `user` (`developer` value 는 0044~0050 시도 후 폐기, enum 안에 보존 — 실 데이터 0건, ADR 0011) |
| `handle` | text UNIQUE | URL용 핸들 (`/[handle]`) |
| `display_name` | text | |
| `avatar_url` | text | OAuth 사진 또는 사용자 업로드 |
| `bio` | text | 기본값 "만나서 반갑습니다." |
| `level`, `activity_score` | int | |
| `terms_agreed_at` | timestamptz | 이용약관 동의 시점 |
| `terms_agreed_version` | text | 동의한 약관 버전 (SSOT: `src/lib/consent-versions.ts`). F-1 0221 |
| `privacy_agreed_at` | timestamptz | 개인정보 수집·이용 동의 시점 (약관과 분리). F-1 0221 |
| `privacy_agreed_version` | text | 동의한 개인정보 처리방침 버전. F-1 0221 |
| `marketing_email_consent` | bool | 광고성 정보 수신 3-state (NULL=미질문/false=거부/true=동의, 0181) |
| `marketing_email_consent_at` | timestamptz | 마케팅 동의 시점 (동의 시에만 기록). F-1 0221 |
| `news_email_consent` | bool | 새 콘텐츠·업데이트 소식 수신 3-state (NULL/false/true). F-1 0221 |
| `news_email_consent_at` | timestamptz | 소식 수신 동의 시점 (동의 시에만 기록). F-1 0221 |
| `birthdate` | date | 온보딩 필수, 14세 미만 CHECK |
| `gender` | text CHECK | male/female/other |
| `face_shape` | text CHECK | oval/peanut/oblong/square/round |
| `skin_type` | text CHECK | 7종 |
| `skin_concerns` | text[] | 멀티 |
| `interested_procedures` | text[] | 멀티 (Phase 5.1 부터 한국어 키워드) |
| `field_visibility` | jsonb | 프로필 필드별 공개 여부 |
| `contact_email` | text | 중복 가입자 식별용 (OAuth provider email). ADR 0003 |
| `skin_info_consent_at` | timestamptz | 피부정보 활용 동의 시점 |
| `deleted_at` | timestamptz | 탈퇴 시각. NULL=활성. 설정 시 **해당 profile PII in-place 익명화**(handle·display_name·PII 마스킹 + auth_user_id NULL; 작성 카드·댓글 본문은 미변경). ADR 0002 |
| `created_at`, `updated_at` | timestamptz | |

**폐기된 컬럼** (DB 미존재):
- `alt_display_name`, `alt_avatar_url`, `alt_avatar_bg_color`, `alt_bio`, `alt_handle` — 0090 drop (persona 시스템 폐기)
- `legal_name` — 0110 drop (이메일 dedup 전환)
- `avatar_bg_color` — 0096 drop (죽은 기능)
- `liked_procedures` — 0184 drop (live 스키마 미존재 확인 2026-06-04)
- `is_public` — 0183 drop (live 스키마 미존재 확인 2026-06-04)

### 1.2. `cards` (구 qas — Q&A · 포스팅 · 칼럼 통합)

| 컬럼 | 비고 |
|---|---|
| `id` | bigserial PK |
| `type` | enum: `qa` / `post` (`article` 폐기 — 0076) |
| `category` | text — **현 4종: `qa`/`doodle`/`review`/`review_summary`**. (0198 6종→2종 qa/doodle, 0201 review/review_summary 추가. SSOT=`src/lib/post-category.ts`. diary/ask/tip/link 폐지.) |
| `status` | enum: `draft` / `pending_review` / `published` / `hidden` / `archived` (hidden 추가 0152) |
| `author_id` | uuid → profiles(id) |
| `doctor_id` | uuid → doctors(id) NULLABLE |
| `title`, `body`, `meta` | text — P2-4 (2026-05-27) 옛 question/answer 리네임 |
| `keywords` | text[] (6~8개) |
| `like_count`, `view_count`, `share_count`, `comment_count`, `save_count` | int |
| `post_year` | int — 발행 연도 (SEO URL) |
| `post_slug` | text — keyword 기반 slug (의사 글) |
| `shortcode` | text UNIQUE — 8자 base58 (회원 글) |
| `external_url` | text — 외부 링크 |
| `external_title`, `external_description`, `external_image`, `external_site_name` | OG 메타 |
| `hide_doctor_credential` | bool — 의사 직함 숨김 |
| `video_id` | nullable refs |
| `is_pick` | bool |
| `screening_flags` | text[] — 자동 검수 플래그 (의료법/약사법/환자후기) |
| `deleted_at` | timestamptz — soft-delete — `soft_delete_card` 가 `deleted_at` 만 set(본문·작성자 보존, status 미변경). 공개 차단=RLS + 피드/검색 `deleted_at IS NULL` 필터(0172). (0132). ADR 0002 |
| `created_at`, `updated_at` | timestamptz |

**리네임된 컬럼**:
- `question` → `title` (0171, P2-4 2026-05-27) — cards 가 Q&A 외 범용 글도 담음.
- `answer` → `body` (0171, P2-4 2026-05-27) — 위와 동일 이유.

**폐기된 컬럼**:
- `published` — 0104 drop (status 단일 SSOT)
- `rating_avg`, `rating_count` — 0094 drop (별점 시스템 폐기)

### 1.3. `comments`
- `author_id`, `card_id`, `parent_id`, `body`, `like_count`, `screening_flags` (text[], 0178)
- `status` `comment_status` enum: `visible / hidden / deleted`
  - `hidden` 의 의미 (2026-05-28~): (a) 회원 댓글 자동검수 임계 초과 또는 (b) `/admin/reports` 운영자 모더레이션. 영구 비공개·복구가능. 30일 임시조치 폐기.
- `author_id` profiles FK (0085)
- 폐기: `posted_as` (0090)

**`content_reports`** (신고 큐, 0137):
- 컬럼: `id, card_id, comment_id, reporter_profile_id, reporter_email, target_url, reason, detail, status, action_taken, resolution_note, resolved_at, resolved_by, created_at`
- `status` (text, NOT NULL DEFAULT `'pending'`): `pending` / `resolved_hidden` / `resolved_deleted` / `dismissed` (CHECK 마이그 0185, 2026-05-29). 옛 enum (`investigating/resolved/rejected/temp_blocked`) 은 row 0 상태에서 정리됨 — 호환 불필요.
- `action_taken` (text): `hide` / `delete` / `dismiss`.
- (`temp_block_until` 은 0137 도입 후 미사용 — 0237 에서 DROP.)

### 1.4. 인터랙션 (로그인 필수)
| 테이블 | PK | 비고 |
|---|---|---|
| `card_likes` | (card_id, profile_id) | profile_id = active 명함 id. 마이그 0187 (2026-05-29) 로 `user_id` → `profile_id` RENAME 완료 (ADR 0014 Phase 3) |
| `card_saves` | (card_id, profile_id) | 동일 |
| `comment_likes` | (comment_id, profile_id) | profiles FK 복구 0100. 마이그 0187 로 RENAME 완료 |

폐기: `card_likes.persona` (0090), `card_ratings` 테이블 (0094)

> **사람 ID 컬럼 명명 (ADR 0014, 2026-05-29)**: `profiles.id` 를 가리키는 컬럼은 콘텐츠 책임 주체 = `author_id` (cards, comments), 그 외 = `profile_id`. 옛 9개 테이블 (`card_likes/saves/views/impressions/shares/comment_likes/activity_points/daily_logins/site_visits`) 의 `user_id` 는 Phase 2 (마이그 0186) + Phase 3 (마이그 0187) 로 2026-05-29 `profile_id` 통일 완료. 신규 마이그·코드에서는 `user_id` 사용 금지 — pre-commit hook 으로 자동 차단.

### 1.5. 추적 (비로그인 포함)
| 테이블 | 비고 |
|---|---|
| `card_views` | dwell window 폐기 (0142). 명백한 의도 신호 (단독 진입/펼침/영상클릭/인터랙션) |
| `card_impressions` | 카드 노출 |
| `card_shares` | channel: `native`/`link-copy`. session_id 컬럼 (0142). 트리거로 share_count 자동 +1 (0095) |
| `site_visits` | 24h 1회 사이트 진입 (0157). ADR 0010 |

### 1.6. 알림 / 푸시
- `notifications`, `notification_preferences` (0062, 0063, 0079, 0080). kind 8종(0244): comment/reply/like/save/review_request/published/report/**keyword**. `notification_preferences` pref 컬럼: comment/reply/like/save/review_request/published + 관심 알림 3종 **keyword_interest/keyword_concern/keyword_skin_type**(0244, default ON). (※ report 는 전용 pref 없이 상시 수신.)
- 관심(Q&A) 알림 토대(0244 — 4-2/3b-1): `profiles.interested_procedures`·`skin_concerns` GIN 인덱스(태그 overlap digest 대비), `cards.keywords` GIN 은 기존.
- 관심(Q&A) 알림 생산자(0245 — 4-2/3b-2): `keyword_digest_state`(커서, service_role 전용·last_run_at DEFAULT now()), `run_keyword_digest()`(일일 digest, service_role EXECUTE), `url_encode_component()`(한글 태그 URL 인코딩). cron `/api/cron/keyword-digest`(06:00 KST). 커서 now() 초기값이라 첫 실행 0건.
- `push_subscriptions` (0084)
- `push_webhook_secret` Vault 이전 (0103)
- `push_webhook_errors`(알림 webhook 실패 로깅), `api_rate_limits`(rate limit 카운터) (0105). ※ 알림 실패 테이블 실제명=`push_webhook_errors` (과거 문서의 `push_error_log`/`push_errors` 표기는 오기).
- `push_send_failures`(0240 — 4-2 STEP F): `/api/push/send` 의 410/404(만료) 외 발송 실패(500·non-2xx·네트워크) 영속 로깅. service_role 기록·조회, anon/authenticated 차단. (push_webhook_errors=DB 트리거 net.http_post 예외/secret 누락, push_send_failures=앱 webpush 발송 실패 — 포착 계층이 다름.)

### 1.7. 운영
- `doctors`, `doctor_accounts`, `videos`
- `youtube_oauth_tokens` (0097 — DB 이전)
- `content_reports` (0137 — 신고 큐)
- `audit_logs` (0140 — 민감 API 1년 보관)

### 1.8. 사전 / 참조 (additive, 신규 — 1단계)
- `tag_dictionary` (0247 — 6분류 태그 사전, 2122행): `ko`(UNIQUE)/`category`(CHECK 6종)/`en`/`parent_ko`/`is_procedure`/`onboarding`(피부고민/피부타입/관심시술/얼굴형, 얼굴형 5종 0254). service_role CRUD GRANT(0252). RLS on + anon/authenticated SELECT(GRANT 0249). 정리본 시드(울트라셀=리프팅 정정). **분류·슬러그 SSOT** — `categoryFor`/`slugFor` 가 빌드타임 스냅샷(`src/data/tag-dictionary.generated.json`, 생성기 `scripts/gen-tag-dictionary.mjs`·prebuild)을 통해 읽음. ※`procedure_taxonomy`(0199, lifting/injectables 45)와 별개의 전(全)분류 사전.
- `term_glossary` (0248 — 미용피부과학용어집 영한 참조원, 2519행): `en`/`ko`/`meaning_no`/`recommended`(권장★)/`note`. RLS on + anon/authenticated SELECT(GRANT 0249).
- `tag_review_queue` (0250 — 미지 태그 검수큐): `ko`(UNIQUE)/`suggested_en`/`source`/`created_at`. RLS on·anon REVOKE·`is_admin()` SELECT(admin 만). `register_unknown_tags(text[],text)` RPC + `cards` AFTER INSERT/UPDATE OF keywords 트리거가 미지 키워드를 ②tag_dictionary(미지정+용어집 en)/③검수큐로 자동 분기.
- `cards_keywords_bak_0246` (0단계 롤백 백업, 1,232행 — 1단계 안정 확인 전까지 유지·삭제 금지).

---

## 2. 핵심 RPC

| 이름 | 용도 |
|---|---|
| `search_cards_scored(p_q, p_doctor_slug, p_offset, p_limit, p_boost_doctor_slug)` | 메인 피드 |
| `get_hot_card_ids(p_limit)` | HOT 카드 id 셋 (v2 본문 = 시간 가중 + 임계 5, 0089/0104. 0177 에서 deleted_at IS NULL 가드 추가) |
| `get_recent_card_likers_batch(card_ids[])` | 카드별 최근 likers |
| `get_notifications_with_url(...)` | 알림 목록 |
| `get_my_stats()` | /settings 통계 |
| `award_daily_login()` | 일일 출석 |
| `toggle_card_like`, `toggle_card_save` | 좋아요/저장 토글 (active identity) |
| `toggle_comment_like` | 댓글 좋아요 (`p_identity_id`, 0101) |
| `toggle_card_pick` | is_pick 토글 (admin OR self-doctor, 0151) |
| `soft_delete_card(p_card_id)` | SECURITY DEFINER RLS 우회 삭제 (0156) |
| `get_active_doctor_id(p_profile_id)` | active 신분 단위 doctor 매핑 lookup (0158). 위조 차단: profile_id 가 호출자 묶음에 속하지 않으면 null. ADR 0001 active 권한 원칙 |
| `get_card_activity_users(card_id, kind, p_days)` | admin 카드 활동 사용자 |
| `get_top_cards_by_views/likes/saves/shares/comments` | admin KPI TOP |
| `get_top_visitors_inner(p_days)` | 방문자 TOP |
| `get_admin_kpi_inner(p_days)` | KPI 통합 (방문자+조회+신규회원+신규카드) |
| `get_users_kpi_inner(p_days)` | 회원 관리 KPI |
| `get_top_new_members(p_days)`, `get_top_new_cards(p_days)` | 신규 TOP |
| `get_top_search_queries(p_days)`, `get_top_tags(p_days)` | 검색·태그 TOP |
| `feed_cards_scored`, `tag_cards_scored` | 피드·태그 |
| `propagate_onboarding_to_doctor_bundle` | 의사 멀티 계정 묶음 onboarding propagation (0106) |
| `find_duplicate_profiles(p_email, p_birthdate, p_gender)` | 중복 가입자 식별 (0111). ADR 0003 |
| `rotate_push_webhook_secret()` | secret 로테이션 (0120) |
| `get_research_panel()` | 대시보드 리서치 패널 — 사람(번들) 기준 총가입자·활성 90일·후기 작성 회원 (0224, F-2B). SECURITY DEFINER 집계만 |
| `procedure_family(ko)` | 시술 롤업 family = [ko]+직속 자식 (0225, D). getProcedureReport·demographics·pool 3경로 공용 SSOT. 0206 피드/검색 JOIN 은 개별 유지 |

**폐기**: `increment_card_share` (0095), `decrement_card_like`, `increment_card_like`, `get_recent_card_likers` singular (0102)

---

## 3. RLS 정책 (핵심)

### 3.1. profiles
- `profiles_public_select` (qual=true) — anon 안전 컬럼만 SELECT
- `profiles_self_select`
- anon PII lockdown (0122/0123): `birthdate`/`gender`/`face_shape`/`skin_type`/`skin_concerns`/`interested_procedures`/`contact_email` anon 차단 (7개. `liked_procedures` 는 0184 drop)
- `public_profiles_view` (안전 컬럼 19개만 노출)
- `chk_min_age` CHECK constraint (14세 미만 차단, 0121)

### 3.2. cards (계정 단위 — ADR 0011)
- `cards_public_read` (0161 재작성): `is_admin() OR (deleted_at IS NULL AND (status='published' OR doctor_id=current_doctor_id() OR author_id = COALESCE(current_active_profile_id(), auth.uid())))`
- `cards_admin_all` / `cards_doctor_update`/`_delete` (doctor_id = current_doctor_id())
- `cards_owner_update`/`_delete` (0155 신설 → **0160 계정 단위 재작성**): 모든 type 커버, `author_id = COALESCE(current_active_profile_id(), auth.uid())`
- `cards_user_own_post`/`_delete` (0160 재작성): type='post' AND `author_id = COALESCE(current_active_profile_id(), auth.uid())`
- `cards_user_post_insert` (0160 재작성): 3중 OR 분기 모두 계정 단위
- `is_admin()` / `current_doctor_id()` 계정 단위 인식 (0159 — ADR 0011)
- 폐기: `cards_open_all_to_auth` (0160 DROP — USING=true/CHECK=true PERMISSIVE 라 owner/doctor 정책 무력화하던 보안 구멍)

### 3.3. comments / card_likes / card_saves / comment_likes (0161 계정 단위 재작성)
- `comments_insert/update_self/delete_self`: `author_id = COALESCE(current_active_profile_id(), auth.uid())`
- `comments_select`: visible OR is_admin OR active 작성자 OR active 가 카드 owner(doctor·author)
- `card_likes_insert/delete`: `profile_id = COALESCE(current_active_profile_id(), auth.uid())` (0187 RENAME 반영). select 는 true (public, 카운트 노출)
- `card_saves_insert/delete/select`: 동일 (select 는 본인 active 만 또는 admin)
- `comment_likes_insert/delete/select`: 동일

### 3.4. notifications / notification_preferences / push_subscriptions (0161 계정 단위 재작성)
- 중복 정책 (옛 `_self_*` + 새 `_own`) 통합 → 단일 정책
- `recipient_id` / `profile_id = COALESCE(current_active_profile_id(), auth.uid())`

### 3.4. avatars 버킷
- `avatars_public_read` + `avatars_user_insert/update/delete` (본인 폴더만)

### 3.5. 신고·감사 로그
- `content_reports`: INSERT anon, SELECT/UPDATE admin (0137)
- `audit_logs`: SELECT admin, INSERT service_role (0140)

---

## 4. Storage

- 버킷: `avatars` (public, 512KB 상한, jpeg/png/webp 만)
- 버킷: `articles` (IaC 명문화, 0136)
- 경로: `{user_id}/{timestamp}.jpg`
- 업로드: magic byte 검증 + sharp EXIF 제거 + UUID 파일명 + 8MB 한도

---

## 5. 마이그레이션 히스토리

핵심 이정표 (0001 ~ 0162, ~165개):

| Migration | 내용 |
|---|---|
| 0041~0050 | profile_identities 시스템 도입·revert (Phase 9 준비) |
| 0060~0061 | qa_author_id Phase 9 fix + metrics 재정의 |
| 0062~0063 | notifications + preferences |
| **0065** | **qas → cards 전면 리네임 (ADR 0004)** |
| 0066~0078 | cards 전환 마무리 (save_count 트리거, RPC 리네임 등) |
| 0079~0086 | notifications url / ask owner persistent / push_subscriptions / push webhook |
| 0087~0089 | card_activity_users / likers batch / hot_card_ids_v2 |
| **0090** | **Persona 시스템 폐기 — alt_*/posted_as/persona drop, scored RPC 재정의** |
| 0091 | persona 잔재 완전 제거 + card_ratings.persona drop |
| 0092~0093 | get_top_tags cards 사용 / suggest_handle alt_handle 제거 |
| **0094** | **별점 시스템 완전 폐기 — card_ratings 테이블 + rating_avg/count drop** |
| **0095** | **공유 추적 정상화 — card_shares INSERT 트리거, increment_card_share drop** |
| 0096 | profiles.avatar_bg_color drop (죽은 기능) |
| **0097** | **youtube_oauth_tokens 테이블 — refresh_token DB 이전** |
| 0098, 0102 | find_duplicate_profiles RPC + enumeration 차단 (※ 0110 으로 폐기) |
| 0099 | RLS Phase 9 rewrite + 정책명 qa_* → cards_* |
| 0100, 0101 | card_likes/saves/comment_likes profiles FK 복구 + p_identity_id |
| **0103** | **push_webhook_secret Vault 이전 — rotation 지원** |
| 0104 | cards.published 컬럼 drop (status 단일 SSOT) |
| 0105 | api_rate_limits + push_webhook_errors |
| 0106, 0106b | propagate_onboarding_to_doctor_bundle + 백필 |
| 0107a~c | sentinel 도입 (※ 0109 으로 폐기) |
| 0108 | cards.category CHECK 에 doodle 추가 + comments service_role GRANT |
| **0109** | **soft-delete 익명화 (ADR 0002) — sentinel 폐기, in-place 마스킹** |
| 0110 | legal_name + dedup index drop (이메일 dedup 전환) |
| **0111** | **contact_email + find_duplicate_profiles 신규 (ADR 0003)** |
| **0119** | **admin KPI 9개 함수 is_admin() 가드** |
| 0120 | push_webhook_secret rotate RPC |
| 0121 | profiles.birthdate 14세 미만 CHECK |
| 0122, 0123 | profiles anon PII lockdown + table-level REVOKE |
| 0124, 0125 | toggle_card_pick + admin stats RPC 가드 추가 |
| 0128, 0129 | auth_user_id self-ref 백필 + handle_new_user 트리거 |
| 0130 | doctor_accounts 매핑 정정 (9개) |
| 0131 | 김종식 doctor 수염 제모 카드 복구 |
| **0132** | **cards.deleted_at + 부분 인덱스 + RLS 강제** |
| 0133 | auth.users 조회 RPC 격리 (naver OAuth) |
| 0134 | find_duplicate_profiles enumeration 보강 |
| 0135 | 회원가입 에러 로그 |
| 0136 | articles 버킷 IaC |
| **0137** | **content_reports 신고 큐** |
| 0138 | profiles.skin_info_consent_at |
| 0139 | cards.screening_flags + pending_review 부분 인덱스 |
| **0140** | **audit_logs 1년 보관 (ADR 0007)** |
| 0141 | content_reports/audit_logs service_role GRANT hotfix |
| **0142** | **metrics 통합 정비 — visitor/view 정의 통일** |
| **0143** | **admin KPI RPC 5개 전수 통일** |
| **0144** | **visitor 1일 1방문 KST dedup (ADR 0010)** |
| 0145, 0146 | get_top_visitors last_visit_at + get_top_new_members/cards |
| 0151 | toggle_card_pick = admin OR self-doctor |
| **0152** | **cards qa_status enum 'hidden' 추가** |
| 0153 | is_admin() 묶음 인식 확장 (→ 0159 에서 계정 단위로 정합, 본 옛 패턴 폐기) |
| 0154 | feed_cards_scored 반환에 status 컬럼 |
| **0155** | **cards_owner_update/delete — 모든 type 커버** |
| 0156 | soft_delete_card RPC (SECURITY DEFINER RLS 우회) |
| **0157** | **site_visits 테이블 (방문자 추적 확장)** |
| **0158** | **get_active_doctor_id RPC — active 신분 단위 doctor 매핑 lookup (정한미 원장 회귀 fix)** |
| **0159** | **current_active_profile_id GUC 헬퍼 + is_admin/current_doctor_id active 인식 본문 교체 (ADR 0011)** |
| **0160** | **cards RLS active 단위 재작성 + cards_open_all_to_auth 보안 구멍 DROP (ADR 0011)** |
| **0161** | **Phase 2-A: cards_public_read SELECT + card_likes/saves/comments/comment_likes + notifications 중복 정리 + notification_preferences + push_subscriptions 모두 계정 단위 (ADR 0011)** |
| **0162** | **Phase 2-B: toggle_card_hide RPC 신설 + soft_delete_card/get_my_stats/get_my_notifications/mark_my_notifications_read/toggle_card_like/save/comment_like/pick + _check_doctor_kpi_access/get_doctor_kpi/anonymize_user_content_before_delete 모두 계정 단위 (ADR 0011)** |
| **0168** | **notifications RPC active 단위 정합 — validate_active_profile_id 헬퍼 + 5개 RPC 에 p_active_profile_id 파라미터 (Critical-2 DB 측)** |
| **0169** | **pubmed_refs jsonb 정규화 — year string→int (858 ref), doi_url ""→null (64 ref). SSOT 정합 (Critical-4)** |
| **0170** | **feed_cards_scored / tag_cards_scored 의 RETURNS TABLE 에 pubmed_refs jsonb[] 추가 — 피드/태그 리스트에서 참고문헌 재노출 회귀 fix** |
| **0171** | **cards.question → title, cards.answer → body 리네임 + 인덱스 2개 RENAME + 카드 참조 RPC 10개 재정의 (feed/search/tag_cards_scored, get_notifications, get_top_cards_by_{comments\|likes\|saves\|shares\|views}_inner, get_top_new_cards_inner). P2-4 SSOT** |
| **0172** | **feed/search/tag_cards_scored 에 `AND c.deleted_at IS NULL` 명시 + get_top_visitors_inner 비로그인 행 display_name → NULL (옛 한글 라벨 인코딩 사고 차단, UI 가 라벨링)** (주의: `soft_delete_card` 는 `deleted_at` 만 set, status='hidden' 으로 바꾸지 않음 — 일부 옛 주석의 'status=hidden 동반' 표현은 부정확. 공개 차단은 본 0172 의 `deleted_at IS NULL` 필터가 담당.) |
| **0173** | **`COMMENT ON TABLE cards` + `NOTIFY pgrst 'reload schema'` + `'reload config'` 양방향 강제 — 0171/0172 직후 PostgREST schema cache stale 회귀 차단. 실질 DDL 변경 없음 (deep scan 결과 question/answer 잔재 0건 확인 후 캐시 reload 한정)** |
| **0174** | **`get_top_cards_by_{comments\|likes\|saves\|shares\|views}` + `get_top_new_cards` wrapper 6개의 `RETURNS TABLE` 시그니처 `question text → title text` 교체. 0171 이 `*_inner` 만 재정의하고 wrapper 누락 → PostgREST 가 옛 컬럼명으로 직렬화 → UI "(제목 없음)" 회귀의 정확한 fix** |
| **0175** | **통계 TOP RPC 7개 (`*_inner` + 7개 wrapper = 14 함수) 의 `WHERE c.deleted_at IS NULL` 제거 + `RETURNS TABLE` 에 `deleted_at timestamptz` 컬럼 추가. KPI ↔ TOP 정의 정합 (옵션 A: 사용자 결정). UI 는 deleted_at 으로 '삭제됨' 배지 표시** |
| **0176** | **doctor_accounts 안전 폐기 Phase 1 (사용자 결정). 9개 RPC 재정의 (doctor_accounts → profiles.doctor_id SSOT). 테이블 → `doctor_accounts_deprecated` RENAME (데이터 보존) + 옛 이름은 profiles 기반 view 로 재생성 (외부 SELECT 호환성, INSERT/UPDATE 는 view 라 의도된 실패). 보너스: `get_recent_likers` 의 옛 `card_likes.persona` 잔재 NULL::text 로 정정** |

### 마이그 번호 예약 + 적용 상태 (ADR 0014 / 트랙 B — 2026-05-29 갱신)

| 번호 | 용도 | 상태 |
|---|---|---|
| 0185 | CRITICAL-2 — `content_reports.status` CHECK constraint 갱신 (`pending/resolved_hidden/resolved_deleted/dismissed`) | **적용 완료 (2026-05-29)** |
| 0186 | Phase 2 — 인터랙션·통계 6 테이블 컬럼 `user_id` → `profile_id` RENAME + FK/index/RLS 갱신 (daily_logins, site_visits, activity_points, card_shares, card_views, card_impressions) | **적용 완료 (2026-05-29, `f8d1c93`)** |
| 0187 | Phase 3 — 좋아요·저장 3 테이블 RENAME + 트리거·RPC 재정의 (card_likes, card_saves, comment_likes) | **적용 완료 (2026-05-29, `91477c2`)** |
| 0188 | Phase 4 — 보류 (cards/comments `author_id` 유지 결정, ADR 0014 §6) | 보류 |
| 0189 | dead 컬럼 `profiles.age_confirmed_at` DROP (트랙 B-5) | **적용 완료 (2026-05-29, `d2bfddd`)** |
| 0190 | `doctors.profile_data` UPDATE GRANT to service_role (d4ceff8 후속) | **적용 완료 (2026-05-29)** |
| 0191 | `doctors` SELECT GRANT to service_role (UPDATE WHERE 절 SELECT 권한 요구 충족) | **적용 완료 (2026-05-29)** |
| 0192 | `admin_create_doctor_profile(uuid,text,text,text,text,text)` RPC 신설 — 원장 명함 신설·연결 (단일 트랜잭션: doctors INSERT + profiles INSERT + 회원 PII 복사). service_role 전용 GRANT. CRITICAL-3 제거 자리 대체 (ADR 0016) | **적용 완료 (2026-05-30)** |
| 0193 | `cards_doctor_year_slug_uidx` 부분 UNIQUE 인덱스 — `(doctor_id, post_year, post_slug) WHERE doctor_id IS NOT NULL AND post_slug IS NOT NULL`. slug 동시저장 충돌 최후 방어선 (23505). 회원글/빈 slug 제외 | **적용 완료 (2026-05-30, 중복 0 확인 후)** |
| 0194 | `feed_cards_scored` + `search_cards_scored` 점수 공식 교체 — 참여 가중치(저장·공유·댓글 ×2, 좋아요 ×1, 조회 ×0.1) + New 부스트(`1.5·0.5^(글나이[h])`, 반감기 1h). 공유=기존 `share_count`, 댓글=`comments(status='visible')` 즉시 count(컬럼/트리거 추가 없음). 함수 본문만 교체 | **적용 완료 (2026-05-31)** |
| 0195 | `notifications_push_webhook()` 함수 `v_url` 도메인 이전 (`pbtt.kr` → `pibutenten.kr`). net.http_post 는 POST 라 301 미추종 → 새 도메인 직접 호출. 함수 본문은 0105 그대로, URL 한 줄만 교체 (도메인 이전 A-2) | **적용 완료 (2026-05-31)** |
| 0196 | `cards.reviewed_at timestamptz` 신설 + 백필. 의료 검토일 SSOT (Q&A=검수 확정 시각, post=NULL). 백필(Q&A published): 3월까지=영상 게시일(KST 자정), 4월이후=검수일(updated_at)/발행일(bold덮임 15건 보정). 표시·정렬 = `COALESCE(reviewed_at, created_at)`. 트리거 안전 위해 단일 UPDATE+CASE. P1-b | **적용 완료 (2026-06-01)** |
| 0197 | `feed_cards_scored`/`search_cards_scored`/`tag_cards_scored` 정렬 기준 `created_at` → `COALESCE(reviewed_at, created_at)` (시간감쇠·New부스트). RETURNS TABLE+반환에 `reviewed_at` 추가. 반환타입 변경이라 DROP+CREATE (proacl=null 기본 PUBLIC, 재GRANT 불필요). P1-c | **적용 완료 (2026-06-01)** |
| 0198 | 카테고리 정리: `cards.category` CHECK 를 `qa`/`doodle` 2종으로 축소. diary/ask/tip/doodle→doodle 통합, link→soft-delete(+category=doodle). 백업 `_bak_category_260601`. P2 | **적용 완료 (2026-06-01)** |
| 0199 | `procedure_taxonomy` 신설(시술 분류 체계, P3-a). 2계층(정식 시술 31 + 하위 14). `ko`(unique)/`en`(slug)/`category`(lifting·injectables)/`parent_ko`(self-FK)/`sort_order`/`active`. RLS: SELECT anon·authenticated(true), 쓰기 service_role 한정. seed SSOT=선별표 §1·§2(하위 전부 이중집계). 신규 테이블(additive). | **적용 완료 (2026-06-01)** |
| 0200 | `qa_type` enum 에 `review`/`review_summary` 추가 + `procedure_reviews` 신설(P3-b). 개별 후기 정량 SSOT, `cards` 와 1:1(`card_id` unique FK). 필수 satisfaction·effect·pain(1~5)·recovery_days(0~365)·would_recommend, 선택 area·cost_satisfaction·effect_areas[]. `procedure_ko`→taxonomy, `author_id`→profiles. updated_at 트리거. RLS: 공개카드 연결 후기 읽기 공개 + 본인 후기 열람, 쓰기 service_role. (category CHECK 확장은 P3-c 에서 post-category.ts 와 동반.) | **적용 완료 (2026-06-01)** |
| 0201 | 후기 쓰기 경로(P3-c). `cards.category` CHECK 에 `review`/`review_summary` 추가(post-category.ts 동반). `create_procedure_review(...)` RPC — SECURITY DEFINER, `auth.uid()` 가 `p_author_id` 소유자인지 검증 후 카드(type=review,category=review) + procedure_reviews 행을 **한 트랜잭션**에 생성. GRANT authenticated. body NOT NULL 이라 본문 미입력 시 ''. | **적용 완료 (2026-06-01)** |
| 0202 | 후기 항목 재정의(P3-d 보정, 원장님 피드백). `procedure_reviews` 에서 `effect`·`would_recommend` 컬럼 **제거**(빈 테이블). 점수는 satisfaction·pain·recovery_days 만. 효과 체감 분야는 `effect_areas`(온보딩 피부고민 10종, 노안→동안·민감성→피부장벽). `area`·`cost_satisfaction` 컬럼 보존(폼 미노출). RPC `create_procedure_review` 시그니처 재정의(effect/would_recommend 인자 제거). | **적용 완료 (2026-06-01)** |
| 0203 | 후기 항목 전면 개편(P3 명세 확정). `procedure_reviews`: `recovery_days` 제거, `downtime`/`sessions`/`timing`/`revisit`(NOT NULL, CHECK 구간) + `concurrent_procedures`/`adverse_reactions`(text[]) + `oneliner_type` 추가. **UNIQUE(author_id, procedure_ko)** 중복 발행 금지(RPC 가 `duplicate_review` 23505 raise). RPC 시그니처에 신규 척도·선택 항목 반영. (한줄후기=cards.body, 검수는 라우트에서 병원·의사명 자동 블라인드.) | **적용 완료 (2026-06-01)** |
| 0204 | **결함 수정**: `procedure_taxonomy`·`procedure_reviews` 에 `GRANT SELECT TO anon, authenticated` 누락(0199/0200 이 RLS 정책만 만들고 테이블 GRANT 빠뜨림) → 로그인 세션이 시술 목록을 못 읽어 `/review/new` 가 "선택할 수 있는 시술이 없습니다". GRANT 부여로 해소. 행 접근은 기존 RLS 가 계속 통제. **교훈**: 새 테이블 검증은 `SET ROLE authenticated` 로 — Management API(postgres)는 권한·RLS 우회라 결함 은폐. | **적용 완료 (2026-06-01)** |
| 0205 | 후기 항목 대폭 단순화(원장님 피드백). `procedure_reviews` 에서 `downtime`/`sessions`/`timing`/`concurrent_procedures`/`adverse_reactions` 제거. 남는 정량: `satisfaction`·`pain`·`revisit` + `effect_areas`(체감 효과). 한줄후기=cards.body(필수). RPC 시그니처 축소(p_downtime 등 제거). 폼은 시술·만족도·통증·재시술의향·체감효과·한줄후기 6개 전부 필수. | **적용 완료 (2026-06-01)** |
| 0206 | 정렬 RPC `feed_cards_scored`·`search_cards_scored` 에 `procedure_review jsonb`(satisfaction·pain·revisit·effect_areas·procedure_ko) 추가 — LEFT JOIN `procedure_reviews`(card_id 1:1). 피드/검색에서도 후기 요약 노출. 점수공식·정렬 무변경. `tag_cards_scored`(qa/tip 만)는 대상 외. anon/authenticated 조회 검증 완료. | **적용 완료 (2026-06-02)** |
| 0207 | 피부 고민 11종 개편에 따른 `profiles.skin_concerns` 정리 — 신규 set(sagging/elasticity/volume/texture/wrinkle/tone/pores/contour/inner_dry/trouble/redness) 외 키 제거(순서 보존). 폐지 aging(4)·sensitive(6) 정리, 나머지 유지. | **적용 완료 (2026-06-02)** |
| 0208 | 효과 11종 개편에 따른 기존 후기 `procedure_reviews.effect_areas` 정리 — 신규 11종(리프팅·…·홍조) 외 값 제거(순서 보존). 폐지 "동안"·"피부장벽" 제거(써마지 후기에서 "동안" 삭제). | **적용 완료 (2026-06-02)** |
| 0209 | 시술후기 수정 RPC `update_procedure_review(p_shortcode,…)` 신설 — cards(title/body/keywords/status)+procedure_reviews(satisfaction/pain/revisit/effect_areas) 원자적 갱신. 권한: 작성자 묶음 또는 admin(SECURITY DEFINER). 시술명·author 잠금. GRANT EXECUTE authenticated. | **적용 완료 (2026-06-02)** |
| 0210 | 시술 분류 `procedure_taxonomy` 에 '더엘주사'(injectables, 정식) 추가 — 후기 작성 대상 포함. | **적용 완료 (2026-06-02)** |
| 0211 | `update_procedure_review` 모호 컬럼 참조(42702) 수정 — RETURNS TABLE 의 OUT 컬럼 `card_id` 와 `procedure_reviews.card_id` 충돌로 후기 수정이 save_failed(500) 되던 버그. WHERE 절 컬럼을 테이블명으로 한정. 작성자/admin 시뮬레이션 성공 검증. | **적용 완료 (2026-06-02)** |
| 0212 | 시술 리포트용 작성자 인구통계 집계 RPC `get_procedure_review_demographics(p_procedure_ko)` — 발행 후기 작성자의 성별·연령대 **집계 카운트만** 반환(개별 PII 비노출). SECURITY DEFINER, GRANT anon/authenticated. anon 호출 검증. | **적용 완료 (2026-06-02)** |
| 0213 | 후기 폼 확장(2a) — `procedure_reviews` 에 `downtime`·`effect_onset` text 컬럼 추가(nullable, 기존 69건 NULL) + CHECK(NULL 허용, 5슬러그씩: downtime same_day/days_1_2/days_3_5/week_1/weeks_2_plus, effect_onset immediate/weeks_1_2/month_1/months_2_3/still_watching). `create_procedure_review`·`update_procedure_review` DROP+재생성(시그니처 끝에 `p_downtime`/`p_effect_onset` DEFAULT NULL, 기존 본문 불변). GRANT 재발급(create=authenticated, update=PUBLIC+authenticated, 원본 동일). SECURITY DEFINER. 적용 후 컬럼·CHECK·RPC 시그니처·ACL 검증 통과. | **적용 완료 (2026-06-03)** |
| 0214 | 시술 리포트 앵커 카드 데이터층(C1). 발행 후기 ≥1 시술마다 `cards`(type=`review_summary`, category=`review_summary`, author=pibutenten, status=`draft`, post_slug=en, keywords=[ko,en], body='') 앵커 1행 **백필 25개**(전부 draft·공개 노출 0). 멱등=부분 유니크 `cards_review_summary_slug_uidx ON cards(post_slug) WHERE type='review_summary'`. `create_procedure_review`·`update_procedure_review` 를 0213 본문 VERBATIM + 발행 시 앵커 lazy 생성(ON CONFLICT DO NOTHING)만 추가해 `CREATE OR REPLACE`(시그니처·ACL 불변). 수치는 행에 저장 안 함(실시간 집계 유지). 적용 후 검증: 앵커 25/draft 25/중복 0/post_slug↔en 25, RPC 앵커블록·ACL 확인, 라이브 create RPC 스모크(롤백) 정상. | **적용 완료 (2026-06-03)** |
| 0215 | 시술 리포트 앵커 피드 노출(C3). `feed_cards_scored` 점수식의 '의사글 ×2' CASE 에 `OR c.type='review_summary'` 추가 → 앵커도 의사 Q&A 와 동등 ×2 가중. 0214 직전 정의 VERBATIM + 해당 CASE 한 줄만 수정, WHERE(`status='published'`)·정렬·임베드 불변. `CREATE OR REPLACE`(시그니처·ACL 불변, 기본 PUBLIC EXECUTE). search/tag RPC 미변경. **★0217 로 폐기**(점수 주입 도배 → 결정적 주입으로 전환). | **적용 완료 (2026-06-03), 0217 로 대체** |
| 0216 | 시술 리포트 앵커 공개 플립(go-live). `UPDATE cards SET status='published' WHERE type='review_summary' AND status='draft'`(25행). 롤백=status='draft' 복귀. 인앱(피드·/reports·저장/공유) 노출 개시, 검색엔진 색인은 `INCLUDE_REPORT_ANCHORS=false` 게이트로 보류. | **적용 완료 (2026-06-03)** |
| 0217 | 피드 결정적 주입 전환 — `feed_cards_scored` WHERE 에 `c.type <> 'review_summary'` 추가(앵커 스코어 피드 제외) + ×2 CASE 를 0206 원형(doctor-only)으로 복원(0215 의 review_summary 분기 삭제). 0215 직전 정의 VERBATIM + 2곳만. 배경: 앵커 created_at 신선도+×2 점수 독식 → 홈 피드 도배. 앵커 노출은 클라이언트 Feed 가 유기 20장당 1장 결정적 주입(점수 무관). `CREATE OR REPLACE`. | **적용 완료 (2026-06-03)** |
| 0218 | 피드 주입용 경량 집계 RPC `get_review_summary_pool()` — published 앵커별 (card_id·en·ko·category·후기수·만족도 avg+분포·통증 avg·재시술 분포)를 단일 lateral 쿼리로 반환(홈 로드마다 시술별 getProcedureReport 25회 직격 방지). 효과·인구통계·다운타임/효과시기 미집계(컴팩트 카드 미사용, 더보기는 /reports/{en}). GRANT anon/authenticated. | **적용 완료 (2026-06-03)** |
| 0219 | 앵커 title 브랜드 통일 "피부텐텐 리포트 \| {ko}" — (1) 기존 25행 UPDATE (2) `create_procedure_review`·`update_procedure_review` 의 앵커 lazy INSERT title 템플릿 변경(라이브 VERBATIM + 제목 한 곳만, `CREATE OR REPLACE` 시그니처·ACL 보존). 카드 eyebrow("피부텐텐 리포트")는 컴포넌트 하드코딩이라 무관. 적용 후 25행 branded + create RPC 스모크(롤백) 정상. | **적용 완료 (2026-06-03)** |
| 0220 | `search_cards_scored` 에서 review_summary 제외(WHERE `c.type <> 'review_summary'`) — 홈 무한스크롤(/api/cards, q='')·/search 결과가 모두 이 RPC 를 거쳐 앵커가 일반 카드로 누출되던 문제 차단. 라이브 VERBATIM + 한 줄. `CREATE OR REPLACE`. feed/tag RPC 미변경. | **적용 완료 (2026-06-03)** |
| 0221 | (F-1) 회원 동의 구조 개편 — `profiles` 동의 컬럼 6종 신설: `privacy_agreed_at`, `news_email_consent`(+`_at`), `marketing_email_consent_at`, `terms_agreed_version`, `privacy_agreed_version`. `news_email_consent` 는 marketing 과 동일 3-state(DEFAULT 없음). 기존 데이터 변경 없음. | **적용 완료 (2026-06-04)** |
| 0222 | (F-1) `propagate_onboarding_to_doctor_bundle` 갱신 — 라이브 VERBATIM + 동의 컬럼만 추가(privacy_agreed_at·marketing_email_consent_at·news_email_consent(+_at)·terms/privacy_agreed_version). 기존 복사 항목 누락 0건. `CREATE OR REPLACE`. | **적용 완료 (2026-06-04)** |
| 0223 | (F-1) ⚠ **기존 데이터 변경** — terms 보유 활성 회원(47명) 백필: `privacy_agreed_at`=now(), terms/privacy_agreed_version=현 상수값. 0221 과 분리. 멱등(privacy 이미 있으면 제외). 적용 후 47/47 채움·잔여 0 확인. | **적용 완료 (2026-06-04)** |
| 0224 | (F-2B) `get_research_panel()` read-only 집계 RPC — 사람(번들=COALESCE(auth_user_id,id)) 기준 총가입자(탈퇴 제외)·활성 90일(site_visits)·후기 작성 회원. SECURITY DEFINER + GRANT authenticated, 집계만 반환(get_admin_kpi 패턴). | **적용 완료 (2026-06-04)** |
| 0225 | (D) `procedure_family(ko) returns text[]` 신설 — [ko]+직속 자식(parent_ko=ko, active). 롤업 SSOT. GRANT anon/authenticated. | **적용 완료 (2026-06-04)** |
| 0226 | (D) 보톡스 하위 3태그 INSERT — 사각턱보톡스=jaw-botox·주름보톡스=wrinkle-botox·스킨보톡스=skin-botox (injectables, parent_ko=보톡스, active). 6 브랜드 자식 불변. | **적용 완료 (2026-06-04)** |
| 0227 | (D) `get_procedure_review_demographics` family 롤업 — 라이브 VERBATIM + `procedure_ko = ANY(procedure_family(...))`. | **적용 완료 (2026-06-04)** |
| 0228 | (D) `get_review_summary_pool` family 롤업 — 라이브 VERBATIM + LATERAL `procedure_ko = ANY(procedure_family(t.ko))`. FEED_MIN_REVIEWS=4=family count. | **적용 완료 (2026-06-04)** |
| 0229 | (D) `create/update_procedure_review` 부모 앵커 lazy — 라이브 VERBATIM + 앵커 INSERT 대상 ko 를 자기+부모로 확장(자식 후기 발행 시 부모 앵커도 보장, draft, 멱등). | **적용 완료 (2026-06-04)** |
| 0230 | (D) ⚠ **데이터+공개 변경** — family≥1·자기앵커 없는 부모 앵커 백필(레스틸렌·쥬베룩, status=published). 멱등. | **적용 완료 (2026-06-04)** |
| 0231 | (D) ⚠ **데이터 변경** — qa 카드 post_slug `square-jaw-botox`→`jaw-botox` 치환(3건, 정식 오픈 전 URL 변경). | **적용 완료 (2026-06-04)** |
| 0232 | (D 후속) `create/update_procedure_review` lazy 앵커 status `draft`→`published` — 자동 승격 흐름 부재(0216 일회성 flip뿐) 보완. 향후 자식 후기로 생기는 부모 앵커도 즉시 노출. sitemap/rss 는 `INCLUDE_REPORT_ANCHORS=false` 게이트 분리. 0229 VERBATIM + status 리터럴만 변경. | **적용 완료 (2026-06-04)** |
| 0233 | `find_other_auth_user_by_email(email, exclude_user_id)` — OAuth callback(b)용. 동일 이메일 '다른' 기존 계정 + provider 목록 반환(현재 user 제외, created_at ASC LIMIT 1). read-only SECURITY DEFINER, service_role/admin 전용. | **적용 완료 (2026-06-04)** |
| 0234 | `get_users_auth_info(uuid[])` — 관리자 회원관리(C)용. profile_id별 auth 로그인 이메일 + provider[] 반환(번들은 auth_user_id 매핑). read-only SECURITY DEFINER, `is_admin()`/service_role 가드. PostgREST 가 auth 스키마 직접 조회 불가하므로 RPC 경유. | **적용 완료 (2026-06-04)** |
| 0235 | `get_indexable_tags(int)` qa-only 정리 — `category IN ('qa','tip')` → `= 'qa'`(tip 폐지 카테고리 0행, 무변화) + 멱등 base CREATE(기존 0092 조건부 정의만 존재하던 것 보완). SECURITY DEFINER STABLE, anon/authenticated GRANT. 반환 태그 집합 변경 전후 동일(397/min4) 검증. | **적용 완료 (2026-06-05)** |
| 0236 | `get_research_panel()` 명함(profiles.id) 단위 정렬 — 0224 의 `COALESCE(auth_user_id,id)` 번들 롤업 제거, profiles.id distinct 카운트로 교체(ADR 0012). 시그니처·SECURITY DEFINER·ACL(0224 그대로 CREATE OR REPLACE 보존) 동일. before(번들) 55/23/35 → after(명함) 65/30/37. 0224 파일 미수정. | **적용 완료 (2026-06-05)** |
| 0237 | `content_reports.temp_block_until` DROP COLUMN — 0137 도입 후 코드·RPC·뷰 참조 0건(배치 ④ 영구 숨김 채택으로 임시조치 폐기). 죽은 컬럼 제거. | **적용 완료 (2026-06-05)** |
| 0238 | `get_review_report_overview()` 운영자 '시술 리포트' 대시보드 전용 집계 RPC(읽기 전용, 4-1). get_review_summary_pool 집계 로직 재사용 + `view_count` 추가. 시술별 후기수·재시술의향·만족도·통증·조회/저장/공유 반환, procedure_taxonomy.category·sort_order 동적 정렬. **admin 전용**: SECURITY DEFINER + `is_admin(auth.uid())` 가드, GRANT authenticated(비-admin 본문 차단). 데이터 변경 없음(SELECT). SET ROLE anon=permission denied / authenticated(비-admin)=forbidden 검증. | **적용 완료 (2026-06-05)** |
| 0239 | 관리자 신고 알림 신설(4-2 STEP D). `notifications_kind_check` 6종→**7종**(`report` 추가, 기존 이력 위반 0). `content_reports` AFTER INSERT 트리거 `trg_content_report_notification` + `on_content_report_for_notification()`(SECURITY DEFINER) — `role='admin'` profile 들에 fan-out, 신고자=admin 시 본인 제외, 알림 실패가 신고 INSERT 롤백 안 하도록 EXCEPTION 격리. `report` 전용 pref 컬럼 미신설(상시 수신). RLS=기존 `recipient_id` 정책 그대로(명함 단위). 검증: 팬아웃 2명·본인제외·admin 본인 SELECT 1·비-admin SELECT 0(전부 tx ROLLBACK). | **적용 완료 (2026-06-06)** |
| 0240 | 푸시 발송 실패 영속 로깅(4-2 STEP F). `push_send_failures` 테이블 신설(`id`/`recipient_id`/`endpoint`/`status`/`error`/`created_at`). `/api/push/send` 가 410/404(만료, 기존 삭제) 외 rejected 발송 실패를 best-effort INSERT(순수 가산 — 발송·삭제 동작 미변경). RLS enabled + `push_send_failures_admin_select`(is_admin). 권한: **service_role 만** SELECT/INSERT GRANT(앱이 service_role 로 기록), anon/authenticated 미부여(privilege 레벨 차단). pg_net 비동기로 미포착되던 HTTP non-2xx 실패율 관측 가능화. 검증: service_role INSERT/SELECT 성공 · anon/authenticated SELECT/INSERT 차단(tx ROLLBACK). | **적용 완료 (2026-06-06)** |
| 0241 | ask/new_ask 死 잔재 완전 제거(4-2). 死 트리거 `trg_card_ask_notification`(+`on_card_ask_for_notification`)·`trg_ask_owner_self_reply`(+`on_ask_owner_self_reply`) DROP. `notifications` 의 `new_ask` 36행 DELETE(생산자 死). `is_notification_enabled` new_ask 분기 제거. `notification_preferences.pref_new_ask` DROP COLUMN. `notifications_kind_check` 7종→**6종**(new_ask 제외, report 보존). 동반: `get_my_notification_prefs`/`save_my_notification_prefs` RPC 도 new_ask 인자·컬럼 참조 제거(DROP+CREATE, authenticated GRANT 재부여). 옛 이력 마이그(0079/0080/0062/0063/0071) 미수정. | **적용 완료 (2026-06-06)** |
| 0242 | 저장 알림 신설(4-2). `card_saves` AFTER INSERT 트리거 `trg_card_saves_notification` + `on_card_save_for_notification()`(SECURITY DEFINER) — 작성자(cards.author_id)에게 알림, **이름 비노출**(actor_id=NULL)·누적 save_count 로 인원수 message, 좋아요(0083) 24h 묶음 패턴(UPDATE-or-INSERT), self-save skip, EXCEPTION 격리. 기존 `trg_card_saves_count`(save_count +1, AFTER) 보다 이름순 뒤라 갱신된 save_count 읽음. `notifications_kind_check` 6종→**7종**('save' 추가). `notification_preferences.pref_save` 컬럼(default true) + `is_notification_enabled` save 분기. `get_my_notification_prefs`/`save_my_notification_prefs` 5→6 컬럼/인자(p_save, DROP+CREATE+GRANT). 검증: 팬아웃 1행·actor NULL·24h 묶음 1행·self 0·작성자 SELECT 1·비작성자 0(전부 tx ROLLBACK). | **적용 완료 (2026-06-06)** |
| 0243 | 앱 알림함 목록 RPC `get_notifications` 에 `message` 컬럼 추가(4-2/3a). DROP+CREATE(RETURNS TABLE 변경) — 나머지 VERBATIM(정렬·`recipient_id` 스코핑 `validate_active_profile_id`+`a.id=n.recipient_id`·SECURITY DEFINER). message 모드 알림(저장·향후 관심 키워드)이 앱 목록에도 본문 표시. dropdown `get_my_notifications` 는 기존부터 message 반환(무변경). proacl=null(기본 PUBLIC EXECUTE) 보존. | **적용 완료 (2026-06-06)** |
| 0244 | 관심(Q&A) 알림 **토대**(4-2/3b-1, 순수 additive·생산자 없음=알림 0건). ①GIN 인덱스 2개 `profiles_interested_procedures_gin_idx`·`profiles_skin_concerns_gin_idx`(`cards_keywords_gin_idx` 기존). ②`notification_preferences` 신규 pref 3컬럼 `pref_keyword_interest`/`pref_keyword_concern`/`pref_keyword_skin_type`(boolean NOT NULL DEFAULT true, 기존 행 backfill). ③`notifications_kind_check` 7종→**8종**('keyword' 추가, 기존 7종 보존). ④`get_my_notification_prefs` 6→**9컬럼**·`save_my_notification_prefs` 6→**9인자**(p_keyword_interest/concern/skin_type, DROP+CREATE, `authenticated` GRANT 재부여, 나머지 본문 VERBATIM). ⑤`is_notification_enabled` 는 단일 bool 게이트가 dimension 3개에 맞지 않아 **keyword 분기 미추가**(ELSE true 유지) — 게이팅은 3b-2 digest 가 pref 3컬럼 직접 판독. 검증: GIN 2개·pref 3컬럼 default true·kind_check 8종·RPC 9/9·SET ROLE authenticated 본인 9컬럼 read/save·타인 prefs 0행·keyword 생산자 0·keyword 행 0. | **적용 완료 (2026-06-06)** |
| 0245 | 관심(Q&A) 알림 **생산자**(4-2/3b-2). ①커서 테이블 `keyword_digest_state(id boolean PK, last_run_at timestamptz NOT NULL DEFAULT **now()**)` 단일행 + RLS on·anon/authenticated REVOKE(service_role 전용). **last_run_at 초기값 now() = 폭탄 방지**(과거 qa 999개 무시). ②`run_keyword_digest()` SECURITY DEFINER(service_role/postgres만 EXECUTE, PUBLIC/anon/authenticated REVOKE): 커서 `FOR UPDATE` → 윈도우(`reviewed_at > cursor AND <= run_start`) 내 published qa 의 `unnest(keywords)` 태그를 회원 `interested_procedures`/`skin_concerns`/`skin_type` 와 매칭(`notification_preferences` LEFT JOIN + `COALESCE(pref_keyword_*,true)` 게이트), 자기 글 제외, (회원,태그) distinct 새 글 수 N → `notifications(kind='keyword', actor_id=NULL, message, url='/search?q='||url_encode_component(tag))` set-based INSERT → 커서=run_start UPDATE. 단일 tx → 정확히 1회. ③`url_encode_component(text)` IMMUTABLE(UTF8 percent-encode 헬퍼, 한글 태그용). cron `/api/cron/keyword-digest`(0245 동반, Bearer CRON_SECRET). 검증: 커서 now() 초기값·acl(service_role만)·RLS·dry-run(self 제외 0·토글 게이트 interest ON 72/OFF 0·중복 0)·0-effect 직접 호출(processed 0·created 0·커서 전진). | **적용 완료 (2026-06-06)** |

| 0246 | **0단계 글상자 태그 정정**(`cards.keywords`). 단일 tx·영향 29행 스코프(`WHERE keywords && ARRAY[source 30]`). ①병합 11(영문슬러그→한글, `array_replace`, 출발∩도착 10건 `array_agg(DISTINCT)` dedup) ②삭제 15(노이즈/1글자, `array_remove`) ③표기통일 4(울세라→울쎄라·민감피부→민감성피부·K-뷰티→K뷰티·마리오네트→마리오네트주름; 뒤 2건 카드 미존재=no-op). `cards_set_updated_at` 트리거 tx 내 DISABLE/ENABLE 로 **updated_at 보존**. 멱등(재실행 source 부재→0행). 영문변경1+영문채움69=70행은 슬러그 사전 사안 → 1단계. 검증: source 잔존 0·중복 0·변경 29·updated_at 전건(1,232) 일치·distinct 2003→1975·body/title/meta diff 0. 부수 1건(id=2296 draft doodle 유일태그 '테스트' 삭제→빈 배열, 정당). 백업 `cards_keywords_bak_0246`. | **적용 완료 (2026-06-06)** |

| 0247 | **`tag_dictionary` 신설**(6분류 태그 사전, additive). 컬럼 `id`(PK)·`ko`(UNIQUE NOT NULL)·`category`(CHECK 6종 피부고민/리프팅/스킨부스터/홈케어/피부상식/미지정)·`en`·`parent_ko`(plain text+idx, 자기FK 미사용)·`is_procedure`(DEF false)·`onboarding`·`created_at`·`updated_at`. 인덱스 category·parent_ko. RLS on + anon/authenticated SELECT(공개 사전·PII 없음, 쓰기 service_role). 정리본(`태그사전_정리본_20260606.xlsx`) **2117행 시드**(매핑: 카테고리→category·태그→ko·영문→en·부모연결→parent_ko·시술등록 '시술'→is_procedure·온보딩→onboarding·사용빈도 미적재). **★울트라셀=리프팅 정정**(정리본 스킨부스터, 디렉터 확정). 멱등 `ON CONFLICT(ko) DO NOTHING`. 분포 미지정1298·피부고민259·홈케어227·피부상식200·스킨부스터72·리프팅61, 영문888·is_procedure49·onboarding22. | **적용 완료 (2026-06-06)** |
| 0248 | **`term_glossary` 신설**(미용피부과학용어집 영한 참조원, additive). 컬럼 `id`(PK)·`en`·`ko`·`meaning_no`·`recommended`(권장★)·`note`(비고)·`created_at`. 인덱스 lower(en)·ko. RLS on + anon/authenticated SELECT. `용어집_행분리`(영어1:한글N) **2519행 시드**(원본 표제 1792, 권장★653·비고184·뜻번호81). 멱등(빈 테이블 `NOT EXISTS` 가드). | **적용 완료 (2026-06-06)** |
| 0249 | **GRANT 보강**(1단계 A). `tag_dictionary`/`term_glossary` `GRANT SELECT TO anon, authenticated`(0247/0248 이 RLS policy 만 만들고 테이블 GRANT 누락 → PostgREST anon REST 401). 공개 참조 데이터(PII 없음). 멱등. | **적용 완료 (2026-06-06)** |
| 0250 | **미지 태그 자동등록**(1단계 B, additive). `tag_review_queue(ko UNIQUE·suggested_en·source)` 신설(RLS on·anon REVOKE·`is_admin()` SELECT). `register_unknown_tags(text[],text)` RPC(SECURITY DEFINER·방어적 EXCEPTION→카드저장 무중단) + `cards` AFTER INSERT/UPDATE OF keywords 트리거. 분기 ①tag_dictionary 존재 무동작 ②미존재+term_glossary(en)→tag_dictionary(미지정) upsert ③둘 다 없음→tag_review_queue upsert. 멱등 ON CONFLICT. 6 저장경로가 cards.keywords 쓰기로 수렴 → 트리거 1점 커버. 검증: 격리 시뮬 ①울쎄라 불변·②제거레이저→미지정(en=ablative laser)·③미지→큐, 흔적 정리. | **적용 완료 (2026-06-06)** |
| 0251 | **태그 매니저 백엔드**(2단계). ①`tag_dictionary` admin 쓰기 RLS(`FOR ALL TO authenticated USING/WITH CHECK is_admin()` + INSERT/UPDATE/DELETE GRANT, 공개 SELECT 유지). ②집계 RPC `get_tag_admin_overview(p_days)`(is_admin 가드) — 태그별 사용량(시간창 published 전체 글)·검색량(search_logs)·생성일 대체(first_card_at=첫 등장 카드 MIN). ③`resolve_tag_review(...)` 검수큐 처리(upsert+큐삭제, is_admin). ④`get_top_tags_inner` 정비: doctor_id·'tip' 한정 제거 → published 전체 글 태그(+deleted_at IS NULL). 검증: RLS SET ROLE(비admin 차단·admin 허용·anon SELECT)·인라인 e2e·집계 정확. 백업 `tag_dictionary_bak_0251`. | **적용 완료 (2026-06-06)** |
| 0252 | **service_role CRUD GRANT 보강**(2단계 #0, 저장 버그 fix). `tag_dictionary`/`tag_review_queue`/`term_glossary`/`procedure_taxonomy` `GRANT SELECT,INSERT,UPDATE,DELETE TO service_role`. 0247/0248 이 authenticated CRUD·anon SELECT 만 부여, service_role 누락 → admin client(service_role, BYPASSRLS)의 UPDATE 가 42501 permission denied(RLS 통과해도 테이블 GRANT 별개). 멱등. 검증: REST PATCH 42501→200. | **적용 완료 (2026-06-06)** |
| 0253 | **`rename_tag(p_id,p_new_ko)` RPC**(2단계 #2, SECURITY DEFINER·EXECUTE service_role 만). 단일 tx: tag_dictionary.ko + 시술 태그면 procedure_taxonomy.ko 동시(procedure_reviews FK ON UPDATE CASCADE 자동) + cards.keywords array_replace·array_agg(DISTINCT) dedup. cards 트리거 3종(set_updated_at·register_unknown_tags·status_notification) tx 한정 disable. 검증: 비파괴('써마지' cards104·reviews13, RAISE EXCEPTION 롤백 → 무변경). | **적용 완료 (2026-06-06)** |
| 0254 | **온보딩 얼굴형 태그 5종**(2단계 #4). FACE_SHAPES(달걀형/땅콩형/장방형/각진형/둥근형) onboarding='얼굴형'·category='미지정' 적재(en=oval/**diamond**(D6 정정)/oblong/square/round). 백업 `tag_dictionary_bak_0254`(2117). 검증: 적재 5·기존 onboarding(피부고민11·관심시술7·피부타입4) 유지. | **적용 완료 (2026-06-06)** |
| 0255 | **`cards_register_tags_trg()` enum 버그 fix**(2단계 B). `COALESCE(NEW.type,'?')`(enum,text 공통타입 qa_type 추론 → '?' 캐스팅 실패) → `NEW.type::text` 명시 캐스팅(동작 불변). type NULL 카드 0건이나 keywords 수정 경로 잠재 버그. 검증: 카드 keywords UPDATE 트리거 통과(롤백). | **적용 완료 (2026-06-06)** |
| 0256 | **온보딩 피부타입 태그 7종 완성**(2단계 D7). 누락 3종(극건성=extreme-dry·중성=normal·극지성=extreme-oily) 적재. onboarding='피부타입'·category='미지정'. profiles.skin_type 실제값 7종 대응. 백업 `tag_dictionary_bak_0256`. | **적용 완료 (2026-06-06)** |

production 사실 (2026-05-29 `information_schema.columns` 직접 조회): Phase 2/3 대상 9 테이블 모두 `user_id` 부재 / `profile_id` 존재. 0189 대상 `profiles.age_confirmed_at` 부재. 0190/0191 적용 후 end-to-end 실증 (service_role UPDATE profile_data 통과 + NEGATIVE 차단) 통과.

백업 테이블 (운영 스냅샷, 마이그 폴더 외): `cards_keywords_bak_0246` — 0246 적용 직전 `cards` 전수 1,232행(`id`/`keywords`/`updated_at`/`deleted_at`/`backed_up_at`). 0단계 롤백용. **1단계 안정 확인 전까지 유지(삭제 금지)**.

---

## 6. 데이터 확인 패턴

```bash
curl -s -X POST "https://api.supabase.com/v1/projects/$SUPABASE_PROJECT_REF/database/query" \
  -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"query": "SELECT ... FROM cards WHERE ..."}'
```

---

**이 문서 변경 시**: 새 마이그레이션 추가는 `CHANGELOG.md` 의 `### Security` 또는 `### Changed` 에도 기록 (CLAUDE.md §5 동기화 규칙).
