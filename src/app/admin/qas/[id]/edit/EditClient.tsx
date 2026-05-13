"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { pickHighlight } from "@/lib/qa-highlight";
import MarkdownBoldEditor from "@/components/MarkdownBoldEditor";
import { normalizeTags } from "@/lib/tag-dictionary";
import { normalizeAnswerBody } from "@/lib/normalize-body";

type Doctor = {
  id: string;
  slug: string;
  name: string;
  branch: string | null;
};

type Video = {
  youtube_id: string;
  youtube_url: string;
  topic: string | null;
  upload_date: string | null;
};

type PubmedRef = {
  pmid?: string | null;
  doi?: string | null;
  title?: string | null;
  journal?: string | null;
  year?: string | null;
  authors_short?: string | null;
  pubmed_url?: string | null;
  doi_url?: string | null;
} | null;

type QA = {
  id: number;
  question: string;
  answer: string;
  meta: string | null; // JSON string
  keywords: string[];
  status: "draft" | "pending_review" | "published" | "archived";
  type: "qa" | "post";
  category: string | null;
  posted_as: "official" | "personal" | null;
  is_pick?: boolean;
  doctor_id: string | null;
  video_id: string | null;
  like_count: number;
  view_count: number;
  created_at: string;
  external_url?: string | null;
  external_title?: string | null;
  external_image?: string | null;
  external_site_name?: string | null;
  pubmed_ref?: PubmedRef;
  doctor: Doctor | null;
  video: Video | null;
};

type Props = {
  qa: QA;
  doctors: Doctor[];
  doctorPickCount?: number;
  commentCount?: number;
  /** super admin만 글쓴이 변경 가능. 원장 admin은 본인 글만 보고 글쓴이 readonly */
  canChangeAuthor?: boolean;
};

const STATUS_LABELS: Record<QA["status"], string> = {
  draft: "초안",
  pending_review: "대기",
  published: "발행",
  archived: "보관",
};

const STATUS_COLORS: Record<QA["status"], string> = {
  draft: "#9E9E9E",
  pending_review: "#FFA000",
  published: "#4CAF50",
  archived: "#616161",
};

const YOUTUBE_ID_REGEX = /^[a-zA-Z0-9_-]{11}$/;

/** YouTube URL/ID에서 video_id 11자 추출. 실패 시 null. */
function extractVideoId(input: string): string | null {
  const raw = (input || "").trim();
  if (!raw) return null;
  if (YOUTUBE_ID_REGEX.test(raw)) return raw;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  const host = url.hostname.replace(/^www\./, "");
  if (host === "youtu.be") {
    const id = url.pathname.split("/").filter(Boolean)[0];
    if (id && YOUTUBE_ID_REGEX.test(id)) return id;
  }
  if (host.endsWith("youtube.com")) {
    const v = url.searchParams.get("v");
    if (v && YOUTUBE_ID_REGEX.test(v)) return v;
    const seg = url.pathname.split("/").filter(Boolean);
    if (seg.length >= 2 && YOUTUBE_ID_REGEX.test(seg[1])) return seg[1];
  }
  return null;
}

/** URL에서 ?t=Ns 또는 #t=Ns 의 시작 초 추출. 없으면 0. */
function extractStartSeconds(input: string): number {
  const raw = (input || "").trim();
  if (!raw) return 0;
  const m = raw.match(/[?&#](?:t|start)=(\d+)(?:s)?/i);
  if (m) return Number.parseInt(m[1], 10) || 0;
  return 0;
}

function formatMMSS(sec: number): string {
  const s = Math.max(0, Math.floor(sec || 0));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}`;
}

function parseMMSS(input: string): number {
  const raw = (input || "").trim();
  if (!raw) return 0;
  if (/^\d+$/.test(raw)) return Number.parseInt(raw, 10) || 0;
  const m = raw.match(/^(\d{1,2})\s*[:.]\s*(\d{1,2})$/);
  if (m) {
    return (Number.parseInt(m[1], 10) || 0) * 60 + (Number.parseInt(m[2], 10) || 0);
  }
  return 0;
}

function buildExternalUrl(videoId: string, startSec: number): string {
  if (!videoId) return "";
  if (startSec > 0) return `https://youtu.be/${videoId}?t=${startSec}s`;
  return `https://youtu.be/${videoId}`;
}

export default function EditClient({
  qa,
  doctors,
  doctorPickCount = 0,
  commentCount = 0,
  canChangeAuthor = false,
}: Props) {
  const router = useRouter();

  // ── 폼 상태 ──
  const [question, setQuestion] = useState(qa.question);
  const [answer, setAnswer] = useState(qa.answer);
  const [keywords, setKeywords] = useState<string[]>(qa.keywords);
  const [keywordInput, setKeywordInput] = useState("");
  // 글쓴이 — 관리자(super admin)는 변경 가능. 원장 admin은 본인 카드만 보이므로 변경 불필요.
  // (super admin 여부는 server에서 가드되어 이 페이지 진입 자체가 가능한 것 — 클라이언트에선 항상 dropdown 노출)
  const [doctorId, setDoctorId] = useState<string | null>(qa.doctor_id);
  const [status, setStatus] = useState<QA["status"]>(qa.status);
  const [isPick, setIsPick] = useState<boolean>(qa.is_pick ?? false);

  // 영상 정보 — qas.external_* 카드별 (videos 테이블 안 건드림)
  const [externalUrl, setExternalUrl] = useState(qa.external_url ?? "");
  const [externalTitle, setExternalTitle] = useState(qa.external_title ?? "");
  const initialStartSec = extractStartSeconds(qa.external_url ?? "");
  const [startSec, setStartSec] = useState(initialStartSec);
  const [startInput, setStartInput] = useState(formatMMSS(initialStartSec));

  // 참고문헌 — 편집·추가·제거 가능
  const [pubmedRef, setPubmedRef] = useState<PubmedRef>(qa.pubmed_ref ?? null);
  const [refPmidInput, setRefPmidInput] = useState("");
  const [refLoading, setRefLoading] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [isSaving, startSave] = useTransition();
  const [oembedLoading, setOembedLoading] = useState(false);

  // 편집기 내 <strong> 형광펜 색 — 카드 id 기반 (실제 카드와 동일 색)
  const highlightColor = useMemo(() => pickHighlight(String(qa.id)), [qa.id]);

  // baseId는 현재 external_url 또는 video.youtube_id 에서 추출
  const baseVideoId =
    extractVideoId(externalUrl) ?? qa.video?.youtube_id ?? "";

  function handleStartInputChange(v: string) {
    setStartInput(v);
  }
  function commitStartInput() {
    const sec = parseMMSS(startInput);
    setStartSec(sec);
    setStartInput(formatMMSS(sec));
    if (baseVideoId) {
      setExternalUrl(buildExternalUrl(baseVideoId, sec));
    }
  }

  async function fetchTitleFromYoutube() {
    if (!baseVideoId) {
      setError("영상 ID를 찾을 수 없어 제목을 가져올 수 없습니다.");
      return;
    }
    setError(null);
    setOembedLoading(true);
    try {
      const res = await fetch(
        `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${baseVideoId}&format=json`,
      );
      if (!res.ok) throw new Error(`oEmbed HTTP ${res.status}`);
      const j = (await res.json()) as { title?: string };
      if (j.title) setExternalTitle(j.title.trim());
    } catch (e) {
      setError(
        `YouTube 제목 가져오기 실패: ${e instanceof Error ? e.message : String(e)}`,
      );
    } finally {
      setOembedLoading(false);
    }
  }

  function save(toStatus?: QA["status"]) {
    const finalStatus = toStatus ?? status;
    setError(null);
    startSave(async () => {
      const supabase = createSupabaseBrowserClient();

      // meta(text 컬럼, JSON string)에 timestamp 갱신
      let metaObj: Record<string, unknown> = {};
      try {
        if (qa.meta) metaObj = JSON.parse(qa.meta) as Record<string, unknown>;
      } catch {
        metaObj = {};
      }
      const prevTs = metaObj.timestamp as { end?: string } | undefined;
      metaObj.timestamp = {
        start: formatMMSS(startSec),
        start_seconds: startSec,
        ...(prevTs?.end ? { end: prevTs.end } : {}),
      };
      const metaStr = JSON.stringify(metaObj);

      const { error: upErr } = await supabase
        .from("qas")
        .update({
          question: question.trim(),
          // D4: 답변 본문 빈 줄 자동 제거 (단락 구분 유지)
          answer: normalizeAnswerBody(answer),
          keywords: normalizeTags(keywords),
          doctor_id: doctorId,
          status: finalStatus,
          is_pick: isPick,
          published: finalStatus === "published",
          external_url: externalUrl.trim() || null,
          external_title: externalTitle.trim() || null,
          meta: metaStr,
          pubmed_ref: pubmedRef,
        })
        .eq("id", qa.id);
      if (upErr) {
        const msg = upErr.message ?? "저장 실패";
        if (msg.includes("PICK_LIMIT_EXCEEDED")) {
          setError(
            "Pick은 한 원장당 최대 5개까지 가능합니다. 다른 글의 Pick을 먼저 해제해주세요.",
          );
        } else {
          setError(`저장 실패: ${msg}`);
        }
        return;
      }

      setStatus(finalStatus);
      if (toStatus) {
        router.push(`/admin/qas?status=${finalStatus}`);
      } else {
        router.refresh();
      }
    });
  }

  function deleteQA() {
    if (!confirm(`Q&A #${qa.id} 를 영구 삭제할까요? 되돌릴 수 없습니다.`))
      return;
    startSave(async () => {
      const supabase = createSupabaseBrowserClient();
      const { error: delErr } = await supabase
        .from("qas")
        .delete()
        .eq("id", qa.id);
      if (delErr) {
        setError(`삭제 실패: ${delErr.message}`);
        return;
      }
      router.push("/admin/qas");
    });
  }

  const answerLength = answer.length;
  const paragraphCount = answer.split(/\n{2,}/).filter((p) => p.trim()).length;

  return (
    <div className="space-y-4">
      {/* ── 메타 정보 ── */}
      <div className="rounded-[var(--radius)] border border-[var(--border)] bg-white p-4 text-sm text-[var(--text-secondary)]">
        <div className="flex flex-wrap gap-3">
          <span>
            상태:{" "}
            <span
              className="ml-1 inline-block rounded-full px-2 py-0.5 text-[11px] font-bold text-white"
              style={{ backgroundColor: STATUS_COLORS[status] }}
            >
              {STATUS_LABELS[status]}
            </span>
          </span>
          <span>타입: {qa.type === "qa" ? "원장 Q&A" : "사용자 글"}</span>
          <span>
            좋아요 {qa.like_count} · 조회 {qa.view_count} · 댓글 {commentCount}
          </span>
        </div>
        <div className="mt-1 flex flex-wrap gap-3 text-xs text-[var(--text-muted)]">
          <span>
            생성일: {new Date(qa.created_at).toLocaleDateString("ko-KR")}
          </span>
          {qa.video?.upload_date && (
            <span>업로드일: {qa.video.upload_date}</span>
          )}
        </div>
      </div>

      {/* ── 편집 폼 ── */}
      <div className="space-y-3 rounded-[var(--radius)] border border-[var(--border)] bg-white p-5">
        {/* E2: 글쓴이 + Pick 토글 좌우 배치 */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {/* 글쓴이 — super admin만 변경 가능 */}
          <div>
            <label className="mb-1 block text-sm text-[var(--text-secondary)]">
              글쓴이
            </label>
            {canChangeAuthor ? (
              <select
                value={doctorId ?? ""}
                onChange={(e) => setDoctorId(e.target.value || null)}
                className="w-full rounded-md border border-[var(--border)] bg-white px-3 py-2 text-sm focus:border-[var(--primary)] focus:outline-none"
              >
                <option value="">— 없음 —</option>
                {doctors.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            ) : (
              <div className="flex h-[38px] items-center gap-2 rounded-md border border-[var(--border)] bg-[var(--bg-soft)] px-3 text-sm">
                <span className="font-medium text-[var(--text)]">
                  {doctors.find((d) => d.id === doctorId)?.name ?? "— 없음 —"}
                </span>
              </div>
            )}
          </div>

          {/* Pick 토글 */}
          <div>
            <label className="mb-1 block text-sm text-[var(--text-secondary)]">
              Pick (원장님 추천)
            </label>
            <div className="flex h-[38px] items-center justify-between rounded-md bg-[var(--bg-soft)] px-3">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={isPick}
                  onChange={(e) => setIsPick(e.target.checked)}
                  className="h-4 w-4"
                />
                <span className="font-semibold">Pick</span>
              </label>
              <span className="text-xs text-[var(--text-muted)]">
                {doctorPickCount} / 5
              </span>
            </div>
          </div>
        </div>

        {/* 영상 정보 — 카드별
            E3: 영상 링크 편집 가능 + 저장 시 oEmbed로 제목 자동 채움
            E4: YouTube 진입 버튼 제거 (외부 카드 형태로 통일) */}
        <div className="space-y-3 rounded-md border border-[var(--border)] bg-[var(--bg-soft)]/40 p-3">
          <p className="text-xs font-semibold text-[var(--text-secondary)]">
            🎬 영상 정보 (이 카드에만 적용)
          </p>
          <div>
            <label className="mb-1 block text-xs text-[var(--text-secondary)]">
              영상 링크 (YouTube URL — 입력 후 [↻] 클릭으로 제목 자동 채움)
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={externalUrl}
                onChange={(e) => setExternalUrl(e.target.value)}
                placeholder="https://youtu.be/..."
                className="flex-1 rounded-md border border-[var(--border)] bg-white px-3 py-2 text-sm outline-none focus:border-[var(--primary)]"
              />
              <button
                type="button"
                onClick={fetchTitleFromYoutube}
                disabled={oembedLoading || !baseVideoId}
                title="YouTube에서 제목 가져오기"
                className="whitespace-nowrap rounded-md border border-[var(--border)] bg-white px-3 text-xs font-medium text-[var(--text-secondary)] hover:border-[var(--primary)] hover:text-[var(--primary)] disabled:opacity-50"
              >
                {oembedLoading ? "가져오는 중…" : "↻ 제목 가져오기"}
              </button>
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs text-[var(--text-secondary)]">
              영상 제목 (readonly — oEmbed로 자동 채움)
            </label>
            <input
              type="text"
              value={externalTitle}
              readOnly
              placeholder="(영상 링크 입력 후 [↻ 제목 가져오기] 클릭)"
              className="w-full rounded-md border border-[var(--border)] bg-white px-3 py-2 text-sm text-[var(--text-secondary)] outline-none"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-[var(--text-secondary)]">
              시작 시각{" "}
              <span className="text-[10px] text-[var(--text-muted)]">
                (MM:SS — 수정하면 위 링크 자동 갱신)
              </span>
            </label>
            <input
              type="text"
              value={startInput}
              onChange={(e) => handleStartInputChange(e.target.value)}
              onBlur={commitStartInput}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  commitStartInput();
                }
              }}
              placeholder="00:00"
              className="w-32 rounded-md border border-[var(--border)] bg-white px-3 py-2 text-sm outline-none focus:border-[var(--primary)]"
            />
          </div>
        </div>

        {/* 질문 */}
        <div>
          <label className="mb-1 block text-sm text-[var(--text-secondary)]">
            질문
          </label>
          <input
            type="text"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            className="w-full rounded-md border border-[var(--border)] px-3 py-2 text-base font-bold outline-none focus:border-[var(--primary)]"
          />
        </div>

        {/* 답변 — 단일 WYSIWYG 편집기 (굵게 즉시 형광펜 시각화. ** 마크다운 안 보임) */}
        <div>
          <label className="mb-1 block text-sm text-[var(--text-secondary)]">
            답변{" "}
            <span className="text-xs text-[var(--text-muted)]">
              ({answerLength}자, 목표 400~600자 / {paragraphCount}단락)
            </span>
          </label>
          <MarkdownBoldEditor
            value={answer}
            onChange={setAnswer}
            highlightColor={highlightColor}
            placeholder="답변 본문 (텍스트 선택 후 [B 굵게] 또는 Ctrl+B로 형광펜 적용)"
            minHeight={320}
          />
        </div>

        {/* 키워드 */}
        <div>
          <label className="mb-1 block text-sm text-[var(--text-secondary)]">
            태그
          </label>
          <div className="mb-2 flex flex-wrap gap-1.5">
            {keywords.map((k) => (
              <button
                key={k}
                type="button"
                onClick={() =>
                  setKeywords((prev) => prev.filter((x) => x !== k))
                }
                className="inline-flex items-center gap-1 rounded-full border border-[var(--primary)] bg-[var(--primary)]/10 px-2.5 py-0.5 text-xs font-medium text-[var(--primary)] hover:bg-[var(--primary)]/20"
              >
                {k} <span aria-hidden>×</span>
              </button>
            ))}
          </div>
          {/* D3: 키워드 입력 — 엔터로만 추가 ("추가" 버튼 제거) */}
          <input
            type="text"
            value={keywordInput}
            onChange={(e) => setKeywordInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                const v = keywordInput.trim().replace(/^#/, "");
                if (!v || keywords.includes(v)) return;
                setKeywords((prev) => [...prev, v]);
                setKeywordInput("");
              }
            }}
            placeholder="태그 입력 후 Enter"
            className="w-full rounded-md border border-[var(--border)] px-3 py-2 text-sm outline-none focus:border-[var(--primary)]"
          />
        </div>

        {/* 참고문헌 (PubMed) — 편집/추가/제거 */}
        <div>
          <label className="mb-1 block text-sm text-[var(--text-secondary)]">
            참고문헌 (PubMed)
          </label>
          {pubmedRef ? (
            <div className="space-y-2">
              <ReferenceLine r={pubmedRef} />
              <button
                type="button"
                onClick={() => setPubmedRef(null)}
                className="text-xs text-red-600 hover:underline"
              >
                참고문헌 제거
              </button>
            </div>
          ) : (
            <div className="rounded-md border border-dashed border-[var(--border)] bg-[var(--bg-soft)]/40 p-3">
              <p className="mb-2 text-xs text-[var(--text-muted)]">
                참고문헌 없음 — PMID를 입력해 PubMed에서 가져올 수 있습니다.
              </p>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={refPmidInput}
                  onChange={(e) => setRefPmidInput(e.target.value)}
                  placeholder="PMID 숫자 (예: 37705328)"
                  className="flex-1 rounded-md border border-[var(--border)] bg-white px-3 py-2 text-sm focus:border-[var(--primary)] focus:outline-none"
                />
                <button
                  type="button"
                  disabled={refLoading || !refPmidInput.trim()}
                  onClick={async () => {
                    setError(null);
                    setRefLoading(true);
                    try {
                      const res = await fetch(
                        "/api/admin/draft/pubmed-by-pmid",
                        {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({
                            pmid: refPmidInput.trim(),
                          }),
                        },
                      );
                      const data = (await res.json()) as
                        | {
                            reference: {
                              pmid: string;
                              doi: string;
                              title: string;
                              journal: string;
                              year: string;
                              authors_short: string;
                            };
                          }
                        | { error: string };
                      if (!res.ok || "error" in data) {
                        setError(
                          "error" in data
                            ? data.error
                            : `PubMed 조회 실패 (${res.status})`,
                        );
                        return;
                      }
                      const r = data.reference;
                      setPubmedRef({
                        pmid: r.pmid,
                        doi: r.doi,
                        title: r.title,
                        journal: r.journal,
                        year: r.year,
                        authors_short: r.authors_short,
                        pubmed_url: `https://pubmed.ncbi.nlm.nih.gov/${r.pmid}/`,
                        doi_url: r.doi ? `https://doi.org/${r.doi}` : "",
                      });
                      setRefPmidInput("");
                    } catch (e) {
                      setError(
                        e instanceof Error ? e.message : "네트워크 오류",
                      );
                    } finally {
                      setRefLoading(false);
                    }
                  }}
                  className="whitespace-nowrap rounded-md border border-[var(--primary)] bg-white px-3 py-2 text-xs font-semibold text-[var(--primary)] hover:bg-[var(--primary)]/5 disabled:opacity-50"
                >
                  {refLoading ? "조회 중…" : "+ PubMed에서 가져오기"}
                </button>
              </div>
              <p className="mt-1 text-[10px] text-[var(--text-muted)]">
                PMID는 PubMed 검색결과 URL 끝의 숫자 (예:
                pubmed.ncbi.nlm.nih.gov/<b>37705328</b>/).
              </p>
            </div>
          )}
        </div>

        {error && (
          <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        )}

        {/* 액션 버튼 — 상태 dropdown 대체. 현재 상태는 chip으로 표시, 클릭 시 즉시 저장+상태 변경 */}
        <div className="space-y-2 pt-2">
          <div className="text-xs text-[var(--text-secondary)]">
            현재 상태:{" "}
            <span
              className="inline-block rounded-full px-2 py-0.5 text-[11px] font-bold text-white"
              style={{ backgroundColor: STATUS_COLORS[status] }}
            >
              {STATUS_LABELS[status]}
            </span>
            <span className="ml-2 text-[11px] text-[var(--text-muted)]">
              아래 버튼을 누르면 그 상태로 즉시 저장됩니다.
            </span>
          </div>
          {/* E1: 버튼 3개 통일 — 삭제 / 대기 / 발행.
              초안으로·보관 버튼 제거. 현재 상태와 같은 버튼은 disabled로 표시. */}
          <div className="flex flex-wrap justify-between gap-2">
            <button
              type="button"
              onClick={deleteQA}
              disabled={isSaving}
              className="rounded-md border border-red-300 px-3 py-2 text-sm font-semibold text-red-600 transition-colors hover:bg-red-50 disabled:opacity-50"
            >
              🗑 삭제
            </button>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => save("pending_review")}
                disabled={isSaving || status === "pending_review"}
                className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-700 hover:bg-amber-100 disabled:opacity-50"
              >
                ⏳ 대기
              </button>
              <button
                type="button"
                onClick={() => save("published")}
                disabled={isSaving || status === "published"}
                className="rounded-md bg-[var(--primary)] px-4 py-2 text-sm font-semibold text-white hover:bg-[var(--primary-dark)] disabled:opacity-50"
              >
                🚀 발행
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/** PubMed 참고문헌 한 줄 표시 (카드 footer와 동일 형식). */
function ReferenceLine({ r }: { r: NonNullable<PubmedRef> }) {
  const url = r.pubmed_url ?? r.doi_url ?? "#";
  return (
    <div className="rounded-md border border-[var(--border)] bg-white px-3 py-2 text-[12px] leading-[1.55]">
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="font-medium text-[var(--text)] underline decoration-[var(--text-muted)]/40 underline-offset-[3px] hover:decoration-[var(--primary)]"
      >
        {r.title ?? "(제목 없음)"}
      </a>
      <div className="mt-0.5 text-[var(--text-secondary)]">
        {r.authors_short && <span>{r.authors_short} · </span>}
        {r.journal && <span>{r.journal}</span>}
        {r.year && <span> ({r.year})</span>}
      </div>
      <div className="mt-0.5 flex gap-3 text-[10px] text-[var(--text-muted)]">
        {r.pmid && (
          <a
            href={`https://pubmed.ncbi.nlm.nih.gov/${r.pmid}/`}
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-[var(--primary)]"
          >
            PMID: {r.pmid}
          </a>
        )}
        {r.doi && (
          <a
            href={`https://doi.org/${r.doi}`}
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-[var(--primary)]"
          >
            DOI
          </a>
        )}
      </div>
    </div>
  );
}
