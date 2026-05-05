-- =============================================================
-- 0002. 원장님 표시 순서 재조정
--
-- 새 순서:
--   정한미 → 이도영 → 권수현 → 김종식 → 박효진 →
--   고혜림 → 김수형 → 배정민 → 강현진
-- =============================================================

update public.doctors set sort_order = 10 where slug = 'jeonghanmi';
update public.doctors set sort_order = 20 where slug = 'leedoyoung';
update public.doctors set sort_order = 30 where slug = 'kwonsuhyun';
update public.doctors set sort_order = 40 where slug = 'kimjongsik';
update public.doctors set sort_order = 50 where slug = 'parkhyojin';
update public.doctors set sort_order = 60 where slug = 'gohyerim';
update public.doctors set sort_order = 70 where slug = 'kimsoohyung';
update public.doctors set sort_order = 80 where slug = 'baejungmin';
update public.doctors set sort_order = 90 where slug = 'kanghyunjin';
