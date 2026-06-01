-- 0199: 시술 분류 체계(procedure_taxonomy) — P3-a
--
-- 배경: P3(시술 후기)의 뿌리. 후기 대상 정식 시술 31종 + 하위 종류 14개(서브카테고리).
--   하위는 모두 '이중집계'(자체 통계 + 상위 합산), 검색 시 상·하위 둘 다 노출(P3-d/e에서 구현).
--   SSOT: 전달용/시술태그_선별표.md §1·§2. 영문 slug 은 procedure-mappings.json 에서 매핑.
-- 구조: 2계층. parent_ko IS NULL = 정식 시술(31), 그 외 = 하위(상위 ko 참조).
-- 영향: 신규 테이블(additive). 기존 기능 무영향.

CREATE TABLE IF NOT EXISTS public.procedure_taxonomy (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  ko          text NOT NULL UNIQUE,
  en          text,
  category    text NOT NULL CHECK (category IN ('lifting','injectables')),
  parent_ko   text REFERENCES public.procedure_taxonomy(ko) ON UPDATE CASCADE ON DELETE RESTRICT,
  sort_order  integer NOT NULL DEFAULT 0,
  active      boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS procedure_taxonomy_parent_idx ON public.procedure_taxonomy(parent_ko);
CREATE INDEX IF NOT EXISTS procedure_taxonomy_category_idx ON public.procedure_taxonomy(category);

ALTER TABLE public.procedure_taxonomy ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS procedure_taxonomy_read ON public.procedure_taxonomy;
CREATE POLICY procedure_taxonomy_read ON public.procedure_taxonomy
  FOR SELECT TO anon, authenticated USING (true);
-- 쓰기는 service_role(RLS 우회)만. anon/authenticated 쓰기 정책 없음 = 차단.

-- 정식 시술 31 (parent_ko NULL)
INSERT INTO public.procedure_taxonomy (ko, en, category, parent_ko, sort_order) VALUES
  ('골드PTT', 'gold-ptt', 'lifting', NULL, 0),
  ('덴서티', 'density', 'lifting', NULL, 1),
  ('레비나스', 'levinas', 'lifting', NULL, 2),
  ('미라젯', 'mirajet', 'lifting', NULL, 3),
  ('세르프', 'xerf', 'lifting', NULL, 4),
  ('슈링크', 'shurink', 'lifting', NULL, 5),
  ('써마지', 'thermage', 'lifting', NULL, 6),
  ('아그네스', 'agnes', 'lifting', NULL, 7),
  ('엠페이스', 'emface', 'lifting', NULL, 8),
  ('올리지오', 'oligio', 'lifting', NULL, 9),
  ('올타이트', 'alltite', 'lifting', NULL, 10),
  ('울쎄라', 'ulthera', 'lifting', NULL, 11),
  ('울트라셀', 'ultracel', 'lifting', NULL, 12),
  ('울트라콜', 'ultracol', 'lifting', NULL, 13),
  ('텐써마', '10therma', 'lifting', NULL, 14),
  ('티타늄', 'titanium', 'lifting', NULL, 15),
  ('포텐자', 'potenza', 'lifting', NULL, 16),
  ('레디어스', 'radiesse', 'injectables', NULL, 17),
  ('레스틸렌', 'restylane', 'injectables', NULL, 18),
  ('레스틸렌비탈', 'restylane-vital', 'injectables', NULL, 19),
  ('리쥬란', 'rejuran', 'injectables', NULL, 20),
  ('리투오', 're2o', 'injectables', NULL, 21),
  ('벨로테로', 'belotero', 'injectables', NULL, 22),
  ('스컬트라', 'sculptra', 'injectables', NULL, 23),
  ('스킨바이브', 'skinvive', 'injectables', NULL, 24),
  ('올리디아', 'olidia', 'injectables', NULL, 25),
  ('쥬베룩', 'juvelook', 'injectables', NULL, 26),
  ('쥬브젠', 'juvgen', 'injectables', NULL, 27),
  ('프로파일로', 'profhilo', 'injectables', NULL, 28),
  ('힐로웨이브', 'hilowave', 'injectables', NULL, 29),
  ('보톡스', 'botox', 'injectables', NULL, 30)
ON CONFLICT (ko) DO NOTHING;

-- 하위 종류 14 (상위 ko 참조, 이중집계 대상)
INSERT INTO public.procedure_taxonomy (ko, en, category, parent_ko, sort_order) VALUES
  ('나보타', 'nabota', 'injectables', '보톡스', 31),
  ('메디톡신', 'meditoxin', 'injectables', '보톡스', 32),
  ('제오민', 'xeomin', 'injectables', '보톡스', 33),
  ('코어톡스', 'coretox', 'injectables', '보톡스', 34),
  ('휴톡스', 'hutox', 'injectables', '보톡스', 35),
  ('리즈톡스', 'liztox', 'injectables', '보톡스', 36),
  ('쥬베룩볼륨', 'juvelook-volume', 'injectables', '쥬베룩', 37),
  ('쥬베룩아이', 'juvelook-eye', 'injectables', '쥬베룩', 38),
  ('리쥬란아이', 'rejuran-eye', 'injectables', '리쥬란', 39),
  ('리쥬란HB', 'rejuran-hb', 'injectables', '리쥬란', 40),
  ('덴서티알파팁', 'density-alpha-tip', 'lifting', '덴서티', 41),
  ('세르프아이', 'xerf-eye', 'lifting', '세르프', 42),
  ('벨로테로리바이브', 'belotero-revive', 'injectables', '벨로테로', 43),
  ('비탈라이트', 'vital-light', 'injectables', '레스틸렌', 44)
ON CONFLICT (ko) DO NOTHING;
