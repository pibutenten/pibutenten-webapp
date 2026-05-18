"use client";

/**
 * ExternalLinkField — 외부 링크 URL 입력 + 메타 미리보기/채우기.
 *
 * Phase 1 추출 (260518): 기존 WriteClient.tsx 의 external-link 섹션을 분리.
 *
 * 모드 (mode prop):
 *   - "link"  : "새소식" 카테고리. [채우기] 버튼으로 제목·본문·태그 자동 추출
 *               → onAutoFill 콜백으로 부모에게 데이터 전달
 *   - "qa"    : Q&A 카테고리 영상 URL. [미리보기] 버튼으로 메타만 가져옴 (본문 안 덮음)
 *   - "url-only" : 단순 URL 입력만 (수정 모드 — 채우기/미리보기 버튼 없음)
 *
 * 부수효과: POST /api/preview-link (OG/oEmbed 메타 프록시)
 */
import { useState } from "react";

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
  /** "link" = 채우기, "qa" = 미리보기, "url-only" = 버튼 없이 URL 입력만 */
  mode: "link" | "qa" | "url-only";
  /**
   * mode="link" 에서 [채우기] 성공 시 호출. 부모가 title/body/keywords 세팅.
   * - title : meta.title
   * - body  : (meta.description) + (출처: siteName) — 본문 한도(`bodyMax`) 안에 맞춰 trim
   * - keywords: 자동 추출 결과 (3~7개)
   */
  onAutoFill?: (data: {
    title: string;
    body: string;
    keywords: string[];
  }) => void;
  /** mode="link" 에서 본문 한도 (기본 400 — 새소식 정책). */
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
  bodyMax = 400,
  onError,
  disabled = false,
}: Props) {
  const [filling, setFilling] = useState(false);

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

  /** Q&A 모드: 메타만 가져와서 미리보기 표시 (본문 안 덮음) */
  async function previewVideoMeta() {
    onError?.(null);
    onMetaChange(null);
    setFilling(true);
    try {
      const m = await fetchMeta();
      if (m) onMetaChange(m);
    } catch (e) {
      onError?.(e instanceof Error ? e.message : "영상 미리보기 실패");
    } finally {
      setFilling(false);
    }
  }

  /** link 모드: 메타 가져와서 제목/본문/태그 자동 채움 */
  async function fillFromUrl() {
    onError?.(null);
    onMetaChange(null);
    setFilling(true);
    try {
      const m = await fetchMeta();
      if (!m) return;
      onMetaChange(m);
      if (!onAutoFill) return;

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
      // 키워드 자동 추출
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
        /* 키워드 추출 실패는 무시 — 사용자가 직접 입력 가능 */
      }

      onAutoFill({ title, body, keywords });
    } catch (e) {
      onError?.(e instanceof Error ? e.message : "링크 정보 가져오기 실패");
    } finally {
      setFilling(false);
    }
  }

  const label =
    mode === "qa"
      ? "영상 URL"
      : mode === "link"
        ? "외부 링크"
        : "외부 링크";
  const hint =
    mode === "qa"
      ? "선택 — 카드에 [영상 보러가기] 버튼 노출 (시간 포함 URL: ?t=120 또는 t=2m30s)"
      : mode === "link"
        ? "URL 입력 후 [채우기] 누르면 제목·본문·태그 자동 채움"
        : "선택";

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
          onChange={(e) => onUrlChange(e.target.value)}
          placeholder="https://..."
          className="h-9 min-w-0 flex-1 rounded-[var(--radius-sm)] border border-[var(--border)] bg-white px-3 text-sm focus:border-[var(--primary-light)] focus:outline-none disabled:opacity-50"
        />
        {mode === "link" && (
          <button
            type="button"
            onClick={fillFromUrl}
            disabled={filling || !url.trim() || disabled}
            className="h-9 shrink-0 rounded-[var(--radius-sm)] border border-[var(--primary-light)] bg-[var(--primary-light)] px-3 text-sm font-semibold text-white hover:bg-[var(--primary-light-hover)] disabled:cursor-not-allowed disabled:border-[var(--border)] disabled:bg-[var(--border)]"
          >
            {filling ? "가져오는 중…" : "채우기"}
          </button>
        )}
        {mode === "qa" && (
          <button
            type="button"
            onClick={previewVideoMeta}
            disabled={filling || !url.trim() || disabled}
            className="h-9 shrink-0 rounded-[var(--radius-sm)] border border-[var(--border)] bg-white px-3 text-sm font-semibold text-[var(--text)] hover:border-[var(--primary-light)] hover:text-[var(--primary-light)] disabled:cursor-not-allowed disabled:opacity-50"
            title="영상 제목·썸네일 미리보기 (본문은 안 덮어씌움)"
          >
            {filling ? "확인 중…" : "미리보기"}
          </button>
        )}
      </div>
      {meta?.title && (
        <p className="mt-1.5 text-[11.5px] text-[var(--text-muted)]">
          <span className="font-semibold">{meta.siteName ?? "외부 링크"}</span>
          <span className="mx-1.5">·</span>
          {meta.title}
        </p>
      )}
    </div>
  );
}
