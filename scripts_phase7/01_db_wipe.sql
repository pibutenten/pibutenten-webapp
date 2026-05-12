-- Phase 7 DB Wipe
-- 모든 글/조회수/좋아요/저장/평점/댓글 삭제 (회원 계정·doctors·videos·migrations은 유지)
-- 적용: Supabase SQL Editor → 통째로 Run

begin;

-- 종속 테이블 먼저
delete from public.qa_likes;
delete from public.qa_saves;
delete from public.qa_ratings;
delete from public.comment_likes;
delete from public.comments;
delete from public.notifications;
delete from public.search_logs;
delete from public.qas;

-- 카운트 확인
select 'qas' as t, count(*) from public.qas
union all select 'comments', count(*) from public.comments
union all select 'qa_likes', count(*) from public.qa_likes
union all select 'qa_saves', count(*) from public.qa_saves
union all select 'qa_ratings', count(*) from public.qa_ratings;

commit;
