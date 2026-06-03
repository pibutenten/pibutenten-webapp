"use client";

/**
 * ReviewForm — 시술후기 입력 폼 (P3, client).
 *
 * 항목 순서 (한줄후기만 선택, 나머지 필수):
 *   1. 시술 (택1, 잠금형: 선택 후 picker 언마운트 → 선택 시술명만 제목처럼 표시, 변경 불가)
 *   2. 만족도 (별점 1~5, 필수)
 *   3. 통증 (표정 1~5, 필수)
 *   4. 다운타임 (일상 복귀 소요, 단일선택 5옵션, 필수)
 *   5. 재시술 의향 (예/고민중/아니오, 필수)
 *   6. 체감 효과 (멀티 칩, ≥1, '없음' 포함, 필수)
 *   7. 효과시기 (효과 체감 시기, 단일선택 5옵션, 필수)
 *   8. 한줄 후기 (text ≤400, 선택)
 *
 * 검수: 병원·의사명은 서버에서 "○○" 로 자동 블라인드(마스킹). 제출 차단 아님.
 *   blinded 응답이면 고지 토스트 1회.
 *
 * 백엔드: POST /api/reviews (수정=PATCH). body 계약:
 *   procedure_ko / satisfaction(1~5) / pain(1~5) / downtime(슬러그) / revisit(enum) /
 *   effect_areas(string[], ≥1) / effect_onset(슬러그) — 필수, body(한줄후기 0~400) 선택.
 *   응답 { card_id, shortcode, status, blinded, screening }.
 *   중복(409) 면 서버 userMessage 노출. downtime/effect_onset 저장은 영문 슬러그.
 *
 * 디자인은 globals.css 토큰 + 기존 Chip/StarField 톤 재사용. 모바일 우선.
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
import { CATEGORIES } from "@/lib/categories";
import { DOWNTIME_OPTIONS, EFFECT_ONSET_OPTIONS } from "@/lib/review-options";

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

/** 편집 모드 초기값 — 기존 후기 프리필. */
export type ReviewEditInitial = {
  procedureKo: string;
  satisfaction: number;
  pain: number;
  downtime: string;
  revisit: string;
  effectAreas: string[];
  effectOnset: string;
  body: string;
};

type Props = {
  procedures: ProcedureOption[];
  /** active 명함 handle — 제출 성공 시 /{handle}/{shortcode} 이동 */
  handle: string;
  /** 태그 미리선택 대비 초기 시술 ko — procedures 에 존재할 때만 잠금 표시 */
  initialProcedure?: string;
  /** 'edit' 면 수정 모드(PATCH). 기본 'create'. */
  mode?: "create" | "edit";
  /** 수정 대상 shortcode (mode='edit' 필수). */
  shortcode?: string;
  /** 수정 모드 프리필 값 (mode='edit'). */
  initial?: ReviewEditInitial;
};

const ONELINER_MAX = 400;

/* 통증 — 표정 이모지 1~5 컴팩트 스케일. */
const PAIN_FACES: { face: string; label: string }[] = [
  { face: "😊", label: "없음" },
  { face: "🙂", label: "조금" },
  { face: "😐", label: "보통" },
  { face: "😣", label: "꽤" },
  { face: "😖", label: "심함" },
];

/* ── 값 키(고정 — DB CHECK 와 일치) ── */
type ChoiceOption = { value: string; label: string; color?: string };

const REVISIT_OPTIONS: ChoiceOption[] = [
  { value: "yes", label: "있어요", color: "#4CBFF2" },
  { value: "no", label: "없어요", color: "#EA7E7B" },
  { value: "maybe", label: "고민 중", color: "#9AA1AC" },
];

/* 다운타임(DOWNTIME_OPTIONS)·효과시기(EFFECT_ONSET_OPTIONS) 옵션은 @/lib/review-options 가 SSOT.
   슬러그는 DB CHECK(0213)·리포트 집계와 동일. (CLAUDE.md §5 동기화 페어) */

/* 생생한 후기 placeholder — 마운트 시 무작위 1개 고정(세션 내 유지). */
const ONELINER_PLACEHOLDERS: string[] = [
  "고민하는 분들께 해주고 싶은 한마디를 남겨주세요.",
  "솔직한 한 줄이 같은 고민을 가진 분께 큰 도움이 돼요.",
  "어떤 점이 가장 만족스러우셨나요?",
  "받기 전과 후, 무엇이 가장 달라졌나요?",
  "기대했던 것과 비교해 어떠셨어요?",
  "이건 미리 알았으면 좋았겠다 싶은 점이 있었나요?",
  "한 줄로 남긴다면, 이번 시술은 어땠나요?",
  "다른 분들이 궁금해할 만한 점을 들려주세요.",
];

/**
 * 체감 효과 옵션 — 독립 목록 16종 + '없음'(17번째) (온보딩 피부고민과 별개).
 * 순서: 리프팅·탄력·쫀쫀함·볼륨·작은얼굴·턱선·이중턱·피부톤·피부결·잔주름·모공·생기·속건조·붉은기·트러블·피지·없음.
 * 저장값(effect_areas)은 이 라벨 문자열 그대로. '없음'도 일반 칩(배타 로직 없음).
 */
const EFFECT_AREA_OPTIONS: string[] = [
  "리프팅",
  "탄력",
  "쫀쫀함",
  "볼륨",
  "작은얼굴",
  "턱선",
  "이중턱",
  "피부톤",
  "피부결",
  "잔주름",
  "모공",
  "생기",
  "속건조",
  "붉은기",
  "트러블",
  "피지",
  "없음",
];
/** 효과 칩 색 — EFFECT_AREA_OPTIONS 와 동일 인덱스 매칭 (16색 파스텔 + '없음' 중립 회색). */
const EFFECT_AREA_COLORS: string[] = [
  "#B0A0DE",
  "#7FD0F8",
  "#F59CB6",
  "#FFCB8C",
  "#A6D9A9",
  "#C3B0E8",
  "#79CCC3",
  "#FFAF97",
  "#9AA6DE",
  "#CDC97A",
  "#8FD4C8",
  "#F4B8A0",
  "#B8D88A",
  "#F2A9C0",
  "#D6B0A1",
  "#E0C088",
  "#C2C7CE",
];

export default function ReviewForm({
  procedures,
  handle,
  initialProcedure,
  mode = "create",
  shortcode,
  initial,
}: Props) {
  const router = useRouter();
  const isEdit = mode === "edit";
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  /* ── 필수 항목 ── */
  // 수정 모드면 기존 시술 ko 로 잠금 시작. 생성 모드면 initialProcedure(태그 미리선택) 검증.
  const [procedureKo, setProcedureKo] = useState(() => {
    if (isEdit && initial?.procedureKo) return initial.procedureKo;
    return initialProcedure && procedures.some((p) => p.value === initialProcedure)
      ? initialProcedure
      : "";
  });
  const [satisfaction, setSatisfaction] = useState<number>(initial?.satisfaction ?? 0);
  const [pain, setPain] = useState<number>(initial?.pain ?? 0);
  const [downtime, setDowntime] = useState(initial?.downtime ?? "");
  const [revisit, setRevisit] = useState(initial?.revisit ?? "");
  const [effectAreas, setEffectAreas] = useState<string[]>(initial?.effectAreas ?? []);
  const [effectOnset, setEffectOnset] = useState(initial?.effectOnset ?? "");
  const [oneliner, setOneliner] = useState(initial?.body ?? "");

  /* 한줄후기 placeholder — 마운트 시 무작위 1개 고정(세션 내 유지). */
  const onelinerPlaceholder = useMemo(
    () =>
      ONELINER_PLACEHOLDERS[
        Math.floor(Math.random() * ONELINER_PLACEHOLDERS.length)
      ],
    [],
  );

  /* 선택된 시술 옵션 (제목 표시용). */
  const selectedProcedure = useMemo(
    () => procedures.find((p) => p.value === procedureKo) ?? null,
    [procedures, procedureKo],
  );

  function pickProcedure(value: string) {
    setProcedureKo(value);
    setError(null);
  }

  // 시술 다시 선택(생성 모드 전용) — 확인 후 입력값 전체 초기화하고 피커 재오픈.
  function reselectProcedure() {
    if (
      !window.confirm(
        "시술을 다시 선택하면 지금까지 입력한 내용이 모두 지워집니다. 계속할까요?",
      )
    ) {
      return;
    }
    setProcedureKo("");
    setSatisfaction(0);
    setPain(0);
    setDowntime("");
    setRevisit("");
    setEffectAreas([]);
    setEffectOnset("");
    setOneliner("");
    setError(null);
  }

  function toggleEffectArea(v: string) {
    setEffectAreas((prev) =>
      prev.includes(v) ? prev.filter((x) => x !== v) : [...prev, v],
    );
  }

  /* ── 제출 ── */
  // 필수: 시술·만족도·통증·다운타임·재시술·효과(≥1, '없음'도 1개)·효과시기. 한줄후기만 선택.
  const canSubmit =
    !!procedureKo &&
    satisfaction >= 1 &&
    pain >= 1 &&
    !!downtime &&
    !!revisit &&
    effectAreas.length >= 1 &&
    !!effectOnset;

  function validate(): string | null {
    if (!procedureKo) return "시술을 선택해주세요.";
    if (satisfaction < 1) return "만족도를 선택해주세요.";
    if (pain < 1) return "통증 정도를 선택해주세요.";
    if (!downtime) return "일상으로 돌아오기까지 걸린 시간을 선택해주세요.";
    if (!revisit) return "재시술 의향을 선택해주세요.";
    if (effectAreas.length < 1) return "느낀 효과를 1개 이상 골라주세요.";
    if (!effectOnset) return "효과를 느낀 시기를 선택해주세요.";
    return null;
  }

  function submit() {
    setError(null);
    const v = validate();
    if (v) {
      setError(v);
      return;
    }

    const payload = {
      procedure_ko: procedureKo,
      satisfaction,
      pain,
      downtime,
      revisit,
      effect_areas: effectAreas,
      effect_onset: effectOnset,
      body: oneliner.trim(),
    };

    startTransition(async () => {
      try {
        // 생성=POST /api/reviews, 수정=PATCH /api/reviews/{shortcode}.
        const res = await fetch(
          isEdit ? `/api/reviews/${shortcode}` : "/api/reviews",
          {
            method: isEdit ? "PATCH" : "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          },
        );

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
    // 폭은 폼 계열 표준(온보딩·설정 = max-w-[640px])과 동일하게 맞춤 —
    // 단독 글 상세는 680px, 작성 폼은 640px 로 화면 폭 체계 일관.
    <section className="mx-auto w-full max-w-[640px] py-6">
      <h1 className="mb-5 text-center text-[20px] font-bold leading-[1.4] text-[var(--text)]">
        {isEdit ? "시술 후기 수정" : "시술 후기를 남겨주세요"}
      </h1>

      <div className="space-y-5 rounded-[var(--radius)] border border-[var(--border)] bg-white p-5 shadow-[var(--shadow-sm)]">
        {/* ── 1. 시술 선택 (필수, 잠금형) ──
            선택하면 피커가 grid-rows 1fr→0fr 로 부드럽게 접히고, 선택한 시술명만
            제목으로 남으며 아래 입력창들이 자연스럽게 올라옴. */}
        <div>
          {selectedProcedure && (
            // 제목 가운데 + '다시 선택'은 우측에(한 줄로 공간 절약).
            <div className="relative flex items-center justify-center">
              <SelectedProcedureTitle option={selectedProcedure} />
              {/* 생성 모드에서만 다시 선택 허용(수정 모드는 시술 잠금). */}
              {!isEdit && (
                <button
                  type="button"
                  onClick={reselectProcedure}
                  disabled={pending}
                  className="absolute right-0 cursor-pointer text-xs text-[var(--text-muted)] underline underline-offset-2 hover:text-[var(--text-secondary)] disabled:opacity-50"
                >
                  다시 선택
                </button>
              )}
            </div>
          )}
          <div
            className="grid transition-[grid-template-rows] duration-300 ease-out"
            style={{ gridTemplateRows: procedureKo ? "0fr" : "1fr" }}
          >
            <div
              className={`min-h-0 overflow-hidden transition-opacity duration-200 ${
                procedureKo ? "opacity-0" : "opacity-100"
              }`}
            >
              {procedures.length === 0 ? (
                <p className="py-2 text-center text-sm text-[var(--text-muted)]">
                  선택할 수 있는 시술이 없습니다.
                </p>
              ) : (
                <TabbedProcedurePicker
                  procedures={procedures}
                  value={procedureKo}
                  onChange={pickProcedure}
                  disabled={pending}
                />
              )}
            </div>
          </div>
        </div>

        {/* 시술을 고르기 전에는 비활성(흐림+클릭 불가), 고르면 활성으로. */}
        <div
          aria-disabled={!procedureKo}
          className={`space-y-5 transition-opacity duration-200 ${
            procedureKo ? "" : "pointer-events-none opacity-50"
          }`}
        >
        {/* ── 2. 만족도 ── */}
        <StarField
          label="만족도"
          required
          value={satisfaction}
          onChange={setSatisfaction}
          disabled={pending}
        />

        {/* ── 3. 통증 (필수) ── */}
        <FaceField
          label="통증"
          required
          value={pain}
          onChange={setPain}
          faces={PAIN_FACES}
          disabled={pending}
        />

        {/* ── 4. 다운타임 (필수) — 질문에 '다운타임' 단어 노출 금지 ── */}
        <ChoiceField
          label="일상으로 돌아오기까지 얼마나 걸렸나요?"
          required
          value={downtime}
          onChange={setDowntime}
          options={DOWNTIME_OPTIONS}
          disabled={pending}
        />

        {/* ── 5. 재시술 의향 (필수) ── */}
        <ChoiceField
          label="재시술 의향"
          required
          value={revisit}
          onChange={setRevisit}
          options={REVISIT_OPTIONS}
          disabled={pending}
        />

        {/* ── 6. 체감 효과 (필수, 멀티 칩, '없음' 포함) ── */}
        <div>
          <label className="mb-2 block text-sm font-semibold text-[var(--text)]">
            이번 시술로 달라진 점을 모두 골라주세요!
            <span className="mt-0.5 block text-xs font-normal text-[var(--text-muted)]">
              생각보다 많을 거예요 — 보통 4개 이상 고르세요.
            </span>
          </label>
          <div className="flex flex-wrap gap-1">
            {EFFECT_AREA_OPTIONS.map((opt, i) => (
              <EffectChip
                key={opt}
                active={effectAreas.includes(opt)}
                color={EFFECT_AREA_COLORS[i % EFFECT_AREA_COLORS.length]}
                onClick={() => toggleEffectArea(opt)}
                disabled={pending}
              >
                {opt}
              </EffectChip>
            ))}
          </div>
        </div>

        {/* ── 7. 효과시기 (필수) ── */}
        <ChoiceField
          label="효과를 언제 가장 크게 느꼈나요?"
          required
          value={effectOnset}
          onChange={setEffectOnset}
          options={EFFECT_ONSET_OPTIONS}
          disabled={pending}
        />

        {/* ── 8. 생생한 후기 (선택) ── */}
        <div>
          <label className="mb-2 block text-sm font-semibold text-[var(--text)]">
            생생한 후기를 남겨주세요{" "}
            <span className="text-xs font-normal text-[var(--text-muted)]">
              ({oneliner.length} / {ONELINER_MAX})
            </span>
          </label>

          <textarea
            value={oneliner}
            onChange={(e) => setOneliner(e.target.value)}
            maxLength={ONELINER_MAX}
            rows={3}
            disabled={pending}
            placeholder={onelinerPlaceholder}
            className="w-full resize-y rounded-md border border-[var(--border)] bg-white p-3 text-[14px] leading-[1.6] focus:border-[var(--primary)] focus:outline-none disabled:opacity-50"
          />
          <p className="mt-1 text-xs text-[var(--text-muted)]">
            의료광고성 표현·병원·의사 실명 언급은 금합니다.
          </p>
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
            disabled={pending || !canSubmit}
            className={`h-10 rounded-md px-8 text-sm font-semibold text-white transition-colors disabled:opacity-80 ${
              canSubmit
                ? "cursor-pointer bg-[var(--primary)] hover:bg-[var(--primary-dark)]"
                : "cursor-not-allowed bg-[#CBD2D9]"
            }`}
          >
            {pending
              ? isEdit
                ? "수정 중…"
                : "등록 중…"
              : isEdit
                ? "후기 수정"
                : "후기 올리기"}
          </button>
        </div>
        </div>
      </div>
    </section>
  );
}

/* ─────────────────────────────────────────────────────────────
 * SelectedProcedureTitle — 시술 확정 후 표시(변경 불가).
 *   선택한 시술명을 가운데 정렬 굵은 글씨 + 해당 카테고리 색으로 제목처럼 표시.
 * ───────────────────────────────────────────────────────────── */
function SelectedProcedureTitle({ option }: { option: ProcedureOption }) {
  const color = categoryColor(option.categoryLabel);
  return (
    <div className="py-1 text-center">
      <span
        className="text-[18px] font-bold leading-[1.4]"
        style={{ color }}
      >
        {option.label}
      </span>
    </div>
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
 *   - 단일 선택: 클릭 시 onChange(ko). 선택 후 부모가 picker 를 언마운트하므로
 *     변경 불가(되돌리기/다시선택 없음).
 *   - 검색 input 없음 (주관식 오인 방지).
 * ───────────────────────────────────────────────────────────── */
function TabbedProcedurePicker({
  procedures,
  value,
  onChange,
  disabled,
}: {
  procedures: ProcedureOption[];
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  // 탭 목록 — categoryLabel 등장 순서 유지.
  const tabs = useMemo(() => {
    const order: string[] = [];
    for (const p of procedures) {
      if (!order.includes(p.categoryLabel)) order.push(p.categoryLabel);
    }
    return order;
  }, [procedures]);

  // 이미 선택된 값이 있으면 그 카테고리를 기본 활성으로, 없으면 첫 번째 탭(리프팅).
  const initialTab = useMemo(() => {
    if (value) {
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

  // 활성 탭의 칩 목록.
  const visibleChips = procedures.filter((p) => p.categoryLabel === activeTab);

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
        <div className="flex flex-wrap justify-center gap-1">
          {visibleChips.map((p) => {
            const selected = value === p.value;
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
                {p.label}
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
 *   비활성: #E8EAEE / #5C6470 / 500.
 *   color 미지정 활성: #4CBFF2 / 흰색 / 600.
 *   color 지정: 선택됨 = 색 solid 배경 + 흰 글씨. 호버(미선택) = 색 연한 톤(color+"22")
 *     배경 + color 글씨 미리보기. 평소 미선택 = 회색.
 * ───────────────────────────────────────────────────────────── */
function Chip({
  active,
  onClick,
  disabled,
  color,
  children,
}: {
  active: boolean;
  onClick: () => void;
  disabled?: boolean;
  color?: string;
  children: React.ReactNode;
}) {
  const [hover, setHover] = useState(false);

  let style: CSSProperties;
  if (active) {
    style = color
      ? { backgroundColor: color, color: "#FFFFFF", fontWeight: 600 }
      : { backgroundColor: "#4CBFF2", color: "#FFFFFF", fontWeight: 600 };
  } else if (color && hover && !disabled) {
    style = { backgroundColor: color + "22", color, fontWeight: 600 };
  } else {
    style = { backgroundColor: "#E8EAEE", color: "#5C6470", fontWeight: 500 };
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      className="shrink-0 cursor-pointer whitespace-nowrap rounded-full px-4 py-1 text-[13px] transition-transform active:scale-110 disabled:opacity-50"
      style={style}
    >
      {children}
    </button>
  );
}

/* ─────────────────────────────────────────────────────────────
 * EffectChip — 효과(멀티) 칩. 옵션별 고유색 + 호버 미리보기.
 *   선택됨 = color+"1A" 배경 + color 글씨 + 같은색 테두리 + bold.
 *   호버(미선택) = color+"14" 더 연한 미리보기.
 *   평소 미선택 = 회색(#E8EAEE / #5C6470).
 * ───────────────────────────────────────────────────────────── */
function EffectChip({
  active,
  color,
  onClick,
  disabled,
  children,
}: {
  active: boolean;
  color: string;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  // 선택=칸 색 solid+흰 글씨 / 미선택=회색. 호버 상태 없음
  //   (모바일에서 탭 후 hover 가 남아 해제해도 진한 회색으로 보이던 버그 제거).
  const style: CSSProperties = active
    ? { backgroundColor: color, color: "#FFFFFF", fontWeight: 600 }
    : { backgroundColor: "#E8EAEE", color: "#5C6470", fontWeight: 500 };

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="shrink-0 cursor-pointer whitespace-nowrap rounded-full px-4 py-1 text-[13px] transition-transform active:scale-110 disabled:opacity-50"
      style={style}
    >
      {children}
    </button>
  );
}

/* ─────────────────────────────────────────────────────────────
 * StarField — 1~5 별점 입력.
 *   호버 미리채움: 마우스 올린 위치까지 연한 확정색으로 미리보기,
 *   클릭하면 그 값이 진한 확정색으로 확정.
 *   - hover>0 인 별: n<=hover 면 채움(연한 var(--accent-save), opacity-50).
 *   - hover==0 인 별: n<=value 면 채움(진한 var(--accent-save)).
 *   - 빈 별: var(--bg-soft).
 *   5칸 모두 w-12 가운데 정렬 → FaceField 와 칸 위치 정렬.
 * ───────────────────────────────────────────────────────────── */
function StarField({
  label,
  value,
  onChange,
  disabled,
  required,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  disabled?: boolean;
  required?: boolean;
}) {
  const [hover, setHover] = useState(0);
  return (
    <div>
      <label className="mb-1 block text-sm font-semibold text-[var(--text)]">
        {label}{" "}
             </label>
      <div
        className="flex justify-start gap-1"
        onMouseLeave={() => setHover(0)}
      >
        {[1, 2, 3, 4, 5].map((n) => {
          // 확정(n<=value): 호버 중에도 채움(클릭하면 바로 확정된 느낌).
          // 호버 추가분(value 초과 ~ hover): 연한 미리보기. 그 외: 회색.
          const confirmed = n <= value;
          const hoverExtra = hover > 0 && n > value && n <= hover;
          const gold = confirmed || hoverExtra;
          return (
            <button
              key={n}
              type="button"
              aria-label={`${label} ${n}점`}
              onClick={() => onChange(n)}
              onMouseEnter={() => setHover(n)}
              disabled={disabled}
              className="flex w-11 cursor-pointer items-center justify-center text-[34px] leading-none transition-transform active:scale-125 disabled:opacity-50"
            >
              {/* flat 2D 별(★) — 채움=금색 / 호버 미리보기=옅은 금색 / 빈칸=연한 회색. */}
              <span
                style={{
                  color: gold
                    ? hoverExtra
                      ? "#F7CE8A"
                      : "var(--accent-save)"
                    : "#E3E7EB",
                }}
              >
                ★
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
 * FaceField — 표정 이모지 1~5 컴팩트 스케일 (통증 등).
 *   라벨 + 버튼 5개(이모지 + 아래 작은 라벨). 박스(border·bg) 없는 투명 버튼.
 *   상태별:
 *     선택됨(n===value)   → 진한 확정. 불투명 + 라벨 var(--primary-dark) +
 *                           옅은 primary 배경 pill.
 *     호버됨(n===hover, 미선택) → 연한 primary 미리보기. 라벨 primary,
 *                           살짝 불투명 + 옅은 배경.
 *     그 외               → 회색(opacity-40).
 *   5칸 모두 w-12 → StarField 와 칸 위치 정렬. 이모지 text-lg 유지.
 * ───────────────────────────────────────────────────────────── */
function FaceField({
  label,
  value,
  onChange,
  faces,
  disabled,
  required,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  faces: { face: string; label: string }[];
  disabled?: boolean;
  required?: boolean;
}) {
  const [hover, setHover] = useState(0);
  return (
    <div>
      <label className="mb-1 block text-sm font-semibold text-[var(--text)]">
        {label}      </label>
      <div
        className="flex justify-start gap-1"
        onMouseLeave={() => setHover(0)}
      >
        {faces.map((f, i) => {
          const n = i + 1;
          const selected = n === value;
          const previewing = !selected && n === hover && !disabled;
          // 배경 없는 flat 이모지 — 선택/호버는 불투명, 그 외 흐리게(그레이스케일).
          const on = selected || previewing;

          return (
            <button
              key={n}
              type="button"
              onClick={() => onChange(n)}
              onMouseEnter={() => setHover(n)}
              disabled={disabled}
              aria-label={`${label} ${n} ${f.label}`}
              aria-pressed={selected}
              className="flex w-11 cursor-pointer flex-col items-center justify-center gap-1 py-1 transition-transform active:scale-125 disabled:opacity-50"
            >
              <span
                className="text-[30px] leading-none"
                style={{
                  filter: on ? "none" : "grayscale(1)",
                  opacity: selected ? 1 : previewing ? 0.85 : 0.4,
                }}
              >
                {f.face}
              </span>
              <span
                className="text-[10px] font-medium"
                style={{ color: selected ? "var(--text)" : "var(--text-secondary)" }}
              >
                {f.label}
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
 *   칩 톤은 Chip 과 통일. 재시술 의향에 사용.
 * ───────────────────────────────────────────────────────────── */
function ChoiceField({
  label,
  value,
  onChange,
  options,
  disabled,
  required,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: ChoiceOption[];
  disabled?: boolean;
  required?: boolean;
}) {
  return (
    <div>
      <label className="mb-2 block text-sm font-semibold text-[var(--text)]">
        {label}      </label>
      <div className="flex flex-wrap gap-1.5">
        {options.map((opt) => (
          <Chip
            key={opt.value}
            active={value === opt.value}
            color={opt.color}
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
