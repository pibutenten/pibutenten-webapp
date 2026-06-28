import { permanentRedirect } from "next/navigation";

/**
 * /reports-new/[시술] — 정식 /reports/[시술] 로 승격 완료(2026-06-29). 308 영구 이전.
 */
type Props = { params: Promise<{ procedure: string }> };

export default async function ReportsNewProcedureRedirect({ params }: Props) {
  const { procedure } = await params;
  permanentRedirect(`/reports/${encodeURIComponent(procedure)}`);
}
