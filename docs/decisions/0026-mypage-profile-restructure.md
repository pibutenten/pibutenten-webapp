# 0026. 마이페이지·프로필 재편 — 설정 전용 라우트(/my/settings) 분리·skin 탭 이동·페이지별 캔버스 variant

- **Status**: Accepted
- **Date**: 2026-07-08
- **Related**: ADR 0012(명함 단위 독립), ADR 0015(온보딩 게이트·settings 정합 — §미래부담 정정 포함), 계획 SSOT `docs/plans/260708 리포트·마이페이지 UI 개편 계획서.md`(§3 D7·D9·D10·§5 Phase 0·3·4), `src/app/my/settings/page.tsx`·`src/lib/profile-settings-data.ts`·`ProfileView.tsx`·`MyPageView.tsx`·`AppShell.tsx`
- **마이그레이션**: 0건 — 전부 기존 스키마·RPC(`get_profile_pii` 등)·RLS 경로 재사용.

## Context

디자인팀 명세(전달용/260708 UI개편, PDF 7~11p)에 따라 마이페이지 1뎁스(/my)와 프로필 2뎁스(/[handle])를 개편하면서 세 가지 구조 결정이 필요했습니다.

1. **설정 동선** — 구 동선은 본인 공개 프로필(/{handle})의 '프로필·설정' 아코디언(`ProfileEditClient` 1,093줄 embedded + `ClinicLinksSection`)이었고, `/settings`·`/settings/profile` 은 그리로 redirect 하는 경유지였습니다. 신디자인 프로필 카드형 레이아웃에는 아코디언 자리가 없습니다.
2. **피부정보 상세(구 skin 탭)** — 프로필 6탭 중 '내 피부' 탭이 피부고민·관심시술·받은시술을 노출했으나, 신디자인은 프로필을 "작성물 중심"(필터 칩 + 카드 목록)으로 재편하고 피부정보 상세는 /my 의 "내 피부 정보" 접힘/펼침으로 옮겼습니다(Phase 3 선행 완료).
3. **페이지별 배경** — 신디자인이 화면마다 단색 캔버스(#F5FBFF 리포트 / #DAF1FB 마이 / #EAF2F8 프로필)를 지정했으나, 기존 앱 셸은 전 화면 공용 그라데이션 하나였습니다.

## Decision

### 1. 설정 전용 라우트 `/my/settings` 신설 (D9)

- `src/app/my/settings/page.tsx` — `noindex` 메타 + 비로그인 `/login?next=/my/settings` + 역할 redirect(admin→/admin, doctor→/doctor, clinic→/clinic — /my 패턴 준용) 후 `MySettingsView`(AppShell canvas="profile" + back) 안에서 `ProfileEditClient`(embedded=false, 계약 무수정)를 렌더.
- 데이터 조립은 구 `[handle]/page.tsx` 의 settings 블록을 **`src/lib/profile-settings-data.ts::buildProfileSettingsProps`** 로 추출(동작 불변: active 명함 기준 base SELECT + `get_profile_pii` RPC 병합 — PII 직접 SELECT 금지 유지, ADR 0015 §5 정합 그대로).
- `ClinicLinksSection`(연결된 병원 관리)은 파일 위치를 유지한 채 import 만 이 화면으로 이동, **무조건 렌더**(구 isOwner&&아코디언펼침 조건은 이 화면에선 항상 참 — 서버 게이트가 본인 한정).
- 탈퇴(typed-confirmation → `/api/me/delete`)는 `ProfileEditClient` 내장 footer 그대로.
- `/settings`·`/settings/profile` 경유지는 회원 목적지를 /{handle} → **/my/settings** 로 변경(아코디언 소멸로 구 목적지가 dead-end 가 되는 회귀 방지 — 투데이 키워드 등록·내 노트·온보딩의 기존 링크 4곳이 이 경유지에 의존).
- 라우트 지위: 최상위가 아닌 기예약 `my` 하위 → `RESERVED_FIRST_SEGMENT`·`reserved_handles`·robots.ts 갱신 불필요(계획서 §8 판정).

### 2. 프로필 2뎁스 재편 — skin 탭 제거·필터 칩 구조 (D7·D8·D10)

- `ProfileView` 를 6탭 → **프로필 카드(사진·이름·@handle·태그 3종·통계 3등분·본인 "프로필 수정" 버튼) + 필터 칩(본인 5: 내가 쓴 글/내 후기/내 댓글/좋아요/북마크 · 타인 3: 작성한 글/후기/댓글) + PostCard 목록** 으로 개편.
- **skin 탭 제거** — 피부정보 상세는 /my 로 이동 완료. 구 `?tab=skin` 딥링크 등 무효 탭값·비허용 탭(타인 likes/saves)은 기본 탭(posts) fallback.
- 태그 3종(연령대·얼굴형·피부타입)은 `get_profile_pii` RPC 반환값 기반 서버 계산 — 타인 `field_visibility` 필터는 RPC 가 적용, anon 은 PII 미조회로 미표시. likes/saves 는 owner 전용(RLS 정합) 유지.
- **타인 FollowButton 유지**(D8 — 시안 미표기는 생략이지 제거 지시가 아님) + 타인 헤더 ⋯ 메뉴(신고하기 → /report).
- **AccountSwitcherCard 는 본인 화면에 유지**(D10 — full reload 전제 컴포넌트 그대로 재배치만).

### 3. 페이지별 캔버스 variant (Phase 0 선행 — 본 ADR 로 문서화)

- `AppShell canvas?: "report" | "my" | "profile"` prop — app.module.css 의 variant 클래스가 `--tt-canvas`/`--tt-canvas-top` 변수만 재정의해 상태바 필러·헤더·sticky 칩이 자동 추종. 미지정 화면은 현행 그라데이션 그대로(추가형 — 기존 화면 무영향).

## Consequences

- **(+) 설정 UI 단일화** — 설정 진입점(마이 "정보 수정/앱 설정/탈퇴하기"·프로필 "수정/프로필 수정"·구 /settings 링크)이 전부 /my/settings 한 화면으로 수렴. `ProfileEditClient`·저장 API·탈퇴 흐름은 무수정 재사용이라 회귀 표면 최소.
- **(+) 프로필 페이지 경량화** — /{handle} 서버 렌더에서 설정 조립(profiles SELECT + PII RPC)·skin 탭용 `procedure_reviews` prefetch 가 빠져 쿼리 2+1건 감소.
- **(+) PII 경로 불변** — 모든 PII 는 `get_profile_pii` RPC 경유(직접 SELECT 0건 유지, 마이그 0335 REVOKE 정합).
- **(−) 구 `?tab=skin`·구 아코디언 북마크 사용자** — 딥링크는 posts fallback, 설정은 한 번 더 이동(/my/settings)이 필요. noindex 영역이라 SEO 영향 없음.
- **(−/주의) ProfileView props 계약 변경** — `skinInfo`·`settings` 제거, `ageGroupLabel`·`faceShapeLabel`·`skinTypeLabel`·`visibility` 추가. 소비처는 `[handle]/page.tsx` 단일이라 파급 없음.
- **(참고) anon 뷰어의 탭 visibility 미적용은 기존 동작 그대로 보존** — 구 코드도 anon 에겐 field_visibility 를 전달하지 않아 전 탭이 보였음. 정책 변경(비로그인에게도 tab_* 숨김 적용)은 별도 안건.
