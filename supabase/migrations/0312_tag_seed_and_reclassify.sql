-- 0312. tag_dictionary + tag_normalization 시술 태그 대량 UPSERT (198종)
--
-- procedures_v6.json 기반. 시술 카테고리 10종 체계(0311) 확장 후 시술 태그를 일괄 등록·갱신.
-- 기존 tag_dictionary 행은 category/en/parent_ko/is_procedure/aliases/pubmed_keywords 만 덮어쓰기.
-- tag_normalization 에 오타 매핑 추가 (ON CONFLICT DO UPDATE → 멱등).
-- parent 의존 순서: parent_ko=NULL 인 태그를 먼저, 자식 태그를 나중에 INSERT.

BEGIN;

-- ── tag_dictionary: 시술 태그 UPSERT (198건) ──

INSERT INTO public.tag_dictionary (ko, category, en, parent_ko, is_procedure, aliases, pubmed_keywords)
VALUES ('더블로', '리프팅', 'doublo', NULL, true,
        ARRAY['Doublo']::text[], ARRAY['Doublo','high-intensity focused ultrasound','HIFU']::text[])
ON CONFLICT (ko) DO UPDATE SET
  category = EXCLUDED.category,
  en = COALESCE(EXCLUDED.en, tag_dictionary.en),
  parent_ko = COALESCE(EXCLUDED.parent_ko, tag_dictionary.parent_ko),
  is_procedure = true,
  aliases = COALESCE(EXCLUDED.aliases, tag_dictionary.aliases),
  pubmed_keywords = COALESCE(EXCLUDED.pubmed_keywords, tag_dictionary.pubmed_keywords),
  updated_at = now();

INSERT INTO public.tag_dictionary (ko, category, en, parent_ko, is_procedure, aliases, pubmed_keywords)
VALUES ('덴서티', '리프팅', 'density', NULL, true,
        ARRAY['Density','Denza']::text[], ARRAY['monopolar radiofrequency','bipolar radiofrequency','radiofrequency skin tightening']::text[])
ON CONFLICT (ko) DO UPDATE SET
  category = EXCLUDED.category,
  en = COALESCE(EXCLUDED.en, tag_dictionary.en),
  parent_ko = COALESCE(EXCLUDED.parent_ko, tag_dictionary.parent_ko),
  is_procedure = true,
  aliases = COALESCE(EXCLUDED.aliases, tag_dictionary.aliases),
  pubmed_keywords = COALESCE(EXCLUDED.pubmed_keywords, tag_dictionary.pubmed_keywords),
  updated_at = now();

INSERT INTO public.tag_dictionary (ko, category, en, parent_ko, is_procedure, aliases, pubmed_keywords)
VALUES ('리니어펌', '리프팅', 'linearfirm', NULL, true,
        ARRAY['LinearFirm']::text[], ARRAY['high-intensity focused ultrasound','HIFU']::text[])
ON CONFLICT (ko) DO UPDATE SET
  category = EXCLUDED.category,
  en = COALESCE(EXCLUDED.en, tag_dictionary.en),
  parent_ko = COALESCE(EXCLUDED.parent_ko, tag_dictionary.parent_ko),
  is_procedure = true,
  aliases = COALESCE(EXCLUDED.aliases, tag_dictionary.aliases),
  pubmed_keywords = COALESCE(EXCLUDED.pubmed_keywords, tag_dictionary.pubmed_keywords),
  updated_at = now();

INSERT INTO public.tag_dictionary (ko, category, en, parent_ko, is_procedure, aliases, pubmed_keywords)
VALUES ('리프테라', '리프팅', 'liftera', NULL, true,
        ARRAY['Liftera']::text[], ARRAY['high-intensity focused ultrasound','HIFU']::text[])
ON CONFLICT (ko) DO UPDATE SET
  category = EXCLUDED.category,
  en = COALESCE(EXCLUDED.en, tag_dictionary.en),
  parent_ko = COALESCE(EXCLUDED.parent_ko, tag_dictionary.parent_ko),
  is_procedure = true,
  aliases = COALESCE(EXCLUDED.aliases, tag_dictionary.aliases),
  pubmed_keywords = COALESCE(EXCLUDED.pubmed_keywords, tag_dictionary.pubmed_keywords),
  updated_at = now();

INSERT INTO public.tag_dictionary (ko, category, en, parent_ko, is_procedure, aliases, pubmed_keywords)
VALUES ('볼뉴머', '리프팅', 'volnewmer', NULL, true,
        ARRAY['Volnewmer']::text[], ARRAY['monopolar radiofrequency','radiofrequency skin tightening']::text[])
ON CONFLICT (ko) DO UPDATE SET
  category = EXCLUDED.category,
  en = COALESCE(EXCLUDED.en, tag_dictionary.en),
  parent_ko = COALESCE(EXCLUDED.parent_ko, tag_dictionary.parent_ko),
  is_procedure = true,
  aliases = COALESCE(EXCLUDED.aliases, tag_dictionary.aliases),
  pubmed_keywords = COALESCE(EXCLUDED.pubmed_keywords, tag_dictionary.pubmed_keywords),
  updated_at = now();

INSERT INTO public.tag_dictionary (ko, category, en, parent_ko, is_procedure, aliases, pubmed_keywords)
VALUES ('비너스레거시', '리프팅', 'venus-legacy', NULL, true,
        ARRAY['Venus Legacy']::text[], ARRAY['multipolar radiofrequency','radiofrequency skin tightening']::text[])
ON CONFLICT (ko) DO UPDATE SET
  category = EXCLUDED.category,
  en = COALESCE(EXCLUDED.en, tag_dictionary.en),
  parent_ko = COALESCE(EXCLUDED.parent_ko, tag_dictionary.parent_ko),
  is_procedure = true,
  aliases = COALESCE(EXCLUDED.aliases, tag_dictionary.aliases),
  pubmed_keywords = COALESCE(EXCLUDED.pubmed_keywords, tag_dictionary.pubmed_keywords),
  updated_at = now();

INSERT INTO public.tag_dictionary (ko, category, en, parent_ko, is_procedure, aliases, pubmed_keywords)
VALUES ('세르프', '리프팅', 'xerf', NULL, true,
        ARRAY['XERF']::text[], ARRAY['dual-frequency monopolar radiofrequency','radiofrequency skin tightening']::text[])
ON CONFLICT (ko) DO UPDATE SET
  category = EXCLUDED.category,
  en = COALESCE(EXCLUDED.en, tag_dictionary.en),
  parent_ko = COALESCE(EXCLUDED.parent_ko, tag_dictionary.parent_ko),
  is_procedure = true,
  aliases = COALESCE(EXCLUDED.aliases, tag_dictionary.aliases),
  pubmed_keywords = COALESCE(EXCLUDED.pubmed_keywords, tag_dictionary.pubmed_keywords),
  updated_at = now();

INSERT INTO public.tag_dictionary (ko, category, en, parent_ko, is_procedure, aliases, pubmed_keywords)
VALUES ('소프웨이브', '리프팅', 'sofwave', NULL, true,
        ARRAY['Sofwave','SUPERB']::text[], ARRAY['Sofwave','synchronous ultrasound parallel beam','ultrasound skin tightening']::text[])
ON CONFLICT (ko) DO UPDATE SET
  category = EXCLUDED.category,
  en = COALESCE(EXCLUDED.en, tag_dictionary.en),
  parent_ko = COALESCE(EXCLUDED.parent_ko, tag_dictionary.parent_ko),
  is_procedure = true,
  aliases = COALESCE(EXCLUDED.aliases, tag_dictionary.aliases),
  pubmed_keywords = COALESCE(EXCLUDED.pubmed_keywords, tag_dictionary.pubmed_keywords),
  updated_at = now();

INSERT INTO public.tag_dictionary (ko, category, en, parent_ko, is_procedure, aliases, pubmed_keywords)
VALUES ('슈링크', '리프팅', 'shurink', NULL, true,
        ARRAY['Shurink']::text[], ARRAY['high-intensity focused ultrasound','HIFU','microfocused ultrasound']::text[])
ON CONFLICT (ko) DO UPDATE SET
  category = EXCLUDED.category,
  en = COALESCE(EXCLUDED.en, tag_dictionary.en),
  parent_ko = COALESCE(EXCLUDED.parent_ko, tag_dictionary.parent_ko),
  is_procedure = true,
  aliases = COALESCE(EXCLUDED.aliases, tag_dictionary.aliases),
  pubmed_keywords = COALESCE(EXCLUDED.pubmed_keywords, tag_dictionary.pubmed_keywords),
  updated_at = now();

INSERT INTO public.tag_dictionary (ko, category, en, parent_ko, is_procedure, aliases, pubmed_keywords)
VALUES ('실리프팅', '리프팅', 'thread-lifting', NULL, true,
        ARRAY['thread lifting','thread lift']::text[], ARRAY['thread lift','PDO thread','barbed suture']::text[])
ON CONFLICT (ko) DO UPDATE SET
  category = EXCLUDED.category,
  en = COALESCE(EXCLUDED.en, tag_dictionary.en),
  parent_ko = COALESCE(EXCLUDED.parent_ko, tag_dictionary.parent_ko),
  is_procedure = true,
  aliases = COALESCE(EXCLUDED.aliases, tag_dictionary.aliases),
  pubmed_keywords = COALESCE(EXCLUDED.pubmed_keywords, tag_dictionary.pubmed_keywords),
  updated_at = now();

INSERT INTO public.tag_dictionary (ko, category, en, parent_ko, is_procedure, aliases, pubmed_keywords)
VALUES ('써마지', '리프팅', 'thermage', NULL, true,
        ARRAY['Thermage']::text[], ARRAY['Thermage','monopolar radiofrequency','radiofrequency skin tightening']::text[])
ON CONFLICT (ko) DO UPDATE SET
  category = EXCLUDED.category,
  en = COALESCE(EXCLUDED.en, tag_dictionary.en),
  parent_ko = COALESCE(EXCLUDED.parent_ko, tag_dictionary.parent_ko),
  is_procedure = true,
  aliases = COALESCE(EXCLUDED.aliases, tag_dictionary.aliases),
  pubmed_keywords = COALESCE(EXCLUDED.pubmed_keywords, tag_dictionary.pubmed_keywords),
  updated_at = now();

INSERT INTO public.tag_dictionary (ko, category, en, parent_ko, is_procedure, aliases, pubmed_keywords)
VALUES ('엠페이스', '리프팅', 'emface', NULL, true,
        ARRAY['EmFace','Emface']::text[], ARRAY['EmFace','synchronized radiofrequency','high-intensity facial electrical stimulation','HIFES']::text[])
ON CONFLICT (ko) DO UPDATE SET
  category = EXCLUDED.category,
  en = COALESCE(EXCLUDED.en, tag_dictionary.en),
  parent_ko = COALESCE(EXCLUDED.parent_ko, tag_dictionary.parent_ko),
  is_procedure = true,
  aliases = COALESCE(EXCLUDED.aliases, tag_dictionary.aliases),
  pubmed_keywords = COALESCE(EXCLUDED.pubmed_keywords, tag_dictionary.pubmed_keywords),
  updated_at = now();

INSERT INTO public.tag_dictionary (ko, category, en, parent_ko, is_procedure, aliases, pubmed_keywords)
VALUES ('온다', '리프팅', 'onda', NULL, true,
        ARRAY['Onda','Coolwaves']::text[], ARRAY['Onda Coolwaves','microwave','body contouring']::text[])
ON CONFLICT (ko) DO UPDATE SET
  category = EXCLUDED.category,
  en = COALESCE(EXCLUDED.en, tag_dictionary.en),
  parent_ko = COALESCE(EXCLUDED.parent_ko, tag_dictionary.parent_ko),
  is_procedure = true,
  aliases = COALESCE(EXCLUDED.aliases, tag_dictionary.aliases),
  pubmed_keywords = COALESCE(EXCLUDED.pubmed_keywords, tag_dictionary.pubmed_keywords),
  updated_at = now();

INSERT INTO public.tag_dictionary (ko, category, en, parent_ko, is_procedure, aliases, pubmed_keywords)
VALUES ('올리지오', '리프팅', 'oligio', NULL, true,
        ARRAY['Oligio']::text[], ARRAY['monopolar radiofrequency','radiofrequency skin tightening']::text[])
ON CONFLICT (ko) DO UPDATE SET
  category = EXCLUDED.category,
  en = COALESCE(EXCLUDED.en, tag_dictionary.en),
  parent_ko = COALESCE(EXCLUDED.parent_ko, tag_dictionary.parent_ko),
  is_procedure = true,
  aliases = COALESCE(EXCLUDED.aliases, tag_dictionary.aliases),
  pubmed_keywords = COALESCE(EXCLUDED.pubmed_keywords, tag_dictionary.pubmed_keywords),
  updated_at = now();

INSERT INTO public.tag_dictionary (ko, category, en, parent_ko, is_procedure, aliases, pubmed_keywords)
VALUES ('올타이트', '리프팅', 'alltite', NULL, true,
        ARRAY['Alltite']::text[], ARRAY['dielectric heating radiofrequency','radiofrequency skin tightening']::text[])
ON CONFLICT (ko) DO UPDATE SET
  category = EXCLUDED.category,
  en = COALESCE(EXCLUDED.en, tag_dictionary.en),
  parent_ko = COALESCE(EXCLUDED.parent_ko, tag_dictionary.parent_ko),
  is_procedure = true,
  aliases = COALESCE(EXCLUDED.aliases, tag_dictionary.aliases),
  pubmed_keywords = COALESCE(EXCLUDED.pubmed_keywords, tag_dictionary.pubmed_keywords),
  updated_at = now();

INSERT INTO public.tag_dictionary (ko, category, en, parent_ko, is_procedure, aliases, pubmed_keywords)
VALUES ('울쎄라', '리프팅', 'ulthera', NULL, true,
        ARRAY['Ulthera','Ultherapy']::text[], ARRAY['Ultherapy','microfocused ultrasound','MFU-V','high-intensity focused ultrasound']::text[])
ON CONFLICT (ko) DO UPDATE SET
  category = EXCLUDED.category,
  en = COALESCE(EXCLUDED.en, tag_dictionary.en),
  parent_ko = COALESCE(EXCLUDED.parent_ko, tag_dictionary.parent_ko),
  is_procedure = true,
  aliases = COALESCE(EXCLUDED.aliases, tag_dictionary.aliases),
  pubmed_keywords = COALESCE(EXCLUDED.pubmed_keywords, tag_dictionary.pubmed_keywords),
  updated_at = now();

INSERT INTO public.tag_dictionary (ko, category, en, parent_ko, is_procedure, aliases, pubmed_keywords)
VALUES ('울트라셀', '리프팅', 'ultracel', NULL, true,
        ARRAY['Ultracel']::text[], ARRAY['high-intensity focused ultrasound','HIFU']::text[])
ON CONFLICT (ko) DO UPDATE SET
  category = EXCLUDED.category,
  en = COALESCE(EXCLUDED.en, tag_dictionary.en),
  parent_ko = COALESCE(EXCLUDED.parent_ko, tag_dictionary.parent_ko),
  is_procedure = true,
  aliases = COALESCE(EXCLUDED.aliases, tag_dictionary.aliases),
  pubmed_keywords = COALESCE(EXCLUDED.pubmed_keywords, tag_dictionary.pubmed_keywords),
  updated_at = now();

INSERT INTO public.tag_dictionary (ko, category, en, parent_ko, is_procedure, aliases, pubmed_keywords)
VALUES ('울트라포머', '리프팅', 'ultraformer', NULL, true,
        ARRAY['Ultraformer','Ultraformer III']::text[], ARRAY['high-intensity focused ultrasound','HIFU','microfocused ultrasound']::text[])
ON CONFLICT (ko) DO UPDATE SET
  category = EXCLUDED.category,
  en = COALESCE(EXCLUDED.en, tag_dictionary.en),
  parent_ko = COALESCE(EXCLUDED.parent_ko, tag_dictionary.parent_ko),
  is_procedure = true,
  aliases = COALESCE(EXCLUDED.aliases, tag_dictionary.aliases),
  pubmed_keywords = COALESCE(EXCLUDED.pubmed_keywords, tag_dictionary.pubmed_keywords),
  updated_at = now();

INSERT INTO public.tag_dictionary (ko, category, en, parent_ko, is_procedure, aliases, pubmed_keywords)
VALUES ('울핏', '리프팅', 'ulfit', NULL, true,
        ARRAY['Ulfit']::text[], ARRAY['high-intensity focused ultrasound','HIFU','body contouring']::text[])
ON CONFLICT (ko) DO UPDATE SET
  category = EXCLUDED.category,
  en = COALESCE(EXCLUDED.en, tag_dictionary.en),
  parent_ko = COALESCE(EXCLUDED.parent_ko, tag_dictionary.parent_ko),
  is_procedure = true,
  aliases = COALESCE(EXCLUDED.aliases, tag_dictionary.aliases),
  pubmed_keywords = COALESCE(EXCLUDED.pubmed_keywords, tag_dictionary.pubmed_keywords),
  updated_at = now();

INSERT INTO public.tag_dictionary (ko, category, en, parent_ko, is_procedure, aliases, pubmed_keywords)
VALUES ('인모드', '리프팅', 'inmode', NULL, true,
        ARRAY['InMode']::text[], ARRAY['bipolar radiofrequency','radiofrequency']::text[])
ON CONFLICT (ko) DO UPDATE SET
  category = EXCLUDED.category,
  en = COALESCE(EXCLUDED.en, tag_dictionary.en),
  parent_ko = COALESCE(EXCLUDED.parent_ko, tag_dictionary.parent_ko),
  is_procedure = true,
  aliases = COALESCE(EXCLUDED.aliases, tag_dictionary.aliases),
  pubmed_keywords = COALESCE(EXCLUDED.pubmed_keywords, tag_dictionary.pubmed_keywords),
  updated_at = now();

INSERT INTO public.tag_dictionary (ko, category, en, parent_ko, is_procedure, aliases, pubmed_keywords)
VALUES ('텐써마', '리프팅', '10therma', NULL, true,
        ARRAY['10Therma']::text[], ARRAY['monopolar radiofrequency','radiofrequency skin tightening']::text[])
ON CONFLICT (ko) DO UPDATE SET
  category = EXCLUDED.category,
  en = COALESCE(EXCLUDED.en, tag_dictionary.en),
  parent_ko = COALESCE(EXCLUDED.parent_ko, tag_dictionary.parent_ko),
  is_procedure = true,
  aliases = COALESCE(EXCLUDED.aliases, tag_dictionary.aliases),
  pubmed_keywords = COALESCE(EXCLUDED.pubmed_keywords, tag_dictionary.pubmed_keywords),
  updated_at = now();

INSERT INTO public.tag_dictionary (ko, category, en, parent_ko, is_procedure, aliases, pubmed_keywords)
VALUES ('텐쎄라', '리프팅', '10thera', NULL, true,
        ARRAY['10Thera']::text[], ARRAY['high-intensity focused ultrasound','HIFU']::text[])
ON CONFLICT (ko) DO UPDATE SET
  category = EXCLUDED.category,
  en = COALESCE(EXCLUDED.en, tag_dictionary.en),
  parent_ko = COALESCE(EXCLUDED.parent_ko, tag_dictionary.parent_ko),
  is_procedure = true,
  aliases = COALESCE(EXCLUDED.aliases, tag_dictionary.aliases),
  pubmed_keywords = COALESCE(EXCLUDED.pubmed_keywords, tag_dictionary.pubmed_keywords),
  updated_at = now();

INSERT INTO public.tag_dictionary (ko, category, en, parent_ko, is_procedure, aliases, pubmed_keywords)
VALUES ('튠페이스', '리프팅', 'tuneface', NULL, true,
        ARRAY['TuneFace','Accent Prime']::text[], ARRAY['radiofrequency','Accent Prime','skin tightening']::text[])
ON CONFLICT (ko) DO UPDATE SET
  category = EXCLUDED.category,
  en = COALESCE(EXCLUDED.en, tag_dictionary.en),
  parent_ko = COALESCE(EXCLUDED.parent_ko, tag_dictionary.parent_ko),
  is_procedure = true,
  aliases = COALESCE(EXCLUDED.aliases, tag_dictionary.aliases),
  pubmed_keywords = COALESCE(EXCLUDED.pubmed_keywords, tag_dictionary.pubmed_keywords),
  updated_at = now();

INSERT INTO public.tag_dictionary (ko, category, en, parent_ko, is_procedure, aliases, pubmed_keywords)
VALUES ('티타늄리프팅', '리프팅', 'titanium-lifting', NULL, true,
        ARRAY['Titanium lifting']::text[], NULL)
ON CONFLICT (ko) DO UPDATE SET
  category = EXCLUDED.category,
  en = COALESCE(EXCLUDED.en, tag_dictionary.en),
  parent_ko = COALESCE(EXCLUDED.parent_ko, tag_dictionary.parent_ko),
  is_procedure = true,
  aliases = COALESCE(EXCLUDED.aliases, tag_dictionary.aliases),
  pubmed_keywords = COALESCE(EXCLUDED.pubmed_keywords, tag_dictionary.pubmed_keywords),
  updated_at = now();

INSERT INTO public.tag_dictionary (ko, category, en, parent_ko, is_procedure, aliases, pubmed_keywords)
VALUES ('리쥬란', '스킨부스터', 'rejuran', NULL, true,
        ARRAY['Rejuran']::text[], ARRAY['Rejuran','polynucleotide','salmon DNA']::text[])
ON CONFLICT (ko) DO UPDATE SET
  category = EXCLUDED.category,
  en = COALESCE(EXCLUDED.en, tag_dictionary.en),
  parent_ko = COALESCE(EXCLUDED.parent_ko, tag_dictionary.parent_ko),
  is_procedure = true,
  aliases = COALESCE(EXCLUDED.aliases, tag_dictionary.aliases),
  pubmed_keywords = COALESCE(EXCLUDED.pubmed_keywords, tag_dictionary.pubmed_keywords),
  updated_at = now();

INSERT INTO public.tag_dictionary (ko, category, en, parent_ko, is_procedure, aliases, pubmed_keywords)
VALUES ('물광주사', '스킨부스터', 'water-glow-injection', NULL, true,
        ARRAY['water glow injection','skin booster']::text[], ARRAY['hyaluronic acid','skin booster','microinjection']::text[])
ON CONFLICT (ko) DO UPDATE SET
  category = EXCLUDED.category,
  en = COALESCE(EXCLUDED.en, tag_dictionary.en),
  parent_ko = COALESCE(EXCLUDED.parent_ko, tag_dictionary.parent_ko),
  is_procedure = true,
  aliases = COALESCE(EXCLUDED.aliases, tag_dictionary.aliases),
  pubmed_keywords = COALESCE(EXCLUDED.pubmed_keywords, tag_dictionary.pubmed_keywords),
  updated_at = now();

INSERT INTO public.tag_dictionary (ko, category, en, parent_ko, is_procedure, aliases, pubmed_keywords)
VALUES ('더마샤인', '스킨부스터', 'dermashine', NULL, true,
        ARRAY['Dermashine']::text[], ARRAY['hyaluronic acid','skin booster','microinjection']::text[])
ON CONFLICT (ko) DO UPDATE SET
  category = EXCLUDED.category,
  en = COALESCE(EXCLUDED.en, tag_dictionary.en),
  parent_ko = COALESCE(EXCLUDED.parent_ko, tag_dictionary.parent_ko),
  is_procedure = true,
  aliases = COALESCE(EXCLUDED.aliases, tag_dictionary.aliases),
  pubmed_keywords = COALESCE(EXCLUDED.pubmed_keywords, tag_dictionary.pubmed_keywords),
  updated_at = now();

INSERT INTO public.tag_dictionary (ko, category, en, parent_ko, is_procedure, aliases, pubmed_keywords)
VALUES ('물톡스', '스킨부스터', 'water-tox', NULL, true,
        ARRAY['water tox','aqua botox']::text[], ARRAY['microbotox','intradermal botulinum toxin']::text[])
ON CONFLICT (ko) DO UPDATE SET
  category = EXCLUDED.category,
  en = COALESCE(EXCLUDED.en, tag_dictionary.en),
  parent_ko = COALESCE(EXCLUDED.parent_ko, tag_dictionary.parent_ko),
  is_procedure = true,
  aliases = COALESCE(EXCLUDED.aliases, tag_dictionary.aliases),
  pubmed_keywords = COALESCE(EXCLUDED.pubmed_keywords, tag_dictionary.pubmed_keywords),
  updated_at = now();

INSERT INTO public.tag_dictionary (ko, category, en, parent_ko, is_procedure, aliases, pubmed_keywords)
VALUES ('볼라이트', '스킨부스터', 'volite', NULL, true,
        ARRAY['Volite','Juvederm Volite']::text[], ARRAY['hyaluronic acid','skin booster']::text[])
ON CONFLICT (ko) DO UPDATE SET
  category = EXCLUDED.category,
  en = COALESCE(EXCLUDED.en, tag_dictionary.en),
  parent_ko = COALESCE(EXCLUDED.parent_ko, tag_dictionary.parent_ko),
  is_procedure = true,
  aliases = COALESCE(EXCLUDED.aliases, tag_dictionary.aliases),
  pubmed_keywords = COALESCE(EXCLUDED.pubmed_keywords, tag_dictionary.pubmed_keywords),
  updated_at = now();

INSERT INTO public.tag_dictionary (ko, category, en, parent_ko, is_procedure, aliases, pubmed_keywords)
VALUES ('비타란', '스킨부스터', 'vitaran', NULL, true,
        ARRAY['Vitaran']::text[], ARRAY['polynucleotide']::text[])
ON CONFLICT (ko) DO UPDATE SET
  category = EXCLUDED.category,
  en = COALESCE(EXCLUDED.en, tag_dictionary.en),
  parent_ko = COALESCE(EXCLUDED.parent_ko, tag_dictionary.parent_ko),
  is_procedure = true,
  aliases = COALESCE(EXCLUDED.aliases, tag_dictionary.aliases),
  pubmed_keywords = COALESCE(EXCLUDED.pubmed_keywords, tag_dictionary.pubmed_keywords),
  updated_at = now();

INSERT INTO public.tag_dictionary (ko, category, en, parent_ko, is_procedure, aliases, pubmed_keywords)
VALUES ('샤넬주사', '스킨부스터', 'chanel-injection', NULL, true,
        ARRAY['Chanel injection']::text[], NULL)
ON CONFLICT (ko) DO UPDATE SET
  category = EXCLUDED.category,
  en = COALESCE(EXCLUDED.en, tag_dictionary.en),
  parent_ko = COALESCE(EXCLUDED.parent_ko, tag_dictionary.parent_ko),
  is_procedure = true,
  aliases = COALESCE(EXCLUDED.aliases, tag_dictionary.aliases),
  pubmed_keywords = COALESCE(EXCLUDED.pubmed_keywords, tag_dictionary.pubmed_keywords),
  updated_at = now();

INSERT INTO public.tag_dictionary (ko, category, en, parent_ko, is_procedure, aliases, pubmed_keywords)
VALUES ('스킨바이브', '스킨부스터', 'skinvive', NULL, true,
        ARRAY['SkinVive','Juvederm SkinVive']::text[], ARRAY['hyaluronic acid','skin booster']::text[])
ON CONFLICT (ko) DO UPDATE SET
  category = EXCLUDED.category,
  en = COALESCE(EXCLUDED.en, tag_dictionary.en),
  parent_ko = COALESCE(EXCLUDED.parent_ko, tag_dictionary.parent_ko),
  is_procedure = true,
  aliases = COALESCE(EXCLUDED.aliases, tag_dictionary.aliases),
  pubmed_keywords = COALESCE(EXCLUDED.pubmed_keywords, tag_dictionary.pubmed_keywords),
  updated_at = now();

INSERT INTO public.tag_dictionary (ko, category, en, parent_ko, is_procedure, aliases, pubmed_keywords)
VALUES ('엑소좀', '스킨부스터', 'exosome', NULL, true,
        ARRAY['exosome']::text[], ARRAY['exosome','extracellular vesicle']::text[])
ON CONFLICT (ko) DO UPDATE SET
  category = EXCLUDED.category,
  en = COALESCE(EXCLUDED.en, tag_dictionary.en),
  parent_ko = COALESCE(EXCLUDED.parent_ko, tag_dictionary.parent_ko),
  is_procedure = true,
  aliases = COALESCE(EXCLUDED.aliases, tag_dictionary.aliases),
  pubmed_keywords = COALESCE(EXCLUDED.pubmed_keywords, tag_dictionary.pubmed_keywords),
  updated_at = now();

INSERT INTO public.tag_dictionary (ko, category, en, parent_ko, is_procedure, aliases, pubmed_keywords)
VALUES ('잘루프로', '스킨부스터', 'jalupro', NULL, true,
        ARRAY['Jalupro']::text[], ARRAY['amino acids','hyaluronic acid','skin booster']::text[])
ON CONFLICT (ko) DO UPDATE SET
  category = EXCLUDED.category,
  en = COALESCE(EXCLUDED.en, tag_dictionary.en),
  parent_ko = COALESCE(EXCLUDED.parent_ko, tag_dictionary.parent_ko),
  is_procedure = true,
  aliases = COALESCE(EXCLUDED.aliases, tag_dictionary.aliases),
  pubmed_keywords = COALESCE(EXCLUDED.pubmed_keywords, tag_dictionary.pubmed_keywords),
  updated_at = now();

INSERT INTO public.tag_dictionary (ko, category, en, parent_ko, is_procedure, aliases, pubmed_keywords)
VALUES ('쥬베룩', '스킨부스터', 'juvelook', NULL, true,
        ARRAY['Juvelook']::text[], ARRAY['poly-D,L-lactic acid','PDLLA','collagen stimulator']::text[])
ON CONFLICT (ko) DO UPDATE SET
  category = EXCLUDED.category,
  en = COALESCE(EXCLUDED.en, tag_dictionary.en),
  parent_ko = COALESCE(EXCLUDED.parent_ko, tag_dictionary.parent_ko),
  is_procedure = true,
  aliases = COALESCE(EXCLUDED.aliases, tag_dictionary.aliases),
  pubmed_keywords = COALESCE(EXCLUDED.pubmed_keywords, tag_dictionary.pubmed_keywords),
  updated_at = now();

INSERT INTO public.tag_dictionary (ko, category, en, parent_ko, is_procedure, aliases, pubmed_keywords)
VALUES ('프로파일로', '스킨부스터', 'profhilo', NULL, true,
        ARRAY['Profhilo']::text[], ARRAY['Profhilo','hyaluronic acid','bio-remodelling']::text[])
ON CONFLICT (ko) DO UPDATE SET
  category = EXCLUDED.category,
  en = COALESCE(EXCLUDED.en, tag_dictionary.en),
  parent_ko = COALESCE(EXCLUDED.parent_ko, tag_dictionary.parent_ko),
  is_procedure = true,
  aliases = COALESCE(EXCLUDED.aliases, tag_dictionary.aliases),
  pubmed_keywords = COALESCE(EXCLUDED.pubmed_keywords, tag_dictionary.pubmed_keywords),
  updated_at = now();

INSERT INTO public.tag_dictionary (ko, category, en, parent_ko, is_procedure, aliases, pubmed_keywords)
VALUES ('핑크주사', '스킨부스터', 'pink-injection', NULL, true,
        ARRAY['pink injection']::text[], NULL)
ON CONFLICT (ko) DO UPDATE SET
  category = EXCLUDED.category,
  en = COALESCE(EXCLUDED.en, tag_dictionary.en),
  parent_ko = COALESCE(EXCLUDED.parent_ko, tag_dictionary.parent_ko),
  is_procedure = true,
  aliases = COALESCE(EXCLUDED.aliases, tag_dictionary.aliases),
  pubmed_keywords = COALESCE(EXCLUDED.pubmed_keywords, tag_dictionary.pubmed_keywords),
  updated_at = now();

INSERT INTO public.tag_dictionary (ko, category, en, parent_ko, is_procedure, aliases, pubmed_keywords)
VALUES ('하이디알', '스킨부스터', 'hyadial', NULL, true,
        ARRAY['Hyadial','PDRN injection']::text[], ARRAY['polydeoxyribonucleotide','PDRN','skin booster']::text[])
ON CONFLICT (ko) DO UPDATE SET
  category = EXCLUDED.category,
  en = COALESCE(EXCLUDED.en, tag_dictionary.en),
  parent_ko = COALESCE(EXCLUDED.parent_ko, tag_dictionary.parent_ko),
  is_procedure = true,
  aliases = COALESCE(EXCLUDED.aliases, tag_dictionary.aliases),
  pubmed_keywords = COALESCE(EXCLUDED.pubmed_keywords, tag_dictionary.pubmed_keywords),
  updated_at = now();

INSERT INTO public.tag_dictionary (ko, category, en, parent_ko, is_procedure, aliases, pubmed_keywords)
VALUES ('힐로웨이브', '스킨부스터', 'hilowave', NULL, true,
        ARRAY['Hilowave']::text[], ARRAY['hyaluronic acid','skin booster']::text[])
ON CONFLICT (ko) DO UPDATE SET
  category = EXCLUDED.category,
  en = COALESCE(EXCLUDED.en, tag_dictionary.en),
  parent_ko = COALESCE(EXCLUDED.parent_ko, tag_dictionary.parent_ko),
  is_procedure = true,
  aliases = COALESCE(EXCLUDED.aliases, tag_dictionary.aliases),
  pubmed_keywords = COALESCE(EXCLUDED.pubmed_keywords, tag_dictionary.pubmed_keywords),
  updated_at = now();

INSERT INTO public.tag_dictionary (ko, category, en, parent_ko, is_procedure, aliases, pubmed_keywords)
VALUES ('PDRN', '스킨부스터', 'pdrn', NULL, true,
        ARRAY['polydeoxyribonucleotide']::text[], ARRAY['polydeoxyribonucleotide','PDRN']::text[])
ON CONFLICT (ko) DO UPDATE SET
  category = EXCLUDED.category,
  en = COALESCE(EXCLUDED.en, tag_dictionary.en),
  parent_ko = COALESCE(EXCLUDED.parent_ko, tag_dictionary.parent_ko),
  is_procedure = true,
  aliases = COALESCE(EXCLUDED.aliases, tag_dictionary.aliases),
  pubmed_keywords = COALESCE(EXCLUDED.pubmed_keywords, tag_dictionary.pubmed_keywords),
  updated_at = now();

INSERT INTO public.tag_dictionary (ko, category, en, parent_ko, is_procedure, aliases, pubmed_keywords)
VALUES ('PRP', '스킨부스터', 'prp', NULL, true,
        ARRAY['platelet-rich plasma']::text[], ARRAY['platelet-rich plasma','PRP']::text[])
ON CONFLICT (ko) DO UPDATE SET
  category = EXCLUDED.category,
  en = COALESCE(EXCLUDED.en, tag_dictionary.en),
  parent_ko = COALESCE(EXCLUDED.parent_ko, tag_dictionary.parent_ko),
  is_procedure = true,
  aliases = COALESCE(EXCLUDED.aliases, tag_dictionary.aliases),
  pubmed_keywords = COALESCE(EXCLUDED.pubmed_keywords, tag_dictionary.pubmed_keywords),
  updated_at = now();

INSERT INTO public.tag_dictionary (ko, category, en, parent_ko, is_procedure, aliases, pubmed_keywords)
VALUES ('볼류마이저', '필러·볼륨', 'volumizer', NULL, true,
        ARRAY['volumizer']::text[], NULL)
ON CONFLICT (ko) DO UPDATE SET
  category = EXCLUDED.category,
  en = COALESCE(EXCLUDED.en, tag_dictionary.en),
  parent_ko = COALESCE(EXCLUDED.parent_ko, tag_dictionary.parent_ko),
  is_procedure = true,
  aliases = COALESCE(EXCLUDED.aliases, tag_dictionary.aliases),
  pubmed_keywords = COALESCE(EXCLUDED.pubmed_keywords, tag_dictionary.pubmed_keywords),
  updated_at = now();

INSERT INTO public.tag_dictionary (ko, category, en, parent_ko, is_procedure, aliases, pubmed_keywords)
VALUES ('래디어스', '필러·볼륨', 'radiesse', NULL, true,
        ARRAY['Radiesse']::text[], ARRAY['Radiesse','calcium hydroxylapatite','CaHA']::text[])
ON CONFLICT (ko) DO UPDATE SET
  category = EXCLUDED.category,
  en = COALESCE(EXCLUDED.en, tag_dictionary.en),
  parent_ko = COALESCE(EXCLUDED.parent_ko, tag_dictionary.parent_ko),
  is_procedure = true,
  aliases = COALESCE(EXCLUDED.aliases, tag_dictionary.aliases),
  pubmed_keywords = COALESCE(EXCLUDED.pubmed_keywords, tag_dictionary.pubmed_keywords),
  updated_at = now();

INSERT INTO public.tag_dictionary (ko, category, en, parent_ko, is_procedure, aliases, pubmed_keywords)
VALUES ('레니스나', '필러·볼륨', 'lenisna', NULL, true,
        ARRAY['Lenisna']::text[], ARRAY['poly-D,L-lactic acid','PDLLA','collagen stimulator']::text[])
ON CONFLICT (ko) DO UPDATE SET
  category = EXCLUDED.category,
  en = COALESCE(EXCLUDED.en, tag_dictionary.en),
  parent_ko = COALESCE(EXCLUDED.parent_ko, tag_dictionary.parent_ko),
  is_procedure = true,
  aliases = COALESCE(EXCLUDED.aliases, tag_dictionary.aliases),
  pubmed_keywords = COALESCE(EXCLUDED.pubmed_keywords, tag_dictionary.pubmed_keywords),
  updated_at = now();

INSERT INTO public.tag_dictionary (ko, category, en, parent_ko, is_procedure, aliases, pubmed_keywords)
VALUES ('스컬트라', '필러·볼륨', 'sculptra', NULL, true,
        ARRAY['Sculptra','스컬프트라']::text[], ARRAY['Sculptra','poly-L-lactic acid','PLLA']::text[])
ON CONFLICT (ko) DO UPDATE SET
  category = EXCLUDED.category,
  en = COALESCE(EXCLUDED.en, tag_dictionary.en),
  parent_ko = COALESCE(EXCLUDED.parent_ko, tag_dictionary.parent_ko),
  is_procedure = true,
  aliases = COALESCE(EXCLUDED.aliases, tag_dictionary.aliases),
  pubmed_keywords = COALESCE(EXCLUDED.pubmed_keywords, tag_dictionary.pubmed_keywords),
  updated_at = now();

INSERT INTO public.tag_dictionary (ko, category, en, parent_ko, is_procedure, aliases, pubmed_keywords)
VALUES ('에스테필', '필러·볼륨', 'esthefill', NULL, true,
        ARRAY['Esthefill']::text[], ARRAY['poly-D,L-lactic acid','PDLLA','collagen stimulator']::text[])
ON CONFLICT (ko) DO UPDATE SET
  category = EXCLUDED.category,
  en = COALESCE(EXCLUDED.en, tag_dictionary.en),
  parent_ko = COALESCE(EXCLUDED.parent_ko, tag_dictionary.parent_ko),
  is_procedure = true,
  aliases = COALESCE(EXCLUDED.aliases, tag_dictionary.aliases),
  pubmed_keywords = COALESCE(EXCLUDED.pubmed_keywords, tag_dictionary.pubmed_keywords),
  updated_at = now();

INSERT INTO public.tag_dictionary (ko, category, en, parent_ko, is_procedure, aliases, pubmed_keywords)
VALUES ('엘란쎄', '필러·볼륨', 'ellanse', NULL, true,
        ARRAY['Ellanse','Ellansé']::text[], ARRAY['Ellanse','polycaprolactone','PCL']::text[])
ON CONFLICT (ko) DO UPDATE SET
  category = EXCLUDED.category,
  en = COALESCE(EXCLUDED.en, tag_dictionary.en),
  parent_ko = COALESCE(EXCLUDED.parent_ko, tag_dictionary.parent_ko),
  is_procedure = true,
  aliases = COALESCE(EXCLUDED.aliases, tag_dictionary.aliases),
  pubmed_keywords = COALESCE(EXCLUDED.pubmed_keywords, tag_dictionary.pubmed_keywords),
  updated_at = now();

INSERT INTO public.tag_dictionary (ko, category, en, parent_ko, is_procedure, aliases, pubmed_keywords)
VALUES ('올리디아365', '필러·볼륨', 'oledia-365', NULL, true,
        ARRAY['Oledia 365','Oledia']::text[], ARRAY['poly-L-lactic acid','PLLA','collagen stimulator']::text[])
ON CONFLICT (ko) DO UPDATE SET
  category = EXCLUDED.category,
  en = COALESCE(EXCLUDED.en, tag_dictionary.en),
  parent_ko = COALESCE(EXCLUDED.parent_ko, tag_dictionary.parent_ko),
  is_procedure = true,
  aliases = COALESCE(EXCLUDED.aliases, tag_dictionary.aliases),
  pubmed_keywords = COALESCE(EXCLUDED.pubmed_keywords, tag_dictionary.pubmed_keywords),
  updated_at = now();

INSERT INTO public.tag_dictionary (ko, category, en, parent_ko, is_procedure, aliases, pubmed_keywords)
VALUES ('지방이식', '필러·볼륨', 'fat-grafting', NULL, true,
        ARRAY['fat grafting','fat transfer']::text[], ARRAY['autologous fat grafting','fat transfer','lipofilling']::text[])
ON CONFLICT (ko) DO UPDATE SET
  category = EXCLUDED.category,
  en = COALESCE(EXCLUDED.en, tag_dictionary.en),
  parent_ko = COALESCE(EXCLUDED.parent_ko, tag_dictionary.parent_ko),
  is_procedure = true,
  aliases = COALESCE(EXCLUDED.aliases, tag_dictionary.aliases),
  pubmed_keywords = COALESCE(EXCLUDED.pubmed_keywords, tag_dictionary.pubmed_keywords),
  updated_at = now();

INSERT INTO public.tag_dictionary (ko, category, en, parent_ko, is_procedure, aliases, pubmed_keywords)
VALUES ('필러', '필러·볼륨', 'filler', NULL, true,
        ARRAY['dermal filler','filler']::text[], ARRAY['dermal filler','hyaluronic acid filler']::text[])
ON CONFLICT (ko) DO UPDATE SET
  category = EXCLUDED.category,
  en = COALESCE(EXCLUDED.en, tag_dictionary.en),
  parent_ko = COALESCE(EXCLUDED.parent_ko, tag_dictionary.parent_ko),
  is_procedure = true,
  aliases = COALESCE(EXCLUDED.aliases, tag_dictionary.aliases),
  pubmed_keywords = COALESCE(EXCLUDED.pubmed_keywords, tag_dictionary.pubmed_keywords),
  updated_at = now();

INSERT INTO public.tag_dictionary (ko, category, en, parent_ko, is_procedure, aliases, pubmed_keywords)
VALUES ('뉴라미스', '필러·볼륨', 'neuramis', NULL, true,
        ARRAY['Neuramis']::text[], ARRAY['hyaluronic acid filler']::text[])
ON CONFLICT (ko) DO UPDATE SET
  category = EXCLUDED.category,
  en = COALESCE(EXCLUDED.en, tag_dictionary.en),
  parent_ko = COALESCE(EXCLUDED.parent_ko, tag_dictionary.parent_ko),
  is_procedure = true,
  aliases = COALESCE(EXCLUDED.aliases, tag_dictionary.aliases),
  pubmed_keywords = COALESCE(EXCLUDED.pubmed_keywords, tag_dictionary.pubmed_keywords),
  updated_at = now();

INSERT INTO public.tag_dictionary (ko, category, en, parent_ko, is_procedure, aliases, pubmed_keywords)
VALUES ('더채움', '필러·볼륨', 'the-chaeum', NULL, true,
        ARRAY['The Chaeum','Chaeum']::text[], ARRAY['hyaluronic acid filler']::text[])
ON CONFLICT (ko) DO UPDATE SET
  category = EXCLUDED.category,
  en = COALESCE(EXCLUDED.en, tag_dictionary.en),
  parent_ko = COALESCE(EXCLUDED.parent_ko, tag_dictionary.parent_ko),
  is_procedure = true,
  aliases = COALESCE(EXCLUDED.aliases, tag_dictionary.aliases),
  pubmed_keywords = COALESCE(EXCLUDED.pubmed_keywords, tag_dictionary.pubmed_keywords),
  updated_at = now();

INSERT INTO public.tag_dictionary (ko, category, en, parent_ko, is_procedure, aliases, pubmed_keywords)
VALUES ('레스틸렌', '필러·볼륨', 'restylane', NULL, true,
        ARRAY['Restylane','레스틸레인']::text[], ARRAY['Restylane','hyaluronic acid filler']::text[])
ON CONFLICT (ko) DO UPDATE SET
  category = EXCLUDED.category,
  en = COALESCE(EXCLUDED.en, tag_dictionary.en),
  parent_ko = COALESCE(EXCLUDED.parent_ko, tag_dictionary.parent_ko),
  is_procedure = true,
  aliases = COALESCE(EXCLUDED.aliases, tag_dictionary.aliases),
  pubmed_keywords = COALESCE(EXCLUDED.pubmed_keywords, tag_dictionary.pubmed_keywords),
  updated_at = now();

INSERT INTO public.tag_dictionary (ko, category, en, parent_ko, is_procedure, aliases, pubmed_keywords)
VALUES ('벨로테로', '필러·볼륨', 'belotero', NULL, true,
        ARRAY['Belotero']::text[], ARRAY['hyaluronic acid filler']::text[])
ON CONFLICT (ko) DO UPDATE SET
  category = EXCLUDED.category,
  en = COALESCE(EXCLUDED.en, tag_dictionary.en),
  parent_ko = COALESCE(EXCLUDED.parent_ko, tag_dictionary.parent_ko),
  is_procedure = true,
  aliases = COALESCE(EXCLUDED.aliases, tag_dictionary.aliases),
  pubmed_keywords = COALESCE(EXCLUDED.pubmed_keywords, tag_dictionary.pubmed_keywords),
  updated_at = now();

INSERT INTO public.tag_dictionary (ko, category, en, parent_ko, is_procedure, aliases, pubmed_keywords)
VALUES ('이브아르', '필러·볼륨', 'yvoire', NULL, true,
        ARRAY['Yvoire']::text[], ARRAY['hyaluronic acid filler']::text[])
ON CONFLICT (ko) DO UPDATE SET
  category = EXCLUDED.category,
  en = COALESCE(EXCLUDED.en, tag_dictionary.en),
  parent_ko = COALESCE(EXCLUDED.parent_ko, tag_dictionary.parent_ko),
  is_procedure = true,
  aliases = COALESCE(EXCLUDED.aliases, tag_dictionary.aliases),
  pubmed_keywords = COALESCE(EXCLUDED.pubmed_keywords, tag_dictionary.pubmed_keywords),
  updated_at = now();

INSERT INTO public.tag_dictionary (ko, category, en, parent_ko, is_procedure, aliases, pubmed_keywords)
VALUES ('쥬비덤', '필러·볼륨', 'juvederm', NULL, true,
        ARRAY['Juvederm','Juvéderm']::text[], ARRAY['Juvederm','hyaluronic acid filler']::text[])
ON CONFLICT (ko) DO UPDATE SET
  category = EXCLUDED.category,
  en = COALESCE(EXCLUDED.en, tag_dictionary.en),
  parent_ko = COALESCE(EXCLUDED.parent_ko, tag_dictionary.parent_ko),
  is_procedure = true,
  aliases = COALESCE(EXCLUDED.aliases, tag_dictionary.aliases),
  pubmed_keywords = COALESCE(EXCLUDED.pubmed_keywords, tag_dictionary.pubmed_keywords),
  updated_at = now();

INSERT INTO public.tag_dictionary (ko, category, en, parent_ko, is_procedure, aliases, pubmed_keywords)
VALUES ('클레비엘', '필러·볼륨', 'cleviel', NULL, true,
        ARRAY['Cleviel']::text[], ARRAY['hyaluronic acid filler']::text[])
ON CONFLICT (ko) DO UPDATE SET
  category = EXCLUDED.category,
  en = COALESCE(EXCLUDED.en, tag_dictionary.en),
  parent_ko = COALESCE(EXCLUDED.parent_ko, tag_dictionary.parent_ko),
  is_procedure = true,
  aliases = COALESCE(EXCLUDED.aliases, tag_dictionary.aliases),
  pubmed_keywords = COALESCE(EXCLUDED.pubmed_keywords, tag_dictionary.pubmed_keywords),
  updated_at = now();

INSERT INTO public.tag_dictionary (ko, category, en, parent_ko, is_procedure, aliases, pubmed_keywords)
VALUES ('테오시알', '필러·볼륨', 'teosyal', NULL, true,
        ARRAY['Teosyal']::text[], ARRAY['hyaluronic acid filler']::text[])
ON CONFLICT (ko) DO UPDATE SET
  category = EXCLUDED.category,
  en = COALESCE(EXCLUDED.en, tag_dictionary.en),
  parent_ko = COALESCE(EXCLUDED.parent_ko, tag_dictionary.parent_ko),
  is_procedure = true,
  aliases = COALESCE(EXCLUDED.aliases, tag_dictionary.aliases),
  pubmed_keywords = COALESCE(EXCLUDED.pubmed_keywords, tag_dictionary.pubmed_keywords),
  updated_at = now();

INSERT INTO public.tag_dictionary (ko, category, en, parent_ko, is_procedure, aliases, pubmed_keywords)
VALUES ('보톡스', '주름·윤곽', 'botox', NULL, true,
        ARRAY['Botox']::text[], ARRAY['botulinum toxin type A','onabotulinumtoxinA']::text[])
ON CONFLICT (ko) DO UPDATE SET
  category = EXCLUDED.category,
  en = COALESCE(EXCLUDED.en, tag_dictionary.en),
  parent_ko = COALESCE(EXCLUDED.parent_ko, tag_dictionary.parent_ko),
  is_procedure = true,
  aliases = COALESCE(EXCLUDED.aliases, tag_dictionary.aliases),
  pubmed_keywords = COALESCE(EXCLUDED.pubmed_keywords, tag_dictionary.pubmed_keywords),
  updated_at = now();

INSERT INTO public.tag_dictionary (ko, category, en, parent_ko, is_procedure, aliases, pubmed_keywords)
VALUES ('나보타', '주름·윤곽', 'nabota', NULL, true,
        ARRAY['Nabota','Jeuveau','Nuceiva']::text[], ARRAY['prabotulinumtoxinA','botulinum toxin type A']::text[])
ON CONFLICT (ko) DO UPDATE SET
  category = EXCLUDED.category,
  en = COALESCE(EXCLUDED.en, tag_dictionary.en),
  parent_ko = COALESCE(EXCLUDED.parent_ko, tag_dictionary.parent_ko),
  is_procedure = true,
  aliases = COALESCE(EXCLUDED.aliases, tag_dictionary.aliases),
  pubmed_keywords = COALESCE(EXCLUDED.pubmed_keywords, tag_dictionary.pubmed_keywords),
  updated_at = now();

INSERT INTO public.tag_dictionary (ko, category, en, parent_ko, is_procedure, aliases, pubmed_keywords)
VALUES ('뉴럭스', '주름·윤곽', 'newlux', NULL, true,
        ARRAY['Newlux','NEWLUX']::text[], ARRAY['botulinum toxin type A']::text[])
ON CONFLICT (ko) DO UPDATE SET
  category = EXCLUDED.category,
  en = COALESCE(EXCLUDED.en, tag_dictionary.en),
  parent_ko = COALESCE(EXCLUDED.parent_ko, tag_dictionary.parent_ko),
  is_procedure = true,
  aliases = COALESCE(EXCLUDED.aliases, tag_dictionary.aliases),
  pubmed_keywords = COALESCE(EXCLUDED.pubmed_keywords, tag_dictionary.pubmed_keywords),
  updated_at = now();

INSERT INTO public.tag_dictionary (ko, category, en, parent_ko, is_procedure, aliases, pubmed_keywords)
VALUES ('디스포트', '주름·윤곽', 'dysport', NULL, true,
        ARRAY['Dysport','Azzalure']::text[], ARRAY['abobotulinumtoxinA','botulinum toxin type A']::text[])
ON CONFLICT (ko) DO UPDATE SET
  category = EXCLUDED.category,
  en = COALESCE(EXCLUDED.en, tag_dictionary.en),
  parent_ko = COALESCE(EXCLUDED.parent_ko, tag_dictionary.parent_ko),
  is_procedure = true,
  aliases = COALESCE(EXCLUDED.aliases, tag_dictionary.aliases),
  pubmed_keywords = COALESCE(EXCLUDED.pubmed_keywords, tag_dictionary.pubmed_keywords),
  updated_at = now();

INSERT INTO public.tag_dictionary (ko, category, en, parent_ko, is_procedure, aliases, pubmed_keywords)
VALUES ('리즈톡스', '주름·윤곽', 'liztox', NULL, true,
        ARRAY['Liztox']::text[], ARRAY['botulinum toxin type A']::text[])
ON CONFLICT (ko) DO UPDATE SET
  category = EXCLUDED.category,
  en = COALESCE(EXCLUDED.en, tag_dictionary.en),
  parent_ko = COALESCE(EXCLUDED.parent_ko, tag_dictionary.parent_ko),
  is_procedure = true,
  aliases = COALESCE(EXCLUDED.aliases, tag_dictionary.aliases),
  pubmed_keywords = COALESCE(EXCLUDED.pubmed_keywords, tag_dictionary.pubmed_keywords),
  updated_at = now();

INSERT INTO public.tag_dictionary (ko, category, en, parent_ko, is_procedure, aliases, pubmed_keywords)
VALUES ('메디톡신', '주름·윤곽', 'meditoxin', NULL, true,
        ARRAY['Meditoxin','Neuronox']::text[], ARRAY['Meditoxin','Neuronox','botulinum toxin type A']::text[])
ON CONFLICT (ko) DO UPDATE SET
  category = EXCLUDED.category,
  en = COALESCE(EXCLUDED.en, tag_dictionary.en),
  parent_ko = COALESCE(EXCLUDED.parent_ko, tag_dictionary.parent_ko),
  is_procedure = true,
  aliases = COALESCE(EXCLUDED.aliases, tag_dictionary.aliases),
  pubmed_keywords = COALESCE(EXCLUDED.pubmed_keywords, tag_dictionary.pubmed_keywords),
  updated_at = now();

INSERT INTO public.tag_dictionary (ko, category, en, parent_ko, is_procedure, aliases, pubmed_keywords)
VALUES ('보툴렉스', '주름·윤곽', 'botulax', NULL, true,
        ARRAY['Botulax','Letybo']::text[], ARRAY['letibotulinumtoxinA','botulinum toxin type A']::text[])
ON CONFLICT (ko) DO UPDATE SET
  category = EXCLUDED.category,
  en = COALESCE(EXCLUDED.en, tag_dictionary.en),
  parent_ko = COALESCE(EXCLUDED.parent_ko, tag_dictionary.parent_ko),
  is_procedure = true,
  aliases = COALESCE(EXCLUDED.aliases, tag_dictionary.aliases),
  pubmed_keywords = COALESCE(EXCLUDED.pubmed_keywords, tag_dictionary.pubmed_keywords),
  updated_at = now();

INSERT INTO public.tag_dictionary (ko, category, en, parent_ko, is_procedure, aliases, pubmed_keywords)
VALUES ('원더톡스', '주름·윤곽', 'wondertox', NULL, true,
        ARRAY['Wondertox']::text[], ARRAY['botulinum toxin type A']::text[])
ON CONFLICT (ko) DO UPDATE SET
  category = EXCLUDED.category,
  en = COALESCE(EXCLUDED.en, tag_dictionary.en),
  parent_ko = COALESCE(EXCLUDED.parent_ko, tag_dictionary.parent_ko),
  is_procedure = true,
  aliases = COALESCE(EXCLUDED.aliases, tag_dictionary.aliases),
  pubmed_keywords = COALESCE(EXCLUDED.pubmed_keywords, tag_dictionary.pubmed_keywords),
  updated_at = now();

INSERT INTO public.tag_dictionary (ko, category, en, parent_ko, is_procedure, aliases, pubmed_keywords)
VALUES ('이노톡스', '주름·윤곽', 'innotox', NULL, true,
        ARRAY['Innotox']::text[], ARRAY['botulinum toxin type A','liquid botulinum toxin']::text[])
ON CONFLICT (ko) DO UPDATE SET
  category = EXCLUDED.category,
  en = COALESCE(EXCLUDED.en, tag_dictionary.en),
  parent_ko = COALESCE(EXCLUDED.parent_ko, tag_dictionary.parent_ko),
  is_procedure = true,
  aliases = COALESCE(EXCLUDED.aliases, tag_dictionary.aliases),
  pubmed_keywords = COALESCE(EXCLUDED.pubmed_keywords, tag_dictionary.pubmed_keywords),
  updated_at = now();

INSERT INTO public.tag_dictionary (ko, category, en, parent_ko, is_procedure, aliases, pubmed_keywords)
VALUES ('제오민', '주름·윤곽', 'xeomin', NULL, true,
        ARRAY['Xeomin','Bocouture']::text[], ARRAY['incobotulinumtoxinA','botulinum toxin type A']::text[])
ON CONFLICT (ko) DO UPDATE SET
  category = EXCLUDED.category,
  en = COALESCE(EXCLUDED.en, tag_dictionary.en),
  parent_ko = COALESCE(EXCLUDED.parent_ko, tag_dictionary.parent_ko),
  is_procedure = true,
  aliases = COALESCE(EXCLUDED.aliases, tag_dictionary.aliases),
  pubmed_keywords = COALESCE(EXCLUDED.pubmed_keywords, tag_dictionary.pubmed_keywords),
  updated_at = now();

INSERT INTO public.tag_dictionary (ko, category, en, parent_ko, is_procedure, aliases, pubmed_keywords)
VALUES ('코어톡스', '주름·윤곽', 'coretox', NULL, true,
        ARRAY['Coretox']::text[], ARRAY['botulinum toxin type A']::text[])
ON CONFLICT (ko) DO UPDATE SET
  category = EXCLUDED.category,
  en = COALESCE(EXCLUDED.en, tag_dictionary.en),
  parent_ko = COALESCE(EXCLUDED.parent_ko, tag_dictionary.parent_ko),
  is_procedure = true,
  aliases = COALESCE(EXCLUDED.aliases, tag_dictionary.aliases),
  pubmed_keywords = COALESCE(EXCLUDED.pubmed_keywords, tag_dictionary.pubmed_keywords),
  updated_at = now();

INSERT INTO public.tag_dictionary (ko, category, en, parent_ko, is_procedure, aliases, pubmed_keywords)
VALUES ('휴톡스', '주름·윤곽', 'hutox', NULL, true,
        ARRAY['Hutox']::text[], ARRAY['botulinum toxin type A']::text[])
ON CONFLICT (ko) DO UPDATE SET
  category = EXCLUDED.category,
  en = COALESCE(EXCLUDED.en, tag_dictionary.en),
  parent_ko = COALESCE(EXCLUDED.parent_ko, tag_dictionary.parent_ko),
  is_procedure = true,
  aliases = COALESCE(EXCLUDED.aliases, tag_dictionary.aliases),
  pubmed_keywords = COALESCE(EXCLUDED.pubmed_keywords, tag_dictionary.pubmed_keywords),
  updated_at = now();

INSERT INTO public.tag_dictionary (ko, category, en, parent_ko, is_procedure, aliases, pubmed_keywords)
VALUES ('엘싸', '주름·윤곽', 'lssa', NULL, true,
        ARRAY['LSSA']::text[], ARRAY['ultrasound-assisted liposuction','ultrasound-assisted lipoplasty','liposuction']::text[])
ON CONFLICT (ko) DO UPDATE SET
  category = EXCLUDED.category,
  en = COALESCE(EXCLUDED.en, tag_dictionary.en),
  parent_ko = COALESCE(EXCLUDED.parent_ko, tag_dictionary.parent_ko),
  is_procedure = true,
  aliases = COALESCE(EXCLUDED.aliases, tag_dictionary.aliases),
  pubmed_keywords = COALESCE(EXCLUDED.pubmed_keywords, tag_dictionary.pubmed_keywords),
  updated_at = now();

INSERT INTO public.tag_dictionary (ko, category, en, parent_ko, is_procedure, aliases, pubmed_keywords)
VALUES ('쥬브젠', '주름·윤곽', 'juvgen', NULL, true,
        ARRAY['Juvgen','JUVEGEN']::text[], ARRAY['carbon dioxide','hyaluronic acid','collagen induction']::text[])
ON CONFLICT (ko) DO UPDATE SET
  category = EXCLUDED.category,
  en = COALESCE(EXCLUDED.en, tag_dictionary.en),
  parent_ko = COALESCE(EXCLUDED.parent_ko, tag_dictionary.parent_ko),
  is_procedure = true,
  aliases = COALESCE(EXCLUDED.aliases, tag_dictionary.aliases),
  pubmed_keywords = COALESCE(EXCLUDED.pubmed_keywords, tag_dictionary.pubmed_keywords),
  updated_at = now();

INSERT INTO public.tag_dictionary (ko, category, en, parent_ko, is_procedure, aliases, pubmed_keywords)
VALUES ('지방분해주사', '주름·윤곽', 'lipolysis-injection', NULL, true,
        ARRAY['lipolysis injection','fat dissolving injection']::text[], ARRAY['injection lipolysis','phosphatidylcholine','deoxycholic acid']::text[])
ON CONFLICT (ko) DO UPDATE SET
  category = EXCLUDED.category,
  en = COALESCE(EXCLUDED.en, tag_dictionary.en),
  parent_ko = COALESCE(EXCLUDED.parent_ko, tag_dictionary.parent_ko),
  is_procedure = true,
  aliases = COALESCE(EXCLUDED.aliases, tag_dictionary.aliases),
  pubmed_keywords = COALESCE(EXCLUDED.pubmed_keywords, tag_dictionary.pubmed_keywords),
  updated_at = now();

INSERT INTO public.tag_dictionary (ko, category, en, parent_ko, is_procedure, aliases, pubmed_keywords)
VALUES ('브이올렛', '주름·윤곽', 'volet', NULL, true,
        ARRAY['V-olet','Violet']::text[], ARRAY['deoxycholic acid','submental fat']::text[])
ON CONFLICT (ko) DO UPDATE SET
  category = EXCLUDED.category,
  en = COALESCE(EXCLUDED.en, tag_dictionary.en),
  parent_ko = COALESCE(EXCLUDED.parent_ko, tag_dictionary.parent_ko),
  is_procedure = true,
  aliases = COALESCE(EXCLUDED.aliases, tag_dictionary.aliases),
  pubmed_keywords = COALESCE(EXCLUDED.pubmed_keywords, tag_dictionary.pubmed_keywords),
  updated_at = now();

INSERT INTO public.tag_dictionary (ko, category, en, parent_ko, is_procedure, aliases, pubmed_keywords)
VALUES ('검버섯제거', '레이저', 'age-spot-removal', NULL, true,
        ARRAY['seborrheic keratosis removal']::text[], ARRAY['seborrheic keratosis','solar lentigo']::text[])
ON CONFLICT (ko) DO UPDATE SET
  category = EXCLUDED.category,
  en = COALESCE(EXCLUDED.en, tag_dictionary.en),
  parent_ko = COALESCE(EXCLUDED.parent_ko, tag_dictionary.parent_ko),
  is_procedure = true,
  aliases = COALESCE(EXCLUDED.aliases, tag_dictionary.aliases),
  pubmed_keywords = COALESCE(EXCLUDED.pubmed_keywords, tag_dictionary.pubmed_keywords),
  updated_at = now();

INSERT INTO public.tag_dictionary (ko, category, en, parent_ko, is_procedure, aliases, pubmed_keywords)
VALUES ('골드PTT', '레이저', 'gold-ptt', NULL, true,
        ARRAY['Gold PTT','gold photothermal therapy']::text[], ARRAY['gold microparticle','photothermal therapy','sebaceous gland','acne']::text[])
ON CONFLICT (ko) DO UPDATE SET
  category = EXCLUDED.category,
  en = COALESCE(EXCLUDED.en, tag_dictionary.en),
  parent_ko = COALESCE(EXCLUDED.parent_ko, tag_dictionary.parent_ko),
  is_procedure = true,
  aliases = COALESCE(EXCLUDED.aliases, tag_dictionary.aliases),
  pubmed_keywords = COALESCE(EXCLUDED.pubmed_keywords, tag_dictionary.pubmed_keywords),
  updated_at = now();

INSERT INTO public.tag_dictionary (ko, category, en, parent_ko, is_procedure, aliases, pubmed_keywords)
VALUES ('기미레이저', '레이저', 'melasma-laser', NULL, true,
        ARRAY['melasma laser']::text[], ARRAY['melasma','laser toning','Q-switched']::text[])
ON CONFLICT (ko) DO UPDATE SET
  category = EXCLUDED.category,
  en = COALESCE(EXCLUDED.en, tag_dictionary.en),
  parent_ko = COALESCE(EXCLUDED.parent_ko, tag_dictionary.parent_ko),
  is_procedure = true,
  aliases = COALESCE(EXCLUDED.aliases, tag_dictionary.aliases),
  pubmed_keywords = COALESCE(EXCLUDED.pubmed_keywords, tag_dictionary.pubmed_keywords),
  updated_at = now();

INSERT INTO public.tag_dictionary (ko, category, en, parent_ko, is_procedure, aliases, pubmed_keywords)
VALUES ('더마펜', '레이저', 'dermapen', NULL, true,
        ARRAY['Dermapen','microneedling']::text[], ARRAY['microneedling','skin needling']::text[])
ON CONFLICT (ko) DO UPDATE SET
  category = EXCLUDED.category,
  en = COALESCE(EXCLUDED.en, tag_dictionary.en),
  parent_ko = COALESCE(EXCLUDED.parent_ko, tag_dictionary.parent_ko),
  is_procedure = true,
  aliases = COALESCE(EXCLUDED.aliases, tag_dictionary.aliases),
  pubmed_keywords = COALESCE(EXCLUDED.pubmed_keywords, tag_dictionary.pubmed_keywords),
  updated_at = now();

INSERT INTO public.tag_dictionary (ko, category, en, parent_ko, is_procedure, aliases, pubmed_keywords)
VALUES ('라비앙', '레이저', 'lavieen', NULL, true,
        ARRAY['Lavieen','BB Laser']::text[], ARRAY['thulium laser','1927 nm','fractional laser']::text[])
ON CONFLICT (ko) DO UPDATE SET
  category = EXCLUDED.category,
  en = COALESCE(EXCLUDED.en, tag_dictionary.en),
  parent_ko = COALESCE(EXCLUDED.parent_ko, tag_dictionary.parent_ko),
  is_procedure = true,
  aliases = COALESCE(EXCLUDED.aliases, tag_dictionary.aliases),
  pubmed_keywords = COALESCE(EXCLUDED.pubmed_keywords, tag_dictionary.pubmed_keywords),
  updated_at = now();

INSERT INTO public.tag_dictionary (ko, category, en, parent_ko, is_procedure, aliases, pubmed_keywords)
VALUES ('레이저토닝', '레이저', 'laser-toning', NULL, true,
        ARRAY['laser toning']::text[], ARRAY['laser toning','Q-switched Nd:YAG','melasma']::text[])
ON CONFLICT (ko) DO UPDATE SET
  category = EXCLUDED.category,
  en = COALESCE(EXCLUDED.en, tag_dictionary.en),
  parent_ko = COALESCE(EXCLUDED.parent_ko, tag_dictionary.parent_ko),
  is_procedure = true,
  aliases = COALESCE(EXCLUDED.aliases, tag_dictionary.aliases),
  pubmed_keywords = COALESCE(EXCLUDED.pubmed_keywords, tag_dictionary.pubmed_keywords),
  updated_at = now();

INSERT INTO public.tag_dictionary (ko, category, en, parent_ko, is_procedure, aliases, pubmed_keywords)
VALUES ('모피어스8', '레이저', 'morpheus8', NULL, true,
        ARRAY['Morpheus8']::text[], ARRAY['Morpheus8','fractional radiofrequency microneedling','radiofrequency microneedling']::text[])
ON CONFLICT (ko) DO UPDATE SET
  category = EXCLUDED.category,
  en = COALESCE(EXCLUDED.en, tag_dictionary.en),
  parent_ko = COALESCE(EXCLUDED.parent_ko, tag_dictionary.parent_ko),
  is_procedure = true,
  aliases = COALESCE(EXCLUDED.aliases, tag_dictionary.aliases),
  pubmed_keywords = COALESCE(EXCLUDED.pubmed_keywords, tag_dictionary.pubmed_keywords),
  updated_at = now();

INSERT INTO public.tag_dictionary (ko, category, en, parent_ko, is_procedure, aliases, pubmed_keywords)
VALUES ('문신제거', '레이저', 'tattoo-removal', NULL, true,
        ARRAY['tattoo removal']::text[], ARRAY['tattoo removal','Q-switched laser','picosecond laser']::text[])
ON CONFLICT (ko) DO UPDATE SET
  category = EXCLUDED.category,
  en = COALESCE(EXCLUDED.en, tag_dictionary.en),
  parent_ko = COALESCE(EXCLUDED.parent_ko, tag_dictionary.parent_ko),
  is_procedure = true,
  aliases = COALESCE(EXCLUDED.aliases, tag_dictionary.aliases),
  pubmed_keywords = COALESCE(EXCLUDED.pubmed_keywords, tag_dictionary.pubmed_keywords),
  updated_at = now();

INSERT INTO public.tag_dictionary (ko, category, en, parent_ko, is_procedure, aliases, pubmed_keywords)
VALUES ('브이빔', '레이저', 'vbeam', NULL, true,
        ARRAY['Vbeam']::text[], ARRAY['pulsed dye laser','PDL','595 nm']::text[])
ON CONFLICT (ko) DO UPDATE SET
  category = EXCLUDED.category,
  en = COALESCE(EXCLUDED.en, tag_dictionary.en),
  parent_ko = COALESCE(EXCLUDED.parent_ko, tag_dictionary.parent_ko),
  is_procedure = true,
  aliases = COALESCE(EXCLUDED.aliases, tag_dictionary.aliases),
  pubmed_keywords = COALESCE(EXCLUDED.pubmed_keywords, tag_dictionary.pubmed_keywords),
  updated_at = now();

INSERT INTO public.tag_dictionary (ko, category, en, parent_ko, is_procedure, aliases, pubmed_keywords)
VALUES ('스칼렛', '레이저', 'scarlet', NULL, true,
        ARRAY['Scarlet','Scarlet RF']::text[], ARRAY['radiofrequency microneedling','fractional radiofrequency']::text[])
ON CONFLICT (ko) DO UPDATE SET
  category = EXCLUDED.category,
  en = COALESCE(EXCLUDED.en, tag_dictionary.en),
  parent_ko = COALESCE(EXCLUDED.parent_ko, tag_dictionary.parent_ko),
  is_procedure = true,
  aliases = COALESCE(EXCLUDED.aliases, tag_dictionary.aliases),
  pubmed_keywords = COALESCE(EXCLUDED.pubmed_keywords, tag_dictionary.pubmed_keywords),
  updated_at = now();

INSERT INTO public.tag_dictionary (ko, category, en, parent_ko, is_procedure, aliases, pubmed_keywords)
VALUES ('스펙트라', '레이저', 'spectra', NULL, true,
        ARRAY['Spectra']::text[], ARRAY['Q-switched Nd:YAG laser','laser toning']::text[])
ON CONFLICT (ko) DO UPDATE SET
  category = EXCLUDED.category,
  en = COALESCE(EXCLUDED.en, tag_dictionary.en),
  parent_ko = COALESCE(EXCLUDED.parent_ko, tag_dictionary.parent_ko),
  is_procedure = true,
  aliases = COALESCE(EXCLUDED.aliases, tag_dictionary.aliases),
  pubmed_keywords = COALESCE(EXCLUDED.pubmed_keywords, tag_dictionary.pubmed_keywords),
  updated_at = now();

INSERT INTO public.tag_dictionary (ko, category, en, parent_ko, is_procedure, aliases, pubmed_keywords)
VALUES ('시크릿', '레이저', 'secret', NULL, true,
        ARRAY['Secret RF']::text[], ARRAY['radiofrequency microneedling','fractional radiofrequency']::text[])
ON CONFLICT (ko) DO UPDATE SET
  category = EXCLUDED.category,
  en = COALESCE(EXCLUDED.en, tag_dictionary.en),
  parent_ko = COALESCE(EXCLUDED.parent_ko, tag_dictionary.parent_ko),
  is_procedure = true,
  aliases = COALESCE(EXCLUDED.aliases, tag_dictionary.aliases),
  pubmed_keywords = COALESCE(EXCLUDED.pubmed_keywords, tag_dictionary.pubmed_keywords),
  updated_at = now();

INSERT INTO public.tag_dictionary (ko, category, en, parent_ko, is_procedure, aliases, pubmed_keywords)
VALUES ('실펌X', '레이저', 'sylfirm-x', NULL, true,
        ARRAY['Sylfirm X']::text[], ARRAY['radiofrequency microneedling','Sylfirm']::text[])
ON CONFLICT (ko) DO UPDATE SET
  category = EXCLUDED.category,
  en = COALESCE(EXCLUDED.en, tag_dictionary.en),
  parent_ko = COALESCE(EXCLUDED.parent_ko, tag_dictionary.parent_ko),
  is_procedure = true,
  aliases = COALESCE(EXCLUDED.aliases, tag_dictionary.aliases),
  pubmed_keywords = COALESCE(EXCLUDED.pubmed_keywords, tag_dictionary.pubmed_keywords),
  updated_at = now();

INSERT INTO public.tag_dictionary (ko, category, en, parent_ko, is_procedure, aliases, pubmed_keywords)
VALUES ('아그네스', '레이저', 'agnes', NULL, true,
        ARRAY['Agnes','Agnes RF']::text[], ARRAY['radiofrequency microneedling','acne']::text[])
ON CONFLICT (ko) DO UPDATE SET
  category = EXCLUDED.category,
  en = COALESCE(EXCLUDED.en, tag_dictionary.en),
  parent_ko = COALESCE(EXCLUDED.parent_ko, tag_dictionary.parent_ko),
  is_procedure = true,
  aliases = COALESCE(EXCLUDED.aliases, tag_dictionary.aliases),
  pubmed_keywords = COALESCE(EXCLUDED.pubmed_keywords, tag_dictionary.pubmed_keywords),
  updated_at = now();

INSERT INTO public.tag_dictionary (ko, category, en, parent_ko, is_procedure, aliases, pubmed_keywords)
VALUES ('엑셀V', '레이저', 'excel-v', NULL, true,
        ARRAY['Excel V']::text[], ARRAY['KTP laser','Nd:YAG laser','vascular laser']::text[])
ON CONFLICT (ko) DO UPDATE SET
  category = EXCLUDED.category,
  en = COALESCE(EXCLUDED.en, tag_dictionary.en),
  parent_ko = COALESCE(EXCLUDED.parent_ko, tag_dictionary.parent_ko),
  is_procedure = true,
  aliases = COALESCE(EXCLUDED.aliases, tag_dictionary.aliases),
  pubmed_keywords = COALESCE(EXCLUDED.pubmed_keywords, tag_dictionary.pubmed_keywords),
  updated_at = now();

INSERT INTO public.tag_dictionary (ko, category, en, parent_ko, is_procedure, aliases, pubmed_keywords)
VALUES ('인트라셀', '레이저', 'intracel', NULL, true,
        ARRAY['Intracel']::text[], ARRAY['fractional radiofrequency microneedling','microneedle radiofrequency']::text[])
ON CONFLICT (ko) DO UPDATE SET
  category = EXCLUDED.category,
  en = COALESCE(EXCLUDED.en, tag_dictionary.en),
  parent_ko = COALESCE(EXCLUDED.parent_ko, tag_dictionary.parent_ko),
  is_procedure = true,
  aliases = COALESCE(EXCLUDED.aliases, tag_dictionary.aliases),
  pubmed_keywords = COALESCE(EXCLUDED.pubmed_keywords, tag_dictionary.pubmed_keywords),
  updated_at = now();

INSERT INTO public.tag_dictionary (ko, category, en, parent_ko, is_procedure, aliases, pubmed_keywords)
VALUES ('점제거', '레이저', 'mole-removal', NULL, true,
        ARRAY['mole removal']::text[], ARRAY['melanocytic nevus','CO2 laser','ablative laser']::text[])
ON CONFLICT (ko) DO UPDATE SET
  category = EXCLUDED.category,
  en = COALESCE(EXCLUDED.en, tag_dictionary.en),
  parent_ko = COALESCE(EXCLUDED.parent_ko, tag_dictionary.parent_ko),
  is_procedure = true,
  aliases = COALESCE(EXCLUDED.aliases, tag_dictionary.aliases),
  pubmed_keywords = COALESCE(EXCLUDED.pubmed_keywords, tag_dictionary.pubmed_keywords),
  updated_at = now();

INSERT INTO public.tag_dictionary (ko, category, en, parent_ko, is_procedure, aliases, pubmed_keywords)
VALUES ('제네시스', '레이저', 'genesis', NULL, true,
        ARRAY['Genesis','Laser Genesis']::text[], ARRAY['1064 nm Nd:YAG laser','Laser Genesis']::text[])
ON CONFLICT (ko) DO UPDATE SET
  category = EXCLUDED.category,
  en = COALESCE(EXCLUDED.en, tag_dictionary.en),
  parent_ko = COALESCE(EXCLUDED.parent_ko, tag_dictionary.parent_ko),
  is_procedure = true,
  aliases = COALESCE(EXCLUDED.aliases, tag_dictionary.aliases),
  pubmed_keywords = COALESCE(EXCLUDED.pubmed_keywords, tag_dictionary.pubmed_keywords),
  updated_at = now();

INSERT INTO public.tag_dictionary (ko, category, en, parent_ko, is_procedure, aliases, pubmed_keywords)
VALUES ('제모레이저', '레이저', 'hair-removal-laser', NULL, true,
        ARRAY['hair removal laser','laser hair removal']::text[], ARRAY['laser hair removal','diode laser','alexandrite laser']::text[])
ON CONFLICT (ko) DO UPDATE SET
  category = EXCLUDED.category,
  en = COALESCE(EXCLUDED.en, tag_dictionary.en),
  parent_ko = COALESCE(EXCLUDED.parent_ko, tag_dictionary.parent_ko),
  is_procedure = true,
  aliases = COALESCE(EXCLUDED.aliases, tag_dictionary.aliases),
  pubmed_keywords = COALESCE(EXCLUDED.pubmed_keywords, tag_dictionary.pubmed_keywords),
  updated_at = now();

INSERT INTO public.tag_dictionary (ko, category, en, parent_ko, is_procedure, aliases, pubmed_keywords)
VALUES ('아포지', '레이저', 'apogee', NULL, true,
        ARRAY['Apogee']::text[], ARRAY['alexandrite laser','755 nm','laser hair removal']::text[])
ON CONFLICT (ko) DO UPDATE SET
  category = EXCLUDED.category,
  en = COALESCE(EXCLUDED.en, tag_dictionary.en),
  parent_ko = COALESCE(EXCLUDED.parent_ko, tag_dictionary.parent_ko),
  is_procedure = true,
  aliases = COALESCE(EXCLUDED.aliases, tag_dictionary.aliases),
  pubmed_keywords = COALESCE(EXCLUDED.pubmed_keywords, tag_dictionary.pubmed_keywords),
  updated_at = now();

INSERT INTO public.tag_dictionary (ko, category, en, parent_ko, is_procedure, aliases, pubmed_keywords)
VALUES ('젠틀맥스', '레이저', 'gentlemax', NULL, true,
        ARRAY['GentleMax']::text[], ARRAY['alexandrite laser','Nd:YAG laser','laser hair removal']::text[])
ON CONFLICT (ko) DO UPDATE SET
  category = EXCLUDED.category,
  en = COALESCE(EXCLUDED.en, tag_dictionary.en),
  parent_ko = COALESCE(EXCLUDED.parent_ko, tag_dictionary.parent_ko),
  is_procedure = true,
  aliases = COALESCE(EXCLUDED.aliases, tag_dictionary.aliases),
  pubmed_keywords = COALESCE(EXCLUDED.pubmed_keywords, tag_dictionary.pubmed_keywords),
  updated_at = now();

INSERT INTO public.tag_dictionary (ko, category, en, parent_ko, is_procedure, aliases, pubmed_keywords)
VALUES ('클라리티', '레이저', 'clarity', NULL, true,
        ARRAY['Clarity','Clarity II']::text[], ARRAY['alexandrite laser','Nd:YAG laser','laser hair removal']::text[])
ON CONFLICT (ko) DO UPDATE SET
  category = EXCLUDED.category,
  en = COALESCE(EXCLUDED.en, tag_dictionary.en),
  parent_ko = COALESCE(EXCLUDED.parent_ko, tag_dictionary.parent_ko),
  is_procedure = true,
  aliases = COALESCE(EXCLUDED.aliases, tag_dictionary.aliases),
  pubmed_keywords = COALESCE(EXCLUDED.pubmed_keywords, tag_dictionary.pubmed_keywords),
  updated_at = now();

INSERT INTO public.tag_dictionary (ko, category, en, parent_ko, is_procedure, aliases, pubmed_keywords)
VALUES ('튼살레이저', '레이저', 'stretch-mark-laser', NULL, true,
        ARRAY['stretch mark laser']::text[], ARRAY['striae distensae','fractional laser']::text[])
ON CONFLICT (ko) DO UPDATE SET
  category = EXCLUDED.category,
  en = COALESCE(EXCLUDED.en, tag_dictionary.en),
  parent_ko = COALESCE(EXCLUDED.parent_ko, tag_dictionary.parent_ko),
  is_procedure = true,
  aliases = COALESCE(EXCLUDED.aliases, tag_dictionary.aliases),
  pubmed_keywords = COALESCE(EXCLUDED.pubmed_keywords, tag_dictionary.pubmed_keywords),
  updated_at = now();

INSERT INTO public.tag_dictionary (ko, category, en, parent_ko, is_procedure, aliases, pubmed_keywords)
VALUES ('포텐자', '레이저', 'potenza', NULL, true,
        ARRAY['Potenza']::text[], ARRAY['radiofrequency microneedling','fractional radiofrequency']::text[])
ON CONFLICT (ko) DO UPDATE SET
  category = EXCLUDED.category,
  en = COALESCE(EXCLUDED.en, tag_dictionary.en),
  parent_ko = COALESCE(EXCLUDED.parent_ko, tag_dictionary.parent_ko),
  is_procedure = true,
  aliases = COALESCE(EXCLUDED.aliases, tag_dictionary.aliases),
  pubmed_keywords = COALESCE(EXCLUDED.pubmed_keywords, tag_dictionary.pubmed_keywords),
  updated_at = now();

INSERT INTO public.tag_dictionary (ko, category, en, parent_ko, is_procedure, aliases, pubmed_keywords)
VALUES ('프락셀', '레이저', 'fraxel', NULL, true,
        ARRAY['Fraxel']::text[], ARRAY['fractional photothermolysis','nonablative fractional laser','1550 nm']::text[])
ON CONFLICT (ko) DO UPDATE SET
  category = EXCLUDED.category,
  en = COALESCE(EXCLUDED.en, tag_dictionary.en),
  parent_ko = COALESCE(EXCLUDED.parent_ko, tag_dictionary.parent_ko),
  is_procedure = true,
  aliases = COALESCE(EXCLUDED.aliases, tag_dictionary.aliases),
  pubmed_keywords = COALESCE(EXCLUDED.pubmed_keywords, tag_dictionary.pubmed_keywords),
  updated_at = now();

INSERT INTO public.tag_dictionary (ko, category, en, parent_ko, is_procedure, aliases, pubmed_keywords)
VALUES ('피코레이저', '레이저', 'pico-laser', NULL, true,
        ARRAY['pico laser','picosecond laser']::text[], ARRAY['picosecond laser','picosecond Nd:YAG']::text[])
ON CONFLICT (ko) DO UPDATE SET
  category = EXCLUDED.category,
  en = COALESCE(EXCLUDED.en, tag_dictionary.en),
  parent_ko = COALESCE(EXCLUDED.parent_ko, tag_dictionary.parent_ko),
  is_procedure = true,
  aliases = COALESCE(EXCLUDED.aliases, tag_dictionary.aliases),
  pubmed_keywords = COALESCE(EXCLUDED.pubmed_keywords, tag_dictionary.pubmed_keywords),
  updated_at = now();

INSERT INTO public.tag_dictionary (ko, category, en, parent_ko, is_procedure, aliases, pubmed_keywords)
VALUES ('헬리오스', '레이저', 'helios', NULL, true,
        ARRAY['Helios']::text[], ARRAY['Q-switched Nd:YAG laser','laser toning']::text[])
ON CONFLICT (ko) DO UPDATE SET
  category = EXCLUDED.category,
  en = COALESCE(EXCLUDED.en, tag_dictionary.en),
  parent_ko = COALESCE(EXCLUDED.parent_ko, tag_dictionary.parent_ko),
  is_procedure = true,
  aliases = COALESCE(EXCLUDED.aliases, tag_dictionary.aliases),
  pubmed_keywords = COALESCE(EXCLUDED.pubmed_keywords, tag_dictionary.pubmed_keywords),
  updated_at = now();

INSERT INTO public.tag_dictionary (ko, category, en, parent_ko, is_procedure, aliases, pubmed_keywords)
VALUES ('CO2프락셔널', '레이저', 'co2-fractional', NULL, true,
        ARRAY['CO2 fractional laser','fractional CO2']::text[], ARRAY['fractional CO2 laser','ablative fractional laser','carbon dioxide laser']::text[])
ON CONFLICT (ko) DO UPDATE SET
  category = EXCLUDED.category,
  en = COALESCE(EXCLUDED.en, tag_dictionary.en),
  parent_ko = COALESCE(EXCLUDED.parent_ko, tag_dictionary.parent_ko),
  is_procedure = true,
  aliases = COALESCE(EXCLUDED.aliases, tag_dictionary.aliases),
  pubmed_keywords = COALESCE(EXCLUDED.pubmed_keywords, tag_dictionary.pubmed_keywords),
  updated_at = now();

INSERT INTO public.tag_dictionary (ko, category, en, parent_ko, is_procedure, aliases, pubmed_keywords)
VALUES ('IPL', '레이저', 'ipl', NULL, true,
        ARRAY['intense pulsed light']::text[], ARRAY['intense pulsed light','IPL']::text[])
ON CONFLICT (ko) DO UPDATE SET
  category = EXCLUDED.category,
  en = COALESCE(EXCLUDED.en, tag_dictionary.en),
  parent_ko = COALESCE(EXCLUDED.parent_ko, tag_dictionary.parent_ko),
  is_procedure = true,
  aliases = COALESCE(EXCLUDED.aliases, tag_dictionary.aliases),
  pubmed_keywords = COALESCE(EXCLUDED.pubmed_keywords, tag_dictionary.pubmed_keywords),
  updated_at = now();

INSERT INTO public.tag_dictionary (ko, category, en, parent_ko, is_procedure, aliases, pubmed_keywords)
VALUES ('루메카', '레이저', 'lumecca', NULL, true,
        ARRAY['Lumecca']::text[], ARRAY['intense pulsed light','IPL']::text[])
ON CONFLICT (ko) DO UPDATE SET
  category = EXCLUDED.category,
  en = COALESCE(EXCLUDED.en, tag_dictionary.en),
  parent_ko = COALESCE(EXCLUDED.parent_ko, tag_dictionary.parent_ko),
  is_procedure = true,
  aliases = COALESCE(EXCLUDED.aliases, tag_dictionary.aliases),
  pubmed_keywords = COALESCE(EXCLUDED.pubmed_keywords, tag_dictionary.pubmed_keywords),
  updated_at = now();

INSERT INTO public.tag_dictionary (ko, category, en, parent_ko, is_procedure, aliases, pubmed_keywords)
VALUES ('M22', '레이저', 'm22', NULL, true,
        ARRAY['Lumenis M22']::text[], ARRAY['intense pulsed light','IPL']::text[])
ON CONFLICT (ko) DO UPDATE SET
  category = EXCLUDED.category,
  en = COALESCE(EXCLUDED.en, tag_dictionary.en),
  parent_ko = COALESCE(EXCLUDED.parent_ko, tag_dictionary.parent_ko),
  is_procedure = true,
  aliases = COALESCE(EXCLUDED.aliases, tag_dictionary.aliases),
  pubmed_keywords = COALESCE(EXCLUDED.pubmed_keywords, tag_dictionary.pubmed_keywords),
  updated_at = now();

INSERT INTO public.tag_dictionary (ko, category, en, parent_ko, is_procedure, aliases, pubmed_keywords)
VALUES ('PDT', '레이저', 'pdt', NULL, true,
        ARRAY['photodynamic therapy']::text[], ARRAY['photodynamic therapy','PDT','aminolevulinic acid']::text[])
ON CONFLICT (ko) DO UPDATE SET
  category = EXCLUDED.category,
  en = COALESCE(EXCLUDED.en, tag_dictionary.en),
  parent_ko = COALESCE(EXCLUDED.parent_ko, tag_dictionary.parent_ko),
  is_procedure = true,
  aliases = COALESCE(EXCLUDED.aliases, tag_dictionary.aliases),
  pubmed_keywords = COALESCE(EXCLUDED.pubmed_keywords, tag_dictionary.pubmed_keywords),
  updated_at = now();

INSERT INTO public.tag_dictionary (ko, category, en, parent_ko, is_procedure, aliases, pubmed_keywords)
VALUES ('라라필', '기타', 'lala-peel', NULL, true,
        ARRAY['LaLa Peel','LHA peel']::text[], ARRAY['lipohydroxy acid','chemical peel']::text[])
ON CONFLICT (ko) DO UPDATE SET
  category = EXCLUDED.category,
  en = COALESCE(EXCLUDED.en, tag_dictionary.en),
  parent_ko = COALESCE(EXCLUDED.parent_ko, tag_dictionary.parent_ko),
  is_procedure = true,
  aliases = COALESCE(EXCLUDED.aliases, tag_dictionary.aliases),
  pubmed_keywords = COALESCE(EXCLUDED.pubmed_keywords, tag_dictionary.pubmed_keywords),
  updated_at = now();

INSERT INTO public.tag_dictionary (ko, category, en, parent_ko, is_procedure, aliases, pubmed_keywords)
VALUES ('마늘주사', '기타', 'garlic-injection', NULL, true,
        ARRAY['garlic injection']::text[], ARRAY['thioctic acid','alpha-lipoic acid']::text[])
ON CONFLICT (ko) DO UPDATE SET
  category = EXCLUDED.category,
  en = COALESCE(EXCLUDED.en, tag_dictionary.en),
  parent_ko = COALESCE(EXCLUDED.parent_ko, tag_dictionary.parent_ko),
  is_procedure = true,
  aliases = COALESCE(EXCLUDED.aliases, tag_dictionary.aliases),
  pubmed_keywords = COALESCE(EXCLUDED.pubmed_keywords, tag_dictionary.pubmed_keywords),
  updated_at = now();

INSERT INTO public.tag_dictionary (ko, category, en, parent_ko, is_procedure, aliases, pubmed_keywords)
VALUES ('메조테라피', '기타', 'mesotherapy', NULL, true,
        ARRAY['mesotherapy']::text[], ARRAY['mesotherapy','intradermal injection']::text[])
ON CONFLICT (ko) DO UPDATE SET
  category = EXCLUDED.category,
  en = COALESCE(EXCLUDED.en, tag_dictionary.en),
  parent_ko = COALESCE(EXCLUDED.parent_ko, tag_dictionary.parent_ko),
  is_procedure = true,
  aliases = COALESCE(EXCLUDED.aliases, tag_dictionary.aliases),
  pubmed_keywords = COALESCE(EXCLUDED.pubmed_keywords, tag_dictionary.pubmed_keywords),
  updated_at = now();

INSERT INTO public.tag_dictionary (ko, category, en, parent_ko, is_procedure, aliases, pubmed_keywords)
VALUES ('미라드라이', '기타', 'miradry', NULL, true,
        ARRAY['miraDry']::text[], ARRAY['microwave','axillary hyperhidrosis']::text[])
ON CONFLICT (ko) DO UPDATE SET
  category = EXCLUDED.category,
  en = COALESCE(EXCLUDED.en, tag_dictionary.en),
  parent_ko = COALESCE(EXCLUDED.parent_ko, tag_dictionary.parent_ko),
  is_procedure = true,
  aliases = COALESCE(EXCLUDED.aliases, tag_dictionary.aliases),
  pubmed_keywords = COALESCE(EXCLUDED.pubmed_keywords, tag_dictionary.pubmed_keywords),
  updated_at = now();

INSERT INTO public.tag_dictionary (ko, category, en, parent_ko, is_procedure, aliases, pubmed_keywords)
VALUES ('밀크필', '기타', 'milk-peel', NULL, true,
        ARRAY['milk peel']::text[], ARRAY['chemical peel']::text[])
ON CONFLICT (ko) DO UPDATE SET
  category = EXCLUDED.category,
  en = COALESCE(EXCLUDED.en, tag_dictionary.en),
  parent_ko = COALESCE(EXCLUDED.parent_ko, tag_dictionary.parent_ko),
  is_procedure = true,
  aliases = COALESCE(EXCLUDED.aliases, tag_dictionary.aliases),
  pubmed_keywords = COALESCE(EXCLUDED.pubmed_keywords, tag_dictionary.pubmed_keywords),
  updated_at = now();

INSERT INTO public.tag_dictionary (ko, category, en, parent_ko, is_procedure, aliases, pubmed_keywords)
VALUES ('백옥주사', '기타', 'white-jade-injection', NULL, true,
        ARRAY['glutathione injection']::text[], ARRAY['glutathione','skin whitening']::text[])
ON CONFLICT (ko) DO UPDATE SET
  category = EXCLUDED.category,
  en = COALESCE(EXCLUDED.en, tag_dictionary.en),
  parent_ko = COALESCE(EXCLUDED.parent_ko, tag_dictionary.parent_ko),
  is_procedure = true,
  aliases = COALESCE(EXCLUDED.aliases, tag_dictionary.aliases),
  pubmed_keywords = COALESCE(EXCLUDED.pubmed_keywords, tag_dictionary.pubmed_keywords),
  updated_at = now();

INSERT INTO public.tag_dictionary (ko, category, en, parent_ko, is_procedure, aliases, pubmed_keywords)
VALUES ('블랙필', '기타', 'black-peel', NULL, true,
        ARRAY['black peel','carbon laser peel']::text[], ARRAY['carbon laser peel','Q-switched Nd:YAG']::text[])
ON CONFLICT (ko) DO UPDATE SET
  category = EXCLUDED.category,
  en = COALESCE(EXCLUDED.en, tag_dictionary.en),
  parent_ko = COALESCE(EXCLUDED.parent_ko, tag_dictionary.parent_ko),
  is_procedure = true,
  aliases = COALESCE(EXCLUDED.aliases, tag_dictionary.aliases),
  pubmed_keywords = COALESCE(EXCLUDED.pubmed_keywords, tag_dictionary.pubmed_keywords),
  updated_at = now();

INSERT INTO public.tag_dictionary (ko, category, en, parent_ko, is_procedure, aliases, pubmed_keywords)
VALUES ('비타민주사', '기타', 'vitamin-injection', NULL, true,
        ARRAY['vitamin injection']::text[], ARRAY['vitamin C','intravenous vitamin']::text[])
ON CONFLICT (ko) DO UPDATE SET
  category = EXCLUDED.category,
  en = COALESCE(EXCLUDED.en, tag_dictionary.en),
  parent_ko = COALESCE(EXCLUDED.parent_ko, tag_dictionary.parent_ko),
  is_procedure = true,
  aliases = COALESCE(EXCLUDED.aliases, tag_dictionary.aliases),
  pubmed_keywords = COALESCE(EXCLUDED.pubmed_keywords, tag_dictionary.pubmed_keywords),
  updated_at = now();

INSERT INTO public.tag_dictionary (ko, category, en, parent_ko, is_procedure, aliases, pubmed_keywords)
VALUES ('스킨스케일링', '기타', 'skin-scaling', NULL, true,
        ARRAY['skin scaling']::text[], NULL)
ON CONFLICT (ko) DO UPDATE SET
  category = EXCLUDED.category,
  en = COALESCE(EXCLUDED.en, tag_dictionary.en),
  parent_ko = COALESCE(EXCLUDED.parent_ko, tag_dictionary.parent_ko),
  is_procedure = true,
  aliases = COALESCE(EXCLUDED.aliases, tag_dictionary.aliases),
  pubmed_keywords = COALESCE(EXCLUDED.pubmed_keywords, tag_dictionary.pubmed_keywords),
  updated_at = now();

INSERT INTO public.tag_dictionary (ko, category, en, parent_ko, is_procedure, aliases, pubmed_keywords)
VALUES ('신데렐라주사', '기타', 'cinderella-injection', NULL, true,
        ARRAY['Cinderella injection','thioctic acid injection']::text[], ARRAY['thioctic acid','alpha-lipoic acid','antioxidant']::text[])
ON CONFLICT (ko) DO UPDATE SET
  category = EXCLUDED.category,
  en = COALESCE(EXCLUDED.en, tag_dictionary.en),
  parent_ko = COALESCE(EXCLUDED.parent_ko, tag_dictionary.parent_ko),
  is_procedure = true,
  aliases = COALESCE(EXCLUDED.aliases, tag_dictionary.aliases),
  pubmed_keywords = COALESCE(EXCLUDED.pubmed_keywords, tag_dictionary.pubmed_keywords),
  updated_at = now();

INSERT INTO public.tag_dictionary (ko, category, en, parent_ko, is_procedure, aliases, pubmed_keywords)
VALUES ('아쿠아필', '기타', 'aqua-peel', NULL, true,
        ARRAY['Aqua Peel','hydrafacial']::text[], ARRAY['hydradermabrasion']::text[])
ON CONFLICT (ko) DO UPDATE SET
  category = EXCLUDED.category,
  en = COALESCE(EXCLUDED.en, tag_dictionary.en),
  parent_ko = COALESCE(EXCLUDED.parent_ko, tag_dictionary.parent_ko),
  is_procedure = true,
  aliases = COALESCE(EXCLUDED.aliases, tag_dictionary.aliases),
  pubmed_keywords = COALESCE(EXCLUDED.pubmed_keywords, tag_dictionary.pubmed_keywords),
  updated_at = now();

INSERT INTO public.tag_dictionary (ko, category, en, parent_ko, is_procedure, aliases, pubmed_keywords)
VALUES ('엠스컬프트', '기타', 'emsculpt', NULL, true,
        ARRAY['Emsculpt']::text[], ARRAY['high-intensity focused electromagnetic','HIFEM','muscle stimulation']::text[])
ON CONFLICT (ko) DO UPDATE SET
  category = EXCLUDED.category,
  en = COALESCE(EXCLUDED.en, tag_dictionary.en),
  parent_ko = COALESCE(EXCLUDED.parent_ko, tag_dictionary.parent_ko),
  is_procedure = true,
  aliases = COALESCE(EXCLUDED.aliases, tag_dictionary.aliases),
  pubmed_keywords = COALESCE(EXCLUDED.pubmed_keywords, tag_dictionary.pubmed_keywords),
  updated_at = now();

INSERT INTO public.tag_dictionary (ko, category, en, parent_ko, is_procedure, aliases, pubmed_keywords)
VALUES ('여드름압출', '기타', 'acne-extraction', NULL, true,
        ARRAY['acne extraction','comedone extraction']::text[], ARRAY['comedone extraction','acne']::text[])
ON CONFLICT (ko) DO UPDATE SET
  category = EXCLUDED.category,
  en = COALESCE(EXCLUDED.en, tag_dictionary.en),
  parent_ko = COALESCE(EXCLUDED.parent_ko, tag_dictionary.parent_ko),
  is_procedure = true,
  aliases = COALESCE(EXCLUDED.aliases, tag_dictionary.aliases),
  pubmed_keywords = COALESCE(EXCLUDED.pubmed_keywords, tag_dictionary.pubmed_keywords),
  updated_at = now();

INSERT INTO public.tag_dictionary (ko, category, en, parent_ko, is_procedure, aliases, pubmed_keywords)
VALUES ('카복시', '기타', 'carboxy', NULL, true,
        ARRAY['carboxytherapy']::text[], ARRAY['carboxytherapy','carbon dioxide therapy']::text[])
ON CONFLICT (ko) DO UPDATE SET
  category = EXCLUDED.category,
  en = COALESCE(EXCLUDED.en, tag_dictionary.en),
  parent_ko = COALESCE(EXCLUDED.parent_ko, tag_dictionary.parent_ko),
  is_procedure = true,
  aliases = COALESCE(EXCLUDED.aliases, tag_dictionary.aliases),
  pubmed_keywords = COALESCE(EXCLUDED.pubmed_keywords, tag_dictionary.pubmed_keywords),
  updated_at = now();

INSERT INTO public.tag_dictionary (ko, category, en, parent_ko, is_procedure, aliases, pubmed_keywords)
VALUES ('쿨소닉', '리프팅', 'coolsoniq', NULL, true,
        ARRAY['CoolSoniq']::text[], ARRAY['high-intensity focused ultrasound','HIFU','microfocused ultrasound']::text[])
ON CONFLICT (ko) DO UPDATE SET
  category = EXCLUDED.category,
  en = COALESCE(EXCLUDED.en, tag_dictionary.en),
  parent_ko = COALESCE(EXCLUDED.parent_ko, tag_dictionary.parent_ko),
  is_procedure = true,
  aliases = COALESCE(EXCLUDED.aliases, tag_dictionary.aliases),
  pubmed_keywords = COALESCE(EXCLUDED.pubmed_keywords, tag_dictionary.pubmed_keywords),
  updated_at = now();

INSERT INTO public.tag_dictionary (ko, category, en, parent_ko, is_procedure, aliases, pubmed_keywords)
VALUES ('쿨스컬프팅', '기타', 'coolsculpting', NULL, true,
        ARRAY['CoolSculpting']::text[], ARRAY['cryolipolysis','fat freezing']::text[])
ON CONFLICT (ko) DO UPDATE SET
  category = EXCLUDED.category,
  en = COALESCE(EXCLUDED.en, tag_dictionary.en),
  parent_ko = COALESCE(EXCLUDED.parent_ko, tag_dictionary.parent_ko),
  is_procedure = true,
  aliases = COALESCE(EXCLUDED.aliases, tag_dictionary.aliases),
  pubmed_keywords = COALESCE(EXCLUDED.pubmed_keywords, tag_dictionary.pubmed_keywords),
  updated_at = now();

INSERT INTO public.tag_dictionary (ko, category, en, parent_ko, is_procedure, aliases, pubmed_keywords)
VALUES ('크라이오', '기타', 'cryotherapy', NULL, true,
        ARRAY['cryotherapy','cryo']::text[], ARRAY['cryotherapy']::text[])
ON CONFLICT (ko) DO UPDATE SET
  category = EXCLUDED.category,
  en = COALESCE(EXCLUDED.en, tag_dictionary.en),
  parent_ko = COALESCE(EXCLUDED.parent_ko, tag_dictionary.parent_ko),
  is_procedure = true,
  aliases = COALESCE(EXCLUDED.aliases, tag_dictionary.aliases),
  pubmed_keywords = COALESCE(EXCLUDED.pubmed_keywords, tag_dictionary.pubmed_keywords),
  updated_at = now();

INSERT INTO public.tag_dictionary (ko, category, en, parent_ko, is_procedure, aliases, pubmed_keywords)
VALUES ('태반주사', '기타', 'placenta-injection', NULL, true,
        ARRAY['placenta injection','placental extract']::text[], ARRAY['placental extract','human placenta']::text[])
ON CONFLICT (ko) DO UPDATE SET
  category = EXCLUDED.category,
  en = COALESCE(EXCLUDED.en, tag_dictionary.en),
  parent_ko = COALESCE(EXCLUDED.parent_ko, tag_dictionary.parent_ko),
  is_procedure = true,
  aliases = COALESCE(EXCLUDED.aliases, tag_dictionary.aliases),
  pubmed_keywords = COALESCE(EXCLUDED.pubmed_keywords, tag_dictionary.pubmed_keywords),
  updated_at = now();

INSERT INTO public.tag_dictionary (ko, category, en, parent_ko, is_procedure, aliases, pubmed_keywords)
VALUES ('LDM', '기타', 'ldm', NULL, true,
        ARRAY['local dynamic micromassage']::text[], ARRAY['dual-frequency ultrasound','local dynamic micromassage']::text[])
ON CONFLICT (ko) DO UPDATE SET
  category = EXCLUDED.category,
  en = COALESCE(EXCLUDED.en, tag_dictionary.en),
  parent_ko = COALESCE(EXCLUDED.parent_ko, tag_dictionary.parent_ko),
  is_procedure = true,
  aliases = COALESCE(EXCLUDED.aliases, tag_dictionary.aliases),
  pubmed_keywords = COALESCE(EXCLUDED.pubmed_keywords, tag_dictionary.pubmed_keywords),
  updated_at = now();

INSERT INTO public.tag_dictionary (ko, category, en, parent_ko, is_procedure, aliases, pubmed_keywords)
VALUES ('더블로골드', '리프팅', 'doublo-gold', '더블로', true,
        ARRAY['Doublo Gold']::text[], ARRAY['HIFU','high-intensity focused ultrasound']::text[])
ON CONFLICT (ko) DO UPDATE SET
  category = EXCLUDED.category,
  en = COALESCE(EXCLUDED.en, tag_dictionary.en),
  parent_ko = COALESCE(EXCLUDED.parent_ko, tag_dictionary.parent_ko),
  is_procedure = true,
  aliases = COALESCE(EXCLUDED.aliases, tag_dictionary.aliases),
  pubmed_keywords = COALESCE(EXCLUDED.pubmed_keywords, tag_dictionary.pubmed_keywords),
  updated_at = now();

INSERT INTO public.tag_dictionary (ko, category, en, parent_ko, is_procedure, aliases, pubmed_keywords)
VALUES ('리니어지', '리프팅', 'linearz', '리니어펌', true,
        ARRAY['LinearZ']::text[], ARRAY['high-intensity focused ultrasound','HIFU']::text[])
ON CONFLICT (ko) DO UPDATE SET
  category = EXCLUDED.category,
  en = COALESCE(EXCLUDED.en, tag_dictionary.en),
  parent_ko = COALESCE(EXCLUDED.parent_ko, tag_dictionary.parent_ko),
  is_procedure = true,
  aliases = COALESCE(EXCLUDED.aliases, tag_dictionary.aliases),
  pubmed_keywords = COALESCE(EXCLUDED.pubmed_keywords, tag_dictionary.pubmed_keywords),
  updated_at = now();

INSERT INTO public.tag_dictionary (ko, category, en, parent_ko, is_procedure, aliases, pubmed_keywords)
VALUES ('리프테라2', '리프팅', 'liftera-2', '리프테라', true,
        ARRAY['Liftera II','Liftera 2']::text[], ARRAY['HIFU']::text[])
ON CONFLICT (ko) DO UPDATE SET
  category = EXCLUDED.category,
  en = COALESCE(EXCLUDED.en, tag_dictionary.en),
  parent_ko = COALESCE(EXCLUDED.parent_ko, tag_dictionary.parent_ko),
  is_procedure = true,
  aliases = COALESCE(EXCLUDED.aliases, tag_dictionary.aliases),
  pubmed_keywords = COALESCE(EXCLUDED.pubmed_keywords, tag_dictionary.pubmed_keywords),
  updated_at = now();

INSERT INTO public.tag_dictionary (ko, category, en, parent_ko, is_procedure, aliases, pubmed_keywords)
VALUES ('슈링크유니버스', '리프팅', 'shurink-universe', '슈링크', true,
        ARRAY['Shurink Universe']::text[], ARRAY['high-intensity focused ultrasound','HIFU']::text[])
ON CONFLICT (ko) DO UPDATE SET
  category = EXCLUDED.category,
  en = COALESCE(EXCLUDED.en, tag_dictionary.en),
  parent_ko = COALESCE(EXCLUDED.parent_ko, tag_dictionary.parent_ko),
  is_procedure = true,
  aliases = COALESCE(EXCLUDED.aliases, tag_dictionary.aliases),
  pubmed_keywords = COALESCE(EXCLUDED.pubmed_keywords, tag_dictionary.pubmed_keywords),
  updated_at = now();

INSERT INTO public.tag_dictionary (ko, category, en, parent_ko, is_procedure, aliases, pubmed_keywords)
VALUES ('바디슈링크', '기타', 'body-shurink', '슈링크', true,
        ARRAY['body Shurink']::text[], ARRAY['high-intensity focused ultrasound','HIFU','body contouring']::text[])
ON CONFLICT (ko) DO UPDATE SET
  category = EXCLUDED.category,
  en = COALESCE(EXCLUDED.en, tag_dictionary.en),
  parent_ko = COALESCE(EXCLUDED.parent_ko, tag_dictionary.parent_ko),
  is_procedure = true,
  aliases = COALESCE(EXCLUDED.aliases, tag_dictionary.aliases),
  pubmed_keywords = COALESCE(EXCLUDED.pubmed_keywords, tag_dictionary.pubmed_keywords),
  updated_at = now();

INSERT INTO public.tag_dictionary (ko, category, en, parent_ko, is_procedure, aliases, pubmed_keywords)
VALUES ('거상실', '리프팅', 'lifting-thread', '실리프팅', true,
        ARRAY['lifting thread']::text[], ARRAY['thread lift','PDO thread']::text[])
ON CONFLICT (ko) DO UPDATE SET
  category = EXCLUDED.category,
  en = COALESCE(EXCLUDED.en, tag_dictionary.en),
  parent_ko = COALESCE(EXCLUDED.parent_ko, tag_dictionary.parent_ko),
  is_procedure = true,
  aliases = COALESCE(EXCLUDED.aliases, tag_dictionary.aliases),
  pubmed_keywords = COALESCE(EXCLUDED.pubmed_keywords, tag_dictionary.pubmed_keywords),
  updated_at = now();

INSERT INTO public.tag_dictionary (ko, category, en, parent_ko, is_procedure, aliases, pubmed_keywords)
VALUES ('민트실', '리프팅', 'mint', '실리프팅', true,
        ARRAY['MINT','MINT lift']::text[], ARRAY['PDO thread','thread lift']::text[])
ON CONFLICT (ko) DO UPDATE SET
  category = EXCLUDED.category,
  en = COALESCE(EXCLUDED.en, tag_dictionary.en),
  parent_ko = COALESCE(EXCLUDED.parent_ko, tag_dictionary.parent_ko),
  is_procedure = true,
  aliases = COALESCE(EXCLUDED.aliases, tag_dictionary.aliases),
  pubmed_keywords = COALESCE(EXCLUDED.pubmed_keywords, tag_dictionary.pubmed_keywords),
  updated_at = now();

INSERT INTO public.tag_dictionary (ko, category, en, parent_ko, is_procedure, aliases, pubmed_keywords)
VALUES ('잼버실', '리프팅', 'jamber', '실리프팅', true,
        ARRAY['Jamber']::text[], ARRAY['PDO thread','thread lift']::text[])
ON CONFLICT (ko) DO UPDATE SET
  category = EXCLUDED.category,
  en = COALESCE(EXCLUDED.en, tag_dictionary.en),
  parent_ko = COALESCE(EXCLUDED.parent_ko, tag_dictionary.parent_ko),
  is_procedure = true,
  aliases = COALESCE(EXCLUDED.aliases, tag_dictionary.aliases),
  pubmed_keywords = COALESCE(EXCLUDED.pubmed_keywords, tag_dictionary.pubmed_keywords),
  updated_at = now();

INSERT INTO public.tag_dictionary (ko, category, en, parent_ko, is_procedure, aliases, pubmed_keywords)
VALUES ('캐번실', '리프팅', 'caven', '실리프팅', true,
        ARRAY['Caven']::text[], ARRAY['PDO thread','thread lift']::text[])
ON CONFLICT (ko) DO UPDATE SET
  category = EXCLUDED.category,
  en = COALESCE(EXCLUDED.en, tag_dictionary.en),
  parent_ko = COALESCE(EXCLUDED.parent_ko, tag_dictionary.parent_ko),
  is_procedure = true,
  aliases = COALESCE(EXCLUDED.aliases, tag_dictionary.aliases),
  pubmed_keywords = COALESCE(EXCLUDED.pubmed_keywords, tag_dictionary.pubmed_keywords),
  updated_at = now();

INSERT INTO public.tag_dictionary (ko, category, en, parent_ko, is_procedure, aliases, pubmed_keywords)
VALUES ('코그실', '리프팅', 'cog-thread', '실리프팅', true,
        ARRAY['cog thread']::text[], ARRAY['barbed thread','cog thread','thread lift']::text[])
ON CONFLICT (ko) DO UPDATE SET
  category = EXCLUDED.category,
  en = COALESCE(EXCLUDED.en, tag_dictionary.en),
  parent_ko = COALESCE(EXCLUDED.parent_ko, tag_dictionary.parent_ko),
  is_procedure = true,
  aliases = COALESCE(EXCLUDED.aliases, tag_dictionary.aliases),
  pubmed_keywords = COALESCE(EXCLUDED.pubmed_keywords, tag_dictionary.pubmed_keywords),
  updated_at = now();

INSERT INTO public.tag_dictionary (ko, category, en, parent_ko, is_procedure, aliases, pubmed_keywords)
VALUES ('써마지FLX', '리프팅', 'thermage-flx', '써마지', true,
        ARRAY['Thermage FLX','써마지플렉스']::text[], ARRAY['Thermage FLX','monopolar radiofrequency']::text[])
ON CONFLICT (ko) DO UPDATE SET
  category = EXCLUDED.category,
  en = COALESCE(EXCLUDED.en, tag_dictionary.en),
  parent_ko = COALESCE(EXCLUDED.parent_ko, tag_dictionary.parent_ko),
  is_procedure = true,
  aliases = COALESCE(EXCLUDED.aliases, tag_dictionary.aliases),
  pubmed_keywords = COALESCE(EXCLUDED.pubmed_keywords, tag_dictionary.pubmed_keywords),
  updated_at = now();

INSERT INTO public.tag_dictionary (ko, category, en, parent_ko, is_procedure, aliases, pubmed_keywords)
VALUES ('바디온다', '기타', 'body-onda', '온다', true,
        ARRAY['body Onda']::text[], ARRAY['microwave','body contouring']::text[])
ON CONFLICT (ko) DO UPDATE SET
  category = EXCLUDED.category,
  en = COALESCE(EXCLUDED.en, tag_dictionary.en),
  parent_ko = COALESCE(EXCLUDED.parent_ko, tag_dictionary.parent_ko),
  is_procedure = true,
  aliases = COALESCE(EXCLUDED.aliases, tag_dictionary.aliases),
  pubmed_keywords = COALESCE(EXCLUDED.pubmed_keywords, tag_dictionary.pubmed_keywords),
  updated_at = now();

INSERT INTO public.tag_dictionary (ko, category, en, parent_ko, is_procedure, aliases, pubmed_keywords)
VALUES ('올리지오X', '리프팅', 'oligio-x', '올리지오', true,
        ARRAY['Oligio X']::text[], ARRAY['monopolar radiofrequency']::text[])
ON CONFLICT (ko) DO UPDATE SET
  category = EXCLUDED.category,
  en = COALESCE(EXCLUDED.en, tag_dictionary.en),
  parent_ko = COALESCE(EXCLUDED.parent_ko, tag_dictionary.parent_ko),
  is_procedure = true,
  aliases = COALESCE(EXCLUDED.aliases, tag_dictionary.aliases),
  pubmed_keywords = COALESCE(EXCLUDED.pubmed_keywords, tag_dictionary.pubmed_keywords),
  updated_at = now();

INSERT INTO public.tag_dictionary (ko, category, en, parent_ko, is_procedure, aliases, pubmed_keywords)
VALUES ('울쎄라프라임', '리프팅', 'ultherapy-prime', '울쎄라', true,
        ARRAY['Ultherapy Prime','Ulthera Prime']::text[], ARRAY['microfocused ultrasound','Ultherapy']::text[])
ON CONFLICT (ko) DO UPDATE SET
  category = EXCLUDED.category,
  en = COALESCE(EXCLUDED.en, tag_dictionary.en),
  parent_ko = COALESCE(EXCLUDED.parent_ko, tag_dictionary.parent_ko),
  is_procedure = true,
  aliases = COALESCE(EXCLUDED.aliases, tag_dictionary.aliases),
  pubmed_keywords = COALESCE(EXCLUDED.pubmed_keywords, tag_dictionary.pubmed_keywords),
  updated_at = now();

INSERT INTO public.tag_dictionary (ko, category, en, parent_ko, is_procedure, aliases, pubmed_keywords)
VALUES ('울트라셀큐플러스', '리프팅', 'ultracel-q-plus', '울트라셀', true,
        ARRAY['Ultracel Q+']::text[], ARRAY['HIFU']::text[])
ON CONFLICT (ko) DO UPDATE SET
  category = EXCLUDED.category,
  en = COALESCE(EXCLUDED.en, tag_dictionary.en),
  parent_ko = COALESCE(EXCLUDED.parent_ko, tag_dictionary.parent_ko),
  is_procedure = true,
  aliases = COALESCE(EXCLUDED.aliases, tag_dictionary.aliases),
  pubmed_keywords = COALESCE(EXCLUDED.pubmed_keywords, tag_dictionary.pubmed_keywords),
  updated_at = now();

INSERT INTO public.tag_dictionary (ko, category, en, parent_ko, is_procedure, aliases, pubmed_keywords)
VALUES ('울트라포머MPT', '리프팅', 'ultraformer-mpt', '울트라포머', true,
        ARRAY['Ultraformer MPT']::text[], ARRAY['HIFU']::text[])
ON CONFLICT (ko) DO UPDATE SET
  category = EXCLUDED.category,
  en = COALESCE(EXCLUDED.en, tag_dictionary.en),
  parent_ko = COALESCE(EXCLUDED.parent_ko, tag_dictionary.parent_ko),
  is_procedure = true,
  aliases = COALESCE(EXCLUDED.aliases, tag_dictionary.aliases),
  pubmed_keywords = COALESCE(EXCLUDED.pubmed_keywords, tag_dictionary.pubmed_keywords),
  updated_at = now();

INSERT INTO public.tag_dictionary (ko, category, en, parent_ko, is_procedure, aliases, pubmed_keywords)
VALUES ('인모드포르마', '리프팅', 'inmode-forma', '인모드', true,
        ARRAY['InMode Forma','Forma']::text[], ARRAY['bipolar radiofrequency','radiofrequency skin tightening']::text[])
ON CONFLICT (ko) DO UPDATE SET
  category = EXCLUDED.category,
  en = COALESCE(EXCLUDED.en, tag_dictionary.en),
  parent_ko = COALESCE(EXCLUDED.parent_ko, tag_dictionary.parent_ko),
  is_procedure = true,
  aliases = COALESCE(EXCLUDED.aliases, tag_dictionary.aliases),
  pubmed_keywords = COALESCE(EXCLUDED.pubmed_keywords, tag_dictionary.pubmed_keywords),
  updated_at = now();

INSERT INTO public.tag_dictionary (ko, category, en, parent_ko, is_procedure, aliases, pubmed_keywords)
VALUES ('인모드FX', '리프팅', 'inmode-fx', '인모드', true,
        ARRAY['InMode FX']::text[], ARRAY['radiofrequency']::text[])
ON CONFLICT (ko) DO UPDATE SET
  category = EXCLUDED.category,
  en = COALESCE(EXCLUDED.en, tag_dictionary.en),
  parent_ko = COALESCE(EXCLUDED.parent_ko, tag_dictionary.parent_ko),
  is_procedure = true,
  aliases = COALESCE(EXCLUDED.aliases, tag_dictionary.aliases),
  pubmed_keywords = COALESCE(EXCLUDED.pubmed_keywords, tag_dictionary.pubmed_keywords),
  updated_at = now();

INSERT INTO public.tag_dictionary (ko, category, en, parent_ko, is_procedure, aliases, pubmed_keywords)
VALUES ('리쥬란아이', '스킨부스터', 'rejuran-i', '리쥬란', true,
        ARRAY['Rejuran i','Rejuran Eye']::text[], ARRAY['polynucleotide']::text[])
ON CONFLICT (ko) DO UPDATE SET
  category = EXCLUDED.category,
  en = COALESCE(EXCLUDED.en, tag_dictionary.en),
  parent_ko = COALESCE(EXCLUDED.parent_ko, tag_dictionary.parent_ko),
  is_procedure = true,
  aliases = COALESCE(EXCLUDED.aliases, tag_dictionary.aliases),
  pubmed_keywords = COALESCE(EXCLUDED.pubmed_keywords, tag_dictionary.pubmed_keywords),
  updated_at = now();

INSERT INTO public.tag_dictionary (ko, category, en, parent_ko, is_procedure, aliases, pubmed_keywords)
VALUES ('리쥬란힐러', '스킨부스터', 'rejuran-healer', '리쥬란', true,
        ARRAY['Rejuran Healer']::text[], ARRAY['polynucleotide']::text[])
ON CONFLICT (ko) DO UPDATE SET
  category = EXCLUDED.category,
  en = COALESCE(EXCLUDED.en, tag_dictionary.en),
  parent_ko = COALESCE(EXCLUDED.parent_ko, tag_dictionary.parent_ko),
  is_procedure = true,
  aliases = COALESCE(EXCLUDED.aliases, tag_dictionary.aliases),
  pubmed_keywords = COALESCE(EXCLUDED.pubmed_keywords, tag_dictionary.pubmed_keywords),
  updated_at = now();

INSERT INTO public.tag_dictionary (ko, category, en, parent_ko, is_procedure, aliases, pubmed_keywords)
VALUES ('리쥬란HB플러스', '스킨부스터', 'rejuran-hb-plus', '리쥬란', true,
        ARRAY['Rejuran HB+','Rejuran HB Plus']::text[], ARRAY['polynucleotide','hyaluronic acid']::text[])
ON CONFLICT (ko) DO UPDATE SET
  category = EXCLUDED.category,
  en = COALESCE(EXCLUDED.en, tag_dictionary.en),
  parent_ko = COALESCE(EXCLUDED.parent_ko, tag_dictionary.parent_ko),
  is_procedure = true,
  aliases = COALESCE(EXCLUDED.aliases, tag_dictionary.aliases),
  pubmed_keywords = COALESCE(EXCLUDED.pubmed_keywords, tag_dictionary.pubmed_keywords),
  updated_at = now();

INSERT INTO public.tag_dictionary (ko, category, en, parent_ko, is_procedure, aliases, pubmed_keywords)
VALUES ('리쥬란S', '스킨부스터', 'rejuran-s', '리쥬란', true,
        ARRAY['Rejuran S']::text[], ARRAY['polynucleotide']::text[])
ON CONFLICT (ko) DO UPDATE SET
  category = EXCLUDED.category,
  en = COALESCE(EXCLUDED.en, tag_dictionary.en),
  parent_ko = COALESCE(EXCLUDED.parent_ko, tag_dictionary.parent_ko),
  is_procedure = true,
  aliases = COALESCE(EXCLUDED.aliases, tag_dictionary.aliases),
  pubmed_keywords = COALESCE(EXCLUDED.pubmed_keywords, tag_dictionary.pubmed_keywords),
  updated_at = now();

INSERT INTO public.tag_dictionary (ko, category, en, parent_ko, is_procedure, aliases, pubmed_keywords)
VALUES ('쥬베룩볼륨', '필러·볼륨', 'juvelook-volume', '쥬베룩', true,
        ARRAY['Juvelook Volume']::text[], ARRAY['poly-D,L-lactic acid','PDLLA']::text[])
ON CONFLICT (ko) DO UPDATE SET
  category = EXCLUDED.category,
  en = COALESCE(EXCLUDED.en, tag_dictionary.en),
  parent_ko = COALESCE(EXCLUDED.parent_ko, tag_dictionary.parent_ko),
  is_procedure = true,
  aliases = COALESCE(EXCLUDED.aliases, tag_dictionary.aliases),
  pubmed_keywords = COALESCE(EXCLUDED.pubmed_keywords, tag_dictionary.pubmed_keywords),
  updated_at = now();

INSERT INTO public.tag_dictionary (ko, category, en, parent_ko, is_procedure, aliases, pubmed_keywords)
VALUES ('관자필러', '필러·볼륨', 'temple-filler', '필러', true,
        ARRAY['temple filler']::text[], NULL)
ON CONFLICT (ko) DO UPDATE SET
  category = EXCLUDED.category,
  en = COALESCE(EXCLUDED.en, tag_dictionary.en),
  parent_ko = COALESCE(EXCLUDED.parent_ko, tag_dictionary.parent_ko),
  is_procedure = true,
  aliases = COALESCE(EXCLUDED.aliases, tag_dictionary.aliases),
  pubmed_keywords = COALESCE(EXCLUDED.pubmed_keywords, tag_dictionary.pubmed_keywords),
  updated_at = now();

INSERT INTO public.tag_dictionary (ko, category, en, parent_ko, is_procedure, aliases, pubmed_keywords)
VALUES ('눈밑필러', '필러·볼륨', 'under-eye-filler', '필러', true,
        ARRAY['under-eye filler','tear trough filler']::text[], ARRAY['tear trough','hyaluronic acid filler']::text[])
ON CONFLICT (ko) DO UPDATE SET
  category = EXCLUDED.category,
  en = COALESCE(EXCLUDED.en, tag_dictionary.en),
  parent_ko = COALESCE(EXCLUDED.parent_ko, tag_dictionary.parent_ko),
  is_procedure = true,
  aliases = COALESCE(EXCLUDED.aliases, tag_dictionary.aliases),
  pubmed_keywords = COALESCE(EXCLUDED.pubmed_keywords, tag_dictionary.pubmed_keywords),
  updated_at = now();

INSERT INTO public.tag_dictionary (ko, category, en, parent_ko, is_procedure, aliases, pubmed_keywords)
VALUES ('목주름필러', '필러·볼륨', 'neck-filler', '필러', true,
        ARRAY['neck filler']::text[], NULL)
ON CONFLICT (ko) DO UPDATE SET
  category = EXCLUDED.category,
  en = COALESCE(EXCLUDED.en, tag_dictionary.en),
  parent_ko = COALESCE(EXCLUDED.parent_ko, tag_dictionary.parent_ko),
  is_procedure = true,
  aliases = COALESCE(EXCLUDED.aliases, tag_dictionary.aliases),
  pubmed_keywords = COALESCE(EXCLUDED.pubmed_keywords, tag_dictionary.pubmed_keywords),
  updated_at = now();

INSERT INTO public.tag_dictionary (ko, category, en, parent_ko, is_procedure, aliases, pubmed_keywords)
VALUES ('무턱필러', '필러·볼륨', 'recessed-chin-filler', '필러', true,
        ARRAY['chin filler','retruded chin filler']::text[], NULL)
ON CONFLICT (ko) DO UPDATE SET
  category = EXCLUDED.category,
  en = COALESCE(EXCLUDED.en, tag_dictionary.en),
  parent_ko = COALESCE(EXCLUDED.parent_ko, tag_dictionary.parent_ko),
  is_procedure = true,
  aliases = COALESCE(EXCLUDED.aliases, tag_dictionary.aliases),
  pubmed_keywords = COALESCE(EXCLUDED.pubmed_keywords, tag_dictionary.pubmed_keywords),
  updated_at = now();

INSERT INTO public.tag_dictionary (ko, category, en, parent_ko, is_procedure, aliases, pubmed_keywords)
VALUES ('미간필러', '필러·볼륨', 'glabella-filler', '필러', true,
        ARRAY['glabella filler']::text[], NULL)
ON CONFLICT (ko) DO UPDATE SET
  category = EXCLUDED.category,
  en = COALESCE(EXCLUDED.en, tag_dictionary.en),
  parent_ko = COALESCE(EXCLUDED.parent_ko, tag_dictionary.parent_ko),
  is_procedure = true,
  aliases = COALESCE(EXCLUDED.aliases, tag_dictionary.aliases),
  pubmed_keywords = COALESCE(EXCLUDED.pubmed_keywords, tag_dictionary.pubmed_keywords),
  updated_at = now();

INSERT INTO public.tag_dictionary (ko, category, en, parent_ko, is_procedure, aliases, pubmed_keywords)
VALUES ('손등필러', '필러·볼륨', 'hand-filler', '필러', true,
        ARRAY['hand filler','dorsal hand filler']::text[], NULL)
ON CONFLICT (ko) DO UPDATE SET
  category = EXCLUDED.category,
  en = COALESCE(EXCLUDED.en, tag_dictionary.en),
  parent_ko = COALESCE(EXCLUDED.parent_ko, tag_dictionary.parent_ko),
  is_procedure = true,
  aliases = COALESCE(EXCLUDED.aliases, tag_dictionary.aliases),
  pubmed_keywords = COALESCE(EXCLUDED.pubmed_keywords, tag_dictionary.pubmed_keywords),
  updated_at = now();

INSERT INTO public.tag_dictionary (ko, category, en, parent_ko, is_procedure, aliases, pubmed_keywords)
VALUES ('앞광대필러', '필러·볼륨', 'anterior-cheek-filler', '필러', true,
        ARRAY['anterior cheek filler','cheek filler']::text[], NULL)
ON CONFLICT (ko) DO UPDATE SET
  category = EXCLUDED.category,
  en = COALESCE(EXCLUDED.en, tag_dictionary.en),
  parent_ko = COALESCE(EXCLUDED.parent_ko, tag_dictionary.parent_ko),
  is_procedure = true,
  aliases = COALESCE(EXCLUDED.aliases, tag_dictionary.aliases),
  pubmed_keywords = COALESCE(EXCLUDED.pubmed_keywords, tag_dictionary.pubmed_keywords),
  updated_at = now();

INSERT INTO public.tag_dictionary (ko, category, en, parent_ko, is_procedure, aliases, pubmed_keywords)
VALUES ('애교살필러', '필러·볼륨', 'aegyo-sal-filler', '필러', true,
        ARRAY['aegyo-sal filler','under-eye roll filler']::text[], NULL)
ON CONFLICT (ko) DO UPDATE SET
  category = EXCLUDED.category,
  en = COALESCE(EXCLUDED.en, tag_dictionary.en),
  parent_ko = COALESCE(EXCLUDED.parent_ko, tag_dictionary.parent_ko),
  is_procedure = true,
  aliases = COALESCE(EXCLUDED.aliases, tag_dictionary.aliases),
  pubmed_keywords = COALESCE(EXCLUDED.pubmed_keywords, tag_dictionary.pubmed_keywords),
  updated_at = now();

INSERT INTO public.tag_dictionary (ko, category, en, parent_ko, is_procedure, aliases, pubmed_keywords)
VALUES ('이마필러', '필러·볼륨', 'forehead-filler', '필러', true,
        ARRAY['forehead filler']::text[], NULL)
ON CONFLICT (ko) DO UPDATE SET
  category = EXCLUDED.category,
  en = COALESCE(EXCLUDED.en, tag_dictionary.en),
  parent_ko = COALESCE(EXCLUDED.parent_ko, tag_dictionary.parent_ko),
  is_procedure = true,
  aliases = COALESCE(EXCLUDED.aliases, tag_dictionary.aliases),
  pubmed_keywords = COALESCE(EXCLUDED.pubmed_keywords, tag_dictionary.pubmed_keywords),
  updated_at = now();

INSERT INTO public.tag_dictionary (ko, category, en, parent_ko, is_procedure, aliases, pubmed_keywords)
VALUES ('입꼬리필러', '필러·볼륨', 'mouth-corner-filler', '필러', true,
        ARRAY['mouth corner filler','oral commissure filler']::text[], NULL)
ON CONFLICT (ko) DO UPDATE SET
  category = EXCLUDED.category,
  en = COALESCE(EXCLUDED.en, tag_dictionary.en),
  parent_ko = COALESCE(EXCLUDED.parent_ko, tag_dictionary.parent_ko),
  is_procedure = true,
  aliases = COALESCE(EXCLUDED.aliases, tag_dictionary.aliases),
  pubmed_keywords = COALESCE(EXCLUDED.pubmed_keywords, tag_dictionary.pubmed_keywords),
  updated_at = now();

INSERT INTO public.tag_dictionary (ko, category, en, parent_ko, is_procedure, aliases, pubmed_keywords)
VALUES ('입술필러', '필러·볼륨', 'lip-filler', '필러', true,
        ARRAY['lip filler']::text[], ARRAY['lip augmentation','hyaluronic acid filler']::text[])
ON CONFLICT (ko) DO UPDATE SET
  category = EXCLUDED.category,
  en = COALESCE(EXCLUDED.en, tag_dictionary.en),
  parent_ko = COALESCE(EXCLUDED.parent_ko, tag_dictionary.parent_ko),
  is_procedure = true,
  aliases = COALESCE(EXCLUDED.aliases, tag_dictionary.aliases),
  pubmed_keywords = COALESCE(EXCLUDED.pubmed_keywords, tag_dictionary.pubmed_keywords),
  updated_at = now();

INSERT INTO public.tag_dictionary (ko, category, en, parent_ko, is_procedure, aliases, pubmed_keywords)
VALUES ('코필러', '필러·볼륨', 'nose-filler', '필러', true,
        ARRAY['nose filler','non-surgical rhinoplasty']::text[], ARRAY['non-surgical rhinoplasty','hyaluronic acid filler']::text[])
ON CONFLICT (ko) DO UPDATE SET
  category = EXCLUDED.category,
  en = COALESCE(EXCLUDED.en, tag_dictionary.en),
  parent_ko = COALESCE(EXCLUDED.parent_ko, tag_dictionary.parent_ko),
  is_procedure = true,
  aliases = COALESCE(EXCLUDED.aliases, tag_dictionary.aliases),
  pubmed_keywords = COALESCE(EXCLUDED.pubmed_keywords, tag_dictionary.pubmed_keywords),
  updated_at = now();

INSERT INTO public.tag_dictionary (ko, category, en, parent_ko, is_procedure, aliases, pubmed_keywords)
VALUES ('턱끝필러', '필러·볼륨', 'chin-tip-filler', '필러', true,
        ARRAY['chin filler','chin tip filler']::text[], NULL)
ON CONFLICT (ko) DO UPDATE SET
  category = EXCLUDED.category,
  en = COALESCE(EXCLUDED.en, tag_dictionary.en),
  parent_ko = COALESCE(EXCLUDED.parent_ko, tag_dictionary.parent_ko),
  is_procedure = true,
  aliases = COALESCE(EXCLUDED.aliases, tag_dictionary.aliases),
  pubmed_keywords = COALESCE(EXCLUDED.pubmed_keywords, tag_dictionary.pubmed_keywords),
  updated_at = now();

INSERT INTO public.tag_dictionary (ko, category, en, parent_ko, is_procedure, aliases, pubmed_keywords)
VALUES ('팔자필러', '필러·볼륨', 'nasolabial-filler', '필러', true,
        ARRAY['nasolabial fold filler']::text[], ARRAY['nasolabial fold','hyaluronic acid filler']::text[])
ON CONFLICT (ko) DO UPDATE SET
  category = EXCLUDED.category,
  en = COALESCE(EXCLUDED.en, tag_dictionary.en),
  parent_ko = COALESCE(EXCLUDED.parent_ko, tag_dictionary.parent_ko),
  is_procedure = true,
  aliases = COALESCE(EXCLUDED.aliases, tag_dictionary.aliases),
  pubmed_keywords = COALESCE(EXCLUDED.pubmed_keywords, tag_dictionary.pubmed_keywords),
  updated_at = now();

INSERT INTO public.tag_dictionary (ko, category, en, parent_ko, is_procedure, aliases, pubmed_keywords)
VALUES ('눈가보톡스', '주름·윤곽', 'crows-feet-botox', '보톡스', true,
        ARRAY['crow''s feet botox']::text[], ARRAY['botulinum toxin','crow''s feet']::text[])
ON CONFLICT (ko) DO UPDATE SET
  category = EXCLUDED.category,
  en = COALESCE(EXCLUDED.en, tag_dictionary.en),
  parent_ko = COALESCE(EXCLUDED.parent_ko, tag_dictionary.parent_ko),
  is_procedure = true,
  aliases = COALESCE(EXCLUDED.aliases, tag_dictionary.aliases),
  pubmed_keywords = COALESCE(EXCLUDED.pubmed_keywords, tag_dictionary.pubmed_keywords),
  updated_at = now();

INSERT INTO public.tag_dictionary (ko, category, en, parent_ko, is_procedure, aliases, pubmed_keywords)
VALUES ('다한증보톡스', '주름·윤곽', 'hyperhidrosis-botox', '보톡스', true,
        ARRAY['hyperhidrosis botox']::text[], ARRAY['botulinum toxin','hyperhidrosis']::text[])
ON CONFLICT (ko) DO UPDATE SET
  category = EXCLUDED.category,
  en = COALESCE(EXCLUDED.en, tag_dictionary.en),
  parent_ko = COALESCE(EXCLUDED.parent_ko, tag_dictionary.parent_ko),
  is_procedure = true,
  aliases = COALESCE(EXCLUDED.aliases, tag_dictionary.aliases),
  pubmed_keywords = COALESCE(EXCLUDED.pubmed_keywords, tag_dictionary.pubmed_keywords),
  updated_at = now();

INSERT INTO public.tag_dictionary (ko, category, en, parent_ko, is_procedure, aliases, pubmed_keywords)
VALUES ('목보톡스', '주름·윤곽', 'neck-botox', '보톡스', true,
        ARRAY['neck botox']::text[], ARRAY['botulinum toxin','platysmal bands']::text[])
ON CONFLICT (ko) DO UPDATE SET
  category = EXCLUDED.category,
  en = COALESCE(EXCLUDED.en, tag_dictionary.en),
  parent_ko = COALESCE(EXCLUDED.parent_ko, tag_dictionary.parent_ko),
  is_procedure = true,
  aliases = COALESCE(EXCLUDED.aliases, tag_dictionary.aliases),
  pubmed_keywords = COALESCE(EXCLUDED.pubmed_keywords, tag_dictionary.pubmed_keywords),
  updated_at = now();

INSERT INTO public.tag_dictionary (ko, category, en, parent_ko, is_procedure, aliases, pubmed_keywords)
VALUES ('미간보톡스', '주름·윤곽', 'glabella-botox', '보톡스', true,
        ARRAY['glabella botox']::text[], ARRAY['botulinum toxin','glabellar lines']::text[])
ON CONFLICT (ko) DO UPDATE SET
  category = EXCLUDED.category,
  en = COALESCE(EXCLUDED.en, tag_dictionary.en),
  parent_ko = COALESCE(EXCLUDED.parent_ko, tag_dictionary.parent_ko),
  is_procedure = true,
  aliases = COALESCE(EXCLUDED.aliases, tag_dictionary.aliases),
  pubmed_keywords = COALESCE(EXCLUDED.pubmed_keywords, tag_dictionary.pubmed_keywords),
  updated_at = now();

INSERT INTO public.tag_dictionary (ko, category, en, parent_ko, is_procedure, aliases, pubmed_keywords)
VALUES ('사각턱보톡스', '주름·윤곽', 'masseter-botox', '보톡스', true,
        ARRAY['masseter botox','jaw botox']::text[], ARRAY['botulinum toxin','masseter hypertrophy']::text[])
ON CONFLICT (ko) DO UPDATE SET
  category = EXCLUDED.category,
  en = COALESCE(EXCLUDED.en, tag_dictionary.en),
  parent_ko = COALESCE(EXCLUDED.parent_ko, tag_dictionary.parent_ko),
  is_procedure = true,
  aliases = COALESCE(EXCLUDED.aliases, tag_dictionary.aliases),
  pubmed_keywords = COALESCE(EXCLUDED.pubmed_keywords, tag_dictionary.pubmed_keywords),
  updated_at = now();

INSERT INTO public.tag_dictionary (ko, category, en, parent_ko, is_procedure, aliases, pubmed_keywords)
VALUES ('스킨보톡스', '주름·윤곽', 'skin-botox', '보톡스', true,
        ARRAY['skin botox','micro-botox']::text[], ARRAY['microbotox','intradermal botulinum toxin']::text[])
ON CONFLICT (ko) DO UPDATE SET
  category = EXCLUDED.category,
  en = COALESCE(EXCLUDED.en, tag_dictionary.en),
  parent_ko = COALESCE(EXCLUDED.parent_ko, tag_dictionary.parent_ko),
  is_procedure = true,
  aliases = COALESCE(EXCLUDED.aliases, tag_dictionary.aliases),
  pubmed_keywords = COALESCE(EXCLUDED.pubmed_keywords, tag_dictionary.pubmed_keywords),
  updated_at = now();

INSERT INTO public.tag_dictionary (ko, category, en, parent_ko, is_procedure, aliases, pubmed_keywords)
VALUES ('승모근보톡스', '주름·윤곽', 'trapezius-botox', '보톡스', true,
        ARRAY['trapezius botox']::text[], ARRAY['botulinum toxin','trapezius']::text[])
ON CONFLICT (ko) DO UPDATE SET
  category = EXCLUDED.category,
  en = COALESCE(EXCLUDED.en, tag_dictionary.en),
  parent_ko = COALESCE(EXCLUDED.parent_ko, tag_dictionary.parent_ko),
  is_procedure = true,
  aliases = COALESCE(EXCLUDED.aliases, tag_dictionary.aliases),
  pubmed_keywords = COALESCE(EXCLUDED.pubmed_keywords, tag_dictionary.pubmed_keywords),
  updated_at = now();

INSERT INTO public.tag_dictionary (ko, category, en, parent_ko, is_procedure, aliases, pubmed_keywords)
VALUES ('앨러간보톡스', '주름·윤곽', 'allergan-botox', '보톡스', true,
        ARRAY['Allergan Botox']::text[], ARRAY['onabotulinumtoxinA','botulinum toxin type A']::text[])
ON CONFLICT (ko) DO UPDATE SET
  category = EXCLUDED.category,
  en = COALESCE(EXCLUDED.en, tag_dictionary.en),
  parent_ko = COALESCE(EXCLUDED.parent_ko, tag_dictionary.parent_ko),
  is_procedure = true,
  aliases = COALESCE(EXCLUDED.aliases, tag_dictionary.aliases),
  pubmed_keywords = COALESCE(EXCLUDED.pubmed_keywords, tag_dictionary.pubmed_keywords),
  updated_at = now();

INSERT INTO public.tag_dictionary (ko, category, en, parent_ko, is_procedure, aliases, pubmed_keywords)
VALUES ('어깨보톡스', '주름·윤곽', 'shoulder-botox', '보톡스', true,
        ARRAY['shoulder botox']::text[], ARRAY['botulinum toxin','trapezius']::text[])
ON CONFLICT (ko) DO UPDATE SET
  category = EXCLUDED.category,
  en = COALESCE(EXCLUDED.en, tag_dictionary.en),
  parent_ko = COALESCE(EXCLUDED.parent_ko, tag_dictionary.parent_ko),
  is_procedure = true,
  aliases = COALESCE(EXCLUDED.aliases, tag_dictionary.aliases),
  pubmed_keywords = COALESCE(EXCLUDED.pubmed_keywords, tag_dictionary.pubmed_keywords),
  updated_at = now();

INSERT INTO public.tag_dictionary (ko, category, en, parent_ko, is_procedure, aliases, pubmed_keywords)
VALUES ('이마보톡스', '주름·윤곽', 'forehead-botox', '보톡스', true,
        ARRAY['forehead botox']::text[], ARRAY['botulinum toxin','forehead lines']::text[])
ON CONFLICT (ko) DO UPDATE SET
  category = EXCLUDED.category,
  en = COALESCE(EXCLUDED.en, tag_dictionary.en),
  parent_ko = COALESCE(EXCLUDED.parent_ko, tag_dictionary.parent_ko),
  is_procedure = true,
  aliases = COALESCE(EXCLUDED.aliases, tag_dictionary.aliases),
  pubmed_keywords = COALESCE(EXCLUDED.pubmed_keywords, tag_dictionary.pubmed_keywords),
  updated_at = now();

INSERT INTO public.tag_dictionary (ko, category, en, parent_ko, is_procedure, aliases, pubmed_keywords)
VALUES ('입꼬리보톡스', '주름·윤곽', 'mouth-corner-botox', '보톡스', true,
        ARRAY['mouth corner botox']::text[], ARRAY['botulinum toxin','depressor anguli oris']::text[])
ON CONFLICT (ko) DO UPDATE SET
  category = EXCLUDED.category,
  en = COALESCE(EXCLUDED.en, tag_dictionary.en),
  parent_ko = COALESCE(EXCLUDED.parent_ko, tag_dictionary.parent_ko),
  is_procedure = true,
  aliases = COALESCE(EXCLUDED.aliases, tag_dictionary.aliases),
  pubmed_keywords = COALESCE(EXCLUDED.pubmed_keywords, tag_dictionary.pubmed_keywords),
  updated_at = now();

INSERT INTO public.tag_dictionary (ko, category, en, parent_ko, is_procedure, aliases, pubmed_keywords)
VALUES ('잇몸보톡스', '주름·윤곽', 'gummy-smile-botox', '보톡스', true,
        ARRAY['gummy smile botox']::text[], ARRAY['botulinum toxin','gummy smile']::text[])
ON CONFLICT (ko) DO UPDATE SET
  category = EXCLUDED.category,
  en = COALESCE(EXCLUDED.en, tag_dictionary.en),
  parent_ko = COALESCE(EXCLUDED.parent_ko, tag_dictionary.parent_ko),
  is_procedure = true,
  aliases = COALESCE(EXCLUDED.aliases, tag_dictionary.aliases),
  pubmed_keywords = COALESCE(EXCLUDED.pubmed_keywords, tag_dictionary.pubmed_keywords),
  updated_at = now();

INSERT INTO public.tag_dictionary (ko, category, en, parent_ko, is_procedure, aliases, pubmed_keywords)
VALUES ('종아리보톡스', '주름·윤곽', 'calf-botox', '보톡스', true,
        ARRAY['calf botox']::text[], ARRAY['botulinum toxin','gastrocnemius']::text[])
ON CONFLICT (ko) DO UPDATE SET
  category = EXCLUDED.category,
  en = COALESCE(EXCLUDED.en, tag_dictionary.en),
  parent_ko = COALESCE(EXCLUDED.parent_ko, tag_dictionary.parent_ko),
  is_procedure = true,
  aliases = COALESCE(EXCLUDED.aliases, tag_dictionary.aliases),
  pubmed_keywords = COALESCE(EXCLUDED.pubmed_keywords, tag_dictionary.pubmed_keywords),
  updated_at = now();

INSERT INTO public.tag_dictionary (ko, category, en, parent_ko, is_procedure, aliases, pubmed_keywords)
VALUES ('침샘보톡스', '주름·윤곽', 'salivary-gland-botox', '보톡스', true,
        ARRAY['salivary gland botox']::text[], ARRAY['botulinum toxin','sialorrhea','parotid']::text[])
ON CONFLICT (ko) DO UPDATE SET
  category = EXCLUDED.category,
  en = COALESCE(EXCLUDED.en, tag_dictionary.en),
  parent_ko = COALESCE(EXCLUDED.parent_ko, tag_dictionary.parent_ko),
  is_procedure = true,
  aliases = COALESCE(EXCLUDED.aliases, tag_dictionary.aliases),
  pubmed_keywords = COALESCE(EXCLUDED.pubmed_keywords, tag_dictionary.pubmed_keywords),
  updated_at = now();

INSERT INTO public.tag_dictionary (ko, category, en, parent_ko, is_procedure, aliases, pubmed_keywords)
VALUES ('콧볼보톡스', '주름·윤곽', 'alar-botox', '보톡스', true,
        ARRAY['alar botox','nostril botox']::text[], ARRAY['botulinum toxin']::text[])
ON CONFLICT (ko) DO UPDATE SET
  category = EXCLUDED.category,
  en = COALESCE(EXCLUDED.en, tag_dictionary.en),
  parent_ko = COALESCE(EXCLUDED.parent_ko, tag_dictionary.parent_ko),
  is_procedure = true,
  aliases = COALESCE(EXCLUDED.aliases, tag_dictionary.aliases),
  pubmed_keywords = COALESCE(EXCLUDED.pubmed_keywords, tag_dictionary.pubmed_keywords),
  updated_at = now();

INSERT INTO public.tag_dictionary (ko, category, en, parent_ko, is_procedure, aliases, pubmed_keywords)
VALUES ('턱끝보톡스', '주름·윤곽', 'chin-botox', '보톡스', true,
        ARRAY['chin botox']::text[], ARRAY['botulinum toxin','mentalis']::text[])
ON CONFLICT (ko) DO UPDATE SET
  category = EXCLUDED.category,
  en = COALESCE(EXCLUDED.en, tag_dictionary.en),
  parent_ko = COALESCE(EXCLUDED.parent_ko, tag_dictionary.parent_ko),
  is_procedure = true,
  aliases = COALESCE(EXCLUDED.aliases, tag_dictionary.aliases),
  pubmed_keywords = COALESCE(EXCLUDED.pubmed_keywords, tag_dictionary.pubmed_keywords),
  updated_at = now();

INSERT INTO public.tag_dictionary (ko, category, en, parent_ko, is_procedure, aliases, pubmed_keywords)
VALUES ('허벅지보톡스', '주름·윤곽', 'thigh-botox', '보톡스', true,
        ARRAY['thigh botox']::text[], ARRAY['botulinum toxin']::text[])
ON CONFLICT (ko) DO UPDATE SET
  category = EXCLUDED.category,
  en = COALESCE(EXCLUDED.en, tag_dictionary.en),
  parent_ko = COALESCE(EXCLUDED.parent_ko, tag_dictionary.parent_ko),
  is_procedure = true,
  aliases = COALESCE(EXCLUDED.aliases, tag_dictionary.aliases),
  pubmed_keywords = COALESCE(EXCLUDED.pubmed_keywords, tag_dictionary.pubmed_keywords),
  updated_at = now();

INSERT INTO public.tag_dictionary (ko, category, en, parent_ko, is_procedure, aliases, pubmed_keywords)
VALUES ('두피보톡스', '기타', 'scalp-botox', '보톡스', true,
        ARRAY['scalp botox']::text[], ARRAY['botulinum toxin','scalp','seborrhea']::text[])
ON CONFLICT (ko) DO UPDATE SET
  category = EXCLUDED.category,
  en = COALESCE(EXCLUDED.en, tag_dictionary.en),
  parent_ko = COALESCE(EXCLUDED.parent_ko, tag_dictionary.parent_ko),
  is_procedure = true,
  aliases = COALESCE(EXCLUDED.aliases, tag_dictionary.aliases),
  pubmed_keywords = COALESCE(EXCLUDED.pubmed_keywords, tag_dictionary.pubmed_keywords),
  updated_at = now();

INSERT INTO public.tag_dictionary (ko, category, en, parent_ko, is_procedure, aliases, pubmed_keywords)
VALUES ('더엘주사', '주름·윤곽', 'the-l-injection', '지방분해주사', true,
        ARRAY['The L injection']::text[], ARRAY['injection lipolysis','lipolytic injection']::text[])
ON CONFLICT (ko) DO UPDATE SET
  category = EXCLUDED.category,
  en = COALESCE(EXCLUDED.en, tag_dictionary.en),
  parent_ko = COALESCE(EXCLUDED.parent_ko, tag_dictionary.parent_ko),
  is_procedure = true,
  aliases = COALESCE(EXCLUDED.aliases, tag_dictionary.aliases),
  pubmed_keywords = COALESCE(EXCLUDED.pubmed_keywords, tag_dictionary.pubmed_keywords),
  updated_at = now();

INSERT INTO public.tag_dictionary (ko, category, en, parent_ko, is_procedure, aliases, pubmed_keywords)
VALUES ('윤곽주사', '주름·윤곽', 'contour-injection', '지방분해주사', true,
        ARRAY['contour injection','facial slimming injection']::text[], ARRAY['injection lipolysis','phosphatidylcholine','deoxycholic acid']::text[])
ON CONFLICT (ko) DO UPDATE SET
  category = EXCLUDED.category,
  en = COALESCE(EXCLUDED.en, tag_dictionary.en),
  parent_ko = COALESCE(EXCLUDED.parent_ko, tag_dictionary.parent_ko),
  is_procedure = true,
  aliases = COALESCE(EXCLUDED.aliases, tag_dictionary.aliases),
  pubmed_keywords = COALESCE(EXCLUDED.pubmed_keywords, tag_dictionary.pubmed_keywords),
  updated_at = now();

INSERT INTO public.tag_dictionary (ko, category, en, parent_ko, is_procedure, aliases, pubmed_keywords)
VALUES ('조각주사', '주름·윤곽', 'sculpting-injection', '지방분해주사', true,
        ARRAY['body sculpting injection']::text[], ARRAY['injection lipolysis','phosphatidylcholine']::text[])
ON CONFLICT (ko) DO UPDATE SET
  category = EXCLUDED.category,
  en = COALESCE(EXCLUDED.en, tag_dictionary.en),
  parent_ko = COALESCE(EXCLUDED.parent_ko, tag_dictionary.parent_ko),
  is_procedure = true,
  aliases = COALESCE(EXCLUDED.aliases, tag_dictionary.aliases),
  pubmed_keywords = COALESCE(EXCLUDED.pubmed_keywords, tag_dictionary.pubmed_keywords),
  updated_at = now();

INSERT INTO public.tag_dictionary (ko, category, en, parent_ko, is_procedure, aliases, pubmed_keywords)
VALUES ('HPL주사', '주름·윤곽', 'hpl-injection', '지방분해주사', true,
        ARRAY['HPL injection']::text[], ARRAY['injection lipolysis','phosphatidylcholine']::text[])
ON CONFLICT (ko) DO UPDATE SET
  category = EXCLUDED.category,
  en = COALESCE(EXCLUDED.en, tag_dictionary.en),
  parent_ko = COALESCE(EXCLUDED.parent_ko, tag_dictionary.parent_ko),
  is_procedure = true,
  aliases = COALESCE(EXCLUDED.aliases, tag_dictionary.aliases),
  pubmed_keywords = COALESCE(EXCLUDED.pubmed_keywords, tag_dictionary.pubmed_keywords),
  updated_at = now();

INSERT INTO public.tag_dictionary (ko, category, en, parent_ko, is_procedure, aliases, pubmed_keywords)
VALUES ('브이빔퍼펙타', '레이저', 'vbeam-perfecta', '브이빔', true,
        ARRAY['Vbeam Perfecta']::text[], ARRAY['pulsed dye laser','595 nm']::text[])
ON CONFLICT (ko) DO UPDATE SET
  category = EXCLUDED.category,
  en = COALESCE(EXCLUDED.en, tag_dictionary.en),
  parent_ko = COALESCE(EXCLUDED.parent_ko, tag_dictionary.parent_ko),
  is_procedure = true,
  aliases = COALESCE(EXCLUDED.aliases, tag_dictionary.aliases),
  pubmed_keywords = COALESCE(EXCLUDED.pubmed_keywords, tag_dictionary.pubmed_keywords),
  updated_at = now();

INSERT INTO public.tag_dictionary (ko, category, en, parent_ko, is_procedure, aliases, pubmed_keywords)
VALUES ('젠틀맥스프로', '레이저', 'gentlemax-pro', '젠틀맥스', true,
        ARRAY['GentleMax Pro']::text[], ARRAY['alexandrite laser','Nd:YAG laser','laser hair removal']::text[])
ON CONFLICT (ko) DO UPDATE SET
  category = EXCLUDED.category,
  en = COALESCE(EXCLUDED.en, tag_dictionary.en),
  parent_ko = COALESCE(EXCLUDED.parent_ko, tag_dictionary.parent_ko),
  is_procedure = true,
  aliases = COALESCE(EXCLUDED.aliases, tag_dictionary.aliases),
  pubmed_keywords = COALESCE(EXCLUDED.pubmed_keywords, tag_dictionary.pubmed_keywords),
  updated_at = now();

INSERT INTO public.tag_dictionary (ko, category, en, parent_ko, is_procedure, aliases, pubmed_keywords)
VALUES ('디스커버리피코', '레이저', 'discovery-pico', '피코레이저', true,
        ARRAY['Discovery Pico']::text[], ARRAY['picosecond laser']::text[])
ON CONFLICT (ko) DO UPDATE SET
  category = EXCLUDED.category,
  en = COALESCE(EXCLUDED.en, tag_dictionary.en),
  parent_ko = COALESCE(EXCLUDED.parent_ko, tag_dictionary.parent_ko),
  is_procedure = true,
  aliases = COALESCE(EXCLUDED.aliases, tag_dictionary.aliases),
  pubmed_keywords = COALESCE(EXCLUDED.pubmed_keywords, tag_dictionary.pubmed_keywords),
  updated_at = now();

INSERT INTO public.tag_dictionary (ko, category, en, parent_ko, is_procedure, aliases, pubmed_keywords)
VALUES ('인라이튼', '레이저', 'enlighten', '피코레이저', true,
        ARRAY['enlighten']::text[], ARRAY['picosecond laser','picosecond Nd:YAG']::text[])
ON CONFLICT (ko) DO UPDATE SET
  category = EXCLUDED.category,
  en = COALESCE(EXCLUDED.en, tag_dictionary.en),
  parent_ko = COALESCE(EXCLUDED.parent_ko, tag_dictionary.parent_ko),
  is_procedure = true,
  aliases = COALESCE(EXCLUDED.aliases, tag_dictionary.aliases),
  pubmed_keywords = COALESCE(EXCLUDED.pubmed_keywords, tag_dictionary.pubmed_keywords),
  updated_at = now();

INSERT INTO public.tag_dictionary (ko, category, en, parent_ko, is_procedure, aliases, pubmed_keywords)
VALUES ('피코슈어', '레이저', 'picosure', '피코레이저', true,
        ARRAY['PicoSure']::text[], ARRAY['picosecond laser','picosecond alexandrite','755 nm']::text[])
ON CONFLICT (ko) DO UPDATE SET
  category = EXCLUDED.category,
  en = COALESCE(EXCLUDED.en, tag_dictionary.en),
  parent_ko = COALESCE(EXCLUDED.parent_ko, tag_dictionary.parent_ko),
  is_procedure = true,
  aliases = COALESCE(EXCLUDED.aliases, tag_dictionary.aliases),
  pubmed_keywords = COALESCE(EXCLUDED.pubmed_keywords, tag_dictionary.pubmed_keywords),
  updated_at = now();

INSERT INTO public.tag_dictionary (ko, category, en, parent_ko, is_procedure, aliases, pubmed_keywords)
VALUES ('피코웨이', '레이저', 'picoway', '피코레이저', true,
        ARRAY['PicoWay']::text[], ARRAY['picosecond laser','picosecond Nd:YAG']::text[])
ON CONFLICT (ko) DO UPDATE SET
  category = EXCLUDED.category,
  en = COALESCE(EXCLUDED.en, tag_dictionary.en),
  parent_ko = COALESCE(EXCLUDED.parent_ko, tag_dictionary.parent_ko),
  is_procedure = true,
  aliases = COALESCE(EXCLUDED.aliases, tag_dictionary.aliases),
  pubmed_keywords = COALESCE(EXCLUDED.pubmed_keywords, tag_dictionary.pubmed_keywords),
  updated_at = now();

INSERT INTO public.tag_dictionary (ko, category, en, parent_ko, is_procedure, aliases, pubmed_keywords)
VALUES ('피코케어', '레이저', 'picocare', '피코레이저', true,
        ARRAY['PicoCare']::text[], ARRAY['picosecond laser']::text[])
ON CONFLICT (ko) DO UPDATE SET
  category = EXCLUDED.category,
  en = COALESCE(EXCLUDED.en, tag_dictionary.en),
  parent_ko = COALESCE(EXCLUDED.parent_ko, tag_dictionary.parent_ko),
  is_procedure = true,
  aliases = COALESCE(EXCLUDED.aliases, tag_dictionary.aliases),
  pubmed_keywords = COALESCE(EXCLUDED.pubmed_keywords, tag_dictionary.pubmed_keywords),
  updated_at = now();

INSERT INTO public.tag_dictionary (ko, category, en, parent_ko, is_procedure, aliases, pubmed_keywords)
VALUES ('피코플러스', '레이저', 'picoplus', '피코레이저', true,
        ARRAY['PicoPlus']::text[], ARRAY['picosecond laser']::text[])
ON CONFLICT (ko) DO UPDATE SET
  category = EXCLUDED.category,
  en = COALESCE(EXCLUDED.en, tag_dictionary.en),
  parent_ko = COALESCE(EXCLUDED.parent_ko, tag_dictionary.parent_ko),
  is_procedure = true,
  aliases = COALESCE(EXCLUDED.aliases, tag_dictionary.aliases),
  pubmed_keywords = COALESCE(EXCLUDED.pubmed_keywords, tag_dictionary.pubmed_keywords),
  updated_at = now();

INSERT INTO public.tag_dictionary (ko, category, en, parent_ko, is_procedure, aliases, pubmed_keywords)
VALUES ('피코토닝', '레이저', 'pico-toning', '피코레이저', true,
        ARRAY['pico toning']::text[], ARRAY['picosecond laser','melasma','laser toning']::text[])
ON CONFLICT (ko) DO UPDATE SET
  category = EXCLUDED.category,
  en = COALESCE(EXCLUDED.en, tag_dictionary.en),
  parent_ko = COALESCE(EXCLUDED.parent_ko, tag_dictionary.parent_ko),
  is_procedure = true,
  aliases = COALESCE(EXCLUDED.aliases, tag_dictionary.aliases),
  pubmed_keywords = COALESCE(EXCLUDED.pubmed_keywords, tag_dictionary.pubmed_keywords),
  updated_at = now();

INSERT INTO public.tag_dictionary (ko, category, en, parent_ko, is_procedure, aliases, pubmed_keywords)
VALUES ('피코프락셀', '레이저', 'pico-fractional', '피코레이저', true,
        ARRAY['pico fractional']::text[], ARRAY['picosecond fractional laser','fractional laser']::text[])
ON CONFLICT (ko) DO UPDATE SET
  category = EXCLUDED.category,
  en = COALESCE(EXCLUDED.en, tag_dictionary.en),
  parent_ko = COALESCE(EXCLUDED.parent_ko, tag_dictionary.parent_ko),
  is_procedure = true,
  aliases = COALESCE(EXCLUDED.aliases, tag_dictionary.aliases),
  pubmed_keywords = COALESCE(EXCLUDED.pubmed_keywords, tag_dictionary.pubmed_keywords),
  updated_at = now();

INSERT INTO public.tag_dictionary (ko, category, en, parent_ko, is_procedure, aliases, pubmed_keywords)
VALUES ('브이로', '리프팅', 'vro', '더블로골드', true,
        ARRAY['V-RO']::text[], ARRAY['high-intensity focused ultrasound','radiofrequency']::text[])
ON CONFLICT (ko) DO UPDATE SET
  category = EXCLUDED.category,
  en = COALESCE(EXCLUDED.en, tag_dictionary.en),
  parent_ko = COALESCE(EXCLUDED.parent_ko, tag_dictionary.parent_ko),
  is_procedure = true,
  aliases = COALESCE(EXCLUDED.aliases, tag_dictionary.aliases),
  pubmed_keywords = COALESCE(EXCLUDED.pubmed_keywords, tag_dictionary.pubmed_keywords),
  updated_at = now();

INSERT INTO public.tag_dictionary (ko, category, en, parent_ko, is_procedure, aliases, pubmed_keywords)
VALUES ('브이빔프리마', '레이저', 'vbeam-prima', '브이빔퍼펙타', true,
        ARRAY['Vbeam Prima']::text[], ARRAY['pulsed dye laser','595 nm']::text[])
ON CONFLICT (ko) DO UPDATE SET
  category = EXCLUDED.category,
  en = COALESCE(EXCLUDED.en, tag_dictionary.en),
  parent_ko = COALESCE(EXCLUDED.parent_ko, tag_dictionary.parent_ko),
  is_procedure = true,
  aliases = COALESCE(EXCLUDED.aliases, tag_dictionary.aliases),
  pubmed_keywords = COALESCE(EXCLUDED.pubmed_keywords, tag_dictionary.pubmed_keywords),
  updated_at = now();

INSERT INTO public.tag_dictionary (ko, category, en, parent_ko, is_procedure, aliases, pubmed_keywords)
VALUES ('젠틀맥스프로플러스', '레이저', 'gentlemax-pro-plus', '젠틀맥스프로', true,
        ARRAY['GentleMax Pro Plus']::text[], ARRAY['alexandrite laser','Nd:YAG laser']::text[])
ON CONFLICT (ko) DO UPDATE SET
  category = EXCLUDED.category,
  en = COALESCE(EXCLUDED.en, tag_dictionary.en),
  parent_ko = COALESCE(EXCLUDED.parent_ko, tag_dictionary.parent_ko),
  is_procedure = true,
  aliases = COALESCE(EXCLUDED.aliases, tag_dictionary.aliases),
  pubmed_keywords = COALESCE(EXCLUDED.pubmed_keywords, tag_dictionary.pubmed_keywords),
  updated_at = now();

INSERT INTO public.tag_dictionary (ko, category, en, parent_ko, is_procedure, aliases, pubmed_keywords)
VALUES ('브이로어드밴스', '리프팅', 'vro-advance', '브이로', true,
        ARRAY['V-RO Advance']::text[], ARRAY['HIFU','radiofrequency']::text[])
ON CONFLICT (ko) DO UPDATE SET
  category = EXCLUDED.category,
  en = COALESCE(EXCLUDED.en, tag_dictionary.en),
  parent_ko = COALESCE(EXCLUDED.parent_ko, tag_dictionary.parent_ko),
  is_procedure = true,
  aliases = COALESCE(EXCLUDED.aliases, tag_dictionary.aliases),
  pubmed_keywords = COALESCE(EXCLUDED.pubmed_keywords, tag_dictionary.pubmed_keywords),
  updated_at = now();

-- ── tag_normalization: 오타 → 정규형 매핑 ──

INSERT INTO public.tag_normalization (canonical, variants)
VALUES ('더블로', ARRAY['더불로']::text[])
ON CONFLICT (canonical) DO UPDATE SET variants = EXCLUDED.variants;

INSERT INTO public.tag_normalization (canonical, variants)
VALUES ('덴서티', ARRAY['덴시티']::text[])
ON CONFLICT (canonical) DO UPDATE SET variants = EXCLUDED.variants;

INSERT INTO public.tag_normalization (canonical, variants)
VALUES ('볼뉴머', ARRAY['볼뉴마']::text[])
ON CONFLICT (canonical) DO UPDATE SET variants = EXCLUDED.variants;

INSERT INTO public.tag_normalization (canonical, variants)
VALUES ('세르프', ARRAY['써르프']::text[])
ON CONFLICT (canonical) DO UPDATE SET variants = EXCLUDED.variants;

INSERT INTO public.tag_normalization (canonical, variants)
VALUES ('소프웨이브', ARRAY['솝웨이브']::text[])
ON CONFLICT (canonical) DO UPDATE SET variants = EXCLUDED.variants;

INSERT INTO public.tag_normalization (canonical, variants)
VALUES ('써마지', ARRAY['서마지']::text[])
ON CONFLICT (canonical) DO UPDATE SET variants = EXCLUDED.variants;

INSERT INTO public.tag_normalization (canonical, variants)
VALUES ('엠페이스', ARRAY['앰페이스']::text[])
ON CONFLICT (canonical) DO UPDATE SET variants = EXCLUDED.variants;

INSERT INTO public.tag_normalization (canonical, variants)
VALUES ('올리지오', ARRAY['올리지요']::text[])
ON CONFLICT (canonical) DO UPDATE SET variants = EXCLUDED.variants;

INSERT INTO public.tag_normalization (canonical, variants)
VALUES ('울쎄라', ARRAY['울세라','울쌔라']::text[])
ON CONFLICT (canonical) DO UPDATE SET variants = EXCLUDED.variants;

INSERT INTO public.tag_normalization (canonical, variants)
VALUES ('인모드', ARRAY['인모트','임모드']::text[])
ON CONFLICT (canonical) DO UPDATE SET variants = EXCLUDED.variants;

INSERT INTO public.tag_normalization (canonical, variants)
VALUES ('텐써마', ARRAY['텐서마']::text[])
ON CONFLICT (canonical) DO UPDATE SET variants = EXCLUDED.variants;

INSERT INTO public.tag_normalization (canonical, variants)
VALUES ('텐쎄라', ARRAY['텐세라']::text[])
ON CONFLICT (canonical) DO UPDATE SET variants = EXCLUDED.variants;

INSERT INTO public.tag_normalization (canonical, variants)
VALUES ('리쥬란', ARRAY['리주란']::text[])
ON CONFLICT (canonical) DO UPDATE SET variants = EXCLUDED.variants;

INSERT INTO public.tag_normalization (canonical, variants)
VALUES ('잘루프로', ARRAY['쟐루프로']::text[])
ON CONFLICT (canonical) DO UPDATE SET variants = EXCLUDED.variants;

INSERT INTO public.tag_normalization (canonical, variants)
VALUES ('쥬베룩', ARRAY['주베룩','쥬베록']::text[])
ON CONFLICT (canonical) DO UPDATE SET variants = EXCLUDED.variants;

INSERT INTO public.tag_normalization (canonical, variants)
VALUES ('프로파일로', ARRAY['프로필로']::text[])
ON CONFLICT (canonical) DO UPDATE SET variants = EXCLUDED.variants;

INSERT INTO public.tag_normalization (canonical, variants)
VALUES ('래디어스', ARRAY['레디어스']::text[])
ON CONFLICT (canonical) DO UPDATE SET variants = EXCLUDED.variants;

INSERT INTO public.tag_normalization (canonical, variants)
VALUES ('스컬트라', ARRAY['스칼트라']::text[])
ON CONFLICT (canonical) DO UPDATE SET variants = EXCLUDED.variants;

INSERT INTO public.tag_normalization (canonical, variants)
VALUES ('엘란쎄', ARRAY['엘란세']::text[])
ON CONFLICT (canonical) DO UPDATE SET variants = EXCLUDED.variants;

INSERT INTO public.tag_normalization (canonical, variants)
VALUES ('레스틸렌', ARRAY['레스틸린']::text[])
ON CONFLICT (canonical) DO UPDATE SET variants = EXCLUDED.variants;

INSERT INTO public.tag_normalization (canonical, variants)
VALUES ('쥬비덤', ARRAY['주비덤','쥬비덥']::text[])
ON CONFLICT (canonical) DO UPDATE SET variants = EXCLUDED.variants;

INSERT INTO public.tag_normalization (canonical, variants)
VALUES ('테오시알', ARRAY['테오씨알']::text[])
ON CONFLICT (canonical) DO UPDATE SET variants = EXCLUDED.variants;

INSERT INTO public.tag_normalization (canonical, variants)
VALUES ('메디톡신', ARRAY['메디톡스']::text[])
ON CONFLICT (canonical) DO UPDATE SET variants = EXCLUDED.variants;

INSERT INTO public.tag_normalization (canonical, variants)
VALUES ('보툴렉스', ARRAY['보툴랙스']::text[])
ON CONFLICT (canonical) DO UPDATE SET variants = EXCLUDED.variants;

INSERT INTO public.tag_normalization (canonical, variants)
VALUES ('엘싸', ARRAY['엘사']::text[])
ON CONFLICT (canonical) DO UPDATE SET variants = EXCLUDED.variants;

INSERT INTO public.tag_normalization (canonical, variants)
VALUES ('기미레이저', ARRAY['기미레이져']::text[])
ON CONFLICT (canonical) DO UPDATE SET variants = EXCLUDED.variants;

INSERT INTO public.tag_normalization (canonical, variants)
VALUES ('레이저토닝', ARRAY['레이져토닝']::text[])
ON CONFLICT (canonical) DO UPDATE SET variants = EXCLUDED.variants;

INSERT INTO public.tag_normalization (canonical, variants)
VALUES ('스칼렛', ARRAY['스카렛']::text[])
ON CONFLICT (canonical) DO UPDATE SET variants = EXCLUDED.variants;

INSERT INTO public.tag_normalization (canonical, variants)
VALUES ('스펙트라', ARRAY['스팩트라']::text[])
ON CONFLICT (canonical) DO UPDATE SET variants = EXCLUDED.variants;

INSERT INTO public.tag_normalization (canonical, variants)
VALUES ('시크릿', ARRAY['시크렛']::text[])
ON CONFLICT (canonical) DO UPDATE SET variants = EXCLUDED.variants;

INSERT INTO public.tag_normalization (canonical, variants)
VALUES ('실펌X', ARRAY['실펌x']::text[])
ON CONFLICT (canonical) DO UPDATE SET variants = EXCLUDED.variants;

INSERT INTO public.tag_normalization (canonical, variants)
VALUES ('엑셀V', ARRAY['액셀V','엑셀v']::text[])
ON CONFLICT (canonical) DO UPDATE SET variants = EXCLUDED.variants;

INSERT INTO public.tag_normalization (canonical, variants)
VALUES ('제모레이저', ARRAY['제모레이져']::text[])
ON CONFLICT (canonical) DO UPDATE SET variants = EXCLUDED.variants;

INSERT INTO public.tag_normalization (canonical, variants)
VALUES ('젠틀맥스', ARRAY['젠들맥스']::text[])
ON CONFLICT (canonical) DO UPDATE SET variants = EXCLUDED.variants;

INSERT INTO public.tag_normalization (canonical, variants)
VALUES ('클라리티', ARRAY['클래리티']::text[])
ON CONFLICT (canonical) DO UPDATE SET variants = EXCLUDED.variants;

INSERT INTO public.tag_normalization (canonical, variants)
VALUES ('튼살레이저', ARRAY['튼살레이져']::text[])
ON CONFLICT (canonical) DO UPDATE SET variants = EXCLUDED.variants;

INSERT INTO public.tag_normalization (canonical, variants)
VALUES ('포텐자', ARRAY['포텐쟈']::text[])
ON CONFLICT (canonical) DO UPDATE SET variants = EXCLUDED.variants;

INSERT INTO public.tag_normalization (canonical, variants)
VALUES ('프락셀', ARRAY['프랙셀']::text[])
ON CONFLICT (canonical) DO UPDATE SET variants = EXCLUDED.variants;

INSERT INTO public.tag_normalization (canonical, variants)
VALUES ('엠스컬프트', ARRAY['앰스컬프트','엠스컬트']::text[])
ON CONFLICT (canonical) DO UPDATE SET variants = EXCLUDED.variants;

INSERT INTO public.tag_normalization (canonical, variants)
VALUES ('쿨소닉', ARRAY['쿨소니크']::text[])
ON CONFLICT (canonical) DO UPDATE SET variants = EXCLUDED.variants;

INSERT INTO public.tag_normalization (canonical, variants)
VALUES ('쿨스컬프팅', ARRAY['쿨스컬핑']::text[])
ON CONFLICT (canonical) DO UPDATE SET variants = EXCLUDED.variants;

INSERT INTO public.tag_normalization (canonical, variants)
VALUES ('써마지FLX', ARRAY['서마지FLX','서마지flx','써마지flx']::text[])
ON CONFLICT (canonical) DO UPDATE SET variants = EXCLUDED.variants;

INSERT INTO public.tag_normalization (canonical, variants)
VALUES ('올리지오X', ARRAY['올리지오x']::text[])
ON CONFLICT (canonical) DO UPDATE SET variants = EXCLUDED.variants;

INSERT INTO public.tag_normalization (canonical, variants)
VALUES ('울쎄라프라임', ARRAY['울세라프라임']::text[])
ON CONFLICT (canonical) DO UPDATE SET variants = EXCLUDED.variants;

INSERT INTO public.tag_normalization (canonical, variants)
VALUES ('인모드FX', ARRAY['인모드fx']::text[])
ON CONFLICT (canonical) DO UPDATE SET variants = EXCLUDED.variants;

INSERT INTO public.tag_normalization (canonical, variants)
VALUES ('리쥬란아이', ARRAY['리주란아이']::text[])
ON CONFLICT (canonical) DO UPDATE SET variants = EXCLUDED.variants;

INSERT INTO public.tag_normalization (canonical, variants)
VALUES ('리쥬란힐러', ARRAY['리주란힐러']::text[])
ON CONFLICT (canonical) DO UPDATE SET variants = EXCLUDED.variants;

INSERT INTO public.tag_normalization (canonical, variants)
VALUES ('리쥬란HB플러스', ARRAY['리주란HB플러스']::text[])
ON CONFLICT (canonical) DO UPDATE SET variants = EXCLUDED.variants;

INSERT INTO public.tag_normalization (canonical, variants)
VALUES ('리쥬란S', ARRAY['리주란S','리쥬란s']::text[])
ON CONFLICT (canonical) DO UPDATE SET variants = EXCLUDED.variants;

INSERT INTO public.tag_normalization (canonical, variants)
VALUES ('쥬베룩볼륨', ARRAY['주베룩볼륨']::text[])
ON CONFLICT (canonical) DO UPDATE SET variants = EXCLUDED.variants;

INSERT INTO public.tag_normalization (canonical, variants)
VALUES ('젠틀맥스프로', ARRAY['젠들맥스프로']::text[])
ON CONFLICT (canonical) DO UPDATE SET variants = EXCLUDED.variants;

INSERT INTO public.tag_normalization (canonical, variants)
VALUES ('인라이튼', ARRAY['엔라이튼']::text[])
ON CONFLICT (canonical) DO UPDATE SET variants = EXCLUDED.variants;

INSERT INTO public.tag_normalization (canonical, variants)
VALUES ('피코슈어', ARRAY['피코슈얼']::text[])
ON CONFLICT (canonical) DO UPDATE SET variants = EXCLUDED.variants;

INSERT INTO public.tag_normalization (canonical, variants)
VALUES ('젠틀맥스프로플러스', ARRAY['젠들맥스프로플러스']::text[])
ON CONFLICT (canonical) DO UPDATE SET variants = EXCLUDED.variants;

COMMIT;
