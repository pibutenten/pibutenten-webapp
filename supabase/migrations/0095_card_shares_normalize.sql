-- 0095: card_shares 시스템 정상화 (누더기 청소)
--
-- 배경:
--   - card_shares 테이블 + RLS + admin RPC(get_card_activity_users, get_top_cards_by_shares)는
--     이미 존재 (0065에서 qa_shares → 리네임).
--   - 그러나 어느 시점에서 클라이언트가 row insert 대신 increment_card_share RPC
--     (cards.share_count UPDATE만 하는 단순 카운터)로 단순화되면서,
--     card_shares 테이블에는 옛 데이터 19 row 외 신규 row가 쌓이지 않게 됨.
--   - 결과: admin stats "공유 많은 글 TOP" 화면이 옛 흔적 데이터만 표시 중.
--
-- 이 마이그레이션의 목표:
--   1. like/save와 동일 패턴의 트리거 추가 → card_shares INSERT 시 cards.share_count 자동 +1
--   2. increment_card_share RPC drop (단일 책임 위반 + 호출처 1곳뿐, 클라 INSERT로 대체)
--   3. 옛 RLS 정책명 cosmetic 리네임 (qa_shares → card_shares)
--
-- 클라이언트 변경 (별도 commit):
--   src/components/Card.tsx 의 share 핸들러:
--     rpc("increment_card_share") → from("card_shares").insert({ card_id, user_id, channel })
--   userId 패턴은 card_views/card_impressions 와 동일 (active profile.id / 비로그인 null)
--   channel: "native" (모바일 navigator.share) | "link-copy" (데스크탑 클립보드)

BEGIN;

-- ── 1) card_shares INSERT 시 cards.share_count 자동 동기화 트리거 ──
-- 패턴: 0066 qas_save_count_sync / qa_likes_sync 와 동일.
-- DELETE 케이스도 안전망으로 포함 (현 클라에는 없지만 admin이 수동 정리 시 일관성).

CREATE OR REPLACE FUNCTION public.card_shares_count_sync()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.cards
       SET share_count = COALESCE(share_count, 0) + 1
     WHERE id = NEW.card_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.cards
       SET share_count = GREATEST(0, COALESCE(share_count, 0) - 1)
     WHERE id = OLD.card_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_card_shares_count_sync ON public.card_shares;
CREATE TRIGGER trg_card_shares_count_sync
  AFTER INSERT OR DELETE ON public.card_shares
  FOR EACH ROW EXECUTE FUNCTION public.card_shares_count_sync();

-- ── 2) increment_card_share RPC drop ──
-- 단일 책임 위반 (카운터만 ↑, row 미생성) + 클라가 직접 INSERT로 전환되므로 불필요.
-- 호출처: src/components/Card.tsx 1곳뿐 (동일 commit에서 INSERT로 교체).
DROP FUNCTION IF EXISTS public.increment_card_share(integer);

-- ── 3) RLS 정책명 cosmetic 리네임 (qa_shares → card_shares) ──
-- 동작은 동일. 0065 rename 누락된 흔적 청소.
ALTER POLICY "qa_shares: admin select"  ON public.card_shares RENAME TO "card_shares: admin select";
ALTER POLICY "qa_shares: anyone insert" ON public.card_shares RENAME TO "card_shares: anyone insert";

COMMIT;

SELECT 'OK 0095' AS status;
