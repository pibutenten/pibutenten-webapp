-- 0266. JSON-only orphan 태그 2건 DB 보강 (L2-4 선행)
--
-- 목적: procedure-mappings.json 제거(L2-4) 전, JSON 베이스라인에만 있고 tag_dictionary 에
--   없던 키워드 2건을 DB 로 옮겨 SSOT 완전성 확보. 제거 후 categoryFor/slugFor 회귀 방지.
--   조사: JSON 823키 중 DB(ko∪aliases) 미포함 = ['K-뷰티','1회적정량'] 2건뿐.
-- id 는 IDENTITY ALWAYS → 생략(자동). category 는 DB 컨벤션(한글). ko UNIQUE → ON CONFLICT.

INSERT INTO public.tag_dictionary (ko, en, category)
VALUES ('K-뷰티', 'k-beauty', '홈케어'),
       ('1회적정량', 'single-dose', '피부상식')
ON CONFLICT (ko) DO NOTHING;
