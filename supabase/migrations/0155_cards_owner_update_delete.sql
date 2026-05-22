-- 0155: cards 테이블 작성자(author_id) UPDATE/DELETE 정책 추가 (2026-05-22)
--
-- 배경:
--   기존 정책은 admin (cards_admin_all) + doctor 본인 (cards_doctor_update / cards_doctor_delete) 만
--   UPDATE/DELETE 가능. 일반 회원 / 원장 묶음의 sub-identity (배스킨 등) 이 자기 작성 카드를
--   수정·삭제 시도 시 RLS 에 의해 silent fail (0 row affected, no error).
--
--   증상: Card.tsx 의 performDelete() → soft-delete (UPDATE deleted_at=now()) 호출 시
--         supabase 가 { data: [], error: null } 반환 → UI 는 성공으로 인식하여 vanishing 애니메이션 + refresh
--         → 페이지 새로고침 시 deleted_at 이 여전히 NULL 이라 카드가 다시 보임. "안 지워짐" 증상.
--
--   동일 증상이 본문 수정 (status='hidden' 토글 등) 에도 발생 가능.
--
-- 정책 (Phase 9 same-group 패턴 통일):
--   cards_owner_update: author 본인 묶음(same_group_profile_ids) 의 모든 profile 이 자기 카드 UPDATE
--   cards_owner_delete: 동일 조건으로 DELETE (현재 코드는 soft-delete UPDATE 만 사용하지만 안전망)
--
-- 안전성:
--   - WITH CHECK 도 동일 조건 → author_id 를 다른 사람으로 위조 차단
--   - status 컬럼 변경은 admin/doctor 만 가능하도록 별도 분기? — 현재 코드 흐름상 일반 작성자는
--     /write/[shortcode] 에서 publish 만 호출 (save status 보존), draft/pending_review 토글 없음.
--     RLS 단에서 status 변경 자체를 막진 않음 (admin 화면에서 작성자도 status 바꿀 일 거의 없음).

BEGIN;

DROP POLICY IF EXISTS cards_owner_update ON public.cards;
CREATE POLICY cards_owner_update ON public.cards
  FOR UPDATE
  USING (
    auth.uid() IS NOT NULL
    AND author_id IN (SELECT same_group_profile_ids(auth.uid()))
  )
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND author_id IN (SELECT same_group_profile_ids(auth.uid()))
  );

DROP POLICY IF EXISTS cards_owner_delete ON public.cards;
CREATE POLICY cards_owner_delete ON public.cards
  FOR DELETE
  USING (
    auth.uid() IS NOT NULL
    AND author_id IN (SELECT same_group_profile_ids(auth.uid()))
  );

-- 검증: cards 테이블의 UPDATE/DELETE 정책 목록 출력
SELECT polname, polcmd
FROM pg_policy
WHERE polrelid = 'public.cards'::regclass
  AND polcmd IN ('w', 'd', '*')
ORDER BY polname;

COMMIT;
