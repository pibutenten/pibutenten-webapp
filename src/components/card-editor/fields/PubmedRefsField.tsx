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
 *   - 등록 판정은 " — " 구분자 포함 시 (formatPubmedRef 결과는 항상 포함)
 *
 * 부수효과: POST /api/admin/draft/pubmed-by-pmid (PubMed efetch 프록시)
 */
import { useState } from "react";

type PubmedCandidate = {
  authors_short: string;
  title: string;
  journal: string;
  year: string;
  pmid: string;
  doi: string;
};

type Props = {
  /** 참고문헌 배열 (빈 행은 입력 모드, 비어있지 않으면 등록 상태로 간주) */
  value: string[];
  onChange: (next: string[]) => void;
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

/** PubmedCandidate → "Title — Authors, Journal (Year)" 형식의 한 줄 ref. */
function formatPubmedRef(ref: PubmedCandidate): string {
  const title = ref.title || "";
  const tail: string[] = [];
  if (ref.authors_short) tail.push(ref.authors_short);
  if (ref.journal) tail.push(ref.journal);
  const tailJoined = tail.join(", ");
  const yearPart = ref.year ? ` (${ref.year})` : "";
  if (!title && !tailJoined && !yearPart) return "";
  if (!tailJoined && !yearPart) return title;
  if (!title) return `${tailJoined}${yearPart}`.trim();
  return `${title} — ${tailJoined}${yearPart}`.trim();
}

export default function PubmedRefsField({
  value,
  onChange,
  onError,
  disabled = false,
}: Props) {
  const [refResolving, setRefResolving] = useState<Record<number, boolean>>({});

  /** [등록] 버튼 — 입력값에서 PMID 추출 후 PubMed API 호출, value[idx]를 변환된 ref로 덮어씀. */
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
        | { reference?: PubmedCandidate }
        | { error?: string };
      if (!res.ok || !("reference" in data) || !data.reference) {
        const msg = "error" in data ? data.error : "PubMed 메타를 불러올 수 없습니다.";
        onError?.(msg ?? "PubMed 메타를 불러올 수 없습니다.");
        return;
      }
      const formatted = formatPubmedRef(data.reference);
      const next = [...value];
      next[idx] = formatted;
      onChange(next);
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
          선택 — 본문 끝에 자동으로 추가됩니다
        </span>
      </label>
      <div className="flex flex-col gap-1.5">
        {value.map((ref, idx) => {
          // 등록 판정: " — " 구분자 포함 시만 등록된 ref 로 인정.
          const dashIdx = ref.indexOf(" — ");
          const isRegistered = dashIdx !== -1;
          const refTitle = dashIdx === -1 ? ref : ref.slice(0, dashIdx);
          const refMeta = dashIdx === -1 ? "" : ref.slice(dashIdx);
          return (
            <div key={idx} className="flex items-start gap-2">
              <span className="w-5 shrink-0 pt-2 text-right text-xs text-[var(--text-muted)]">
                {idx + 1}.
              </span>
              {isRegistered ? (
                // 등록된 ref — 카드 본문 참고문헌 영역과 동일 스타일 (title sky-blue, meta muted).
                <div className="flex min-w-0 flex-1 items-start gap-2 py-1">
                  <p className="min-w-0 flex-1 text-[13px] leading-[1.55] text-[var(--text-muted)]">
                    <span style={{ color: "var(--primary)" }}>{refTitle}</span>
                    {refMeta}
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      // 그 행을 빈 입력 상태로 되돌림 (배열에서 제거 X — 빈 입력 노출).
                      const next = [...value];
                      next[idx] = "";
                      onChange(next);
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
                      const next = [...value];
                      next[idx] = e.target.value;
                      onChange(next);
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
                      onClick={() =>
                        onChange(value.filter((_, i) => i !== idx))
                      }
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
          onClick={() => onChange([...value, ""])}
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
 * pubmed_refs DB 객체 → PubmedRefsField string 포맷.
 * Phase 2 (260518): admin 발행 카드는 pubmed_refs 컬럼에 객체 배열로 저장됨.
 * EditClient 가 그것을 본문 끝의 "참고문헌" 섹션과 동등하게 다루기 위해 변환.
 */
export type PubmedRefObj = {
  pmid?: string | null;
  doi?: string | null;
  title?: string | null;
  journal?: string | null;
  year?: string | null;
  authors_short?: string | null;
  pubmed_url?: string | null;
  doi_url?: string | null;
};

export function pubmedRefObjToString(ref: PubmedRefObj): string {
  const title = ref.title ?? "";
  const tail: string[] = [];
  if (ref.authors_short) tail.push(ref.authors_short);
  if (ref.journal) tail.push(ref.journal);
  const tailJoined = tail.join(", ");
  const yearPart = ref.year ? ` (${ref.year})` : "";
  if (!title && !tailJoined && !yearPart) return "";
  if (!tailJoined && !yearPart) return title;
  if (!title) return `${tailJoined}${yearPart}`.trim();
  return `${title} — ${tailJoined}${yearPart}`.trim();
}
