-- 0246. 0단계 글상자 태그 정정 (cards.keywords) — 병합11 + 삭제15 + 표기통일4(실효2)
--
-- 배경:
--   cards.keywords(자유텍스트 한글 태그 배열)의 노이즈/중복/표기흔들림 정리.
--   확정매핑표(태그_0단계_확정매핑표_20260606.xlsx) 102행 중 keywords 를 실제 변경하는 30행만 적용.
--   영문변경 1 + 영문채움 69 = 70행은 keywords 미변경(영문 슬러그 사전 사안) → 1단계로 분리.
--
-- 적용 범위(30행):
--   - 병합 11: 영문 슬러그 출발태그 → 한글 도착태그 (array_replace). 출발∩도착 동시보유 10건 → array_agg(DISTINCT) dedup.
--   - 삭제 15: 테스트/노이즈/1글자 태그 제거 (array_remove).
--   - 표기통일 4: 울세라→울쎄라, 민감피부→민감성피부, K-뷰티→K뷰티, 마리오네트→마리오네트주름 (array_replace).
--       ※ K-뷰티·마리오네트 는 현재 카드 미존재 = no-op(0행). 사전 표기 정합은 1단계.
--
-- 원칙: body·title·meta 불변. cards.keywords 만. updated_at 보존(cards_set_updated_at 트리거 tx 내 disable/enable).
--
-- 백업(운영 적용 시 본 마이그 직전 별도 적재 — 본 파일에는 미포함):
--   CREATE TABLE public.cards_keywords_bak_0246 AS
--     SELECT id, keywords, updated_at, deleted_at, now() AS backed_up_at FROM public.cards;   -- 1,232행(전수)
--   롤백: UPDATE cards c SET keywords=b.keywords, updated_at=b.updated_at
--           FROM cards_keywords_bak_0246 b WHERE c.id=b.id;  (동일 트리거 disable/enable 패턴)
--
-- 멱등성: 이미 production 적용 완료(2026-06-06). 재실행 시 source 태그가 이미 부재하므로
--   WHERE 절(keywords && source)이 0행 매칭 → 무영향(안전). 신규 DB 재구축 시에도 0행.
--
-- 적용 결과(2026-06-06): 영향 29행 / dedup 10 / distinct 2003→1975(−28) /
--   updated_at 전건(1,232) 보존 / 빈 배열 1건(id=2296 draft doodle, 유일태그 '테스트' 삭제 결과, 정당).

BEGIN;

ALTER TABLE public.cards DISABLE TRIGGER cards_set_updated_at;  -- tx 한정, 롤백 시 자동 복구

UPDATE public.cards c
SET keywords = COALESCE(
  (SELECT array_agg(DISTINCT k) FROM unnest(
    -- 삭제 15 (array_remove 중첩)
    array_remove(array_remove(array_remove(array_remove(array_remove(
    array_remove(array_remove(array_remove(array_remove(array_remove(
    array_remove(array_remove(array_remove(array_remove(array_remove(
    -- 표기통일 4 + 병합 11 (array_replace 중첩)
    array_replace(array_replace(array_replace(array_replace(
    array_replace(array_replace(array_replace(array_replace(array_replace(array_replace(array_replace(
    array_replace(array_replace(array_replace(array_replace(
      c.keywords,
      'jaw-botox','턱보톡스'),
      'skin-botox','스킨보톡스'),
      'wrinkle-botox','주름보톡스'),
      'the-l-injection','더엘주사'),
      'rejuran-eye','리쥬란아이'),
      'rejuran-hb','리쥬란HB'),
      'juvelook-volume','쥬베룩볼륨'),
      'restylane-vital','레스틸렌비탈'),
      'vital-light','비탈라이트'),
      'gold-ptt','골드PTT'),
      'xerf-eye','세르프아이'),
      '울세라','울쎄라'),
      '민감피부','민감성피부'),
      'K-뷰티','K뷰티'),
      '마리오네트','마리오네트주름'),
      '테스트'),
      '테스트 입니다'),
      '1분테스트'),
      '거품테스트'),
      '파팅테스트'),
      '아무태그나가능한?'),
      '띄어쓰기가 반영이 되는 태그로 가는 게 맞나요?'),
      '100일의기적'),
      '1회적정량'),
      '0.025%'),
      '뇌'),
      '홀'),
      '광'),
      '겔'),
      '팁')
  ) k),
  ARRAY[]::text[]
)
WHERE c.deleted_at IS NULL
  AND c.keywords && ARRAY[
    -- source 30개 (병합출발11 + 표기통일출발4 + 삭제15)
    'jaw-botox','skin-botox','wrinkle-botox','the-l-injection','rejuran-eye','rejuran-hb',
    'juvelook-volume','restylane-vital','vital-light','gold-ptt','xerf-eye',
    '울세라','민감피부','K-뷰티','마리오네트',
    '테스트','테스트 입니다','1분테스트','거품테스트','파팅테스트','아무태그나가능한?',
    '띄어쓰기가 반영이 되는 태그로 가는 게 맞나요?','100일의기적','1회적정량','0.025%',
    '뇌','홀','광','겔','팁'
  ]::text[];

ALTER TABLE public.cards ENABLE TRIGGER cards_set_updated_at;

COMMIT;
