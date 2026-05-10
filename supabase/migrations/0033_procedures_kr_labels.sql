-- 관심시술 / 좋아하는 시술이 자유 입력으로 바뀌면서 기존 영문 키 → 한글 라벨 변환.
-- 더 이상 lookup table을 거치지 않고 chip이 그대로 표시되므로.

update public.profiles
set interested_procedures = (
  select array_agg(
    case x
      when 'lifting' then '리프팅'
      when 'laser' then '레이저'
      when 'booster' then '스킨부스터'
      when 'botox' then '보톡스'
      when 'filler' then '필러'
      when 'cosmetic' then '화장품'
      else x
    end
  )
  from unnest(interested_procedures) as t(x)
)
where interested_procedures && array['lifting','laser','booster','botox','filler','cosmetic'];

update public.profiles
set liked_procedures = (
  select array_agg(
    case x
      when 'lifting' then '리프팅'
      when 'laser' then '레이저'
      when 'booster' then '스킨부스터'
      when 'botox' then '보톡스'
      when 'filler' then '필러'
      when 'cosmetic' then '화장품'
      else x
    end
  )
  from unnest(liked_procedures) as t(x)
)
where liked_procedures && array['lifting','laser','booster','botox','filler','cosmetic'];
