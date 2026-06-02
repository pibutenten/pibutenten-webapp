-- 0207: 피부 고민(skin_concerns) 11종 개편에 따른 기존 데이터 정리
--
-- 배경: profile-options.ts SKIN_CONCERNS 를 11종으로 개편(2026-06-02).
--   신규 set: sagging/elasticity/volume/texture/wrinkle/tone/pores/contour/inner_dry/trouble/redness
--   폐지: aging(노안)·sensitive(민감성). 사용자 승인 — 신규 set 외 값은 삭제 가능.
-- 변경: 각 profiles.skin_concerns 배열에서 신규 set 외 키 제거(순서 보존). 모두 제거되면 NULL.
-- 영향: 기존 분포상 제거 대상은 sensitive(6)·aging(4) 뿐. 나머지 키는 신규 set 에 포함되어 유지.
--   interested_procedures 는 이번 개편 대상 아님(무변경).

UPDATE public.profiles p
SET skin_concerns = sub.cleaned
FROM (
  SELECT id,
    (
      SELECT array_agg(x ORDER BY ord)
      FROM unnest(skin_concerns) WITH ORDINALITY AS t(x, ord)
      WHERE x = ANY(ARRAY[
        'sagging','elasticity','volume','texture','wrinkle',
        'tone','pores','contour','inner_dry','trouble','redness'
      ])
    ) AS cleaned
  FROM public.profiles
  WHERE skin_concerns IS NOT NULL
) sub
WHERE p.id = sub.id
  AND p.skin_concerns IS DISTINCT FROM sub.cleaned;
