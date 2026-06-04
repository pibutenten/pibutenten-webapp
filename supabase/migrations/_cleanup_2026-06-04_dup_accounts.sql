-- 일회성 데이터 정리(스키마 변경 아님): OAuth provider 차이로 생성된 동일인 중복 계정 정리.
-- 승인 근거: 사용자 지시 2026-06-04 [통합 A]. 멱등(IF EXISTS) + 트랜잭션(DO 블록) + 감사로그(audit_logs).
-- 삭제 대상은 모두 글/후기/댓글 0(가드로 재확인). rhee-doyoung/dandygom 의사 번들은 미포함(건드리지 않음).
--   A-1 lhjcjstk79(kakao,빈) 삭제 / lhjhyeya(google) 유지
--   A-2 seami2007(google,빈) 삭제 / qkqh****(email,7글7후기) 유지 + display_name '박새미'로 개명
--   A-3 snsanfdlvld(꽃미래,email,좋아요21) → 박미래(qkralfo01) 좋아요 이관 후 삭제
--   A-4 mirida(mir****,email,빈) 삭제 / 밀보리보리(daeatmiri,google) 유지

DO $$
DECLARE
  k_lhjhyeya uuid := '3f82e810-9787-44d8-aef0-ed35a83fb17e';
  d_lhjcjstk uuid := 'a375ffe2-8b5a-4630-bf11-3e6a533acbc9';
  k_qkqh     uuid := '6bacdcb9-0384-4116-a7ed-fa5d4c7a7d44';
  d_seami    uuid := '494566ea-8830-4211-bff6-c5d14fa85090';
  k_mirae    uuid := '8cee9fc5-2209-48e4-87ca-a555507127cf';
  d_kkot     uuid := '815cc6d4-6fdc-4acb-b368-415969abafce';
  k_milbori  uuid := '9fc7aeae-24b1-41c5-9031-bf41747e5260';
  d_mir      uuid := '64d33abb-a74d-4889-903c-7ac98f5b86c2';
  v_migrated int := 0;
  v_authored int;
BEGIN
  -- ===== A-1 =====
  IF EXISTS (SELECT 1 FROM public.profiles WHERE id = d_lhjcjstk) THEN
    SELECT (SELECT count(*) FROM cards WHERE author_id = d_lhjcjstk)
         + (SELECT count(*) FROM procedure_reviews WHERE author_id = d_lhjcjstk)
         + (SELECT count(*) FROM comments WHERE author_id = d_lhjcjstk) INTO v_authored;
    IF v_authored > 0 THEN RAISE EXCEPTION 'A-1 lhjcjstk79 not empty: %', v_authored; END IF;
    INSERT INTO audit_logs(action, target_table, target_id, metadata) VALUES (
      'auth.duplicate_cleanup', 'auth.users', d_lhjcjstk::text,
      jsonb_build_object('step','A-1','keep',k_lhjhyeya,
        'profile',(SELECT to_jsonb(p) FROM public.profiles p WHERE p.id=d_lhjcjstk),
        'auth',(SELECT jsonb_build_object('id',u.id,'email',u.email,'created_at',u.created_at,'meta',u.raw_user_meta_data) FROM auth.users u WHERE u.id=d_lhjcjstk)));
    DELETE FROM public.profiles WHERE id = d_lhjcjstk;
    DELETE FROM auth.users     WHERE id = d_lhjcjstk;
  END IF;

  -- ===== A-2 (delete seami first, then rename qkqh) =====
  IF EXISTS (SELECT 1 FROM public.profiles WHERE id = d_seami) THEN
    SELECT (SELECT count(*) FROM cards WHERE author_id = d_seami)
         + (SELECT count(*) FROM procedure_reviews WHERE author_id = d_seami)
         + (SELECT count(*) FROM comments WHERE author_id = d_seami) INTO v_authored;
    IF v_authored > 0 THEN RAISE EXCEPTION 'A-2 seami2007 not empty: %', v_authored; END IF;
    INSERT INTO audit_logs(action, target_table, target_id, metadata) VALUES (
      'auth.duplicate_cleanup', 'auth.users', d_seami::text,
      jsonb_build_object('step','A-2','keep',k_qkqh,
        'profile',(SELECT to_jsonb(p) FROM public.profiles p WHERE p.id=d_seami),
        'auth',(SELECT jsonb_build_object('id',u.id,'email',u.email,'created_at',u.created_at,'meta',u.raw_user_meta_data) FROM auth.users u WHERE u.id=d_seami)));
    DELETE FROM public.profiles WHERE id = d_seami;
    DELETE FROM auth.users     WHERE id = d_seami;
  END IF;
  -- 대표 계정 qkqh**** placeholder → '박새미' 개명(멱등)
  UPDATE public.profiles SET display_name = '박새미'
   WHERE id = k_qkqh AND display_name <> '박새미';

  -- ===== A-3 (migrate likes 꽃미래 -> 박미래, then delete 꽃미래) =====
  IF EXISTS (SELECT 1 FROM public.profiles WHERE id = d_kkot) THEN
    SELECT (SELECT count(*) FROM cards WHERE author_id = d_kkot)
         + (SELECT count(*) FROM procedure_reviews WHERE author_id = d_kkot)
         + (SELECT count(*) FROM comments WHERE author_id = d_kkot) INTO v_authored;
    IF v_authored > 0 THEN RAISE EXCEPTION 'A-3 kkotmirae not empty: %', v_authored; END IF;
    INSERT INTO card_likes(card_id, profile_id, created_at)
      SELECT card_id, k_mirae, created_at FROM card_likes WHERE profile_id = d_kkot
      ON CONFLICT (card_id, profile_id) DO NOTHING;
    GET DIAGNOSTICS v_migrated = ROW_COUNT;
    INSERT INTO audit_logs(action, target_table, target_id, metadata) VALUES (
      'auth.duplicate_cleanup', 'auth.users', d_kkot::text,
      jsonb_build_object('step','A-3','keep',k_mirae,'likes_migrated',v_migrated,
        'profile',(SELECT to_jsonb(p) FROM public.profiles p WHERE p.id=d_kkot),
        'auth',(SELECT jsonb_build_object('id',u.id,'email',u.email,'created_at',u.created_at,'meta',u.raw_user_meta_data) FROM auth.users u WHERE u.id=d_kkot)));
    DELETE FROM public.profiles WHERE id = d_kkot;  -- 잔여 좋아요는 CASCADE 로 정리
    DELETE FROM auth.users     WHERE id = d_kkot;
  END IF;

  -- ===== A-4 =====
  IF EXISTS (SELECT 1 FROM public.profiles WHERE id = d_mir) THEN
    SELECT (SELECT count(*) FROM cards WHERE author_id = d_mir)
         + (SELECT count(*) FROM procedure_reviews WHERE author_id = d_mir)
         + (SELECT count(*) FROM comments WHERE author_id = d_mir) INTO v_authored;
    IF v_authored > 0 THEN RAISE EXCEPTION 'A-4 mir not empty: %', v_authored; END IF;
    INSERT INTO audit_logs(action, target_table, target_id, metadata) VALUES (
      'auth.duplicate_cleanup', 'auth.users', d_mir::text,
      jsonb_build_object('step','A-4','keep',k_milbori,
        'profile',(SELECT to_jsonb(p) FROM public.profiles p WHERE p.id=d_mir),
        'auth',(SELECT jsonb_build_object('id',u.id,'email',u.email,'created_at',u.created_at,'meta',u.raw_user_meta_data) FROM auth.users u WHERE u.id=d_mir)));
    DELETE FROM public.profiles WHERE id = d_mir;
    DELETE FROM auth.users     WHERE id = d_mir;
  END IF;

  RAISE NOTICE 'cleanup done; likes_migrated=%', v_migrated;
END $$;
