-- 0214: 시술 리포트 앵커 카드(type=review_summary) 데이터층 (C 앵커 1단계 / C1)
--
-- 배경: 지금 '시술 리포트'는 저장 카드 없이 procedure_reviews 실시간 집계로만 렌더된다.
--   이를 정식 cards 행(앵커)으로 승격해 이후 저장·공유·피드·색인·admin 을 붙이기 위한
--   "데이터층만" 단계. ★C1은 앵커를 '비공개(draft)' 로만 만들고 어떤 공개 화면에도 노출 0.
--   공개는 C2~C6(URL·점수·sitemap/rss·admin) 완비 후 마지막에 status 플립으로 한다.
--   수치(만족도·통증 등)는 행에 저장하지 않고 기존 실시간 집계(getProcedureReport)를 유지.
--
-- 스키마 변경 없음: qa_type enum 에 'review_summary', cards_category_check 에 'review_summary'
--   이미 존재(0200/0201). 본 마이그는 (A)백필 + (B)멱등 인덱스 + (C)RPC lazy 생성만 추가.
--
-- (A) 백필: 발행 후기(cards.type='review', status='published', deleted_at NULL)가 ≥1건인
--     시술마다 앵커 1행 생성(앵커 없을 때만). distinct 대상 = 25개(작성 시점 실측).
--     author=pibutenten 관리자(profiles.handle='pibutenten'). title='{ko} 시술 리포트',
--     keywords=ARRAY[ko, en], body='', post_slug=en, is_pick=false, status='draft'.
--
-- (B) 멱등: 한 시술당 앵커 1행 보장 = 부분 유니크 인덱스 ON cards(post_slug) WHERE
--     type='review_summary'. post_slug 에는 전역 유니크가 없고(유일 제약은
--     cards_doctor_year_slug_uidx = WHERE doctor_id IS NOT NULL), 앵커는 doctor_id NULL 이라
--     기존 의사글 슬러그와 충돌하지 않는다 → post_slug=en + 본 부분 유니크가 안전.
--
-- (C) RPC create_procedure_review·update_procedure_review: 0213 본문 VERBATIM + 발행 시
--     앵커 lazy 생성(멱등, ON CONFLICT DO NOTHING)만 추가. 기존 auth·중복·taxonomy·status·
--     INSERT/UPDATE 로직은 불변. 시그니처 동일 → CREATE OR REPLACE(DROP 불필요, ACL 보존).
--
-- ★staging 상태 = 'draft' 선택 근거 (노출 0):
--   - feed_cards_scored / search_cards_scored: WHERE status='published' (0206:57,148) → 제외
--   - sitemap.ts / rss/route.ts: .eq("status","published") → 제외
--   - 프로필 카드목록 [handle]/page.tsx:195,204: .eq("status","published") → 제외
--   - cards_public_read RLS: anon·비admin 은 status='published' 행만 (본인 author/doctor 제외) →
--       draft 앵커 직접 SELECT 차단. admin·작성자(pibutenten) 만 가시(공개 아님, 허용).
--   - 저장목록: 본인 card_saves 카운트뿐, 앵커는 누구도 저장 안 함.

BEGIN;

-- ── (B) 멱등 부분 유니크 인덱스 (백필·RPC 모두 이 인덱스가 보호) ──
CREATE UNIQUE INDEX IF NOT EXISTS cards_review_summary_slug_uidx
  ON public.cards (post_slug)
  WHERE type = 'review_summary'::qa_type;

-- ── (A) 백필: 발행 후기 ≥1 시술마다 앵커 1행 (없을 때만) ──
DO $backfill$
DECLARE
  v_author uuid;
BEGIN
  SELECT id INTO v_author FROM public.profiles WHERE handle = 'pibutenten' LIMIT 1;
  IF v_author IS NULL THEN
    RAISE EXCEPTION 'pibutenten admin profile not found (handle=pibutenten)';
  END IF;

  INSERT INTO public.cards
    (type, category, author_id, title, body, keywords, status, post_slug, is_pick)
  SELECT
    'review_summary'::qa_type, 'review_summary', v_author,
    t.ko || ' 시술 리포트', '', ARRAY[t.ko, t.en], 'draft'::qa_status, t.en, false
  FROM public.procedure_taxonomy t
  WHERE t.en IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.procedure_reviews pr
      JOIN public.cards c ON c.id = pr.card_id
      WHERE pr.procedure_ko = t.ko
        AND c.type = 'review'::qa_type
        AND c.status = 'published'
        AND c.deleted_at IS NULL
    )
  ON CONFLICT (post_slug) WHERE type = 'review_summary'::qa_type DO NOTHING;
END $backfill$;

-- ── (C) create_procedure_review: 0213 본문 VERBATIM + 발행 시 앵커 lazy 생성 추가 ──
CREATE OR REPLACE FUNCTION public.create_procedure_review(
  p_author_id     uuid,
  p_procedure_ko  text,
  p_title         text,
  p_body          text,
  p_keywords      text[],
  p_status        text,
  p_shortcode     text,
  p_post_year     int,
  p_satisfaction  smallint,
  p_pain          smallint,
  p_revisit       text,
  p_effect_areas  text[] DEFAULT NULL,
  p_downtime      text   DEFAULT NULL,
  p_effect_onset  text   DEFAULT NULL
) RETURNS TABLE(card_id bigint, shortcode text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $fn$
DECLARE v_card_id bigint;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_author_id AND auth_user_id = auth.uid()) THEN
    RAISE EXCEPTION 'not_authorized_author' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.procedure_taxonomy WHERE ko = p_procedure_ko AND active) THEN
    RAISE EXCEPTION 'unknown_procedure' USING ERRCODE = '22023';
  END IF;
  IF p_status NOT IN ('published','pending_review') THEN
    RAISE EXCEPTION 'invalid_status' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM public.procedure_reviews WHERE author_id = p_author_id AND procedure_ko = p_procedure_ko) THEN
    RAISE EXCEPTION 'duplicate_review' USING ERRCODE = '23505';
  END IF;

  INSERT INTO public.cards (type, category, author_id, title, body, keywords, status, shortcode, post_year)
  VALUES ('review'::qa_type, 'review', p_author_id, p_title, COALESCE(p_body,''),
          COALESCE(p_keywords, ARRAY[p_procedure_ko]), p_status::qa_status, p_shortcode, p_post_year)
  RETURNING id INTO v_card_id;

  INSERT INTO public.procedure_reviews
    (card_id, procedure_ko, author_id, satisfaction, pain, revisit, effect_areas, downtime, effect_onset)
  VALUES
    (v_card_id, p_procedure_ko, p_author_id, p_satisfaction, p_pain, p_revisit, p_effect_areas, p_downtime, p_effect_onset);

  -- [C1 추가] 발행이면 해당 시술 앵커(review_summary) lazy 생성(없을 때만, 멱등).
  --   앵커 자체는 'draft'(비공개) — 공개는 C2~ 완비 후 별도 플립. 기존 로직 불변.
  IF p_status = 'published' THEN
    INSERT INTO public.cards
      (type, category, author_id, title, body, keywords, status, post_slug, is_pick)
    SELECT
      'review_summary'::qa_type, 'review_summary',
      (SELECT id FROM public.profiles WHERE handle = 'pibutenten' LIMIT 1),
      t.ko || ' 시술 리포트', '', ARRAY[t.ko, t.en], 'draft'::qa_status, t.en, false
    FROM public.procedure_taxonomy t
    WHERE t.ko = p_procedure_ko AND t.en IS NOT NULL
    ON CONFLICT (post_slug) WHERE type = 'review_summary'::qa_type DO NOTHING;
  END IF;

  RETURN QUERY SELECT v_card_id, p_shortcode;
END $fn$;

REVOKE ALL ON FUNCTION public.create_procedure_review(uuid,text,text,text,text[],text,text,int,smallint,smallint,text,text[],text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_procedure_review(uuid,text,text,text,text[],text,text,int,smallint,smallint,text,text[],text,text) TO authenticated;

-- ── (C) update_procedure_review: 0213 본문 VERBATIM + published 전환 시 앵커 lazy 생성 추가 ──
CREATE OR REPLACE FUNCTION public.update_procedure_review(
  p_shortcode text,
  p_title text,
  p_body text,
  p_keywords text[],
  p_status text,
  p_satisfaction smallint,
  p_pain smallint,
  p_revisit text,
  p_effect_areas text[] DEFAULT NULL::text[],
  p_downtime text DEFAULT NULL,
  p_effect_onset text DEFAULT NULL
)
 RETURNS TABLE(card_id bigint, shortcode text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_card_id bigint;
  v_author uuid;
  v_is_admin boolean;
  v_procedure_ko text;
BEGIN
  SELECT c.id, c.author_id INTO v_card_id, v_author
  FROM public.cards c
  WHERE c.shortcode = p_shortcode
    AND c.type = 'review'::qa_type
    AND c.deleted_at IS NULL;
  IF v_card_id IS NULL THEN
    RAISE EXCEPTION 'card_not_found' USING ERRCODE = 'P0002';
  END IF;

  v_is_admin := EXISTS (
    SELECT 1 FROM public.profiles
    WHERE auth_user_id = auth.uid() AND role = 'admin'
  );
  IF NOT v_is_admin AND NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = v_author AND auth_user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;

  IF p_status NOT IN ('published','pending_review') THEN
    RAISE EXCEPTION 'invalid_status' USING ERRCODE = '22023';
  END IF;

  UPDATE public.cards
  SET title = p_title,
      body = COALESCE(p_body, ''),
      keywords = COALESCE(p_keywords, public.cards.keywords),
      status = p_status::qa_status,
      updated_at = now()
  WHERE public.cards.id = v_card_id;

  UPDATE public.procedure_reviews
  SET satisfaction = p_satisfaction,
      pain = p_pain,
      revisit = p_revisit,
      effect_areas = p_effect_areas,
      downtime = p_downtime,
      effect_onset = p_effect_onset,
      updated_at = now()
  WHERE public.procedure_reviews.card_id = v_card_id;

  -- [C1 추가] 수정으로 published 가 된 경우에도 해당 시술 앵커 lazy 생성(없을 때만, 멱등).
  --   procedure_ko 는 update 시그니처에 없으므로 이 후기의 procedure_reviews 행에서 파생.
  --   앵커는 'draft'(비공개). 기존 로직 불변.
  IF p_status = 'published' THEN
    SELECT pr.procedure_ko INTO v_procedure_ko
    FROM public.procedure_reviews pr
    WHERE pr.card_id = v_card_id;

    IF v_procedure_ko IS NOT NULL THEN
      INSERT INTO public.cards
        (type, category, author_id, title, body, keywords, status, post_slug, is_pick)
      SELECT
        'review_summary'::qa_type, 'review_summary',
        (SELECT id FROM public.profiles WHERE handle = 'pibutenten' LIMIT 1),
        t.ko || ' 시술 리포트', '', ARRAY[t.ko, t.en], 'draft'::qa_status, t.en, false
      FROM public.procedure_taxonomy t
      WHERE t.ko = v_procedure_ko AND t.en IS NOT NULL
      ON CONFLICT (post_slug) WHERE type = 'review_summary'::qa_type DO NOTHING;
    END IF;
  END IF;

  RETURN QUERY SELECT v_card_id, p_shortcode;
END
$function$;

GRANT EXECUTE ON FUNCTION public.update_procedure_review(text,text,text,text[],text,smallint,smallint,text,text[],text,text) TO authenticated;

COMMIT;
