-- 0166: PubMed 참고문헌 단일 자리 통합 (ADR 0012 정합)
--
-- 사용자 결정 (2026-05-26): "한 곳에만 저장해야지."
--
-- 옛 자리 (cards.pubmed_ref jsonb 단일) + 새 자리 (cards.pubmed_refs jsonb[] 배열)
-- 동시 저장 패턴 → 한 곳만 갱신되는 사고 시 영구 불일치 위험 (김수형 회귀 패턴).
--
-- 분포 점검 결과 (2026-05-26):
--   only_old (옛만):  15건
--   only_new (새만):   0건
--   both    (양쪽):   844건 — mismatch 0건 (모두 일치)
--   neither (없음):  170건
--
-- 위 분포라 안전. 옛 15건만 새 자리에 백필 후 옛 컬럼 제거.

BEGIN;

-- 1) only_old 케이스 백필 — 옛 자리 → 새 자리 array
UPDATE public.cards
   SET pubmed_refs = ARRAY[pubmed_ref]
 WHERE pubmed_ref IS NOT NULL
   AND pubmed_refs IS NULL;

-- 2) 옛 자리 컬럼 제거
ALTER TABLE public.cards DROP COLUMN IF EXISTS pubmed_ref;

COMMIT;

-- ─── 적용 후 코드 측 정합 필요 ───
-- src/lib/types/card.ts: pubmed_ref 필드 제거
-- src/components/card/CardBody.tsx:45-51: fallback 분기 제거 (refs = card.pubmed_refs ?? [])
-- src/lib/schema/api/articles.ts: pubmed_ref 단수 필드 제거
-- src/app/api/articles/[id]/route.ts:235-240: pubmed_ref payload 처리 제거
-- src/app/admin/cards/[id]/edit/EditClient.tsx: pubmed_ref: payload.pubmedRefs[0] 라인 제거
-- src/app/write/[shortcode]/EditClient.tsx: pubmed_ref 동일 처리 제거
