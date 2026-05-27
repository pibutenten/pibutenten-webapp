"use client";

/**
 * PubmedRefsField — 참고문헌(PubMed) 멀티 입력 필드.
 *
 * Phase 1 추출 (260518): 기존 WriteClient.tsx 의 references 섹션을 그대로 분리.
 * EditClient(/write/[shortcode]) 에서도 재사용 위해 자기충족 컴포넌트로 만듦.
 *
 * 동작 사양 (변경 없음):
 *   - value[idx] === ""         → 입력 모드 (input + 등록 버튼)
 *   - value[idx] !== ""         → 칩 모드 ("Title — Authors, Journal (Year)" 형식)
 *   - 칩 모드의 × → 그 행을 빈 입력으로 되돌림 (배열에서 제거 X)
 *   - "+ 참고문헌 추가" 버튼으로 새 행 추가
 *   - Enter 키 = [등록] 버튼 (IME 조합 중 무시)
 *   - PubMed URL 또는 PMID 숫자 입력 가능
 *   - 등록 판정은 " — " 구분자 포함 시 (pubmedRefObjToString 결과는 항상 포함)
 *
 * Critical-4 (2026-05-27): admin/draft/pubmed-by-pmid 가 이제 SSOT (PubmedRefObj)
 * 형식으로 응답 — 본 컴포넌트는 그대로 사용. 옛 PubmedCandidate (year:string) + 별도
 * formatPubmedRef 함수 폐기, pubmedRefObjToString 단일 출처로 통합.
 *
 * 부수효과: POST /api/admin/draft/pubmed-by-pmid (PubMed efetch 프록시)
 */
import { useState } from "react";
import type { PubmedRefObj as ImportedPubmedRefObj } from "@/lib/schema/api/articles";

type Props = {
  /** 참고문헌 배열 (빈 행은 입력 모드, 비어있지 않으면 등록 상태로 간주) */
  value: string[];
  /**
   * value 와 길이가 같은 metadata 배열 — PMID/DOI/URL 등.
   * 있으면 등록된 chip 이 클릭 가능 (PubMed 페이지 새 탭으로 이동).
   * 260518 Phase 2.5: 클릭 가능 ref 위해 도입.
   */
  meta?: (PubmedRefObj | null)[];
  /**
   * value 와 meta 를 함께 변경. 길이 sync 책임은 컴포넌트 안에서 처리.
   * (이전: onChange(next: string[]) → 호환 위해 인자 2개로 확장)
   */
  onChange: (next: string[], nextMeta: (PubmedRefObj | null)[]) => void;
  /** 에러 메시지 부모로 전파 (에러 영역은 부모가 그림) */
  onError?: (msg: string | null) => void;
  /** 전체 입력 비활성 (저장 진행 중 등) */
  disabled?: boolean;
};

/** PubMed URL 또는 PMID 문자열에서 PMID(숫자) 만 추출. 매치 실패 시 null. */
function extractPmid(input: string): string | null {
  const trimmed = (input || "").trim();
  if (!trimmed) return null;
  // PubMed URL — pubmed.ncbi.nlm.nih.gov/12345678
  const urlMatch = trimmed.match(/pubmed\.ncbi\.nlm\.nih\.gov\/(\d{1,9})/i);
  if (urlMatch) return urlMatch[1];
  // 순수 숫자 (또는 "PMID: 12345678" 형식)
  const numMatch = trimmed.match(/(?:^|PMID[:\s]*)(\d{1,9})/i);
  if (numMatch) return numMatch[1];
  return null;
}

/** HTML numeric entity decode — 옛 DB 데이터(`Ta&#xef;eb` 등) 표시 시점 복원.
 *  2026-05-22 추가. 신규 fetch 는 pubmed.ts stripTags 가 이미 decode. */
function decodeHtmlEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) =>
      String.fromCodePoint(parseInt(h, 16)),
    )
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)));
}

export default function PubmedRefsField({
  value,
  meta,
  onChange,
  onError,
  disabled = false,
}: Props) {
  const [refResolving, setRefResolving] = useState<Record<number, boolean>>({});

  /** 현재 meta 를 value 와 길이 맞춤 (부족하면 null 패딩, 넘치면 슬라이스). */
  function alignedMeta(forValue: string[]): (PubmedRefObj | null)[] {
    const base: (PubmedRefObj | null)[] = meta ? [...meta] : [];
    if (forValue.length > base.length) {
      return base.concat(Array(forValue.length - base.length).fill(null));
    }
    return base.slice(0, forValue.length);
  }

  /** value 와 meta 를 함께 갱신해 onChange 한 번에 전달. */
  function emit(nextValue: string[], nextMeta: (PubmedRefObj | null)[]) {
    onChange(nextValue, nextMeta);
  }

  /** ref 에서 PubMed URL 추출 — meta 우선, 없으면 string 안 PMID 정규식 시도. */
  function pubmedUrlFor(idx: number, refStr: string): string | null {
    const m = meta?.[idx];
    if (m?.pubmed_url) return m.pubmed_url;
    if (m?.pmid) return `https://pubmed.ncbi.nlm.nih.gov/${m.pmid}/`;
    if (m?.doi_url) return m.doi_url;
    if (m?.doi) return `https://doi.org/${m.doi}`;
    // fallback — ref string 안에 PubMed URL 또는 PMID 가 있는지
    const urlMatch = refStr.match(/https?:\/\/pubmed\.ncbi\.nlm\.nih\.gov\/\d+\/?/i);
    if (urlMatch) return urlMatch[0];
    const pmidMatch = refStr.match(/PMID[:\s]*(\d{4,9})/i);
    if (pmidMatch) return `https://pubmed.ncbi.nlm.nih.gov/${pmidMatch[1]}/`;
    return null;
  }

  /** [등록] 버튼 — 입력값에서 PMID 추출 후 PubMed API 호출, value[idx]를 변환된 ref로 덮어씀.
   * 응답은 admin/draft/pubmed-by-pmid 가 SSOT (PubmedRefObj) 형식으로 정규화해 보냄. */
  async function resolveRef(idx: number) {
    const input = value[idx] ?? "";
    const pmid = extractPmid(input);
    if (!pmid) {
      onError?.("PubMed URL 또는 PMID(숫자)를 입력해주세요.");
      return;
    }
    onError?.(null);
    setRefResolving((s) => ({ ...s, [idx]: true }));
    try {
      const res = await fetch("/api/admin/draft/pubmed-by-pmid", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pmid }),
      });
      const data = (await res.json()) as
        | { reference?: PubmedRefObj | null }
        | { error?: string };
      if (!res.ok || !("reference" in data) || !data.reference) {
        const msg =
          "error" in data ? data.error : "PubMed 메타를 불러올 수 없습니다.";
        onError?.(msg ?? "PubMed 메타를 불러올 수 없습니다.");
        return;
      }
      const r = data.reference;
      const formatted = pubmedRefObjToString(r);
      const nextValue = [...value];
      nextValue[idx] = formatted;
      const nextMeta = alignedMeta(nextValue);
      nextMeta[idx] = r;
      emit(nextValue, nextMeta);
    } catch (e) {
      onError?.(e instanceof Error ? e.message : "PubMed 메타 조회 실패");
    } finally {
      setRefResolving((s) => ({ ...s, [idx]: false }));
    }
  }

  return (
    <div>
      <label className="mb-1 block text-sm font-semibold text-[var(--text)]">
        참고문헌{" "}
        <span className="text-xs font-normal text-[var(--text-muted)]">
          선택 — 본문 끝에 자동으로 추가됩니다 · 등록 후 제목 클릭 시 PubMed 로 이동
        </span>
      </label>
      <div className="flex flex-col gap-1.5">
        {value.map((ref, idx) => {
          // 등록 판정: " — " 구분자 포함 시만 등록된 ref 로 인정.
          const dashIdx = ref.indexOf(" — ");
          const isRegistered = dashIdx !== -1;
          const refTitle = dashIdx === -1 ? ref : ref.slice(0, dashIdx);
          const refMetaText = dashIdx === -1 ? "" : ref.slice(dashIdx);
          const pubmedUrl = isRegistered ? pubmedUrlFor(idx, ref) : null;
          return (
            <div key={idx} className="flex items-start gap-2">
              <span className="w-5 shrink-0 pt-2 text-right text-xs text-[var(--text-muted)]">
                {idx + 1}.
              </span>
              {isRegistered ? (
                // 등록된 ref — title 부분이 링크면 클릭하여 PubMed/DOI 새 탭 이동.
                <div className="flex min-w-0 flex-1 items-start gap-2 py-1">
                  <p className="min-w-0 flex-1 text-[13px] leading-[1.55] text-[var(--text-muted)]">
                    {pubmedUrl ? (
                      <a
                        href={pubmedUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="underline-offset-2 hover:underline"
                        style={{ color: "var(--primary)" }}
                        title="PubMed 페이지 열기 (새 탭)"
                      >
                        {refTitle}
                      </a>
                    ) : (
                      <span style={{ color: "var(--primary)" }}>{refTitle}</span>
                    )}
                    {refMetaText}
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      // 그 행을 빈 입력 상태로 되돌림 (배열에서 제거 X — 빈 입력 노출). meta 도 null 로.
                      const nextValue = [...value];
                      nextValue[idx] = "";
                      const nextMeta = alignedMeta(nextValue);
                      nextMeta[idx] = null;
                      emit(nextValue, nextMeta);
                    }}
                    disabled={disabled}
                    aria-label="이 참고문헌 지우기 (다시 입력 가능)"
                    title="이 참고문헌 지우기"
                    className="mt-0.5 shrink-0 rounded-full px-1.5 text-[13px] font-bold text-[var(--text-muted)] hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
                  >
                    ×
                  </button>
                </div>
              ) : (
                // 입력 모드 — input + 등록 버튼.
                <div className="flex min-w-0 flex-1 items-center gap-2">
                  <input
                    type="text"
                    value={ref}
                    disabled={disabled}
                    onChange={(e) => {
                      const nextValue = [...value];
                      nextValue[idx] = e.target.value;
                      emit(nextValue, alignedMeta(nextValue));
                    }}
                    onKeyDown={(e) => {
                      // Enter 로도 등록. IME 조합 중에는 무시.
                      if (e.key === "Enter" && !e.nativeEvent.isComposing) {
                        e.preventDefault();
                        if (!refResolving[idx]) void resolveRef(idx);
                      }
                    }}
                    placeholder="PubMed URL을 입력하세요 (또는 PMID 숫자)"
                    className="h-9 flex-1 rounded-[var(--radius-sm)] border border-[var(--border)] bg-white px-3 text-sm focus:border-[var(--primary-light)] focus:outline-none disabled:opacity-50"
                  />
                  <button
                    type="button"
                    onClick={() => void resolveRef(idx)}
                    disabled={refResolving[idx] || disabled}
                    className="h-9 shrink-0 rounded-[var(--radius-sm)] border border-[var(--primary)] bg-[var(--primary)] px-3 text-xs font-semibold text-white hover:bg-[var(--primary-dark)] disabled:cursor-not-allowed disabled:opacity-50"
                    aria-label="PubMed URL을 참고문헌 형식으로 변환"
                  >
                    {refResolving[idx] ? "변환중…" : "등록"}
                  </button>
                  {/* 빈 입력 행이 2개 이상일 때만 행 삭제 X (1개 행이면 그대로 유지). */}
                  {value.length > 1 && (
                    <button
                      type="button"
                      onClick={() => {
                        const nextValue = value.filter((_, i) => i !== idx);
                        const nextMeta = (meta ?? []).filter((_, i) => i !== idx);
                        emit(nextValue, nextMeta);
                      }}
                      disabled={disabled}
                      className="h-9 w-9 shrink-0 rounded-[var(--radius-sm)] border border-[var(--border)] text-[var(--text-muted)] hover:bg-[var(--bg-soft)] disabled:opacity-50"
                      aria-label="이 참고문헌 행 제거"
                    >
                      ×
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
        <button
          type="button"
          onClick={() => {
            const nextValue = [...value, ""];
            emit(nextValue, alignedMeta(nextValue));
          }}
          disabled={disabled}
          className="mt-1 self-start rounded-[var(--radius-sm)] border border-dashed border-[var(--border)] px-3 py-1.5 text-xs text-[var(--text-secondary)] hover:bg-[var(--bg-soft)] disabled:opacity-50"
        >
          + 참고문헌 추가
        </button>
      </div>
    </div>
  );
}

/**
 * 본문 끝에 참고문헌을 번호 매겨 append.
 * Q&A 카테고리 전용 헬퍼. WriteClient / EditClient 둘 다 동일 규칙 사용.
 *
 *   참고문헌
 *   1. Title — Authors, Journal (Year)
 *   2. ...
 */
export function appendReferencesToBody(body: string, refs: string[]): string {
  const filled = refs.map((r) => r.trim()).filter(Boolean);
  if (filled.length === 0) return body;
  const refBlock =
    "참고문헌\n" + filled.map((r, i) => `${i + 1}. ${r}`).join("\n");
  return `${body}\n\n${refBlock}`;
}

/**
 * 기존 본문에서 자동 생성된 "참고문헌" 섹션을 추출.
 * EditClient (수정 모드) 진입 시 본문/refs 분리 위해 사용.
 *
 * 매치 패턴: 본문 끝의 `참고문헌` 헤더 + `1. ...`, `2. ...` 의 번호 리스트.
 * (strict — 사용자가 손으로 적은 비표준 섹션은 보존)
 */
export function splitBodyAndReferences(body: string): {
  cleanBody: string;
  refs: string[];
} {
  const re = /\n+참고문헌\s*\n((?:\s*\d+\.\s+[^\n]+\n?)+)\s*$/;
  const m = body.match(re);
  if (!m || m.index === undefined) return { cleanBody: body, refs: [] };
  const refsBlock = m[1];
  const refs = refsBlock
    .split("\n")
    .map((line) => line.replace(/^\s*\d+\.\s+/, "").trim())
    .filter(Boolean);
  const cleanBody = body.slice(0, m.index).trimEnd();
  return { cleanBody, refs };
}

/**
 * pubmed_refs DB 객체 → PubmedRefsField string 포맷 ("Title — Authors, Journal (Year)").
 *
 * SSOT (단일 출처) — zod schema 에서 자동 추출 (articles.ts 의 PubmedRefSchema).
 * Critical-4 (2026-05-27): 옛 formatPubmedRef (PubmedCandidate 받음, year:string) 와
 * 본 함수가 중복이었던 것을 단일 함수로 통합. 모든 호출자가 PubmedRefObj 형식만 사용.
 *
 * title 가드: title 이 비어 있으면 "(제목 없음)" 으로 표시 (Critical-4 #4).
 */
export type PubmedRefObj = ImportedPubmedRefObj;

export function pubmedRefObjToString(ref: PubmedRefObj): string {
  // 옛 DB 데이터의 HTML entity decode (Ta&#xef;eb → Taïeb)
  const rawTitle = decodeHtmlEntities(ref.title ?? "");
  const tail: string[] = [];
  if (ref.authors_short) tail.push(decodeHtmlEntities(ref.authors_short));
  if (ref.journal) tail.push(decodeHtmlEntities(ref.journal));
  const tailJoined = tail.join(", ");
  const yearPart = ref.year != null ? ` (${ref.year})` : "";
  // 제목 가드 — title 이 비어 있어도 칩 등록 판정 ("Title — ...") 유지하기 위해 placeholder 표시.
  const title = rawTitle.trim() || "(제목 없음)";
  if (!tailJoined && !yearPart) return title;
  return `${title} — ${tailJoined}${yearPart}`.trim();
}
