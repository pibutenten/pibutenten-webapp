-- 0230: 부모 앵커 백필 (작업 D-c)
--
-- ============================================================================
-- ⚠ 데이터 변경 + 공개(published) 앵커 생성 — 별도 파일, 사람이 확인 후 적용.
-- ============================================================================
-- 자식 덕에 리포트가 생기는 부모(family≥1 인데 자기 앵커 없음)에 review_summary 앵커 생성.
--   2026-06-04 대상: 레스틸렌(restylane)←비탈라이트, 쥬베룩(juvelook)←쥬베룩볼륨.
--   (리쥬란·세르프·보톡스는 자기 앵커 보유 → 롤업으로 count 만 증가, 백필 불필요.)
--
-- status='published' — 기존 live 앵커 25행과 동일 정책으로 즉시 리포트가 동작(저장·공유)하도록.
--   ※ 새 anchor 는 published 라 검색 상단·/reports·sitemap 에 노출(피드는 FEED_MIN_REVIEWS=4 미만이라 제외).
--   ※ draft 로 두고 운영자가 수동 플립하길 원하면 status 를 'draft' 로 바꿔 적용.
-- ON CONFLICT 멱등 — 이미 앵커 있는 시술은 건드리지 않음.

INSERT INTO public.cards
  (type, category, author_id, title, body, keywords, status, post_slug, is_pick)
SELECT
  'review_summary'::qa_type, 'review_summary',
  (SELECT id FROM public.profiles WHERE handle = 'pibutenten' LIMIT 1),
  '피부텐텐 리포트 | ' || t.ko, '', ARRAY[t.ko, t.en], 'published'::qa_status, t.en, false
FROM public.procedure_taxonomy t
WHERE t.en IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM public.procedure_reviews pr
    JOIN public.cards rc ON rc.id = pr.card_id
    WHERE rc.status = 'published'
      AND rc.deleted_at IS NULL
      AND pr.procedure_ko = ANY(public.procedure_family(t.ko))
  )
ON CONFLICT (post_slug) WHERE type = 'review_summary'::qa_type DO NOTHING;
