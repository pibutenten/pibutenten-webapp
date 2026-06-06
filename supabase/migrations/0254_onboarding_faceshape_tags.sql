-- 0254. 온보딩 얼굴형 태그 5종 tag_dictionary 적재 (2단계 #4)
--
-- 배경: 태그 매니저 온보딩 편집값을 4종(얼굴형·피부타입·피부고민·관심시술)으로 확장한다.
--   기존 onboarding 분포: 피부고민11 / 관심시술7 / 피부타입4 / 얼굴형0.
-- 출처: src/lib/profile-options.ts::FACE_SHAPES (온보딩/설정 공유 SSOT) 한글 라벨 5종.
--   key→ko/en: oval=달걀형 / peanut=땅콩형 / oblong=장방형 / square=각진형 / round=둥근형.
-- 적재: onboarding='얼굴형', category='미지정', is_procedure=false, en=영문 key.
--   5종 모두 현재 tag_dictionary 에 미존재(신규 5행). ON CONFLICT 은 재실행 안전용(멱등).
-- 백업: 본 마이그 직전 tag_dictionary 전수 백업(tag_dictionary_bak_0254).

CREATE TABLE IF NOT EXISTS public.tag_dictionary_bak_0254 AS
  SELECT *, now() AS backed_up_at FROM public.tag_dictionary;

INSERT INTO public.tag_dictionary (ko, category, en, is_procedure, onboarding)
VALUES
  ('달걀형', '미지정', 'oval',   false, '얼굴형'),
  ('땅콩형', '미지정', 'peanut', false, '얼굴형'),
  ('장방형', '미지정', 'oblong', false, '얼굴형'),
  ('각진형', '미지정', 'square', false, '얼굴형'),
  ('둥근형', '미지정', 'round',  false, '얼굴형')
ON CONFLICT (ko) DO UPDATE
  SET onboarding = '얼굴형', updated_at = now();
