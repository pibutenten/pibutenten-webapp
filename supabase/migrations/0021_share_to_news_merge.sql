-- v4 spec 변경: '공유하기'(share) → '새소식'(news)로 통합·이름 변경.
-- 기존 'news' 카테고리는 거의 사용되지 않은 placeholder였고,
-- 'share'가 외부 링크 큐레이션 + 첫 댓글 + 출처 표기 등 풍부한 UX를 가진다.
-- 두 슬러그를 'news'로 통일하고, 사용자 표기도 '새소식'으로.
--
-- 작업 순서 (의존성 때문에 순서 중요):
--  1) 기존 category='news' 글 삭제 (사용자 지시: "기존 글의 '새소식'을 지우고")
--  2) keywords 배열에서 '공유하기' → '새소식'으로 치환
--  3) category='share' → category='news' 일괄 변환
--  4) CHECK constraint에서 'share' 제거 (slug 정리)

-- 1) 기존 news 글 삭제
delete from public.qas where category = 'news';

-- 2) keywords 배열 안 '공유하기' → '새소식' 치환
--    (auto-tag 로직이 카테고리 라벨을 첫 tag로 prepend하므로 모든 share 글에 들어있음)
update public.qas
   set keywords = (
     select array_agg(distinct case when k = '공유하기' then '새소식' else k end)
       from unnest(keywords) as k
   )
 where keywords is not null
   and '공유하기' = any(keywords);

-- 3) share → news 변환
update public.qas set category = 'news' where category = 'share';

-- 4) CHECK constraint 재정의 ('share' 제거)
alter table public.qas drop constraint if exists qas_category_check;
alter table public.qas add constraint qas_category_check
  check (category in ('qa', 'tip', 'diary', 'ask', 'news'));
