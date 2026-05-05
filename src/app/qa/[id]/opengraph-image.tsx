import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getDoctorTheme, getDoctorPhoto } from "@/lib/doctor-theme";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "피부텐텐";

type Props = { params: { id: string } };

/**
 * 단일 Q&A 페이지 OG 이미지 — 원장 사진 + 원장 theme 배경 + 우상단 피부과 전문의 마크
 * 카카오톡/페북 등에서 공유 시 미리보기 카드.
 */
export default async function QaOG({ params }: Props) {
  const id = Number.parseInt(params.id, 10);
  const supabase = await createSupabaseServerClient();
  const { data: qa } = await supabase
    .from("qas")
    .select("question, doctor:doctors(slug, name)")
    .eq("id", id)
    .maybeSingle();

  type DoctorMini = { slug: string; name: string };
  const doctorRaw = qa?.doctor as unknown;
  const doctor: DoctorMini | null = Array.isArray(doctorRaw)
    ? ((doctorRaw[0] as DoctorMini) ?? null)
    : ((doctorRaw as DoctorMini | null) ?? null);

  const theme = doctor ? getDoctorTheme(doctor.slug) : null;
  const bg = theme?.bg ?? "#7DC1DD";
  const accent = theme?.accent ?? "#1B4965";

  // 사진 (transparent PNG) → 절대 URL 또는 file system 읽기
  let photoDataUrl: string | null = null;
  if (doctor) {
    try {
      const photoPath = join(
        process.cwd(),
        "public",
        getDoctorPhoto(doctor.slug),
      );
      const photoBuf = await readFile(photoPath);
      photoDataUrl = `data:image/png;base64,${photoBuf.toString("base64")}`;
    } catch {
      photoDataUrl = null;
    }
  }

  // 인증 마크 SVG → data URL
  let certDataUrl: string | null = null;
  try {
    const certSvg = await readFile(
      join(process.cwd(), "public", "derma-cert.svg"),
      "utf-8",
    );
    certDataUrl = `data:image/svg+xml;base64,${Buffer.from(certSvg).toString("base64")}`;
  } catch {
    certDataUrl = null;
  }

  // 텍스트 줄임
  const question = (qa?.question ?? "피부텐텐").slice(0, 60);

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          background: bg,
          display: "flex",
          position: "relative",
        }}
      >
        {/* 우상단 피부과 전문의 마크 */}
        {certDataUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={certDataUrl}
            width={140}
            height={140}
            style={{
              position: "absolute",
              top: 32,
              right: 32,
            }}
            alt="피부과 전문의"
          />
        )}

        {/* 좌측: 텍스트 영역 */}
        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            padding: "60px 40px 60px 70px",
            color: accent,
          }}
        >
          <div style={{ fontSize: 28, opacity: 0.7, marginBottom: 12 }}>
            {doctor ? `${doctor.name} 원장님` : "피부텐텐"}
          </div>
          <div
            style={{
              fontSize: 48,
              fontWeight: 800,
              lineHeight: 1.25,
              letterSpacing: "-1px",
              maxWidth: 600,
            }}
          >
            {question}
          </div>
          <div
            style={{
              fontSize: 24,
              marginTop: 28,
              opacity: 0.55,
            }}
          >
            피부텐텐 — 피부가 예뻐지는 모든 이야기
          </div>
        </div>

        {/* 우측: 원장 사진 */}
        {photoDataUrl && (
          <div
            style={{
              width: 480,
              height: "100%",
              display: "flex",
              alignItems: "flex-end",
              justifyContent: "center",
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={photoDataUrl}
              alt={doctor?.name ?? "원장님"}
              style={{
                height: "92%",
                objectFit: "contain",
                objectPosition: "bottom",
              }}
            />
          </div>
        )}
      </div>
    ),
    size,
  );
}
