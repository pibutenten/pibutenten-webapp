"use client";

/**
 * ReviewForm — 시술후기 입력 폼 (P3, client).
 *
 * 2026-06-01 확정 명세 전면 재배치:
 *   필수: 시술(칩 단일) / 만족도(별점) / 통증(세그먼트) / 다운타임 / 회차 / 받은 시점 /
 *         재시술 의향 (다운타임~재시술은 ChoiceField 단일 선택 칩).
 *   선택: 가성비(별점, clearable) / 효과 체감 부위(SKIN_CONCERNS 멀티 칩) /
 *         병행 시술(현재 시술 제외 멀티 칩) / 이상반응(none-단독 멀티 칩) /
 *         한줄 후기(text ≤150 + 유형 추천/받기전팁/기타).
 *   회복기간(일수) 입력 삭제.
 *
 * 검수: 병원·의사명은 서버에서 "○○" 로 자동 블라인드(마스킹). 제출 차단 아님.
 *   blinded 응답이면 고지 토스트 1회.
 *
 * 백엔드: POST /api/reviews. body 계약:
 *   필수 procedure_ko / satisfaction(1~5) / pain(1~5) /
 *        downtime / sessions / timing / revisit (각 enum).
 *   선택 cost_satisfaction(1~5) / effect_areas(string[]) /
 *        concurrent_procedures(string[]) / adverse_reactions(enum[]) /
 *        oneliner_type(enum) / body(한줄후기 ≤150).
 *   응답 { card_id, shortcode, status, blinded, screening }.
 *   중복(409) 면 서버 userMessage 노출.
 *
 * 디자인은 globals.css 토큰 + 기존 Chip/StarField/SegmentField 톤 재사용. 모바일 우선.
 */

import {
  useEffect,
  useMemo,
  useState,
  useTransition,
  type CSSProperties,
} from "react";
import { useRouter } from "next/navigation";
import { showToast } from "@/lib/toast";
import { pickErrorMessage } from "@/lib/api-error";
import { SKIN_CONCERNS } from "@/lib/profile-options";
import { CATEGORIES } from "@/lib/categories";

/**
 * categoryLabel(예: "리프팅" / "스킨부스터") → CategoryWithChips 와 같은 색.
 * CATEGORIES 에서 label 로 매칭, 못 찾으면 var(--primary).
 */
function categoryColor(label: string): string {
  return CATEGORIES.find((c) => c.label === label)?.color ?? "var(--primary)";
}

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

const ONELINER_MAX = 150;

const PAIN_LABELS = ["약함", "조금", "보통", "꽤", "심함"] as const;

/* ── 값 키(고정 — DB CHECK 와 일치) ── */
type ChoiceOption = { value: string; label: string };

const DOWNTIME_OPTIONS: ChoiceOption[] = [
  { value: "none", label: "없음" },
  { value: "d1_2", label: "1~2일" },
  { value: "d3_5", label: "3~5일" },
  { value: "w1plus", label: "1주+" },
];
const SESSIONS_OPTIONS: ChoiceOption[] = [
  { value: "s1", label: "1회" },
  { value: "s2_3", label: "2~3회" },
  { value: "s4plus", label: "4회+" },
];
const TIMING_OPTIONS: ChoiceOption[] = [
  { value: "w2", label: "2주 내" },
  { value: "m1_3", label: "1~3개월" },
  { value: "m3plus", label: "3개월+" },
];
const REVISIT_OPTIONS: ChoiceOption[] = [
  { value: "yes", label: "예" },
  { value: "maybe", label: "고민중" },
  { value: "no", label: "아니오" },
];

/* 이상반응 — none 단독, 나머지는 복수. */
type AdverseValue = "none" | "bruise" | "swelling" | "pigment" | "etc";
const ADVERSE_OPTIONS: { value: AdverseValue; label: string }[] = [
  { value: "none", label: "없음" },
  { value: "bruise", label: "멍" },
  { value: "swelling", label: "붓기" },
  { value: "pigment", label: "색소" },
  { value: "etc", label: "기타" },
];

/* 한줄후기 유형 + 유형별 placeholder 예시(회전). */
type OnelinerType = "recommend" | "caution" | "etc";
const ONELINER_OPTIONS: { value: OnelinerType; label: string }[] = [
  { value: "recommend", label: "추천" },
  { value: "caution", label: "받기 전 팁" },
  { value: "etc", label: "기타" },
];
const ONELINER_EXAMPLES: Record<OnelinerType, string> = {
  recommend: "피부 칙칙한 분께 강추",
  caution: "한 번으론 티 잘 안 나요, 2회는 가야",
  etc: "통증 걱정했는데 괜찮았어요",
};

/**
 * 효과 체감 부위 옵션 — SKIN_CONCERNS 기반.
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
  const [satisfaction, setSatisfaction] = useState<number>(0);
  const [pain, setPain] = useState<number>(0);
  const [downtime, setDowntime] = useState("");
  const [sessions, setSessions] = useState("");
  const [timing, setTiming] = useState("");
  const [revisit, setRevisit] = useState("");

  /* ── 선택 ── */
  const [costSatisfaction, setCostSatisfaction] = useState<number>(0);
  const [effectAreas, setEffectAreas] = useState<string[]>([]);
  const [concurrent, setConcurrent] = useState<string[]>([]);
  const [adverse, setAdverse] = useState<AdverseValue[]>([]);
  const [oneliner, setOneliner] = useState("");
  const [onelinerType, setOnelinerType] = useState<OnelinerType>("recommend");

  /* 한줄후기 placeholder 회전 — 선택된 유형의 예시를 표시 (유형 미지정 시 추천 기본). */
  const [phIndex, setPhIndex] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setPhIndex((i) => i + 1), 2500);
    return () => clearInterval(id);
  }, []);
  const onelinerPlaceholder = useMemo(() => {
    // phIndex 로 3개 유형 예시를 순환 (선택 유형을 시작점으로 고정 노출은 아래에서 우선).
    const order: OnelinerType[] = ["recommend", "caution", "etc"];
    const rotating = order[phIndex % order.length];
    const example = ONELINER_EXAMPLES[onelinerType] ?? ONELINER_EXAMPLES[rotating];
    return `예: ${example} · 병원·의사 실명은 자동으로 가려집니다`;
  }, [phIndex, onelinerType]);

  function pickProcedure(value: string) {
    setProcedureKo(value);
    // 병행 시술에서 새로 선택한 시술이 들어 있으면 제거.
    setConcurrent((prev) => prev.filter((v) => v !== value));
    setError(null);
  }

  function toggleEffectArea(v: string) {
    setEffectAreas((prev) =>
      prev.includes(v) ? prev.filter((x) => x !== v) : [...prev, v],
    );
  }

  function toggleConcurrent(v: string) {
    setConcurrent((prev) =>
      prev.includes(v) ? prev.filter((x) => x !== v) : [...prev, v],
    );
  }

  function toggleAdverse(v: AdverseValue) {
    setAdverse((prev) => {
      if (v === "none") {
        // '없음' 선택 → 나머지 해제. 이미 선택돼 있으면 토글 해제.
        return prev.includes("none") ? [] : ["none"];
      }
      // 나머지 선택 → '없음' 해제.
      const next = prev.includes(v)
        ? prev.filter((x) => x !== v)
        : [...prev.filter((x) => x !== "none"), v];
      return next;
    });
  }

  /* ── 제출 ── */
  function validate(): string | null {
    if (!procedureKo) return "시술을 선택해주세요.";
    if (satisfaction < 1) return "만족도를 선택해주세요.";
    if (pain < 1) return "통증 정도를 선택해주세요.";
    if (!downtime) return "다운타임을 선택해주세요.";
    if (!sessions) return "받은 회차를 선택해주세요.";
    if (!timing) return "받은 시점을 선택해주세요.";
    if (!revisit) return "재시술 의향을 선택해주세요.";
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
      downtime,
      sessions,
      timing,
      revisit,
    };
    if (costSatisfaction >= 1) payload.cost_satisfaction = costSatisfaction;
    if (effectAreas.length > 0) payload.effect_areas = effectAreas;
    if (concurrent.length > 0) payload.concurrent_procedures = concurrent;
    if (adverse.length > 0) payload.adverse_reactions = adverse;
    const trimmedOneliner = oneliner.trim();
    if (trimmedOneliner) {
      payload.body = trimmedOneliner;
      payload.oneliner_type = onelinerType;
    }

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
          // 중복(409)·검증 실패 등은 서버 안내(message/userMessage)를 그대로 노출.
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
          blinded?: boolean;
          screening?: {
            status: string;
            reasons: string[];
            userMessage: string;
          } | null;
        };

        // 병원·의사명 자동 블라인드 발생 시 1회 고지.
        if (data.blinded) {
          showToast("병원·의사명으로 보이는 표현이 자동으로 가려졌습니다.");
        }

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

  return (
    <section className="w-full py-6">
      <h1 className="mb-5 text-center text-[20px] font-bold leading-[1.4] text-[var(--text)]">
        시술 후기를 남겨주세요
      </h1>

      <div className="space-y-5 rounded-[var(--radius)] border border-[var(--border)] bg-white p-5 shadow-[var(--shadow-sm)]">
        {/* ── 1. 시술 선택 (필수) — 탭 + 칩 단일 선택 ── */}
        <div>
          <label className="mb-2 block text-sm font-semibold text-[var(--text)]">
            시술 <span className="text-[var(--accent)]">*</span>
          </label>
          {procedures.length === 0 ? (
            <p className="py-2 text-sm text-[var(--text-muted)]">
              선택할 수 있는 시술이 없습니다.
            </p>
          ) : (
            <TabbedProcedurePicker
              procedures={procedures}
              mode="single"
              value={procedureKo}
              onChange={pickProcedure}
              disabled={pending}
            />
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

        {/* ── 4. 다운타임 (필수) ── */}
        <ChoiceField
          label="다운타임"
          required
          value={downtime}
          onChange={setDowntime}
          options={DOWNTIME_OPTIONS}
          disabled={pending}
        />

        {/* ── 5. 회차 (필수) ── */}
        <ChoiceField
          label="받은 회차"
          required
          value={sessions}
          onChange={setSessions}
          options={SESSIONS_OPTIONS}
          disabled={pending}
        />

        {/* ── 6. 받은 시점 (필수) ── */}
        <ChoiceField
          label="받은 시점"
          required
          value={timing}
          onChange={setTiming}
          options={TIMING_OPTIONS}
          disabled={pending}
        />

        {/* ── 7. 재시술 의향 (필수) ── */}
        <ChoiceField
          label="재시술 의향"
          required
          value={revisit}
          onChange={setRevisit}
          options={REVISIT_OPTIONS}
          disabled={pending}
        />

        {/* ── 구분선: 선택 항목 ── */}
        <div className="border-t border-[var(--border)] pt-4">
          <p className="mb-3 text-xs font-medium text-[var(--text-muted)]">
            아래는 선택 항목입니다.
          </p>

          {/* 8. 가성비 (선택, clearable 별점) */}
          <div className="mb-4">
            <StarField
              label="가성비"
              clearable
              value={costSatisfaction}
              onChange={setCostSatisfaction}
              disabled={pending}
            />
          </div>

          {/* 9. 효과 체감 부위 (선택, 멀티 칩) */}
          <div className="mb-4">
            <label className="mb-2 block text-sm font-semibold text-[var(--text)]">
              효과 체감 부위{" "}
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

          {/* 10. 병행 시술 (선택, 멀티 칩 — 현재 시술 제외) */}
          <div className="mb-4">
            <label className="mb-2 block text-sm font-semibold text-[var(--text)]">
              병행 시술{" "}
              <span className="text-xs font-normal text-[var(--text-muted)]">
                (함께 받은 시술, 복수 선택)
              </span>
            </label>
            {procedures.length === 0 ? (
              <p className="py-1 text-sm text-[var(--text-muted)]">
                선택할 수 있는 시술이 없습니다.
              </p>
            ) : (
              <TabbedProcedurePicker
                procedures={procedures}
                mode="multi"
                value={concurrent}
                onChange={toggleConcurrent}
                exclude={procedureKo}
                disabled={pending}
              />
            )}
          </div>

          {/* 11. 이상반응 (선택, 멀티 칩 — none 단독) */}
          <div className="mb-4">
            <label className="mb-2 block text-sm font-semibold text-[var(--text)]">
              이상반응{" "}
              <span className="text-xs font-normal text-[var(--text-muted)]">
                (복수 선택)
              </span>
            </label>
            <div className="flex flex-wrap gap-2">
              {ADVERSE_OPTIONS.map((opt) => (
                <Chip
                  key={opt.value}
                  active={adverse.includes(opt.value)}
                  onClick={() => toggleAdverse(opt.value)}
                  disabled={pending}
                >
                  {opt.label}
                </Chip>
              ))}
            </div>
          </div>

          {/* 12. 한줄 후기 (선택) + 유형 */}
          <div>
            <label className="mb-2 block text-sm font-semibold text-[var(--text)]">
              한줄 후기{" "}
              <span className="text-xs font-normal text-[var(--text-muted)]">
                ({oneliner.length} / {ONELINER_MAX})
              </span>
            </label>

            {/* 유형 단일 선택 칩 */}
            <div className="mb-2 flex flex-wrap gap-2">
              {ONELINER_OPTIONS.map((opt) => (
                <Chip
                  key={opt.value}
                  active={onelinerType === opt.value}
                  onClick={() => setOnelinerType(opt.value)}
                  disabled={pending}
                >
                  {opt.label}
                </Chip>
              ))}
            </div>

            <input
              type="text"
              value={oneliner}
              onChange={(e) => setOneliner(e.target.value)}
              maxLength={ONELINER_MAX}
              disabled={pending}
              placeholder={onelinerPlaceholder}
              className="h-11 w-full rounded-md border border-[var(--border)] bg-white px-3 text-[15px] focus:border-[var(--primary)] focus:outline-none disabled:opacity-50"
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
 * TabbedProcedurePicker — 사이트 태그 검색 위젯 CategoryWithChips 와
 *   동일한 "탭(상단, 카테고리 색 밑줄) + 칩(선택 시 카테고리색 틴트)" 구조.
 *
 *   - 탭: procedures 의 categoryLabel 들(등장 순서 = 리프팅 → 스킨부스터).
 *         활성 탭은 카테고리 색 글자 + 같은 색 border-b-2 밑줄,
 *         비활성은 var(--text-secondary) + 투명 밑줄.
 *   - 탭 아래 그라데이션 라인 (CategoryWithChips 와 동일).
 *   - 칩: 활성 탭 카테고리의 procedures 만 표시. 선택 시 카테고리색 틴트.
 *   - single: 클릭 시 onChange(ko), 선택된 1개만 강조.
 *   - multi: 클릭 토글(onChange 가 토글 수행), value 배열 includes 로 강조,
 *            exclude 와 같은 value 는 목록에서 제외.
 *   - 검색 input 없음 (주관식 오인 방지).
 * ───────────────────────────────────────────────────────────── */
function TabbedProcedurePicker({
  procedures,
  mode,
  value,
  onChange,
  disabled,
  exclude,
}: {
  procedures: ProcedureOption[];
  mode: "single" | "multi";
  value: string | string[];
  onChange: (v: string) => void;
  disabled?: boolean;
  exclude?: string;
}) {
  // 탭 목록 — categoryLabel 등장 순서 유지.
  const tabs = useMemo(() => {
    const order: string[] = [];
    for (const p of procedures) {
      if (!order.includes(p.categoryLabel)) order.push(p.categoryLabel);
    }
    return order;
  }, [procedures]);

  // single 모드에서 이미 선택된 값이 있으면 그 카테고리를 기본 활성으로,
  // 없으면 첫 번째 탭(리프팅).
  const initialTab = useMemo(() => {
    if (mode === "single" && typeof value === "string" && value) {
      const sel = procedures.find((p) => p.value === value);
      if (sel) return sel.categoryLabel;
    }
    return tabs[0] ?? "";
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [activeTab, setActiveTab] = useState<string>(initialTab);

  // 활성 탭이 유효하지 않게 되면 첫 탭으로 보정.
  useEffect(() => {
    if (tabs.length > 0 && !tabs.includes(activeTab)) {
      setActiveTab(tabs[0]);
    }
  }, [tabs, activeTab]);

  // 칩 표시 텍스트 — 하위면 "상위 › 하위".
  function chipLabel(p: ProcedureOption): string {
    return p.parentKo ? `${p.parentKo} › ${p.label}` : p.label;
  }

  function isSelected(v: string): boolean {
    return mode === "multi"
      ? Array.isArray(value) && value.includes(v)
      : value === v;
  }

  // 활성 탭의 칩 목록 (multi 면 exclude 제거).
  const visibleChips = procedures.filter(
    (p) =>
      p.categoryLabel === activeTab &&
      !(mode === "multi" && exclude && p.value === exclude),
  );

  return (
    <div>
      {/* 탭 */}
      <div
        role="tablist"
        aria-label="시술 카테고리"
        className="-mx-1 flex justify-center gap-x-[14px] overflow-x-auto px-1 sm:gap-x-7 sm:overflow-visible [&::-webkit-scrollbar]:hidden"
        style={{ scrollbarWidth: "none" } as CSSProperties}
      >
        {tabs.map((tab) => {
          const isActive = tab === activeTab;
          const color = categoryColor(tab);
          return (
            <button
              key={tab}
              type="button"
              role="tab"
              aria-selected={isActive}
              disabled={disabled}
              onClick={() => setActiveTab(tab)}
              className="shrink-0 cursor-pointer border-b-2 px-1 py-[6px] text-[13px] font-semibold transition-[color,border-color,transform] hover:opacity-70 active:scale-[0.96] disabled:opacity-50 sm:py-[7px] sm:text-[14px]"
              style={{
                color: isActive ? color : "var(--text-secondary)",
                borderBottomColor: isActive ? color : "transparent",
              }}
            >
              {tab}
            </button>
          );
        })}
      </div>

      {/* 탭 ↔ 칩 사이 그라데이션 라인 (양 끝 페이드아웃) */}
      <div
        aria-hidden
        className="mb-3 h-px w-full sm:mb-[14px]"
        style={{
          background:
            "linear-gradient(to right, transparent 0%, rgba(0,0,0,0.10) 18%, rgba(0,0,0,0.10) 82%, transparent 100%)",
        }}
      />

      {/* 칩 */}
      {visibleChips.length === 0 ? (
        <div className="text-center text-xs text-[var(--text-muted)]">
          선택할 수 있는 시술이 없습니다.
        </div>
      ) : (
        <div className="flex flex-wrap justify-center gap-1.5">
          {visibleChips.map((p) => {
            const selected = isSelected(p.value);
            const color = categoryColor(p.categoryLabel);
            return (
              <button
                key={p.value}
                type="button"
                onClick={() => onChange(p.value)}
                disabled={disabled}
                className="cursor-pointer rounded-full px-3 py-1 text-[13px] transition-colors active:scale-[0.97] disabled:opacity-50"
                style={
                  selected
                    ? {
                        backgroundColor: color + "1A",
                        color,
                        fontWeight: 700,
                      }
                    : {
                        backgroundColor: "#E8EAEE",
                        color: "#5C6470",
                        fontWeight: 500,
                      }
                }
              >
                {chipLabel(p)}
              </button>
            );
          })}
        </div>
      )}
    </div>
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

/* ─────────────────────────────────────────────────────────────
 * ChoiceField — 가변 개수 {value,label}[] 단일 선택 칩 그룹.
 *   SegmentField 와 유사하되 옵션이 가변이고 라벨 기반. 칩 톤은 Chip 과 통일.
 * ───────────────────────────────────────────────────────────── */
function ChoiceField({
  label,
  value,
  onChange,
  options,
  disabled,
  required,
  hint,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: ChoiceOption[];
  disabled?: boolean;
  required?: boolean;
  hint?: string;
}) {
  return (
    <div>
      <label className="mb-2 block text-sm font-semibold text-[var(--text)]">
        {label} {required && <span className="text-[var(--accent)]">*</span>}{" "}
        {hint && (
          <span className="text-xs font-normal text-[var(--text-muted)]">
            {hint}
          </span>
        )}
      </label>
      <div className="flex flex-wrap gap-2">
        {options.map((opt) => (
          <Chip
            key={opt.value}
            active={value === opt.value}
            onClick={() => onChange(opt.value)}
            disabled={disabled}
          >
            {opt.label}
          </Chip>
        ))}
      </div>
    </div>
  );
}
