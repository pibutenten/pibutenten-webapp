-- =============================================================================
-- 0338: tag_normalization 역방향 8행 정정 (지시 7행 + 가드 추가 적발 1행)
-- =============================================================================
-- 방향 규약 (CLAUDE.md §5):
--   canonical = 입력 키(오타·변형어)
--   variants  = 정규화 출력(정상 대표어 ko)
--
-- 문제: canonical 이 tag_dictionary.ko(대표어)인 레거시 8행이 존재하여,
--   정상 태그 입력 시 normalizeTag() 가 다른 태그로 재작성하는 오염 발생.
--
-- 실측 확인 (적용 전 SELECT):
--   고압산소치료: canonical_in_dict=true, variants=[고압산소(비사전)]  → 뒤집기
--   마리오네트주름: canonical_in_dict=true, variants=[마리오네트라인(비사전)] → 뒤집기
--   리쥬란HB:    canonical_in_dict=true, variants=[리쥬란(대표어)]     → 삭제 (대표어↔대표어)
--   리프팅시술:  canonical_in_dict=true, variants=[리프팅(대표어)]     → 삭제 (대표어↔대표어)
--   보톡스내성:  canonical_in_dict=true, variants=[보톡스(대), 내성(대)] → 삭제 (분해형)
--   보톡스주기:  canonical_in_dict=true, variants=[보톡스(대), 재시술(대)] → 삭제 (분해형)
--   콜라겐자극:  canonical_in_dict=true, variants=[콜라겐(대표어)]     → 삭제 (대표어→대표어)
--
-- 뒤집기 사전 확인 (새 canonical 고압산소·마리오네트라인):
--   ① tag_normalization 에 이미 canonical 로 존재하지 않음 (SELECT 결과 0건)
--   ② tag_dictionary.ko 에 없음 → 같은 버그 재생산 없음
--   ③ tag_blacklist 에 없음
-- =============================================================================

-- STEP 1: 7행 모두 삭제 (뒤집기 대상 포함 — 이후 새 행으로 INSERT)
-- + 적용 중 가드가 추가로 발견한 1행(덴서티알파팁) 포함하여 실질 8행 처리
DELETE FROM tag_normalization
WHERE canonical IN (
  '고압산소치료',   -- 뒤집기 후 새 행 INSERT
  '마리오네트주름', -- 뒤집기 후 새 행 INSERT
  '리쥬란HB',      -- 삭제: 양쪽 다 대표어
  '리프팅시술',    -- 삭제: 양쪽 다 대표어
  '보톡스내성',    -- 삭제: 분해형 (대표어 → 다른 대표어들)
  '보톡스주기',    -- 삭제: 분해형 (대표어 → 다른 대표어들)
  '콜라겐자극',    -- 삭제: 대표어 → 대표어
  '덴서티알파팁'  -- 삭제: 양쪽 다 대표어 (가드 실행 중 추가 발견, canonical_in_dict=true variants=[덴서티(대표어)])
);

-- STEP 2: 뒤집기 2행 INSERT
--   고압산소치료(대표어) → [고압산소] 를 뒤집어
--   canonical=고압산소(비사전 변형 입력) → variants=[고압산소치료(대표어)] 로 정방향 정규화
INSERT INTO tag_normalization (canonical, variants) VALUES
  ('고압산소',      ARRAY['고압산소치료']),
  ('마리오네트라인', ARRAY['마리오네트주름'])
ON CONFLICT (canonical) DO UPDATE
  SET variants = EXCLUDED.variants;

-- 멱등 검증용 (실행 결과 확인):
-- SELECT canonical, variants FROM tag_normalization
-- WHERE canonical IN ('고압산소', '마리오네트라인',
--   '고압산소치료', '마리오네트주름', '리쥬란HB', '리프팅시술',
--   '보톡스내성', '보톡스주기', '콜라겐자극')
-- ORDER BY canonical;
-- 기대: 고압산소·마리오네트라인 2행만 반환, 나머지 7개 canonical 없음
