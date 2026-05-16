"use client";

import { useCallback, useEffect, useState } from "react";
import Cropper, { type Area } from "react-easy-crop";
import { showToast } from "@/lib/toast";

type Props = {
  /** 원본 이미지 URL (object URL 또는 외부) */
  src: string | null;
  open: boolean;
  onCancel: () => void;
  /** 자른 결과 Blob 반환 (PNG/JPEG 압축됨, 정사각형) */
  onConfirm: (blob: Blob) => void;
  /** 출력 크기 — default 512 (아바타용) */
  outputSize?: number;
};

/**
 * 인스타식 사진 자르기 다이얼로그.
 *  - 드래그로 위치 조정 + 핀치/스크롤로 zoom
 *  - 정사각형 1:1 crop 고정 (아바타용)
 *  - 결과는 canvas로 정확한 정사각형 Blob 생성
 *
 * 사용: 사진 업로드 input → object URL → 본 다이얼로그 → onConfirm(blob) → Supabase 업로드
 */
export default function ImageCropDialog({
  src,
  open,
  onCancel,
  onConfirm,
  outputSize = 512,
}: Props) {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(
    null,
  );
  const [saving, setSaving] = useState(false);

  // 다이얼로그 열릴 때마다 위치·zoom 초기화
  useEffect(() => {
    if (open) {
      setCrop({ x: 0, y: 0 });
      setZoom(1);
      setCroppedAreaPixels(null);
      setSaving(false);
    }
  }, [open, src]);

  // ESC 닫기 + body 스크롤 잠금
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !saving) onCancel();
    }
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, saving, onCancel]);

  const onCropComplete = useCallback(
    (_croppedArea: Area, croppedAreaPx: Area) => {
      setCroppedAreaPixels(croppedAreaPx);
    },
    [],
  );

  async function confirm() {
    if (!src || !croppedAreaPixels || saving) return;
    setSaving(true);
    try {
      const blob = await cropImageToBlob(src, croppedAreaPixels, outputSize);
      onConfirm(blob);
    } catch (e) {
      console.error("[ImageCropDialog]", e);
      showToast("이미지 처리 실패 — 다른 이미지로 시도해주세요.", { tone: "danger" });
      setSaving(false);
    }
  }

  if (!open || !src) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="사진 자르기"
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
    >
      <div className="absolute inset-0 bg-black/60" aria-hidden />
      <div className="relative flex h-full max-h-[90vh] w-full max-w-[480px] flex-col overflow-hidden rounded-[var(--radius)] bg-white shadow-[var(--shadow-lg)]">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={saving}
            className="text-[14px] text-[var(--text-secondary)] hover:text-[var(--text)] disabled:opacity-50"
          >
            취소
          </button>
          <h2 className="text-[15px] font-semibold text-[var(--text)]">
            사진 자르기
          </h2>
          <button
            type="button"
            onClick={confirm}
            disabled={saving || !croppedAreaPixels}
            className="text-[14px] font-semibold text-[var(--primary)] hover:text-[var(--primary-dark)] disabled:opacity-50"
          >
            {saving ? "처리 중…" : "완료"}
          </button>
        </div>

        {/* Cropper 영역 */}
        <div className="relative flex-1 bg-black">
          <Cropper
            image={src}
            crop={crop}
            zoom={zoom}
            aspect={1}
            cropShape="round"
            showGrid={false}
            onCropChange={setCrop}
            onZoomChange={setZoom}
            onCropComplete={onCropComplete}
          />
        </div>

        {/* Zoom slider */}
        <div className="border-t border-[var(--border)] bg-white px-4 py-3">
          <label className="block text-[12px] font-medium text-[var(--text-secondary)]">
            확대
          </label>
          <input
            type="range"
            min={1}
            max={3}
            step={0.01}
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
            disabled={saving}
            className="mt-1.5 w-full accent-[var(--primary)]"
          />
          <p className="mt-1 text-[11px] text-[var(--text-muted)]">
            드래그로 위치 조정 · 슬라이더 또는 핀치로 확대/축소
          </p>
        </div>
      </div>
    </div>
  );
}

/**
 * 원본 이미지 + crop 영역(px) → 정사각형 Blob 생성.
 * outputSize × outputSize PNG (alpha 지원). JPEG보다 약간 무겁지만 사진은 충분.
 */
async function cropImageToBlob(
  src: string,
  area: Area,
  outputSize: number,
): Promise<Blob> {
  const img = await loadImage(src);
  const canvas = document.createElement("canvas");
  canvas.width = outputSize;
  canvas.height = outputSize;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas context unavailable");
  // crop area (source rect) → 0,0,outputSize,outputSize (dest rect)
  ctx.drawImage(
    img,
    area.x,
    area.y,
    area.width,
    area.height,
    0,
    0,
    outputSize,
    outputSize,
  );
  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error("toBlob failed"));
      },
      "image/jpeg",
      0.9,
    );
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    // 외부 URL일 경우 CORS 필요 — object URL은 안전
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = (e) => reject(e);
    img.src = src;
  });
}
