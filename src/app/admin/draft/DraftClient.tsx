"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { DOCTORS_9 } from "@/lib/ai/identify-doctors";
import { pickHighlight } from "@/lib/qa-highlight";
import MarkdownBoldEditor from "@/components/MarkdownBoldEditor";
import { costUSD, formatUSD, formatTokens, type UsageLike } from "@/lib/ai/pricing";

// ── 위저드 타입 ────────────────────────────────────────

type DoctorMatch = {
  name: string;
  slug: string;
  frequency: number;
  selfIntro: boolean;
  inTitle: boolean;
};

type AnalyzeResp = {
  videoId: string;
  title: string | null;
  source: "ko-manual" | "ko-auto" | "en" | "default" | "unknown";
  transcript: string;
  doctors: DoctorMatch[];
  primary: DoctorMatch | null;
  empty: boolean;
};

type Step1Card = {
  question: string;
  answer: string;
  keywords: string[];
  category?: string;
  source: {
    video_id: string;
    video_title: string;
    source_file: string;
    video_url: string;
  };
  timestamp: { start: string; end?: string; start_seconds: number } | null;
  pubmed_search_keywords: string[];
  script_evidence?: string;
};

type PubmedRef = {
  pmid: string;
  doi: string;
  title: string;
  journal: string;
  year: string;
  authors_short: string;
  pubmed_url: string;
  doi_url: string;
} | null;

type Step2Result = {
  reference: PubmedRef;
  reasoning: string;
  candidates: Array<{
    pmid: string;
    title: string;
    journal: string;
    year: string;
    authors_short: string;
    doi: string;
  }>;
};

/** 카드별 편집용 상태 (Step1 출력 + 사용자 변경 반영) */
type EditableCard = {
  source: Step1Card["source"];
  scriptEvidence?: string;
  pubmedSearchKeywords: string[];

  question: string;
  answer: string;
  keywords: string[];
  category: string;
  doctorSlug: string;
  startSec: number;
  startInput: string;
  externalTitle: string;

  step2?: Step2Result;
};

const TRANSCRIPT_SOURCE_LABEL: Record<AnalyzeResp["source"], string> = {
  "ko-manual": "한국어 수동 자막",
  "ko-auto": "한국어 자동 자막",
  en: "영어 자막",
  default: "기본 자막",
  unknown: "알 수 없음",
};

function formatMMSS(sec: number): string {
  const s = Math.max(0, Math.floor(sec || 0));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
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
  if (startSec > 0) return `https://youtu.be/${videoId}?t=${startSec}s`;
  return `https://youtu.be/${videoId}`;
}

// ── 메인 컴포넌트 ─────────────────────────────────────

export default function DraftClient() {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [stage, setStage] = useState<
    | "idle"
    | "analyzing"
    | "analyzed"
    | "step1ing"
    | "stepped1"
    | "step2ing"
    | "stepped2"
    | "publishing"
  >("idle");
  const [error, setError] = useState<string | null>(null);

  const [analyze, setAnalyze] = useState<AnalyzeResp | null>(null);
  const [primarySlug, setPrimarySlug] = useState<string>("");
  const [cards, setCards] = useState<EditableCard[]>([]);

  // LLM 토큰 사용량 — Step1·Step2 별도 누적 (재실행 시 합산)
  type UsageAccum = UsageLike & { model: string; calls: number };
  const [step1Usage, setStep1Usage] = useState<UsageAccum | null>(null);
  const [step2Usage, setStep2Usage] = useState<UsageAccum | null>(null);

  // 자막 수동 입력 fallback — 자동 fetch 실패 시 운영자가 직접 붙여넣기
  const [manualFallback, setManualFallback] = useState(false);
  const [manualTranscript, setManualTranscript] = useState("");
  const [manualVideoId, setManualVideoId] = useState("");
  const [manualTitle, setManualTitle] = useState("");
  // OAuth 만료 감지 — analyze 응답의 oauthState='expired'면 재인증 버튼 노출
  const [oauthExpired, setOauthExpired] = useState(false);

  async function runAnalyze() {
    setError(null);
    setAnalyze(null);
    setCards([]);
    setStage("analyzing");
    try {
      const res = await fetch("/api/admin/draft/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: url.trim() }),
      });
      const data = (await res.json()) as
        | AnalyzeResp
        | { error: string; oauthState?: "disabled" | "ok" | "expired" | "error" };
      if (!res.ok || "error" in data) {
        setError("error" in data ? data.error : `분석 실패 (${res.status})`);
        // OAuth 만료가 원인일 수 있음 — 재인증 UI 노출
        if ("oauthState" in data && data.oauthState === "expired") {
          setOauthExpired(true);
        }
        // 자막 fetch 실패 → 수동 입력 fallback UI 노출
        setManualFallback(true);
        // 영상 ID는 URL에서 추출해서 채워두기
        const m = url.trim().match(/(?:v=|youtu\.be\/|embed\/|shorts\/)([a-zA-Z0-9_-]{11})/);
        if (m) setManualVideoId(m[1]);
        setStage("idle");
        return;
      }
      setManualFallback(false);
      setOauthExpired(false);
      setAnalyze(data);
      setPrimarySlug(data.primary?.slug ?? "");
      setStage("analyzed");
    } catch (e) {
      setError(e instanceof Error ? e.message : "네트워크 오류");
      setStage("idle");
    }
  }

  /**
   * 자막을 수동으로 붙여넣은 경우 — 클라이언트에서 9명 식별만 빠르게 처리.
   * (서버 API는 자막 fetch 포함이라 우회. 식별 로직은 동일 lib 사용.)
   */
  async function applyManualTranscript() {
    if (!manualTranscript.trim() || !manualVideoId.trim()) {
      setError("자막 본문과 영상 ID 모두 입력해주세요.");
      return;
    }
    setError(null);
    const { identifyDoctors } = await import("@/lib/ai/identify-doctors");
    const id = identifyDoctors({
      transcript: manualTranscript,
      videoTitle: manualTitle || null,
    });
    if (id.empty) {
      setError(
        "이 자막에는 등록된 원장 9명 중 누구도 등장하지 않습니다. Q&A 추출 대상이 아닙니다.",
      );
      return;
    }
    const fakeAnalyze: AnalyzeResp = {
      videoId: manualVideoId.trim(),
      title: manualTitle || null,
      source: "ko-manual",
      transcript: manualTranscript,
      doctors: id.matches,
      primary: id.primary,
      empty: id.empty,
    };
    setAnalyze(fakeAnalyze);
    setPrimarySlug(fakeAnalyze.primary?.slug ?? "");
    setManualFallback(false);
    setStage("analyzed");
  }

  async function runStep1() {
    if (!analyze) return;
    setError(null);
    setStage("step1ing");
    try {
      const res = await fetch("/api/admin/draft/step1", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transcript: analyze.transcript,
          videoId: analyze.videoId,
          videoTitle: analyze.title ?? "",
        }),
      });
      const data = (await res.json()) as
        | { drafts: Step1Card[]; usage?: UsageLike; model?: string }
        | { error: string };
      if (!res.ok || "error" in data) {
        setError("error" in data ? data.error : `Step1 실패 (${res.status})`);
        setStage("analyzed");
        return;
      }
      // 사용량 누적 (재실행 시 +1 call)
      if (data.usage) {
        setStep1Usage((prev) => ({
          input_tokens:
            (prev?.input_tokens ?? 0) + (data.usage?.input_tokens ?? 0),
          output_tokens:
            (prev?.output_tokens ?? 0) + (data.usage?.output_tokens ?? 0),
          cache_creation_input_tokens:
            (prev?.cache_creation_input_tokens ?? 0) +
            (data.usage?.cache_creation_input_tokens ?? 0),
          cache_read_input_tokens:
            (prev?.cache_read_input_tokens ?? 0) +
            (data.usage?.cache_read_input_tokens ?? 0),
          model: data.model ?? prev?.model ?? "claude-opus-4-7",
          calls: (prev?.calls ?? 0) + 1,
        }));
      }
      const editable: EditableCard[] = data.drafts.map((d) => {
        const sec = d.timestamp?.start_seconds ?? 0;
        return {
          source: d.source,
          scriptEvidence: d.script_evidence,
          pubmedSearchKeywords: d.pubmed_search_keywords ?? [],
          question: d.question,
          answer: d.answer,
          keywords: d.keywords ?? [],
          category: d.category ?? "",
          doctorSlug: primarySlug,
          startSec: sec,
          startInput: formatMMSS(sec),
          externalTitle: d.source.video_title || analyze.title || "",
        };
      });
      setCards(editable);
      setStage("stepped1");
    } catch (e) {
      setError(e instanceof Error ? e.message : "네트워크 오류");
      setStage("analyzed");
    }
  }

  async function runStep2() {
    if (!analyze || cards.length === 0) return;
    setError(null);
    setStage("step2ing");
    try {
      const res = await fetch("/api/admin/draft/step2", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cards: cards.map((c) => ({
            question: c.question,
            answer: c.answer,
            pubmed_search_keywords: c.pubmedSearchKeywords,
          })),
          retmax: 8,
        }),
      });
      // 빈 응답·timeout·HTML 에러 페이지 안전 처리 — 그냥 res.json() 하면 깨짐
      const raw = await res.text();
      if (!raw) {
        setError(
          `참고문헌 매칭 실패 (HTTP ${res.status}) — 응답이 비었습니다. ` +
            `LLM 호출 타임아웃 또는 서버 에러일 가능성이 큽니다. 서버 로그 확인 필요.`,
        );
        setStage("stepped1");
        return;
      }
      let data:
        | {
            results: Step2Result[];
            usage?: UsageLike;
            llm_calls?: number;
            model?: string;
            error?: string;
          }
        | { error: string };
      try {
        data = JSON.parse(raw);
      } catch {
        setError(
          `참고문헌 매칭 실패 (HTTP ${res.status}) — JSON 파싱 실패. ` +
            `응답 일부: ${raw.slice(0, 200)}`,
        );
        setStage("stepped1");
        return;
      }
      if (!res.ok || "error" in data) {
        setError(
          "error" in data && data.error
            ? data.error
            : `참고문헌 매칭 실패 (HTTP ${res.status})`,
        );
        setStage("stepped1");
        return;
      }
      if (data.usage) {
        setStep2Usage((prev) => ({
          input_tokens:
            (prev?.input_tokens ?? 0) + (data.usage?.input_tokens ?? 0),
          output_tokens:
            (prev?.output_tokens ?? 0) + (data.usage?.output_tokens ?? 0),
          cache_creation_input_tokens:
            (prev?.cache_creation_input_tokens ?? 0) +
            (data.usage?.cache_creation_input_tokens ?? 0),
          cache_read_input_tokens:
            (prev?.cache_read_input_tokens ?? 0) +
            (data.usage?.cache_read_input_tokens ?? 0),
          model: data.model ?? prev?.model ?? "claude-opus-4-7",
          calls: (prev?.calls ?? 0) + (data.llm_calls ?? 0),
        }));
      }
      setCards((prev) =>
        prev.map((c, i) => ({ ...c, step2: data.results[i] })),
      );
      setStage("stepped2");
    } catch (e) {
      setError(e instanceof Error ? e.message : "네트워크 오류");
      setStage("stepped1");
    }
  }

  async function publish() {
    if (!analyze || cards.length === 0) return;
    setError(null);
    setStage("publishing");
    try {
      const payload = {
        videoId: analyze.videoId,
        videoTitle: analyze.title ?? "",
        cards: cards.map((c) => ({
          question: c.question,
          answer: c.answer,
          keywords: c.keywords,
          category: c.category || null,
          doctorSlug: c.doctorSlug,
          externalUrl: buildExternalUrl(analyze.videoId, c.startSec),
          externalTitle: c.externalTitle,
          externalImage: `https://i.ytimg.com/vi/${analyze.videoId}/hqdefault.jpg`,
          timestampStartSec: c.startSec,
          scriptEvidence: c.scriptEvidence,
          pubmedRef: c.step2?.reference ?? null,
          pubmedReasoning: c.step2?.reasoning,
        })),
        status: "pending_review",
      };
      const res = await fetch("/api/admin/draft/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await res.json()) as
        | { saved: number; ids: number[] }
        | { error: string };
      if (!res.ok || "error" in data) {
        setError("error" in data ? data.error : `검수 보내기 실패 (${res.status})`);
        setStage("stepped2");
        return;
      }
      router.push(`/admin/qas?status=pending_review`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "네트워크 오류");
      setStage("stepped2");
    }
  }

  function updateCard(idx: number, patch: Partial<EditableCard>) {
    setCards((prev) => prev.map((c, i) => (i === idx ? { ...c, ...patch } : c)));
  }
  function commitStartInput(idx: number) {
    setCards((prev) =>
      prev.map((c, i) => {
        if (i !== idx) return c;
        const sec = parseMMSS(c.startInput);
        return { ...c, startSec: sec, startInput: formatMMSS(sec) };
      }),
    );
  }
  function deleteCard(idx: number) {
    if (!confirm(`카드 #${idx + 1}을 폐기합니다. 확인.`)) return;
    setCards((prev) => prev.filter((_, i) => i !== idx));
  }
  function applyCandidate(idx: number, pmid: string) {
    setCards((prev) =>
      prev.map((c, i) => {
        if (i !== idx || !c.step2) return c;
        const cand = c.step2.candidates.find((x) => x.pmid === pmid);
        if (!cand) return c;
        return {
          ...c,
          step2: {
            ...c.step2,
            reference: {
              pmid: cand.pmid,
              doi: cand.doi,
              title: cand.title,
              journal: cand.journal,
              year: cand.year,
              authors_short: cand.authors_short,
              pubmed_url: `https://pubmed.ncbi.nlm.nih.gov/${cand.pmid}/`,
              doi_url: cand.doi ? `https://doi.org/${cand.doi}` : "",
            },
            reasoning: `수동 선택: ${pmid}`,
          },
        };
      }),
    );
  }
  function clearReference(idx: number) {
    setCards((prev) =>
      prev.map((c, i) => {
        if (i !== idx || !c.step2) return c;
        return {
          ...c,
          step2: { ...c.step2, reference: null, reasoning: "수동: 참고문헌 없음" },
        };
      }),
    );
  }

  return (
    <div className="space-y-5">
      {/* [1] URL 입력 + Step 1. 자막 추출 */}
      <section className="space-y-3 rounded-[var(--radius)] border border-[var(--border)] bg-white p-5">
        <div>
          <label className="mb-1 block text-sm font-semibold text-[var(--text-secondary)]">
            YouTube URL
          </label>
          <input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://www.youtube.com/watch?v=..."
            className="w-full rounded-md border border-[var(--border)] px-3 py-2 outline-none focus:border-[var(--primary)]"
            disabled={!!analyze}
          />
        </div>
        <button
          type="button"
          onClick={runAnalyze}
          disabled={stage === "analyzing" || !url.trim() || !!analyze}
          className={`w-full rounded-md py-2.5 font-semibold text-white transition-opacity disabled:opacity-100 ${
            analyze
              ? "bg-[var(--text-muted)] cursor-default"
              : "bg-[var(--primary)] disabled:opacity-50"
          }`}
        >
          {stage === "analyzing"
            ? "Step 1. 자막 추출 중… (자막 + 원장 식별)"
            : analyze
              ? "✓ Step 1. 자막 추출 완료"
              : "Step 1. 자막 추출"}
        </button>
      </section>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* OAuth 만료 — 1-click 재인증 버튼 */}
      {oauthExpired && (
        <div className="flex items-center justify-between gap-3 rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <div>
            <div className="font-semibold">YouTube OAuth 토큰 만료</div>
            <div className="text-xs">
              테스트 모드는 7일에 1번 재인증이 필요합니다. 새 창이 열리면 반드시{" "}
              <b>pibutenten@gmail.com</b>으로 동의해주세요.
            </div>
          </div>
          <a
            href="/api/admin/youtube-oauth/start"
            target="_blank"
            rel="noopener noreferrer"
            className="whitespace-nowrap rounded-md bg-amber-600 px-3 py-2 text-sm font-semibold text-white hover:bg-amber-700"
          >
            🔑 재인증 (5초)
          </a>
        </div>
      )}

      {/* 자막 수동 fallback — 자동 fetch 실패 시 운영자가 직접 붙여넣기 */}
      {manualFallback && !analyze && (
        <section className="space-y-3 rounded-[var(--radius)] border border-amber-300 bg-amber-50/40 p-5">
          <div>
            <p className="mb-1 text-sm font-semibold text-amber-800">
              자동 자막 추출이 막힌 영상입니다.
            </p>
            <p className="text-xs text-amber-700">
              YouTube에서 직접 자막을 복사해 아래에 붙여넣어주세요. ‘…
              더보기’ → ‘스크립트 표시’를 누르면 자막 전체를 한 번에 복사할 수
              있습니다.
            </p>
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs text-amber-800">
                영상 ID (11자)
              </label>
              <input
                type="text"
                value={manualVideoId}
                onChange={(e) => setManualVideoId(e.target.value)}
                placeholder="Jsu_96-DLcQ"
                className="w-full rounded-md border border-amber-300 bg-white px-3 py-2 text-sm focus:border-amber-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-amber-800">
                영상 제목 (선택)
              </label>
              <input
                type="text"
                value={manualTitle}
                onChange={(e) => setManualTitle(e.target.value)}
                placeholder="자동으로 채워지지 않으면 직접 입력"
                className="w-full rounded-md border border-amber-300 bg-white px-3 py-2 text-sm focus:border-amber-500 focus:outline-none"
              />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs text-amber-800">
              자막 본문 (한국어, 1000자 이상 권장)
            </label>
            <textarea
              value={manualTranscript}
              onChange={(e) => setManualTranscript(e.target.value)}
              rows={10}
              placeholder="자막 전체를 그대로 붙여넣기 (시간 표시는 있어도 무관)"
              className="w-full rounded-md border border-amber-300 bg-white px-3 py-2 text-sm leading-[1.65] focus:border-amber-500 focus:outline-none"
            />
            <p className="mt-1 text-[11px] text-amber-700">
              현재 {manualTranscript.length.toLocaleString()}자
            </p>
          </div>
          <button
            type="button"
            onClick={applyManualTranscript}
            disabled={
              !manualTranscript.trim() || manualTranscript.trim().length < 100
            }
            className="w-full rounded-md bg-amber-600 py-2 font-semibold text-white hover:bg-amber-700 disabled:opacity-50"
          >
            붙여넣은 자막으로 진행
          </button>
        </section>
      )}

      {/* [2] 영상 분석 결과 */}
      {analyze && (
        <section className="space-y-3 rounded-[var(--radius)] border border-[var(--border)] bg-white p-5">
          <div className="mb-1 text-sm font-semibold text-[var(--text-secondary)]">
            ② 영상 분석 결과
          </div>
          <div className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
            <Field label="영상 제목" value={analyze.title ?? "(없음)"} />
            <Field label="영상 ID" value={analyze.videoId} />
            <Field
              label="자막"
              value={`${TRANSCRIPT_SOURCE_LABEL[analyze.source]} (${analyze.transcript.length.toLocaleString()}자)`}
            />
          </div>

          {analyze.empty ? (
            <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              이 영상에는 등록된 원장 9명 중 누구도 등장하지 않습니다. Q&A 추출
              대상이 아닙니다.
            </div>
          ) : (
            <>
              <div className="rounded-md bg-[var(--bg-soft)] p-3">
                <p className="mb-2 text-xs font-semibold text-[var(--text-secondary)]">
                  🎤 출연 원장 (자동 식별)
                </p>
                <div className="space-y-1.5">
                  {analyze.doctors.map((d) => (
                    <label
                      key={d.slug}
                      className="flex items-center gap-2 text-sm"
                    >
                      <input
                        type="radio"
                        name="primary-doctor"
                        value={d.slug}
                        checked={primarySlug === d.slug}
                        onChange={() => setPrimarySlug(d.slug)}
                      />
                      <span className="font-medium">{d.name}</span>
                      <span className="text-xs text-[var(--text-muted)]">
                        자막 {d.frequency}회
                        {d.selfIntro && " · 자기소개 ✓"}
                        {d.inTitle && " · 제목 ✓"}
                      </span>
                    </label>
                  ))}
                </div>
                <p className="mt-2 text-[11px] text-[var(--text-muted)]">
                  주 화자(◉)는 모든 카드의 기본 화자가 됩니다. 카드별로 개별
                  변경 가능.
                </p>
              </div>

              <button
                type="button"
                onClick={runStep1}
                disabled={
                  stage === "step1ing" ||
                  stage === "step2ing" ||
                  !primarySlug ||
                  cards.length > 0
                }
                className={`w-full rounded-md py-2.5 font-semibold text-white transition-opacity disabled:opacity-100 ${
                  cards.length > 0
                    ? "bg-[var(--text-muted)] cursor-default"
                    : "bg-[var(--primary)] disabled:opacity-50"
                }`}
              >
                {stage === "step1ing"
                  ? "Step 2. Q&A 카드 생성 중… (LLM — 30~60초)"
                  : cards.length > 0
                    ? "✓ Step 2. Q&A 카드 생성 완료"
                    : "Step 2. Q&A 카드 생성"}
              </button>
            </>
          )}
        </section>
      )}

      {/* [3] Q&A 카드 N개 — 검수·편집 (PubMed 매칭 박스보다 위에 위치) */}
      {cards.length > 0 && analyze && (
        <section className="space-y-3 rounded-[var(--radius)] border border-[var(--border)] bg-white p-5">
          <div className="mb-1 text-sm font-semibold text-[var(--text-secondary)]">
            Q&A 카드 ({cards.length}개) — 검수·편집
          </div>

          <div className="space-y-4">
            {cards.map((c, i) => (
              <CardEditor
                key={i}
                index={i}
                card={c}
                videoId={analyze.videoId}
                onChange={(patch) => updateCard(i, patch)}
                onCommitStart={() => commitStartInput(i)}
                onDelete={() => deleteCard(i)}
                onApplyCandidate={(pmid) => applyCandidate(i, pmid)}
                onClearReference={() => clearReference(i)}
              />
            ))}
          </div>
        </section>
      )}

      {/* [4] Step 3. PubMed 검색 — 카드 아래에 위치 */}
      {cards.length > 0 && analyze && (
        <section className="space-y-3 rounded-[var(--radius)] border border-[var(--border)] bg-white p-5">
          <p className="text-xs text-[var(--text-muted)]">
            각 카드 답변에 맞는 PubMed 논문 후보를 찾아 best reference 1개를
            자동 선택. 카드별로 다른 후보로 교체·확인 가능.
          </p>
          <button
            type="button"
            onClick={runStep2}
            disabled={stage === "step2ing" || cards.some((c) => c.step2)}
            className={`w-full rounded-md py-2.5 font-semibold text-white transition-opacity disabled:opacity-100 ${
              cards.some((c) => c.step2)
                ? "bg-[var(--text-muted)] cursor-default"
                : "bg-[var(--primary)] disabled:opacity-50"
            }`}
          >
            {stage === "step2ing"
              ? "Step 3. PubMed 검색 중… (PubMed + LLM 선정)"
              : cards.some((c) => c.step2)
                ? "✓ Step 3. PubMed 검색 완료"
                : "Step 3. PubMed 검색"}
          </button>
        </section>
      )}

      {/* [5] LLM 토큰·비용 요약 — Step3 밑에 별도 카드 */}
      {cards.length > 0 && analyze && (step1Usage || step2Usage) && (
        <section className="rounded-[var(--radius)] border border-[var(--border)] bg-white p-5">
          <UsageSummary step1={step1Usage} step2={step2Usage} />
        </section>
      )}

      {/* [6] Step 4. 검수 보내기 */}
      {cards.length > 0 && analyze && (
        <section className="space-y-3 rounded-[var(--radius)] border border-[var(--border)] bg-white p-5">
          <button
            type="button"
            onClick={publish}
            disabled={stage === "publishing" || cards.length === 0}
            className="w-full rounded-md bg-[var(--primary)] py-2.5 font-semibold text-white transition-opacity disabled:opacity-50"
          >
            {stage === "publishing"
              ? "검수 보내는 중…"
              : `Step 4. ${cards.length}개 카드 원장님께 검수 보내기`}
          </button>
          <p className="text-center text-[11px] text-[var(--text-muted)]">
            검수 보낸 카드는 원장님 검수 대시보드에서 확인·발행됩니다.
          </p>
        </section>
      )}
    </div>
  );
}

// ── 카드 에디터 ────────────────────────────────────────

function CardEditor({
  index,
  card,
  videoId,
  onChange,
  onCommitStart,
  onDelete,
  onApplyCandidate,
  onClearReference,
}: {
  index: number;
  card: EditableCard;
  videoId: string;
  onChange: (patch: Partial<EditableCard>) => void;
  onCommitStart: () => void;
  onDelete: () => void;
  onApplyCandidate: (pmid: string) => void;
  onClearReference: () => void;
}) {
  const externalUrl = buildExternalUrl(videoId, card.startSec);
  const highlightColor = useMemo(
    () => pickHighlight(`draft-${index}-${videoId}`),
    [index, videoId],
  );
  const doctorName =
    DOCTORS_9.find((d) => d.slug === card.doctorSlug)?.name ?? "(미지정)";

  return (
    <article className="space-y-3 rounded-md border border-[var(--border)] bg-[var(--bg-soft)]/30 p-4">
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs font-semibold text-[var(--text-muted)]">
          <span>카드 #{index + 1}</span>
          {card.category && (
            <span className="rounded-full bg-white px-2 py-0.5 text-[10px]">
              {card.category}
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={onDelete}
          className="text-xs text-red-600 hover:underline"
        >
          폐기
        </button>
      </header>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-xs text-[var(--text-secondary)]">
            화자
          </label>
          {/* readonly chip — 추출 단계 주 화자로 고정. 변경하려면 ② 단계 라디오에서 */}
          <div className="flex items-center gap-2 rounded-md border border-[var(--border)] bg-white px-3 py-2 text-sm">
            <span className="font-medium text-[var(--text)]">{doctorName}</span>
            <span className="text-[10px] text-[var(--text-muted)]">
              (주 화자 고정)
            </span>
          </div>
        </div>
        <div>
          <label className="mb-1 block text-xs text-[var(--text-secondary)]">
            시작 시각 (MM:SS)
          </label>
          <input
            type="text"
            value={card.startInput}
            onChange={(e) => onChange({ startInput: e.target.value })}
            onBlur={onCommitStart}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                onCommitStart();
              }
            }}
            placeholder="00:00"
            className="w-full rounded-md border border-[var(--border)] bg-white px-3 py-2 text-sm focus:border-[var(--primary)]"
          />
        </div>
      </div>

      <div>
        <label className="mb-1 block text-xs text-[var(--text-secondary)]">
          영상 링크 (시작 시각 자동 반영)
        </label>
        <div className="flex gap-2">
          <input
            type="text"
            value={externalUrl}
            readOnly
            className="flex-1 rounded-md border border-[var(--border)] bg-white px-3 py-2 text-sm text-[var(--text-secondary)]"
          />
          <a
            href={externalUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-md border border-[var(--border)] bg-white px-3 py-2 text-xs font-medium text-[var(--text-secondary)] hover:border-[var(--primary)] hover:text-[var(--primary)]"
          >
            ↗ 열기
          </a>
        </div>
      </div>

      <div>
        <label className="mb-1 block text-xs text-[var(--text-secondary)]">
          영상 제목 <span className="text-[10px] text-[var(--text-muted)]">(자동, 수정 불가)</span>
        </label>
        <input
          type="text"
          value={card.externalTitle}
          readOnly
          className="w-full rounded-md border border-[var(--border)] bg-[var(--bg-soft)]/40 px-3 py-2 text-sm text-[var(--text-secondary)]"
        />
      </div>

      <div>
        <label className="mb-1 block text-xs text-[var(--text-secondary)]">
          질문
        </label>
        <input
          type="text"
          value={card.question}
          onChange={(e) => onChange({ question: e.target.value })}
          className="w-full rounded-md border border-[var(--border)] bg-white px-3 py-2 text-base font-bold focus:border-[var(--primary)]"
        />
      </div>

      <div>
        <label className="mb-1 block text-xs text-[var(--text-secondary)]">
          답변{" "}
          <span className="text-[10px] text-[var(--text-muted)]">
            ({card.answer.length}자, 목표 400~600자)
          </span>
        </label>
        <MarkdownBoldEditor
          value={card.answer}
          onChange={(md) => onChange({ answer: md })}
          highlightColor={highlightColor}
          placeholder="답변 본문 (텍스트 선택 후 [B 굵게] 또는 Ctrl+B로 형광펜 적용)"
          minHeight={280}
        />
      </div>

      <div>
        <label className="mb-1 block text-xs text-[var(--text-secondary)]">
          키워드 (쉼표로 구분)
        </label>
        <input
          type="text"
          value={card.keywords.join(", ")}
          onChange={(e) =>
            onChange({
              keywords: e.target.value
                .split(",")
                .map((k) => k.trim())
                .filter(Boolean),
            })
          }
          className="w-full rounded-md border border-[var(--border)] bg-white px-3 py-2 text-sm focus:border-[var(--primary)]"
        />
      </div>

      {card.step2 && (
        <ReferenceSection
          step2={card.step2}
          onApplyCandidate={onApplyCandidate}
          onClearReference={onClearReference}
        />
      )}
    </article>
  );
}

/** 참고문헌 영역 — 결정된 ref + 후보 펼치기 + 확인 후 적용 */
function ReferenceSection({
  step2,
  onApplyCandidate,
  onClearReference,
}: {
  step2: Step2Result;
  onApplyCandidate: (pmid: string) => void;
  onClearReference: () => void;
}) {
  const [showCandidates, setShowCandidates] = useState(false);
  const [previewPmid, setPreviewPmid] = useState<string | null>(null);
  const preview = step2.candidates.find((c) => c.pmid === previewPmid) ?? null;

  return (
    <div className="space-y-2 rounded-md border border-[var(--border)] bg-white p-3 text-xs">
      <div className="flex items-center justify-between">
        <span className="font-semibold text-[var(--text-secondary)]">
          참고문헌 (PubMed)
        </span>
        <div className="flex items-center gap-2">
          {step2.candidates.length > 0 && (
            <button
              type="button"
              onClick={() => {
                setShowCandidates((v) => !v);
                setPreviewPmid(null);
              }}
              className="rounded border border-[var(--border)] bg-white px-2 py-1 text-[11px] text-[var(--text-secondary)] hover:border-[var(--primary)] hover:text-[var(--primary)]"
            >
              {showCandidates
                ? "후보 닫기"
                : `후보 ${step2.candidates.length}개 보기`}
            </button>
          )}
          <button
            type="button"
            onClick={onClearReference}
            className="rounded border border-[var(--border)] bg-white px-2 py-1 text-[11px] text-[var(--text-secondary)] hover:border-[var(--primary)] hover:text-[var(--primary)]"
          >
            없음으로
          </button>
        </div>
      </div>

      {/* 현재 결정된 참고문헌 — 전체 너비 */}
      {step2.reference ? (
        <div className="rounded-md bg-[var(--bg-soft)]/60 p-2.5">
          <ReferenceLine r={step2.reference} />
        </div>
      ) : (
        <p className="text-[var(--text-muted)]">
          참고문헌 없음 — {step2.reasoning}
        </p>
      )}

      {/* 후보 펼치기 — 클릭 시 미리보기, 확인 버튼으로 결정 */}
      {showCandidates && step2.candidates.length > 0 && (
        <div className="space-y-1.5 rounded-md border border-dashed border-[var(--border)] p-2">
          <p className="text-[11px] font-semibold text-[var(--text-muted)]">
            후보 ({step2.candidates.length}) — 클릭해서 미리보고 “이걸로 적용” 누르세요
          </p>
          <ul className="space-y-1">
            {step2.candidates.map((c) => {
              const selected = c.pmid === previewPmid;
              const current = step2.reference?.pmid === c.pmid;
              return (
                <li key={c.pmid}>
                  <button
                    type="button"
                    onClick={() => setPreviewPmid(selected ? null : c.pmid)}
                    className={`w-full rounded border px-2 py-1.5 text-left text-[11px] transition-colors ${
                      selected
                        ? "border-[var(--primary)] bg-[var(--primary)]/5"
                        : "border-[var(--border)] bg-white hover:border-[var(--primary)]/50"
                    }`}
                  >
                    <div className="flex items-start gap-2">
                      <span className="mt-0.5 inline-block min-w-3 text-[10px] text-[var(--text-muted)]">
                        {selected ? "▾" : "▸"}
                      </span>
                      <span className="flex-1">
                        <span className="block font-medium text-[var(--text)]">
                          {c.title || "(제목 없음)"}
                          {current && (
                            <span className="ml-1 rounded-full bg-[var(--primary)]/10 px-1.5 py-0.5 text-[9px] font-semibold text-[var(--primary)]">
                              현재
                            </span>
                          )}
                        </span>
                        <span className="block text-[var(--text-secondary)]">
                          {c.authors_short && `${c.authors_short} · `}
                          {c.journal && `${c.journal}`}
                          {c.year && ` (${c.year})`}
                        </span>
                      </span>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
          {preview && (
            <div className="rounded-md border border-[var(--primary)]/30 bg-[var(--primary)]/5 p-2 text-[11px]">
              <p className="mb-1 font-semibold text-[var(--text)]">
                {preview.title}
              </p>
              <p className="text-[var(--text-secondary)]">
                {preview.authors_short && `${preview.authors_short} · `}
                {preview.journal && `${preview.journal}`}
                {preview.year && ` (${preview.year})`}
              </p>
              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    onApplyCandidate(preview.pmid);
                    setShowCandidates(false);
                    setPreviewPmid(null);
                  }}
                  className="rounded-md bg-[var(--primary)] px-3 py-1.5 text-[11px] font-semibold text-white hover:opacity-90"
                >
                  ✓ 이걸로 적용
                </button>
                <a
                  href={`https://pubmed.ncbi.nlm.nih.gov/${preview.pmid}/`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-md border border-[var(--border)] bg-white px-3 py-1.5 text-[11px] text-[var(--text-secondary)] hover:border-[var(--primary)] hover:text-[var(--primary)]"
                >
                  PubMed 열기 ↗
                </a>
                <button
                  type="button"
                  onClick={() => setPreviewPmid(null)}
                  className="rounded-md border border-[var(--border)] bg-white px-3 py-1.5 text-[11px] text-[var(--text-secondary)] hover:border-[var(--primary)] hover:text-[var(--primary)]"
                >
                  취소
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ReferenceLine({
  r,
}: {
  r: NonNullable<Step2Result["reference"]>;
}) {
  return (
    <div>
      <a
        href={r.pubmed_url}
        target="_blank"
        rel="noopener noreferrer"
        className="font-medium text-[var(--text)] underline decoration-[var(--text-muted)]/40 underline-offset-[3px] hover:decoration-[var(--primary)]"
      >
        {r.title}
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

/** LLM 토큰·비용 요약 — Step1·Step2 합계 + 모델별 USD 환산. */
function UsageSummary({
  step1,
  step2,
}: {
  step1: (UsageLike & { model: string; calls: number }) | null;
  step2: (UsageLike & { model: string; calls: number }) | null;
}) {
  const cost1 = step1 ? costUSD(step1.model, step1) : 0;
  const cost2 = step2 ? costUSD(step2.model, step2) : 0;
  const totalIn =
    (step1?.input_tokens ?? 0) +
    (step1?.cache_creation_input_tokens ?? 0) +
    (step1?.cache_read_input_tokens ?? 0) +
    (step2?.input_tokens ?? 0) +
    (step2?.cache_creation_input_tokens ?? 0) +
    (step2?.cache_read_input_tokens ?? 0);
  const totalOut = (step1?.output_tokens ?? 0) + (step2?.output_tokens ?? 0);
  const totalCost = cost1 + cost2;
  const model = step1?.model ?? step2?.model ?? "claude-opus-4-7";

  return (
    <div className="rounded-md border border-[var(--border)] bg-[var(--bg-soft)]/60 p-3 text-xs">
      <div className="mb-2 flex items-center justify-between">
        <span className="font-semibold text-[var(--text-secondary)]">
          LLM 사용량 (모델: {model})
        </span>
        <span className="font-bold text-[var(--primary)]">
          합계 {formatUSD(totalCost)}
        </span>
      </div>
      <table className="w-full text-[11px]">
        <thead className="text-[var(--text-muted)]">
          <tr>
            <th className="pb-1 text-left font-medium">단계</th>
            <th className="pb-1 text-right font-medium">호출</th>
            <th className="pb-1 text-right font-medium">input</th>
            <th className="pb-1 text-right font-medium">output</th>
            <th className="pb-1 text-right font-medium">비용</th>
          </tr>
        </thead>
        <tbody className="text-[var(--text-secondary)]">
          {step1 && (
            <tr>
              <td className="py-0.5">Step1 Q&A 추출</td>
              <td className="py-0.5 text-right">{step1.calls}회</td>
              <td className="py-0.5 text-right">
                {formatTokens(step1.input_tokens)}
              </td>
              <td className="py-0.5 text-right">
                {formatTokens(step1.output_tokens)}
              </td>
              <td className="py-0.5 text-right font-medium text-[var(--text)]">
                {formatUSD(cost1)}
              </td>
            </tr>
          )}
          {step2 && (
            <tr>
              <td className="py-0.5">Step2 PubMed 매칭</td>
              <td className="py-0.5 text-right">{step2.calls}회</td>
              <td className="py-0.5 text-right">
                {formatTokens(step2.input_tokens)}
              </td>
              <td className="py-0.5 text-right">
                {formatTokens(step2.output_tokens)}
              </td>
              <td className="py-0.5 text-right font-medium text-[var(--text)]">
                {formatUSD(cost2)}
              </td>
            </tr>
          )}
          <tr className="border-t border-[var(--border)]">
            <td className="pt-1 font-semibold text-[var(--text)]">합계</td>
            <td className="pt-1 text-right font-semibold text-[var(--text)]">
              {(step1?.calls ?? 0) + (step2?.calls ?? 0)}회
            </td>
            <td className="pt-1 text-right font-semibold text-[var(--text)]">
              {formatTokens(totalIn)}
            </td>
            <td className="pt-1 text-right font-semibold text-[var(--text)]">
              {formatTokens(totalOut)}
            </td>
            <td className="pt-1 text-right font-bold text-[var(--primary)]">
              {formatUSD(totalCost)}
            </td>
          </tr>
        </tbody>
      </table>
      <p className="mt-1 text-[10px] text-[var(--text-muted)]">
        가격: Claude Opus 4 기준 input $15/M · output $75/M (cache write $18.75/M,
        cache read $1.5/M)
      </p>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-[var(--bg-soft)] px-3 py-2">
      <div className="text-[10px] text-[var(--text-muted)]">{label}</div>
      <div className="mt-0.5 text-sm text-[var(--text)]">{value}</div>
    </div>
  );
}
