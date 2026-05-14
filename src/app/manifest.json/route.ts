// /manifest.json 요청을 정식 경로 /manifest.webmanifest 로 영구 redirect.
// 일부 구형 브라우저/링크에서 manifest.json 을 기대하는 케이스 대응.
import { NextResponse, type NextRequest } from "next/server";

export function GET(request: NextRequest) {
  return NextResponse.redirect(new URL("/manifest.webmanifest", request.url), 301);
}
