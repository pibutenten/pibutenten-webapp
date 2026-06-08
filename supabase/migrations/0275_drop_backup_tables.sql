-- ============================================================
-- 0275 백업 테이블 14개 삭제 (2026-06-08)
--
-- 사전 검증:
--   - 14개 전부 운영 테이블에 동등/최신 데이터 존재 (또는 롤백 보험 목적 소멸)
--   - 참조 FK 없음, 참조 뷰 없음 → CASCADE 불필요
--   - profiles_backup_20260529: 탈퇴(auth 삭제)회원 PII 4건이 사본에만 잔류 →
--     원장 삭제 승인 완료 (PIPA 불필요 PII 최소보관 원칙상 삭제가 더 안전)
--   - 코드(src/) 어디에서도 이 테이블명 직접 참조 없음
-- ============================================================

DROP TABLE IF EXISTS public._bak_category_260601;
DROP TABLE IF EXISTS public._bak_keywords_260601;
DROP TABLE IF EXISTS public._bak_keywords_needle_260601;
DROP TABLE IF EXISTS public._bak_keywords_unify_260601;
DROP TABLE IF EXISTS public._bak_reviewed_at_260601;
DROP TABLE IF EXISTS public.cards_keyword_backfill_backup_260517;
DROP TABLE IF EXISTS public.cards_keywords_bak_0246;
DROP TABLE IF EXISTS public.procedure_reviews_ko_bak_0257;
DROP TABLE IF EXISTS public.procedure_taxonomy_bak_0257;
DROP TABLE IF EXISTS public.profiles_backup_20260529;
DROP TABLE IF EXISTS public.profiles_concern_bak_0262;
DROP TABLE IF EXISTS public.tag_dictionary_bak_0251;
DROP TABLE IF EXISTS public.tag_dictionary_bak_0254;
DROP TABLE IF EXISTS public.tag_dictionary_bak_0256;
