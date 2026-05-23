-- 0156: cards 본인 작성자 soft-delete RPC (2026-05-23)
--
-- 배경:
--   사용자 보고 (이도영 원장, 카드 #2316 "리쥬란은 어떤 원리로 피부에 작용하나요?"):
--   본인 작성 카드의 [지우기] 버튼 클릭 시 빨간 에러
--     "new row violates row-level security policy for table 'cards'"
--   발생. 다른 컬럼(question/keywords/status) 변경은 통과하지만 deleted_at 변경만 막힘.
--
-- 진단 (Supabase Management API SET LOCAL ROLE authenticated 시뮬레이션):
--   - is_admin() = false (이도영은 doctor)
--   - same_group_profile_ids(이도영 uid) = [doctor profile, user profile] (정상)
--   - current_doctor_id() = 94ad4a71-... = card.doctor_id (정상)
--   - cards_owner_update WITH CHECK 표현식 직접 평가: TRUE (author_id IN same_group)
--   - cards_doctor_update WITH CHECK 표현식 직접 평가: TRUE (doctor_id = current_doctor_id())
--   - 그럼에도 `UPDATE cards SET deleted_at = now() WHERE id = 2316` 시 RLS 위반.
--   - 같은 컨텍스트에서 status/question 변경은 통과.
--   → PostgreSQL 의 RLS WITH CHECK 평가가 sub-select 패턴
--     `author_id IN (SELECT same_group_profile_ids(auth.uid()))` 에 대해
--     특정 컬럼(deleted_at) UPDATE 시 미묘하게 다르게 동작하는 이슈로 보임.
--     (정확한 원인은 PostgreSQL 내부 RLS evaluator 의 sub-query caching/snapshot 이슈
--      가능성 — 시간 투입 대비 root-cause 확정 어려움.)
--
-- 해결책:
--   `public.soft_delete_card(p_card_id bigint)` SECURITY DEFINER RPC 신설.
--   - 함수 내부에서 권한 체크 명시 (admin OR 묶음 작성자 OR 해당 doctor)
--   - UPDATE 는 SECURITY DEFINER (postgres) 컨텍스트 → RLS 우회
--   - 권한 없으면 명시적 RAISE EXCEPTION (42501 forbidden)
--   - 이미 삭제된 카드는 멱등 응답 (no-op)
--
--   호출자(Card.tsx performDelete, EditClient handleOwnerDelete) 는
--   `supabase.rpc('soft_delete_card', { p_card_id: cardId })` 로 통일.
--   admin/draft 같은 hard-delete 흐름은 영향 없음 (별도 코드).

CREATE OR REPLACE FUNCTION public.soft_delete_card(p_card_id bigint)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_card record;
  v_can boolean := false;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '42501';
  END IF;

  SELECT id, author_id, doctor_id, deleted_at
    INTO v_card
    FROM public.cards
    WHERE id = p_card_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'card_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF v_card.deleted_at IS NOT NULL THEN
    -- 멱등: 이미 삭제된 카드는 그대로 ok 응답
    RETURN jsonb_build_object('ok', true, 'card_id', v_card.id, 'already_deleted', true);
  END IF;

  -- 권한 — admin / 본인 묶음 작성자 / 본인 doctor 카드 중 하나
  IF public.is_admin(v_uid) THEN
    v_can := true;
  ELSIF v_card.author_id IS NOT NULL
        AND v_card.author_id IN (SELECT public.same_group_profile_ids(v_uid)) THEN
    v_can := true;
  ELSIF v_card.doctor_id IS NOT NULL
        AND v_card.doctor_id = public.current_doctor_id(v_uid) THEN
    v_can := true;
  END IF;

  IF NOT v_can THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  UPDATE public.cards
    SET deleted_at = now()
    WHERE id = p_card_id;

  RETURN jsonb_build_object('ok', true, 'card_id', v_card.id);
END;
$$;

REVOKE ALL ON FUNCTION public.soft_delete_card(bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.soft_delete_card(bigint) TO authenticated;

-- 검증: 함수 존재 + 권한
SELECT proname, prosecdef, proowner::regrole AS owner
FROM pg_proc
WHERE proname = 'soft_delete_card' AND pronamespace = 'public'::regnamespace;
