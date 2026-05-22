-- 0151: toggle_card_pick 가드 완화 — 의사 본인 글 Pick 가능 (2026-05-22)
--
-- 사용자 결정: 의사가 본인 글에 Pick 별표 가능. 다른 의사 글은 admin 만.
--
-- 권한 매트릭스 (새 정책):
--   super admin (is_admin())                                  → 모든 카드 Pick 가능
--   active doctor + 카드의 doctor_id 가 본인 doctor_id 매칭   → 본인 카드 Pick 가능
--   그 외                                                     → 거부
--
-- 자기 카드 정의: cards.doctor_id IN (caller 의 doctor_accounts.doctor_id 집합)
-- (cards.author_id 매칭은 의도적 제외 — 의사가 회원 글 Pick 하면 안 됨)

BEGIN;

CREATE OR REPLACE FUNCTION public.toggle_card_pick(
  p_card_id integer,
  p_pick boolean
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_is_self_doctor boolean;
BEGIN
  -- super admin 통과
  IF public.is_admin() THEN
    UPDATE public.cards SET is_pick = p_pick WHERE id = p_card_id;
    RETURN p_pick;
  END IF;

  -- self-doctor 통과: 카드의 doctor_id 가 caller 의 doctor_accounts 매핑 안에 있어야
  SELECT EXISTS (
    SELECT 1
      FROM public.cards c
      JOIN public.doctor_accounts da ON da.doctor_id = c.doctor_id
      JOIN public.profiles p ON p.id = da.profile_id
     WHERE c.id = p_card_id
       AND p.auth_user_id = auth.uid()
  ) INTO v_is_self_doctor;

  IF NOT v_is_self_doctor THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501';
  END IF;

  UPDATE public.cards SET is_pick = p_pick WHERE id = p_card_id;
  RETURN p_pick;
END;
$$;

COMMIT;
