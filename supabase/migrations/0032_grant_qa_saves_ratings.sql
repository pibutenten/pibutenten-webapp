-- 0030의 RLS 정책만으로는 부족 — authenticated/anon role에 테이블 GRANT 필요.
-- 누락 시 "permission denied for table qa_saves" 에러 발생.
-- qa_likes도 같은 누락 — SELECT가 막혀 "내 좋아요" 상태 표시 불가.

grant select, insert, delete on public.qa_saves to authenticated;
grant select on public.qa_saves to anon;

grant select, insert, update, delete on public.qa_ratings to authenticated;
grant select on public.qa_ratings to anon;

grant select, insert, delete on public.qa_likes to authenticated;
grant select on public.qa_likes to anon;
