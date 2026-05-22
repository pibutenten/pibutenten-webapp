-- 0152: cards 글 숨김(블라인드) 기능 도입 (2026-05-22)
--
-- 배경:
--   관리자 모더레이션을 위해 부적절한 글을 영구 삭제(soft-delete) 이전 단계로 일단
--   숨길 수 있는 상태가 필요. published → hidden 으로 전환하면 admin/본인/해당 글의
--   doctor 외에는 보이지 않음. 해제 = published 복귀 (출구 단일).
--
-- 분석:
--   기존 0132 cards_public_read RLS 정책은
--     is_admin()
--     OR (deleted_at IS NULL AND (
--          status = 'published'
--          OR doctor_id = current_doctor_id()
--          OR author_id IN (same_group_profile_ids(auth.uid()))
--     ))
--   이미 published 화이트리스트 + 본인/doctor 우회 구조라 'hidden' 도 published 가
--   아니라는 사실만으로 일반 노출에서 자동 차단되고, 본인·doctor·admin 만 본인 우회로
--   통과. 따라서 RLS 변경 불필요, enum 값만 추가하면 됨.
--
-- 정책:
--   - 숨김은 published 상태 글에만 적용 (UI 가드)
--   - 해제 = published 로 복귀 (출구 단일)

-- ALTER TYPE ADD VALUE 는 트랜잭션 외부에서 단독 실행 필요 (Postgres 제약)
ALTER TYPE qa_status ADD VALUE IF NOT EXISTS 'hidden';

-- 검증
SELECT enumlabel
FROM pg_enum
WHERE enumtypid = 'qa_status'::regtype
ORDER BY enumsortorder;
