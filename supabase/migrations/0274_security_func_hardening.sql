-- ============================================================
-- 0274 보안 함수 강화 (2026-06-08)
-- A-1. recalc_user_level: PUBLIC/authenticated EXECUTE 차단 + 내부 권한 가드 + search_path 고정
-- A-2. anonymize_user_content_before_delete: search_path 고정 (hijacking 방어)
-- A-3. propagate_onboarding_to_doctor_bundle: search_path 고정
--
-- 사전 검증:
--   - recalc_user_level 은 트리거/다른 함수/소스코드 어디에서도 호출되지 않음 (호출처 0)
--   - 본문(점수 산정 로직)은 production 원본과 동일. 가드 + search_path 만 추가.
-- ============================================================

-- ── A-1. recalc_user_level ──────────────────────────────────
-- 현재: PUBLIC(anon 포함) EXECUTE 가능 + 내부 권한 검사 없음
--   → 누구나 임의 UUID 로 타인 레벨 재계산 호출 가능.
REVOKE EXECUTE ON FUNCTION public.recalc_user_level(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.recalc_user_level(uuid) FROM authenticated;
GRANT  EXECUTE ON FUNCTION public.recalc_user_level(uuid) TO service_role;

-- 본문은 원본 그대로. begin 직후 권한 가드만 삽입 + search_path 고정.
--   허용: service_role(배치/내부 호출) / is_admin() / 본인(auth.uid()=p_user_id)
CREATE OR REPLACE FUNCTION public.recalc_user_level(p_user_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public, pg_temp
AS $function$
declare v_score integer; v_level integer;
begin
  -- 권한 가드: service_role / 관리자 / 본인 외 차단.
  if auth.role() <> 'service_role'
     and not public.is_admin()
     and (auth.uid() is null or auth.uid() <> p_user_id)
  then
    raise exception 'permission denied for function recalc_user_level' using errcode = '42501';
  end if;

  select coalesce(count(*),0)*5 into v_score from public.cards where author_id = p_user_id and type='post' and status='published';
  v_score := v_score + (select coalesce(sum(like_count),0)*2 from public.cards where author_id=p_user_id and status='published');
  v_score := v_score + (select coalesce(count(*),0)*1 from public.comments where author_id=p_user_id and status='visible');
  v_level := case when v_score >= 200 then 3 when v_score >= 50 then 2 when v_score >= 10 then 1 else 0 end;
  update public.profiles set activity_score = v_score, level = v_level where id = p_user_id;
  return v_level;
end;
$function$;

-- ── A-2. search_path 고정 (본문 변경 없음, ALTER 만) ──────────
ALTER FUNCTION public.anonymize_user_content_before_delete()
  SET search_path = public, pg_temp;

ALTER FUNCTION public.propagate_onboarding_to_doctor_bundle(uuid)
  SET search_path = public, pg_temp;
