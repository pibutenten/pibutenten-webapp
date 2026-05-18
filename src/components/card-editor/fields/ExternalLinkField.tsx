"use client";

/**
 * ExternalLinkField — URL 입력 + 메타 등록 + 미리보기 (260518).
 *
 * 모드 (mode prop):
 *   - "link"  : "새소식" 카테고리. [등록] 시 onAutoFill 콜백으로 제목·본문·태그 자동 채움
 *   - "qa"    : Q&A 카테고리. 메타만 가져오고 본문은 안 덮음
 *   - "url-only" : 단순 URL 입력만 (현재 사용처 없음, legacy)
 *
 * UI 흐름 (참고문헌과 동일 패턴, 260518 재설계):
 *   1) URL 미입력 / 메타 없음 → [등록] 버튼. 클릭 시 POST /api/preview-link 호출해
 *      메타(title/description/image/siteName) 받음. mode='link' 면 자동 채움 콜백도 호출.
 *   2) 메타 등록 후 → [미리보기] 버튼. 클릭 시 URL 새 탭으로 이동 (영상이면 시작시간 포함).
 *      메타 한 줄 표시. X 버튼으로 메타 지우면 다시 [등록] 모드.
 *
 * 부수효과: POST /api/preview-link
 */
import { useMemo, useState } from "react";
import {
  extractStartSeconds,
  formatMMSS,
  parseMMSS,
  setStartSecondsOnUrl,
} from "@/lib/youtube-start-time";

export type ExternalMeta = {
  title?: string;
  description?: string;
  image?: string | null;
  siteName?: string;
};

type Props = {
  url: string;
  onUrlChange: (next: string) => void;
  meta: ExternalMeta | null;
  onMetaChange: (next: ExternalMeta | null) => void;
  /** "link" / "qa" / "url-only" */
  mode: "link" | "qa" | "url-only";
  /**
   * mode="link" 에서 [등록] 성공 시 호출. 부모가 title/body/keywords 세팅.
   * (수정 모드에서는 부모가 콜백 미지정 → 본문 안 덮음)
   */
  onAutoFill?: (data: {
    title: string;
    body: string;
    keywords: string[];
  }) => void;
  /** mode="link" 에서 본문 한도 (기본 800). */
  bodyMax?: number;
  onError?: (msg: string | null) => void;
  disabled?: boolean;
};

const AUTO_TAG_MIN = 3;
const AUTO_TAG_MAX = 7;

export default function ExternalLinkField({
  url,
  onUrlChange,
  meta,
  onMetaChange,
  mode,
  onAutoFill,
  bodyMax = 800,
  onError,
  disabled = false,
}: Props) {
  const [resolving, setResolving] = useState(false);

  // 등록 판정 — 메타가 있고 title 이라도 있으면 등록 상태로 간주.
  const isRegistered = !!meta && (!!meta.title || !!meta.siteName);

  async function fetchMeta(): Promise<ExternalMeta | null> {
    const u = url.trim();
    if (!u) return null;
    const r = await fetch("/api/preview-link", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: u }),
    });
    const raw = await r.text();
    let data: (ExternalMeta & { error?: string }) | null = null;
    try {
      data = raw ? JSON.parse(raw) : null;
    } catch {
      onError?.(`링크 정보를 가져오지 못했어요 (${r.status}).`);
      return null;
    }
    if (!r.ok) {
      onError?.(data?.error ?? `링크 정보를 가져오지 못했어요 (${r.status}).`);
      return null;
    }
    return {
      title: data?.title,
      description: data?.description,
      image: data?.image ?? null,
      siteName: data?.siteName,
    };
  }

  /** [등록] 버튼 — 메타 가져오기. mode='link' 면 자동 채움 콜백도 호출. */
  async function registerMeta() {
    onError?.(null);
    setResolving(true);
    try {
      const m = await fetchMeta();
      if (!m) return;
      onMetaChange(m);

      // mode='link' + onAutoFill 지정됐을 때만 제목/본문/태그 자동 채움.
      if (mode === "link" && onAutoFill) {
        const title = m.title ?? "";
        let body = "";
        if (m.description) {
          const sourceTag = m.siteName ? `\n\n(출처 = ${m.siteName})` : "";
          const limit = bodyMax - sourceTag.length;
          const desc =
            m.description.length > limit
              ? m.description.slice(0, limit).replace(/\s+\S*$/, "") + "…"
              : m.description;
          body = desc + sourceTag;
        }
        let keywords: string[] = [];
        try {
          const { extractTagsFromText } = await import("@/lib/auto-tag");
          const haystack = [m.title, m.description]
            .filter((s): s is string => Boolean(s))
            .join("\n");
          const auto = extractTagsFromText(haystack, { limit: AUTO_TAG_MAX });
          keywords = auto.slice(
            0,
            Math.max(AUTO_TAG_MIN, Math.min(auto.length, AUTO_TAG_MAX)),
          );
        } catch {
          /* 키워드 추출 실패는 무시 */
        }
        onAutoFill({ title, body, keywords });
      }
    } catch (e) {
      onError?.(e instanceof Error ? e.message : "URL 정보 가져오기 실패");
    } finally {
      setResolving(false);
    }
  }

  /** [미리보기] 버튼 — 등록된 URL 새 탭으로 이동. */
  function openPreview() {
    const u = url.trim();
    if (!u) return;
    if (typeof window !== "undefined") {
      window.open(u, "_blank", "noopener,noreferrer");
    }
  }

  /** 메타 지움 → [등록] 모드로 복귀. */
  function clearMeta() {
    onMetaChange(null);
  }

  const label = "URL 입력";
  const hint =
    mode === "qa"
      ? "선택 — [등록] 으로 영상 정보 가져옴. [미리보기] 누르면 영상 새 탭 (시작시간 포함)"
      : mode === "link"
        ? "URL 입력 후 [등록] 누르면 제목·본문·태그 자동 채움. [미리보기] 로 원문 새 탭"
        : "선택";

  // 영상 시작 시간 — Q&A 모드에서만 노출. URL ↔ MM:SS 양방향 sync.
  const currentStartSec = useMemo(() => extractStartSeconds(url), [url]);
  const [startInput, setStartInput] = useState(() =>
    currentStartSec > 0 ? formatMMSS(currentStartSec) : "",
  );

  function applyStartInput(next: string) {
    setStartInput(next);
    const sec = parseMMSS(next);
    const updated = setStartSecondsOnUrl(url, sec);
    if (updated !== url) onUrlChange(updated);
  }

  return (
    <div>
      <label className="mb-1 block text-sm font-semibold text-[var(--text)]">
        {label}{" "}
        <span className="text-xs font-normal text-[var(--text-muted)]">
          {hint}
        </span>
      </label>
      <div className="flex min-w-0 gap-2">
        <input
          type="url"
          value={url}
          disabled={disabled}
          onChange={(e) => {
            onUrlChange(e.target.value);
            // URL 직접 수정하면 기존 등록 메타는 무효 — 자동으로 등록 모드 복귀.
            if (meta) onMetaChange(null);
          }}
          placeholder="https://..."
          className="h-9 min-w-0 flex-1 rounded-[var(--radius-sm)] border border-[var(--border)] bg-white px-3 text-sm focus:border-[var(--primary-light)] focus:outline-none disabled:opacity-50"
        />
        {mode !== "url-only" && (
          isRegistered ? (
            // 등록됨 → [미리보기] 새 탭으로 이동
            <button
              type="button"
              onClick={openPreview}
              disabled={!url.trim() || disabled}
              className="h-9 shrink-0 rounded-[var(--radius-sm)] border border-[var(--border)] bg-white px-3 text-sm font-semibold text-[var(--text)] hover:border-[var(--primary-light)] hover:text-[var(--primary-light)] disabled:cursor-not-allowed disabled:opacity-50"
              title="등록된 URL 을 새 탭으로 열기 (영상이면 시작시간 포함)"
            >
              미리보기
            </button>
          ) : (
            // 등록 전 → [등록] 클릭 시 메타 가져옴
            <button
              type="button"
              onClick={registerMeta}
              disabled={resolving || !url.trim() || disabled}
              className="h-9 shrink-0 rounded-[var(--radius-sm)] border border-[var(--primary)] bg-[var(--primary)] px-3 text-xs font-semibold text-white hover:bg-[var(--primary-dark)] disabled:cursor-not-allowed disabled:opacity-50"
              title="URL 의 제목·썸네일 등 메타 정보 가져오기"
            >
              {resolving ? "가져오는 중…" : "등록"}
            </button>
          )
        )}
      </div>

      {/* Q&A 모드 — 시작시간 (MM:SS) 입력. URL ↔ 시간 양방향. */}
      {mode === "qa" && url.trim() && (
        <div className="mt-2 flex items-center gap-2">
          <label className="text-xs text-[var(--text-muted)]">
            시작 시간
          </label>
          <input
            type="text"
            inputMode="numeric"
            value={startInput}
            disabled={disabled}
            onChange={(e) => applyStartInput(e.target.value)}
            onBlur={() => {
              const sec = parseMMSS(startInput);
              setStartInput(sec > 0 ? formatMMSS(sec) : "");
            }}
            placeholder="00:00"
            className="h-8 w-24 rounded-[var(--radius-sm)] border border-[var(--border)] bg-white px-2 text-center text-sm tabular-nums focus:border-[var(--primary-light)] focus:outline-none disabled:opacity-50"
            aria-label="영상 시작 시간 (MM:SS)"
          />
          <span className="text-[11px] text-[var(--text-muted)]">
            (예: 02:30 = 2분 30초부터 재생)
          </span>
        </div>
      )}

      {/* 등록된 메타 한 줄 + X (메타 지움). */}
      {isRegistered && (
        <div className="mt-1.5 flex items-start gap-2 text-[11.5px] text-[var(--text-muted)]">
          <p className="min-w-0 flex-1">
            <span className="font-semibold">
              {meta?.siteName ?? "URL"}
            </span>
            <span className="mx-1.5">·</span>
            {meta?.title}
          </p>
          <button
            type="button"
            onClick={clearMeta}
            disabled={disabled}
            aria-label="등록된 URL 정보 지우기"
            title="URL 정보 지우기 (다시 등록 가능)"
            className="shrink-0 rounded-full px-1.5 text-[13px] font-bold text-[var(--text-muted)] hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
          >
            ×
          </button>
        </div>
      )}
    </div>
  );
}
