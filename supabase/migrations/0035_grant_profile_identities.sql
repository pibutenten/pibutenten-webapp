-- 0027의 RLS만으론 부족 — GRANT가 빠져 layout의 SELECT가 0건이 되어
-- IdentitySwitcher dropdown이 항상 비어 있던 버그 해결.

grant select on public.profile_identities to anon, authenticated;
grant insert, update, delete on public.profile_identities to authenticated;
