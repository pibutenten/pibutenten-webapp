-- 0064: qas.doctor_id 있는 모든 카드는 author_id 를 그 doctor 의 profile 로 강제 교체
--
-- 배경: 0060은 NULL/orphan 만 fix → 유효한 admin profile (예: @pibutenten) 은 그대로 남음.
--       TOP 리스트에 "관리자"가 글쓴이로 나오는 비정상 케이스 발생.
-- 정책: doctor_id가 있는 카드 = 원장님이 화자 → author 도 그 원장의 profile 이어야 함.
--       doctor_accounts 매핑 있을 때만 교체. 매핑 없는 doctor는 그대로 (수동 후속 작업).

UPDATE public.qas q
   SET author_id = da.profile_id
  FROM public.doctor_accounts da
 WHERE q.doctor_id = da.doctor_id
   AND q.doctor_id IS NOT NULL
   AND (q.author_id IS NULL OR q.author_id <> da.profile_id);

-- 결과 보고
DO $$
DECLARE
  v_admin_authored int;
  v_no_doctor int;
BEGIN
  SELECT count(*) INTO v_admin_authored
    FROM public.qas q
    JOIN public.profiles p ON p.id = q.author_id
   WHERE p.role = 'admin' AND q.doctor_id IS NOT NULL;
  SELECT count(*) INTO v_no_doctor
    FROM public.qas q
   WHERE q.doctor_id IS NULL;
  RAISE NOTICE '0064: doctor 있는데 admin이 author로 남은 카드 = %', v_admin_authored;
  RAISE NOTICE '0064: doctor 없는 카드 (admin 직접 발행 가능 영역) = %', v_no_doctor;
END $$;
