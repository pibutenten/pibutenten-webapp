"use client";

/**
 * ReviewForm — 시술후기 입력 폼 (P3-d, client).
 *
 * 2026-06-01 원장님 피드백 반영 재구성:
 *   - 시술 선택을 드롭다운 → 칩(OnboardingClient 피부고민 칩 톤) 단일 선택으로 교체.
 *     procedures 를 categoryLabel(리프팅/주입) 별 2개 섹션으로 묶어 표시, 상단 검색 필터.
 *   - effect(효과 체감 별점)·would_recommend(추천 의향)·cost_satisfaction(비용 만족도)·
 *     area(시술 부위) 입력 전부 폼에서 제거.
 *   - 효과 체감 분야(선택, 복수)를 SKIN_CONCERNS 기반 멀티 칩으로. 단 라벨 치환:
 *     aging→"동안", sensitive→"피부장벽". 저장은 치환된 라벨 문자열 배열.
 *
 * 백엔드: POST /api/reviews. body 계약:
 *   필수 procedure_ko / satisfaction(1~5) / pain(1~5) / recovery_days(0~365)
 *   선택 effect_areas(string[]) / body
 *   응답 { card_id, shortcode, status, screening }.
 *
 * 디자인은 globals.css 토큰 + OnboardingClient 칩 톤을 재사용. 모바일 우선.
 * 제출 패턴(토스트·screening 안내·redirect)은 기존 로직 유지.
 */

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { showToast } from "@/lib/toast";
import { pickErrorMessage } from "@/lib/api-error";
import { SKIN_CONCERNS } from "@/lib/profile-options";

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
const RECOVERY_MAX = 365;

const PAIN_LABELS = ["약함", "조금", "보통", "꽤", "심함"] as const;

/**
 * 효과 체감 분야 옵션 — SKIN_CONCERNS 기반.
 * 라벨 치환: aging → "동안", sensitive → "피부장벽". 나머지는 원 라벨 그대로.
 * 저장값(effect_areas)은 여기 치환된 라벨 문자열.
 */
const EFFECT_AREA_LABEL_OVERRIDE: Record<string, string> = {
  aging: "동안",
  sensitive: "피부장벽",
};
const EFFECT_AREA_OPTIONS: string[] = SKIN_CONCERNS.map(
  (c) => EFFECT_AREA_LABEL_OVERRIDE[c.key] ?? c.label,
);

export default function ReviewForm({ procedures, handle }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  /* ── 필수 ── */
  const [procedureKo, setProcedureKo] = useState("");
  const [procSearch, setProcSearch] = useState("");
  const [satisfaction, setSatisfaction] = useState<number>(0);
  const [pain, setPain] = useState<number>(0);
  const [recoveryDays, setRecoveryDays] = useState<string>("");

  /* ── 선택 ── */
  const [effectAreas, setEffectAreas] = useState<string[]>([]);
  const [body, setBody] = useState("");

  /* ── 시술 선택 — 검색 필터 후 categoryLabel 별로 그룹화 ── */
  const grouped = useMemo(() => {
    const q = procSearch.trim().toLowerCase();
    const matched = q
      ? procedures.filter((p) => {
          const hay = (p.label + " " + (p.parentKo ?? "")).toLowerCase();
          return hay.includes(q);
        })
      : procedures;

    // categoryLabel 순서를 procedures 등장 순서로 보존 (page.tsx 가 리프팅→주입 정렬).
    const order: string[] = [];
    const map = new Map<string, ProcedureOption[]>();
    for (const p of matched) {
      if (!map.has(p.categoryLabel)) {
        map.set(p.categoryLabel, []);
        order.push(p.categoryLabel);
      }
      map.get(p.categoryLabel)!.push(p);
    }
    return order.map((label) => ({ label, items: map.get(label)! }));
  }, [procedures, procSearch]);

  // 선택된 시술의 칩 표시 텍스트 — 하위면 "상위 › 하위".
  function chipLabel(p: ProcedureOption): string {
    return p.parentKo ? `${p.parentKo} › ${p.label}` : p.label;
  }

  function pickProcedure(value: string) {
    setProcedureKo(value);
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
      pain,
      recovery_days: Number(recoveryDays),
    };
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

        // 검수 대기로 전환된 경우 1회 안내 후 이동.
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

  const hasProcedures = procedures.length > 0;

  return (
    <section className="w-full py-6">
      <h1 className="mb-5 text-center text-[20px] font-bold leading-[1.4] text-[var(--text)]">
        시술 후기를 남겨주세요
      </h1>

      <div className="space-y-5 rounded-[var(--radius)] border border-[var(--border)] bg-white p-5 shadow-[var(--shadow-sm)]">
        {/* ── 1. 시술 선택 (필수) — 칩 단일 선택 ── */}
        <div>
          <label className="mb-2 block text-sm font-semibold text-[var(--text)]">
            시술 <span className="text-[var(--accent)]">*</span>
          </label>

          {/* 검색 필터 */}
          <input
            type="text"
            value={procSearch}
            onChange={(e) => setProcSearch(e.target.value)}
            disabled={pending}
            placeholder="시술명 검색"
            className="mb-3 h-9 w-full rounded-md border border-[var(--border)] bg-white px-3 text-sm focus:border-[var(--primary)] focus:outline-none disabled:opacity-50"
          />

          {!hasProcedures ? (
            <p className="py-2 text-sm text-[var(--text-muted)]">
              선택할 수 있는 시술이 없습니다.
            </p>
          ) : grouped.length === 0 ? (
            <p className="py-2 text-sm text-[var(--text-muted)]">
              검색 결과가 없습니다.
            </p>
          ) : (
            <div className="space-y-3">
              {grouped.map((group) => (
                <div key={group.label}>
                  <div className="mb-1.5 text-[11px] font-semibold text-[var(--text-muted)]">
                    {group.label}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {group.items.map((p) => (
                      <Chip
                        key={p.value}
                        active={procedureKo === p.value}
                        onClick={() => pickProcedure(p.value)}
                        disabled={pending}
                      >
                        {chipLabel(p)}
                      </Chip>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── 2. 만족도 (필수) ── */}
        <StarField
          label="만족도"
          required
          value={satisfaction}
          onChange={setSatisfaction}
          disabled={pending}
        />

        {/* ── 3. 통증 (필수) ── */}
        <SegmentField
          label="통증"
          required
          value={pain}
          onChange={setPain}
          labels={PAIN_LABELS}
          hint="1 약함 ~ 5 심함"
          disabled={pending}
        />

        {/* ── 4. 회복기간 (필수) ── */}
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

        {/* ── 구분선: 선택 항목 ── */}
        <div className="border-t border-[var(--border)] pt-4">
          <p className="mb-3 text-xs font-medium text-[var(--text-muted)]">
            아래는 선택 항목입니다.
          </p>

          {/* 5. 효과 체감 분야 (선택, 멀티 칩) */}
          <div className="mb-4">
            <label className="mb-2 block text-sm font-semibold text-[var(--text)]">
              효과 체감 분야{" "}
              <span className="text-xs font-normal text-[var(--text-muted)]">
                (복수 선택)
              </span>
            </label>
            <div className="flex flex-wrap gap-2">
              {EFFECT_AREA_OPTIONS.map((opt) => (
                <Chip
                  key={opt}
                  active={effectAreas.includes(opt)}
                  onClick={() => toggleEffectArea(opt)}
                  disabled={pending}
                >
                  {opt}
                </Chip>
              ))}
            </div>
          </div>

          {/* 6. 자유 후기 (선택) */}
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
 * Chip — 둥근 pill 선택 칩 (OnboardingClient 피부고민 칩과 동일 톤).
 *   비활성: #E8EAEE / #5C6470 / 500. 활성: var(--primary) / 흰색 / 600.
 * ───────────────────────────────────────────────────────────── */
function Chip({
  active,
  onClick,
  disabled,
  children,
}: {
  active: boolean;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="shrink-0 whitespace-nowrap rounded-full px-3 py-1 text-[13px] transition-colors active:scale-[0.97] disabled:opacity-50"
      style={
        active
          ? { backgroundColor: "#4CBFF2", color: "#FFFFFF", fontWeight: 600 }
          : { backgroundColor: "#E8EAEE", color: "#5C6470", fontWeight: 500 }
      }
    >
      {children}
    </button>
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
