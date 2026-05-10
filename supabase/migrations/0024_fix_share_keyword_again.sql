-- 0021의 keyword '공유하기' → '새소식' 치환이 일부 row에서 누락. 재실행.
update public.qas
   set keywords = (
     select array_agg(case when k = '공유하기' then '새소식' else k end)
       from unnest(keywords) as k
   )
 where keywords && array['공유하기']::text[];
