-- 0108_e2e_test_findings.sql
-- Phase 7 (2026-05-16): E2E 가입/탈퇴 테스트 중 발견된 누락 2건.
--
-- 1) cards.category CHECK constraint 에 'doodle' 누락.
--    src/lib/post-category.ts 의 PostCategorySlug type 에는 'doodle' 추가됐으나
--    DB CHECK 는 ['qa','tip','diary','ask','link'] 5개만 허용 → WriteClient 에서
--    doodle 선택 시 INSERT 실패. 운영 영향 큼.
--
-- 2) service_role 의 public.comments 테이블 권한 누락.
--    profiles, cards 등은 GRANT 있으나 comments 만 빠짐 → admin tooling /
--    backend 가 service_role 로 comments 직접 read 못 함. runtime UX 영향 없으나
--    향후 admin 화면 만들 때 막힘.

-- ─────────────────────────────────────────────────────────────────
-- 1) cards.category CHECK constraint 갱신
-- ─────────────────────────────────────────────────────────────────
ALTER TABLE public.cards DROP CONSTRAINT IF EXISTS cards_category_check;
ALTER TABLE public.cards ADD CONSTRAINT cards_category_check
  CHECK (category = ANY (ARRAY[
    'qa'::text,
    'tip'::text,
    'diary'::text,
    'ask'::text,
    'link'::text,
    'doodle'::text  -- Phase 5.2 (2026-05-15) 신설 — 사용자 직접 자유 메모
  ]));

-- ─────────────────────────────────────────────────────────────────
-- 2) public.comments GRANT (service_role)
-- ─────────────────────────────────────────────────────────────────
GRANT SELECT, INSERT, UPDATE, DELETE ON public.comments TO service_role;
-- 시퀀스도 함께
GRANT USAGE, SELECT ON SEQUENCE public.comments_id_seq TO service_role;
