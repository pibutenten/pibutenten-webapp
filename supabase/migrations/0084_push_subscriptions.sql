-- 0084: PWA Push Notification 구독 저장소
--
-- 한 사용자가 여러 기기/브라우저에서 push 구독 가능 → (profile_id, endpoint) UNIQUE
-- endpoint는 브라우저 push service의 고유 URL (FCM/Mozilla/Apple).
-- p256dh, auth는 web-push 라이브러리가 암호화 payload 보낼 때 사용.

CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id bigserial PRIMARY KEY,
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  endpoint text NOT NULL,
  p256dh text NOT NULL,
  auth text NOT NULL,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (profile_id, endpoint)
);

CREATE INDEX IF NOT EXISTS push_subscriptions_profile_idx
  ON public.push_subscriptions(profile_id);

-- RLS — 본인 구독만 (Phase 9 묶음 인지)
ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS push_subs_own ON public.push_subscriptions;
CREATE POLICY push_subs_own ON public.push_subscriptions
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = profile_id
        AND (p.id = auth.uid() OR p.auth_user_id = auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = profile_id
        AND (p.id = auth.uid() OR p.auth_user_id = auth.uid())
    )
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.push_subscriptions TO authenticated;
GRANT USAGE ON SEQUENCE public.push_subscriptions_id_seq TO authenticated;

-- service_role은 모든 구독 SELECT (서버 push 발송 시 사용)
-- (RLS는 authenticated만 USING 적용, service_role은 RLS bypass)

SELECT 'OK 0084' AS status;
