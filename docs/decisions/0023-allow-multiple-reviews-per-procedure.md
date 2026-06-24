# 0023. 같은 시술 후기 다중 작성 허용 (1인 1시술 1후기 제약 해제)

- **Status**: Accepted (amends 0019)
- **Date**: 2026-06-25
- **Related**: ADR 0019 (P3 시술후기), 마이그 0203(제약 도입)·0288(해제), PRD §4.3, ARCHITECTURE 「시술 리포트 앵커 카드」

## Context

0203(`review_fields_overhaul`)에서 `procedure_reviews_author_procedure_uniq UNIQUE(author_id, procedure_ko)` + `create_procedure_review` 내부 사전검사(`IF EXISTS … RAISE 'duplicate_review'`)로 **"한 명함이 한 시술에 후기 1개"** 를 강제했다. 그러나 실제 사용 시나리오는 같은 시술을 반복 시술받을 때마다(예: 3개월마다 보톡스·필러) 후기를 새로 남기는 것이다. 1인1후기 제약이 이를 막아 두 번째 후기 작성 시 "이미 이 시술의 후기를 작성하셨습니다" 로 차단됐다(사용자 제보).

`card_id UNIQUE`(`procedure_reviews_card_id_key`, 0200)는 별개 제약으로, **카드↔후기 1:1**(후기 1개 = 카드 1장)을 보장한다. 이는 집계 RPC(0206 LEFT JOIN)·수정 흐름(`update_procedure_review`, card_id 기준)의 전제이므로 유지해야 한다.

## Decision

- **author×procedure UNIQUE 제약 DROP** + `create_procedure_review` 의 `duplicate_review` 사전검사 제거 + `/api/reviews` 의 중복 안내 분기 제거 (마이그 0288).
- **카드↔후기 1:1(`procedure_reviews_card_id_key`)은 유지.** "후기를 여러 개 쓴다" = "카드를 여러 장 만든다" 이며, 각 카드는 후기 1행과 1:1.
- **시술 리포트 집계는 행(row) 기준이라 다중 후기가 모두 반영**(사용자 결정 — 중복 반영 수용). `get_review_report_overview`·`get_review_summary_pool`·`get_procedure_review_demographics` 모두 `count(*)`/row 기준이라 코드 변경 불필요.
- 예외: `get_research_panel().reviewers` 는 `count(DISTINCT author_id)`(후기 작성 **회원 수** 지표)라 distinct 유지 — 의미상 맞고 본 결정과 무충돌.

## Consequences

- (+) 반복 시술 후기가 누적돼 시술 리포트 데이터가 풍부해진다.
- (−) 한 사람이 같은 시술에 다수 후기를 남기면 리포트 만족도·재시술% 가 그 사람 쪽으로 쏠릴 수 있다(사용자가 수용한 트레이드오프).
- 후기 수정은 카드(shortcode) 단위(`update_procedure_review`)라 다중화 후에도 영향 없음.
- 마이페이지 "내 후기" 목록·프로필 탭은 카드 단위로 각각 노출되므로 같은 시술 후기 여러 개가 독립 카드로 표시된다(정상).
