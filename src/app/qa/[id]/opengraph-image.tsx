import { ImageResponse } from "next/og";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "피부텐텐";

type Props = { params: { id: string } };

const BASE_URL = "https://pibutenten-webapp.vercel.app";

/**
 * 단일 Q&A 페이지 OG 이미지 — 원장별 미리 제작된 1200x630 PNG를 그대로 출력.
 * (satori 동적 합성 대신 정적 파일 사용 → 한글 폰트/사진 합성 이슈 없음)
 */
export default async function QaOG({ params }: Props) {
  const id = Number.parseInt(params.id, 10);
  const supabase = await createSupabaseServerClient();
  const { data: qa } = await supabase
    .from("qas")
    .select("doctor:doctors(slug)")
    .eq("id", id)
    .maybeSingle();

  type DoctorMini = { slug: string };
  const doctorRaw = qa?.doctor as unknown;
  const doctor: DoctorMini | null = Array.isArray(doctorRaw)
    ? ((doctorRaw[0] as DoctorMini) ?? null)
    : ((doctorRaw as DoctorMini | null) ?? null);

  const ogUrl = doctor
    ? `${BASE_URL}/og/${doctor.slug}.png`
    : `${BASE_URL}/og-default.png`;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={ogUrl}
          alt="피부텐텐"
          width={1200}
          height={630}
          style={{ width: "100%", height: "100%", objectFit: "cover" }}
        />
      </div>
    ),
    size,
  );
}
