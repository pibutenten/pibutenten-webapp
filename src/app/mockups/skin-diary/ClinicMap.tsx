"use client";

import { useEffect, useState } from "react";
import { MapContainer, TileLayer, Marker, Tooltip, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

/**
 * 시술일기 병원 위치 지도 — OpenStreetMap(Leaflet).
 * - 외부 키/카드 불필요. 우리 clinics 좌표(위도 y / 경도 x)만으로 핀 표시.
 * - 기본 Leaflet 마커 아이콘은 번들러에서 깨지므로 커스텀 SVG divIcon 사용.
 * - SSR 비호환(window 의존) → 부모에서 next/dynamic ssr:false 로 로드.
 */

export type MapPin = { lat: number; lng: number; label: string; active?: boolean };

const PIN_COLOR = "#4CBFF2";
const PIN_ACTIVE = "#1B87C9";

function pinIcon(active: boolean): L.DivIcon {
  const c = active ? PIN_ACTIVE : PIN_COLOR;
  const size = active ? 34 : 28;
  return L.divIcon({
    className: "",
    html: `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="${c}" stroke="#fff" stroke-width="1.5" style="filter:drop-shadow(0 2px 3px rgba(0,0,0,.35))"><path d="M12 22s-7-6-7-12a7 7 0 0 1 14 0c0 6-7 12-7 12z"/><circle cx="12" cy="10" r="2.6" fill="#fff" stroke="none"/></svg>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size],
    popupAnchor: [0, -size + 4],
  });
}

/** center/zoom 이 바뀌면 부드럽게 이동 (선택 병원 변경 시). */
function Recenter({ lat, lng, zoom }: { lat: number; lng: number; zoom: number }) {
  const map = useMap();
  useEffect(() => {
    map.setView([lat, lng], zoom, { animate: true });
  }, [lat, lng, zoom, map]);
  return null;
}

/** 전체화면 토글 등 컨테이너 크기 변경 시 타일 재계산. */
function InvalidateOnResize({ dep }: { dep: unknown }) {
  const map = useMap();
  useEffect(() => {
    const t = setTimeout(() => map.invalidateSize(), 80);
    return () => clearTimeout(t);
  }, [dep, map]);
  return null;
}

export default function ClinicMap({
  center,
  pins,
  zoom = 14,
  height = 200,
  onPick,
  onLocate,
}: {
  center: { lat: number; lng: number };
  pins: MapPin[];
  zoom?: number;
  height?: number;
  onPick?: (label: string) => void;
  onLocate?: () => void;
}) {
  const [full, setFull] = useState(false);
  return (
    <div
      className={full ? "fixed inset-0 z-[1000] bg-white p-3" : "relative overflow-hidden rounded-md"}
      style={full ? undefined : { height }}
    >
      {/* 병원 이름 라벨(상시 tooltip) — 작고 깔끔하게. */}
      <style>{`
        .leaflet-tooltip.clinic-tip{background:#fff;border:1px solid #E5E3DD;border-radius:6px;padding:1px 6px;font-size:11px;font-weight:600;color:#383F47;box-shadow:0 1px 3px rgba(0,0,0,.2);white-space:nowrap}
        .leaflet-tooltip.clinic-tip::before{display:none}
      `}</style>
      <button
        type="button"
        onClick={() => setFull((f) => !f)}
        className="absolute right-2 top-2 z-[1001] rounded-md bg-white/95 px-2.5 py-1.5 text-[12px] font-semibold text-[var(--text-secondary)] shadow-[0_2px_6px_rgba(0,0,0,0.2)]"
      >
        {full ? "닫기 ✕" : "전체화면 ⤢"}
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
      <MapContainer
        center={[center.lat, center.lng]}
        zoom={zoom}
        scrollWheelZoom
        style={{ height: "100%", width: "100%" }}
      >
        <InvalidateOnResize dep={full} />
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <Recenter lat={center.lat} lng={center.lng} zoom={zoom} />
        {pins.map((p, i) => (
          <Marker
            key={`${p.label}-${i}`}
            position={[p.lat, p.lng]}
            icon={pinIcon(!!p.active)}
            eventHandlers={onPick ? { click: () => onPick(p.label) } : undefined}
          >
            {/* 클릭 안 해도 병원 이름이 보이도록 상시 라벨(permanent tooltip). */}
            <Tooltip permanent direction="top" offset={[0, -(p.active ? 34 : 28) + 4]} className="clinic-tip">
              {p.label}
            </Tooltip>
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
}
