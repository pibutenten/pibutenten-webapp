# 베타스킨 → 운영 공개 전환 (BETA CUTOVER) 실행 계획

> 베타스킨 디자인을 운영 본체로 승격하는 다세션 작업의 단일 출처. 세션이 끊겨도 이 문서로 이어간다.
> 상세 변경 이력은 `CHANGELOG.md`, 세션 인수인계는 `SESSION_HANDOFF.md`.

**시작**: 2026-06-14 · **상태**: 진행 중 (Phase 1~6 승격 완료 · Phase 1b 일부·7·8 잔여)

---

## 0. 사용자(원장) 확정 결정 — 변경 금지

1. **admin 범위 = 옵션 B**: 관리자 화면(`/admin/*`)은 **전 과정 무수정**. 사용자 화면만 베타로 교체.
2. **원장 대시보드(`/doctor`) = 베타 포함**, 단 **관리자 재설계 방식**(상단바만 베타, 본문은 운영 형태 유지, 큰 글상자 지양).
3. **승격 방식 = 파일 물리 이동 기반** (베타 → 운영 경로, 옛 운영 → `/old-skin`).
4. **미적용 화면 범위 = 전부 (완전 교체)** — 사용자 대면 전 화면을 베타로.
5. **틀 구조 = 전역 셸(길 A)** 지향. 단 실행은 **오버레이 유지로 화면 단위 점진 이전**, 맨 마지막에 전역 셸로 정리(저위험).
6. **공개 전환까지 전부 일임** — 운영에 직접 배포. 빌드 실패 시 고쳐서 배포. (회원=직원뿐이라 라이브 리스크 낮음. 원장이 운영에서 직접 링크 깨짐 점검.)
7. **톤**: 이상하고 과도하게 바꾸지 말 것. 자연스럽게, 기존 느낌 유지.

## 0-1. 진행 원칙 (필수)

- 단계마다: 구현(서브에이전트) → `tsc --noEmit` + `npm run build` 통과 → **모든 공개 화면 실제로 띄워 스크린샷 검증** → 코드검수관·SEO검수관 다중 검토 → 최종 점검 → **녹색일 때만** commit + push(배포).
- 빌드 깨지면 배포 금지(학력·경력 사고 재발 방지 — 실데이터 육안 확인 포함).
- 단계마다 git commit(되돌릴 안전망). 파괴적 DB 변경 없음(이번 작업은 코드/라우트 중심).

---

## 1. 핵심 기술 사실 (인벤토리)

### 루트 레이아웃 `src/app/layout.tsx`
- 전역 크롬: `TopNav`(src/components/TopNav.tsx) + `SiteFooter`(src/components/SiteFooter.tsx) + `SessionProvider`(src/lib/session-context.ts).
- `<main className="mx-auto max-w-[1080px] ...">` 안에 children. force-dynamic 아님(공개 콘텐츠 ISR).

### 베타 셸 `src/app/beta-skin/BetaSkinShell.tsx` (use client, 677줄)
- **fixed inset:0 z-100 오버레이** → 루트 TopNav/SiteFooter/main 을 시각적으로 덮음. (→ 화면 단위 점진 이전 가능: 옮긴 페이지만 오버레이가 옛 크롬을 가림.)
- props: active("내 노트"|"피드"|"글쓰기"|"쇼핑"|"마이") · children · chips · sidebar · sidebarMobileBelow · back · wide(admin 풀폭) · searchValue/onSearchChange/onSearchSubmit.
- `BETA_ROUTES` 상수에 `/beta-skin/*` 하드코딩(record/feed/write/shop/my). 알림 벨은 `/notifications`, 로그인 `/login`.

### 베타 라우트 11개(page.tsx) + 대응 운영
| 베타 | 컴포넌트 | 운영 대응 |
|---|---|---|
| `/beta-skin` | BetaSkinFeed | `/` (운영은 BetaFeed = 다른 컴포넌트) |
| `/beta-skin/record` | RecordView | `/record` |
| `/beta-skin/write` | WriteView | `/write` |
| `/beta-skin/post` `/post/[...slug]` | PostDetail | `/[handle]/[shortcode]` + `/doctors/[slug]/[year]/[postSlug]` (+`/cards/[id]`) |
| `/beta-skin/my` | MyView | `/my` (역할분기) |
| `/beta-skin/u/[handle]` | BetaProfileView | `/[handle]` (+ 설정 아코디언 = `/settings/profile`) |
| `/beta-skin/settings` | (redirect) | `/settings` |
| `/beta-skin/admin*` 3종 | BetaAdmin* | `/admin*` — **옵션 B라 폐기/무시** |

### 베타 미적용 사용자 화면 (= 새로 베타화 필요)
- **공개 SEO**: `/doctors`(목록) · `/doctors/[slug]`(의사프로필, 학력·경력 깨짐 버그 났던 곳) · `/topics/[tag]` · `/reports/[procedure]`
- **로그인 유틸**: `/notifications` · `/search`(운영 별도? 베타는 `/?q=`) · `/review/new` · `/review/[shortcode]/edit` · `/record/[id]` · `/write/[shortcode]` · `/u/[id]`
- **원장**: `/doctor` (관리자 방식으로 신규)
- **신뢰·법적**: `/about` `/terms` `/privacy` `/contact` `/disclaimer` `/editorial-policy` `/medical-review` `/corrections` `/disclosures` `/doctor-guidelines`
- **진입**: `/login` `/login/conflict` `/signup` `/onboarding`
- **기타**: `/shop`(준비중)

### 글상세 라우트 3개 (물리 이동 불가 → 디자인 이식)
- `/[handle]/[shortcode]`(회원) · `/doctors/[slug]/[year]/[postSlug]`(의사 SEO) · `/cards/[id]`(숫자).
- 베타는 `/beta-skin/post/[...slug]` 단일 + `renderBetaPost`(post-data.tsx). → 운영 3라우트 각각에 `renderBetaPost`/`PostDetail` 본문을 이식.

### 링크 재배선 범위
- `beta-skin` 문자열 26개 파일 123곳. 대부분 베타 폴더 내부(상대 import + `/beta-skin/*` 링크). 비-베타: `src/lib/record-data.ts`, `src/components/beta/BetaDiscovery.tsx`(basePath), `src/app/robots.ts`.

### noindex 2겹
- `robots.ts` `DISALLOW_COMMON` 에 `/beta-skin` 라인(승격 시 제거 + `/old-skin` 추가).
- 각 베타 page metadata `robots:{index:false}`(승격 시 운영 정책으로).

### 데이터 사고 기록 (해결됨)
- 직전 세션 마이그 0282 적용 시 한글 인코딩 깨짐 → 원장 9명 학력·경력 mojibake. 2026-06-14 UTF-8 파일전송(`curl --data-binary @file`)으로 정정 완료. **교훈: Management API 로 한글 SQL 보낼 때 inline `-d` 금지, 반드시 UTF-8 파일 `--data-binary @`.**

---

## 2. 전환 메커니즘 (저위험 점진 방식)

1. **링크 재배선**: `BETA_ROUTES` 및 모든 `/beta-skin/X` 링크 → 운영 경로(`/X`). 베타 컴포넌트가 운영 경로를 가리키게.
2. **화면 단위 승격**: 각 운영 page.tsx 가 베타 컴포넌트(본문)를 렌더하도록 교체. 베타 셸 오버레이가 옛 TopNav 를 덮으므로 루트 레이아웃 무수정으로 공존 가능.
3. **옛 디자인 보관**: 옛 운영 본문 → `/old-skin/*` (전체 noindex). (우선순위 낮음 — 옛 디자인은 git 에도 보존. 마지막 단계.)
4. **미적용 화면 신규 베타화**: 위 목록 전부.
5. **최종 정리**: 오버레이 → 루트 레이아웃 전역 셸로 통합 + 옛 TopNav/SiteFooter 정리 + 베타 noindex 해제 + canonical 운영 URL + robots `/beta-skin` 제거·`/old-skin` 추가.

---

## 3. Phase 진행표 (체크리스트)

> 체크 기준 = `GlobalChrome.tsx` 승격 목록(EXACT/PREFIX/정규식) 실측 대조. 승격 = 옛 TopNav/SiteFooter 가 해당 경로에서 `null`.

- [x] **Phase 1** — 홈(/) 피드 승격(BetaSkinFeed) + 핵심 링크 재배선(BETA_ROUTES·검색·글쓰기). 빌드·검수·배포 완료 (커밋 `e96b347`, 2026-06-14).
- [~] **Phase 1b** — 핵심화면 승격: 마이(/my)✓·내노트(/record)✓·글쓰기(/write)✓·공개프로필(/[handle], 정규식)✓ — 승격됨. **단 `/settings` 미승격(옛 크롬 유지)** → POLICY-1 잔여(별도 안건). 나머지 완료.
- [x] **Phase 2** — 글상세 베타 본문 이식: 회원 `/[handle]/[shortcode]`(정규식)✓ · 의사 `/doctors/[slug]/[year]/[postSlug]`(4세그)✓. `/cards/[id]`·`/u/[id]` 는 canonical/핸들로 302 redirect 라우트라 승격 대상 아님(N/A).
- [x] **Phase 3** — `/doctor` 원장 대시보드 베타(관리자 방식). EXACT 등록✓.
- [x] **Phase 4** — 공개 SEO: `/doctors`(EXACT)✓ · `/doctors/[slug]`(2세그 정규식)✓ · `/topics/`(PREFIX)✓ · `/reports/`(PREFIX)✓.
- [x] **Phase 5** — 유틸·후기: `/notifications`✓ · 검색(`/?q=`)✓ · `/review/`(PREFIX)✓ · `/record/`(PREFIX)✓ · `/write/`(PREFIX)✓. `/u/[id]` 는 redirect(N/A).
- [x] **Phase 6** — 신뢰·법적·진입: trust 10종(`/about`~`/doctor-guidelines`)✓ · `/login`·`/login/conflict`✓ · `/signup`✓ · `/onboarding`✓ · `/shop`✓ · `/report`✓.
- [~] **Phase 7** — `/old-skin` 보관 + noindex. **현재 `record`·`write` 만 백업**(부분). 나머지 옛 본문 백업 잔여. (우선순위 낮음 — 옛 디자인은 git 보존.)
- [ ] **Phase 8** — 전역 셸 통합(오버레이→루트 레이아웃) + 베타 noindex 해제 + canonical 운영 URL + robots(`/beta-skin` 제거·`/old-skin` 추가) → **공개 전환 완료**.

> 범례: `[x]` 완료 · `[~]` 부분 · `[ ]` 미착수.

각 Phase: 구현 → 빌드 → 공개화면 스크린샷 검증 → 다중 서브에이전트 검토 → commit+push(배포) → 이 표 체크 + CHANGELOG 기록.

---

## 4. 현재 상태 / 다음 작업
- git HEAD = `92181be` (사용자 대면 핵심 라우트 베타 승격 완료) · 마이그 0285 까지 적용.
- **승격 완료**: Phase 1·2·3·4·5·6 — 사용자 대면 라우트는 거의 전부 `GlobalChrome.tsx` 승격 목록에 등록됨(옛 크롬 미렌더).
- **잔여**:
  1. **Phase 1b 잔여** — `/settings`(설정) 미승격, 옛 크롬 유지. POLICY-1(설정/프로필) 잔여 안건과 묶어 처리.
  2. **Phase 7** — `/old-skin` 옛 본문 백업이 `record`·`write` 만 완료. 나머지 라우트 옛 본문 백업 보강(우선순위 낮음, git 보존됨).
  3. **Phase 8(공개 전환)** — 오버레이 셸 → 루트 레이아웃 전역 셸 통합 + 베타 noindex 해제 + canonical 운영 URL + robots 갱신. **구조 변경이라 §0-1 절차(빌드·전수 스크린샷·다중 검수) 후 별도 진행.**
- **비-셸 구조 안건(조사 완료 2026-06-15)**:
  1. **관리자(`/admin`) 이식 — 작업 불필요(완료)**. 전 15라우트(`/admin`+하위 12+상세/수정 2)가 이미 `BetaAdminXxxView`(BetaSkinShell `active="마이" wide`)로 승격됨. GlobalChrome 에 `/admin` EXACT + `/admin/` PREFIX 등록 확인.
  2. **`/record` 본문 SSR Suspense 스트리밍 — 구조 리팩터(계획 승인 필요)**. 현 `force-dynamic` + 멤버분기 `Promise.all` 8쿼리가 `"use client"` RecordView props 로 직렬화됨. 분리하려면 본문 섹션(노트/키워드/인기)을 async 서버 컴포넌트 3~4개로 쪼개 `<Suspense>` 래핑, auth·identity·profile·관심사는 page 상단 유지. 신규 3~4파일 · TTFB/FCP −40~50% 기대 · 회귀 위험(하이드레이션 불일치·RLS 스코프·CLS) 있음.
  3. **계정 전환 카드 — Case C 소규모(전환 로직 이미 완비)**. IdentitySwitcher(헤더)+AccountSwitcherCard(본문) + `/api/identity/switch` 이미 구현. `/beta-skin/my` 는 AccountSwitcherCard 임베드 완료. 잔여는 BetaSkinShell 헤더 아바타(이동 전용)를 `<IdentitySwitcher>` 로 교체(1파일 ~20줄, 서버/DB 무변경).
