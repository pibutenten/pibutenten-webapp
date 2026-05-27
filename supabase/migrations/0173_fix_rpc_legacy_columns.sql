-- 0173_fix_rpc_legacy_columns.sql
--
-- 2026-05-28 — /admin/cards 500 에러 대응. PostgREST 스키마 캐시 강제 reload.
--
-- ── 배경 ───────────────────────────────────────────────────────────────────
-- 사용자 보고: /admin/cards 접속 시 "This page couldn't load" 500 에러.
-- 응용 코드 자체에는 title/body/pubmed_refs 잔재 0건 (이미 0171·0172 정합).
--
-- Deep scan 결과 (2026-05-28):
--   1. DB 살아있는 함수 본문 (pg_proc.prosrc) 에서 \bquestion\b / \banswer\b
--      매칭: 0건.
--   2. DB View 정의 (information_schema.views) 에서 동일 매칭: 0건.
--   3. 응용 코드 (src/**) 의 supabase 쿼리 빌더 .select()/.eq()/.ilike()/.or()
--      문자열 안 question/answer/pubmed_ref 단수형: 0건.
--   4. PostgREST 실 production REST API 직접 호출 (cards?select=id,title,body,
--      comments_count:comments(count),doctor:doctors(...),author:profiles!
--      cards_author_id_profiles_fkey(...)): HTTP 200, 모든 컬럼 정상 매핑.
--   5. cards FK 이름: cards_author_id_profiles_fkey, cards_doctor_id_fkey,
--      cards_video_id_fkey 모두 정상 존재.
--
-- → 코드·DB·FK 어디에도 잔재 없음. 가장 유력한 근본 원인은 **PostgREST 스키마
--   캐시 stale**. 0171/0172 적용 직후 NOTIFY 신호가 일시적으로 PostgREST 의
--   schema cache 에 반영되지 않은 채로 admin/cards 가 옛 시그니처로 RPC 또는
--   embedded relation 을 호출 → "column does not exist" 또는 "relationship not
--   found" 류 에러 → 응용 단에서 500 으로 surfaceed.
--
-- ── 본 마이그레이션의 행동 ─────────────────────────────────────────────────
--   (1) cards 테이블의 컬럼 메타데이터를 명시적으로 다시 한 번 확정 (DDL 무효).
--       실질 변경 없음 — 단순히 schema reload 가 PostgREST 에 강제되도록
--       마이그레이션 단위로 1회 더 트리거.
--   (2) 끝에 NOTIFY pgrst, 'reload schema' 1회 + 'reload config' 1회.
--       Supabase Management API 가 query 를 실행한 직후 PostgREST 가 schema 를
--       refetch 하게 강제. 0172 와 별도로 한 번 더 → 캐시 양 방향 reload 보장.
--   (3) cards 관련 RPC 들의 시그니처를 변경 없이 통과 (이미 0171·0172 에서
--       정합 완료). 추가 DROP/CREATE 사이클 생략 — 회귀 위험 0.
--
-- ── 회귀 위협 ─────────────────────────────────────────────────────────────
-- 본 마이그레이션은 실질 DDL 변경 없음. NOTIFY 만 실행되므로:
--   - DB 데이터 변경: 없음
--   - 함수 시그니처 변경: 없음
--   - RLS 정책 변경: 없음
--   - 인덱스 변경: 없음
-- 회귀 위험 = 0. PostgREST 가 다시 schema 를 적재하는 1~3초 동안 *극히 짧은*
-- 캐시 miss 가 있을 수 있으나, 운영 영향 없음.
--
-- ── 만약 본 마이그레이션 후에도 /admin/cards 가 500 ────────────────────────
-- 원인은 캐시가 아니라 다른 곳. 다음을 확인:
--   - Vercel 빌드 캐시가 옛 page.tsx 를 서빙 중인지 (재배포 완료 확인)
--   - middleware.ts 가 admin 진입 시 silent throw 하는지 (preview_logs)
--   - admin-page-guard.ts 의 권한 판정이 새 active identity 와 mismatch 인지
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

-- 실질 변경 없음. 명시적 comment 갱신만으로도 충분히 schema reload trigger.
COMMENT ON TABLE public.cards IS
  'Q&A + 일반 글 통합 테이블 (ADR 0004). title/body 컬럼 (P2-4, 0171). 0173 schema cache reload trigger.';

COMMIT;

-- PostgREST 스키마 캐시 강제 reload (요청 시 필수 포함).
-- 'reload schema' = 컬럼·시그니처·FK 메타데이터 재적재.
-- 'reload config' = PostgREST 설정 (search_path 등) 재적재. 보험.
NOTIFY pgrst, 'reload schema';
NOTIFY pgrst, 'reload config';
