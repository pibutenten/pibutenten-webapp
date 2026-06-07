-- 0263. 자동등록 흡수 — 영문 태그를 입력 시점에 한글 대표어로 (F 후속, B)
--
-- 목적: 새 글 keywords 에 영문 태그(예 'thermage')가 들어올 때, slugify 한 값이 기존
--   tag_dictionary.en(한글 대표어)과 일치하면 새 미지정 태그 생성 대신 한글 대표어로 치환.
--   입력 시점에 중복을 막아 사후 병합(merge) 부담을 줄임. 매칭 없으면 기존대로(0250 register).
-- 방식: BEFORE INSERT/UPDATE OF keywords 트리거로 NEW.keywords 치환(dedup). 글 저장은 항상 통과.
--   매칭 후 keywords 는 한글 → AFTER cards_register_unknown_tags 는 ① 존재 분기로 무동작.
-- 로그: tag_absorb_log(source_ko, target_ko).

-- 1) SQL slugify (TS slugifyEn 동일 규칙)
CREATE OR REPLACE FUNCTION public.slugify_en(raw text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT btrim(
    regexp_replace(
      regexp_replace(
        regexp_replace(lower(coalesce(raw, '')), '\s+', '-', 'g'),
        '[^a-z0-9-]', '', 'g'),
      '-+', '-', 'g'),
    '-');
$$;

-- 2) 흡수 로그
CREATE TABLE IF NOT EXISTS public.tag_absorb_log (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  source_ko text NOT NULL,
  target_ko text NOT NULL,
  absorbed_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.tag_absorb_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tag_absorb_log admin read" ON public.tag_absorb_log;
CREATE POLICY "tag_absorb_log admin read" ON public.tag_absorb_log
  FOR SELECT TO authenticated USING (public.is_admin());
GRANT SELECT, INSERT ON public.tag_absorb_log TO service_role, authenticated;

-- 3) BEFORE 흡수 트리거 함수
CREATE OR REPLACE FUNCTION public.cards_absorb_eng_tags()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  k text;
  tgt text;
  newkw text[] := '{}';
  changed boolean := false;
BEGIN
  IF NEW.keywords IS NULL OR array_length(NEW.keywords, 1) IS NULL THEN
    RETURN NEW;
  END IF;
  FOREACH k IN ARRAY NEW.keywords LOOP
    tgt := NULL;
    -- 영문(한글 미포함) 태그만 흡수 후보
    IF k ~ '^[A-Za-z0-9][A-Za-z0-9 _-]*$' THEN
      SELECT ko INTO tgt
        FROM public.tag_dictionary
       WHERE en = public.slugify_en(k) AND ko ~ '[가-힣]'
       LIMIT 1;
    END IF;
    IF tgt IS NOT NULL AND tgt <> k THEN
      newkw := array_append(newkw, tgt);
      changed := true;
      INSERT INTO public.tag_absorb_log(source_ko, target_ko) VALUES (k, tgt);
    ELSE
      newkw := array_append(newkw, k);
    END IF;
  END LOOP;
  IF changed THEN
    NEW.keywords := (SELECT array_agg(DISTINCT x) FROM unnest(newkw) x);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS cards_absorb_eng_tags ON public.cards;
CREATE TRIGGER cards_absorb_eng_tags
  BEFORE INSERT OR UPDATE OF keywords ON public.cards
  FOR EACH ROW EXECUTE FUNCTION public.cards_absorb_eng_tags();
