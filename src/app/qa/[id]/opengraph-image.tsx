import { ImageResponse } from "next/og";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getDoctorTheme } from "@/lib/doctor-theme";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "피부텐텐";

type Props = { params: { id: string } };

const BASE_URL = "https://pibutenten-webapp.vercel.app";

/**
 * 단일 Q&A 페이지 OG 이미지 — 원장 사진을 메인으로, 우상단 피부과 전문의 마크.
 * 사진/마크는 모두 absolute URL로 fetch (Vercel 런타임에서 fs 경로 불안정)
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
        {/* 원장 사진 — height 100%로 세로 가득, 가운데 */}
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

        {/* 우상단 피부과 전문의 마크 — div로 직접 그리기 (한글 폰트 satori 호환 위해) */}
        <div
          style={{
            position: "absolute",
            top: 32,
            right: 32,
            width: 130,
            height: 130,
            background: "#D8332C",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            color: "#FFFFFF",
            fontWeight: 900,
            fontSize: 28,
            lineHeight: 1.05,
            letterSpacing: "-2px",
            borderRadius: 4,
          }}
        >
          <div>피부과</div>
          <div>전문의</div>
        </div>
      </div>
    ),
    {
      ...size,
      // 한글 렌더링용 — Noto Sans KR Black (Google Fonts)
      fonts: await loadKoreanFont(),
    },
  );
}

/**
 * Noto Sans KR Black weight를 Google Fonts에서 fetch.
 * ImageResponse가 한글을 정확히 렌더링하려면 폰트 옵션 필수.
 */
async function loadKoreanFont() {
  try {
    // Google Fonts CSS API → ttf woff URL 추출
    const cssUrl =
      "https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@900&display=swap";
    const css = await fetch(cssUrl, {
      headers: {
        // ttf로 받아오기 위해 옛날 user-agent
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
    }).then((r) => r.text());
    const m = css.match(/src:\s*url\(([^)]+)\)\s*format\('(?:truetype|woff2?)'\)/);
    const fontUrl = m?.[1];
    if (!fontUrl) return undefined;
    const fontData = await fetch(fontUrl).then((r) => r.arrayBuffer());
    return [
      {
        name: "Noto Sans KR",
        data: fontData,
        weight: 900 as const,
        style: "normal" as const,
      },
    ];
  } catch {
    return undefined;
  }
}
