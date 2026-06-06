-- 0250. 미지 태그 자동등록 hook (1단계 B, additive)
--
-- 글 저장 시 cards.keywords 의 각 키워드를 분기 처리:
--   ① tag_dictionary 존재        → 그대로(무동작)
--   ② 미존재 + term_glossary(en) → tag_dictionary 에 (category='미지정', en=용어집값) upsert
--   ③ 둘 다 없음                  → tag_review_queue 에 검수 대기 upsert
--
-- 구현: register_unknown_tags(text[],text) RPC + cards AFTER INSERT/UPDATE OF keywords 트리거.
--   저장 경로 6곳(api/articles POST·PUT, admin/draft/publish, EditClient, DraftClient,
--   api/reviews create_procedure_review, update_procedure_review)은 모두 cards.keywords 쓰기로
--   수렴하므로, 트리거 1점이 6경로를 일괄 커버(클라이언트 DB 쓰기 불필요, 서버측 단일 chokepoint).
--   기존 cards.keywords 저장 동작 불변(additive). 멱등(ON CONFLICT). 방어적(EXCEPTION→카드저장 무중단).

-- 1) 검수큐 테이블 (공개 SELECT 차단·admin 만)
CREATE TABLE IF NOT EXISTS public.tag_review_queue (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  ko           text NOT NULL UNIQUE,
  suggested_en text,
  source       text,
  created_at   timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.tag_review_queue ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.tag_review_queue FROM anon;
GRANT SELECT ON public.tag_review_queue TO authenticated;  -- 행 가시성은 RLS 가 admin 으로 제한
DROP POLICY IF EXISTS "tag_review_queue admin read" ON public.tag_review_queue;
CREATE POLICY "tag_review_queue admin read" ON public.tag_review_queue
  FOR SELECT TO authenticated USING (public.is_admin());

-- 2) 등록 RPC (SECURITY DEFINER, 방어적)
CREATE OR REPLACE FUNCTION public.register_unknown_tags(p_keywords text[], p_source text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF p_keywords IS NULL OR array_length(p_keywords, 1) IS NULL THEN RETURN; END IF;

  -- ② 미존재 + 용어집 en 있음 → tag_dictionary 미지정 upsert (recommended 우선)
  INSERT INTO public.tag_dictionary (ko, category, en)
  SELECT DISTINCT k.kw, '미지정', g.en
  FROM unnest(p_keywords) AS k(kw)
  JOIN LATERAL (
    SELECT en FROM public.term_glossary
    WHERE ko = k.kw AND en IS NOT NULL
    ORDER BY recommended DESC, id ASC LIMIT 1
  ) g ON true
  WHERE k.kw IS NOT NULL AND length(trim(k.kw)) > 0
    AND NOT EXISTS (SELECT 1 FROM public.tag_dictionary t WHERE t.ko = k.kw)
  ON CONFLICT (ko) DO NOTHING;

  -- ③ tag_dictionary·용어집 둘 다 없음 → 검수큐 upsert
  INSERT INTO public.tag_review_queue (ko, suggested_en, source)
  SELECT DISTINCT k.kw, NULL, p_source
  FROM unnest(p_keywords) AS k(kw)
  WHERE k.kw IS NOT NULL AND length(trim(k.kw)) > 0
    AND NOT EXISTS (SELECT 1 FROM public.tag_dictionary t WHERE t.ko = k.kw)
    AND NOT EXISTS (SELECT 1 FROM public.term_glossary  g WHERE g.ko = k.kw)
  ON CONFLICT (ko) DO NOTHING;

EXCEPTION WHEN OTHERS THEN
  RETURN;  -- 어떤 실패도 카드 저장을 막지 않음
END;
$$;
REVOKE ALL ON FUNCTION public.register_unknown_tags(text[], text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.register_unknown_tags(text[], text) TO authenticated, service_role;

-- 3) cards 트리거 — keyword 쓰기 시 자동 등록 (6경로 일괄 커버)
CREATE OR REPLACE FUNCTION public.cards_register_tags_trg()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM public.register_unknown_tags(NEW.keywords, 'card:' || COALESCE(NEW.type, '?'));
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS cards_register_unknown_tags ON public.cards;
CREATE TRIGGER cards_register_unknown_tags
  AFTER INSERT OR UPDATE OF keywords ON public.cards
  FOR EACH ROW EXECUTE FUNCTION public.cards_register_tags_trg();
