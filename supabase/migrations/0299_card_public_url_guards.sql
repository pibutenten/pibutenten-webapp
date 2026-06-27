-- 0299_card_public_url_guards.sql
-- 0298 card_public_url 보강 (검수 권고, 낮음·latent). TS getQaUrl 진리값 검사와 동형으로
-- 빈문자('') 를 NULL 처럼 fall-through 시켜 '/doctors//...' 같은 빈 세그먼트 URL 생성을 차단.
--   - d.slug / post_slug / shortcode / handle 가 '' 면 해당 분기 skip (TS 의 truthy 검사와 일치).
--   - 현재 데이터 영향 0행(의사+slug & category!=qa 0, 빈 slug 0, 빈 shortcode 0 으로 검증).
--   - 의사 분기 category='qa' 라우트 필터는 두 헬퍼 모두 미적용 유지(mirror) → CLAUDE.md §5 주석에 명시.
-- 로직 외 변경 없음(NULLIF 가드만). ROLLBACK 으로 전 카드 출력 무변경(0행) 실증 후 적용.

BEGIN;

CREATE OR REPLACE FUNCTION public.card_public_url(p_card_id bigint)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $func$
  SELECT COALESCE(
    CASE WHEN c.type = 'review_summary' AND NULLIF(c.post_slug, '') IS NOT NULL
         THEN '/reports/' || c.post_slug END,
    CASE WHEN c.doctor_id IS NOT NULL AND c.post_year IS NOT NULL
              AND NULLIF(c.post_slug, '') IS NOT NULL AND NULLIF(d.slug, '') IS NOT NULL
         THEN '/doctors/' || d.slug || '/' || c.post_year::text || '/' || c.post_slug END,
    CASE WHEN NULLIF(p.handle, '') IS NOT NULL AND NULLIF(c.shortcode, '') IS NOT NULL
         THEN '/' || p.handle || '/' || c.shortcode END
  )
  FROM public.cards c
  LEFT JOIN public.doctors d ON d.id = c.doctor_id
  LEFT JOIN public.profiles p ON p.id = c.author_id
  WHERE c.id = p_card_id;
$func$;
GRANT EXECUTE ON FUNCTION public.card_public_url(bigint) TO authenticated, anon;

COMMIT;

SELECT 'OK 0299' AS status;
