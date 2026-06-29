# 0025. `/reports` 인덱스↔상세 공유 layout(상단바·사이드바 persist, 좌측 본문만 교체)

- **Status**: Accepted
- **Date**: 2026-06-29
- **Related**: ADR 0024(정식 승격), ADR 0020(공유 셸 + 클라 개인화), `app/reports/layout.tsx`·`ReportsShell.tsx`·`category-context.tsx`·`reports-pool.ts`

## Context

정식 승격(ADR 0024) 직후, 오너가 "리포트 보러가기를 누르면 상단바와 우측 글상자는 그대로 있고 **좌측 본문만** 리포트로 바뀌면 되는데, 화면 전체를 다시 불러와서 너무 느리다"고 지적했습니다.

당시 `/reports`(인덱스)와 `/reports/{ko}`(상세)는 각자 `page.tsx → 뷰 컴포넌트` 안에서 `AppShell`(상단바·우측 사이드바)을 **개별 렌더**했습니다. 따라서 인덱스↔상세 이동 시 App Router 가 새 페이지를 그리며 `AppShell` 까지 통째로 재마운트 → 상단바·사이드바가 깜빡이고, 매 진입 force-dynamic + 집계 RPC 를 다시 기다려 전환이 무거웠습니다.

목표는 **상단바·우측 사이드바를 이동 내내 유지(persist)하고 좌측 본문(children)만 교체**하는 것입니다. 단, SEO 자산(각 `page.tsx` 의 generateMetadata·JSON-LD·canonical·en→ko 308)은 0024 대로 무손상이어야 합니다.

검토한 방식:

- **(A) 페이지별 AppShell 유지(현행)** — 가장 단순하나 이동마다 셸 재마운트 = 깜빡임·느린 체감. 오너 요구 미충족.
- **(B) 공유 layout 셸** — App Router 의 `layout.tsx` 는 자식 라우트가 바뀌어도 재마운트되지 않는 특성을 이용. `layout.tsx`(서버) → `ReportsShell`(클라) → `AppShell` → `{children}`(서버 page) 트리로, 셸을 layout 으로 올리고 page 는 본문만 렌더.

## Decision

**(B) 공유 layout 셸** 을 채택합니다.

1. **`app/reports/layout.tsx`(서버, `force-dynamic`)** — 풀을 `getReportsPoolCached()`(`reports-pool.ts`, React `cache()` = **요청 단위 메모이즈**)로 1회 로드해 상위 시술을 뽑고, `<ReportsShell>{children}</ReportsShell>` 로 감쌉니다. **메타·JSON-LD 는 두지 않습니다**(각 page 보유 = SEO 무손상, 0024).
2. **`app/reports/ReportsShell.tsx`(클라)** — `AppShell`(상단바·우측 `ReportsIndexSidebar`)을 렌더해 인덱스↔상세 내내 persist. 상세에서만 사이드바 `footer` 로 `ReportShareButtons`(저장/공유)를 전달합니다.
3. **`category-context.tsx`** — 카테고리 필터 상태는 URL 파라미터로 두면 RSC 재요청·재렌더가 일어나므로, `ReportsCategoryContext`(클라 상태)로 공유합니다(셸 persist 유지).
4. **page 들은 본문 뷰만 반환** — `page.tsx`(인덱스)·`[procedure]/page.tsx`(상세)는 `AppShell` 래퍼를 벗고 `ReportsIndexView`/`ReportsDetailView`(콘텐츠)만 렌더. SEO 코드는 그대로.

## Consequences

- **(+) 셸 persist** — 인덱스↔상세 이동 시 상단바·우측 사이드바가 유지되고 좌측 본문만 교체 → 깜빡임 제거, 전환 체감 개선(오너 요구 충족).
- **(+) SEO 무손상** — 메타·JSON-LD·canonical·308 이 page 에 그대로라 0024 의 색인 자산이 유지됩니다. layout 은 메타 미관여.
- **(+) 풀 중복 호출 완화** — `getReportsPoolCached`(React cache) 로 같은 요청 안에서 풀 조회를 메모.
- **(−/한계) 근본 로딩속도는 미해결** — force-dynamic + 집계 RPC 의 절대 시간(≈0.8s)은 셸 persist 로 **체감만** 줄었을 뿐 줄지 않았습니다. ISR/쿼리 최적화는 **별도 안건**.
- **(−/회귀→수정) 스크롤 컨테이너 persist** — 실제 스크롤은 `AppShell .root`(overflow-y:auto)에서 일어나는데, 셸이 persist 되며 인덱스의 스크롤 위치가 상세로 남아 "맨 위가 아닌 곳에서 시작"하는 회귀가 생겼습니다(앱의 `ScrollManager` 는 `window` 만 관리 = `.root` 미관여가 근본원인). `ReportsDetailView` 마운트 시 가장 가까운 스크롤 조상(`.root`)을 찾아 `scrollTop=0` 으로 리셋해 해결(공용 `AppShell`/`ScrollManager` 미변경). 단 **detail→index 뒤로가기 시 인덱스 스크롤 복원은 미적용**(동일 `.root` 미관리) — 추후 `ScrollManager` 를 `.root` 대상으로 일반화하는 별도 작업으로 정리.
- **(대안 비교) (A) 를 버린 이유** — 페이지별 셸은 구현이 단순하나 오너가 명시한 "좌측만 교체" UX 를 구조적으로 만들 수 없습니다(셸 재마운트 불가피). (B)가 layout persist 로 이를 보장합니다.
