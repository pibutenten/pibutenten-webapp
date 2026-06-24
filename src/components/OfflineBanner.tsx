"use client";

import { useEffect, useState } from "react";

export default function OfflineBanner() {
  const [offline, setOffline] = useState(false);
  const [hiding, setHiding] = useState(false);

  useEffect(() => {
    const goOffline = () => setOffline(true);
    const goOnline = () => {
      setHiding(true);
      setTimeout(() => {
        setOffline(false);
        setHiding(false);
      }, 2000);
    };

    if (!navigator.onLine) setOffline(true);

    window.addEventListener("offline", goOffline);
    window.addEventListener("online", goOnline);
    return () => {
      window.removeEventListener("offline", goOffline);
      window.removeEventListener("online", goOnline);
    };
  }, []);

  if (!offline) return null;

  return (
    <div
      className={`fixed top-0 inset-x-0 z-[9999] flex items-center justify-center px-4 py-2 bg-amber-500 text-white text-sm font-medium transition-all duration-500 ${
        hiding ? "opacity-0 -translate-y-full" : "opacity-100 translate-y-0"
      }`}
    >
      네트워크 연결이 불안정합니다
    </div>
  );
}
