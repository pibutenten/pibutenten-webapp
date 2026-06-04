-- 0231: qa 카드 post_slug 'square-jaw-botox' → 'jaw-botox' 치환 (작업 D-a)
--
-- ============================================================================
-- ⚠ 데이터 변경 — 기존 발행 qa 카드 3건의 canonical 슬러그(URL) 변경. 정식 오픈 전이라 허용.
-- ============================================================================
-- 사각턱보톡스 키워드 카드의 buildSlug 결과를 신규 slug 'jaw-botox' 로 일원화(코드 JSON 과 정합).
--   대상: post_slug='square-jaw-botox' 인 qa 카드(2026-06-04 기준 id 1738·2082·2223).
--   review_summary 앵커(post_slug=jaw-botox)와는 URL 네임스페이스가 달라(/doctors/.../jaw-botox
--   vs /reports/jaw-botox) 충돌 없음. qa post_slug 전역 unique 제약 없음(이미 3건 동일 slug 공유).

UPDATE public.cards
SET post_slug = 'jaw-botox'
WHERE type = 'qa'::qa_type
  AND post_slug = 'square-jaw-botox';
