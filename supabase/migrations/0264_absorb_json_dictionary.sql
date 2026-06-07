-- 0264. procedure-mappings.json → tag_dictionary 통합 1단계 (L2-1, additive·무손실)
--
-- 흡수 대상(정합 충돌 0, L-Phase1 조사):
--   synonyms 15 → tag_dictionary.aliases text[]
--   pubmedKeywords 51 → tag_dictionary.pubmed_keywords text[]
--   blacklist 5 → tag_blacklist(word)
--   normalizations 100 → tag_normalization(canonical, variants)
-- RLS: 공개 참조 데이터(PII 없음) → anon/authenticated SELECT, admin write. service_role CRUD(0252 교훈).
-- 빌드타임 스냅샷(gen-tag-dictionary.mjs)이 anon REST 로 읽으므로 anon SELECT 필수.

ALTER TABLE public.tag_dictionary ADD COLUMN IF NOT EXISTS aliases text[];
ALTER TABLE public.tag_dictionary ADD COLUMN IF NOT EXISTS pubmed_keywords text[];

CREATE TABLE IF NOT EXISTS public.tag_blacklist (
  word text PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.tag_blacklist ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tag_blacklist public read" ON public.tag_blacklist;
CREATE POLICY "tag_blacklist public read" ON public.tag_blacklist FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "tag_blacklist admin write" ON public.tag_blacklist;
CREATE POLICY "tag_blacklist admin write" ON public.tag_blacklist FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tag_blacklist TO service_role;
GRANT SELECT ON public.tag_blacklist TO anon, authenticated;

CREATE TABLE IF NOT EXISTS public.tag_normalization (
  canonical text PRIMARY KEY,
  variants text[] NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.tag_normalization ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tag_normalization public read" ON public.tag_normalization;
CREATE POLICY "tag_normalization public read" ON public.tag_normalization FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "tag_normalization admin write" ON public.tag_normalization;
CREATE POLICY "tag_normalization admin write" ON public.tag_normalization FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tag_normalization TO service_role;
GRANT SELECT ON public.tag_normalization TO anon, authenticated;

-- ── 데이터 이관 (JSON → DB) ──
-- synonyms → tag_dictionary.aliases (15)
UPDATE public.tag_dictionary SET aliases=ARRAY['RF']::text[] WHERE ko='고주파';
UPDATE public.tag_dictionary SET aliases=ARRAY['레이저토닝']::text[] WHERE ko='토닝레이저';
UPDATE public.tag_dictionary SET aliases=ARRAY['보툴리늄']::text[] WHERE ko='보툴리눔';
UPDATE public.tag_dictionary SET aliases=ARRAY['엘라비에리투오']::text[] WHERE ko='리투오';
UPDATE public.tag_dictionary SET aliases=ARRAY['민감피부','예민피부','민감성','민감']::text[] WHERE ko='민감성피부';
UPDATE public.tag_dictionary SET aliases=ARRAY['장벽손상']::text[] WHERE ko='피부장벽손상';
UPDATE public.tag_dictionary SET aliases=ARRAY['겨땀']::text[] WHERE ko='겨드랑이땀';
UPDATE public.tag_dictionary SET aliases=ARRAY['안티에이징']::text[] WHERE ko='항노화';
UPDATE public.tag_dictionary SET aliases=ARRAY['선크림']::text[] WHERE ko='자외선차단제';
UPDATE public.tag_dictionary SET aliases=ARRAY['요소크림']::text[] WHERE ko='유리아';
UPDATE public.tag_dictionary SET aliases=ARRAY['마리오네트','마리오네트주름']::text[] WHERE ko='마리오네트라인';
UPDATE public.tag_dictionary SET aliases=ARRAY['시술후케어','시술후']::text[] WHERE ko='시술후관리';
UPDATE public.tag_dictionary SET aliases=ARRAY['대변이식술']::text[] WHERE ko='FMT';
UPDATE public.tag_dictionary SET aliases=ARRAY['단순포진']::text[] WHERE ko='헤르페스';
UPDATE public.tag_dictionary SET aliases=ARRAY['브이라인']::text[] WHERE ko='V라인';
-- pubmedKeywords → tag_dictionary.pubmed_keywords (51)
UPDATE public.tag_dictionary SET pubmed_keywords=ARRAY['high-intensity focused ultrasound HIFU']::text[] WHERE ko='HIFU';
UPDATE public.tag_dictionary SET pubmed_keywords=ARRAY['high-intensity focused ultrasound HIFU','Ulthera']::text[] WHERE ko='울쎄라';
UPDATE public.tag_dictionary SET pubmed_keywords=ARRAY['monopolar radiofrequency face','Thermage']::text[] WHERE ko='써마지';
UPDATE public.tag_dictionary SET pubmed_keywords=ARRAY['bipolar radiofrequency face tightening']::text[] WHERE ko='올타이트';
UPDATE public.tag_dictionary SET pubmed_keywords=ARRAY['bipolar RF microneedling lifting']::text[] WHERE ko='티타늄';
UPDATE public.tag_dictionary SET pubmed_keywords=ARRAY['superficial musculoaponeurotic system']::text[] WHERE ko='SMAS';
UPDATE public.tag_dictionary SET pubmed_keywords=ARRAY['picosecond laser pigmentation']::text[] WHERE ko='피코토닝';
UPDATE public.tag_dictionary SET pubmed_keywords=ARRAY['botulinum toxin A facial']::text[] WHERE ko='보톡스';
UPDATE public.tag_dictionary SET pubmed_keywords=ARRAY['hyaluronic acid dermal filler','HA filler']::text[] WHERE ko='필러';
UPDATE public.tag_dictionary SET pubmed_keywords=ARRAY['skin booster','biorevitalization']::text[] WHERE ko='스킨부스터';
UPDATE public.tag_dictionary SET pubmed_keywords=ARRAY['collagen biostimulator','injectable biostimulator']::text[] WHERE ko='콜라겐부스터';
UPDATE public.tag_dictionary SET pubmed_keywords=ARRAY['PDLLA injectable biostimulator']::text[] WHERE ko='쥬베룩';
UPDATE public.tag_dictionary SET pubmed_keywords=ARRAY['carboxytherapy hyaluronic acid','CO2 therapy facial']::text[] WHERE ko='쥬브젠';
UPDATE public.tag_dictionary SET pubmed_keywords=ARRAY['poly-L-lactic acid PLLA facial','Sculptra']::text[] WHERE ko='스컬트라';
UPDATE public.tag_dictionary SET pubmed_keywords=ARRAY['polynucleotide PN skin','PDRN dermal']::text[] WHERE ko='리쥬란';
UPDATE public.tag_dictionary SET pubmed_keywords=ARRAY['hyaluronic acid skin booster','non-crosslinked HA microinjection']::text[] WHERE ko='힐로웨이브';
UPDATE public.tag_dictionary SET pubmed_keywords=ARRAY['calcium hydroxylapatite CaHA filler','Radiesse']::text[] WHERE ko='레디어스';
UPDATE public.tag_dictionary SET pubmed_keywords=ARRAY['injectable hyaluronic acid microinjection skin hydration']::text[] WHERE ko='물광주사';
UPDATE public.tag_dictionary SET pubmed_keywords=ARRAY['polycaprolactone PCL filler']::text[] WHERE ko='올리디아';
UPDATE public.tag_dictionary SET pubmed_keywords=ARRAY['acne scar']::text[] WHERE ko='여드름흉터';
UPDATE public.tag_dictionary SET pubmed_keywords=ARRAY['enlarged facial pores']::text[] WHERE ko='모공';
UPDATE public.tag_dictionary SET pubmed_keywords=ARRAY['facial erythema','rosacea']::text[] WHERE ko='홍조';
UPDATE public.tag_dictionary SET pubmed_keywords=ARRAY['hyperpigmentation','melasma']::text[] WHERE ko='기미';
UPDATE public.tag_dictionary SET pubmed_keywords=ARRAY['tear trough','infraorbital hollow','periorbital dark circles']::text[] WHERE ko='다크서클';
UPDATE public.tag_dictionary SET pubmed_keywords=ARRAY['tear trough','infraorbital hollow']::text[] WHERE ko='눈밑꺼짐';
UPDATE public.tag_dictionary SET pubmed_keywords=ARRAY['periorbital wrinkles','crow''s feet']::text[] WHERE ko='눈가주름';
UPDATE public.tag_dictionary SET pubmed_keywords=ARRAY['glabellar lines']::text[] WHERE ko='미간주름';
UPDATE public.tag_dictionary SET pubmed_keywords=ARRAY['forehead wrinkles']::text[] WHERE ko='이마주름';
UPDATE public.tag_dictionary SET pubmed_keywords=ARRAY['nasolabial fold']::text[] WHERE ko='팔자주름';
UPDATE public.tag_dictionary SET pubmed_keywords=ARRAY['neck wrinkles','platysmal bands']::text[] WHERE ko='목주름';
UPDATE public.tag_dictionary SET pubmed_keywords=ARRAY['skin elasticity','skin firmness']::text[] WHERE ko='탄력';
UPDATE public.tag_dictionary SET pubmed_keywords=ARRAY['midface volume loss']::text[] WHERE ko='볼꺼짐';
UPDATE public.tag_dictionary SET pubmed_keywords=ARRAY['nodule','granuloma']::text[] WHERE ko='결절';
UPDATE public.tag_dictionary SET pubmed_keywords=ARRAY['collagen production','neocollagenesis']::text[] WHERE ko='콜라겐';
UPDATE public.tag_dictionary SET pubmed_keywords=ARRAY['duration of effect','longevity']::text[] WHERE ko='지속기간';
UPDATE public.tag_dictionary SET pubmed_keywords=ARRAY['downtime','recovery']::text[] WHERE ko='다운타임';
UPDATE public.tag_dictionary SET pubmed_keywords=ARRAY['adverse effects','complications']::text[] WHERE ko='부작용';
UPDATE public.tag_dictionary SET pubmed_keywords=ARRAY['safety profile']::text[] WHERE ko='안전성';
UPDATE public.tag_dictionary SET pubmed_keywords=ARRAY['pain perception','discomfort']::text[] WHERE ko='통증';
UPDATE public.tag_dictionary SET pubmed_keywords=ARRAY['low-fluence Q-switched laser melasma']::text[] WHERE ko='레이저토닝';
UPDATE public.tag_dictionary SET pubmed_keywords=ARRAY['microwave thermal facial lifting']::text[] WHERE ko='온다';
UPDATE public.tag_dictionary SET pubmed_keywords=ARRAY['bipolar radiofrequency face contouring']::text[] WHERE ko='인모드';
UPDATE public.tag_dictionary SET pubmed_keywords=ARRAY['fractional laser skin resurfacing']::text[] WHERE ko='프락셀';
UPDATE public.tag_dictionary SET pubmed_keywords=ARRAY['perioral']::text[] WHERE ko='입가';
UPDATE public.tag_dictionary SET pubmed_keywords=ARRAY['jawline contour']::text[] WHERE ko='턱선';
UPDATE public.tag_dictionary SET pubmed_keywords=ARRAY['bruising','ecchymosis']::text[] WHERE ko='멍';
UPDATE public.tag_dictionary SET pubmed_keywords=ARRAY['crosslinking agent']::text[] WHERE ko='가교제';
UPDATE public.tag_dictionary SET pubmed_keywords=ARRAY['molecular weight']::text[] WHERE ko='분자량';
UPDATE public.tag_dictionary SET pubmed_keywords=ARRAY['fibroblast']::text[] WHERE ko='섬유아세포';
UPDATE public.tag_dictionary SET pubmed_keywords=ARRAY['marionette lines','perioral wrinkles']::text[] WHERE ko='마리오네트라인';
UPDATE public.tag_dictionary SET pubmed_keywords=ARRAY['post-procedure care','post-treatment care']::text[] WHERE ko='시술후관리';
-- blacklist → tag_blacklist (5)
INSERT INTO public.tag_blacklist(word) VALUES ('적절한강도'),('초보주의'),('보조수단'),('예방시술'),('피부예방') ON CONFLICT (word) DO NOTHING;
-- normalizations → tag_normalization (100)
INSERT INTO public.tag_normalization(canonical,variants) VALUES ('3040',ARRAY['30대','40대']::text[]),('효과지속',ARRAY['지속기간']::text[]),('5060대',ARRAY['50대','60대']::text[]),('3040대',ARRAY['30대','40대']::text[]),('스마스',ARRAY['SMAS']::text[]),('볼륨선택',ARRAY['볼륨']::text[]),('필러비교',ARRAY['필러']::text[]),('스컬트라결절',ARRAY['스컬트라','결절']::text[]),('스파출라마사지',ARRAY['마사지']::text[]),('선크림필수',ARRAY['선크림']::text[]),('스킨케어기본',ARRAY['스킨케어루틴']::text[]),('30대스킨케어',ARRAY['30대','스킨케어']::text[]),('약알칼리성클렌저',ARRAY['약알칼리성','클렌저']::text[]),('가벼운보습',ARRAY['보습']::text[]),('스킨케어단계',ARRAY['스킨케어']::text[]),('하이푸화상',ARRAY['HIFU','화상']::text[]),('하이푸',ARRAY['HIFU']::text[]),('결절안전',ARRAY['결절']::text[]),('자연스러운시술',ARRAY[]::text[]),('고분자저분자',ARRAY['고분자','저분자']::text[]),('고압산소치료',ARRAY['고압산소']::text[]),('리프팅통증',ARRAY['리프팅','통증']::text[]),('볼꺼짐방지',ARRAY['볼꺼짐']::text[]),('자외선차단핸드크림',ARRAY['자외선차단','핸드크림']::text[]),('민감성핸드크림',ARRAY['민감성피부','핸드크림']::text[]),('경락통증',ARRAY['경락','통증']::text[]),('경락효과',ARRAY['경락']::text[]),('예민피부주의',ARRAY['민감성피부']::text[]),('예민피부',ARRAY['민감성피부']::text[]),('콜라겐엘라스틴',ARRAY['콜라겐','엘라스틴']::text[]),('진피재건',ARRAY['진피']::text[]),('콜라겐자극',ARRAY['콜라겐']::text[]),('희석프로토콜',ARRAY['희석','프로토콜']::text[]),('보톡스효과',ARRAY['보톡스','효과']::text[]),('쥬베룩볼륨',ARRAY['쥬베룩','볼륨']::text[]),('리쥬란HB',ARRAY['리쥬란']::text[]),('리쥬란아이',ARRAY['리쥬란','눈가']::text[]),('쥬브젠적응증',ARRAY['쥬브젠','적응증']::text[]),('쥬브젠다운타임',ARRAY['쥬브젠','다운타임']::text[]),('패키지경계',ARRAY[]::text[]),('필러지속기간',ARRAY['필러','지속기간']::text[]),('필러대체불가',ARRAY[]::text[]),('압출스케일링',ARRAY['압출','스케일링']::text[]),('노화처짐',ARRAY['노화','처짐']::text[]),('마리오네트예방',ARRAY['마리오네트라인']::text[]),('건성모공',ARRAY['건성','모공']::text[]),('원인별치료',ARRAY[]::text[]),('마리오네트',ARRAY['마리오네트라인']::text[]),('마리오네트레디어스',ARRAY['마리오네트라인','레디어스']::text[]),('마리오네트치료',ARRAY['마리오네트라인']::text[]),('보톡스비교',ARRAY['보톡스']::text[]),('재시술시점',ARRAY['재시술']::text[]),('HIFU부작용',ARRAY['HIFU','부작용']::text[]),('하이푸부작용',ARRAY['HIFU','부작용']::text[]),('보톡스부작용',ARRAY['보톡스','부작용']::text[]),('보톡스기전',ARRAY['보톡스','기전']::text[]),('보톡스가격',ARRAY['보톡스','비용']::text[]),('보톡스비용',ARRAY['보톡스','비용']::text[]),('보톡스내성',ARRAY['보톡스','내성']::text[]),('보톡스안전성',ARRAY['보톡스','안전성']::text[]),('보톡스원리',ARRAY['보톡스','기전']::text[]),('보톡스지속',ARRAY['보톡스','지속기간']::text[]),('보톡스지속기간',ARRAY['보톡스','지속기간']::text[]),('보톡스주기',ARRAY['보톡스','재시술']::text[]),('보톡스주의사항',ARRAY['보톡스','주의사항']::text[]),('보톡스선택',ARRAY['보톡스']::text[]),('보톡스부위',ARRAY['보톡스']::text[]),('보톡스차이',ARRAY['보톡스']::text[]),('보톡스마취',ARRAY['보톡스','마취']::text[]),('보톡스부작용해결',ARRAY['보톡스','부작용']::text[]),('보톡스시기',ARRAY['보톡스']::text[]),('보톡스병합',ARRAY['보톡스']::text[]),('보톡스용량조절',ARRAY['보톡스','용량']::text[]),('보톡스중단',ARRAY['보톡스']::text[]),('보톡스어원',ARRAY['보톡스']::text[]),('보톡스예방효과',ARRAY['보톡스','예방']::text[]),('보톡스꿀자리',ARRAY['보톡스']::text[]),('보톡스얼굴축소',ARRAY['보톡스']::text[]),('보톡스윤곽',ARRAY['보톡스']::text[]),('리프팅시술',ARRAY['리프팅']::text[]),('리프팅시작시기',ARRAY['리프팅']::text[]),('리프팅효과개선',ARRAY['리프팅']::text[]),('30대리프팅',ARRAY['30대']::text[]),('콜라겐노화',ARRAY['콜라겐','노화']::text[]),('노화콜라겐',ARRAY['노화','콜라겐']::text[]),('섬유모세포자극',ARRAY['섬유모세포']::text[]),('써마지비교',ARRAY['써마지']::text[]),('스킨부스터병행',ARRAY['스킨부스터']::text[]),('마리오네트주름',ARRAY['마리오네트라인']::text[]),('티타늄리프팅',ARRAY['티타늄']::text[]),('티타늄시술',ARRAY['티타늄']::text[]),('실',ARRAY['실리프팅']::text[]),('쥬베룩리프팅',ARRAY['쥬베룩']::text[]),('스킨바이브주입',ARRAY['스킨바이브']::text[]),('주사형',ARRAY['주사']::text[]),('주사시술',ARRAY['주사']::text[]),('PDRN주사',ARRAY['PDRN']::text[]),('앨러간',ARRAY['엘러간']::text[]),('미세바늘고주파',ARRAY['바늘고주파']::text[]),('바늘RF',ARRAY['바늘고주파']::text[]) ON CONFLICT (canonical) DO UPDATE SET variants=EXCLUDED.variants;