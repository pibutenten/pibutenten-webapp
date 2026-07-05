-- 0346_notifications_clinic_kinds.sql
-- 병원 계정 · 시술노트 대행 — Part B: clinic 알림 종류 2종 추가 + 회원 on/off 설정 컬럼 (2026-07-05)
--
-- 계획 SSOT: docs/plans/260704 병원계정 시술기록 대행입력 계획.md §9·§E-H7·§F-M6
--
-- notifications.kind 는 text + CHECK(현 10값) — enum 아님 → CHECK 교체는 트랜잭션 안전(§B).
--   추가 2종: clinic_link_request(병원이 연결 요청) · clinic_visit_added(새 시술노트 도착).
--   병원명 비노출 원칙(§0-3)은 알림 표시 코드(notification-kinds.ts·push send)에서 처리 — 여기선 종류만 등록.
--
-- 회원 on/off(§F-M6 확정): notification_preferences 에 pref_clinic_link_request·pref_clinic_visit_added
--   추가(기존 pref_* 패턴, 기본 true = 켜짐). 트리거·발송에서 pref 검사(별도 코드).

BEGIN;

-- 1. notifications.kind CHECK 교체 — 기존 10값 → 12값. DROP 후 재생성.
ALTER TABLE public.notifications
  DROP CONSTRAINT IF EXISTS notifications_kind_check;

ALTER TABLE public.notifications
  ADD CONSTRAINT notifications_kind_check
  CHECK (kind IN (
    'comment',
    'reply',
    'like',
    'save',
    'review_request',
    'published',
    'report',
    'keyword',
    'follow_post',
    'diary_reminder',
    'clinic_link_request',   -- 신규: 병원이 시술노트 연결 요청
    'clinic_visit_added'     -- 신규: 병원이 새 시술노트 대행 작성
  ));

-- 2. notification_preferences 에 clinic 알림 on/off 컬럼 2종(기본 켜짐).
ALTER TABLE public.notification_preferences
  ADD COLUMN IF NOT EXISTS pref_clinic_link_request boolean NOT NULL DEFAULT true;

ALTER TABLE public.notification_preferences
  ADD COLUMN IF NOT EXISTS pref_clinic_visit_added boolean NOT NULL DEFAULT true;

COMMIT;
