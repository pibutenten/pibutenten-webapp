/**
 * Card용 가운데 fade 토스트.
 *
 * 의도적으로 React 상태 밖에서 동작 — 단발성 알림이고 페이지 navigation 시
 * unmount race 없이 안전하게 사라지도록 DOM 직접 조작.
 * Phase 4 글로벌 toast 시스템 도입 시 이 함수도 그 위로 이전 예정.
 */
export function showToast(msg: string) {
  if (typeof document === "undefined") return;
  const el = document.createElement("div");
  el.textContent = msg;
  el.style.cssText =
    "position:fixed;left:50%;top:50%;transform:translate(-50%,-50%) scale(0.9);" +
    "background:#FFFFFF;color:#1B4965;padding:14px 28px;" +
    "border:1px solid #E2E8EE;border-radius:9999px;" +
    "font-size:15px;font-weight:700;letter-spacing:-0.2px;z-index:9999;" +
    "box-shadow:0 12px 32px rgba(27,73,101,0.18),0 2px 6px rgba(0,0,0,0.06);" +
    "opacity:0;transition:opacity 0.2s ease,transform 0.2s ease;" +
    "pointer-events:none;";
  document.body.appendChild(el);
  // 다음 프레임에서 페이드 인
  requestAnimationFrame(() => {
    el.style.opacity = "1";
    el.style.transform = "translate(-50%,-50%) scale(1)";
  });
  setTimeout(() => {
    el.style.opacity = "0";
    el.style.transform = "translate(-50%,-50%) scale(0.95)";
    setTimeout(() => el.remove(), 220);
  }, 1500);
}
