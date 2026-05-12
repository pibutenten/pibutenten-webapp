"use client";

import { Fragment, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { pickHighlight } from "@/lib/qa-highlight";

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
}: Props) {
  const router = useRouter();

  // ── 폼 상태 ──
  const [question, setQuestion] = useState(qa.question);
  const [answer, setAnswer] = useState(qa.answer);
  const [keywords, setKeywords] = useState<string[]>(qa.keywords);
  const [keywordInput, setKeywordInput] = useState("");
  const [doctorId, setDoctorId] = useState<string | null>(qa.doctor_id);
  const [status, setStatus] = useState<QA["status"]>(qa.status);
  const [isPick, setIsPick] = useState<boolean>(qa.is_pick ?? false);

  // 영상 정보 — qas.external_* 카드별 (videos 테이블 안 건드림)
  const [externalUrl, setExternalUrl] = useState(qa.external_url ?? "");
  const [externalTitle, setExternalTitle] = useState(qa.external_title ?? "");
  const initialStartSec = extractStartSeconds(qa.external_url ?? "");
  const [startSec, setStartSec] = useState(initialStartSec);
  const [startInput, setStartInput] = useState(formatMMSS(initialStartSec));

  const [error, setError] = useState<string | null>(null);
  const [isSaving, startSave] = useTransition();
  const [oembedLoading, setOembedLoading] = useState(false);

  const answerRef = useRef<HTMLTextAreaElement | null>(null);

  // 미리보기용 형광펜 색 — 카드 id 기반 (실제 카드와 동일 색)
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

  /**
   * 답변 textarea의 선택 영역을 **로 wrap/unwrap. native undo 보존(setRangeText).
   */
  function toggleBold() {
    const ta = answerRef.current;
    if (!ta) return;
    const start = ta.selectionStart ?? 0;
    const end = ta.selectionEnd ?? 0;
    if (start === end) return;
    const selected = ta.value.slice(start, end);
    if (
      selected.length >= 4 &&
      selected.startsWith("**") &&
      selected.endsWith("**")
    ) {
      const inner = selected.slice(2, -2);
      ta.setRangeText(inner, start, end, "select");
    } else {
      ta.setRangeText(`**${selected}**`, start, end, "select");
    }
    setAnswer(ta.value);
    ta.focus();
  }

  function onAnswerKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if ((e.ctrlKey || e.metaKey) && (e.key === "b" || e.key === "B")) {
      e.preventDefault();
      toggleBold();
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
          answer: answer.trim(),
          keywords,
          doctor_id: doctorId,
          status: finalStatus,
          is_pick: isPick,
          published: finalStatus === "published",
          external_url: externalUrl.trim() || null,
          external_title: externalTitle.trim() || null,
          meta: metaStr,
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
        {/* 글쓴이 */}
        <div>
          <label className="mb-1 block text-sm text-[var(--text-secondary)]">
            글쓴이
          </label>
          <select
            value={doctorId ?? ""}
            onChange={(e) => setDoctorId(e.target.value || null)}
            className="w-full rounded-md border border-[var(--border)] px-3 py-2 outline-none focus:border-[var(--primary)]"
          >
            <option value="">— 없음 —</option>
            {doctors.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </div>

        {/* Pick 토글 */}
        <div className="flex items-center justify-between rounded-md bg-[var(--bg-soft)] px-3 py-2">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={isPick}
              onChange={(e) => setIsPick(e.target.checked)}
              className="h-4 w-4"
            />
            <span className="font-semibold">Pick (원장님 추천)</span>
          </label>
          <span className="text-xs text-[var(--text-muted)]">
            현재 이 원장 Pick: {doctorPickCount} / 5
          </span>
        </div>

        {/* 영상 정보 — 카드별 (qas.external_* 만 수정, videos 테이블 안 건드림) */}
        <div className="space-y-3 rounded-md border border-[var(--border)] bg-[var(--bg-soft)]/40 p-3">
          <p className="text-xs font-semibold text-[var(--text-secondary)]">
            🎬 영상 정보 (이 카드에만 적용)
          </p>
          <div>
            <label className="mb-1 block text-xs text-[var(--text-secondary)]">
              영상 제목
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={externalTitle}
                onChange={(e) => setExternalTitle(e.target.value)}
                placeholder="(없음)"
                className="flex-1 rounded-md border border-[var(--border)] bg-white px-3 py-2 text-sm outline-none focus:border-[var(--primary)]"
              />
              <button
                type="button"
                onClick={fetchTitleFromYoutube}
                disabled={oembedLoading || !baseVideoId}
                title="YouTube에서 제목 가져오기"
                className="whitespace-nowrap rounded-md border border-[var(--border)] bg-white px-3 text-xs font-medium text-[var(--text-secondary)] hover:border-[var(--primary)] hover:text-[var(--primary)] disabled:opacity-50"
              >
                {oembedLoading ? "가져오는 중…" : "↻ YouTube에서"}
              </button>
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs text-[var(--text-secondary)]">
              영상 링크{" "}
              <span className="text-[10px] text-[var(--text-muted)]">
                (시작 시각 자동 반영)
              </span>
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={externalUrl}
                readOnly
                placeholder="(없음)"
                className="flex-1 rounded-md border border-[var(--border)] bg-white px-3 py-2 text-sm text-[var(--text-secondary)] outline-none"
              />
              {externalUrl && (
                <a
                  href={externalUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="whitespace-nowrap rounded-md border border-[var(--border)] bg-white px-3 py-2 text-xs font-medium text-[var(--text-secondary)] hover:border-[var(--primary)] hover:text-[var(--primary)]"
                >
                  ↗ 열기
                </a>
              )}
            </div>
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

        {/* 답변 — Side-by-side */}
        <div>
          <div className="mb-1 flex items-center justify-between">
            <label className="text-sm text-[var(--text-secondary)]">
              답변{" "}
              <span className="text-xs text-[var(--text-muted)]">
                ({answerLength}자, 목표 400~600자 / {paragraphCount}단락)
              </span>
            </label>
            <button
              type="button"
              onClick={toggleBold}
              title="굵게 (Ctrl+B) — 선택한 텍스트를 **로 감싸 형광펜 적용"
              className="rounded-md border border-[var(--border)] bg-white px-2.5 py-1 text-xs font-bold text-[var(--text-secondary)] hover:border-[var(--primary)] hover:text-[var(--primary)]"
            >
              <span style={{ fontWeight: 700 }}>B</span> 굵게
            </button>
          </div>
          <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
            <textarea
              ref={answerRef}
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              onKeyDown={onAnswerKeyDown}
              rows={14}
              className="w-full rounded-md border border-[var(--border)] px-3 py-2 text-sm leading-[1.65] outline-none focus:border-[var(--primary)] font-[ui-monospace,SFMono-Regular,Menlo,monospace]"
              placeholder="답변 본문 (markdown: **bold**, 단락은 빈 줄)"
            />
            <AnswerPreview text={answer} highlightColor={highlightColor} />
          </div>
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
          <div className="flex gap-2">
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
              className="flex-1 rounded-md border border-[var(--border)] px-3 py-2 text-sm outline-none focus:border-[var(--primary)]"
            />
            <button
              type="button"
              onClick={() => {
                const v = keywordInput.trim().replace(/^#/, "");
                if (!v || keywords.includes(v)) return;
                setKeywords((prev) => [...prev, v]);
                setKeywordInput("");
              }}
              className="rounded-md border border-[var(--border)] px-3 text-sm hover:bg-[var(--bg-soft)]"
            >
              추가
            </button>
          </div>
        </div>

        {/* 참고문헌 (PubMed) */}
        <div>
          <label className="mb-1 block text-sm text-[var(--text-secondary)]">
            참고문헌 (PubMed)
          </label>
          <ReferenceDisplay pubmed_ref={qa.pubmed_ref ?? null} />
        </div>

        {/* 상태 */}
        <div>
          <label className="mb-1 block text-sm text-[var(--text-secondary)]">
            상태
          </label>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as QA["status"])}
            className="w-full rounded-md border border-[var(--border)] px-3 py-2 outline-none focus:border-[var(--primary)]"
          >
            {(Object.keys(STATUS_LABELS) as QA["status"][]).map((s) => (
              <option key={s} value={s}>
                {STATUS_LABELS[s]}
              </option>
            ))}
          </select>
        </div>

        {error && (
          <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        )}

        {/* 액션 버튼 */}
        <div className="flex flex-wrap justify-between gap-2 pt-2">
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
              onClick={() => save()}
              disabled={isSaving}
              className="rounded-md border border-[var(--border)] px-4 py-2 text-sm font-semibold text-[var(--text-secondary)] transition-colors hover:border-[var(--primary)] disabled:opacity-50"
            >
              💾 저장
            </button>
            {status !== "published" && (
              <button
                type="button"
                onClick={() => save("published")}
                disabled={isSaving}
                className="rounded-md bg-[var(--primary)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
              >
                🚀 발행
              </button>
            )}
            {status === "published" && (
              <button
                type="button"
                onClick={() => save("archived")}
                disabled={isSaving}
                className="rounded-md border border-[var(--border)] px-4 py-2 text-sm font-semibold text-[var(--text-secondary)] hover:border-[var(--primary)] disabled:opacity-50"
              >
                📥 비공개로
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/** 답변 미리보기 — QACard.renderAnswerBody 와 같은 로직 (form 영역용 간소화). */
function AnswerPreview({
  text,
  highlightColor,
}: {
  text: string;
  highlightColor: string;
}) {
  const paragraphs = (text ?? "").split(/\n{2,}/).map((s) => s.trimEnd());
  return (
    <div className="rounded-md border border-[var(--border)] bg-white p-3">
      <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
        미리보기
      </div>
      <div className="space-y-2">
        {paragraphs.map((para, pi) => {
          const parts: React.ReactNode[] = [];
          const re = /\*\*([^*]+)\*\*/g;
          let last = 0;
          let m: RegExpExecArray | null;
          let key = 0;
          while ((m = re.exec(para)) !== null) {
            if (m.index > last) {
              parts.push(
                <Fragment key={`t${pi}-${key++}`}>
                  {para.slice(last, m.index)}
                </Fragment>,
              );
            }
            parts.push(
              <strong
                key={`b${pi}-${key++}`}
                className="font-semibold text-[var(--text)]"
                style={{
                  backgroundImage: `linear-gradient(transparent 60%, ${highlightColor} 60%)`,
                  padding: "0 1px",
                }}
              >
                {m[1]}
              </strong>,
            );
            last = m.index + m[0].length;
          }
          if (last < para.length) {
            parts.push(
              <Fragment key={`t${pi}-${key++}`}>{para.slice(last)}</Fragment>,
            );
          }
          return (
            <p
              key={pi}
              className="whitespace-pre-wrap text-[14px] leading-[1.65] text-[var(--text)]"
            >
              {parts}
            </p>
          );
        })}
        {paragraphs.length === 0 && (
          <p className="text-xs text-[var(--text-muted)]">(미리보기 없음)</p>
        )}
      </div>
    </div>
  );
}

/** PubMed 참고문헌 — 카드 footer와 동일 형식. 편집은 Track 4 위저드에서 통합. */
function ReferenceDisplay({ pubmed_ref }: { pubmed_ref: PubmedRef }) {
  if (
    !pubmed_ref ||
    (!pubmed_ref.pmid && !pubmed_ref.doi && !pubmed_ref.title)
  ) {
    return (
      <p className="rounded-md border border-dashed border-[var(--border)] bg-[var(--bg-soft)]/40 px-3 py-2 text-xs text-[var(--text-muted)]">
        참고문헌 없음 (Step2 LLM 매칭이 적합 후보를 찾지 못한 카드 또는 미설정)
      </p>
    );
  }
  const url = pubmed_ref.pubmed_url ?? pubmed_ref.doi_url ?? "#";
  return (
    <div className="rounded-md border border-[var(--border)] bg-white px-3 py-2 text-[12px] leading-[1.55]">
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="font-medium text-[var(--text)] underline decoration-[var(--text-muted)]/40 underline-offset-[3px] hover:decoration-[var(--primary)]"
      >
        {pubmed_ref.title ?? "(제목 없음)"}
      </a>
      <div className="mt-0.5 text-[var(--text-secondary)]">
        {pubmed_ref.authors_short && <span>{pubmed_ref.authors_short} · </span>}
        {pubmed_ref.journal && <span>{pubmed_ref.journal}</span>}
        {pubmed_ref.year && <span> ({pubmed_ref.year})</span>}
      </div>
      <div className="mt-0.5 flex gap-3 text-[10px] text-[var(--text-muted)]">
        {pubmed_ref.pmid && (
          <a
            href={`https://pubmed.ncbi.nlm.nih.gov/${pubmed_ref.pmid}/`}
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-[var(--primary)]"
          >
            PMID: {pubmed_ref.pmid}
          </a>
        )}
        {pubmed_ref.doi && (
          <a
            href={`https://doi.org/${pubmed_ref.doi}`}
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
