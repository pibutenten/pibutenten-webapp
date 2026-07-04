-- 0336_expand_reserved_handles.sql
-- 예약 핸들 확장 (2026-07-04): 회원이 최상위 라우트 이름·주요 시스템 용어를 핸들로
--   선점해 페이지를 가리는 것을 방지.
--
-- 배경: reserved_handles(check_handle_not_reserved 트리거로 강제)에 신규 최상위 라우트가
--   다수 빠져 있었다(reports/topics/today/review/reviews/shop/my/notes/weather/report/rss/
--   onboarding/notifications/debug/cards/doctor/corrections/disclaimer/disclosures/
--   editorial-policy/medical-review/doctor-guidelines/reports-new/app). Next 정적 라우트가
--   우선이라 실사고는 latent 이나 예약 목록 미갱신은 드리프트. 시술명(태그)까지 예약하는 것은
--   수천 개라 비현실적 → 회원 핸들 @ 네임스페이스 전환(별도 Phase)이 근본 해법. 그 전까지
--   최상위 라우트 + 흔한 시스템/남용 용어를 예약해 둔다.
--
-- 멱등: ON CONFLICT (handle) DO NOTHING. route-class.ts::RESERVED_FIRST_SEGMENT 도 동반
--   갱신(app·reports-new·reviews 추가) — 라우팅 분류 SSOT.

INSERT INTO public.reserved_handles (handle) VALUES
  -- 최상위 라우트
  ('app'), ('cards'), ('corrections'), ('debug'), ('disclaimer'), ('disclosures'),
  ('doctor'), ('doctor-guidelines'), ('editorial-policy'), ('medical-review'),
  ('my'), ('notes'), ('notifications'), ('onboarding'), ('report'), ('reports'),
  ('reports-new'), ('review'), ('reviews'), ('rss'), ('shop'), ('today'),
  ('topics'), ('weather'),
  -- 흔한 시스템/기능/남용 방지 용어
  ('profile'), ('user'), ('users'), ('account'), ('accounts'), ('notice'), ('faq'),
  ('verify'), ('password'), ('reset'), ('callback'), ('dashboard'), ('billing'),
  ('payment'), ('cart'), ('order'), ('checkout'), ('shopping'), ('event'), ('events'),
  ('messages'), ('message'), ('chat'), ('follow'), ('followers'), ('following'),
  ('like'), ('likes'), ('save'), ('saves'), ('tag'), ('tags'), ('category'), ('categories')
ON CONFLICT (handle) DO NOTHING;
