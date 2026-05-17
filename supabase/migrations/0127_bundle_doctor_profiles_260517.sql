-- 0127: 원장님 sub profile 묶음 추가 (2026-05-17)
--
-- 사용자 요청 3쌍 (실제 데이터 점검 후 방향 정정):
--   1) 김수형 doctor @kim-soohyung   (sub)  →  김수형 user @drksh0415          (primary)
--   2) 박효진 doctor @park-hyojin    (sub)  →  바쿄 user  @dnddudtnd           (primary)
--   3) 강현진 doctor @kang-hyunjin   (sub)  →  강현진 user @kang-hyunjin87     (primary)
--
-- 모델 (identity-shared.ts `bundleProfileFilter` 참고):
--   primary  : profile.id 자체가 auth.users.id (auth 보유 계정)
--   sub      : profile.auth_user_id = primary.id
--
-- 본 케이스의 특이점:
--   doctor 프로필은 auth.users 없는 정적 row(staff page용)이고, 실제 로그인하는 user
--   프로필이 auth 보유. 따라서 user 가 primary, doctor 가 sub. doctor.auth_user_id 를
--   user.id (= user 의 auth.users.id) 로 설정.
--
-- 안전:
--   - 트랜잭션 안에서 SELECT 로 매칭 확인 후 UPDATE.
--   - primary id 가 실제 auth.users 에 존재하는지 명시 검증 (FK 위반 방지).
--   - sub doctor 가 매칭 안 되면 RAISE EXCEPTION 으로 롤백.
--   - 김수형 user 는 display_name 동명이인 가능성 있어 handle=drksh0415 로 고정 식별.

BEGIN;

DO $$
DECLARE
  v_primary_id uuid;
  v_sub_id     uuid;
BEGIN
  ------------------------------------------------------------
  -- 1) @kim-soohyung (doctor, sub)  →  @drksh0415 (김수형 user, primary)
  ------------------------------------------------------------
  SELECT id INTO v_primary_id
  FROM public.profiles
  WHERE handle = 'drksh0415'
  LIMIT 1;
  IF v_primary_id IS NULL THEN
    RAISE EXCEPTION '[bundle 1] primary @drksh0415 not found';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = v_primary_id) THEN
    RAISE EXCEPTION '[bundle 1] primary @drksh0415 has no auth.users row (id=%)', v_primary_id;
  END IF;

  SELECT id INTO v_sub_id
  FROM public.profiles
  WHERE handle = 'kim-soohyung'
  LIMIT 1;
  IF v_sub_id IS NULL THEN
    RAISE EXCEPTION '[bundle 1] sub @kim-soohyung not found';
  END IF;

  UPDATE public.profiles
  SET auth_user_id = v_primary_id
  WHERE id = v_sub_id;
  RAISE NOTICE '[bundle 1] @kim-soohyung (%) -> @drksh0415 (%)', v_sub_id, v_primary_id;

  ------------------------------------------------------------
  -- 2) @park-hyojin (doctor, sub)  →  @dnddudtnd (바쿄 user, primary)
  ------------------------------------------------------------
  SELECT id INTO v_primary_id
  FROM public.profiles
  WHERE handle = 'dnddudtnd'
  LIMIT 1;
  IF v_primary_id IS NULL THEN
    RAISE EXCEPTION '[bundle 2] primary @dnddudtnd not found';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = v_primary_id) THEN
    RAISE EXCEPTION '[bundle 2] primary @dnddudtnd has no auth.users row (id=%)', v_primary_id;
  END IF;

  SELECT id INTO v_sub_id
  FROM public.profiles
  WHERE handle = 'park-hyojin'
  LIMIT 1;
  IF v_sub_id IS NULL THEN
    RAISE EXCEPTION '[bundle 2] sub @park-hyojin not found';
  END IF;

  UPDATE public.profiles
  SET auth_user_id = v_primary_id
  WHERE id = v_sub_id;
  RAISE NOTICE '[bundle 2] @park-hyojin (%) -> @dnddudtnd (%)', v_sub_id, v_primary_id;

  ------------------------------------------------------------
  -- 3) @kang-hyunjin (doctor, sub)  →  @kang-hyunjin87 (user, primary)
  ------------------------------------------------------------
  SELECT id INTO v_primary_id
  FROM public.profiles
  WHERE handle = 'kang-hyunjin87'
  LIMIT 1;
  IF v_primary_id IS NULL THEN
    RAISE EXCEPTION '[bundle 3] primary @kang-hyunjin87 not found';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = v_primary_id) THEN
    RAISE EXCEPTION '[bundle 3] primary @kang-hyunjin87 has no auth.users row (id=%)', v_primary_id;
  END IF;

  SELECT id INTO v_sub_id
  FROM public.profiles
  WHERE handle = 'kang-hyunjin'
  LIMIT 1;
  IF v_sub_id IS NULL THEN
    RAISE EXCEPTION '[bundle 3] sub @kang-hyunjin not found';
  END IF;

  UPDATE public.profiles
  SET auth_user_id = v_primary_id
  WHERE id = v_sub_id;
  RAISE NOTICE '[bundle 3] @kang-hyunjin (%) -> @kang-hyunjin87 (%)', v_sub_id, v_primary_id;
END $$;

COMMIT;
