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
| `fitzpatrick` | smallint | 피부 광반응 1~6 (Fitzpatrick 유형, onboarding I-Fix4). NULL=미응답. CHECK(1~6 OR NULL). anon SELECT 차단(PII). 마이그 0323 |
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
- `tag_dictionary` (0247 — 태그 사전, 현 2167행): `ko`(UNIQUE)/`category`(**CHECK 10종**: 시술 6 = 리프팅·스킨부스터·필러·볼륨·주름·윤곽·레이저·기타 + 비시술 3 = 피부고민·홈케어·피부상식 + 미지정 1 — 마이그 0311 로 6→10 확장)/`en`(영문 slug)/`parent_ko`/`is_procedure`/`onboarding`(피부고민/피부타입7종/관심시술/얼굴형5종, 0254/0256)/`sort_order`(시술 폼 순서, 0257)/`aliases text[]`·`pubmed_keywords text[]`(0264)/`is_recommendable`(0267)/`reviewed_at`(0269)/**`maker text[]`**(제조사 `[한글, 영문]`, 0318 — **DB 적재 전용·스냅샷/코드/UI 미참조**, 추후 노출용 보관). service_role CRUD GRANT(0252). RLS on + anon/authenticated SELECT(GRANT 0249). **분류·슬러그 + 시술 분류 통합 SSOT** — `categoryFor`/`slugFor` 가 빌드타임 스냅샷(`src/data/tag-dictionary.generated.json`, 생성기 `scripts/gen-tag-dictionary.mjs`·prebuild)을 통해 읽음. **시술(is_procedure=true, 현 249) SSOT 도 본 표로 통합**(구 `procedure_taxonomy` 청산 0257~0259, 2026-06-06 / v9 대대적 개편 0318: 사용자 큐레이션 `전체태그_v9.json` 0-diff 반영) — `procedure_reviews.procedure_ko` FK 가 `tag_dictionary(ko) ON UPDATE CASCADE` 참조.
- `term_glossary` (0248 — 미용피부과학용어집 영한 참조원, 2519행): `en`/`ko`/`meaning_no`/`recommended`(권장★)/`note`. RLS on + anon/authenticated SELECT(GRANT 0249).
- `tag_review_queue` (0250 — 미지 태그 검수큐): `ko`(UNIQUE)/`suggested_en`/`source`/`created_at`. RLS on·anon REVOKE·`is_admin()` SELECT(admin 만). `register_unknown_tags(text[],text)` RPC + `cards` AFTER INSERT/UPDATE OF keywords 트리거가 미지 키워드를 ②tag_dictionary(미지정+용어집 en)/③검수큐로 자동 분기.
- `clinics` (0270 — 건강보험심사평가원 병원정보 참조 테이블): `id`(bigserial PK)/`ykiho`(UNIQUE NOT NULL, 심평원 요양기호)/`name`/`addr`/`tel`/`url`/`sido_cd`/`sgu_cd`/`x_pos`/`y_pos`/`clinic_type`/`raw`(jsonb)/`synced_at`/`created_at`/`updated_at`. RLS on + anon/authenticated SELECT. 쓰기는 service_role 전용(관리자 sync — 0272 에서 service_role DML GRANT 보정). 인덱스: name btree + GIN(pg_trgm 한글 부분검색)·(sido_cd,sgu_cd)·(x_pos,y_pos). `set_updated_at()` 트리거. 현재 적재: 전국 피부과 의원 16964건(clCd=31+dgsbjtCd=14, 2026-06-07).
- `cards_keywords_bak_0246` (0단계 롤백 백업, 1,232행 — 1단계 안정 확인 전까지 유지·삭제 금지).

### 1.9. 후기·시술일기 통합 (review-diary unification, 2026-06-27)

> 정본 계획서: `docs/plans/review-diary-unification-master-plan.md`. 4층 구조(O1): `diaries`(방문, 비공개) → `diary_procedures`(그날 받은 시술 목록, 순수 기록) → `procedure_reviews`(후기 앵커 + 결론 칸) → `review_checkin`(시계열 측정). 마이그 0292~0303 으로 확장·신설(아래 §5 마이그레이션 히스토리 참조).

- **`diaries`** (시술일기/방문, 0278 신설 + 0292·0302 확장): 기존 컬럼(`id`/`profile_id` FK profiles/`clinic_id` FK clinics nullable + 병원 텍스트 스냅샷/`doctor_name`/`manager_name`/`diary_body` ≤400/`created_at`/`updated_at`) + **0292 추가 7컬럼** `clinic_home`/`clinic_kakao`/`total_price`(int ≥0)/`is_complete`(bool DEFAULT true — 미완성 임시저장 트랙 B)/`reminder_stage`(smallint)/`reminder_muted`(bool)/`visited_on_precision`(text CHECK). **`visited_on` 은 0292 시점 NOT NULL → 0302 에서 DROP NOT NULL**(precision='unknown' = 날짜 미기억 회고 후기는 visited_on NULL 허용). `visited_on_precision` CHECK 는 0292 의 `exact`/`season`/`half`/`year` → **0302 에서 `unknown` 추가**(5종). 비공개 owner-only RLS(active 명함 단위). 일기 삭제는 raw DELETE 가 아니라 `delete_visit` RPC 전용(0292 에서 `diaries_delete_own` RLS DELETE 정책 제거 = FIX-1, 0297 `delete_visit` 으로 일원화).
- **`diary_procedures`** (그날 받은 시술 목록, 0278 신설): `diary_id` FK diaries CASCADE / `procedure_ko` ≤100 / `tag_dict_ko` FK tag_dictionary(ko) / `unit_text`/`price`/`note`/`sort_order`. 후기 테이블로 흡수하지 않는 "순수 기록"(O2). 후기와는 `procedure_reviews.diary_procedure_id` 역참조로만 연결. 0292~0303 에서 스키마 변경 없음.
- **`procedure_reviews`** (후기 앵커 + 결론 칸, 0200 신설 + 0292 확장, production 24컬럼): 기존 컬럼(`id`/`card_id`/`procedure_ko` FK tag_dictionary(ko) ON UPDATE CASCADE/`author_id` FK profiles/`satisfaction`/`pain`/`revisit`/`area`/`cost_satisfaction`/`effect_areas` text[]/`downtime`/`effect_onset`/`oneliner_type`/`created_at`/`updated_at`) + **0292 추가 7컬럼** `recommend`(smallint 1~5, 추천의향 — standalone 경로는 0303 에서 인자 추가)/`visit_id`(FK diaries ON DELETE SET NULL)/`diary_procedure_id`(FK diary_procedures ON DELETE SET NULL)/`is_public`(bool DEFAULT false)/`date_precision`(text CHECK, 0302 에서 `unknown` 포함 5종)/`source`(text CHECK `standalone`/`diary_linked`)/`solo_price`(int ≥0) + `visited_on`(date, 0308 추가) + **`reactions`**(text[] DEFAULT `'{}'::text[]`, nullable — 시술 직후 반응 다중선택, 0320 추가, 24번째 컬럼).
  - **NOT NULL 완화**(0292): `card_id`/`satisfaction`/`pain`/`revisit` 4종 DROP NOT NULL — 추이그래프 전용 비공개(diary_linked) 후기는 카드·결론칸 없이 시계열만 보유 가능.
  - **정합 CHECK 2종**(0292): `procedure_reviews_public_needs_card`(is_public=true → card_id NOT NULL), `procedure_reviews_source_link_chk`(diary_linked ↔ visit_id 동시 성립 / standalone ↔ visit_id NULL).
  - **UNIQUE**: `procedure_reviews_card_id_key`(card_id 1:1) 유지. (작성자×시술 UNIQUE 는 0288 ADR 0023 으로 제거 — 같은 시술 후기 여러 개 허용.)
  - **RLS read_public 게이트 강화**(0292): anon/authenticated SELECT 가 기존 "카드 published" 만 검사 → **`is_public=true AND card_id NOT NULL AND 카드 published·미삭제`** 로 강화(is_public 게이트 = 심층 방어 D-B). 백필: 기존 666 후기 중 카드 살아있는 660건만 is_public=true(soft-deleted 6건 제외 = FIX-2).
  - **anon SELECT 화이트리스트**(0299 review F2 + 0308·0320 후속): anon table-level SELECT 회수 후 column-level 재부여(0123 profiles 선례). 현 production 기준 **전체 24컬럼 중 anon 은 21컬럼**만 SELECT — 제외 3컬럼 = `solo_price`(F2 가격 영구 비공개, 0299)·`visited_on`(0308 추가 시 재부여 안 함)·`reactions`(0320 추가 시 재부여 안 함). authenticated/service_role 은 24컬럼 전체 SELECT 유지.
- **`review_checkin`** (시계열 측정 코어, 0293 신설): `review_id` FK procedure_reviews CASCADE / `timepoint`(CHECK `day0`/`week1`/`month1`/`month4`) / `satisfaction`/`recommend`/`effect_felt`/`pain`(1~5) / `changed_points` text[] / `submitted_at` / UNIQUE(review_id, timepoint). RLS ON + 로그인(묶음) 단위 owner-only SELECT(측정 소유자가 active 명함 전환과 무관하게 조회 — D-G). 결론칸 롤업(0297 `upsert_review_checkin`): 만족도·추천 = 최신 시점, 통증 = day0.
- **보조 측정 테이블 3종**(0293 신설, owner-only RLS): `review_symptom`(증상 지연발현·결절), `question_pool`(단답풀 운영 마스터 — anon/authenticated `is_active=true` 공개), `short_answer_response`(단답응답). 0295 에서 4테이블 테이블레벨 GRANT SELECT 보강(없으면 RLS 정책 inert).
- **`scheduled_notification`** (예약 알림 적재, 0296 신설): `recipient_id` FK profiles CASCADE / `kind`(CHECK `review_checkin`/`diary_incomplete`) / `visit_id`/`review_id` FK CASCADE / `timepoint`(week1/month1/month4) / `fire_after` / `status`(pending/sent/cancelled/skipped) / `message`·`url`(비식별 딥링크). 멱등 UNIQUE 2종(트랙A=(review_id,timepoint) WHERE review_checkin / 트랙B=(visit_id) WHERE diary_incomplete) + due 스캔 부분 인덱스. RLS ON + active 명함 단위 owner-only SELECT(`recipient_id=COALESCE(current_active_profile_id(),auth.uid())` — D-G [치명] 정정). 발사 엔진은 P4(0300 `run_diary_reminders()`).
- **알림 엔진 보강**(0300~0301, P4): `notification_preferences` 토글 2컬럼 `pref_review_checkin`/`pref_diary_incomplete`(default true). `diary_reminder_state` 단일행 커서 상태표(FOR UPDATE 직렬화). `notifications.kind` CHECK 에 **`diary_reminder` 추가**(9종 → 10종). `run_diary_reminders()` RPC(service_role EXECUTE = 0301 보정) 가 scheduled_notification due 행을 notifications 로 멱등 승급.

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
| `get_procedure_review_demographics(p_procedure_ko)` | 시술 단위 작성자 성별·연령대 **집계 카운트만** 반환(개별 PII 비노출, 0212 / family 롤업 0227). SECURITY DEFINER, GRANT anon/authenticated |
| `get_review_author_demographics(p_card_ids[])` | **카드별 개별** 작성자 성별·연령대(10단위) 반환 — 시술 리포트 상세 후기 카드 "30대·여성" 표시(0322). 0212 집계와 별개 = 개별 단위 노출(개인정보 고려). SECURITY DEFINER, GRANT anon/authenticated |

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
| 0257 | **procedure_taxonomy 청산 준비**(C-Phase2 STEP1). 백업(procedure_taxonomy_bak_0257 49·procedure_reviews_ko_bak_0257 155) + `tag_dictionary.sort_order` 컬럼 추가·시술 49 값 이관. active 폐기→is_procedure 대체. 비파괴. | **적용 완료 (2026-06-06)** |
| 0258 | **시술 RPC 5개 SSOT 전환**(C-Phase2 STEP2). create/update_procedure_review·get_review_report_overview·get_review_summary_pool·procedure_family 를 procedure_taxonomy→tag_dictionary(is_procedure). active→is_procedure. category 는 tag_dict 한글→영문 slug 매핑 반환(reports·테마·schema 정합, 교차 2건 자동 정정). | **적용 완료 (2026-06-06)** |
| 0259 | **procedure_taxonomy DROP**(C-Phase2 STEP3). ①더엘주사 리포트 post_slug the-l-injection→the-l-solution(en 단일화) ②procedure_reviews.procedure_ko FK procedure_taxonomy→tag_dictionary(ko) ON UPDATE CASCADE 재지정(orphan 0) ③rename_tag 단순화(tag_dict 단일, CASCADE 자동 전파) ④procedure_taxonomy DROP. 검증: pool 36·rename CASCADE(써마지 reviews13 자동 전파, 롤백). | **적용 완료 (2026-06-06)** |
| 0260 | **`merge_tag(p_source_id,p_target_ko)` RPC**(F-Phase2, SECURITY DEFINER·EXECUTE service_role 만). 영문/중복 태그(source)를 한글 대표어(target)로 병합 — procedure_reviews 방어 이관 + cards.keywords array_replace·dedup(트리거 3종 tx disable) + source DELETE. 단일 tx. 검증: thermage→써마지 비파괴(affected 1·삭제·롤백). | **적용 완료 (2026-06-06)** |
| 0261 | **`tag_merge_dismissed(ko)` 병합 후보 무시목록**(H). is_admin RLS + service_role/authenticated CRUD GRANT. 운영자 '제외' 태그 ko 기록 → 자동등록 재유입돼도 병합 후보 미노출. | **적용 완료 (2026-06-06)** |
| 0262 | **프로필 영문코드→한글 통일**(I-Phase2). 백업 profiles_concern_bak_0262 후 skin_type CHECK 영문7→한글7 교체·값 변환(59), skin_concerns 영문11→한글11, interested_procedures 영문6→한글6(PDLLA/PLLA 등 유지). face_shape 제외. run_keyword_digest 매칭 부활(concern 178·skin_type 10·proc 206). | **적용 완료 (2026-06-06)** |
| 0263 | **자동등록 영문 태그 한글 흡수**(B). `slugify_en(text)` + `tag_absorb_log` + BEFORE INSERT/UPDATE OF keywords 트리거 `cards_absorb_eng_tags` — slugify(영문태그)=tag_dictionary.en(한글) 매칭 시 한글 대표어로 치환·dedup(미매칭은 0250 register 유지). 검증: [thermage,모공,Centella Asiatica]→{모공,병풀추출물,써마지} 롤백. | **적용 완료 (2026-06-06)** |
| 0264 | **JSON 사전 → DB 이관**(L2-1). `tag_dictionary.aliases`(동의어15)·`pubmed_keywords`(논문검색어51) 컬럼 + `tag_blacklist(word)`5 + `tag_normalization(canonical,variants)`100. anon/auth SELECT·admin write·service_role CRUD. procedure-mappings.json 흡수 1단계(additive). | **적용 완료 (2026-06-07)** |
| 0265 | **동의어 태그 병합 + 흡수 트리거 통일**(L2-3). `merge_tag` 14건(카드보유 7 방향교정 + 0카드 중복 ko 7)으로 동의어→대표어 병합·source 행 삭제(2097→2083). 대표어 aliases/pubmed 이전(마리오네트주름 등). `cards_absorb_eng_tags` 통일 — alias(언어무관) 우선 + 영문 slugify 폴백. 헤르페스·단순포진 분리 유지(헤르페스.aliases NULL). 회귀: 참조 FK=procedure_reviews(사용0)·parent dangling 0. 실증: 1쌍 롤백 / 실 UPDATE 흡수(자외선차단제→선크림·항노화→안티에이징·FMT→대변이식술) 롤백. | **적용 완료 (2026-06-07)** |
| 0266 | **JSON-only orphan 태그 2건 DB 보강**(L2-4 선행). procedure-mappings.json 에만 있고 tag_dictionary 에 없던 `K-뷰티`(홈케어)·`1회적정량`(피부상식) INSERT(2083→2085). JSON 제거 시 categoryFor/slugFor 회귀 방지용. id IDENTITY 자동·ko UNIQUE ON CONFLICT DO NOTHING. | **적용 완료 (2026-06-07)** |
| 0267 | **auto-tag 추천 큐레이션 플래그 is_recommendable**(L2-4 B안). `tag_dictionary.is_recommendable boolean NOT NULL DEFAULT false` 추가 + OLD 큐레이션 819개를 3단계 병합 반영해 현재 ko 로 매핑 → 804개 true 시드(나머지 1281 false). 회원 자동태깅(auto-tag)이 DB 전체(2085)가 아닌 추천 804개만 후보로 → 일반어 노이즈 차단. 신규 태그 기본 false. | **적용 완료 (2026-06-07)** |
| 0268 | **get_tag_admin_overview + is_recommendable**(L2-4 토글). 태그 관리 '자동추천' 토글·필터용 컬럼을 RPC RETURNS TABLE 에 추가(DROP 후 재생성, 0251 본문 동일 + d.is_recommendable). | **적용 완료 (2026-06-07)** |
| 0272 | **clinics service_role DML GRANT 보정**. 0270 이 service_role 에 명시적 GRANT 를 누락(REFERENCES/TRIGGER/TRUNCATE 만 보유, INSERT/UPDATE/SELECT/DELETE 없음) → 관리자 sync upsert 가 `permission denied for table clinics` 로 실패하던 문제 수정. `GRANT SELECT,INSERT,UPDATE,DELETE ON clinics` + `GRANT USAGE,SELECT ON SEQUENCE clinics_id_seq` TO service_role. anon/authenticated SELECT-only 정책은 0270 그대로 유지. additive·무파괴. | **적용 완료 (2026-06-07)** |
| 0273 | **clinics_nearby RPC 신설** — DB 레벨 거리정렬+LIMIT. 기존 클라이언트 bbox+limit 방식에서 박스 내 수천 곳 중 임의 N개만 반환되어 진짜 최근접 누락되던 문제 해결. 서브쿼리 bbox 사전필터(clinics_xy btree 인덱스 활용) + haversine 거리 계산(LEAST/GREATEST 클램핑) + dist_km <= in_km 원형 최종필터 + ORDER BY dist_km ASC LIMIT in_lim. 인수: in_lat/in_lng double precision, in_km default 5, in_lim default 20. 반환: name/addr/tel/x_pos/y_pos/dist_km. LANGUAGE sql STABLE SECURITY INVOKER. GRANT EXECUTE TO anon, authenticated. 논현역(37.5113, 127.0215) 실증: 노즈랩의원 0.031km, 미인도의원 0.046km, 뉴브의원 0.046km, 강남라해의원 0.046km, 조수영성형외과의원 0.064km. | **적용 완료 (2026-06-08)** |
| 0274 | **보안 함수 강화**(전수 점검 후속). `recalc_user_level`: PUBLIC/authenticated EXECUTE 회수 + 권한가드(service_role / is_admin / 본인 auth.uid()=p_user_id) + search_path 고정(호출처 트리거·함수·코드 0건 확인 후 가드 추가, 본문 로직 무변경). `anonymize_user_content_before_delete`·`propagate_onboarding_to_doctor_bundle`: ALTER FUNCTION `search_path=public, pg_temp` 고정(search_path hijacking 방어, 본문 무변경). | **적용 완료 (2026-06-08)** |
| 0275 | **백업 테이블 14개 DROP**. `_bak_category/_keywords/_keywords_needle/_keywords_unify/_reviewed_at_260601`(5)·`cards_keyword_backfill_backup_260517`·`cards_keywords_bak_0246`(2)·`procedure_reviews_ko_bak_0257`·`procedure_taxonomy_bak_0257`(2)·`profiles_backup_20260529`·`profiles_concern_bak_0262`(PII 2)·`tag_dictionary_bak_0251/0254/0256`(3). 운영 테이블에 동등/최신 데이터 존재 + 참조 FK·뷰 0건 확인. `profiles_backup_20260529` 탈퇴(auth 삭제)회원 PII 4건 포함 — PIPA 불필요 PII 최소보관(원장 승인). | **적용 완료 (2026-06-08)** |
| 0276 | **로그인 RPC 2개 반환 컬럼 user_id→auth_user_id**(ADR 0014 명명 정합). `find_auth_user_by_email_with_providers`·`find_other_auth_user_by_email` 반환타입 변경이라 DROP+CREATE. `find_other` 의 PUBLIC/authenticated EXECUTE 제거 → service_role only(내부 admin 가드 유지). 코드 캐스팅(auth/callback·naver/callback) 동시 수정. 의존 DB 객체 0·멀티 명함 스위칭 경로 무관 확인. | **적용 완료 (2026-06-08)** |
| 0277 | **search_cards_scored 에 p_category 인자 추가** — 텍스트 검색 + 카테고리 동시 필터(/beta 검색 결과에서 탭으로 좁히기). 인자 추가로 시그니처 변경이라 DROP+CREATE(이전 5인자 오버로드 외 없음 확인). WHERE 에 `(p_category IS NULL OR p_category='' OR c.category=p_category)` 한 줄만 추가(본문 무변경). DROP 으로 소멸한 PUBLIC EXECUTE 를 끝에서 GRANT 복원(anon/authenticated/service_role). NULL 기본값이라 기존 5인자 호출 회귀 없음. 의존 DB 객체 0 확인. | **적용 완료 (2026-06-10)** |
| 0278 | **diaries / diary_procedures 신설**(개인 비공개 시술일기). 부모 `diaries`(profile_id FK profiles, visited_on, clinic_id FK clinics nullable + 병원 텍스트 스냅샷, doctor_name/manager_name, diary_body ≤400) + 자식 `diary_procedures`(diary_id FK diaries, procedure_ko ≤100, tag_dict_ko FK tag_dictionary(ko), unit_text/price/note, sort_order). 인덱스 4(profile+visited / clinic / diary / tag_dict). set_updated_at 트리거. **RLS ENABLE + anon REVOKE + authenticated 본인 active 명함(COALESCE(current_active_profile_id(),auth.uid())) 단위 정책 4종씩**(운영자 열람 정책 없음 = 완전 비공개). additive·무파괴. 폼 연결은 후속. | **적용 완료 (2026-06-11)** |
| 0279 | **create_diary RPC**(시술일기 저장). diaries 1행 + diary_procedures N행 원자적 INSERT. 소유검증 `profiles WHERE id=p_profile_id AND auth_user_id=auth.uid()`(create_procedure_review 동일 패턴, 타인 profile 위조 차단). SECURITY DEFINER + search_path 고정. 입력 이중검증(visited_on 범위·diary_body≤400·시술배열 1~20·price 정수≥0·길이). 반환 diary id. REVOKE PUBLIC + GRANT authenticated(anon 차단 검증). additive. 폼 연결은 후속. | **적용 완료 (2026-06-11)** |
| 0282 | **doctors.profile_data education/career 정정**. education 배열 각 항목 끝 " 수료" 제거(전공의·전임강사 등 직함 오기 수정). career 배열에서 현재 힐하우스 소속 항목 제거(doctors.clinic/branch 로 별도 표시되어 중복) + 나머지 항목 "전 " 접두 제거. 원장 9명(bae-jungmin·jung-hanmi·kang-hyunjin·kim-jongsic·kim-soohyung·ko-hyerim·kwon-soohyun·park-hyojin·rhee-doyoung) 명시적 jsonb_set UPDATE. 스키마 무변경·데이터 정정만. | **적용 완료 (2026-06-14)** |
| 0283 | **doctors.profile_data 2차 정정**(0282 후속). park-hyojin education[2] 끝 " 수련" 제거("서울성모병원·부천성모병원 피부과 전공의"). park-hyojin career[1] 힐하우스 직위 제거("힐하우스피부과의원 수원점") + career[2] 더퍼스트(비힐하우스) 직위 유지. kang-hyunjin career 빈 배열 → ["힐하우스피부과의원 수원점"] 과거 경력 추가. 스키마 무변경·데이터 정정 2행만. | **적용 완료 (2026-06-14)** |
| 0286 | **`push_subscriptions` 네이티브 푸시 지원**(앱스토어 Phase 2). `platform` 컬럼 추가(text NOT NULL DEFAULT 'web', CHECK in 'web'/'ios'/'android') + `p256dh`/`auth` DROP NOT NULL(네이티브 FCM 토큰엔 암호화 키 없음). 기존 web row 전부 'web' 채워짐. UNIQUE(profile_id,endpoint) 유지. 비파괴(ADD COLUMN·DROP NOT NULL). | **적용 완료 (2026-06-17)** |
| 0287 | **최근 본 글 읽기 경로**. `card_views(profile_id, created_at DESC) WHERE profile_id IS NOT NULL` 인덱스 + RPC `get_my_recent_views(p_profile_id,p_limit)`(card 단위 최신1건 `DISTINCT ON`, `last_viewed_at DESC`)·`get_my_recent_view_count(p_profile_id)`. 둘 다 SECURITY DEFINER + 본인검증(`profiles.id=p_profile_id AND auth_user_id=auth.uid()`) + `deleted_at IS NULL AND status='published'` 필터. GRANT authenticated. `card_views` RLS(admin-only)는 무변경. | **적용 완료 (2026-06-25)** |
| 0288 | **시술 후기 다중 작성 허용**(ADR 0023). `procedure_reviews_author_procedure_uniq UNIQUE(author_id,procedure_ko)` DROP + `create_procedure_review` 재정의(직전 운영본 VERBATIM, `duplicate_review` 사전검사 블록만 제거). 카드↔후기 1:1(`procedure_reviews_card_id_key`)·본인검증·시술검증·리포트 lazy 생성은 보존. | **적용 완료 (2026-06-25)** |
| 0289 | **피드 댓글 미리보기 N+1 제거**. RPC `get_cards_comment_preview_meta(p_card_ids bigint[])` → 카드별 (total=공개 visible 댓글수 root+답글, top_root_ids=인기순 상위3 root id). `/api/comments/preview` 가 그 root 들의 본문·답글·작성자·viewer_liked 를 조립(기존 GET 패턴). `LANGUAGE sql STABLE SECURITY INVOKER`(호출자 RLS) + `status='visible'` 명시 필터. GRANT anon, authenticated. | **적용 완료 (2026-06-27)** |
| 0292 | **팔로우 새글 알림 끄기 토글**. `notification_preferences.pref_follow_post`(기본 ON) + `is_notification_enabled` 에 follow_post 분기 + `get_my_notification_prefs` 9→10컬럼·`save_my_notification_prefs` 10-인자 overload(기존 9-인자 유지=무중단 배포) + 발행 트리거에 `is_notification_enabled(follower,'follow_post')` 게이트. 트랜잭션 ROLLBACK 실증(끄면 알림 0, 켜면 1) 후 적용. | **적용 완료 (2026-06-27)** |
| 0299 | **`card_public_url` 빈문자 가드**(0298 후속, 검수 권고 낮음·latent). TS `getQaUrl` 진리값 검사와 동형으로 `d.slug`/`post_slug`/`shortcode`/`handle` 가 `''` 면 해당 분기 fall-through(빈 세그먼트 `/doctors//...` URL 차단). `NULLIF` 가드만 — 로직·시그니처 무변경. ROLLBACK 으로 전 카드(1758) 출력 무변경(0행) 실증 후 적용. (의사 분기 `category='qa'` 라우트 필터는 두 헬퍼 mirror 유지 → CLAUDE.md §5 주석 명시.) | **적용 완료 (2026-06-27)** |
| 0298 | **한국어 인코딩 전면 교정 + 알림 URL 통일(#1)**. (A) 과거 적용(CP949 콘솔 추정)에서 UTF-8 이 깨져 U+FFFD 로 저장된 함수 11종(`on_card_save`·`on_card_status`·`on_content_report`·`check_handle_not_reserved` 등 — 저장/발행/검수요청/신고접수 알림 메시지·예약핸들 에러가 사용자에게 깨져 노출) + 테이블/뷰 코멘트 3 + `notifications.message` 15행을 정본 소스의 클린 한국어로 복원(migration 원본은 정상이었고 적용경로만 오염 → UTF-8 안전경로 node fetch 로 재적용). (B) 신규 `card_public_url(card_id)`(TS `getQaUrl` SSOT 미러: review_summary→/reports, 의사→/doctors/{slug}/{year}/{slug}, 회원→/{handle}/{shortcode}, 없으면 NULL)로 like/save/status(published)/comment 트리거가 의사글도 canonical 저장(기존 `/{handle}/{shortcode}` 비-canonical 교정). 발행 알림 의사글 URL 21행 canonical 백필(#c 앵커 보존, 멱등). ROLLBACK 기능검증(U+FFFD 0·발행 트리거 canonical+클린) + 적용 후 전수 재스캔 U+FFFD 0 확인. 13함수 독립 적대검증 13/13 무드리프트. | **적용 완료 (2026-06-27)** |
| 0291 | **follows RPC-only 확정**(0290 후속 검수 정정). 0290 의 `follows_select_public` 정책은 SELECT GRANT 부재로 무효(죽은 정책)였고 코드는 follows 직접 SELECT 0건(RPC만 사용) → 정책 DROP. RLS enabled + 정책 0 = 직접 접근 deny, SECURITY DEFINER RPC(toggle_follow/get_my_follow)만 허용. who-follows-whom 직접 열람 차단(프라이버시). | **적용 완료 (2026-06-27)** |
| 0290 | **팔로우/구독**(원장·회원 상호, 명함 단위). `follows(follower_id,followee_id, PK)` + 양방향 인덱스 + RLS(쓰기는 RPC만; SELECT 정책은 0291 에서 제거 → RPC-only) + `follows_no_self` CHECK. RPC `toggle_follow`/`get_my_follow`(toggle_card_save 0162 동형 — 묶음검증·active fallback·자기팔로우 차단). notifications kind 8→9(`follow_post`). 발행 트리거 `on_card_publish_for_followers`(cards AFTER INSERT[published] / AFTER UPDATE OF status[→published] 시 follower 개별 INSERT, 자기자신 skip; OLD.status 는 IS DISTINCT FROM 으로 NULL 안전). 트랜잭션 ROLLBACK 트리거 테스트(INSERT·UPDATE 전환·재저장 무중복·자기자신 0) 후 적용. | **적용 완료 (2026-06-27)** |
| 0284 | **award_points EXECUTE 권한 회수**(2026-06-14 보안 감사 P2-1). `award_points(uuid,text,numeric,text,text,integer)` 가 `proacl` 상 PUBLIC(`=X`)+authenticated EXECUTE 부여 + 내부 가드 전무 → anon 포함 누구나 직접 호출로 `activity_score`/`level` 임의 조작 가능했음. `REVOKE EXECUTE FROM PUBLIC, anon, authenticated` → `{postgres=X, service_role=X}` 최소화. 앱 직접 호출처 없음 + 내부 호출자 `award_daily_login`(SECURITY DEFINER) 트랜잭션 실증(ROLLBACK)으로 기능 영향 0 확인. 포인트몰·결제 도입 시 P0 격상 대상. | **적용 완료 (2026-06-14)** |
| 0285 | **award_daily_login EXECUTE 권한 회수**(0284 후속, 동일 부류 우회 경로). `award_daily_login(uuid)` 가 PUBLIC/authenticated EXECUTE + `COALESCE(p_user_id, auth.uid())` 무검증 신뢰 → 타인 일일로그인·포인트 적립 가능. award_points 의 유일 호출자이자 옆문이라 한 세트 봉쇄. `REVOKE FROM PUBLIC, anon, authenticated` → `{postgres=X}`(owner only, 원래 service_role 명시 GRANT 없음). 앱·트리거·타 함수 호출처 0 (미사용 dead 함수, 3중 확인) → 무영향. | **적용 완료 (2026-06-14)** |
| 0281 | **clinics 공백 무시 검색 지원**. `name_nospace` STORED generated column + GIN pg_trgm 인덱스 `clinics_name_nospace_trgm`. 검색어 공백 제거 후 `.ilike("name_nospace", ...)` 조회로 DB-사용자 양방향 공백 무시 매칭. 결과 컬럼 name/addr/tel/x_pos/y_pos 동일. additive·무파괴. | **적용 완료 (2026-06-13)** |
| 0271 | **merge_tag en 승계**(발주 N). 태그 병합(흡수) 시 target.en 이 공란이고 source.en 이 있을 때만 source.en 을 target 으로 승계(기존 영문은 절대 덮어쓰지 않음). 그 외 본문은 0260 정의와 동일(CREATE OR REPLACE·비파괴). 반환 jsonb 에 `en_succeeded` 추가. 원칙: 병합 후 생성일·사용량·영문은 기존 target 기준. | **적용 완료 (2026-06-07)** |
| 0270 | **`clinics` 신규 테이블**(건강보험심사평가원 병원정보 참조). 피부일기 병원 검색·선택용. `ykiho`(UNIQUE, upsert 기준)/`name`/`addr`/`tel`/`url`/`sido_cd`/`sgu_cd`/`x_pos`/`y_pos`/`clinic_type`/`raw`(jsonb)/`synced_at`·`created_at`·`updated_at`. RLS on + anon/authenticated SELECT. service_role 전용 upsert. 인덱스 4종(name btree·name GIN pg_trgm·sido_sgu·xy). `set_updated_at()` 트리거. additive·무파괴. | **적용 완료 (2026-06-07)** |
| 0269 | **미지정 태그 검토 플래그 reviewed_at**(발주 E). `tag_dictionary.reviewed_at timestamptz NULL`(NULL=미검토, 값=검토완료/잔류). get_tag_admin_overview 에 컬럼 추가(DROP 후 재생성). 미지정 목록 기본=미검토만, '검토완료 포함 보기' 토글. PATCH 의 `reviewed`(now/null) 로 갱신. additive·전체 NULL 시작. | **적용 완료 (2026-06-07)** |

### 후기·시술일기 통합 (review-diary unification, 2026-06-27)

> 정본 계획서: `docs/plans/review-diary-unification-master-plan.md`. ⚠ **마이그 번호 충돌 이력**: 병행 FOLLOW 세션과 동시작업으로 **0292·0298·0299 번호가 중복**됨 — FOLLOW 세션 파일(`0292_follow_post_pref.sql`·`0298_encoding_repair_and_url_unify.sql`·`0299_card_public_url_guards.sql`, 위 표 별도 등재)과 본 통합 세션 파일(`0292_review_diary_schema.sql`·`0298_…`(존재안함, 0299 로 재번호)·`0299_revoke_solo_price_anon.sql`)이 같은 번호를 공유. 아래는 통합 세션 파일만 등재.

| Migration | 내용 |
|---|---|
| 0292 (review) | **통합 DB 토대 1/2** — `diaries` 7컬럼 확장(clinic_home/clinic_kakao/total_price/is_complete/reminder_stage/reminder_muted/visited_on_precision CHECK exact·season·half·year). `procedure_reviews` 7컬럼 확장(recommend smallint 1~5 / visit_id FK diaries ON DELETE SET NULL / diary_procedure_id FK diary_procedures ON DELETE SET NULL / is_public bool DEFAULT false / date_precision / source standalone·diary_linked / solo_price). NOT NULL 4종 완화(card_id·satisfaction·pain·revisit — 추이그래프 전용 비공개 후기 대비). 정합 CHECK 2종(`public_needs_card`=is_public→card_id NOT NULL, `source_link_chk`=diary_linked↔visit_id 동시성립). 기존 666 후기 중 **카드 살아있는 660건만 is_public=true 백필**(FIX-2: soft-deleted 카드 6건 제외해 상태모순 회피). 인덱스 3(visit/diary_proc/public). **read_public RLS 강화**: is_public=true AND card_id NOT NULL AND 카드 published·미삭제(심층 방어, is_public 게이트). **diaries_delete_own RLS 정책 제거**(FIX-1 — raw DELETE 차단, 일기 삭제를 `delete_visit` RPC 전용으로 강등). 한 트랜잭션·비파괴(ADD/ALTER/DROP POLICY/CREATE만). |
| 0293 (review) | **통합 DB 토대 2/2** — 신규 측정 테이블 4종. `review_checkin`(시계열 측정 코어: review_id FK CASCADE, timepoint day0·week1·month1·month4, satisfaction/recommend/effect_felt/pain 1~5, changed_points text[], UNIQUE(review_id,timepoint)). `review_symptom`(증상 지연발현·결절). `question_pool`(단답풀 운영 마스터, anon 읽기 is_active=true). `short_answer_response`(단답응답). 전부 RLS ON + owner-only SELECT(question_pool 만 anon/authenticated 공개). 순신규(기존 데이터 영향 0). |
| 0294 (review) | **긴급 회귀 패치** — `create_procedure_review` 가 신규 컬럼 `is_public` 을 set 하지 않아 0292 의 read_public 게이트 도입 후 새 공개 후기가 is_public=false(DEFAULT)로 저장돼 anon 에 가려지던 회귀 교정. procedure_reviews INSERT 절에 `is_public=true, source='standalone', date_precision='exact'` 추가(시그니처·검증·앵커 lazy 생성 보존). 직전 운영본의 mojibake 주석/리터럴을 정상 UTF-8 로 복원. |
| 0295 (review) | **보정 GRANT** — 0293 신규 4테이블에 테이블레벨 `GRANT SELECT` 누락 → SELECT RLS 정책이 inert 였던 것 보강. 측정원본 3종 authenticated only, question_pool 은 anon/authenticated. 쓰기는 SECURITY DEFINER RPC 전용(grant 미부여). |
| 0296 (review) | **예약 알림 적재 테이블(dormant)** — `scheduled_notification`(recipient_id FK profiles, kind review_checkin·diary_incomplete, visit_id/review_id FK CASCADE, timepoint week1·month1·month4, fire_after, status pending·sent·cancelled·skipped, message·url). 멱등 UNIQUE 2종(트랙A=(review_id,timepoint) WHERE review_checkin / 트랙B=(visit_id) WHERE diary_incomplete) + due 스캔 부분 인덱스. RLS ON + owner-only SELECT(`recipient_id=COALESCE(current_active_profile_id(),auth.uid())` — 묶음 명함 정합, D-G [치명] 정정). 적재·발사 RPC 없음(발사는 P4). |
| 0297 (review) | **백엔드 RPC 계층(dormant)** — SECURITY DEFINER RPC 5종. `create_visit_with_entries`(visit+diary_procedures+procedure_reviews 원자 생성, diary_linked day0 review_checkin + 트랙A scheduled_notification 예약 포함. F3 결정으로 diary_linked 후기도 is_public=true 허용 → 공개 시 카드+review_summary 앵커 lazy 생성). `upsert_review_checkin`(review_checkin UPSERT + 결론칸 롤업: 만족도·추천=최신시점, 통증=day0). `update_visit`(diaries 본문 전체 덮어쓰기, 자식 미동기화). `delete_visit`(연결 후기 standalone 전환 + 트랙A pending 예약 cancel + 일기 삭제 — FIX-1/D-I). `unpublish_review`(cards soft-delete + is_public=false 원자, 작성자묶음·admin). 전부 authenticated EXECUTE. 호출 UI/라우트 없음(dormant). |
| 0299 (review) | **F2 가격 비공개 — solo_price anon 봉쇄**(0298 은 FOLLOW encoding_repair 선점 → 0299 로 재번호). procedure_reviews.solo_price(0292 추가)가 read_public anon SELECT 경로로 공개 후기 행에서 노출 가능했던 것(현 비-NULL 0건이나)을 F2(가격 영구 비공개) 컨벤션→권한으로 강제. 0123(profiles) 선례 계승: anon table-level SELECT 회수 → solo_price 제외 21컬럼만 column-level 재부여. RLS·앱코드 무영향(solo_price 참조 0건 확인). |
| 0300 (review) | **P4 예약 알림 발사 엔진** — dormant 발사 엔진. `notification_preferences` 토글 2컬럼(pref_review_checkin/pref_diary_incomplete, default true). `diary_reminder_state` 단일행 커서 상태표(keyword_digest_state 패턴, FOR UPDATE 직렬화). `notifications.kind` CHECK 에 **`diary_reminder` 추가**(기존 9종 보존). `run_diary_reminders()` RPC(단일 CTE 체인 locked→fired→mark_sent/mark_skip 멱등 발사 + 토글 게이트 FIX-5 + diary_incomplete 미완성·비뮤트 재확인 + reminder_stage 전진). scheduled_notification 0행이라 호출돼도 발사 0. |
| 0301 (review) | **[치명] 권한 보정** — 0300 이 주석 오판으로 `REVOKE ALL … FROM PUBLIC` 만 하고 service_role EXECUTE 를 누락 → cron 라우트(service_role, rolbypassrls=true·rolsuper=false)가 매 실행 `42501 permission denied for function` 500 실패하던 것 교정. `GRANT EXECUTE … TO service_role`(run_keyword_digest 패턴) + anon/authenticated/PUBLIC 차단 재확인. 0300 본문 미수정(권한만 보정). |
| 0302 (review) | **회고형 후기 날짜 관대화** — date_precision enum 에 **`unknown` 추가**(exact·season·half·year 보존, diaries·procedure_reviews CHECK DROP+ADD). `diaries.visited_on DROP NOT NULL`(unknown=날짜 미기억 → visited_on NULL). `create_visit_with_entries` 재정의(본문 보존 + 관대 모드 v_lenient=precision='unknown' OR visited_on NULL 플래그로 future/old 범위검증 스킵 + 트랙A 예약·day0 상대일정 스킵). review_checkin.timepoint CHECK 무변경(unknown 후기 day0 체크인도 'day0' 저장). |
| 0303 (review) | **standalone recommend 추가** — 통합 visit 경로는 recommend 를 저장하나 단독 후기 경로(/review/new→/api/reviews→create_procedure_review)에 recommend 인자가 빠져 항상 NULL 이던 D-D 잔여 교정. 시그니처 끝에 `p_recommend smallint DEFAULT NULL` 추가(끝 인자 추가로 오버로드 생성 회피 위해 기존 14-인자 DROP 후 15-인자 재생성) + procedure_reviews INSERT 에 recommend 추가. is_public/source/date_precision 등 기존 동작 보존. authenticated EXECUTE 재부여. |
| 0304 (review) | **단답 질문 풀 시드 + 단독 후기 단답 저장** — `question_pool_timepoint_check` 에 `any`(시점 무관) 추가(day0/week1/month1/month4 보존). 확정 질문 멱등 시드(is_active, weight=1, `(timepoint, question_text)` NOT EXISTS 가드). `create_procedure_review` 끝에 `p_short_answers jsonb DEFAULT NULL` 추가(15→16-인자 DROP·재생성, GRANT 재부여) → 같은 트랜잭션에서 `short_answer_response`(review_id, checkin_id=NULL) 저장(active 질문만). |
| 0305 (review) | **시점별 체크인 단답 2칸** — `upsert_review_checkin` 끝에 `p_short_answers jsonb DEFAULT NULL` 추가(7→8-인자 DROP·재생성, GRANT 재부여). 체크인 UPSERT 후 `checkin_id` 로 `short_answer_response`(review_id+checkin_id) 저장. 재제출 멱등: 해당 checkin_id 단답 DELETE 후 INSERT. 본문은 prod `pg_get_functiondef` VERBATIM 보존 + 단답 블록만 추가. |
| 0306 (review) | **단독 후기 단답 일원화 + 기존 본문 이관** — `question_pool` 에 `('any','생생한 후기를 남겨주세요')` 멱등 INSERT(대표 질문). 기존 후기 `cards.body`(옛 한줄후기) → `short_answer_response`(review_id ↔ 대표 question_id, checkin_id=NULL) 무손실·멱등 이관(body 원본 보존, 회귀 0). RPC 변경 없음. |
| 0307 (review) | **질문 풀 v2 전면 교체(원장 확정 28)** — 기존 질문 전부 `is_active=false`(행 보존 — `short_answer_response` FK 안전). 시점별(day0/week1/month1/month4 각 7) 28개 멱등 INSERT(active). `생생한 후기를 남겨주세요`(any) 재활성. 결과 활성 = 28 + 1 = 29. |
| 0308 (review) | **단독 후기 어림시기 저장** — `procedure_reviews.visited_on date` 컬럼 추가. `create_procedure_review` 에 `p_visited_on date DEFAULT NULL` + `p_date_precision text DEFAULT 'exact'` 추가(16→18-인자 DROP·재생성, GRANT 재부여). INSERT 에 visited_on/date_precision 반영. is_public/source/recommend/short_answers/리포트 lazy 생성 등 기존 동작 VERBATIM 보존. |
| 0309 (review) | **'any' 일반 질문 보강(단독 후기 2칸+다시고르기)** — 0307 이 'any' 활성을 대표 1개만 남겨 단독 후기 단답이 1칸뿐이던 것 교정. 시점 무관 일반 질문 6개 멱등 INSERT(NOT EXISTS) + 동일 텍스트 비활성 행 재활성(id 22). 결과 'any' 활성 = 7. 시점별 체크인 폼도 `[timepoint, 'any']` 로드라 함께 풍부해짐. |
| 0310 (review) | **`update_procedure_review` p_recommend 추가** — 수정 경로에서 recommend(추천의향)가 DB 에 저장되지 않던 버그 교정. 기존 11인자 DROP 후 12인자(`p_recommend smallint DEFAULT NULL`)로 재생성. `COALESCE(p_recommend, pr.recommend)`로 NULL 전달 시 기존값 유지. GRANT 재부여. 한국어 미포함. |
| 0320 (review) | **시술 직후 반응(reactions) 다중선택 저장** — `procedure_reviews.reactions text[] DEFAULT '{}'::text[]` 신설(production 24번째 컬럼, nullable). `create_procedure_review`(18→19인자) / `update_procedure_review`(12→13인자) 두 RPC 에 `p_reactions text[]` 추가(시그니처 변경이라 기존 DROP 후 재생성, authenticated GRANT 재부여). 폼은 부기/멍/딱지/붉어짐·홍조/화끈거림·열감/멍울·뭉침 + 없음(단독) 다중선택, 다운타임 질문은 반응에 증상 1개 이상일 때만 조건부 노출. anon 재부여 대상에서 제외(21컬럼 유지). |
| 0321 (review) | **[주의] update_procedure_review downtime CASE 를 `p_reactions IS NULL` 로 — 빈 배열(반응 전체 해제) 시 다운타임 미보존 정정** — 0320 의 `downtime = CASE WHEN COALESCE(array_length(p_reactions,1),0)=0 THEN pr.downtime ELSE p_downtime END` 가 빈 배열 `{}`(수정 모드에서 반응 전체 해제=명시적 비움)일 때도 길이 0이라 기존 downtime 을 보존 → 신규 클라이언트가 보낸 reactions=[]+downtime=null('둘 다 비움' 의도)이 'reactions=빈배열+downtime=잔존'으로 불일치하던 클라↔RPC 규약 충돌 정정. 조건을 `p_reactions IS NULL`(구 클라이언트=미전달일 때만 보존, 빈 배열은 p_downtime 반영)로 좁힘. 시그니처 동일 → CREATE OR REPLACE(본문 나머지·GRANT VERBATIM). reactions 컬럼 갱신(`COALESCE(p_reactions, pr.reactions)`)은 정상이라 유지. 한국어 주석 포함 → UTF-8 경로·U+FFFD 0 확인, 오버로드 1개 확인. |
| 0323 (onboarding) | **profiles.fitzpatrick 컬럼 신설** — 피부 광반응(Fitzpatrick) 유형 1~6 온보딩 신규 질문. `smallint CHECK(1~6 OR NULL)`, 기존 row NULL 유지(다음 설정 진입 시 입력). 피드 추천·시술 매칭 피부톤 보정 용도. anon SELECT 차단(PII, 0123 설계 자동 상속). UTF-8 경로(node scratchpad/apply_0323.mjs) 적용. |
| 0324 (onboarding) | **propagate_onboarding_to_doctor_bundle 에 fitzpatrick 복제 추가** — 0323 에서 신설한 `profiles.fitzpatrick` 을 의사 멀티 계정 묶음 전파 RPC 가 누락하던 정합성 결함 교정. SELECT INTO v_src 절 + UPDATE SET 절에 `fitzpatrick` 추가(smallint 단일값 → 단순 COALESCE). 0274 의 search_path 하드닝을 함수 정의에 명시(`SET search_path = public, pg_temp` — CREATE OR REPLACE 가 ALTER 설정을 초기화하므로). GRANT authenticated 재명시. UTF-8 경로·U+FFFD 0 확인. |
| 0325 (security) | **보안 하드닝(개선 라운드 1, 패키지 D)** — ① `get_research_panel()` 에 `is_admin()` 가드(0119 패턴, ERRCODE 42501): 일반 authenticated 의 직접 RPC 호출로 회원 통계(총원·활성·후기작성자) 열람되던 결함 차단, 관리자 화면 무변화. ② profiles PII 15컬럼(birthdate·gender·face_shape·skin_type·skin_concerns·interested_procedures·contact_email·동의시각/버전 6종·fitzpatrick) anon SELECT 명시 REVOKE(방어심층 — 현재도 미부여 상태를 명시화). ③ follows anon SELECT REVOKE(코드 사용처 0 확인). ④ `current_active_profile_id()` anon REVOKE 는 `cards_public_read`(roles=public) 정책이 qual 에서 참조함을 라이브 pg_policies 로 확인해 **의도적 제외**(적용 시 anon 카드 조회 전면 파손 — 해결 경로 주석 문서화). UTF-8 경로(node scratchpad/db.mjs) 적용, 사후 검증 3종(guard=true·PII 노출 0·follows 0) 통과. |
| 0328 (admin) | **get_review_report_overview 4필드 확장 (원장 확정 2026-07-04 — 관리자 리포트 전용 표)** — `anchor_created_at timestamptz` · `sat_dist integer[]`(**[5점..1점] 순** — ⚠ get_review_summary_pool 의 sat_dist 는 [1..5] 오름차순, 혼용 금지) · `downtime_dist integer[]`(DOWNTIME_OPTIONS 순 5칸, NULL 응답 제외 — 합계<review_count 가능) · `effect_top jsonb`([{label,n}] 상위 3, '없음' 제외, 빈 경우 `[]`). RETURNS TABLE 변경이라 DROP 후 재생성(BEGIN/COMMIT), 기존 13필드·is_admin 가드·SECURITY DEFINER·search_path VERBATIM, 실측 ACL(authenticated only) 재현 + NOTIFY pgrst. 디비전문가 검수 통과(치명 0). 적용 후 실측: OUT 17필드·ACL 정확 재현·U+FFFD 0. 소비처는 /admin/review-reports 1곳(신필드 미존재에도 안전 폴백). UTF-8 경로 적용. |
| 0327 (feed) | **feed_cards_scored 의사글 가중치 x2 → x3 (원장 확정 2026-07-04)** — 시술후기 대량 유입 후 최근성 감쇠로 전문의 Q&A 가 전체 풀에서 소멸(4/300)하던 것 보정. `CASE WHEN doctor_id IS NOT NULL THEN 2.0 → 3.0` 단 1곳, 0326 본문 VERBATIM. 시그니처 동일 → CREATE OR REPLACE(0326 의 명시 GRANT·owner 자동 보존, DROP 불필요). 디비전문가 검수: x3 실효 구간은 최근 30~60일 의사글(578일 평균 경과 재고엔 미미) — 상시 노출 보장은 앱 레이어 blendQaQuota("20장당 Q&A ≥6", lib/feed-shuffle.ts)가 담당(부보완 관계). 적용 후 실측: 자연 top300 내 qa 4→6, 하위호환·ACL·U+FFFD 0 확인. search/tag_cards_scored 는 대상 아님. |
| 0326 (feed) | **feed_cards_scored 에 p_category 선택 파라미터 추가** — 홈 피드 카테고리 탭(/?cat=qa\|review\|doodle) 서버측 풀. 종전 "상위 300 풀 1개를 클라 필터" 모델이 2026-06 시술후기 750건 유입으로 review 290/300 도배(실측) → Q&A 4개·끄적끄적 6개만 표시되던 구조 결함 해소. 점수 공식·컬럼 27종·불변식(published + deleted_at IS NULL + type<>review_summary) VERBATIM, WHERE 에 `(p_category IS NULL OR c.category = p_category)` 만 추가. 시그니처 변경(4→5인자)이라 DROP 후 재생성(오버로드 모호 방지) + 명시 GRANT(anon/authenticated/service_role — 구 함수의 기본 ACL 암묵 의존 제거, 디비전문가 검수 반영) + `NOTIFY pgrst, 'reload schema'`. 기존 4-인자 named 호출부(홈 전체 풀·사이드바)는 무영향(하위호환 실측 검증: 전체 300·qa 300·doodle 18·U+FFFD 0). UTF-8 경로(node scratchpad/db.mjs) 적용. |
| 0322 (review) | **시술 리포트 후기 카드용 작성자 인구통계 RPC** — `get_review_author_demographics(p_card_ids bigint[])` 신설. 입력 카드 id 배열에 대해 **카드별 개별 작성자 성별(`profiles.gender`)·연령대(생년월일 → 10단위 floor, 10~50 클램프)** 를 반환(시술 리포트 상세 후기 카드의 "30대·여성" 한 줄 표시용). `SECURITY DEFINER` + `set search_path='public'` + `stable`, GRANT EXECUTE anon/authenticated. ⚠ **0212 `get_procedure_review_demographics`(시술 단위 성별·연령대 분포를 집계 카운트로만 반환, 개별 PII 비노출)와 별개의 함수** — 본 RPC 는 **개별 후기 단위로 작성자 인구통계를 노출**하므로(특정 후기 → 작성자 성별·연령대 연결 가능) 개인정보 측면 고려가 있음(연령은 10단위 라운딩으로 단일 출생연도 비식별, 직접 식별자·생년월일 원본은 미반환). 운영 직접 적용(Management API), 마이그 파일은 기록용. |
| 0311 (tags) | **태그 카테고리 CHECK 제약 확장 (6→10종)** — tag_dictionary.category CHECK 에 '필러·볼륨', '주름·윤곽', '레이저', '기타' 4종 추가. DROP+ADD CONSTRAINT(PostgreSQL ALTER CHECK 미지원). |
| 0312 (tags) | **시술 태그 198종 대량 UPSERT** — procedures_v6.json 기반. 10종 카테고리 체계에 맞춰 tag_dictionary·tag_normalization 에 시술 태그 일괄 등록·갱신. 기존 행은 category/en/parent_ko/is_procedure/aliases/pubmed_keywords 만 덮어쓰기. |
| 0313 (tags) | **미지 태그 자동등록 v2** — 시술 후기 소스 태그는 category='기타', is_procedure=true 로 자동 등록. 일반 소스는 category='미지정'. 0250 대비 10종 카테고리 반영. |
| 0314 (tags) | **시술 리포트 RPC 카테고리 매핑 확장** — get_review_report_overview, get_review_summary_pool 의 CASE WHEN 을 2분기(lifting/injectables)→6분기(lifting/skinbooster/filler/contour/laser/other)로 확장. |
| 0315 (tags) | **[치명] resolve_tag_review 허용 카테고리 6→10종** — 0311 이 tag_dictionary CHECK 를 10종으로 넓혔으나 관리자 검수 RPC resolve_tag_review 내부 IN 목록은 구 6종에 머물러 신규 4종(필러·볼륨/주름·윤곽/레이저/기타)을 'invalid category' 거부. register_unknown_tags 가 후기 태그를 '기타' 로 자동등록하는데 이 RPC 가 '기타' 조차 못 받아 검수큐 분류 저장 불가하던 정합성 붕괴 교정. IN 목록을 CHECK 와 동일 10종으로 확장(본문 나머지 VERBATIM, ACL 유지). 한국어 포함 → UTF-8 파일 경로 적용·U+FFFD 0 확인. |
| 0316 (tags) | **[치명] tag_normalization 오타교정 방향 정정 + 다한증보톡스 재분류** — 0312 가 tag_normalization 의 (canonical, variants) 를 거꾸로 적재(canonical=정상 ko / variants=[오타])하여 오타교정이 무력화되고 정상 시술명이 자기 오타로 역오염되던 결함 정정. 규약은 **canonical=입력 키(오타), variants=정규화 출력(정상 시술명)** (소비 코드 procedure-dict.ts::normalizeTag·빌드 스크립트 gen-tag-dictionary.mjs 기준). procedures_v6.json {ko, typos} 권위 기준으로 올바른 방향 63건 재적재(INSERT ON CONFLICT DO UPDATE) + 0312 가 만든 역방향 54행만 (canonical, variants) 정확 매칭으로 개별 DELETE. 레거시 별칭병합(리쥬란HB→리쥬란 등)·분할룰(HIFU부작용→HIFU/부작용 등)은 ko 가 JSON 항목이 아니므로 보존. 추가로 tag_dictionary '다한증보톡스' 분류를 '주름·윤곽'→'기타' 재배치(기능성 톡신, 두피보톡스 동류·사용자 도메인 결정, is_procedure=true 유지). 멱등(INSERT upsert / DELETE 정확조건 / UPDATE 단일행). 한국어 포함 → UTF-8 파일 경로 적용·U+FFFD 0 확인. |
| 0317 (tags) | **시술사전 선재고 정리** — 큐레이션 198종 밖에 쌓여 있던 비-v6 시술·일반어 정리. 신규 시술 12 편입 + 별칭 병합 3(덴서티알파팁→덴서티 / 티타늄→티타늄리프팅 / 엑셀브이→엑셀V: target.aliases 추가 + 정규화 정방향 + standalone is_procedure=false·미지정 강등) + 미라젯 미지정 강등 + 이펙스 DELETE + 일반어 60 재분류(보톡스류→주름·윤곽, 레이저류→레이저, 히알루론산필러→필러·볼륨, 재료/회사/도구/부작용→미지정). 레디어스↔래디어스 표준명 교체(레디어스=필러·볼륨 표준, 래디어스=별칭), 올리디아365 parent=올리디아. 멱등·단일 트랜잭션. UTF-8 경로·U+FFFD 0 확인. |
| 0318 (tags) | **[대규모] v9 분류 전면 개편 + maker 컬럼** — `maker text[]` 컬럼 ADD(134행 [한글,영문] 적재). 사용자 큐레이션 `전달용/전체태그_v9.json`(2167행) SSOT 전체 UPSERT(카테고리 68·is_procedure 41·parent 7 변경). 머지/단독 삭제 33 DELETE + `procedure_reviews.procedure_ko` '덴서티알파팁'→'덴서티' 재연결(후기 2건, 리포트 고아 방지) + 더엘주사 en→the-l-solution(앵커 정합). tag_normalization: 0317 stale(canonical=티타늄) 제거 후 v9 typos+머지 정방향 138행 재적재. 신규 34 영문 slug 부여. is_procedure 209→249. **적용 후 DB↔v9 0-diff 완전 일치 검증.** 멱등·단일 트랜잭션. UTF-8 경로·U+FFFD 0 확인. |
| 0319 (tags) | **신규 영문 slug 확정** — 0318 의 임시 음역 2건을 웹 검색 확정값으로 교정: 라풀렌 `rapullen`→`lapuroon`(Lapuroon PDRN 스킨부스터), 코레지 `corege`→`corage`(Corage Cellfit). 이브시너지=eve-synergy, 프랙타트=fractat 는 정확하여 유지. en 충돌 0. |

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
