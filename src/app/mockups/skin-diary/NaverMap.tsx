"use client";

import { useEffect, useRef, useState } from "react";
import type { MapPin } from "./ClinicMap";
import { loadNaverMaps } from "./naver-maps";

/**
 * 시술일기 병원 위치 지도 — 네이버 클라우드(NCP) Web Dynamic Map.
 * - NEXT_PUBLIC_NAVER_MAP_CLIENT_ID(공개 Client ID)로 maps.js 로드.
 * - clinics 좌표(위도 lat / 경도 lng)로 커스텀 핀 + 병원 이름 라벨 표시.
 * - 휠 줌, 전체화면 토글 지원. SSR 비호환 → 부모에서 ssr:false 로 로드.
 */

declare global {
  interface Window {
    naver?: typeof naver;
    navermap_authFailure?: () => void;
  }
}
// 네이버 maps 전역 타입은 SDK 가 런타임 주입 → any 로 최소 처리.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare const naver: any;

const esc = (s: string) =>
  s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string));

function markerContent(p: MapPin): string {
  const size = p.active ? 34 : 28;
  const c = p.active ? "#1B87C9" : "#4CBFF2";
  return `<div style="position:relative;transform:translate(-50%,-100%);display:flex;flex-direction:column;align-items:center;line-height:1">
    <span style="background:#fff;border:1px solid #E5E3DD;border-radius:6px;padding:1px 6px;font-size:11px;font-weight:600;color:#383F47;box-shadow:0 1px 3px rgba(0,0,0,.2);white-space:nowrap;margin-bottom:2px">${esc(p.label)}</span>
    <svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="${c}" stroke="#fff" stroke-width="1.5" style="filter:drop-shadow(0 2px 3px rgba(0,0,0,.35))"><path d="M12 22s-7-6-7-12a7 7 0 0 1 14 0c0 6-7 12-7 12z"/><circle cx="12" cy="10" r="2.6" fill="#fff" stroke="none"/></svg>
  </div>`;
}

export default function NaverMap({
  center,
  pins,
  zoom = 14,
  height = 200,
  onPick,
  onLocate,
  onRequery,
}: {
  center: { lat: number; lng: number };
  pins: MapPin[];
  zoom?: number;
  height?: number;
  onPick?: (label: string) => void;
  onLocate?: () => void;
  onRequery?: (center: { lat: number; lng: number }) => void;
}) {
  const elRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const markersRef = useRef<any[]>([]);
  const [err, setErr] = useState(false);
  const [full, setFull] = useState(false);
  const [moved, setMoved] = useState(false); // 사용자가 지도를 끌었는지 → '이 지역 재검색' 노출
  // 최신 콜백을 ref 로 보관(리스너 재등록 없이 호출).
  const onPickRef = useRef(onPick); onPickRef.current = onPick;

  // 지도 생성(1회) + 마커 갱신(pins). center/zoom 은 아래 별도 effect 에서만 반영 → 사용자 패닝 유지.
  useEffect(() => {
    let cancelled = false;
    window.navermap_authFailure = () => setErr(true);
    loadNaverMaps()
      .then(() => {
        if (cancelled || !elRef.current || !window.naver?.maps) {
          if (!window.naver?.maps) setErr(true);
          return;
        }
        if (!mapRef.current) {
          mapRef.current = new naver.maps.Map(elRef.current, {
            center: new naver.maps.LatLng(center.lat, center.lng),
            zoom,
            scrollWheel: true,
          });
          // 사용자가 지도를 끌면 '이 지역 재검색' 노출(프로그램 이동은 dragend 미발생).
          naver.maps.Event.addListener(mapRef.current, "dragend", () => setMoved(true));
        }
        markersRef.current.forEach((m) => m.setMap(null));
        markersRef.current = pins.map((p) => {
          const mk = new naver.maps.Marker({
            position: new naver.maps.LatLng(p.lat, p.lng),
            map: mapRef.current,
            icon: { content: markerContent(p) },
          });
          naver.maps.Event.addListener(mk, "click", () => onPickRef.current?.(p.label));
          return mk;
        });
      })
      .catch(() => setErr(true));
    return () => {
      cancelled = true;
    };
    // center/zoom/onPick 제외 — 패닝 유지·리스너 안정.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pins]);

  // center/zoom prop 변경(명시적 이동)에만 지도 이동 + '재검색' 버튼 숨김.
  useEffect(() => {
    if (mapRef.current && window.naver?.maps) {
      mapRef.current.setCenter(new naver.maps.LatLng(center.lat, center.lng));
      mapRef.current.setZoom(zoom);
    }
    setMoved(false);
  }, [center.lat, center.lng, zoom]);

  // 전체화면 전환 시 지도 크기 재계산 + 중심 복원.
  useEffect(() => {
    if (!mapRef.current || !window.naver?.maps) return;
    const t = setTimeout(() => {
      naver.maps.Event.trigger(mapRef.current, "resize");
      mapRef.current.setCenter(new naver.maps.LatLng(center.lat, center.lng));
    }, 80);
    return () => clearTimeout(t);
  }, [full, center.lat, center.lng]);

  if (err) {
    return (
      <div
        className="flex items-center justify-center rounded-md bg-[var(--bg-soft)] px-3 text-center text-[12px] text-[var(--text-muted)]"
        style={{ height }}
      >
        지도를 불러오지 못했어요. (네이버 지도 키·도메인 설정 확인 필요)
      </div>
    );
  }

  return (
    <div
      className={full ? "fixed inset-0 z-[1000] bg-white p-3" : "relative overflow-hidden rounded-md"}
      style={full ? undefined : { height }}
    >
      <div ref={elRef} className="h-full w-full overflow-hidden rounded-md" style={full ? { height: "100%" } : { height }} />
      {moved && onRequery && (
        <button
          type="button"
          onClick={() => { const c = mapRef.current?.getCenter(); if (c) onRequery({ lat: c.lat(), lng: c.lng() }); setMoved(false); }}
          className="absolute left-1/2 top-2 z-[1001] flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-[var(--primary)] px-4 py-2 text-[12.5px] font-semibold text-white shadow-[0_2px_8px_rgba(0,0,0,0.3)]"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4"><path d="M21 12a9 9 0 1 1-3-6.7L21 7" /><path d="M21 3v4h-4" /></svg>
          이 지역 재검색
        </button>
      )}
      <button
        type="button"
        onClick={() => setFull((f) => !f)}
        aria-label={full ? "전체화면 닫기" : "전체화면"}
        title={full ? "전체화면 닫기" : "전체화면"}
        className="absolute right-2 top-2 z-[1001] flex h-9 w-9 items-center justify-center rounded-md bg-white/95 text-[var(--text-secondary)] shadow-[0_2px_6px_rgba(0,0,0,0.2)]"
      >
        {full ? (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-[18px] w-[18px]"><polyline points="4 14 10 14 10 20" /><polyline points="20 10 14 10 14 4" /><line x1="14" y1="10" x2="21" y2="3" /><line x1="3" y1="21" x2="10" y2="14" /></svg>
        ) : (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-[18px] w-[18px]"><polyline points="15 3 21 3 21 9" /><polyline points="9 21 3 21 3 15" /><line x1="21" y1="3" x2="14" y2="10" /><line x1="3" y1="21" x2="10" y2="14" /></svg>
        )}
      </button>
      {onLocate && (
        <button
          type="button"
          onClick={onLocate}
          aria-label="내 위치로 이동"
          title="내 위치"
          className="absolute bottom-3 right-3 z-[1001] flex h-10 w-10 items-center justify-center rounded-full bg-white shadow-[0_2px_8px_rgba(0,0,0,0.25)]"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="var(--primary-active)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
            <circle cx="12" cy="12" r="3.5" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
          </svg>
        </button>
      )}
    </div>
  );
}
