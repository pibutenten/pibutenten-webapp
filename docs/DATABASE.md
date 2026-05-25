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
| `role` | text | `admin` / `doctor` / `user` |
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
| `question`, `answer`, `meta` | text |
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

**폐기된 컬럼**:
- `published` — 0104 drop (status 단일 SSOT)
- `rating_avg`, `rating_count` — 0094 drop (별점 시스템 폐기)

### 1.3. `comments`
- `author_id`, `card_id`, `parent_id`, `body`, `status` (visible/hidden/deleted)
- `author_id` profiles FK (0085)
- 폐기: `posted_as` (0090)

### 1.4. 인터랙션 (로그인 필수)
| 테이블 | PK | 비고 |
|---|---|---|
| `card_likes` | (card_id, user_id) | user_id = active profile.id |
| `card_saves` | (card_id, user_id) | 동일 |
| `comment_likes` | — | profiles FK 복구 0100 |

폐기: `card_likes.persona` (0090), `card_ratings` 테이블 (0094)

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
| `get_hot_card_ids_v2()` | HOT 카드 id 셋 |
| `get_recent_card_likers_batch(card_ids[])` | 카드별 최근 likers |
| `get_notifications_with_url(...)` | 알림 목록 |
| `get_my_stats()` | /settings 통계 |
| `award_daily_login()` | 일일 출석 |
| `toggle_card_like`, `toggle_card_save` | 좋아요/저장 토글 (active identity) |
| `toggle_comment_like` | 댓글 좋아요 (`p_identity_id`, 0101) |
| `toggle_card_pick` | is_pick 토글 (admin OR self-doctor, 0151) |
| `soft_delete_card(p_card_id)` | SECURITY DEFINER RLS 우회 삭제 (0156) |
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

### 3.2. cards
- `cards_public_read`: `status='published' OR is_admin() OR doctor_id=current_doctor_id() OR author_id=auth.uid()` + `deleted_at IS NULL` 강제 (0132)
- `cards_admin_all` / `cards_doctor_update`/`_delete` / `cards_user_own_post`/`_delete`
- `cards_owner_update`/`_delete` (0155): 모든 type 커버, `author_id IN same_group_profile_ids(uid)`
- `is_admin()` 묶음 인식 확장 (0153)

### 3.3. comments, card_likes, card_saves
- 본인 + admin + same-group bundle 접근

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

핵심 이정표 (0001 ~ 0157, ~160개):

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
| 0153 | is_admin() 묶음 인식 확장 |
| 0154 | feed_cards_scored 반환에 status 컬럼 |
| **0155** | **cards_owner_update/delete — 모든 type 커버** |
| 0156 | soft_delete_card RPC (SECURITY DEFINER RLS 우회) |
| **0157** | **site_visits 테이블 (방문자 추적 확장)** |

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
