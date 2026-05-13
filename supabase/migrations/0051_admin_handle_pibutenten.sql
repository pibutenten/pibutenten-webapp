-- =============================================================
-- 0051. 관리자 handle 변경 — 'admin' → 'pibutenten'
-- =============================================================

update public.profiles
   set handle = 'pibutenten'
 where handle = 'admin'
   and role = 'admin'::user_role;

-- 검증
select id, handle, display_name, role::text as role
from public.profiles
where handle in ('admin', 'pibutenten')
order by handle;
