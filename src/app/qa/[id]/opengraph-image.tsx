import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getDoctorTheme } from "@/lib/doctor-theme";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "피부텐텐";

type Props = { params: { id: string } };

/**
 * 단일 Q&A 페이지 OG 이미지 — 원장 사진을 크게 + 우상단에 피부과 전문의 마크
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

  // 원장 사진 (path.join에 leading slash 주의 — doctors/{slug}.png로 안전 작성)
  let photoDataUrl: string | null = null;
  if (doctor) {
    try {
      const photoPath = join(
        process.cwd(),
        "public",
        "doctors",
        `${doctor.slug}.png`,
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
        {/* 원장 사진 — 가운데 크게 (contain, bottom 정렬) */}
        {photoDataUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={photoDataUrl}
            alt={doctor?.name ?? "원장님"}
            style={{
              height: "100%",
              objectFit: "contain",
              objectPosition: "center bottom",
            }}
          />
        )}

        {/* 우상단 피부과 전문의 마크 (작게, 워터마크처럼) */}
        {certDataUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={certDataUrl}
            width={120}
            height={120}
            style={{
              position: "absolute",
              top: 36,
              right: 36,
            }}
            alt="피부과 전문의"
          />
        )}
      </div>
    ),
    size,
  );
}
