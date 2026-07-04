-- 0329: 시술 리포트 앵커 데이터 정정 3건 (원장 승인 2026-07-04)
--
-- 배경 (production 실측 2026-07-04, 읽기 전용 SELECT):
--   [정정3] tag_dictionary 에 en='density-alpha-tip' 행 부재 — 앵커 2925(post_slug='density-alpha-tip')가
--           사전 미매칭. 0317/0318 에서 '덴서티알파팁' 사전행 삭제 + 후기 전건 '덴서티' 재연결
--           (procedure_reviews 에 '덴서티알파팁' 행 0건, '덴서티' 13건 — 실측). 원장 확정으로 사전 재등록.
--           ko 근거(실측): 앵커 2925 keywords[0]='덴서티알파팁'(붙여쓰기) + 구 procedure_taxonomy(0199)·
--           구 tag_dictionary(0247) 의 ko='덴서티알파팁'. category 는 부모 '덴서티'(실측 '리프팅') 상속,
--           부모 부재 시 '기타' fallback (임의 추정 금지 원칙).
--   [정정1] cards(type=review_summary) 9건 title 이 '???? ??? | {시술명}' — 브랜드부 '피부텐텐 리포트'가
--           CP949 콘솔 경유 적용 때 '?' 리터럴로 오염(시술명부는 정상). 0219 템플릿
--           ('피부텐텐 리포트 | ' || tag_dictionary.ko) 재적용. 대상 9건 중 8건은 사전 매칭 확인,
--           2925 는 [정정3] INSERT 선행으로 매칭됨 → 본 파일에서 사전 INSERT 를 제목 UPDATE 보다 앞에 배치.
--   [정정2] 앵커 2525 post_slug 'rejuran-eye'(구 procedure_taxonomy 0199 시절 슬러그) →
--           'rejuran-i'(tag_dictionary.en SSOT, 0312/0318). 실측: rejuran-i 앵커 부재(부분 유니크
--           cards(post_slug) WHERE type='review_summary' 충돌 없음), 2525 title 은 이미
--           '피부텐텐 리포트 | 리쥬란아이'(정상 — 오염 9건에 미포함) → 제목은 안전망 조건부 재적용만.
--
-- 멱등 설계: INSERT 는 ON CONFLICT (ko) DO NOTHING, UPDATE 는 id + 현재값(오염 패턴/구 슬러그) 이중
--   조건으로 재실행 시 0행 갱신. 부분 유니크 충돌은 NOT EXISTS 가드로 차단.
--
-- ⚠ 적용 경로 (루트 CLAUDE.md §8): 비-ASCII(한국어) 포함 — 반드시 UTF-8 파일 그대로 전송하는 경로
--   (node scratchpad/db.mjs supabase/migrations/0329_report_anchor_data_fixes.sql)로 적용할 것.
--   Windows curl/PowerShell 콘솔(CP949) 직접 적용 금지 — 이 오염(정정1)의 원인 경로.
--
-- 참고: tag_normalization 의 canonical='덴서티알파팁' → variants=['덴서티'] (0317/0318) 는 본 마이그가
--   건드리지 않음(별도 안건) — 신규 태그 입력 '덴서티알파팁'은 여전히 '덴서티'로 정규화됨.
--   빌드 스크립트 gen-tag-dictionary.mjs 는 빌드 시 tag_dictionary 를 REST 전수 조회하므로 코드 수정 불필요.
-- ★롤백: [정정3] DELETE FROM tag_dictionary WHERE ko='덴서티알파팁';
--        [정정2] cards 2525 post_slug 를 'rejuran-eye' 로 되돌림.
--        [정정1] 은 오염 상태 복원이 무의미하므로 롤백 불필요(데이터만 영향).

BEGIN;

-- ── (1) [정정3] tag_dictionary 덴서티알파팁 등록 — 제목 UPDATE(3) 보다 선행 필수 ──
--   category/parent_ko/maker 는 부모 '덴서티' 행에서 상속(실측: 리프팅 / 제이시스메디칼·Jeisys —
--   동일 장비의 팁 옵션). 부모 부재 시 category='기타', parent_ko=NULL.
--   aliases/pubmed_keywords 는 구 0247 행 관례(NULL) 유지 — 실측 근거 없는 값 창작 금지.
INSERT INTO public.tag_dictionary (ko, category, en, parent_ko, is_procedure, aliases, pubmed_keywords, maker)
SELECT '덴서티알파팁',
       COALESCE(p.category, '기타'),
       'density-alpha-tip',
       p.ko,
       true,
       NULL,
       NULL,
       p.maker
FROM (VALUES (1)) AS one(x)
LEFT JOIN public.tag_dictionary p ON p.ko = '덴서티'
ON CONFLICT (ko) DO NOTHING;

-- ── (2) [정정2] 앵커 2525 post_slug 정합화: rejuran-eye → rejuran-i ──
--   부분 유니크 인덱스 cards(post_slug) WHERE type='review_summary' 충돌 가드(NOT EXISTS) 포함.
UPDATE public.cards c
SET post_slug = 'rejuran-i',
    updated_at = now()
WHERE c.id = 2525
  AND c.type = 'review_summary'::qa_type
  AND c.post_slug = 'rejuran-eye'
  AND NOT EXISTS (
    SELECT 1 FROM public.cards d
    WHERE d.type = 'review_summary'::qa_type
      AND d.post_slug = 'rejuran-i'
      AND d.id <> c.id
  );

-- (2b) 2525 title 안전망 — 사전 ko 템플릿과 어긋날 때만 재적용.
--   실측상 이미 '피부텐텐 리포트 | 리쥬란아이'(사전 ko 와 일치) → 정상 적용 시 0행(no-op).
UPDATE public.cards c
SET title = '피부텐텐 리포트 | ' || td.ko,
    updated_at = now()
FROM public.tag_dictionary td
WHERE c.id = 2525
  AND c.type = 'review_summary'::qa_type
  AND td.en = c.post_slug
  AND c.title IS DISTINCT FROM ('피부텐텐 리포트 | ' || td.ko);

-- ── (3) [정정1] 앵커 9건 제목 오염 재적용 (0219 템플릿) ──
--   대상: id IN (9건) + title LIKE '%?%' 이중 조건(멱등 — 재실행 시 0행).
--   LIKE 의 '?' 는 와일드카드가 아닌 리터럴(오염 문자가 실제 U+003F '?').
--   조인: tag_dictionary.en = post_slug. 실측상 9개 슬러그 모두 사전 단일 매칭
--   (en 중복 행 laser-toning/masseter-botox 는 대상 슬러그에 없음 — 다중 매칭 비결정성 없음).
--   2925 는 위 (1) INSERT 로 매칭됨.
UPDATE public.cards c
SET title = '피부텐텐 리포트 | ' || td.ko,
    updated_at = now()
FROM public.tag_dictionary td
WHERE c.type = 'review_summary'::qa_type
  AND c.id IN (2925, 2689, 2959, 3786, 2966, 3810, 2970, 3046, 3056)
  AND c.title LIKE '%?%'
  AND td.en = c.post_slug;

COMMIT;

-- ── 적용 후 검증 SQL (읽기 전용 — 주석 해제 후 실행) ─────────────────────────────
-- V1. 제목 오염 잔존 0건 확인 (적용 전 실측 9건 → 기대 0건)
--   SELECT count(*) FROM public.cards
--   WHERE type = 'review_summary'::qa_type AND title LIKE '%?%';
--
-- V2. 리쥬란아이 앵커 슬러그·사전 매칭 (기대: id=2525 / post_slug='rejuran-i' / ko='리쥬란아이')
--   SELECT c.id, c.post_slug, c.title, td.ko
--   FROM public.cards c JOIN public.tag_dictionary td ON td.en = c.post_slug
--   WHERE c.id = 2525;
--
-- V3. 앵커-사전 매칭 전수 (적용 전 실측: 총 65앵커 / 매칭 63 → 기대: 65 / 65.
--     ※ 지시서의 '61→63' 은 추정치 — production 전수 실측은 63→65)
--   SELECT
--     (SELECT count(*) FROM public.cards WHERE type = 'review_summary'::qa_type) AS total_anchors,
--     (SELECT count(DISTINCT c.id) FROM public.cards c
--        JOIN public.tag_dictionary td ON td.en = c.post_slug
--       WHERE c.type = 'review_summary'::qa_type) AS matched_anchors;
--
-- V4. 사전 신규행 확인 (기대: 덴서티알파팁 / density-alpha-tip / 리프팅 / 덴서티 / true)
--   SELECT ko, en, category, parent_ko, is_procedure, maker
--   FROM public.tag_dictionary WHERE ko = '덴서티알파팁';
--
-- V5. U+FFFD·'?' 오염 재스캔 (CLAUDE.md §8 재발 방지 — 기대 0건)
--   SELECT count(*) FROM public.cards
--   WHERE type = 'review_summary'::qa_type
--     AND (position(chr(65533) in title) > 0 OR title LIKE '%?%');
