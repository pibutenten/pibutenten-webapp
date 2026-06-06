-- 0253. 태그(ko) rename RPC — 단일 tx 전파 (2단계 #2)
--
-- 목적: /admin/tags 에서 태그 한글(ko) 자체를 rename. ko 는 cards.keywords(자유텍스트 배열)와
--   시술 태그의 경우 procedure_taxonomy(ko) 가 참조한다. rename 은 단순 셀 저장과 분리하여
--   "영향 카드 수 미리보기 → 확정" 게이트로만 실행한다(API: POST .../[id]/rename).
--
-- 전파 규칙(단일 트랜잭션):
--   1) tag_dictionary.ko 갱신 (UNIQUE ko — 사전 충돌 체크).
--   2) 시술 태그(is_procedure)면 procedure_taxonomy.ko 도 함께 갱신.
--      → procedure_reviews.procedure_ko FK(procedure_taxonomy ON UPDATE CASCADE)가 자동 전파.
--      (주의: procedure_reviews FK 는 tag_dictionary 가 아니라 procedure_taxonomy 를 참조한다.
--       시술 태그는 두 테이블에 동일 ko 로 중복 저장(49/49 일치) → 양쪽 동시 변경해야 정합 유지.)
--   3) cards.keywords array_replace 전파 — 0단계(0246) 패턴: 단일 tx · array_agg(DISTINCT) dedup ·
--      cards_set_updated_at 트리거 disable/enable 로 updated_at 보존.
--
-- 권한: EXECUTE 는 service_role 만 (서버 API route 의 admin client 전용). authenticated/anon 직접 호출 차단.
--   API route 가 requireAdmin(active 명함 단위, ADR 0012) 로 권한 게이트.
--
-- 반환: jsonb { ok, old, new, is_procedure, affected_cards, affected_reviews }.
-- 예외: empty_ko / too_long / not_found / duplicate_ko / duplicate_taxonomy.

CREATE OR REPLACE FUNCTION public.rename_tag(p_id bigint, p_new_ko text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_old_ko text;
  v_is_proc boolean;
  v_affected_cards int := 0;
  v_affected_reviews int := 0;
BEGIN
  p_new_ko := btrim(coalesce(p_new_ko, ''));
  IF p_new_ko = '' THEN RAISE EXCEPTION 'empty_ko'; END IF;
  IF char_length(p_new_ko) > 120 THEN RAISE EXCEPTION 'too_long'; END IF;

  SELECT ko, is_procedure INTO v_old_ko, v_is_proc
  FROM tag_dictionary WHERE id = p_id;
  IF v_old_ko IS NULL THEN RAISE EXCEPTION 'not_found'; END IF;

  IF p_new_ko = v_old_ko THEN
    RETURN jsonb_build_object('ok', true, 'unchanged', true,
      'old', v_old_ko, 'new', p_new_ko, 'is_procedure', v_is_proc,
      'affected_cards', 0, 'affected_reviews', 0);
  END IF;

  -- 사전 UNIQUE 충돌
  IF EXISTS (SELECT 1 FROM tag_dictionary WHERE ko = p_new_ko AND id <> p_id) THEN
    RAISE EXCEPTION 'duplicate_ko';
  END IF;

  -- 시술 태그 — procedure_taxonomy 도 함께 (CASCADE 로 procedure_reviews 자동 전파)
  IF v_is_proc THEN
    IF EXISTS (SELECT 1 FROM procedure_taxonomy WHERE ko = p_new_ko) THEN
      RAISE EXCEPTION 'duplicate_taxonomy';
    END IF;
    SELECT count(*)::int INTO v_affected_reviews
      FROM procedure_reviews WHERE procedure_ko = v_old_ko;
    UPDATE procedure_taxonomy SET ko = p_new_ko WHERE ko = v_old_ko;
  END IF;

  UPDATE tag_dictionary SET ko = p_new_ko, updated_at = now() WHERE id = p_id;

  -- cards.keywords 전파. keywords UPDATE 가 건드리는 cards 트리거 3종을 tx 한정 disable:
  --   - cards_set_updated_at: updated_at 보존(0246 패턴)
  --   - cards_register_unknown_tags: 재등록 불필요 + COALESCE(NEW.type,'?') enum 캐스팅 회피
  --   - trg_card_status_notification: rename 으로 인한 불필요한 상태 알림 평가/발송 회피
  --   (cards_pick_limit_check 는 is_pick 컬럼 한정이라 keywords UPDATE 에 미발동 → 제외.)
  --   (FK CASCADE(procedure_reviews) 보존 위해 session_replication_role 전역 off 대신 명시 disable.)
  ALTER TABLE public.cards DISABLE TRIGGER cards_set_updated_at;
  ALTER TABLE public.cards DISABLE TRIGGER cards_register_unknown_tags;
  ALTER TABLE public.cards DISABLE TRIGGER trg_card_status_notification;
  UPDATE public.cards c
  SET keywords = (
    SELECT array_agg(DISTINCT k)
    FROM unnest(array_replace(c.keywords, v_old_ko, p_new_ko)) k
  )
  WHERE c.deleted_at IS NULL
    AND c.keywords && ARRAY[v_old_ko]::text[];
  GET DIAGNOSTICS v_affected_cards = ROW_COUNT;
  ALTER TABLE public.cards ENABLE TRIGGER trg_card_status_notification;
  ALTER TABLE public.cards ENABLE TRIGGER cards_register_unknown_tags;
  ALTER TABLE public.cards ENABLE TRIGGER cards_set_updated_at;

  RETURN jsonb_build_object(
    'ok', true, 'old', v_old_ko, 'new', p_new_ko, 'is_procedure', v_is_proc,
    'affected_cards', v_affected_cards, 'affected_reviews', v_affected_reviews
  );
END;
$$;

REVOKE ALL ON FUNCTION public.rename_tag(bigint, text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rename_tag(bigint, text) TO service_role;
