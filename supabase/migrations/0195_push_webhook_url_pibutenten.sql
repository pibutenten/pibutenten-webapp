-- 0195: 푸시 웹훅 호출 URL 도메인 이전 (pbtt.kr → pibutenten.kr)
--   notifications INSERT 트리거 함수 notifications_push_webhook() 의 v_url 교체.
--   사유: net.http_post 는 POST 라 301 을 따라가지 않음 → pbtt.kr 301 활성화 후
--         웹훅이 무효화되므로 새 도메인으로 직접 호출하도록 변경 (A-2 전환).
--   함수 본문은 0105 기준 그대로, v_url 한 줄만 변경.

CREATE OR REPLACE FUNCTION public.notifications_push_webhook()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'vault'
AS $function$
DECLARE
  v_url text := 'https://pibutenten.kr/api/push/send';
  v_secret text;
  v_payload jsonb;
BEGIN
  SELECT decrypted_secret INTO v_secret
  FROM vault.decrypted_secrets
  WHERE name = 'push_webhook_secret'
  LIMIT 1;

  IF v_secret IS NULL THEN
    INSERT INTO public.push_webhook_errors (notification_id, error_message)
    VALUES (NEW.id, 'push_webhook_secret missing in vault');
    RETURN NEW;
  END IF;

  v_payload := jsonb_build_object(
    'type', 'INSERT',
    'table', 'notifications',
    'schema', 'public',
    'record', jsonb_build_object(
      'id', NEW.id,
      'recipient_id', NEW.recipient_id,
      'kind', NEW.kind,
      'actor_id', NEW.actor_id,
      'card_id', NEW.card_id,
      'comment_id', NEW.comment_id,
      'message', NEW.message,
      'url', NEW.url,
      'read_at', NEW.read_at,
      'created_at', NEW.created_at
    )
  );

  BEGIN
    PERFORM net.http_post(
      url := v_url,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-pibutenten-push-secret', v_secret
      ),
      body := v_payload,
      timeout_milliseconds := 5000
    );
  EXCEPTION WHEN OTHERS THEN
    -- 알림 INSERT 자체는 차단하지 X (best effort). 에러는 운영 가시성 위해 별도 table.
    BEGIN
      INSERT INTO public.push_webhook_errors (notification_id, error_message)
      VALUES (NEW.id, format('http_post failed: %s', SQLERRM));
    EXCEPTION WHEN OTHERS THEN
      -- 로깅도 실패하면 그냥 무시 (cascade 방지)
      RAISE WARNING '[push_webhook] both http_post and error log failed';
    END;
  END;

  RETURN NEW;
END;
$function$;
