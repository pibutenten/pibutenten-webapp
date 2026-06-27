# 세션 핸드오프 (SESSION_HANDOFF)

> 세션 간 인수인계용. 현재 상태·주의사항·다음 작업·불변 원칙을 한 장으로. 변경 이력 상세는 `CHANGELOG.md`.

**최종 갱신**: 2026-06-27

---

## ★ 다음 세션 할 일 (디렉터 호출 대기)
1. **#5b 시술후기 타임포인트 유도 알림** — 디렉터 시점값(예: 1주/1달/3달) 지시 필요. 인프라는 옆 세션이 적재 중(`scheduled_notification` 마이그 0296 + diary-reminders 엔진 0300). 시점값 확정 후 "후기 작성 시 예약 적재 + 발사" 배선.
2. **npm audit 잔여 13** — firebase-admin/@capacitor-assets breaking 체인. 별도 테스트 후 메이저 업 결정.
3. (유지) #3 온보딩 "최대한 받기" 손 안 댐 · 쇼핑 탭 유지(기능 추가 예정).
4. (선택·latent, 현재 0행/무영향) `card_public_url` 의사 분기 `category='qa'` 가드(§5 주석화) · viewerStates 명함전환 시 재조회.

> **이번 세션(2026-06-27 part 2) 완료·배포**: #5 알림끄기토글(마이그 0292, `f5fe172`) · **한국어 인코딩 전면교정**(0298, `f8ce542`) · #1 알림URL통일(`card_public_url`, 0298/0299, `bf5ad38`) · #2 홈 SNS캐싱 3종(피드캐시 `6f0e813` · revalidateTag 무효화 `dbe9164` · viewerStates 클라이전 `41230f1`). 각 독립 검수 2명 차단 0. 상세 = CHANGELOG `[2026-06-27]`. 마이그 동일번호 충돌 2건(0292·0299) MIGRATION_HISTORY 명문화.

---

## 0. 직전 세션 (2026-06-26~27 · 6-에이전트 종합 감사 → 디렉터 승인 권고 Wave 구현) — 한눈에

> UX·구조·코드 6독립 평가 + 적대적 검증으로 앱 종합 감사 → 안전·정합 확실 항목 직접 수정·배포 → 디렉터 승인 권고를 Wave 단위로 구현. 각 Wave: 서브에이전트 분석 → 단계별 tsc/build → 독립 검수관 → 커밋·푸시. **옆 세션("Post writing feature fixes", 글쓰기/nav-guard 영역)과 파일 경계 완전 분리.**

### 완료·배포 커밋 (origin/main, 시간순)
- `ce56896` **감사 일괄 정비**: a11y(globals.css `:focus:not(:focus-visible)` 복원, WCAG 2.4.7) · 런타임 안전 5종(ScrollManager·draft/publish·search/suggest·middleware try/catch + 온보딩 만14세 로컬자정 파싱) · perf(ui.tsx `useCardActions` per-card getUser→useSession, useCardEngagement 중복 save_count SELECT 제거) · 죽은코드 삭제(lib/auto-tag·doctor-dashboard·me-cache·components/dialog/Dialog·skin/record/clinic-map + leaflet/react-leaflet/@types/leaflet 의존성) · 문서·주석 SSOT 정합.
- `22f77aa` 감사 보고서 `docs/reports/2026-06-26-six-agent-audit.md`.
- `9b26ecc` **Wave A**: 신고사유 SSOT(`lib/report-reasons.ts`, 폼·앱모달·관리자·API 4곳 통합) + `/old-skin` 3라우트 삭제.
- `048c770` **Wave F-1**: `GuardedLink`(SSOT) — AppShell 6개 내비 링크에 nav-guard 배선(글쓰기 이탈 모달 누락 회귀 수정).
- `8faf7f0` **Wave F-2/3**: 옛 `TopNav`/`BottomNav`/`IdentitySwitcher`/`NotificationsBell` 삭제 → AppShell 단일화. `SessionInfo`/`SessionIdentity` → `lib/session-types.ts`. GlobalChrome `ChromeHeader` 제거(ChromeFooter 유지). 명함전환=`AccountSwitcherCard`로 대체 확인.
- `c8f902d` 신고사유 hint 타입에러 수정(`as const satisfies` → `readonly ReportReasonOption[]`).
- `a681dee`/`67b5403` CHANGELOG + `npm audit fix`(17→13; 남은 13은 firebase-admin/@capacitor-assets breaking 체인 — 자동 적용 안 함).
- `7c67acb` **Wave B**: 댓글 미리보기 N+1 제거(인스타·페북식 배치). 마이그 0289 RPC `get_cards_comment_preview_meta`(카드별 total + top3 root id, SECURITY INVOKER) + `/api/comments/preview`(배치) + `CommentsBlock` seed prop + `FeedView` 페이지당 1회 배치 + `PostCard` `batchedPreview` 게이트. 독립검수 회귀없음.
- `d22c713` **Wave D**: 홈 인기태그 중복 RPC 제거 — `feed_cards_scored`(300행) 2번째 호출을 `unstable_cache`(5분, 쿠키리스 anon)로. 피드 본문 RPC(jitter)는 불변.

### 디렉터 결정 (확정 — 재논의 불필요)
쇼핑 탭 유지(기능 추가 예정) · 온보딩 "최대한 받기" 유지(칩 기반, 필수 축소 안 함) · 검색 진입=어느 아이콘이든 같은 화면(Wave F에서 BottomNav 중복 제거로 수렴) · 팔로우=원장·직원 **상호** 다 가능 · 댓글 미리보기 3개 유지(배치로 N+1만 제거).

### 알림 묶기(#4) = 이미 구현됨 (감사 SNS-1 오진)
`0083` 트리거가 좋아요/저장을 24h 내 같은 `(recipient_id, card_id, kind)` 1행 UPDATE → "○○님 외 N명". DB 레이어에서 이미 그룹핑. **추가 작업 불필요.** (주의: push webhook `0086`은 AFTER INSERT만 → 묶음 UPDATE의 2번째+는 푸시 안 감 — 기존 동작.)

### ✅ 완료: Wave C 팔로우(#5) — 배포됨 (커밋 `4657ea6` + 검수 정정 `132bf79`)
원장·회원 상호 팔로우 + 발행 알림 구현·배포 완료. **독립 검수관 2라운드(4명) 잔여 이상 0건.** 마이그 0290(트랜잭션 ROLLBACK 트리거 실증 후 적용) + 0291(검수 정정: follows RPC-only 확정, 죽은 공개SELECT 정책 제거). 알림 묶기(#4)는 0083 트리거가 이미 구현(감사 SNS-1 오진). 아래는 구현된 설계(기록용):
1. **마이그 0290(예정)**:
   - `follows(follower_id uuid, followee_id uuid, created_at timestamptz DEFAULT now(), PK(follower_id,followee_id))` + 양방향 인덱스. id=profiles.id(명함). FK ON DELETE CASCADE(profiles).
   - RLS: SELECT 공개(팔로워수 표시)/본인 행. INSERT/DELETE는 RPC(SECURITY DEFINER) 경유만.
   - RPC `toggle_follow(p_followee_id uuid, p_identity_id uuid DEFAULT NULL) RETURNS TABLE(following boolean, follower_count integer)` — `toggle_card_save`(0162:269) 동형(`auth.uid()` + p_identity_id 묶음검증 + `current_active_profile_id()` fallback + EXISTS→DELETE/else INSERT ON CONFLICT). SECURITY DEFINER, REVOKE PUBLIC + GRANT authenticated. **자기팔로우 차단**(follower=followee guard).
   - kind CHECK 8종→9종: `'follow_post'` 추가(`0244:34-39` DROP+ADD CONSTRAINT 패턴). `src/lib/notification-kinds.ts`(8-16)도 동시 갱신(동기화 페어) + KIND_LONG_LABEL/KIND_ICON/KIND_DISPLAY_MODE + NotificationsClient FILTER_KINDS.ops.
   - **발행 트리거**: `cards` AFTER INSERT(status='published') + AFTER UPDATE(OLD<>published AND NEW='published') → `NEW.author_id` 를 팔로우하는 follower 들에게 `'follow_post'` 알림 **개별 INSERT**(묶음 UPDATE 금지 — 푸시 위해). **자기자신 skip**(follower=author). url=`0071` CASE식(`/{handle}/{shortcode}` 또는 fallback). is_notification_enabled 게이트(default true). **베타 팔로워 소수라 fan-out 무위험; 대규모는 digest 후속(스팸 주의).**
2. **UI**: 회원 `ProfileView.tsx:288` isOwner 블록 대칭으로 `!isOwner` [팔로우] 버튼(isOwner/profileId props 존재). 의사 `DoctorProfileView.tsx:420-425` 배지 직후 [팔로우](`e.stopPropagation()` 필수, 398줄 펼침토글 / isFollowing 서버 주입 or 클라 fetch). 팔로우 토글 클라 훅(toggle_card_save 호출부 패턴).
3. **테스트**: 마이그는 트랜잭션+ROLLBACK 으로 트리거 발화 검증 후 적용. 자기팔로우·중복·발행 fan-out 확인.

### 다음 단계 / 후속·보류
- ✅ 이번 세션 모든 승인 항목 완료·배포(감사정비~팔로우, ce56896~132bf79). 최종 보고서: `docs/reports/2026-06-27-recommendation-implementation.md`.
- ✅ **follow_post 알림 끄기 토글 + 필터 칩 완료**(마이그 0292, 커밋 `f5fe172`): `notification_preferences.pref_follow_post` + is_notification_enabled 게이트 + 설정 토글 + 알림함 "새 글" 칩. (0292 는 옆 세션 0292_review_diary_schema 와 동일번호 충돌 → MIGRATION_HISTORY.md 명문화, 커밋 `24994f6`.)
- ✅ **알림 트리거 의사글 URL 통일(#1) 완료**(마이그 0298, 커밋 `f8ce542`): 신규 `card_public_url(card_id)`(getQaUrl SSOT 미러) → like/save/published/comment 트리거 canonical 저장 + 기존 21행 백필.
- ✅ **한국어 인코딩 깨짐 전면 교정 완료**(마이그 0298 동봉): 과거 CP949 경로 적용으로 깨진 함수 11종+코멘트3+notifications.message 15행을 정본 클린 한국어로 재적용(UTF-8 안전경로). 적용 후 전수 재스캔 U+FFFD **0**. 재발방지: 루트 CLAUDE.md §8 에 비-ASCII 마이그 UTF-8 적용 경고 추가. 13함수 독립 적대검증 13/13 + 검수 2명 진행.
- ✅ **#2 홈 SNS 캐싱 완료**(커밋 `6f0e813`+`dbe9164`): 비검색 홈 피드 풀(feed_cards_scored 300행)+리포트 풀(get_review_summary_pool)을 쿠키리스 anon `unstable_cache`(90s, home-feed/home-report 태그)로 분리. viewerStates 는 캐시 밖 SSR 오버레이 유지(per-user 비누출·N+1 없음). **전체 정적 ISR 은 홈이 searchParams 로 dynamic 이라 비대상** — 데이터 캐시가 실질 이득(원래 스코프 "viewerStates 클라 이전+ISR"은 useCardEngagement N+1 폴백·searchParams 로 비현실적 판단). 발행 9개 라우트에 revalidateTag(home-feed/report) 배선(독립검수 [치명]=태그 미연결 반영). 검수 1라운드(정합 clean / 엣지 [치명]→수정) 후 재검수 중.
- ✅ **viewerStates 완전 클라 배치 이전 완료**(커밋 `41230f1`): 홈 SSR 에서 viewer 좋아요/저장 prefetch 제거 → 신규 `GET /api/viewer-states`(SSOT 재사용) 로 FeedView 마운트 후 1회 배치(N+1 없음 — 홈 카드 `useCardActions` 는 self-fetch 없음). 비검색 홈 SSR 완전 사용자 무관·경량(auth 검색 분기 격리). useCardActions 동기화 effect(interactedRef 가드), SSR=클라초기=false 라 하이드레이션 불일치 없음. 독립 검수 2명 차단 0.
- **(남음)** #5b 시술후기 타임포인트 알림=디렉터 시점값 별도 지시 예정(옆 세션 0296 scheduled_notification dormant 적재됨). npm audit 잔여 13(디렉터 보류).
- **(주의)** 병행 세션: `local_96a85882`("총괄 디렉터…") 가 review/diary 통합 작업 중(`docs/plans/review-*.md`). 그 영역(시술후기/일기) 파일은 회피.

---

## 0-prev. 직전 세션 (2026-06-17 · 외부 검수 4-에이전트 + mockups 정규화·잔재 청소) — 한눈에

- **외부 검수**: 동일 프롬프트 4개 독립 서브에이전트로 5대 중점(베타 잔재/SSOT 정합/중복·누락/PII 유출/악성코드) 전수 검수. **결론: 운영 공개를 막는 [치명] 0건.** secret 클라 노출·PII anon 유출·악성코드(eval/postinstall/exfiltration) 없음. SSRF/CSRF/XSS 가드 견고.
- **반영한 청소** (커밋 예정):
  1. **mockups 정규화**: 잘못 명명된 `src/app/mockups/skin-diary/`(이름은 목업이나 운영 컴포넌트 포함)를 청산. 운영 `DiaryForm`(/write)·`RecordView`(/today)·`SummaryGroup/Item` → `src/components/skin/record/SkinDiaryForms.tsx` 이전. `NaverMap`/`ClinicMap`/`naver-maps`(미사용·향후 대비) → `src/components/skin/record/clinic-map/` 보존. 목업 데모 라우트 `page.tsx` 삭제 → **`/mockups` 라우트 제거**. 데모 전용·후기 컨트롤 死코드 클러스터(SkinDiaryMockup default·MockFab·ReviewOnlyForm·DetailView·NotiView·ReviewControls·ReviewFormBody·ProcedurePicker·StarField·FaceField·Chip·ChoiceField·EffectField + 옵션 const 6종 + 데모 더미 SUMMARY) 제거. import 7곳·robots·GlobalChrome 갱신.
  2. **잔재**: `*.tmp.*` 38개 삭제(git 미추적), `procedure-mappings.json.bak.260517` git rm, `.gitignore` 에 `*.bak` 규칙.
  3. **문서·주석 모순 정정**: PRD `cards.type` 4종, post-category 주석 v7 4종, BETA_CUTOVER_PLAN 헤더(완료→실상), weather·identity-shared·app.module.css 주석 경로/이름.
- **검증**: `tsc --noEmit` 0 · `npm run build` 0(클린 .next 재빌드, `/mockups` 부재·핵심 라우트 정상) · 코드검수관 [치명] 0(회귀 위험 없음 확인).
- **주의(병행 세션)**: 같은 작업 트리에서 다른 세션이 `tag-dictionary` 작업 진행 중(`src/data/tag-dictionary.generated.json` 수정 + `scripts/export-tag-dictionary-xlsx.py` 신규). 본 세션 커밋은 **겹치지 않는 파일만** stage. 또한 다른 세션의 `next dev` 가 `.next/dev` 점유 중 → `.next` 전체 삭제는 피하고 부분 캐시만 정리해 빌드.

### 남은 선택 청소(후속 안건 — 회귀 위험으로 보류)
- `SkinDiaryForms.tsx` 의 `Screen` 타입에 삭제 화면값(`reviewonly`/`detail`/`noti`) 잔존 + `ReviewState`/`DiaryProc` 의 미사용 후기 필드(satisfaction/pain 등) + `go("detail")` 폴백. 모두 死이나 `DiaryForm`/`RecordView` 의 상태·콜백 시그니처와 얽혀 별도 회귀검증 필요. (코드검수관 [경고], [치명] 아님.)

---

## 0-1. 그 이전 세션 (2026-06-16 · 하단바 개편 → /today·/notes 재구성 → beta 네이밍 전면 제거) — 한눈에

- **git**: HEAD = `9e3a627`. 5커밋:
  1. `b07da69` **하단 바 개편** — 5탭(투데이·내 노트·피드·쇼핑·마이) + 글쓰기 우하단 FAB(`WriteFab`). 라우트 이전(리다이렉트 없음): `/record`→`/today`, `/record/notes`→`/notes`, `/record/[id]`→`/notes/[id]`, `/record/weather`→`/weather`. /today 히어로(KPI 4종 내장: 내 노트·후기·글·댓글, '내 글에 달린 댓글'→'내가 쓴 댓글'). + **피드 인기태그 클릭 검색 버그 수정**(FeedSidebar `tagTab` sessionStorage 보존) + 원장 프로필 모바일 순서(프로필 먼저, 데스크탑 유지) + 날씨 주간 박스 간격·/weather 안내카드 우측칸.
  2. `0ced086` **/notes** — 모든 뷰(타임라인/달력/목록) 개별 기록 닫힌 글상자 기본 + "내 후기" 독립 섹션(닫힌 `ReviewBox`).
  3. `083f775` 문서 정합.
  4. `dde43f0` **날씨 카드 첫 표시 가속**(stale-while-revalidate + 측위 옵션 완화).
  5. `9e3a627` **'beta' 네이밍 전면 제거**(순수 리네임 ~100파일): `BetaSkinShell`→`AppShell`, `BetaNav`→`BottomNav`, `BetaSkinFeed`→`FeedView`, `BetaDiscovery`→`SearchPanel`, `BetaAdminXView`(14)→`AdminXView`, `beta-skin.module.css`→`app.module.css`, `BETA_ROUTES`→`ROUTES`, `/api/beta-discover`→`/api/search/suggest`, `components/beta/`→`components/search/` 등. `grep -rin beta src` 0건. `components/skin/` 폴더는 유지.
- **빌드**: 전 커밋 `tsc` 0 + `build` 0 + 코드검수관 [치명] 0. 신규 마이그 0(DB·권한·RLS 무변경).

### 이번 세션에 해소된 백로그
- ✅ `components/beta/` → `components/search/` 이동·정리(BetaDiscovery→SearchPanel, BetaFeed→FeedList). beta 네이밍 전면 제거.
- ✅ 피드 인기태그 클릭 검색 회귀(서브카테고리 탭 '전체' 리셋) 수정.

### 다음 세션 — 남은 백로그
**🟡 노트↔후기 DB 연결**: diaries(비공개)↔review 카드(공개) 직접 FK 없음. `diary_id` 등 연결 추가 시 /notes 각 노트 밑에 그 후기 노출(확장 지점 주석 마련: RecordNotesPanel 3뷰 + `RecEntry.linkedReviews`). 마이그 + 후기 폼 + 기존 데이터 처리 필요.

**🟡 구 `/record*` 308 리다이렉트(선택)**: 현재 리다이렉트 없이 폴더 교체라 옛 URL 404. noindex라 영향 작음. 필요 시 `next.config` redirects 추가.

**🟡 `[handle]` 스트리밍 soft-404 (HTTP 200)**: (이월) 비존재 핸들이 `notFound()` 호출에도 force-dynamic 스트리밍으로 200 반환. 색인 영향 점검 후 라우트 렌더 방식 검토.

**🟡 `.or()` 잔여**: (이월) `admin/users/page.tsx:111`(`,` 미이스케이프, admin 전용) + reports 게이트 정규식 SSOT 모듈화(`src/lib/procedure-slug.ts`).

**⚪ AppShell 라우트그룹 layout 승격 (대형)**: 셸이 페이지별 View 안에서 렌더 → 전환마다 재마운트 + `/api/notifications`·`prefetchDiscover` 반복. `app/(app)/layout.tsx` 승격은 페이지별 props 전달 설계 필요 — **ADR 후 별도 세션**.

**⚪ 경미(코드검수)**: old-skin `FeedList` 의 `ViewerState` 로컬 정의(SSOT 일원화), `SearchPanel` 의 `chip` 상수명 명확화(`chipCls`) — 무해·위생.

---

## 0-prev. 이전 세션 (2026-06-15 · 콘텐츠 라우트 4종 베타 셸 승격) — 한눈에

- **git**: 직전 커밋 `2a132aa`(핸드오프 갱신) 다음, 이번 4종 승격이 새 HEAD. 마이그 **0285** 까지 적용(이번 세션 신규 마이그 0 — 코드·표시·라우팅만, DB·권한 무변경).
- **빌드**: `tsc --noEmit` 0. 코드검수관 [치명] 0.

### 이번 세션에 한 일 (콘텐츠 라우트 4종 베타 셸 승격)
> 직전 세션 조사의 후속 실행. 옛 TopNav/SiteFooter 가 첫 페인트에 잠깐 보였다가 베타 오버레이가 덮던 라우트 4종을 베타 셸로 승격 → 첫 로딩부터 베타만 렌더(깜빡임 제거). 서브에이전트 2종(`/record/[id]`·`/write/[shortcode]`) 병렬 + 직접 2종(`/report`·`/shop`), 중앙 `GlobalChrome.tsx` 분기는 단일 소유로 일괄 편집. 운영 로직·DB·권한 무변경.

1. **`/record/[id]` 시술 기록 상세**: 서버 `page.tsx` 가 데이터·권한(RLS) 처리 후 신규 `DiaryDetailView`(`beta-skin/record/`)에 위임. `BetaSkinShell active="내 노트"` + detailHead(뒤로 `/record`). noindex 유지.
2. **`/write/[shortcode]` 글 수정**: admin·user 양 분기를 신규 `WriteEditShell`(`beta-skin/write/`, 얇은 `BetaSkinShell active="글쓰기" back={false}`)로 감쌈. 본문은 기존 `BackButton` 자체 렌더 유지(중복 방지). layout noindex 유지.
3. **`/report` 콘텐츠 신고**: 기존 `<InfoPageLayout>` 본문을 `<InfoBetaShell back={false}>` 로 감쌈(선례 `contact/page.tsx`). 메타·robots noindex·ReportForm 무변경.
4. **`/shop` 쇼핑(준비중)**: 신규 `ShopView`(`beta-skin/shop/`) — `BetaSkinShell active="쇼핑"` 안 "쇼핑 준비중" 카드. 검색 제출은 운영 홈(`/?q=`)으로 라우팅.
5. **`GlobalChrome.tsx` 승격 목록 확장**: `BETA_PROMOTED_EXACT` 에 `/shop`·`/report`, `BETA_PROMOTED_PREFIX` 에 `/record/`·`/write/` 추가. `RESERVED_FIRST_SEGMENT` 가 이미 record/write/shop/report 포함 → 핸들/숏코드 오매칭 없음. 21행 주석을 실제 동작에 맞게 갱신.

**시각 검수**: dev(localhost:3000)에서 `/shop`·`/report` 직접 확인(옛 크롬 없음, 탭 active, ReportForm 온전). 인증 게이트 라우트(`/record/[id]`·`/write/[shortcode]`)는 비로그인 시 `/login?next=...` 로 깔끔히 리다이렉트(로그인 페이지도 베타, 깜빡임 없음) → 코드 리뷰 + tsc + 리다이렉트 동작으로 대리 검증.

### 다음 세션 — 남은 작업 (우선순위순)

**🟡 P1⑦ 내 노트 날씨 카드 지연**
- `/record` force-dynamic + 무거운 SSR 로 날씨 카드까지 지연됨. Suspense 스트리밍 검토.

**🟡 P2⑨ BETA_CUTOVER_PLAN.md Phase 표 동기화**
- 홈·핵심화면·admin·콘텐츠 4종 승격 완료됐으나 Phase 1b~8 체크박스가 현행과 불일치.

**⚪ 이월(저우선·로드맵)**
- admin 나머지 화면 이식: 미이식분은 운영 `/admin/*` 링크(동작 O): `users`·`doctors`·`draft`·`reports`·`review-reports`·`tags`·`clinics`·`auth-errors`·`stats/[kind]`·`cards/[id]/edit`.
- 알림 `/notifications` 베타 화면(2탭 미구현).
- 성능 — 페이지 전환마다 BetaSkinShell 재마운트, 공용 layout 으로 셸 고정 검토.
- 계정명함 전환 카드(BetaProfileView 카드형 UI — 로드맵).
- **비차단 권고**: `ShopView` 의 `useBetaSearchRouting` 일관성 논점(런타임 무영향) · `WriteEditShell` 본문 BackButton ↔ 셸 `back={false}` 관계 회귀 방지 문서화.

**⚠️ 직전 P1 커밋(`1865ff2`) 시각 검수**
- P1④⑤⑥ 수정은 이번 세션에 dev 시각 확인 미완(이번은 4종 승격에 집중). 차후 확인 권장.

---

## 1. 현재 상태 (스냅샷)

- **git**: 직전 `2a132aa` 다음, 콘텐츠 라우트 4종 베타 셸 승격이 최신 HEAD.
- **DB 마이그**: **0285** 까지 production 적용 완료. (0269 `reviewed_at` · 0270 clinics[타 세션] · 0271 merge_tag en 승계 · 0280 top_cards 통계 RPC 게이트 완화 · 0282·0283 원장 9명 profile_data 정정 · 0284 award_points REVOKE · 0285 award_daily_login REVOKE[보안 감사])
- **빌드**: `tsc --noEmit` 0 + `npm run build` Compiled successfully.

### 태그 사전 DB SSOT 통합 (L-Phase2) — ✅ 완료
`procedure-mappings.json`·`procedure_taxonomy` 청산 → **DB `tag_dictionary` 단일 SSOT + 빌드 스냅샷**. 일반인·원장·관리자 글 저장이 단일 흡수 트리거로 정규화. (상세 ARCHITECTURE §10, TECH_SPEC §6.9, RUNBOOK §7.)

| 마이그 | 내용 |
|---|---|
| 0252 | service_role 테이블 GRANT (태그 저장 버그 해결) |
| 0253~0255 | rename_tag RPC · 온보딩 얼굴형 5종 · 등록 트리거 enum 수정 |
| 0256 | 온보딩 skin_type 7종 |
| 0257~0259 | procedure_taxonomy 청산(FK 재지정 + RPC 재작성 + DROP) |
| 0260~0261 | merge_tag RPC · 병합후보 무시목록 |
| 0262 | profiles 영문코드 → 한글 통일(관심 digest 매칭 부활) |
| 0263 | 자동등록 영문 태그 흡수 트리거 + slugify_en + tag_absorb_log |
| 0264 | JSON 사전 → DB 이관(aliases·pubmed_keywords 컬럼 + tag_blacklist·tag_normalization) |
| 0265 | 동의어 14건 병합 + 흡수 트리거 통일(헤르페스·단순포진 분리 유지) |
| 0266 | JSON orphan 2건(K-뷰티·1회적정량) DB 보강 |
| 0267 | auto-tag 추천 큐레이션 `is_recommendable`(804 시드) |
| 0268 | get_tag_admin_overview + is_recommendable 컬럼 |

- **JSON 완전 제거**: `procedure-mappings.json` 삭제. auto-tag·slug-mapping·schema/procedure·gen 전부 스냅샷 기반. (slug-mapping.ts 모듈은 유지, 데이터만 DB.)
- **태그 관리 UI**: '태그 매니저'→'태그 관리', 1000행 상한 해소(range 청크), 병합후보 섹션 제거. 'O' 작업으로 '자동추천' 열·부제 제거(데이터·큐레이션은 유지). 'P' 작업으로 요약 KPI 를 '전체 카드 목록' 탭형(하늘색·5항목: 전체·분류완료·영문 공란·시술 후기·부모 태그)으로 통일 + 대시보드 활동 통계 박스 높이 균일.

### 태그 검수 모델 — ✅ 최종형 (발주 K~N, 마이그 0269·0271)
`/admin/tags` 태그 관리 화면의 **확정된 검수 모델**. (중간에 폐기된 경로는 맨 아래 명시.)

- **저장 = 검수완료**: 어느 탭/상태든 행 '저장' → 편집 확정 + `reviewed_at=now()`. 편집 없이 눌러도 검수완료(옛 '잔류' 대체).
- **저장↔취소 토글**: 저장 직후 버튼이 '취소'로. 취소는 그 화면 머무는 동안만(클라 스냅샷, 새로고침·이탈 시 확정). 취소 시 편집 항목 전부 + `reviewed_at`을 저장 직전 값으로 통째 복원(rename 도 역방향). **'취소' 상태에서 재편집(dirty) 발생 시 버튼이 다시 '저장'으로 전환**(발주 M). 행마다 독립.
- **추천(`is_recommendable`)**: 전 상태 상시 표시 전역 컬럼(체크박스, draft 편집·저장 확정).
- **검색량·생성일**: 전 상태 상시 표시 전역 컬럼(헤더 정렬 가능).
- **이름 변경/병합 = 저장 경유**: 모달 [확인]은 행 draft 로 보류만(즉시 적용 없음), 행 '저장' 에서 확정. 입력 이름이 기존 태그면 병합(흡수).
- **병합(흡수) 데이터 처리**: 사용량 합산(카드 keyword 이관·중복제거) · 생성일·영문은 **기존 target 기준** · source 삭제(되돌릴 수 없음). 단 target 영문 공란 + source 영문 있으면 source 영문 승계(마이그 0271, 기존 영문은 절대 덮어쓰지 않음).
- **컬럼 11개 전 상태 동일**: 태그·분류·영문·부모·시술후기·온보딩·사용량·검색량·생성일·추천·관리. **검토 탭**(status=triage) = 미검토(분류=미지정 & `reviewed_at IS NULL`) 필터 + '검토완료 포함 보기'(`rv=all`) 토글 + 미검토 개수 KPI. 미지정(unspec) 화면은 일반 조회.

> **폐기된 중간 경로(최종 아님)**: 발주 G(검토 탭 검색량·생성일 → 추천·잔류 컬럼 치환) · 발주 I(즉시저장 전환·관리 칸 제거) · '검토완료(잔류)'/'되돌리기' 잔류 버튼 — 모두 **발주 K**(저장=검수완료 + 저장↔취소 토글)로 대체됨.

### 4-2 알림 — ✅ 완료 (마이그 0239~0245, kind 8종). 관심 digest cron 21:00 UTC=06:00 KST.
- **알림 설정 UI 일원화(발주 B·C)**: 별도 `/settings/notifications` 페이지·`NotificationPreferences` 컴포넌트 제거 → 정보수정(`/settings/profile`)으로 통합. 관심 알림 3개=섹션 '공개' 옆 '알림' 체크박스, 활동 알림=관심시술 밑 '🔔 활동 알림' 접이식 카드. 저장 키·API 불변. 프로필 페이지 전체 즉시저장(저장하기 버튼 제거).

---

## 2. 잔여 / 보류 항목

- **✅ Vercel `CRON_SECRET` 확인 완료(2026-06-07)**: production env 에 존재(encrypted). 관심 digest cron(`/api/cron/keyword-digest`, `0 21 * * *`=06:00 KST) Bearer 인증 정상.
- **미지정 거버넌스 — 도구 ✅ 완성 / 운영 작업 ⏳**: 트리아지 도구(검토 탭·`reviewed_at`·검수 모델 최종형)는 완성. 실제 **미지정 약 1,274개 솎기**는 운영 작업으로 점진 진행(대량 일괄 분류 기준은 별도 안건).
- **신규 추천 편입 방식**: `is_recommendable` 신규 태그 기본 false. 추천 편입은 현재 SQL UPDATE(관리 토글 제거). 운영 거버넌스(편입 기준·주기·UI) 미정.
- **4-3 OG 정비 — ⏸ HOLD**: 디렉터 OG 예시(레이아웃·문구) 대기. 확정 전 착수 금지.
- **FINAL 점검**: 배포 후 회원 글쓰기 자동태깅·토픽 URL·관심 digest 실데이터 동작 육안 확인(특히 로그인 필요한 admin 화면). 태그 검수 저장↔취소 토글 실동작도 로그인 세션에서 확인.

---

## 3. 불변 원칙 (재명시)

- **콘텐츠 본문 보존**: 태그·메타 정정이 본문(`body`)을 바꾸지 않는다. soft-delete(`deleted_at`)만, hard-delete·스크럽 금지.
- **사람 ID 컬럼 명명(ADR 0014)**: `author_id`(콘텐츠)/`profile_id`(그 외)/`auth_user_id`(묶음). `user_id` 신규 사용 금지(pre-commit hook 차단).
- **권한은 active 명함 단위(ADR 0011/0012)** — 묶음 합산 금지.
- **파괴적 DB 변경 자동 실행 금지**: DROP TABLE/TRUNCATE/대량 DELETE·secret 로테이션은 사용자 확인 후.
- **읽기전용 진단은 진단으로만** — SELECT/grep/함수정의 조회만, 트랜잭션·쓰기 0.
- **문서 동기화(CLAUDE.md §5)**: 마이그 추가 시 DATABASE↔CHANGELOG, 라우트 변경 시 PRD↔ARCHITECTURE 동시 갱신.

---

**이 문서 변경 시**: 세션 종료마다 "최종 갱신" 일자 + §1 스냅샷(커밋 해시·마이그 번호) 갱신.
