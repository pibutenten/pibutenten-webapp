# 감사 권고 구현 — 최종 보고서 (2026-06-26 ~ 27)

> 2026-06-26 6-에이전트 종합 감사(별도 보고서 `2026-06-26-six-agent-audit.md`)에서 도출한 권고를 디렉터 승인하에 Wave 단위로 구현·배포한 기록. 각 Wave: 서브에이전트 분석 → 단계별 `tsc`/`build` 검증 → 독립 검수관 → 커밋·푸시. 모든 변경은 `origin/main` 배포(Vercel 자동).

---

## 1. 한눈에

- **감사**: UX 2 · 구조 2 · 코드 2 독립 평가 + 적대적 검증(14 에이전트) → 46 발견. 안전·정합 확실 항목은 직접 수정·배포, 제품 결정 항목은 디렉터 승인 후 Wave 구현.
- **결과**: 접근성·런타임 안전·성능·죽은코드·문서정합 + **네비 단일화 · 댓글 N+1 제거 · 홈 캐시 · 팔로우 기능** 까지 완료·배포.
- **검증**: 단계별 `tsc`/`next build` + 독립 검수관 **연 8명**(Wave별 2명 + 팔로우 2라운드 4명) → 최종 잔여 결함 **0건(치명 0)**.
- **병행 세션 조율**: 옆 세션(글쓰기/nav-guard, 이후 review/diary 통합)과 **파일 경계 완전 분리** — 제 파일만 명시 stage, 충돌 0.

---

## 2. 완료·배포 항목 (커밋 시간순)

### 2.1 감사 일괄 정비 — `ce56896` (+ 보고서 `22f77aa`)
- **접근성(WCAG 2.4.7)**: `globals.css` 의 전역 `outline:none !important` 가 키보드 포커스 링까지 꺼버리던 것을 `:focus:not(:focus-visible)` 로 좁혀 복원(마우스 잔상은 계속 제거).
- **런타임 안전 5종**: ScrollManager·admin/draft/publish·search/suggest·middleware 의 미보호 지점에 try/catch + 온보딩 만14세 게이트 로컬자정 파싱(경계일 오판 방지).
- **성능 2종**: 피드 카드별 `auth.getUser()` N+1 → SessionContext 단일화(`ui.tsx`), 저장 토글 후 중복 카운트 재조회 제거(`useCardEngagement`).
- **죽은 코드·사장 의존성**: 미사용 모듈 5종(auto-tag·doctor-dashboard·me-cache·dialog/Dialog·clinic-map) 삭제 + leaflet 3종 제거.
- **문서·주석 SSOT 정합**: ARCHITECTURE §8/§11·ROADMAP·README·procedure_taxonomy 잔존 주석 정정.

### 2.2 Wave A — 신고사유 SSOT + old-skin 제거 — `9b26ecc`
- 신고 사유 9종이 폼·앱모달·관리자·API **4곳에 따로 정의**(라벨 제각각: harassment 3가지 표기)되던 것을 `lib/report-reasons.ts` 단일 출처로 통합(zod enum·라벨맵·옵션 파생). 이후 `c8f902d` 로 `as const satisfies` 의 hint 타입에러 정정(Vercel 클린빌드 안전).
- `/old-skin` 박제 3라우트 삭제(robots·route-class 등록 포함).

### 2.3 Wave F — 네비게이션 단일화(AppShell) — `048c770` + `8faf7f0`
- **현재 버그 수정**: `/write`·`/review` 작성 중 AppShell 헤더·탭을 누르면 이탈 모달 없이 작성 내용이 소실되던 회귀(nav-guard 가 옛 BottomNav 링크에만 걸려 있었음). **`GuardedLink`(SSOT)** 신설 — AppShell 6개 내비 링크에 가드 통일 배선.
- **삭제**: 옛 `TopNav`·`BottomNav`·`IdentitySwitcher`·`NotificationsBell`(전부 import 0건). 명함 전환=`AccountSwitcherCard`로 대체 확인, 알림벨=AppShell 인라인. `SessionInfo`/`SessionIdentity` 타입 → `lib/session-types.ts` 중립 모듈. `GlobalChrome` ChromeHeader 제거(ChromeFooter 유지).
- **데스크탑/모바일/네이티브 3관점 정밀 매핑(독립 3에이전트)** 으로 AppShell 이 모든 기능을 이미 커버함을 확인 후 제거. 검색 진입도 단일 경로로 수렴.

### 2.4 Wave B — 댓글 미리보기 N+1 제거 — `7c67acb`
- 피드가 카드마다 `/api/comments?cardId=`(스크롤 시 카드 수만큼)을 호출하던 것을 **페이지(~20장)당 1회 배치**(`/api/comments/preview`)로 대체(인스타·페북식). 미리보기 3개 + 댓글 수 배지는 유지(댓글은 `comments` 테이블 그대로 — SSOT 유지). 💬 클릭 시에만 전체 로드.
- 마이그 0289 RPC `get_cards_comment_preview_meta`(카드별 총 visible 수 + 인기순 top3 root id, SECURITY INVOKER). `CommentsBlock` seed prop + `FeedView` 배치 + `PostCard` `batchedPreview` 게이트(N+1 경쟁 차단, 비배치 페이지는 기존 동작).

### 2.5 Wave D — 홈 인기태그 중복 RPC 제거 — `d22c713`
- 홈/검색이 매 요청마다 `feed_cards_scored`(300행)를 인기태그 집계용으로 한 번 더 호출하던 것을 쿠키리스 anon + `unstable_cache`(5분)로 분리해 제거. 피드 본문 RPC(jitter, 매 방문 신선)는 불변. (전체 홈 ISR 은 viewerStates 클라 이전이 선행 — 별도 단계.)

### 2.6 Wave C — 팔로우/구독(원장·회원 상호) — `4657ea6` + 정정 `132bf79`
- **명함(profile.id) 단위 상호 팔로우.** 회원·의사 **완전히 동일한 방식**: `follows` 테이블 1개 · `toggle_follow`/`get_my_follow` RPC · `FollowButton` 컴포넌트 1개. (의사 페이지만 `doctors` 표 출발이라 `profiles.doctor_id` 1:1 조회로 명함 id 1회 확보 — 동작은 회원과 동일.)
- **발행 알림**: 마이그 0290 트리거 `on_card_publish_for_followers` — 팔로우 대상이 글 발행 시 follower 들에게 `follow_post` 알림 개별 INSERT(자기자신 skip, INSERT/UPDATE 양 경로, `OLD.status IS DISTINCT FROM` 으로 NULL 안전). **트랜잭션 ROLLBACK 으로 트리거를 실증한 뒤 적용**(이 과정에서 `COALESCE(OLD.status,'')` enum 캐스트 버그를 사전 발견·수정 — 적용했으면 전체 카드 발행이 깨졌을 결함).
- **검수 정정(0291)**: 0290 의 `follows_select_public` RLS 정책이 SELECT GRANT 부재로 무효(죽은 정책)임을 독립 검수관이 발견 → follows 를 **RPC-only** 로 확정(정책 제거; who-follows-whom 직접 열람 차단).
- **알림 묶기(#4)는 별도 구현 불필요** — 0083 트리거가 좋아요/저장을 24h 내 "○○님 외 N명"으로 이미 그룹핑(감사 SNS-1 은 클라만 보고 DB 트리거를 놓친 오진).

---

## 3. 검증

- **빌드/타입**: Wave별 `npx tsc --noEmit` + `next build`(클린 `.next`) exit 0. 마이그는 production 적용 전 트랜잭션 ROLLBACK 또는 함수/제약 직접 조회로 검증.
- **독립 검수관**: 감사 정비 2 + 6-에이전트 검증 + Wave별 2 + 팔로우 **2라운드 4명**(SSOT·명명·동기화 / 트리거·RLS·회귀 / 정정·잔여 / 전체 배포 정합). 모두 production 실측 대조.
- **최종 판정**: 치명·높음 **0건**. 잔여는 정보성/위생(아래 후속) 또는 기존 코드 항목.

---

## 4. 디렉터 결정 반영
쇼핑 탭 유지(기능 추가 예정) · 온보딩 "최대한 받기" 유지(칩 기반, 손 안 댐) · 검색=어느 아이콘이든 같은 화면(BottomNav 중복 제거로 수렴) · 팔로우=원장·직원 상호 · 댓글 미리보기 3개 유지.

---

## 5. 후속·보류 (디렉터 판단/별도 안건)
1. **알림 트리거 SQL 의사글 URL 통일**: 기존 트리거(like/comment/published 등)는 의사글도 `/{handle}/{shortcode}`(비-canonical)로 링크. follow_post(0290)는 canonical `/doctors/{slug}/{year}/{post_slug}` 로 **올바름**. 공유 SQL 헬퍼 `card_public_url` 로 SQL측 URL SSOT 수렴 권장(여러 기존 트리거 수정이라 별도 안건).
2. **전체 홈 ISR(PERF-3)**: viewerStates(내 좋아요/저장 prefetch)의 클라 배치 이전이 선행. 그 후 홈 셸 ISR 화로 LCP 추가 단축 가능.
3. **#5b 시술후기 타임포인트 유도 알림**: 시술 후 며칠/몇주/몇달 시점에 후기 추가 유도 — **디렉터가 시점값 별도 지시 예정**.
4. **(선택)** follow_post 알림 끄기 토글 + NotificationsClient 팔로우 필터 칩(현재 "전체" 탭엔 정상 노출).
5. **npm audit**: 비파괴 fix로 17→13. 남은 13은 firebase-admin·@capacitor/assets 메이저 업(breaking) 필요 — 푸시 알림 런타임 핵심이라 별도 테스트 후 결정.
6. **(정보)** follows 행은 회원 탈퇴(익명화=마스킹) 시 잔존 — `card_saves`/`card_likes` 와 동일한 프로젝트 공통 soft-delete 설계(고아 아님, FK 충족).

---

## 6. 병행 세션 조율
세션 내내 옆 세션과 같은 작업 트리를 공유. **제가 바꾼 파일만 명시 stage**(`git add -A` 금지), 의존성은 `--package-lock-only`, 생성물(`tag-dictionary.generated.json`)은 `checkout` 으로 되돌려 경계 유지. 옆 세션의 글쓰기/nav-guard·review/diary 파일과 충돌 0. 컨텍스트 압축 대비로 `SESSION_HANDOFF.md §0` + 메모리에 진행 상황·블루프린트를 영속 기록.
