import { notFound, redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import ClinicLinkConsentView from "./ClinicLinkConsentView";
import ClinicLinkConsentClient from "./ClinicLinkConsentClient";

/**
 * /onboarding/clinic-link/[id] — 병원 연결 등록 동의 화면 (B5, 계획 §8.3).
 *
 * 알림("...이 시술노트 연결을 요청했어요") 클릭 진입. 온보딩형 전체화면 —
 * 기존 온보딩 3단 패턴(page.tsx 서버 가드 → View 셸 → Client 폼) 복제.
 *   - middleware 온보딩 게이트는 "/onboarding" prefix 면제라 이 경로도 자동 면제(정정 §E-H1).
 *   - noindex 는 상위 onboarding/layout.tsx 의 robots metadata 가 중첩 세그먼트로 상속됨.
 *
 * 데이터는 서버에서 fetch 하지 않고 Client 가 GET /api/member/clinic-links/[id] 로 로드:
 *   - clinic_member_links 는 직접 GRANT 없음(0344) → member_* RPC 가 유일 경로인데,
 *     그 RPC 의 active 명함 결정·에러 매핑(404/409 userMessage)이 이미 API 라우트에 구현돼 있어
 *     서버 페이지에서 중복 구현하면 같은 RPC 에 두 번째 코드 경로가 생김.
 *   - 동의/거절(respond POST)도 클라이언트 액션이라, 조회·응답·상태 전환을 한 곳에서 처리.
 *   (기존 /onboarding page.tsx 가 서버 fetch 인 건 PII prefill·dedup 등 서버 전용 로직 때문 — 여기 없음.)
 */

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }> };

export default async function ClinicLinkConsentPage({ params }: Props) {
  const { id } = await params;

  // linkId 정수 파싱 — API 의 parseLinkId(양수 정수만)와 동일 정책. 실패 시 404.
  if (!/^\d+$/.test(id)) notFound();
  const linkId = Number(id);
  if (!Number.isSafeInteger(linkId) || linkId <= 0) notFound();

  // 로그인 필수 — 비로그인은 로그인 후 이 화면으로 복귀.
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=/onboarding/clinic-link/${linkId}`);

  return (
    <ClinicLinkConsentView>
      <ClinicLinkConsentClient linkId={linkId} />
    </ClinicLinkConsentView>
  );
}
