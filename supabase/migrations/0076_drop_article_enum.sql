-- 0076: qa_type enum 'article' 값 물리 제거
--
-- DB 행 0건 (0064 후 확인). 코드도 'article' 참조 모두 제거됨.
-- 의존: 3개 RLS policy + cards.type DEFAULT.

BEGIN;

-- 1. 의존 RLS policy 임시 DROP
DROP POLICY IF EXISTS qas_user_own_post ON public.cards;
DROP POLICY IF EXISTS qas_user_own_post_delete ON public.cards;
DROP POLICY IF EXISTS qas_user_post_insert ON public.cards;

-- 2. cards.type DEFAULT 임시 제거
ALTER TABLE public.cards ALTER COLUMN type DROP DEFAULT;

-- 3. 새 enum 생성 + 컬럼 cast
CREATE TYPE public.qa_type_new AS ENUM ('qa', 'post');
ALTER TABLE public.cards
  ALTER COLUMN type TYPE public.qa_type_new
  USING type::text::public.qa_type_new;

-- 4. 옛 enum DROP + 새 enum 이름 복원
DROP TYPE public.qa_type;
ALTER TYPE public.qa_type_new RENAME TO qa_type;

-- 5. DEFAULT 복원
ALTER TABLE public.cards ALTER COLUMN type SET DEFAULT 'qa'::public.qa_type;

-- 6. RLS policy 재생성 (이름은 cards_ prefix 로 갱신)
CREATE POLICY cards_user_own_post ON public.cards
  FOR UPDATE TO authenticated
  USING (
    auth.uid() IS NOT NULL AND type = 'post'::qa_type
    AND author_id IN (SELECT same_group_profile_ids(auth.uid()))
  )
  WITH CHECK (
    auth.uid() IS NOT NULL AND type = 'post'::qa_type
    AND author_id IN (SELECT same_group_profile_ids(auth.uid()))
  );

CREATE POLICY cards_user_own_post_delete ON public.cards
  FOR DELETE TO authenticated
  USING (
    auth.uid() IS NOT NULL AND type = 'post'::qa_type
    AND author_id IN (SELECT same_group_profile_ids(auth.uid()))
  );

CREATE POLICY cards_user_post_insert ON public.cards
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() IS NOT NULL AND (
      (type = 'post'::qa_type
        AND author_id IN (SELECT same_group_profile_ids(auth.uid()))
        AND doctor_id IS NULL)
      OR is_admin()
      OR (doctor_id = current_doctor_id())
    )
  );

COMMIT;

SELECT 'OK 0076' AS status;
