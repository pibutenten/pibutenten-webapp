#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Activity Points 시스템 DB 마이그레이션 적용.
Supabase Management API로 SQL 일괄 실행.
"""
import json
import urllib.request
from pathlib import Path

PROJECT_REF = "nahznfvouuwxqctwlwfs"
ENDPOINT = f"https://api.supabase.com/v1/projects/{PROJECT_REF}/database/query"

env_path = Path(__file__).parent.parent / ".env.local"
ACCESS_TOKEN = None
for line in env_path.read_text(encoding="utf-8").splitlines():
    if line.startswith("SUPABASE_ACCESS_TOKEN="):
        ACCESS_TOKEN = line.split("=", 1)[1].strip()

if not ACCESS_TOKEN:
    raise SystemExit("SUPABASE_ACCESS_TOKEN missing in .env.local")


def run_sql(label: str, sql: str) -> None:
    print(f"\n=== {label} ===")
    body = json.dumps({"query": sql}).encode("utf-8")
    req = urllib.request.Request(
        ENDPOINT,
        data=body,
        method="POST",
        headers={
            "Authorization": f"Bearer {ACCESS_TOKEN}",
            "Content-Type": "application/json",
            "User-Agent": "pibutenten-migration/1.0",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            payload = resp.read().decode("utf-8")
            print(f"OK ({resp.status}): {payload[:200]}")
    except urllib.error.HTTPError as e:
        err_body = e.read().decode("utf-8", errors="ignore")
        print(f"HTTP ERROR {e.code}: {err_body[:1500]}")
        raise


# ───────────────────────────────────────────────────────────────────
# A. activity_points ledger
# ───────────────────────────────────────────────────────────────────
SQL_A = """
CREATE TABLE IF NOT EXISTS public.activity_points (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  points NUMERIC(6,2) NOT NULL,
  ref_type TEXT,
  ref_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_activity_points_user_created
  ON public.activity_points(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_points_user_action
  ON public.activity_points(user_id, action, created_at DESC);
ALTER TABLE public.activity_points ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ap_self_select ON public.activity_points;
CREATE POLICY ap_self_select ON public.activity_points
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS ap_admin_all ON public.activity_points;
CREATE POLICY ap_admin_all ON public.activity_points
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

GRANT SELECT, INSERT ON public.activity_points TO authenticated, service_role;
GRANT USAGE, SELECT ON SEQUENCE public.activity_points_id_seq TO authenticated, service_role;
"""

# ───────────────────────────────────────────────────────────────────
# B. daily_logins
# ───────────────────────────────────────────────────────────────────
SQL_B = """
CREATE TABLE IF NOT EXISTS public.daily_logins (
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  login_date DATE NOT NULL,
  PRIMARY KEY (user_id, login_date)
);
ALTER TABLE public.daily_logins ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS dl_self_select ON public.daily_logins;
CREATE POLICY dl_self_select ON public.daily_logins
  FOR SELECT USING (auth.uid() = user_id);

GRANT SELECT, INSERT ON public.daily_logins TO authenticated, service_role;
"""

# ───────────────────────────────────────────────────────────────────
# C. award_points RPC
# ───────────────────────────────────────────────────────────────────
SQL_C = """
CREATE OR REPLACE FUNCTION public.award_points(
  p_user_id UUID,
  p_action TEXT,
  p_points NUMERIC,
  p_ref_type TEXT DEFAULT NULL,
  p_ref_id TEXT DEFAULT NULL,
  p_daily_limit INT DEFAULT NULL
) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $func$
DECLARE
  v_today_count INT;
  v_effective NUMERIC;
  v_score INT;
  v_level INT;
BEGIN
  IF p_user_id IS NULL THEN RETURN; END IF;
  v_effective := p_points;
  IF p_daily_limit IS NOT NULL THEN
    SELECT COUNT(*) INTO v_today_count
    FROM public.activity_points
    WHERE user_id = p_user_id
      AND action = p_action
      AND points > 0
      AND created_at > NOW() - INTERVAL '24 hours';
    IF v_today_count >= p_daily_limit THEN
      v_effective := 0;
    END IF;
  END IF;
  INSERT INTO public.activity_points (user_id, action, points, ref_type, ref_id)
  VALUES (p_user_id, p_action, v_effective, p_ref_type, p_ref_id);

  SELECT COALESCE(SUM(points), 0)::INT INTO v_score
  FROM public.activity_points
  WHERE user_id = p_user_id AND created_at > NOW() - INTERVAL '90 days';
  v_level := CASE
    WHEN v_score >= 2000 THEN 3
    WHEN v_score >= 500 THEN 2
    WHEN v_score >= 100 THEN 1
    ELSE 0 END;
  UPDATE public.profiles
  SET activity_score = v_score, level = v_level
  WHERE id = p_user_id;
END;
$func$;
GRANT EXECUTE ON FUNCTION public.award_points(UUID, TEXT, NUMERIC, TEXT, TEXT, INT)
  TO authenticated, service_role;
"""

# ───────────────────────────────────────────────────────────────────
# D. award_daily_login RPC
# ───────────────────────────────────────────────────────────────────
SQL_D = """
CREATE OR REPLACE FUNCTION public.award_daily_login(p_user_id UUID DEFAULT NULL)
RETURNS INT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $func$
DECLARE
  v_user UUID;
  v_today DATE;
  v_streak INT := 0;
  v_check_date DATE;
BEGIN
  v_user := COALESCE(p_user_id, auth.uid());
  IF v_user IS NULL THEN RETURN 0; END IF;
  v_today := (NOW() AT TIME ZONE 'Asia/Seoul')::DATE;

  IF NOT EXISTS(SELECT 1 FROM public.daily_logins WHERE user_id = v_user AND login_date = v_today) THEN
    INSERT INTO public.daily_logins (user_id, login_date) VALUES (v_user, v_today);
    PERFORM public.award_points(v_user, 'daily_login', 2, 'date', v_today::TEXT);
  END IF;

  v_check_date := v_today;
  LOOP
    EXIT WHEN NOT EXISTS(SELECT 1 FROM public.daily_logins WHERE user_id = v_user AND login_date = v_check_date);
    v_streak := v_streak + 1;
    v_check_date := v_check_date - 1;
  END LOOP;

  IF v_streak > 0 AND v_streak % 7 = 0 THEN
    PERFORM public.award_points(v_user, 'streak_7', 10, 'streak', v_streak::TEXT);
  END IF;
  IF v_streak > 0 AND v_streak % 30 = 0 THEN
    PERFORM public.award_points(v_user, 'streak_30', 50, 'streak', v_streak::TEXT);
  END IF;

  RETURN v_streak;
END;
$func$;
GRANT EXECUTE ON FUNCTION public.award_daily_login(UUID) TO authenticated;
"""

# ───────────────────────────────────────────────────────────────────
# E. get_my_stats RPC
# ───────────────────────────────────────────────────────────────────
SQL_E = """
CREATE OR REPLACE FUNCTION public.get_my_stats()
RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $func$
DECLARE
  v_user UUID := auth.uid();
  v_today DATE := (NOW() AT TIME ZONE 'Asia/Seoul')::DATE;
  v_streak INT := 0;
  v_check DATE;
  v_score INT;
  v_level INT;
  v_posts_count INT;
  v_likes_received BIGINT;
  v_comments_received BIGINT;
  v_shares_received BIGINT;
  v_likes_given BIGINT;
  v_comments_given BIGINT;
BEGIN
  IF v_user IS NULL THEN RETURN NULL; END IF;

  v_check := v_today;
  LOOP
    EXIT WHEN NOT EXISTS(SELECT 1 FROM public.daily_logins WHERE user_id = v_user AND login_date = v_check);
    v_streak := v_streak + 1;
    v_check := v_check - 1;
  END LOOP;

  SELECT COALESCE(SUM(points), 0)::INT INTO v_score
  FROM public.activity_points WHERE user_id = v_user AND created_at > NOW() - INTERVAL '90 days';
  v_level := CASE
    WHEN v_score >= 2000 THEN 3
    WHEN v_score >= 500 THEN 2
    WHEN v_score >= 100 THEN 1
    ELSE 0 END;

  SELECT COUNT(*) INTO v_posts_count
  FROM public.qas WHERE author_id = v_user AND type = 'post' AND status = 'published';

  SELECT COALESCE(SUM(like_count), 0) INTO v_likes_received
  FROM public.qas WHERE author_id = v_user;

  SELECT COUNT(*) INTO v_comments_received
  FROM public.comments c
  JOIN public.qas q ON q.id = c.qa_id
  WHERE q.author_id = v_user
    AND c.author_id IS DISTINCT FROM v_user
    AND c.status = 'visible';

  SELECT COALESCE(SUM(share_count), 0) INTO v_shares_received
  FROM public.qas WHERE author_id = v_user;

  SELECT COUNT(*) INTO v_likes_given FROM public.qa_likes WHERE user_id = v_user;

  SELECT COUNT(*) INTO v_comments_given
  FROM public.comments WHERE author_id = v_user AND status = 'visible';

  RETURN json_build_object(
    'score', v_score,
    'level', v_level,
    'streak', v_streak,
    'posts_count', v_posts_count,
    'likes_received', v_likes_received,
    'comments_received', v_comments_received,
    'shares_received', v_shares_received,
    'likes_given', v_likes_given,
    'comments_given', v_comments_given
  );
END;
$func$;
GRANT EXECUTE ON FUNCTION public.get_my_stats() TO authenticated;
"""

# ───────────────────────────────────────────────────────────────────
# F. on_qa_published trigger
# ───────────────────────────────────────────────────────────────────
SQL_F = """
CREATE OR REPLACE FUNCTION public.on_qa_published()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $func$
BEGIN
  IF NEW.type = 'post' AND NEW.status = 'published' AND NEW.author_id IS NOT NULL THEN
    IF TG_OP = 'INSERT' OR (TG_OP = 'UPDATE' AND (OLD.status IS DISTINCT FROM 'published')) THEN
      PERFORM public.award_points(NEW.author_id, 'post_create', 10, 'qa', NEW.id::TEXT, 3);
      IF NOT EXISTS(SELECT 1 FROM public.activity_points
                    WHERE user_id = NEW.author_id AND action = 'first_post') THEN
        IF (SELECT COUNT(*) FROM public.qas
            WHERE author_id = NEW.author_id AND type = 'post' AND status = 'published') = 1 THEN
          PERFORM public.award_points(NEW.author_id, 'first_post', 20, 'qa', NEW.id::TEXT);
        END IF;
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$func$;
DROP TRIGGER IF EXISTS trg_qa_published ON public.qas;
CREATE TRIGGER trg_qa_published AFTER INSERT OR UPDATE OF status ON public.qas
FOR EACH ROW EXECUTE FUNCTION public.on_qa_published();
"""

# ───────────────────────────────────────────────────────────────────
# G. on_comment_created trigger
# ───────────────────────────────────────────────────────────────────
SQL_G = """
CREATE OR REPLACE FUNCTION public.on_comment_created()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $func$
DECLARE
  v_qa_author UUID;
BEGIN
  IF NEW.author_id IS NULL OR NEW.status != 'visible' THEN RETURN NEW; END IF;

  IF NEW.parent_id IS NULL THEN
    PERFORM public.award_points(NEW.author_id, 'comment_create', 2, 'comment', NEW.id::TEXT, 10);
  ELSE
    PERFORM public.award_points(NEW.author_id, 'reply_create', 1, 'comment', NEW.id::TEXT, 10);
  END IF;

  SELECT author_id INTO v_qa_author FROM public.qas WHERE id = NEW.qa_id;
  IF v_qa_author IS NOT NULL AND v_qa_author IS DISTINCT FROM NEW.author_id THEN
    PERFORM public.award_points(v_qa_author, 'comment_received', 5, 'comment', NEW.id::TEXT);
  END IF;

  RETURN NEW;
END;
$func$;
DROP TRIGGER IF EXISTS trg_comment_created ON public.comments;
CREATE TRIGGER trg_comment_created AFTER INSERT ON public.comments
FOR EACH ROW EXECUTE FUNCTION public.on_comment_created();
"""

# ───────────────────────────────────────────────────────────────────
# H. on_qa_like_added trigger
# ───────────────────────────────────────────────────────────────────
SQL_H = """
CREATE OR REPLACE FUNCTION public.on_qa_like_added()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $func$
DECLARE
  v_qa_author UUID;
BEGIN
  IF NEW.user_id IS NULL THEN RETURN NEW; END IF;
  PERFORM public.award_points(NEW.user_id, 'like_give', 0.5, 'qa', NEW.qa_id::TEXT, 30);
  SELECT author_id INTO v_qa_author FROM public.qas WHERE id = NEW.qa_id;
  IF v_qa_author IS NOT NULL AND v_qa_author IS DISTINCT FROM NEW.user_id THEN
    PERFORM public.award_points(v_qa_author, 'like_received', 3, 'qa', NEW.qa_id::TEXT);
  END IF;
  RETURN NEW;
END;
$func$;
DROP TRIGGER IF EXISTS trg_qa_like_added ON public.qa_likes;
CREATE TRIGGER trg_qa_like_added AFTER INSERT ON public.qa_likes
FOR EACH ROW EXECUTE FUNCTION public.on_qa_like_added();
"""


def main() -> None:
    run_sql("A. activity_points ledger", SQL_A)
    run_sql("B. daily_logins", SQL_B)
    run_sql("C. award_points RPC", SQL_C)
    run_sql("D. award_daily_login RPC", SQL_D)
    run_sql("E. get_my_stats RPC", SQL_E)
    run_sql("F. on_qa_published trigger", SQL_F)
    run_sql("G. on_comment_created trigger", SQL_G)
    run_sql("H. on_qa_like_added trigger", SQL_H)
    print("\n=== ALL DONE ===")


if __name__ == "__main__":
    main()
