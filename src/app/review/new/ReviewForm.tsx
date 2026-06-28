"use client";

/**
 * ReviewForm — 시술후기 입력 폼 (P3, client).
 *
 * 항목 순서 (한줄후기만 선택, 나머지 필수):
 *   1. 시술 (맨 위, 택1, 검색+자동완성+인기칩. 선택 후 picker 언마운트 → 시술명만 제목처럼 표시, 변경 불가)
 *      → 시술을 골라야 아래 게이트 영역이 활성.
 *   2. [게이트] 어림시기 (언제쯤 받으셨어요?, create 전용, 선택)
 *   3. [게이트] 만족도 (별점 1~5, 필수)
 *   4. [게이트] 통증 (표정 1~5, 필수)
 *   5. [게이트] 시술 직후 반응 (멀티 칩, 선택) → 증상 있을 때만 다운타임 노출
 *   6. [게이트] 다운타임 (일상 복귀 소요, 단일선택 5옵션, 선택)
 *   7. [게이트] 재시술 의향 (예/고민중/아니오, 필수)
 *   8. [게이트] 체감 효과 (멀티 칩, ≥1, '없음' 포함, 필수)
 *   9. 생생한 후기 단답 (text ≤400, 선택)
 *
 * 검수: 병원·의사명은 서버에서 "○○" 로 자동 블라인드(마스킹). 제출 차단 아님.
 *   blinded 응답이면 고지 토스트 1회.
 *
 * 백엔드: POST /api/reviews (수정=PATCH). body 계약:
 *   procedure_ko / satisfaction(1~5) / pain(1~5) / downtime(슬러그) / revisit(enum) /
 *   effect_areas(string[], ≥1) — 필수, body(한줄후기 0~400) 선택.
 *   응답 { card_id, shortcode, status, blinded, screening }.
 *   중복(409) 면 서버 userMessage 노출. downtime 저장은 영문 슬러그.
 *
 * 디자인은 globals.css 토큰 + 기존 Chip/StarField 톤 재사용. 모바일 우선.
 */

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
  type CSSProperties,
} from "react";
import { useRouter } from "next/navigation";
import { showToast } from "@/lib/toast";
import { pickErrorMessage } from "@/lib/api-error";
import { useUnsavedChangesGuard } from "@/hooks/useUnsavedChangesGuard";
import { useAutocompleteKeyboard } from "@/hooks/useAutocompleteKeyboard";
import UnsavedChangesModal from "@/components/UnsavedChangesModal";
import {
  DOWNTIME_OPTIONS,
  REACTION_ALL,
  REACTION_NONE_LABEL,
  REACTION_COLORS,
} from "@/lib/review-options";
// 후기 평가 컨트롤·옵션은 review-controls.tsx 단일 공용 출처에서 import (자체 복사본 폐기, dedup).
//   동작·디자인·색·라벨은 추출 전 ReviewForm 원본과 1:1 동일.
import {
  StarField,
  FaceField,
  ChoiceField,
  EffectChip,
  categoryColor,
  PAIN_FACES,
  REVISIT_OPTIONS,
  EFFECT_AREA_OPTIONS,
  EFFECT_AREA_COLORS,
  ONELINER_MAX,
  ONELINER_PLACEHOLDERS,
} from "@/components/review/review-controls";
import ShortAnswerFields, {
  type ShortAnswerQuestion,
  type ShortAnswerValue,
  REPRESENTATIVE_QUESTION_TEXT,
} from "@/components/review/ShortAnswerFields";

export type ProcedureOption = {
  /** 서버 검증값 = procedure_taxonomy.ko */
  value: string;
  /** 표시명 */
  label: string;
  /** 하위 시술이면 상위 ko, 정식 시술이면 null */
  parentKo: string | null;
  /** 그룹 헤더 라벨 (리프팅/스킨부스터/필러·볼륨/주름·윤곽/레이저/기타) */
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
  reactions: string[];
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
  /** 단답 질문 풀(timepoint='any' 활성). create 모드에서만 단답 2칸 노출. 비면 숨김. */
  shortAnswerQuestions?: ShortAnswerQuestion[];
};

/* 통증(PAIN_FACES)·재시술(REVISIT_OPTIONS)·체감효과(EFFECT_AREA_OPTIONS/COLORS)·
   한줄후기(ONELINER_MAX/PLACEHOLDERS) 옵션은 review-controls.tsx 공용 출처에서 import.
   다운타임(DOWNTIME_OPTIONS) 는 @/lib/review-options 가 SSOT.
   슬러그는 DB CHECK(0213)·리포트 집계와 동일. (CLAUDE.md §5 동기화 페어) */

/* ─────────────────────────────────────────────────────────────
 * 어림시기(visited_on / date_precision) — "언제쯤 받으셨어요?" (2026-06-27 개편).
 *   회고형이라 정확한 날짜(달력)는 받지 않고 **일반적 언어**로만 받는다.
 *   1단(상대 연도, 택1): 올해 / 작년 / 재작년 / 몇 년 전 / 잘 기억 안 나요
 *   2단(연중, 선택·택1): 연초 / 봄 / 여름 / 가을 / 연말  (안 고르면 연 단위)
 *   → visited_on = 대표일(YYYY-MM-01). date_precision = season(연중 선택) / year(연만) / unknown(미기억·미선택).
 *     ('몇 년 전' = 3년 전 대표.) date_precision CHECK(exact/season/half/year/unknown) 중 year/season/unknown 만
 *     사용 — 마이그 불필요. unknown 이면 visited_on = null(백엔드 NULL, 알림 미발송).
 * ───────────────────────────────────────────────────────────── */
type Precision = "season" | "year" | "unknown";
type RelYear = "this" | "last" | "before2" | "older" | "unknown";
/** 상대 연도 칩 — yearsAgo(현재 연도 - n). unknown 은 연도 없음(null). */
const REL_YEAR_CHIPS: { value: RelYear; label: string; yearsAgo: number | null }[] = [
  { value: "this", label: "올해", yearsAgo: 0 },
  { value: "last", label: "작년", yearsAgo: 1 },
  { value: "before2", label: "재작년", yearsAgo: 2 },
  { value: "older", label: "몇 년 전", yearsAgo: 3 },
  { value: "unknown", label: "기억 안나요", yearsAgo: null },
];
/** 연중 세분 칩 — 대표 월(연초=01, 봄=04, 여름=07, 가을=10, 연말=12). 안 고르면 연 단위. */
const WITHIN_CHIPS: { value: string; label: string; month: string }[] = [
  { value: "early", label: "연초", month: "01" },
  { value: "spring", label: "봄", month: "04" },
  { value: "summer", label: "여름", month: "07" },
  { value: "autumn", label: "가을", month: "10" },
  { value: "yearend", label: "연말", month: "12" },
];

export default function ReviewForm({
  procedures,
  handle,
  initialProcedure,
  mode = "create",
  shortcode,
  initial,
  shortAnswerQuestions,
}: Props) {
  const router = useRouter();
  const isEdit = mode === "edit";
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  /* ── W-8: 유효성 검증 실패 시 첫 미입력 항목으로 스크롤 ── */
  const procedureRef = useRef<HTMLDivElement>(null);
  const satisfactionRef = useRef<HTMLDivElement>(null);
  const painRef = useRef<HTMLDivElement>(null);
  const downtimeRef = useRef<HTMLDivElement>(null);
  const revisitRef = useRef<HTMLDivElement>(null);
  const effectAreasRef = useRef<HTMLDivElement>(null);

  /* ── 단답(short answers, create 전용) ──
     단답 컴포넌트가 보고하는 현재 칸 상태. 제출 시 trim 후 빈 답 제거하고 전송. */
  const [shortAnswers, setShortAnswers] = useState<ShortAnswerValue[]>([]);
  // create 모드 + 풀이 1개 이상일 때만 단답 블록 노출.
  const showShortAnswers =
    !isEdit && (shortAnswerQuestions?.length ?? 0) > 0;

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
  const [reactions, setReactions] = useState<string[]>(initial?.reactions ?? []);
  const [oneliner, setOneliner] = useState(initial?.body ?? "");

  /* ── 어림시기 — 1단(상대 연도) + 2단(연중, 선택). create 전용. ── */
  const _now = useMemo(() => new Date(), []);
  const [relYear, setRelYear] = useState<RelYear | "">(""); // '' = 미선택(→ 미기억 취급)
  const [within, setWithin] = useState(""); // 연중 세분(선택). '' = 연 단위

  // 어림시기 → visited_on(YYYY-MM-01) 대표일. relYear 미선택/unknown → null.
  const visitedOnForSave = useMemo<string | null>(() => {
    if (relYear === "" || relYear === "unknown") return null;
    const ya = REL_YEAR_CHIPS.find((c) => c.value === relYear)?.yearsAgo ?? 0;
    const year = _now.getFullYear() - ya;
    const month = WITHIN_CHIPS.find((w) => w.value === within)?.month ?? "01";
    return `${String(year).padStart(4, "0")}-${month}-01`;
  }, [relYear, within, _now]);

  // 전송할 precision — 연중 선택=season, 연만=year, 미선택/미기억=unknown.
  const precisionForSave = useMemo<Precision>(
    () => (relYear === "" || relYear === "unknown" ? "unknown" : within ? "season" : "year"),
    [relYear, within],
  );

  // 어림시기 표시 라벨(예: "작년 봄쯤", "올해쯤", "잘 기억 안 나요").
  const precisionDateLabel = useMemo(() => {
    if (relYear === "") return "";
    const yl = REL_YEAR_CHIPS.find((c) => c.value === relYear)?.label ?? "";
    if (relYear === "unknown") return yl;
    const wl = WITHIN_CHIPS.find((w) => w.value === within)?.label;
    return wl ? `${yl} ${wl}쯤` : `${yl}쯤`;
  }, [relYear, within]);

  /* ── 이탈 방지 (beforeunload + popstate 통합 가드) ── */
  const isDirty =
    satisfaction > 0 ||
    pain > 0 ||
    !!downtime ||
    !!revisit ||
    effectAreas.length > 0 ||
    reactions.length > 0 ||
    oneliner.length > 0 ||
    // 어림시기를 고르면 dirty.
    relYear !== "" ||
    within !== "";

  // 이탈 방지 가드 — 임시저장 없이 dirty 경고 모달만(자동복원·이어쓰기 제거, 사용자 결정).
  //   create·edit 모두 [계속 작성]/[나가기] 2버튼(저장 안 함).
  const guard = useUnsavedChangesGuard(isDirty);

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

  // 시술 다시 선택(생성 모드 전용) — 확인 후 시술만 초기화하고 피커 재오픈.
  function reselectProcedure() {
    if (
      !window.confirm(
        "선택한 시술이 초기화됩니다. 계속할까요?",
      )
    ) {
      return;
    }
    setProcedureKo("");
    setError(null);
  }

  function toggleEffectArea(v: string) {
    setEffectAreas((prev) =>
      prev.includes(v) ? prev.filter((x) => x !== v) : [...prev, v],
    );
  }

  // 시술 직후 반응 토글 — '없음'은 단독선택(누르면 나머지 해제), 증상 누르면 '없음' 자동 해제.
  function toggleReaction(v: string) {
    setReactions((prev) => {
      if (v === REACTION_NONE_LABEL) return prev.includes(v) ? [] : [REACTION_NONE_LABEL];
      return prev.includes(v) ? prev.filter((x) => x !== v) : [...prev.filter((x) => x !== REACTION_NONE_LABEL), v];
    });
  }

  /* ── 제출 ── */
  // 필수: 시술·만족도·통증·재시술·효과(≥1, '없음'도 1개). 다운타임·한줄후기는 선택.
  //   다운타임은 시술 당일 작성 시 회복기간을 알 수 없어 선택사항(미선택=NULL 저장, 집계 무영향).
  const canSubmit =
    !!procedureKo &&
    satisfaction >= 1 &&
    pain >= 1 &&
    !!revisit &&
    effectAreas.length >= 1;

  const [validationErrors, setValidationErrors] = useState<string[]>([]);

  // 사용자가 필드를 수정하면 유효성 오류 목록 초기화.
  useEffect(() => {
    setValidationErrors([]);
  }, [procedureKo, satisfaction, pain, downtime, revisit, effectAreas]);

  function validate(): string[] {
    const errors: string[] = [];
    if (!procedureKo) errors.push("시술을 선택해주세요.");
    if (satisfaction < 1) errors.push("만족도를 선택해주세요.");
    if (pain < 1) errors.push("통증 정도를 선택해주세요.");
    // 다운타임은 선택사항(시술 당일 작성 시 미정) — 검증 게이트 없음.
    if (!revisit) errors.push("재시술 의향을 선택해주세요.");
    if (effectAreas.length < 1) errors.push("느낀 효과를 1개 이상 골라주세요.");
    return errors;
  }

  function submit() {
    setError(null);
    const errors = validate();
    if (errors.length > 0) {
      // W-8: 첫 번째 미입력 항목으로 스크롤 (검증 순서: 시술→만족도→통증→재시술→효과). 다운타임은 선택사항이라 제외.
      const firstRef = !procedureKo
        ? procedureRef
        : satisfaction < 1
          ? satisfactionRef
          : pain < 1
            ? painRef
            : !revisit
              ? revisitRef
              : effectAreas.length < 1
                ? effectAreasRef
                : null;
      firstRef?.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      setValidationErrors(errors);
      return;
    }

    // 단답(create 전용, 일원화 2칸) — trim 후 빈 답 제거. 모두 비면 키 생략(서버/RPC 무동작).
    const filledShortAnswers = showShortAnswers
      ? shortAnswers
          .map((a) => ({ question_id: a.question_id, answer_text: a.answer_text.trim() }))
          .filter((a) => a.answer_text.length > 0)
      : [];

    // 대표답(p_body) 결정 — 일원화 후 body 컬럼에는 "대표 답" 1개를 저장(검색·카드 본문 보존).
    //   create + 단답 2칸: "생생한 후기를 남겨주세요"(대표 질문) 답이 있으면 그것, 없으면 첫 비어있지
    //   않은 답. 둘 다 없으면 빈 문자열.  edit(또는 풀 미존재 fallback): 기존 oneliner textarea 값.
    const representativeBody = showShortAnswers
      ? (() => {
          const repId = (shortAnswerQuestions ?? []).find(
            (q) => q.text === REPRESENTATIVE_QUESTION_TEXT,
          )?.id;
          const repAnswer =
            repId != null
              ? filledShortAnswers.find((a) => a.question_id === repId)?.answer_text
              : undefined;
          return (repAnswer ?? filledShortAnswers[0]?.answer_text ?? "");
        })()
      : oneliner.trim();

    const payload = {
      procedure_ko: procedureKo,
      satisfaction,
      pain,
      // 다운타임은 선택 — 미선택('')이면 null 전송(서버 zod nullish 허용, DB NULL 저장, 집계 무영향).
      //   증상이 없으면(없음/빈배열) 다운타임은 의미가 없으므로 null(증상 1개 이상일 때만 값 전송).
      downtime: reactions.some((r) => r !== REACTION_NONE_LABEL) ? (downtime || null) : null,
      revisit,
      effect_areas: effectAreas,
      // 시술 직후 반응 — 멀티칩(없음 단독선택). 비면 빈 배열(=없음). RPC 가 reactions 비면 downtime 기존값 보존.
      reactions,
      // 어림시기 — date_precision 항상 전송. visited_on 은 unknown(미기억)이면 null(서버가 NULL 저장).
      date_precision: precisionForSave,
      visited_on: visitedOnForSave,
      // 대표답 = body(검수·마스킹은 라우트가 body 에 동일 적용). create=대표 단답, edit=oneliner.
      body: representativeBody,
      // 단답(optional) — 채워진 항목 전부 전송(대표답 포함). create 전용.
      ...(filledShortAnswers.length > 0 ? { short_answers: filledShortAnswers } : {}),
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

        guard.markSubmitted();
        if (data.card_id && typeof window !== "undefined") {
          try {
            window.sessionStorage.setItem(
              "pbtt:justPublished",
              JSON.stringify({ id: data.card_id, ts: Date.now() }),
            );
            window.sessionStorage.removeItem("pbtt:justPublished:shown");
          } catch { /* sessionStorage disabled */ }
        }
        router.push("/");
        router.refresh();
        window.scrollTo({ top: 0, behavior: "smooth" });
      } catch (e) {
        setError(e instanceof Error ? e.message : "네트워크 오류가 발생했어요.");
      }
    });
  }

  return (
    // 폭은 /write 글쓰기 탭 표준(끄적끄적·시술노트 = max-w-[680px])과 통일 —
    // 탭 전환 시 폼 시작 위치·폭·타이틀 위치가 일치하도록 맞춤.
    <section className="mx-auto w-full max-w-[680px] py-6">
      <h1 className="mb-5 text-center text-[20px] font-bold leading-[1.4] text-[var(--text)] fade-in-up">
        {isEdit ? "시술 후기 수정" : "소중한 후기로 다른 분을 도와요"}
      </h1>

      <div className="space-y-5 rounded-[var(--radius)] border border-[var(--border)] bg-white p-5 shadow-[var(--shadow-sm)]">
        {/* ── 1. 시술 선택 (필수, 잠금형) ── 폼 맨 위 — 시술을 골라야 아래 항목이 활성.
            선택하면 피커가 grid-rows 1fr→0fr 로 부드럽게 접히고, 선택한 시술명만
            제목으로 남으며 아래 입력창들이 자연스럽게 올라옴. */}
        <div ref={procedureRef}>
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
        {/* ── 0. 어림시기 (언제쯤 받으셨어요?) ── 게이트 안 첫 항목(시술 선택 후 활성).
            회고형: 일반 언어로만(달력 없음). 1단(상대 연도, 택1) + 2단(연중, 선택).
            unknown/미선택이면 날짜 미전송(서버 NULL). create 전용. */}
        {!isEdit && (
        <div>
          {/* 라벨 + 조합 결과("작년 가을쯤")를 같은 줄에 — 한 줄 절약(사용자 요청). */}
          <label className="mb-2 flex flex-wrap items-baseline gap-x-2 text-sm font-semibold text-[var(--text)]">
            <span>언제쯤 받으셨어요?</span>
            {relYear !== "" && precisionDateLabel && (
              <span className="text-[12px] font-normal text-[var(--primary)]">{precisionDateLabel}</span>
            )}
          </label>
          <div className="flex flex-wrap gap-1">
            {REL_YEAR_CHIPS.map((c) => {
              const on = relYear === c.value;
              return (
                <button
                  key={c.value}
                  type="button"
                  onClick={() => { setRelYear(c.value); if (c.value === "unknown") setWithin(""); }}
                  disabled={pending}
                  className="rounded-full px-2.5 py-1 text-[12.5px] whitespace-nowrap transition-colors disabled:opacity-50"
                  style={on ? { backgroundColor: "var(--primary)", color: "#fff", fontWeight: 600 } : { backgroundColor: "#E8EAEE", color: "#5C6470", fontWeight: 500 }}
                >
                  {c.label}
                </button>
              );
            })}
          </div>
          {/* 2단(연중) — 연도를 골랐고 '잘 기억 안 나요'가 아닐 때만. 다시 누르면 해제(연 단위). */}
          {relYear !== "" && relYear !== "unknown" && (
            <div className="mt-2 flex flex-wrap gap-1 fade-in-up">
              {WITHIN_CHIPS.map((w) => {
                const on = within === w.value;
                return (
                  <button
                    key={w.value}
                    type="button"
                    onClick={() => setWithin(on ? "" : w.value)}
                    disabled={pending}
                    className="rounded-full px-2.5 py-1 text-[12.5px] whitespace-nowrap transition-colors disabled:opacity-50"
                    style={on ? { backgroundColor: "var(--primary)", color: "#fff", fontWeight: 600 } : { backgroundColor: "#E8EAEE", color: "#5C6470", fontWeight: 500 }}
                  >
                    {w.label}
                  </button>
                );
              })}
            </div>
          )}
        </div>
        )}

        {/* ── 2. 만족도 ── */}
        <div ref={satisfactionRef}>
        <StarField
          label="만족도"
          required
          value={satisfaction}
          onChange={setSatisfaction}
          disabled={pending}
        />
        </div>

        {/* ── 3. 통증 (필수) ── */}
        <div ref={painRef}>
        <FaceField
          label="통증"
          required
          value={pain}
          onChange={setPain}
          faces={PAIN_FACES}
          disabled={pending}
        />
        </div>

        {/* ── 시술 직후 반응 (선택, 멀티 칩, '없음' 단독선택) ──
            증상이 1개 이상일 때만 아래 다운타임 질문 노출. 아무것도 안 고르면 빈 배열(=없음). */}
        <div>
          <label className="mb-2 block text-sm font-semibold text-[var(--text)]">
            시술 직후 불편한 점은 없었어요? (선택)
          </label>
          <div className="flex flex-wrap gap-3">
            {REACTION_ALL.map((opt, i) => (
              <EffectChip
                key={opt}
                active={reactions.includes(opt)}
                color={
                  opt === REACTION_NONE_LABEL ? "#C2C7CE" : REACTION_COLORS[i % REACTION_COLORS.length]
                }
                onClick={() => toggleReaction(opt)}
                disabled={pending}
              >
                {opt}
              </EffectChip>
            ))}
          </div>
        </div>

        {/* ── 4. 다운타임 (선택) ── 시술 직후 반응에 실제 증상이 1개 이상일 때만 노출. 미선택=NULL.
            증상 체크 시 살며시 열리고 지우면 살며시 닫힘(시술 선택 collapse 와 동일 grid-rows 패턴). */}
        {(() => {
          const dtOpen = reactions.some((r) => r !== REACTION_NONE_LABEL);
          return (
            <div
              className="grid transition-[grid-template-rows] duration-300 ease-out"
              style={{ gridTemplateRows: dtOpen ? "1fr" : "0fr" }}
            >
              <div className="min-h-0 overflow-hidden">
                <div ref={downtimeRef}>
                  <ChoiceField
                    label="다운타임이 얼마나 됐나요? (선택)"
                    hint="부기·멍·딱지 등이 가라앉고 일상이 편해질 때까지. 시술 직후라 아직 모르면 비워두셔도 돼요."
                    value={downtime}
                    onChange={setDowntime}
                    options={DOWNTIME_OPTIONS}
                    disabled={pending}
                  />
                </div>
              </div>
            </div>
          );
        })()}

        {/* ── 5. 재시술 의향 (필수) ── */}
        <div ref={revisitRef}>
        <ChoiceField
          label="재시술 의향"
          required
          value={revisit}
          onChange={setRevisit}
          options={REVISIT_OPTIONS}
          disabled={pending}
        />
        </div>

        {/* ── 6. 체감 효과 (필수, 멀티 칩, '없음' 포함) ── */}
        <div ref={effectAreasRef}>
          <label className="mb-2 block text-sm font-semibold text-[var(--text)]">
            달라진 점을 골라주세요
          </label>
          <p className="mb-2 text-xs text-[var(--text-muted)]">생각보다 많을 거예요 — 보통 4개 이상 고르세요.</p>
          <div className="flex flex-wrap gap-3">
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

        </div>
        {/* ↑ 시술 미선택 시 흐림 영역(평점·효과 등)은 여기서 닫는다. 아래 단답은 흐림 밖 — 시술을
            고르지 않아도 질문 다시 고르기·작성이 가능하도록(사용자 요청). 제출은 canSubmit 가 계속 가드. */}

        {/* ── 8. 생생한 후기 단답 (선택) ──
            일원화: create 모드 + 질문 풀이 있으면 질문 기반 단답 2칸(평평한 구조, 중첩 없음).
            각 칸 = [질문 라벨 + 다시 고르기 + n/400 카운터] + textarea — 옛 "생생한 후기" 글상자
            스타일·카운터 그대로. edit 모드(또는 풀 미존재 fallback)는 기존 단일 "생생한 후기"
            textarea 유지(수정은 본 안건 범위 외, 무회귀). */}
        {showShortAnswers ? (
          <ShortAnswerFields
            questions={shortAnswerQuestions ?? []}
            onChange={setShortAnswers}
            disabled={pending}
          />
        ) : (
          <div>
            <label className="mb-2 block text-sm font-semibold text-[var(--text)]">
              생생한 후기를 남겨주세요
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
        )}

        {/* 유효성 검사 오류 목록 */}
        {validationErrors.length > 0 && (
          <ul className="rounded-lg bg-red-50 p-3 text-sm text-red-600 space-y-1">
            {validationErrors.map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
        )}

        {/* 서버/네트워크 에러 */}
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
            className="h-11 rounded-md bg-[var(--primary)] px-12 text-[15px] font-semibold text-white transition-colors hover:bg-[var(--primary-dark)] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {pending
              ? isEdit
                ? "수정 중…"
                : "등록 중…"
              : isEdit
                ? "기록 수정"
                : "올리기"}
          </button>
        </div>
      </div>
      {guard.showModal && (
        // 임시저장 슬롯 제거(사용자 결정) → create·edit 모두 edit 형태([나가기]/[계속 작성])로.
        //   onSaveDraft 미전달 = "임시저장 후 종료" 옵션 없음.
        <UnsavedChangesModal
          variant="edit"
          onDiscard={guard.confirmDiscardAndLeave}
          onCancel={guard.cancelLeave}
        />
      )}
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
 * TabbedProcedurePicker — "검색 + 자동완성 + 인기칩(컴팩트)" 시술 선택기.
 *   상단에 항상 검색 입력. 검색어 유무로 두 모드:
 *
 *   - 검색어 있음(자동완성): label/value 부분일치 매칭(접두 우선)을 상위 20개
 *     목록으로 표시. 클릭 시 onChange(ko) + 검색어 초기화. 무매칭이면 안내 1줄.
 *   - 검색어 없음(둘러보기): 카테고리 탭(상단, 카테고리 색 밑줄) + 그 아래
 *     그라데이션 라인 + 활성 탭 상위 18개(인기순) 컴팩트 칩. 선택 시 카테고리색 틴트.
 *     나머지 시술은 검색으로 도달(별도 '더보기' 없음).
 *
 *   - 탭: procedures 의 categoryLabel 들(등장 순서 = 리프팅 → 스킨부스터).
 *   - 단일 선택: 클릭 시 onChange(ko). 선택 후 부모가 picker 를 언마운트하므로
 *     변경 불가(되돌리기/다시선택 없음).
 *   - procedures 는 인기순으로 정렬돼 들어옴 → slice 가 곧 인기순.
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

  // 검색어(자동완성) — 비면 둘러보기(탭+칩), 있으면 매칭 목록.
  const [query, setQuery] = useState("");

  // 활성 탭이 유효하지 않게 되면 첫 탭으로 보정.
  useEffect(() => {
    if (tabs.length > 0 && !tabs.includes(activeTab)) {
      setActiveTab(tabs[0]);
    }
  }, [tabs, activeTab]);

  const q = query.trim().toLowerCase();

  // 자동완성 매칭 — label/value 부분일치, 접두 우선 정렬 후 상위 20개.
  const matches = useMemo(() => {
    if (!q) return [];
    const hit = procedures.filter(
      (p) =>
        p.label.toLowerCase().includes(q) || p.value.toLowerCase().includes(q),
    );
    // 접두(startsWith) 우선 — 안정 정렬로 인기순(원래 순서) 보존.
    return hit
      .map((p, i) => ({
        p,
        i,
        pre:
          p.label.toLowerCase().startsWith(q) ||
          p.value.toLowerCase().startsWith(q)
            ? 0
            : 1,
      }))
      .sort((a, b) => a.pre - b.pre || a.i - b.i)
      .slice(0, 20)
      .map((x) => x.p);
  }, [procedures, q]);

  // 자동완성 키보드 네비(↑↓ 하이라이트, Enter 선택) — 공용 훅. matches 계산 뒤 최상위 호출.
  const kb = useAutocompleteKeyboard({
    count: matches.length,
    onSelect: (i) => { onChange(matches[i].value); setQuery(""); },
    enabled: !!q,
  });

  // C. 시술 선택 해제(value '' = '다시 선택') 시 검색어 초기화(이전 입력 비우기).
  useEffect(() => {
    if (!value) setQuery("");
  }, [value]);

  // 둘러보기 칩 — 활성 탭 카테고리 상위 18개(인기순 = 들어온 순서).
  const visibleChips = procedures
    .filter((p) => p.categoryLabel === activeTab)
    .slice(0, 18);

  return (
    <div>
      {/* 검색 입력 (검색 패널과 통일감 — 흰 폼카드 위) */}
      <div className="mb-3 flex items-center gap-2 rounded-full border border-[var(--border)] bg-white px-3.5 py-2 focus-within:border-[var(--primary)]">
        <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="#9aa3b0" strokeWidth={2} strokeLinecap="round" aria-hidden><circle cx="11" cy="11" r="7"/><path d="m21 21-4-4"/></svg>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={kb.onKeyDown}
          disabled={disabled}
          placeholder="시술명을 검색해 보세요"
          enterKeyHint="search"
          className="flex-1 bg-transparent text-[14px] outline-none placeholder:text-[var(--text-muted)] disabled:opacity-50"
        />
        {query && (
          <button type="button" onClick={() => setQuery("")} aria-label="검색어 지우기" className="text-[var(--text-muted)]">✕</button>
        )}
      </div>

      {q ? (
        /* 자동완성 — q 가 있으면 탭·칩·divider 대신 매칭 목록만. */
        matches.length > 0 ? (
          <div className="max-h-[260px] overflow-y-auto [&::-webkit-scrollbar]:hidden" style={{ scrollbarWidth: "none" }}>
            {matches.map((p, i) => (
              <button
                key={p.value}
                type="button"
                disabled={disabled}
                onClick={() => { onChange(p.value); setQuery(""); }}
                onMouseEnter={() => kb.setActiveIndex(i)}
                className={`flex w-full items-center justify-between gap-2 rounded-md px-2 py-2.5 text-left hover:bg-[#f7f9fb] disabled:opacity-50 ${i === kb.activeIndex ? "bg-[#f7f9fb]" : ""}`}
              >
                <span className="text-[14px] text-[var(--text)]">{p.label}</span>
                <span className="shrink-0 text-[11.5px] text-[var(--text-muted)]">{p.categoryLabel}</span>
              </button>
            ))}
          </div>
        ) : (
          <p className="py-3 text-center text-sm text-[var(--text-muted)]">검색 결과가 없어요.</p>
        )
      ) : (
        /* 둘러보기 — 카테고리 탭 + 컴팩트 칩(상위 18). */
        <>
          {/* 탭 */}
          <div
            role="tablist"
            aria-label="시술 카테고리"
            className="-mx-1 flex justify-start sm:justify-center gap-x-[14px] overflow-x-auto px-1 sm:gap-x-7 sm:overflow-visible [&::-webkit-scrollbar]:hidden"
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

          {/* 칩 (컴팩트, 상위 18 = 인기순) */}
          {visibleChips.length === 0 ? (
            <div className="text-center text-xs text-[var(--text-muted)]">
              선택할 수 있는 시술이 없습니다.
            </div>
          ) : (
            <div className="flex flex-wrap justify-start gap-1.5">
              {visibleChips.map((p) => {
                const selected = value === p.value;
                const color = categoryColor(p.categoryLabel);
                return (
                  <button
                    key={p.value}
                    type="button"
                    onClick={() => onChange(p.value)}
                    disabled={disabled}
                    className="cursor-pointer rounded-full px-2.5 py-1 text-[12.5px] transition-colors active:scale-[0.97] disabled:opacity-50"
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
        </>
      )}
    </div>
  );
}
