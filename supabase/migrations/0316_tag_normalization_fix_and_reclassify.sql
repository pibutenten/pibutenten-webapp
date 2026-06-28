-- 0316. tag_normalization 방향 정정 + 분류 1건 재배치
--
-- [목적] 직전 마이그 0312 가 tag_normalization 의 (canonical, variants) 두 컬럼을
--   거꾸로 적재한 결함을 정정합니다.
--
-- [0312 결함 설명]
--   소비 코드(src/lib/procedure-dict.ts::normalizeTag)와 빌드 스크립트
--   (scripts/gen-tag-dictionary.mjs: normalizations[r.canonical] = r.variants)의 규약은
--   canonical = '입력 키(오타)', variants = '정규화 출력(정상 시술명)' 입니다.
--   즉 오타 교정이 동작하려면 (canonical=<오타>, variants=[<정상 ko>]) 형태여야 합니다.
--   그러나 0312 는 (canonical=<정상 ko>, variants=[<오타>]) 로 반대로 넣었습니다.
--   그 결과 (1) 오타 입력이 교정되지 않고, (2) 정상명 입력이 도리어 자기 오타로
--   역오염되는 회귀가 발생했습니다. 라이브 실측 54개 행(63개 오타 항목)이 반전 상태였습니다.
--
-- [권위 데이터] 전달용/procedures_v6.json 의 각 항목 {ko, typos:[...]} 가
--   ko <-> 오타 의 단일 진실(SSOT)입니다. typos 가 비어있는 ko 는 정정 대상에서 제외합니다.
--
-- [안전 알고리즘]
--   (1) INSERT: 각 (ko, typo) 를 올바른 방향(canonical=오타, variants=[정상 ko])으로 재적재.
--       ON CONFLICT (canonical) DO UPDATE 로 멱등.
--   (2) DELETE: 0312 가 만든 역방향 행만 제거.
--       조건 = (canonical = 해당 ko) AND (variants 가 그 ko 의 JSON typos 의 부분집합).
--       ko 별로 정확히 매칭한 54개 행만 개별 삭제합니다. '시술 ko 인 행 전부 삭제' 가 아닙니다.
--       레거시 별칭병합(예: canonical='리쥬란HB', variants=['리쥬란'] — '리쥬란HB' 는
--       JSON ko 가 아니므로 정정 대상 아님)과 분할룰(예: 'HIFU부작용'->['HIFU','부작용'],
--       '30대리프팅'->['30대'], '티타늄리프팅'->['티타늄'])은 보존됩니다.
--   (3) UPDATE: tag_dictionary 의 '다한증보톡스' 분류를 '주름·윤곽' -> '기타' 로 재배치.
--       사용자 도메인 결정. is_procedure 는 true 로 유지. 다른 분류는 변경하지 않습니다.
--
-- [멱등성] INSERT 는 ON CONFLICT DO UPDATE, DELETE 는 정확한 (canonical, variants) 조건,
--   UPDATE 는 WHERE ko = ... 단일 행이라 재실행해도 안전합니다.

BEGIN;

-- ── (1) 올바른 방향 재적재: canonical=오타 -> variants=[정상 ko] (63건) ──

INSERT INTO public.tag_normalization (canonical, variants)
VALUES ('기미레이져', ARRAY['기미레이저']::text[])
ON CONFLICT (canonical) DO UPDATE SET variants = EXCLUDED.variants;

INSERT INTO public.tag_normalization (canonical, variants)
VALUES ('더불로', ARRAY['더블로']::text[])
ON CONFLICT (canonical) DO UPDATE SET variants = EXCLUDED.variants;

INSERT INTO public.tag_normalization (canonical, variants)
VALUES ('덴시티', ARRAY['덴서티']::text[])
ON CONFLICT (canonical) DO UPDATE SET variants = EXCLUDED.variants;

INSERT INTO public.tag_normalization (canonical, variants)
VALUES ('레디어스', ARRAY['래디어스']::text[])
ON CONFLICT (canonical) DO UPDATE SET variants = EXCLUDED.variants;

INSERT INTO public.tag_normalization (canonical, variants)
VALUES ('레스틸린', ARRAY['레스틸렌']::text[])
ON CONFLICT (canonical) DO UPDATE SET variants = EXCLUDED.variants;

INSERT INTO public.tag_normalization (canonical, variants)
VALUES ('레이져토닝', ARRAY['레이저토닝']::text[])
ON CONFLICT (canonical) DO UPDATE SET variants = EXCLUDED.variants;

INSERT INTO public.tag_normalization (canonical, variants)
VALUES ('리주란', ARRAY['리쥬란']::text[])
ON CONFLICT (canonical) DO UPDATE SET variants = EXCLUDED.variants;

INSERT INTO public.tag_normalization (canonical, variants)
VALUES ('리주란아이', ARRAY['리쥬란아이']::text[])
ON CONFLICT (canonical) DO UPDATE SET variants = EXCLUDED.variants;

INSERT INTO public.tag_normalization (canonical, variants)
VALUES ('리주란힐러', ARRAY['리쥬란힐러']::text[])
ON CONFLICT (canonical) DO UPDATE SET variants = EXCLUDED.variants;

INSERT INTO public.tag_normalization (canonical, variants)
VALUES ('리주란HB플러스', ARRAY['리쥬란HB플러스']::text[])
ON CONFLICT (canonical) DO UPDATE SET variants = EXCLUDED.variants;

INSERT INTO public.tag_normalization (canonical, variants)
VALUES ('리주란S', ARRAY['리쥬란S']::text[])
ON CONFLICT (canonical) DO UPDATE SET variants = EXCLUDED.variants;

INSERT INTO public.tag_normalization (canonical, variants)
VALUES ('리쥬란s', ARRAY['리쥬란S']::text[])
ON CONFLICT (canonical) DO UPDATE SET variants = EXCLUDED.variants;

INSERT INTO public.tag_normalization (canonical, variants)
VALUES ('메디톡스', ARRAY['메디톡신']::text[])
ON CONFLICT (canonical) DO UPDATE SET variants = EXCLUDED.variants;

INSERT INTO public.tag_normalization (canonical, variants)
VALUES ('보툴랙스', ARRAY['보툴렉스']::text[])
ON CONFLICT (canonical) DO UPDATE SET variants = EXCLUDED.variants;

INSERT INTO public.tag_normalization (canonical, variants)
VALUES ('볼뉴마', ARRAY['볼뉴머']::text[])
ON CONFLICT (canonical) DO UPDATE SET variants = EXCLUDED.variants;

INSERT INTO public.tag_normalization (canonical, variants)
VALUES ('서마지', ARRAY['써마지']::text[])
ON CONFLICT (canonical) DO UPDATE SET variants = EXCLUDED.variants;

INSERT INTO public.tag_normalization (canonical, variants)
VALUES ('서마지flx', ARRAY['써마지FLX']::text[])
ON CONFLICT (canonical) DO UPDATE SET variants = EXCLUDED.variants;

INSERT INTO public.tag_normalization (canonical, variants)
VALUES ('서마지FLX', ARRAY['써마지FLX']::text[])
ON CONFLICT (canonical) DO UPDATE SET variants = EXCLUDED.variants;

INSERT INTO public.tag_normalization (canonical, variants)
VALUES ('솝웨이브', ARRAY['소프웨이브']::text[])
ON CONFLICT (canonical) DO UPDATE SET variants = EXCLUDED.variants;

INSERT INTO public.tag_normalization (canonical, variants)
VALUES ('스카렛', ARRAY['스칼렛']::text[])
ON CONFLICT (canonical) DO UPDATE SET variants = EXCLUDED.variants;

INSERT INTO public.tag_normalization (canonical, variants)
VALUES ('스칼트라', ARRAY['스컬트라']::text[])
ON CONFLICT (canonical) DO UPDATE SET variants = EXCLUDED.variants;

INSERT INTO public.tag_normalization (canonical, variants)
VALUES ('스팩트라', ARRAY['스펙트라']::text[])
ON CONFLICT (canonical) DO UPDATE SET variants = EXCLUDED.variants;

INSERT INTO public.tag_normalization (canonical, variants)
VALUES ('시크렛', ARRAY['시크릿']::text[])
ON CONFLICT (canonical) DO UPDATE SET variants = EXCLUDED.variants;

INSERT INTO public.tag_normalization (canonical, variants)
VALUES ('실펌x', ARRAY['실펌X']::text[])
ON CONFLICT (canonical) DO UPDATE SET variants = EXCLUDED.variants;

INSERT INTO public.tag_normalization (canonical, variants)
VALUES ('써르프', ARRAY['세르프']::text[])
ON CONFLICT (canonical) DO UPDATE SET variants = EXCLUDED.variants;

INSERT INTO public.tag_normalization (canonical, variants)
VALUES ('써마지flx', ARRAY['써마지FLX']::text[])
ON CONFLICT (canonical) DO UPDATE SET variants = EXCLUDED.variants;

INSERT INTO public.tag_normalization (canonical, variants)
VALUES ('액셀V', ARRAY['엑셀V']::text[])
ON CONFLICT (canonical) DO UPDATE SET variants = EXCLUDED.variants;

INSERT INTO public.tag_normalization (canonical, variants)
VALUES ('앰스컬프트', ARRAY['엠스컬프트']::text[])
ON CONFLICT (canonical) DO UPDATE SET variants = EXCLUDED.variants;

INSERT INTO public.tag_normalization (canonical, variants)
VALUES ('앰페이스', ARRAY['엠페이스']::text[])
ON CONFLICT (canonical) DO UPDATE SET variants = EXCLUDED.variants;

INSERT INTO public.tag_normalization (canonical, variants)
VALUES ('엑셀v', ARRAY['엑셀V']::text[])
ON CONFLICT (canonical) DO UPDATE SET variants = EXCLUDED.variants;

INSERT INTO public.tag_normalization (canonical, variants)
VALUES ('엔라이튼', ARRAY['인라이튼']::text[])
ON CONFLICT (canonical) DO UPDATE SET variants = EXCLUDED.variants;

INSERT INTO public.tag_normalization (canonical, variants)
VALUES ('엘란세', ARRAY['엘란쎄']::text[])
ON CONFLICT (canonical) DO UPDATE SET variants = EXCLUDED.variants;

INSERT INTO public.tag_normalization (canonical, variants)
VALUES ('엘사', ARRAY['엘싸']::text[])
ON CONFLICT (canonical) DO UPDATE SET variants = EXCLUDED.variants;

INSERT INTO public.tag_normalization (canonical, variants)
VALUES ('엠스컬트', ARRAY['엠스컬프트']::text[])
ON CONFLICT (canonical) DO UPDATE SET variants = EXCLUDED.variants;

INSERT INTO public.tag_normalization (canonical, variants)
VALUES ('올리지오x', ARRAY['올리지오X']::text[])
ON CONFLICT (canonical) DO UPDATE SET variants = EXCLUDED.variants;

INSERT INTO public.tag_normalization (canonical, variants)
VALUES ('올리지요', ARRAY['올리지오']::text[])
ON CONFLICT (canonical) DO UPDATE SET variants = EXCLUDED.variants;

INSERT INTO public.tag_normalization (canonical, variants)
VALUES ('울세라', ARRAY['울쎄라']::text[])
ON CONFLICT (canonical) DO UPDATE SET variants = EXCLUDED.variants;

INSERT INTO public.tag_normalization (canonical, variants)
VALUES ('울세라프라임', ARRAY['울쎄라프라임']::text[])
ON CONFLICT (canonical) DO UPDATE SET variants = EXCLUDED.variants;

INSERT INTO public.tag_normalization (canonical, variants)
VALUES ('울쌔라', ARRAY['울쎄라']::text[])
ON CONFLICT (canonical) DO UPDATE SET variants = EXCLUDED.variants;

INSERT INTO public.tag_normalization (canonical, variants)
VALUES ('인모드fx', ARRAY['인모드FX']::text[])
ON CONFLICT (canonical) DO UPDATE SET variants = EXCLUDED.variants;

INSERT INTO public.tag_normalization (canonical, variants)
VALUES ('인모트', ARRAY['인모드']::text[])
ON CONFLICT (canonical) DO UPDATE SET variants = EXCLUDED.variants;

INSERT INTO public.tag_normalization (canonical, variants)
VALUES ('임모드', ARRAY['인모드']::text[])
ON CONFLICT (canonical) DO UPDATE SET variants = EXCLUDED.variants;

INSERT INTO public.tag_normalization (canonical, variants)
VALUES ('쟐루프로', ARRAY['잘루프로']::text[])
ON CONFLICT (canonical) DO UPDATE SET variants = EXCLUDED.variants;

INSERT INTO public.tag_normalization (canonical, variants)
VALUES ('제모레이져', ARRAY['제모레이저']::text[])
ON CONFLICT (canonical) DO UPDATE SET variants = EXCLUDED.variants;

INSERT INTO public.tag_normalization (canonical, variants)
VALUES ('젠들맥스', ARRAY['젠틀맥스']::text[])
ON CONFLICT (canonical) DO UPDATE SET variants = EXCLUDED.variants;

INSERT INTO public.tag_normalization (canonical, variants)
VALUES ('젠들맥스프로', ARRAY['젠틀맥스프로']::text[])
ON CONFLICT (canonical) DO UPDATE SET variants = EXCLUDED.variants;

INSERT INTO public.tag_normalization (canonical, variants)
VALUES ('젠들맥스프로플러스', ARRAY['젠틀맥스프로플러스']::text[])
ON CONFLICT (canonical) DO UPDATE SET variants = EXCLUDED.variants;

INSERT INTO public.tag_normalization (canonical, variants)
VALUES ('주베룩', ARRAY['쥬베룩']::text[])
ON CONFLICT (canonical) DO UPDATE SET variants = EXCLUDED.variants;

INSERT INTO public.tag_normalization (canonical, variants)
VALUES ('주베룩볼륨', ARRAY['쥬베룩볼륨']::text[])
ON CONFLICT (canonical) DO UPDATE SET variants = EXCLUDED.variants;

INSERT INTO public.tag_normalization (canonical, variants)
VALUES ('주비덤', ARRAY['쥬비덤']::text[])
ON CONFLICT (canonical) DO UPDATE SET variants = EXCLUDED.variants;

INSERT INTO public.tag_normalization (canonical, variants)
VALUES ('쥬베록', ARRAY['쥬베룩']::text[])
ON CONFLICT (canonical) DO UPDATE SET variants = EXCLUDED.variants;

INSERT INTO public.tag_normalization (canonical, variants)
VALUES ('쥬비덥', ARRAY['쥬비덤']::text[])
ON CONFLICT (canonical) DO UPDATE SET variants = EXCLUDED.variants;

INSERT INTO public.tag_normalization (canonical, variants)
VALUES ('쿨소니크', ARRAY['쿨소닉']::text[])
ON CONFLICT (canonical) DO UPDATE SET variants = EXCLUDED.variants;

INSERT INTO public.tag_normalization (canonical, variants)
VALUES ('쿨스컬핑', ARRAY['쿨스컬프팅']::text[])
ON CONFLICT (canonical) DO UPDATE SET variants = EXCLUDED.variants;

INSERT INTO public.tag_normalization (canonical, variants)
VALUES ('클래리티', ARRAY['클라리티']::text[])
ON CONFLICT (canonical) DO UPDATE SET variants = EXCLUDED.variants;

INSERT INTO public.tag_normalization (canonical, variants)
VALUES ('테오씨알', ARRAY['테오시알']::text[])
ON CONFLICT (canonical) DO UPDATE SET variants = EXCLUDED.variants;

INSERT INTO public.tag_normalization (canonical, variants)
VALUES ('텐서마', ARRAY['텐써마']::text[])
ON CONFLICT (canonical) DO UPDATE SET variants = EXCLUDED.variants;

INSERT INTO public.tag_normalization (canonical, variants)
VALUES ('텐세라', ARRAY['텐쎄라']::text[])
ON CONFLICT (canonical) DO UPDATE SET variants = EXCLUDED.variants;

INSERT INTO public.tag_normalization (canonical, variants)
VALUES ('튼살레이져', ARRAY['튼살레이저']::text[])
ON CONFLICT (canonical) DO UPDATE SET variants = EXCLUDED.variants;

INSERT INTO public.tag_normalization (canonical, variants)
VALUES ('포텐쟈', ARRAY['포텐자']::text[])
ON CONFLICT (canonical) DO UPDATE SET variants = EXCLUDED.variants;

INSERT INTO public.tag_normalization (canonical, variants)
VALUES ('프랙셀', ARRAY['프락셀']::text[])
ON CONFLICT (canonical) DO UPDATE SET variants = EXCLUDED.variants;

INSERT INTO public.tag_normalization (canonical, variants)
VALUES ('프로필로', ARRAY['프로파일로']::text[])
ON CONFLICT (canonical) DO UPDATE SET variants = EXCLUDED.variants;

INSERT INTO public.tag_normalization (canonical, variants)
VALUES ('피코슈얼', ARRAY['피코슈어']::text[])
ON CONFLICT (canonical) DO UPDATE SET variants = EXCLUDED.variants;

-- ── (2) 0312 가 만든 역방향 행만 삭제 (54건) ──
--   각 DELETE 는 canonical 과 variants 를 정확히 지정하여, 매칭되는 단일 역방향 행만 제거합니다.

DELETE FROM public.tag_normalization
 WHERE canonical = '기미레이저' AND variants = ARRAY['기미레이져']::text[];
DELETE FROM public.tag_normalization
 WHERE canonical = '더블로' AND variants = ARRAY['더불로']::text[];
DELETE FROM public.tag_normalization
 WHERE canonical = '덴서티' AND variants = ARRAY['덴시티']::text[];
DELETE FROM public.tag_normalization
 WHERE canonical = '래디어스' AND variants = ARRAY['레디어스']::text[];
DELETE FROM public.tag_normalization
 WHERE canonical = '레스틸렌' AND variants = ARRAY['레스틸린']::text[];
DELETE FROM public.tag_normalization
 WHERE canonical = '레이저토닝' AND variants = ARRAY['레이져토닝']::text[];
DELETE FROM public.tag_normalization
 WHERE canonical = '리쥬란' AND variants = ARRAY['리주란']::text[];
DELETE FROM public.tag_normalization
 WHERE canonical = '리쥬란아이' AND variants = ARRAY['리주란아이']::text[];
DELETE FROM public.tag_normalization
 WHERE canonical = '리쥬란힐러' AND variants = ARRAY['리주란힐러']::text[];
DELETE FROM public.tag_normalization
 WHERE canonical = '리쥬란HB플러스' AND variants = ARRAY['리주란HB플러스']::text[];
DELETE FROM public.tag_normalization
 WHERE canonical = '리쥬란S' AND variants = ARRAY['리주란S','리쥬란s']::text[];
DELETE FROM public.tag_normalization
 WHERE canonical = '메디톡신' AND variants = ARRAY['메디톡스']::text[];
DELETE FROM public.tag_normalization
 WHERE canonical = '보툴렉스' AND variants = ARRAY['보툴랙스']::text[];
DELETE FROM public.tag_normalization
 WHERE canonical = '볼뉴머' AND variants = ARRAY['볼뉴마']::text[];
DELETE FROM public.tag_normalization
 WHERE canonical = '세르프' AND variants = ARRAY['써르프']::text[];
DELETE FROM public.tag_normalization
 WHERE canonical = '소프웨이브' AND variants = ARRAY['솝웨이브']::text[];
DELETE FROM public.tag_normalization
 WHERE canonical = '스칼렛' AND variants = ARRAY['스카렛']::text[];
DELETE FROM public.tag_normalization
 WHERE canonical = '스컬트라' AND variants = ARRAY['스칼트라']::text[];
DELETE FROM public.tag_normalization
 WHERE canonical = '스펙트라' AND variants = ARRAY['스팩트라']::text[];
DELETE FROM public.tag_normalization
 WHERE canonical = '시크릿' AND variants = ARRAY['시크렛']::text[];
DELETE FROM public.tag_normalization
 WHERE canonical = '실펌X' AND variants = ARRAY['실펌x']::text[];
DELETE FROM public.tag_normalization
 WHERE canonical = '써마지' AND variants = ARRAY['서마지']::text[];
DELETE FROM public.tag_normalization
 WHERE canonical = '써마지FLX' AND variants = ARRAY['서마지FLX','서마지flx','써마지flx']::text[];
DELETE FROM public.tag_normalization
 WHERE canonical = '엑셀V' AND variants = ARRAY['액셀V','엑셀v']::text[];
DELETE FROM public.tag_normalization
 WHERE canonical = '엘란쎄' AND variants = ARRAY['엘란세']::text[];
DELETE FROM public.tag_normalization
 WHERE canonical = '엘싸' AND variants = ARRAY['엘사']::text[];
DELETE FROM public.tag_normalization
 WHERE canonical = '엠스컬프트' AND variants = ARRAY['앰스컬프트','엠스컬트']::text[];
DELETE FROM public.tag_normalization
 WHERE canonical = '엠페이스' AND variants = ARRAY['앰페이스']::text[];
DELETE FROM public.tag_normalization
 WHERE canonical = '올리지오' AND variants = ARRAY['올리지요']::text[];
DELETE FROM public.tag_normalization
 WHERE canonical = '올리지오X' AND variants = ARRAY['올리지오x']::text[];
DELETE FROM public.tag_normalization
 WHERE canonical = '울쎄라' AND variants = ARRAY['울세라','울쌔라']::text[];
DELETE FROM public.tag_normalization
 WHERE canonical = '울쎄라프라임' AND variants = ARRAY['울세라프라임']::text[];
DELETE FROM public.tag_normalization
 WHERE canonical = '인라이튼' AND variants = ARRAY['엔라이튼']::text[];
DELETE FROM public.tag_normalization
 WHERE canonical = '인모드' AND variants = ARRAY['인모트','임모드']::text[];
DELETE FROM public.tag_normalization
 WHERE canonical = '인모드FX' AND variants = ARRAY['인모드fx']::text[];
DELETE FROM public.tag_normalization
 WHERE canonical = '잘루프로' AND variants = ARRAY['쟐루프로']::text[];
DELETE FROM public.tag_normalization
 WHERE canonical = '제모레이저' AND variants = ARRAY['제모레이져']::text[];
DELETE FROM public.tag_normalization
 WHERE canonical = '젠틀맥스' AND variants = ARRAY['젠들맥스']::text[];
DELETE FROM public.tag_normalization
 WHERE canonical = '젠틀맥스프로' AND variants = ARRAY['젠들맥스프로']::text[];
DELETE FROM public.tag_normalization
 WHERE canonical = '젠틀맥스프로플러스' AND variants = ARRAY['젠들맥스프로플러스']::text[];
DELETE FROM public.tag_normalization
 WHERE canonical = '쥬베룩' AND variants = ARRAY['주베룩','쥬베록']::text[];
DELETE FROM public.tag_normalization
 WHERE canonical = '쥬베룩볼륨' AND variants = ARRAY['주베룩볼륨']::text[];
DELETE FROM public.tag_normalization
 WHERE canonical = '쥬비덤' AND variants = ARRAY['주비덤','쥬비덥']::text[];
DELETE FROM public.tag_normalization
 WHERE canonical = '쿨소닉' AND variants = ARRAY['쿨소니크']::text[];
DELETE FROM public.tag_normalization
 WHERE canonical = '쿨스컬프팅' AND variants = ARRAY['쿨스컬핑']::text[];
DELETE FROM public.tag_normalization
 WHERE canonical = '클라리티' AND variants = ARRAY['클래리티']::text[];
DELETE FROM public.tag_normalization
 WHERE canonical = '테오시알' AND variants = ARRAY['테오씨알']::text[];
DELETE FROM public.tag_normalization
 WHERE canonical = '텐써마' AND variants = ARRAY['텐서마']::text[];
DELETE FROM public.tag_normalization
 WHERE canonical = '텐쎄라' AND variants = ARRAY['텐세라']::text[];
DELETE FROM public.tag_normalization
 WHERE canonical = '튼살레이저' AND variants = ARRAY['튼살레이져']::text[];
DELETE FROM public.tag_normalization
 WHERE canonical = '포텐자' AND variants = ARRAY['포텐쟈']::text[];
DELETE FROM public.tag_normalization
 WHERE canonical = '프락셀' AND variants = ARRAY['프랙셀']::text[];
DELETE FROM public.tag_normalization
 WHERE canonical = '프로파일로' AND variants = ARRAY['프로필로']::text[];
DELETE FROM public.tag_normalization
 WHERE canonical = '피코슈어' AND variants = ARRAY['피코슈얼']::text[];

-- ── (3) 분류 재배치 1건: 다한증보톡스 (주름·윤곽 -> 기타) ──
UPDATE public.tag_dictionary
   SET category = '기타', updated_at = now()
 WHERE ko = '다한증보톡스' AND category <> '기타';

COMMIT;
