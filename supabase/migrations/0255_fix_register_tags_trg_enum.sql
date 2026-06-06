-- 0255. cards_register_tags_trg() enum 캐스팅 버그 수정 (2단계 B)
--
-- 증상: cards.keywords UPDATE 시 트리거가 "invalid input value for enum qa_type: '?'" 에러.
-- 원인: `'card:' || COALESCE(NEW.type, '?')` 에서 COALESCE(enum, text) 의 공통 타입이
--   qa_type 으로 추론되어 fallback 리터럴 '?' 를 qa_type 으로 캐스팅 시도 → 실패.
--   (rename_tag(0253) 의 cards.keywords 일괄 UPDATE 시 노출. type NULL 카드는 현재 0건이나
--    표현식 자체가 타입 불안전 — 일반 카드 keywords 수정 경로의 잠재 버그.)
-- 수정: NEW.type 을 text 로 명시 캐스팅 → COALESCE(text, text), enum 캐스팅 제거.
-- 동작 불변: source 문자열은 'card:qa' / 'card:post' / (NULL 시)'card:?' 그대로.

CREATE OR REPLACE FUNCTION public.cards_register_tags_trg()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  PERFORM public.register_unknown_tags(NEW.keywords, 'card:' || COALESCE(NEW.type::text, '?'));
  RETURN NEW;
END;
$function$;
