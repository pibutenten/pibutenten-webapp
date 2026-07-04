/**
 * 글로벌 토스트 헬퍼 — Phase 7-A (2026-05-16).
 *
 * 화면 가운데 흰 배경 fade 토스트. React 상태 밖에서 동작 (DOM 직접 조작) —
 * 단발 알림이고 페이지 navigation 시 안전하게 사라지도록.
 *
 * 사용:
 *   import { showToast } from "@/lib/toast";
 *   showToast("저장되었어요");
 *   showToast("오류가 발생했어요", { tone: "danger" });
 *
 * 기존 src/components/card/utils/card-toast.ts 는 이 모듈을 thin wrapper 로 재export.
 */

type ToastTone = "default" | "danger";
type ToastOptions = {
  tone?: ToastTone;
  durationMs?: number;
};

// tone 별 기본 지속시간 (R2-3, 2026-07-04): danger 는 의료법 검수 안내 등
// 긴 문구(~80자)가 많아 1.5초로는 읽기 전에 사라짐 → 4.5초. 호출부가 durationMs 를
// 명시하면 그 값이 항상 우선 (기존 계약 불변).
const TONE_DURATION_MS: Record<ToastTone, number> = {
  default: 1500,
  danger: 4500,
};

const TONE_STYLES: Record<ToastTone, { color: string; border: string }> = {
  default: { color: "#1B4965", border: "#E2E8EE" },
  danger: { color: "#B42318", border: "#FECDCA" },
};

export function showToast(msg: string, opts: ToastOptions = {}): void {
  if (typeof document === "undefined") return;
  const tone = opts.tone ?? "default";
  const durationMs = opts.durationMs ?? TONE_DURATION_MS[tone];
  const palette = TONE_STYLES[tone];
  const el = document.createElement("div");
  el.textContent = msg;
  el.setAttribute("role", tone === "danger" ? "alert" : "status");
  el.style.cssText =
    "position:fixed;left:50%;top:50%;transform:translate(-50%,-50%) scale(0.9);" +
    "background:#FFFFFF;color:" + palette.color + ";padding:14px 28px;" +
    "border:1px solid " + palette.border + ";border-radius:9999px;" +
    "font-size:15px;font-weight:700;letter-spacing:-0.2px;z-index:9999;" +
    "box-shadow:0 12px 32px rgba(27,73,101,0.18),0 2px 6px rgba(0,0,0,0.06);" +
    "opacity:0;transition:opacity 0.2s ease,transform 0.2s ease;" +
    "pointer-events:none;max-width:88vw;text-align:center;";
  document.body.appendChild(el);
  requestAnimationFrame(() => {
    el.style.opacity = "1";
    el.style.transform = "translate(-50%,-50%) scale(1)";
  });
  setTimeout(() => {
    el.style.opacity = "0";
    el.style.transform = "translate(-50%,-50%) scale(0.95)";
    setTimeout(() => el.remove(), 220);
  }, durationMs);
}
