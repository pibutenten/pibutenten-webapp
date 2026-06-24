"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

export default function PageTransition() {
  const pathname = usePathname();
  const isFirst = useRef(true);

  useEffect(() => {
    if (isFirst.current) {
      isFirst.current = false;
      return;
    }
    const main = document.querySelector("main") || document.body;
    if (!main.animate) return;
    main.animate(
      [{ opacity: 0.6 }, { opacity: 1 }],
      { duration: 180, easing: "ease-out" }
    );
  }, [pathname]);

  return null;
}
