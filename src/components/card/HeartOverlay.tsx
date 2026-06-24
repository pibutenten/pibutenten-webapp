"use client";

import { useEffect, useState } from "react";

export default function HeartOverlay({ onDone }: { onDone: () => void }) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const t = setTimeout(() => { setVisible(false); onDone(); }, 800);
    return () => clearTimeout(t);
  }, [onDone]);

  if (!visible) return null;

  return (
    <div className="pointer-events-none absolute inset-0 flex items-center justify-center z-10">
      <svg
        viewBox="0 0 24 24"
        fill="var(--primary)"
        className="w-16 h-16"
        style={{ animation: "heartPop 800ms ease-out forwards" }}
      >
        <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
      </svg>
    </div>
  );
}
