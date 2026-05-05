import { ImageResponse } from "next/og";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getDoctorTheme } from "@/lib/doctor-theme";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "피부텐텐";

type Props = { params: { id: string } };

const BASE_URL = "https://pibutenten-webapp.vercel.app";

/**
 * 단일 Q&A 페이지 OG 이미지 — 원장 사진 메인 + 우상단 피부과 전문의 PNG 마크.
 * 모든 이미지는 absolute URL로 fetch (Vercel 런타임 안전).
 */
export default async function QaOG({ params }: Props) {
  const id = Number.parseInt(params.id, 10);
  const supabase = await createSupabaseServerClient();
  const { data: qa } = await supabase
    .from("qas")
    .select("doctor:doctors(slug, name)")
    .eq("id", id)
    .maybeSingle();

  type DoctorMini = { slug: string; name: string };
  const doctorRaw = qa?.doctor as unknown;
  const doctor: DoctorMini | null = Array.isArray(doctorRaw)
    ? ((doctorRaw[0] as DoctorMini) ?? null)
    : ((doctorRaw as DoctorMini | null) ?? null);

  const theme = doctor ? getDoctorTheme(doctor.slug) : null;
  const bg = theme?.bgSoft ?? "#7DC1DD";

  const photoUrl = doctor ? `${BASE_URL}/doctors/${doctor.slug}.png` : null;
  const certUrl = `${BASE_URL}/derma-cert.png`;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          background: bg,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          position: "relative",
        }}
      >
        {/* 원장 사진 — height 100%, contain center bottom */}
        {photoUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={photoUrl}
            alt={doctor?.name ?? ""}
            style={{
              height: "100%",
              objectFit: "contain",
              objectPosition: "center bottom",
            }}
          />
        )}

        {/* 우상단 피부과 전문의 마크 (사용자 제공 PNG) */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={certUrl}
          alt="피부과 전문의"
          width={130}
          height={130}
          style={{
            position: "absolute",
            top: 32,
            right: 32,
          }}
        />
      </div>
    ),
    size,
  );
}
