-- 0256. 온보딩 피부타입 태그 7종 완성 (2단계 D7)
--
-- 배경: 온보딩 편집 피부타입이 4종(수부지/건성/복합성/지성)만 적재 → 누락 3종 보완.
-- 출처: src/lib/profile-options.ts::SKIN_TYPES (7종). profiles.skin_type 실제 저장값도 7종 전부 존재
--   (dry24·combination15·dehydrated_oily10·oily3·extreme_oily3·normal2·extreme_dry2).
-- 신규 3종(현재 tag_dictionary 미존재 — ko 충돌 없음):
--   극건성=extreme-dry · 중성=normal · 극지성=extreme-oily.
-- 적재: onboarding='피부타입', category='미지정', is_procedure=false. ON CONFLICT 멱등(재실행 안전).
-- 백업: tag_dictionary 전수(tag_dictionary_bak_0256).

CREATE TABLE IF NOT EXISTS public.tag_dictionary_bak_0256 AS
  SELECT *, now() AS backed_up_at FROM public.tag_dictionary;

INSERT INTO public.tag_dictionary (ko, category, en, is_procedure, onboarding)
VALUES
  ('극건성', '미지정', 'extreme-dry',   false, '피부타입'),
  ('중성',   '미지정', 'normal',        false, '피부타입'),
  ('극지성', '미지정', 'extreme-oily',  false, '피부타입')
ON CONFLICT (ko) DO UPDATE
  SET onboarding = '피부타입', updated_at = now();
