# Changelog

[Keep a Changelog](https://keepachangelog.com/) 표준. 모든 변경은 여기에 기록. 도메인 문서 (PRD/ARCHITECTURE/DATABASE 등) 헤더에는 절대 누적 금지 (CLAUDE.md §6).

> **2026-05-15 이전 변경 이력**: `_archive/docs/prd-monolith-2026-05-23.md` 및 `_archive/docs/PRD_changelog_2026-05-15-16.md` 참조.

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
