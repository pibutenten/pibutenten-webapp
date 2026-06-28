-- 0322 시술 리포트 후기 카드용 작성자 인구통계 RPC. 적용일 2026-06-29. 운영 직접 적용(Management API), 기록용 파일.
-- 카드별 개별 작성자 성별·연령대(10단위)를 반환 — ReportsReviewCard 의 "30대·여성" 표시용.
-- (집계 카운트만 반환하는 0212 get_procedure_review_demographics 와 별개: 본 RPC 는 개별 단위 노출.)

create or replace function public.get_review_author_demographics(p_card_ids bigint[])
returns table(card_id bigint, gender text, age_decade int)
language sql security definer set search_path to 'public' stable as $func$
  select c.id, p.gender,
         case when p.birthdate is null then null
              else least(50, greatest(10, (extract(year from age(p.birthdate))::int / 10) * 10)) end
  from public.cards c
  join public.profiles p on p.id = c.author_id
  where c.id = any(p_card_ids);
$func$;

grant execute on function public.get_review_author_demographics(bigint[]) to anon, authenticated;
