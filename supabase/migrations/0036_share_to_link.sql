-- v5.1+ 카테고리 slug 정리: share → link
-- 라벨('공유하기')은 그대로 유지. 푸터 액션 'share(공유)'와 변수명 충돌 회피.

-- 1) old CHECK 먼저 drop (그래야 UPDATE가 새 값으로 허용됨)
alter table public.qas drop constraint if exists qas_category_check;

-- 2) data: share → link
update public.qas set category = 'link' where category = 'share';

-- 3) new CHECK 재정의
alter table public.qas add constraint qas_category_check
  check (category in ('qa', 'tip', 'diary', 'ask', 'link'));
