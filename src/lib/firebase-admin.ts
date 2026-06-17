/**
 * Firebase Admin (FCM) — 네이티브 앱 푸시 발송용 lazy 초기화.
 *
 * 서버 전용. 서비스계정 키는 환경변수 FIREBASE_SERVICE_ACCOUNT(JSON 전문, 한 줄)로 주입.
 *  - 로컬: .env.local (사용자가 직접 — CLAUDE.md §10)
 *  - 운영: Vercel production 환경변수
 *
 * 키가 없으면 null 을 반환 → 호출부(send 라우트)가 FCM 발송을 건너뛴다(웹 푸시는 정상 동작).
 * 따라서 키 미설정 상태에서도 빌드·웹 푸시는 깨지지 않는다.
 */

import { cert, getApps, initializeApp, type App } from "firebase-admin/app";
import { getMessaging, type Messaging } from "firebase-admin/messaging";

let cachedMessaging: Messaging | null = null;
let initTried = false;

function resolveApp(): App | null {
  if (getApps().length > 0) return getApps()[0]!;
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw || !raw.trim()) return null;
  try {
    const sa = JSON.parse(raw) as {
      project_id?: string;
      client_email?: string;
      private_key?: string;
    };
    if (!sa.project_id || !sa.client_email || !sa.private_key) return null;
    // 일부 환경에서 private_key 의 개행이 리터럴 \n 으로 들어오는 경우 복원.
    const privateKey = sa.private_key.replace(/\\n/g, "\n");
    return initializeApp({
      credential: cert({
        projectId: sa.project_id,
        clientEmail: sa.client_email,
        privateKey,
      }),
    });
  } catch {
    return null;
  }
}

/**
 * FCM Messaging 인스턴스. 서비스계정 키 미설정·파싱 실패 시 null.
 */
export function getFcmMessaging(): Messaging | null {
  if (cachedMessaging) return cachedMessaging;
  if (initTried) return cachedMessaging;
  initTried = true;
  const app = resolveApp();
  cachedMessaging = app ? getMessaging(app) : null;
  return cachedMessaging;
}
