"use client";

import { useState } from "react";
import Image from "next/image";
import { getDoctorPhoto, getDoctorTheme } from "@/lib/doctor-theme";

/**
 * 카드 작성자 아바타 — 피드 카드(CardHeader)와 동일한 원장 사진 보정(offset·scale·objectPosition).
 *   원장 글: getDoctorPhoto/getDoctorTheme 로 얼굴 위치 보정(잘림 방지).
 *   회원 글: avatar_url object-cover.
 *   둘 다 없으면 👤.
 */
export default function CardAvatar({
  doctorSlug,
  memberAvatarUrl,
  name,
  size = 36,
}: {
  doctorSlug?: string | null;
  memberAvatarUrl?: string | null;
  name?: string;
  size?: number;
}) {
  const theme = doctorSlug ? getDoctorTheme(doctorSlug) : null;
  const photo = doctorSlug ? getDoctorPhoto(doctorSlug) : null;
  const isDoctor = !!doctorSlug && !!photo;
  const src = isDoctor ? photo : memberAvatarUrl ?? null;
  // OAuth 아바타(카카오 CDN 등)가 403·깨짐이면 기본 아이콘(👤)으로 폴백 — onError 로 감지.
  const [imgError, setImgError] = useState(false);

  // next/image 최적화 적용 여부 판별.
  //  - 원장 사진(isDoctor): /doctors/{slug}.png 로컬 정적 자산 → 항상 최적화.
  //  - 회원 아바타: 두 출처가 섞여 있음.
  //      (a) 자체 업로드 → Supabase Storage 호스트(auth.pibutenten.kr / *.supabase.co)
  //          → remotePatterns 에 등록됨 → 최적화 가능.
  //      (b) OAuth 가입자 → k.kakaocdn.net / pstatic.net / googleusercontent.com 등 임의 외부 CDN
  //          → remotePatterns 미등록 → 최적화 시 이미지 깨짐 → unoptimized 유지(보수적).
  const canOptimize = isDoctor || (!!src && isAllowedOptimizedHost(src));
  const avatarTx = theme?.avatarOffsetX ?? (theme?.offsetX ?? 0) * 0.46;
  const avatarTy = theme?.avatarOffsetY ?? (theme?.offsetY ?? 0) * 0.46;

  return (
    <div
      className="relative shrink-0 overflow-hidden rounded-full"
      style={{
        width: size,
        height: size,
        background: isDoctor ? theme?.bg ?? "var(--bg-soft)" : "var(--bg-soft)",
        boxShadow: isDoctor ? `inset 0 0 0 2px ${theme?.bgSoft ?? "var(--bg-soft)"}` : undefined,
      }}
    >
      {src && !imgError ? (
        <Image
          src={src}
          alt={name ?? ""}
          fill
          sizes={`${size}px`}
          className="object-cover"
          unoptimized={!canOptimize}
          onError={() => setImgError(true)}
          style={
            isDoctor
              ? { objectPosition: "50% 12%", transform: `translate(${avatarTx}px, ${avatarTy}px) scale(1.18)`, transformOrigin: "50% 30%" }
              : { objectPosition: "50% 50%" }
          }
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center text-[var(--text-muted)]" style={{ fontSize: size * 0.5 }}>
          👤
        </div>
      )}
    </div>
  );
}

/**
 * src 가 next/image 최적화 대상(= remotePatterns 에 등록된 Supabase Storage 호스트)인지 판별.
 *
 *  - Supabase Storage public URL: <SUPABASE_HOST>/storage/v1/object/public/...
 *      production = auth.pibutenten.kr (Custom Domain, ADR 0018) / 로컬·preview = <ref>.supabase.co.
 *  - 외부 OAuth 아바타(k.kakaocdn.net / *.pstatic.net / lh3.googleusercontent.com 등)는 remotePatterns
 *    미등록 → false 반환 → 호출부에서 unoptimized 유지(이미지 깨짐 방지).
 *
 * NEXT_PUBLIC_SUPABASE_URL 은 NEXT_PUBLIC_ 접두사라 클라이언트에서도 안전하게 인라인됨.
 */
// 모듈 1회 계산 — 피드 카드 수십 개가 각자 렌더될 때마다 env 재파싱하지 않도록 상수화.
const SUPABASE_HOST =
  process.env.NEXT_PUBLIC_SUPABASE_URL
    ?.replace(/^https?:\/\//, "")
    ?.replace(/\/$/, "") ?? "";

function isAllowedOptimizedHost(src: string): boolean {
  if (!SUPABASE_HOST) return false;
  try {
    const url = new URL(src, "https://placeholder.invalid");
    return (
      url.hostname === SUPABASE_HOST &&
      url.pathname.startsWith("/storage/v1/object/public/")
    );
  } catch {
    return false;
  }
}
