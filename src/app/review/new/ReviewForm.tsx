"use client";

/**
 * ReviewForm — 시술후기 입력 폼 (P3-d, client).
 *
 * 백엔드: POST /api/reviews (이미 구현). body 계약:
 *   필수 procedure_ko / satisfaction / effect / pain / recovery_days(0~365) / would_recommend
 *   선택 area / cost_satisfaction / effect_areas / body / title
 *   응답 { card_id, shortcode, status, screening }.
 *
 * 디자인은 기존 CardEditor / KeywordsEditor / globals.css 토큰을 그대로 재사용.
 * 모바일 우선. 제출 패턴(토스트·screening 안내·redirect)은 WriteClient 모사.
 */

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { showToast } from "@/lib/toast";
import { pickErrorMessage } from "@/lib/api-error";

export type ProcedureOption = {
  /** 서버 검증값 = procedure_taxonomy.ko */
  value: string;
  /** 표시명 */
  label: string;
  /** 하위 시술이면 상위 ko, 정식 시술이면 null */
  parentKo: string | null;
  /** 그룹 헤더 라벨 (리프팅/주입) */
  categoryLabel: string;
};

type Props = {
  procedures: ProcedureOption[];
  /** active 명함 handle — 제출 성공 시 /{handle}/{shortcode} 이동 */
  handle: string;
};

const BODY_MAX = 4000;
const AREA_MAX = 60;
const RECOVERY_MAX = 365;

// 효과 체감 분야 후보 — 멀티 칩 (확장 가능하게 배열 상수).
const EFFECT_AREA_OPTIONS = ["동안", "피부장벽"] as const;

const PAIN_LABELS = ["약함", "조금", "보통", "꽤", "심함"] as const;

export default function ReviewForm({ procedures, handle }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  /* ── 필수 ── */
  const [procedureKo, setProcedureKo] = useState("");
  const [procSearch, setProcSearch] = useState("");
  const [procOpen, setProcOpen] = useState(false);
  const [satisfaction, setSatisfaction] = useState<number>(0);
  const [effect, setEffect] = useState<number>(0);
  const [pain, setPain] = useState<number>(0);
  const [recoveryDays, setRecoveryDays] = useState<string>("");
  const [wouldRecommend, setWouldRecommend] = useState<boolean | null>(null);

  /* ── 선택 ── */
  const [area, setArea] = useState("");
  const [costSatisfaction, setCostSatisfaction] = useState<number>(0);
  const [effectAreas, setEffectAreas] = useState<string[]>([]);
  const [body, setBody] = useState("");

  /* ── 시술 선택 — 검색 필터 + 그룹 표시 ── */
  const filtered = useMemo(() => {
    const q = procSearch.trim().toLowerCase();
    if (!q) return procedures;
    return procedures.filter((p) => {
      const hay = (p.label + " " + (p.parentKo ?? "")).toLowerCase();
      return hay.includes(q);
    });
  }, [procedures, procSearch]);

  const selected = useMemo(
    () => procedures.find((p) => p.value === procedureKo) ?? null,
    [procedures, procedureKo],
  );

  // 선택된 시술의 표시 텍스트 — 하위면 "상위 › 하위".
  const selectedLabel = selected
    ? selected.parentKo
      ? `${selected.parentKo} › ${selected.label}`
      : selected.label
    : "";

  function pickProcedure(p: ProcedureOption) {
    setProcedureKo(p.value);
    setProcOpen(false);
    setProcSearch("");
    setError(null);
  }

  function toggleEffectArea(v: string) {
    setEffectAreas((prev) =>
      prev.includes(v) ? prev.filter((x) => x !== v) : [...prev, v],
    );
  }

  /* ── 제출 ── */
  function validate(): string | null {
    if (!procedureKo) return "시술을 선택해주세요.";
    if (satisfaction < 1) return "만족도를 선택해주세요.";
    if (effect < 1) return "효과 체감을 선택해주세요.";
    if (pain < 1) return "통증 정도를 선택해주세요.";
    const days = Number(recoveryDays);
    if (
      recoveryDays.trim() === "" ||
      !Number.isInteger(days) ||
      days < 0 ||
      days > RECOVERY_MAX
    ) {
      return `회복기간을 0~${RECOVERY_MAX}일 사이로 입력해주세요.`;
    }
    if (wouldRecommend === null) return "추천 의향을 선택해주세요.";
    return null;
  }

  function submit() {
    setError(null);
    const v = validate();
    if (v) {
      setError(v);
      return;
    }

    const payload: Record<string, unknown> = {
      procedure_ko: procedureKo,
      satisfaction,
      effect,
      pain,
      recovery_days: Number(recoveryDays),
      would_recommend: wouldRecommend,
    };
    const trimmedArea = area.trim();
    if (trimmedArea) payload.area = trimmedArea;
    if (costSatisfaction >= 1) payload.cost_satisfaction = costSatisfaction;
    if (effectAreas.length > 0) payload.effect_areas = effectAreas;
    const trimmedBody = body.trim();
    if (trimmedBody) payload.body = trimmedBody;

    startTransition(async () => {
      try {
        const res = await fetch("/api/reviews", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

        if (!res.ok) {
          const data = (await res.json().catch(() => null)) as {
            error?: string;
            message?: string;
            userMessage?: string;
          } | null;
          // 병원·의사명 차단(400) 등은 서버 안내(message/userMessage)를 그대로 노출.
          setError(
            pickErrorMessage(
              { error: data?.error, message: data?.message ?? data?.userMessage },
              res.status,
            ),
          );
          return;
        }

        const data = (await res.json()) as {
          card_id: number | null;
          shortcode: string;
          status: string;
          screening?: {
            status: string;
            reasons: string[];
            userMessage: string;
          } | null;
        };

        // 검수 대기로 전환된 경우 1회 안내 후 이동 (WriteClient 패턴).
        if (data.screening) {
          showToast(
            data.screening.userMessage ||
              "후기가 검토 대기로 전환되었습니다.",
            { tone: "danger" },
          );
          await new Promise((r) => setTimeout(r, 1500));
        }

        const dest =
          handle && data.shortcode ? `/${handle}/${data.shortcode}` : "/";
        router.push(dest);
        router.refresh();
        window.scrollTo({ top: 0, behavior: "smooth" });
      } catch (e) {
        setError(e instanceof Error ? e.message : "네트워크 오류가 발생했어요.");
      }
    });
  }

  return (
    <section className="w-full py-6">
      <h1 className="mb-5 text-center text-[20px] font-bold leading-[1.4] text-[var(--text)]">
        시술 후기를 남겨주세요
      </h1>

      <div className="space-y-5 rounded-[var(--radius)] border border-[var(--border)] bg-white p-5 shadow-[var(--shadow-sm)]">
        {/* ── 시술 선택 (필수) ── */}
        <div>
          <label className="mb-1 block text-sm font-semibold text-[var(--text)]">
            시술 <span className="text-[var(--accent)]">*</span>
          </label>
          <div className="relative">
            <button
              type="button"
              onClick={() => setProcOpen((o) => !o)}
              disabled={pending}
              className="flex h-10 w-full items-center justify-between rounded-md border border-[var(--border)] bg-white px-3 text-left text-base focus:border-[var(--primary)] focus:outline-none disabled:opacity-50"
            >
              <span
                className={
                  selectedLabel
                    ? "font-medium text-[var(--text)]"
                    : "text-[var(--text-muted)]"
                }
              >
                {selectedLabel || "시술을 선택하세요"}
              </span>
              <span aria-hidden className="text-[var(--text-muted)]">
                ▾
              </span>
            </button>

            {procOpen && (
              <div className="absolute z-20 mt-1 max-h-72 w-full overflow-y-auto rounded-md border border-[var(--border)] bg-white shadow-[var(--shadow)]">
                <div className="sticky top-0 border-b border-[var(--border)] bg-white p-2">
                  <input
                    type="text"
                    autoFocus
                    value={procSearch}
                    onChange={(e) => setProcSearch(e.target.value)}
                    placeholder="시술명 검색"
                    className="h-9 w-full rounded-[var(--radius-sm)] border border-[var(--border)] bg-white px-3 text-sm focus:border-[var(--primary)] focus:outline-none"
                  />
                </div>
                {filtered.length === 0 ? (
                  <p className="px-3 py-4 text-center text-sm text-[var(--text-muted)]">
                    검색 결과가 없습니다.
                  </p>
                ) : (
                  <ul className="py-1">
                    {filtered.map((p, i) => {
                      // 그룹 헤더 — 카테고리가 바뀌는 지점에 표시 (검색 안 했을 때만 깔끔).
                      const prev = filtered[i - 1];
                      const showHeader =
                        !prev || prev.categoryLabel !== p.categoryLabel;
                      return (
                        <li key={p.value}>
                          {showHeader && (
                            <div className="bg-[var(--bg-soft)] px-3 py-1 text-[11px] font-semibold text-[var(--text-muted)]">
                              {p.categoryLabel}
                            </div>
                          )}
                          <button
                            type="button"
                            onClick={() => pickProcedure(p)}
                            className={`block w-full px-3 py-2 text-left text-sm hover:bg-[var(--primary-soft)] ${
                              p.parentKo
                                ? "pl-6 text-[var(--text-secondary)]"
                                : "font-medium text-[var(--text)]"
                            } ${
                              p.value === procedureKo
                                ? "bg-[var(--primary-soft)]"
                                : ""
                            }`}
                          >
                            {p.parentKo ? (
                              <span>
                                <span className="text-[var(--text-muted)]">
                                  {p.parentKo} ›{" "}
                                </span>
                                {p.label}
                              </span>
                            ) : (
                              p.label
                            )}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            )}
          </div>
        </div>

        {/* ── 만족도 (필수) ── */}
        <StarField
          label="만족도"
          required
          value={satisfaction}
          onChange={setSatisfaction}
          disabled={pending}
        />

        {/* ── 효과 체감 (필수) ── */}
        <StarField
          label="효과 체감"
          required
          value={effect}
          onChange={setEffect}
          disabled={pending}
        />

        {/* ── 통증 (필수) ── */}
        <SegmentField
          label="통증"
          required
          value={pain}
          onChange={setPain}
          labels={PAIN_LABELS}
          hint="1 약함 ~ 5 심함"
          disabled={pending}
        />

        {/* ── 회복기간 (필수) ── */}
        <div>
          <label className="mb-1 block text-sm font-semibold text-[var(--text)]">
            회복기간 <span className="text-[var(--accent)]">*</span>{" "}
            <span className="text-xs font-normal text-[var(--text-muted)]">
              부기·멍 가라앉기까지 (일)
            </span>
          </label>
          <div className="flex items-center gap-2">
            <input
              type="number"
              inputMode="numeric"
              min={0}
              max={RECOVERY_MAX}
              value={recoveryDays}
              onChange={(e) => setRecoveryDays(e.target.value)}
              disabled={pending}
              placeholder="예: 3"
              className="h-10 w-28 rounded-md border border-[var(--border)] bg-white px-3 text-base font-medium focus:border-[var(--primary)] focus:outline-none disabled:opacity-50"
            />
            <span className="text-sm text-[var(--text-secondary)]">일</span>
          </div>
        </div>

        {/* ── 추천 의향 (필수) ── */}
        <div>
          <label className="mb-1 block text-sm font-semibold text-[var(--text)]">
            추천 의향 <span className="text-[var(--accent)]">*</span>
          </label>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setWouldRecommend(true)}
              disabled={pending}
              className={`h-10 flex-1 rounded-md border text-sm font-semibold transition-colors disabled:opacity-50 ${
                wouldRecommend === true
                  ? "border-[var(--primary)] bg-[var(--primary)] text-white"
                  : "border-[var(--border)] bg-white text-[var(--text-secondary)] hover:bg-[var(--bg-soft)]"
              }`}
            >
              추천해요
            </button>
            <button
              type="button"
              onClick={() => setWouldRecommend(false)}
              disabled={pending}
              className={`h-10 flex-1 rounded-md border text-sm font-semibold transition-colors disabled:opacity-50 ${
                wouldRecommend === false
                  ? "border-[var(--primary)] bg-[var(--primary)] text-white"
                  : "border-[var(--border)] bg-white text-[var(--text-secondary)] hover:bg-[var(--bg-soft)]"
              }`}
            >
              아니요
            </button>
          </div>
        </div>

        {/* ── 구분선: 선택 항목 ── */}
        <div className="border-t border-[var(--border)] pt-4">
          <p className="mb-3 text-xs font-medium text-[var(--text-muted)]">
            아래는 선택 항목입니다.
          </p>

          {/* 시술 부위 (선택) */}
          <div className="mb-4">
            <label className="mb-1 block text-sm font-semibold text-[var(--text)]">
              시술 부위
            </label>
            <input
              type="text"
              value={area}
              onChange={(e) => setArea(e.target.value)}
              maxLength={AREA_MAX}
              disabled={pending}
              placeholder="예: 볼, 턱선, 이마"
              className="h-10 w-full rounded-md border border-[var(--border)] bg-white px-3 text-base focus:border-[var(--primary)] focus:outline-none disabled:opacity-50"
            />
          </div>

          {/* 비용 만족도 (선택) */}
          <div className="mb-4">
            <StarField
              label="비용 만족도"
              value={costSatisfaction}
              onChange={setCostSatisfaction}
              disabled={pending}
              clearable
            />
          </div>

          {/* 효과 체감 분야 (선택, 멀티 칩) */}
          <div className="mb-4">
            <label className="mb-1 block text-sm font-semibold text-[var(--text)]">
              효과 체감 분야{" "}
              <span className="text-xs font-normal text-[var(--text-muted)]">
                (복수 선택)
              </span>
            </label>
            <div className="flex flex-wrap gap-1.5">
              {EFFECT_AREA_OPTIONS.map((opt) => {
                const on = effectAreas.includes(opt);
                return (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => toggleEffectArea(opt)}
                    disabled={pending}
                    className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors disabled:opacity-50 ${
                      on
                        ? "border-[var(--primary)] bg-[var(--primary)]/10 text-[var(--primary)]"
                        : "border-[var(--border)] bg-white text-[var(--text-secondary)] hover:bg-[var(--bg-soft)]"
                    }`}
                  >
                    {opt}
                  </button>
                );
              })}
            </div>
          </div>

          {/* 자유 후기 (선택) */}
          <div>
            <label className="mb-1 block text-sm font-semibold text-[var(--text)]">
              자유 후기{" "}
              <span className="text-xs font-normal text-[var(--text-muted)]">
                ({body.length} / {BODY_MAX})
              </span>
            </label>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={6}
              maxLength={BODY_MAX}
              disabled={pending}
              placeholder="시술 경험을 자유롭게 적어주세요. 병원·의사 실명은 자동 차단됩니다."
              className="w-full resize-y rounded-md border border-[var(--border)] bg-white p-3 text-[15px] leading-[1.7] focus:border-[var(--primary)] focus:outline-none disabled:opacity-50"
            />
          </div>
        </div>

        {/* 에러 */}
        {error && (
          <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {/* 액션 */}
        <div className="flex items-center justify-center border-t border-[var(--border)] pt-4">
          <button
            type="button"
            onClick={submit}
            disabled={pending}
            className="h-10 rounded-md bg-[var(--primary)] px-8 text-sm font-semibold text-white hover:bg-[var(--primary-dark)] disabled:opacity-50"
          >
            {pending ? "등록 중…" : "후기 올리기"}
          </button>
        </div>
      </div>
    </section>
  );
}

/* ─────────────────────────────────────────────────────────────
 * StarField — 1~5 별점 입력.
 * clearable=true 면 같은 별 재클릭 시 0(미선택)으로 해제 (선택 항목용).
 * ───────────────────────────────────────────────────────────── */
function StarField({
  label,
  value,
  onChange,
  disabled,
  required,
  clearable,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  disabled?: boolean;
  required?: boolean;
  clearable?: boolean;
}) {
  return (
    <div>
      <label className="mb-1 block text-sm font-semibold text-[var(--text)]">
        {label}{" "}
        {required && <span className="text-[var(--accent)]">*</span>}
      </label>
      <div className="flex items-center gap-1">
        {[1, 2, 3, 4, 5].map((n) => {
          const on = n <= value;
          return (
            <button
              key={n}
              type="button"
              aria-label={`${label} ${n}점`}
              onClick={() => onChange(clearable && value === n ? 0 : n)}
              disabled={disabled}
              className="text-2xl leading-none transition-transform hover:scale-110 disabled:opacity-50"
              style={{ color: on ? "var(--accent-save)" : "var(--bg-soft)" }}
            >
              ★
            </button>
          );
        })}
        {value > 0 && (
          <span className="ml-2 text-sm font-medium text-[var(--text-secondary)]">
            {value} / 5
          </span>
        )}
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
 * SegmentField — 1~5 세그먼트 (통증 등 양 끝 라벨이 의미 있는 척도).
 * ───────────────────────────────────────────────────────────── */
function SegmentField({
  label,
  value,
  onChange,
  labels,
  hint,
  disabled,
  required,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  labels: readonly string[];
  hint?: string;
  disabled?: boolean;
  required?: boolean;
}) {
  return (
    <div>
      <label className="mb-1 block text-sm font-semibold text-[var(--text)]">
        {label} {required && <span className="text-[var(--accent)]">*</span>}{" "}
        {hint && (
          <span className="text-xs font-normal text-[var(--text-muted)]">
            {hint}
          </span>
        )}
      </label>
      <div className="flex gap-1.5">
        {[1, 2, 3, 4, 5].map((n) => {
          const on = n === value;
          return (
            <button
              key={n}
              type="button"
              onClick={() => onChange(n)}
              disabled={disabled}
              aria-label={`${label} ${n} ${labels[n - 1] ?? ""}`}
              className={`flex h-12 flex-1 flex-col items-center justify-center rounded-md border text-sm font-semibold transition-colors disabled:opacity-50 ${
                on
                  ? "border-[var(--primary)] bg-[var(--primary)] text-white"
                  : "border-[var(--border)] bg-white text-[var(--text-secondary)] hover:bg-[var(--bg-soft)]"
              }`}
            >
              <span>{n}</span>
              <span className="text-[10px] font-normal opacity-80">
                {labels[n - 1] ?? ""}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
