"use client";

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
      {src ? (
        <Image
          src={src}
          alt={name ?? ""}
          fill
          sizes="48px"
          className="object-cover"
          unoptimized={!isDoctor}
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
