import { NextRequest, NextResponse } from "next/server";

/**
 * CSP 위반 보고 수신 endpoint.
 *
 * next.config.ts 의 CSP `report-uri /api/csp-report` + `Report-To` 헤더가
 * 위반 발생 시 이 endpoint 로 POST. 현재 Report-Only 모드이므로 로깅만 수행.
 *
 * 본 endpoint 는 색인 차단 (robots.ts disallow `/api/`) 됨.
 *
 * 운영자 옵션:
 *   - Vercel logs 로 충분: console.warn 로 적재
 *   - Sentry / Supabase audit_logs 등 별도 적재 원하면 운영자가 보강
 *
 * 보안:
 *   - Rate limit 미적용 (Vercel 자체 보호에 의존). spam 가능성 인지.
 *   - 응답은 204 No Content (보고자에게 정보 누설 X).
 */

export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 8 * 1024; // 8KB cap

export async function POST(req: NextRequest) {
  try {
    const text = await req.text();
    const truncated = text.slice(0, MAX_BODY_BYTES);
    // CSP 위반 로그는 운영 알림용 — Vercel logs 에 적재.
    // 민감 정보 (URL 의 query string 등) 포함 가능하므로 audit_logs DB 적재는 보류.
    console.warn("[csp-report]", truncated);
  } catch {
    // body 파싱 실패해도 보고자에게 에러 노출 X
  }
  return new NextResponse(null, { status: 204 });
}

// 일부 브라우저는 OPTIONS preflight 를 보냄 — 명시적 허용 (응답만)
export async function OPTIONS() {
  return new NextResponse(null, { status: 204 });
}
