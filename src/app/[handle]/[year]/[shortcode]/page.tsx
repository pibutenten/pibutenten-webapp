import { permanentRedirect } from "next/navigation";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ handle: string; year: string; shortcode: string }>;
};

/**
 * Legacy /{handle}/{year}/{shortcode} → /{handle}/{shortcode} 308 redirect.
 * 외부 공유 / 검색엔진 인덱싱된 옛 링크 보존용.
 */
export default async function LegacyMemberPostRedirect({ params }: Props) {
  const { handle, shortcode } = await params;
  permanentRedirect(`/${handle}/${shortcode}`);
}
