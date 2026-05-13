-- =============================================================
-- 0050. role enum 정정 — developer를 admin으로 되돌림
--
-- 사용자 규약: role enum은 admin / doctor / user 3개만.
-- 0047에서 admin → developer로 잘못 변환했음 → 정정.
-- 'developer'는 role이 아니라 handle (예: bae-jungmin의 admin identity).
-- =============================================================

-- 모든 developer role을 admin으로 되돌림
update public.profiles
   set role = 'admin'::user_role
 where role::text = 'developer';

-- 검증
select handle, display_name, role::text as role
from public.profiles
where handle in ('admin', 'developer', 'bae-jungmin', 'jung-hanmi', 'jminbae')
order by handle;
