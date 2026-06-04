-- 0226: 보톡스 하위 3태그 신설 (작업 D-a)
--
-- 사각턱보톡스=jaw-botox / 주름보톡스=wrinkle-botox / 스킨보톡스=skin-botox.
--   category=injectables(폼 '스킨부스터' 탭), parent_ko=보톡스, active.
-- 기존 6 브랜드 자식(나보타·메디톡신·제오민·코어톡스·휴톡스·리즈톡스)·그 후기 불변.
-- 코드 src/data/procedure-mappings/procedure-mappings.json 도 같은 커밋에서 갱신
--   (사각턱보톡스 슬러그를 jaw-botox 로 일원화, 주름보톡스=wrinkle-botox 추가). 기존 qa 카드
--   슬러그 치환은 0231 참조.

INSERT INTO public.procedure_taxonomy (ko, en, category, parent_ko, sort_order, active)
VALUES
  ('사각턱보톡스', 'jaw-botox',     'injectables', '보톡스', 0, true),
  ('주름보톡스',   'wrinkle-botox', 'injectables', '보톡스', 0, true),
  ('스킨보톡스',   'skin-botox',    'injectables', '보톡스', 0, true)
ON CONFLICT DO NOTHING;
