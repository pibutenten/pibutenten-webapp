-- 0208: 효과 항목 11종 개편에 따른 기존 후기(procedure_reviews.effect_areas) 정리
--
-- 배경: 후기 효과 옵션을 독립 11종(리프팅·탄력·볼륨·피부결·주름·피부톤·모공·윤곽·속건조·트러블·홍조)
--   으로 개편(2026-06-02). 폐지 라벨 "동안"·"피부장벽" 이 개편 전 작성된 후기의 effect_areas 에
--   그대로 남아 카드 요약에 계속 노출되던 문제(선택지에서 빼도 저장값은 자동 삭제 안 됨).
-- 변경: 각 procedure_reviews.effect_areas 에서 신규 11종 외 값 제거(순서 보존).
--   예) ["탄력","피부결","동안"] → ["탄력","피부결"].
-- 사용자 승인: 효과 항목에서 뺀 값은 기존 후기에서도 삭제. (onboarding skin_concerns 0207 와 동일 정책)

UPDATE public.procedure_reviews pr
SET effect_areas = sub.cleaned
FROM (
  SELECT id,
    (
      SELECT array_agg(x ORDER BY ord)
      FROM unnest(effect_areas) WITH ORDINALITY AS t(x, ord)
      WHERE x = ANY(ARRAY[
        '리프팅','탄력','볼륨','피부결','주름',
        '피부톤','모공','윤곽','속건조','트러블','홍조'
      ])
    ) AS cleaned
  FROM public.procedure_reviews
  WHERE effect_areas IS NOT NULL
) sub
WHERE pr.id = sub.id
  AND pr.effect_areas IS DISTINCT FROM sub.cleaned;
