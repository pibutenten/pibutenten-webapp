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
| `terms_agreed_at` | timestamptz | 약관 동의 시점 |
| `birthdate` | date | 온보딩 필수, 14세 미만 CHECK |
| `gender` | text CHECK | male/female/other |
| `face_shape` | text CHECK | oval/peanut/oblong/square/round |
| `skin_type` | text CHECK | 7종 |
| `skin_concerns` | text[] | 멀티 |
| `interested_procedures` | text[] | 멀티 (Phase 5.1 부터 한국어 키워드) |
| `liked_procedures` | text[] | |
| `field_visibility` | jsonb | 프로필 필드별 공개 여부 |
| `is_public` | bool | |
| `contact_email` | text | 중복 가입자 식별용 (OAuth provider email). ADR 0003 |
| `skin_info_consent_at` | timestamptz | 피부정보 활용 동의 시점 |
| `deleted_at` | timestamptz | 탈퇴 시각. NULL=활성. 설정 시 in-place 익명화. ADR 0002 |
| `created_at`, `updated_at` | timestamptz | |

**폐기된 컬럼** (DB 미존재):
- `alt_display_name`, `alt_avatar_url`, `alt_avatar_bg_color`, `alt_bio`, `alt_handle` — 0090 drop (persona 시스템 폐기)
- `legal_name` — 0110 drop (이메일 dedup 전환)
- `avatar_bg_color` — 0096 drop (죽은 기능)

### 1.2. `cards` (구 qas — Q&A · 포스팅 · 칼럼 통합)

| 컬럼 | 비고 |
|---|---|
| `id` | bigserial PK |
| `type` | enum: `qa` / `post` (`article` 폐기 — 0076) |
| `category` | text — `qa`/`tip`/`diary`/`ask`/`link`/`doodle` (Phase 5.1, doodle 추가 0108) |
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
| `deleted_at` | timestamptz — soft-delete (0132). ADR 0002 |
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
- 컬럼: `id, card_id, comment_id, reporter_profile_id, reporter_email, target_url, reason, detail, status, action_taken, resolution_note, resolved_at, resolved_by, temp_block_until, created_at`
- `status` (text, NOT NULL DEFAULT `'pending'`): `pending` / `resolved_hidden` / `resolved_deleted` / `dismissed` (CHECK 마이그 0185, 2026-05-29). 옛 enum (`investigating/resolved/rejected/temp_blocked`) 은 row 0 상태에서 정리됨 — 호환 불필요.
- `action_taken` (text): `hide` / `delete` / `dismiss`.
- `temp_block_until`: 0137 시 30일 임시조치 의도로 도입. 배치 ④에서 영구 숨김 채택 — 향후 미사용 컬럼.

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
| `card_activity_users` | 카드별 활동 사용자 집계 |

### 1.6. 알림 / 푸시
- `notifications`, `notification_preferences` (0062, 0063, 0079, 0080)
- `push_subscriptions` (0084)
- `push_webhook_secret` Vault 이전 (0103)
- `push_error_log`, `rate_limit_log` (0105)

### 1.7. 운영
- `doctors`, `doctor_accounts`, `videos`
- `youtube_oauth_tokens` (0097 — DB 이전)
- `content_reports` (0137 — 신고 큐)
- `audit_logs` (0140 — 민감 API 1년 보관)

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

**폐기**: `increment_card_share` (0095), `decrement_card_like`, `increment_card_like`, `get_recent_card_likers` singular (0102)

---

## 3. RLS 정책 (핵심)

### 3.1. profiles
- `profiles_public_select` (qual=true) — anon 안전 컬럼만 SELECT
- `profiles_self_select`
- anon PII lockdown (0122/0123): `birthdate`/`gender`/`face_shape`/`skin_type`/`skin_concerns`/`interested_procedures`/`liked_procedures`/`contact_email` anon 차단
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
- `card_likes_insert/delete`: `user_id = COALESCE(current_active_profile_id(), auth.uid())`. select 는 true (public, 카운트 노출)
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
| 0105 | rate_limit_log + push_error_log |
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
| **0172** | **feed/search/tag_cards_scored 에 `AND c.deleted_at IS NULL` 명시 + get_top_visitors_inner 비로그인 행 display_name → NULL (옛 한글 라벨 인코딩 사고 차단, UI 가 라벨링)** |
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

production 사실 (2026-05-29 `information_schema.columns` 직접 조회): Phase 2/3 대상 9 테이블 모두 `user_id` 부재 / `profile_id` 존재. 0189 대상 `profiles.age_confirmed_at` 부재. 0190/0191 적용 후 end-to-end 실증 (service_role UPDATE profile_data 통과 + NEGATIVE 차단) 통과.

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
