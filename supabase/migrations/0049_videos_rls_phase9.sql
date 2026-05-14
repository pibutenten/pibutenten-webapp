-- 0049: videos 테이블 RLS Phase 9 호환
-- 기존 admin insert/update 정책이 `profiles.id = auth.uid()`만 검사 → Phase 9 묶음 미인정
-- 같은 auth_user_id 묶음에 admin/developer role이 있으면 INSERT/UPDATE 가능하도록 갱신

DROP POLICY IF EXISTS "videos: admin insert" ON public.videos;
CREATE POLICY "videos: admin insert"
  ON public.videos
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE (p.id = auth.uid() OR p.auth_user_id = auth.uid())
        AND p.role IN ('admin', 'developer')
    )
  );

DROP POLICY IF EXISTS "videos: admin update" ON public.videos;
CREATE POLICY "videos: admin update"
  ON public.videos
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE (p.id = auth.uid() OR p.auth_user_id = auth.uid())
        AND p.role IN ('admin', 'developer')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE (p.id = auth.uid() OR p.auth_user_id = auth.uid())
        AND p.role IN ('admin', 'developer')
    )
  );
