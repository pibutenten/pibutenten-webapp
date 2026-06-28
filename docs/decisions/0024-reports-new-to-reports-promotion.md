# 0024. `/reports-new` 신디자인을 정식 `/reports` 로 승격 (SEO 셸 보존)

- **Status**: Accepted
- **Date**: 2026-06-29
- **Related**: 마이그 0322 (`get_review_author_demographics`), ADR 0019/0023 (시술 후기·리포트), ADR 0017 (자기 절대 URL 금지)

## Context

시술 리포트(`/reports` 허브 + `/reports/{ko}` 상세)의 비주얼 리디자인·회전 헤드라인 엔진은 운영 `/reports` 를 건드리지 않기 위해 별도 staging 라우트 `/reports-new` 에서 개발했습니다(2026-06-28 시점 "추후 이식 예정"). 이식 단계에서 두 가지를 동시에 만족해야 했습니다.

1. **SEO 자산 무손실** — 옛 `/reports` 는 generateMetadata(title absolute·desc 라이브 수치·robots 자격 0건 noindex), JSON-LD(인덱스 CollectionPage/ItemList, 상세 MedicalWebPage/Service/AggregateRating/BreadcrumbList), canonical 한글 URL, 영문 en→ko 308 미들웨어를 이미 갖추고 있었습니다. 색인 자산이라 손실 시 SEO 회귀가 발생합니다.
2. **이전 미리보기 링크 보호** — `/reports-new` 미리보기 URL 이 외부에 공유됐을 수 있어 깨진 링크를 남기지 않아야 합니다.

또한 상세 후기 카드에 작성자 나이·성별("30대·여성")을 한 줄 표시하려면 카드별 작성자 인구통계가 필요했습니다. 기존 0212 `get_procedure_review_demographics` 는 **시술 단위 집계 카운트만** 반환(개별 PII 비노출)이라 카드 단위 표시에는 쓸 수 없습니다.

검토한 이식 방식은 두 가지였습니다.

- **(A) 파일 이동** — `/reports-new` 폴더를 `/reports` 로 통째로 옮기고, 옛 `/reports` 의 SEO 코드(generateMetadata·JSON-LD)를 새 page 에 다시 붙임.
- **(B) in-place 교체** — 옛 `/reports` 의 `page.tsx`(SEO 셸)를 유지하고, 그 안에서 import 하는 **렌더 컴포넌트만** 신디자인으로 교체.

## Decision

1. **(B) in-place 교체** 를 택합니다. 옛 `/reports`·`/reports/{procedure}` 의 `page.tsx`(generateMetadata + JSON-LD + canonical + force-dynamic)는 그대로 두고, 렌더 트리만 신디자인으로 교체합니다.
   - 인덱스: `ReportsIndexView` (+ `ReportsIndexCard`, 공용 `ReportsIndexSidebar`)
   - 상세: `ReportsDetailView` (+ `ReportsReviewCard`)
   - 회전 헤드라인: `lib/report-headline.ts` (매 요청 랜덤 → force-dynamic, 효과 단정 금지)
2. **`/reports-new`·`/reports-new/[procedure]` 는 308 영구 리다이렉트**(`permanentRedirect`)로 `/reports`·`/reports/{ko}` 에 전가합니다. 옛 디자인 컴포넌트(`ReportsHubView`·`ProcedureReportView`)와 `/reports-new` 옛 뷰 4종은 삭제합니다.
3. **카드별 작성자 인구통계 RPC 도입** — 마이그 0322 `get_review_author_demographics(p_card_ids bigint[])` 신설. 카드 id 배열에 대해 작성자 성별·연령대(생년월일 → 10단위 floor, 10~50 클램프)를 반환. SECURITY DEFINER, GRANT anon/authenticated. 0212 집계 RPC 와 **별개 함수로 공존**.

## Consequences

- **(+) SEO 회귀 0 위험** — page 레벨 SEO 코드를 손대지 않아 메타·JSON-LD·canonical·308 미들웨어가 그대로 유지됩니다. 코드 diff 도 렌더 트리에 한정돼 검토 표면이 작습니다.
- **(+) 깨진 링크 없음** — `/reports-new` 미리보기 링크는 308 로 정식 URL 에 흡수됩니다.
- **(+) 단일 디자인** — 옛/신 디자인 이중 유지 부담 제거(옛 컴포넌트·옛 reports-new 뷰 삭제).
- **(−/트레이드오프) 개인정보** — 0322 는 **개별 후기 단위로 작성자 성별·연령대를 노출**합니다(특정 후기 → 작성자 인구통계 연결 가능). 0212(집계 카운트, 개별 비노출)보다 노출 단위가 좁아졌습니다. 완화책으로 연령은 10단위 라운딩(단일 출생연도 비식별)·직접 식별자/생년월일 원본 미반환으로 제한했고, 개별 단위 노출 자체는 후기 카드 UX(나이·성별 한 줄)를 위해 **오너 결정**으로 수용했습니다. 추후 노출 정책 변경 시 본 ADR·0322·DATABASE.md 동시 갱신 필요.
- **(대안 비교) (A) 파일 이동을 버린 이유** — SEO 코드를 새 page 로 다시 옮기는 과정에서 미세 누락(robots 분기·canonical·OG·en→ko 308 연계)이 발생할 위험이 컸고, diff 가 page 전체로 커져 검토 비용도 높았습니다. (B)가 SEO 무손실을 구조적으로 보장합니다.
