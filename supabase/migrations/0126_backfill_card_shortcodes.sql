-- 0126: shortcode NULL 인 기존 cards row backfill (2026-05-17)
--
-- 배경:
--   `src/app/api/articles/route.ts` 의 회귀 fix 와 짝.
--   기존 정책은 doctor 글(type='qa' 또는 type='post' + doctor_id)에 shortcode 를
--   생성하지 않았음. 그 결과 `getQaEditUrl()` (src/lib/card-url.ts) 가 null 을
--   반환 → 카드 케밥에서 "수정" 메뉴 미노출, 삭제만 보임.
--
--   `/api/articles` 를 모든 카드에 shortcode 부여하도록 수정했고, 본 마이그레이션은
--   shortcode NULL 인 기존 row 들(doctor 본인이 /write 로 쓴 글 등)을 채워서
--   동일 정책으로 회수.
--
--   주의: admin/draft/publish 경로(YouTube 일괄 발행)는 기존에도 shortcode 를
--   생성하고 있어 그쪽 카드는 영향 없음.
--
-- shortcode 규약 (src/lib/shortcode.ts 참고):
--   - 알파벳: base58 (0/O/1/l/I 제외) — 58 글자
--   - 길이: 8
--   - 검증 정규식 (`/write/[shortcode]/page.tsx`): ^[1-9A-HJ-NP-Za-km-z]{6,12}$
--
-- 구현:
--   plpgsql 함수에서 PG 의 random() 으로 base58 8 자 생성, cards.shortcode UNIQUE
--   에 충돌 시 재시도. 실행 후 함수는 DROP.

BEGIN;

CREATE OR REPLACE FUNCTION _backfill_card_shortcodes()
RETURNS integer
LANGUAGE plpgsql
AS $$
DECLARE
  v_alphabet text := '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  v_len      int  := 58;
  v_target   int  := 8;
  v_filled   int  := 0;
  v_row      record;
  v_candidate text;
  v_attempt   int;
  v_i         int;
BEGIN
  FOR v_row IN
    SELECT id FROM cards WHERE shortcode IS NULL ORDER BY id
  LOOP
    -- 충돌 시 재시도 (사실상 충돌 0, 안전망)
    FOR v_attempt IN 1..10 LOOP
      v_candidate := '';
      FOR v_i IN 1..v_target LOOP
        v_candidate := v_candidate
          || substr(v_alphabet, 1 + floor(random() * v_len)::int, 1);
      END LOOP;
      BEGIN
        UPDATE cards SET shortcode = v_candidate WHERE id = v_row.id;
        v_filled := v_filled + 1;
        EXIT;
      EXCEPTION WHEN unique_violation THEN
        -- 다음 candidate 로 재시도
        NULL;
      END;
    END LOOP;
  END LOOP;

  RETURN v_filled;
END $$;

SELECT _backfill_card_shortcodes() AS filled_count;

DROP FUNCTION _backfill_card_shortcodes();

COMMIT;
