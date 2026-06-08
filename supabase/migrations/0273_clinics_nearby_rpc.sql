-- 0273. clinics_nearby RPC — 좌표 기준 거리순 최근접 병원 반환
--
-- 목적: 클라이언트가 bbox+limit 로 가져온 뒤 클라이언트에서 거리정렬하던 방식을
--   대체한다. bbox 안 병원이 수천 곳일 때 DB 가 임의 80개만 반환하여 진짜 최근접
--   병원이 누락되는 문제를 해결한다.
--
-- 알고리즘:
--   1) bbox 사전필터 (x_pos/y_pos btree 인덱스 `clinics_xy` 활용)
--      - 위도 ±(in_km / 111.0) 도 (1도 ≈ 111km)
--      - 경도 ±(in_km /  88.0) 도 (한국 중위도 기준 1도 ≈ 88km)
--   2) x_pos/y_pos NULL 행 제외
--   3) haversine 거리 계산 (km) — 서브쿼리에서 dist_km 컬럼으로 구체화
--   4) dist_km <= in_km 최종 필터 (bbox 모서리 초과분 제거, 외부 WHERE 에서 alias 참조)
--   5) dist_km ASC 정렬 후 LIMIT in_lim
--
-- 보안:
--   - LANGUAGE SQL STABLE — 읽기 전용, 옵티마이저 인라인 최적화 가능
--   - SECURITY INVOKER — 호출자 권한(anon/authenticated)으로 실행
--     clinics RLS "clinics_select_public" (anon/authenticated SELECT 허용) 에 의해
--     anon 호출 시에도 정상 동작. service_role 은 RLS bypass 로 역시 동작.
--   - GRANT EXECUTE TO anon, authenticated — PostgREST REST 경로 호출용
--
-- 반환: name, addr, tel, x_pos, y_pos, dist_km (double precision, km)
-- 인수: in_lat  double precision — 기준점 위도
--       in_lng  double precision — 기준점 경도
--       in_km   double precision DEFAULT 5  — 검색 반경 (km)
--       in_lim  int             DEFAULT 20  — 반환 행 수 상한

CREATE OR REPLACE FUNCTION public.clinics_nearby(
  in_lat  double precision,
  in_lng  double precision,
  in_km   double precision DEFAULT 5,
  in_lim  int             DEFAULT 20
)
RETURNS TABLE (
  name     text,
  addr     text,
  tel      text,
  x_pos    double precision,
  y_pos    double precision,
  dist_km  double precision
)
LANGUAGE sql
STABLE
SECURITY INVOKER
AS $$
  SELECT
    sq.name,
    sq.addr,
    sq.tel,
    sq.x_pos,
    sq.y_pos,
    sq.dist_km
  FROM (
    SELECT
      c.name,
      c.addr,
      c.tel,
      c.x_pos,
      c.y_pos,
      -- haversine 거리 (km), LEAST/GREATEST 로 부동소수 오차 클램핑
      6371.0 * acos(
        least(1.0, greatest(-1.0,
          sin(radians(in_lat)) * sin(radians(c.y_pos))
          + cos(radians(in_lat)) * cos(radians(c.y_pos))
            * cos(radians(c.x_pos - in_lng))
        ))
      ) AS dist_km
    FROM public.clinics AS c
    WHERE
      -- bbox 사전필터: btree 인덱스 clinics_xy (x_pos, y_pos) 활용
      c.x_pos IS NOT NULL
      AND c.y_pos IS NOT NULL
      AND c.y_pos BETWEEN (in_lat - in_km / 111.0) AND (in_lat + in_km / 111.0)
      AND c.x_pos BETWEEN (in_lng - in_km /  88.0) AND (in_lng + in_km /  88.0)
  ) AS sq
  WHERE sq.dist_km <= in_km   -- bbox 모서리 초과분 제거 (원형 반경 최종 필터)
  ORDER BY sq.dist_km ASC
  LIMIT in_lim;
$$;

-- GRANT: anon/authenticated 가 PostgREST RPC 경로로 호출 가능하도록
GRANT EXECUTE ON FUNCTION public.clinics_nearby(double precision, double precision, double precision, int)
  TO anon, authenticated;

COMMENT ON FUNCTION public.clinics_nearby IS
  '좌표 기준 거리순 최근접 병원 반환. bbox 사전필터(clinics_xy btree) + haversine 정렬 + LIMIT. security invoker(anon 호출 가능).';
