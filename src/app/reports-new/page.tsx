import { permanentRedirect } from "next/navigation";

/**
 * /reports-new — 정식 /reports 로 승격 완료(2026-06-29). 308 영구 이전(이전 미리보기 링크 보호).
 *   인덱스·상세 디자인·데이터·SEO 모두 /reports 로 이관됨. 이 라우트는 redirect 만 수행.
 */
export default function ReportsNewIndexRedirect() {
  permanentRedirect("/reports");
}
