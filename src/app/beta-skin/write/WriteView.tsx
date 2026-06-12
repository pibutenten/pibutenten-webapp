"use client";

/**
 * WriteView — /beta-skin/write "글쓰기" 본문 (클라이언트).
 *
 * 공용 셸(BetaSkinShell)을 active="글쓰기" 로 사용.
 *
 * 항목 2) 운영 WriteTabs 구성과 일치 — 시술노트 / 시술후기 / 끄적끄적 3탭.
 *   (운영의 Q&A 탭은 원장·관리자 staff 전용이라 프리뷰에서 제외.)
 *   - 시술노트: 운영 DiaryForm 필드 재현(날짜/병원/원장·실장/받은 시술 태그/오늘의 노트).
 *   - 시술후기: 운영 ReviewForm 정량 컨트롤 재현(시술 선택/만족도 별점/통증 표정/다운타임/
 *     재시술/체감 효과 칩/효과시기/생생한 후기).
 *   - 끄적끄적: 제목 + 본문.
 *   모두 디자인 + 로컬 state 만 — 제출·자동완성·실제 저장 동작 없음(프리뷰 범위).
 */

import { useState } from "react";
import BetaSkinShell from "../BetaSkinShell";
import styles from "../beta-skin.module.css";
import { useBetaSearchRouting } from "../beta-ui";

/* 글 유형 3탭 — 운영 WriteTabs 와 동일 구성. */
const TYPES = [
  { key: "record", emoji: "💉", t: "시술노트", d: "나만 보는 기록" },
  { key: "review", emoji: "⭐", t: "시술후기", d: "경험을 나눠요" },
  { key: "doodle", emoji: "☁️", t: "끄적끄적", d: "자유롭게 적어요" },
] as const;

type TypeKey = (typeof TYPES)[number]["key"];

const TAG_CHIPS = [
  { label: "리프팅", tone: styles.chipBlue },
  { label: "스킨부스터", tone: styles.chipPink },
  { label: "색소·잡티", tone: styles.chipGreen },
  { label: "볼륨", tone: styles.chipPurple },
  { label: "모공·피지", tone: styles.chipYellow },
];

function IconCamera() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path d="M4 8h3l2-3h6l2 3h3v12H4z" />
      <circle cx="12" cy="13" r="3.5" />
    </svg>
  );
}

/* ---------- 시술노트 폼 (운영 DiaryForm 재현, 로컬 state) ---------- */
function DiaryFormView() {
  const [date, setDate] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  });
  const [clinic, setClinic] = useState("");
  const [doctor, setDoctor] = useState("");
  const [manager, setManager] = useState("");
  const [procs, setProcs] = useState<string[]>([]);
  const [tag, setTag] = useState("");
  const [memo, setMemo] = useState("");

  const addTag = () => {
    const v = tag.trim();
    if (!v || procs.includes(v)) {
      setTag("");
      return;
    }
    setProcs((p) => [...p, v]);
    setTag("");
  };

  return (
    <div className={styles.writeWrap}>
      <p className={styles.formIntro}>시술노트는 나만 볼 수 있어요</p>

      <div className={styles.field}>
        <label htmlFor="d-date">언제 받으셨어요?</label>
        <input
          id="d-date"
          className={styles.input}
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />
      </div>

      <div className={styles.field}>
        <label htmlFor="d-clinic">어디서 받으셨어요?</label>
        <input
          id="d-clinic"
          className={styles.input}
          type="text"
          placeholder="지명, 병원명으로 검색"
          value={clinic}
          onChange={(e) => setClinic(e.target.value)}
        />
      </div>

      <div className={styles.field}>
        <label>누구에게 받으셨어요?</label>
        <div className={styles.fieldGrid2}>
          <input
            className={styles.input}
            type="text"
            placeholder="원장님"
            value={doctor}
            onChange={(e) => setDoctor(e.target.value)}
          />
          <input
            className={styles.input}
            type="text"
            placeholder="실장님"
            value={manager}
            onChange={(e) => setManager(e.target.value)}
          />
        </div>
      </div>

      <div className={styles.field}>
        <label htmlFor="d-proc">어떤 시술을 받으셨어요?</label>
        {procs.length > 0 && (
          <div className={styles.diaryProcs}>
            {procs.map((p) => (
              <span className={styles.diaryProc} key={p}>
                {p}
                <button
                  type="button"
                  aria-label={`${p} 삭제`}
                  onClick={() => setProcs((arr) => arr.filter((x) => x !== p))}
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        )}
        <input
          id="d-proc"
          className={styles.input}
          type="text"
          placeholder="시술명 입력 후 엔터 (예: 울쎄라)"
          value={tag}
          onChange={(e) => setTag(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.nativeEvent.isComposing) {
              e.preventDefault();
              addTag();
            }
          }}
        />
        <p className={styles.fieldHint}>
          샷수·바이알 수·부위 등 기억하고 싶은 것만 적어주세요.
        </p>
      </div>

      <div className={styles.field}>
        <label htmlFor="d-memo">
          오늘의 시술 노트{" "}
          <span className={styles.fieldCount}>({memo.length} / 400)</span>
        </label>
        <textarea
          id="d-memo"
          className={styles.textarea}
          maxLength={400}
          placeholder="오늘 어땠는지, 기억해두고 싶은 것…"
          value={memo}
          onChange={(e) => setMemo(e.target.value)}
        />
      </div>

      <button
        type="button"
        className={`${styles.btn} ${styles.btnSolid} ${styles.writeSubmit}`}
      >
        기록 저장하기
      </button>
    </div>
  );
}

/* ---------- 시술후기 폼 (운영 ReviewForm 재현, 로컬 state) ---------- */
const REVIEW_PROCS = [
  "써마지",
  "울쎄라",
  "인모드",
  "리쥬란",
  "스킨부스터",
  "보톡스",
  "필러",
  "피코레이저",
];
const PAIN_FACES = [
  { face: "😊", label: "없음" },
  { face: "🙂", label: "조금" },
  { face: "😐", label: "보통" },
  { face: "😣", label: "꽤" },
  { face: "😖", label: "심함" },
];
const DOWNTIME = ["없음", "1~2일", "3~4일", "5~7일", "1주 이상"];
const REVISIT = ["있어요", "고민 중", "없어요"];
const EFFECT_ONSET = ["바로", "3일 내", "1~2주", "한 달 내", "두 달 이상"];
const EFFECT_AREAS = [
  "리프팅",
  "탄력",
  "쫀쫀함",
  "볼륨",
  "작은얼굴",
  "턱선",
  "피부톤",
  "피부결",
  "잔주름",
  "모공",
  "생기",
  "없음",
];

function ChoiceField({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: string[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className={styles.field}>
      <label>{label}</label>
      <div className={styles.rvAreas}>
        {options.map((o) => {
          const on = value === o;
          return (
            <button
              key={o}
              type="button"
              onClick={() => onChange(o)}
              className={`${styles.rvArea} ${on ? styles.rvAreaOn : ""}`}
              aria-pressed={on}
            >
              {o}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function ReviewFormView() {
  const [proc, setProc] = useState<string | null>(null);
  const [satisfaction, setSatisfaction] = useState(0);
  const [hoverStar, setHoverStar] = useState(0);
  const [pain, setPain] = useState(0);
  const [downtime, setDowntime] = useState("");
  const [revisit, setRevisit] = useState("");
  const [areas, setAreas] = useState<string[]>([]);
  const [onset, setOnset] = useState("");
  const [oneliner, setOneliner] = useState("");

  const toggleArea = (a: string) =>
    setAreas((prev) =>
      prev.includes(a) ? prev.filter((x) => x !== a) : [...prev, a],
    );

  return (
    <div className={styles.writeWrap}>
      {/* 1. 시술 선택 (잠금형) */}
      {proc ? (
        <div className={styles.rvSelected}>
          <span>{proc}</span>
          <button type="button" onClick={() => setProc(null)}>
            다시 선택
          </button>
        </div>
      ) : (
        <div className={styles.field}>
          <label>어떤 시술 후기를 남기시겠어요?</label>
          <div className={styles.rvChips}>
            {REVIEW_PROCS.map((p) => (
              <button
                key={p}
                type="button"
                className={styles.rvChip}
                onClick={() => setProc(p)}
              >
                {p}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className={proc ? "" : styles.rvLocked}>
        {/* 2. 만족도 (별점) */}
        <div className={styles.field}>
          <label>만족도</label>
          <div className={styles.rvStars} onMouseLeave={() => setHoverStar(0)}>
            {[1, 2, 3, 4, 5].map((n) => {
              const on = n <= (hoverStar || satisfaction);
              return (
                <button
                  key={n}
                  type="button"
                  aria-label={`만족도 ${n}점`}
                  onMouseEnter={() => setHoverStar(n)}
                  onClick={() => setSatisfaction(n)}
                  className={styles.rvStar}
                  style={{ color: on ? "#F5A623" : "#E3E7EB" }}
                >
                  ★
                </button>
              );
            })}
          </div>
        </div>

        {/* 3. 통증 (표정) */}
        <div className={styles.field}>
          <label>통증</label>
          <div className={styles.rvFaces}>
            {PAIN_FACES.map((f, i) => {
              const n = i + 1;
              const on = n === pain;
              return (
                <button
                  key={f.label}
                  type="button"
                  className={styles.rvFace}
                  onClick={() => setPain(n)}
                  aria-pressed={on}
                >
                  <span
                    className={styles.rvFaceEmoji}
                    style={{
                      filter: on ? "none" : "grayscale(1)",
                      opacity: on ? 1 : 0.4,
                    }}
                  >
                    {f.face}
                  </span>
                  <span className={styles.rvFaceLabel}>{f.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* 4. 다운타임 */}
        <ChoiceField
          label="다운타임이 얼마나 됐나요?"
          options={DOWNTIME}
          value={downtime}
          onChange={setDowntime}
        />

        {/* 5. 재시술 의향 */}
        <ChoiceField
          label="재시술 의향"
          options={REVISIT}
          value={revisit}
          onChange={setRevisit}
        />

        {/* 6. 체감 효과 (멀티) */}
        <div className={styles.field}>
          <label>이번 시술로 달라진 점을 모두 골라주세요!</label>
          <div className={styles.rvAreas}>
            {EFFECT_AREAS.map((a) => {
              const on = areas.includes(a);
              return (
                <button
                  key={a}
                  type="button"
                  onClick={() => toggleArea(a)}
                  className={`${styles.rvArea} ${on ? styles.rvAreaOn : ""}`}
                  aria-pressed={on}
                >
                  {a}
                </button>
              );
            })}
          </div>
        </div>

        {/* 7. 효과시기 */}
        <ChoiceField
          label="효과는 언제부터 느끼셨어요?"
          options={EFFECT_ONSET}
          value={onset}
          onChange={setOnset}
        />

        {/* 8. 생생한 후기 (선택) */}
        <div className={styles.field}>
          <label htmlFor="rv-one">
            생생한 후기를 남겨주세요{" "}
            <span className={styles.fieldCount}>({oneliner.length} / 400)</span>
          </label>
          <textarea
            id="rv-one"
            className={styles.textarea}
            maxLength={400}
            placeholder="고민하는 분들께 해주고 싶은 한마디를 남겨주세요."
            value={oneliner}
            onChange={(e) => setOneliner(e.target.value)}
          />
          <p className={styles.fieldHint}>
            의료광고성 표현·병원·의사 실명 언급은 금합니다.
          </p>
        </div>

        <button
          type="button"
          className={`${styles.btn} ${styles.btnSolid} ${styles.writeSubmit}`}
        >
          후기 올리기
        </button>
      </div>
    </div>
  );
}

/* ---------- 끄적끄적 폼 ---------- */
function DoodleFormView() {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  return (
    <div className={styles.writeWrap}>
      <div className={styles.field}>
        <label htmlFor="w-title">제목</label>
        <input
          id="w-title"
          className={styles.input}
          type="text"
          placeholder="자유롭게 한 문장으로 적어 주세요"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
      </div>

      <div className={styles.field}>
        <label htmlFor="w-body">내용</label>
        <textarea
          id="w-body"
          className={styles.textarea}
          placeholder="오늘의 피부 이야기, 자유롭게 적어 주세요."
          value={body}
          onChange={(e) => setBody(e.target.value)}
        />
      </div>

      <div className={styles.field}>
        <label>관련 태그</label>
        <div className={styles.chipRow}>
          {TAG_CHIPS.map((c) => (
            <span className={`${styles.chip} ${c.tone}`} key={c.label}>
              {c.label}
            </span>
          ))}
          <span className={styles.chip}>+ 직접 입력</span>
        </div>
      </div>

      <div className={styles.field}>
        <label>사진 (선택)</label>
        <button type="button" className={styles.photoAdd}>
          <IconCamera />
          0/5
        </button>
      </div>

      <button
        type="button"
        className={`${styles.btn} ${styles.btnSolid} ${styles.writeSubmit}`}
      >
        등록하기
      </button>
    </div>
  );
}

export default function WriteView() {
  const [type, setType] = useState<TypeKey>("record");
  const search = useBetaSearchRouting();

  const sidebar = (
    <>
      <section
        className={`${styles.card} ${styles.sideCard}`}
        style={{ background: "var(--tt-blue-tint)" }}
      >
        <h3>좋은 기록 팁</h3>
        <div className={styles.sideList}>
          <a href="#">
            <span className={styles.n}>1</span>
            <span>시술명과 받은 날짜를 적어 주세요</span>
          </a>
          <a href="#">
            <span className={styles.n}>2</span>
            <span>현재 증상이나 상태를 구체적으로</span>
          </a>
          <a href="#">
            <span className={styles.n}>3</span>
            <span>사진을 첨부하면 경과 비교가 쉬워져요</span>
          </a>
        </div>
      </section>
      <section className={`${styles.card} ${styles.sideCard}`}>
        <h3>안내</h3>
        <p className={styles.muted}>
          개인 식별이 가능한 정보는 가려서 올려 주세요. 답변은 일반적인 의학
          정보이며, 진단·처방은 내원 진료를 통해 받으실 수 있어요.
        </p>
      </section>
    </>
  );

  return (
    <BetaSkinShell active="글쓰기" sidebar={sidebar} {...search}>
      <div className={styles.writeWrap}>
        <div className={styles.sectionHead} style={{ marginTop: 8 }}>
          <h2>글쓰기</h2>
          <span className={styles.more}>임시저장 2</span>
        </div>

        <div className={styles.writeTypes}>
          {TYPES.map((ty) => (
            <button
              type="button"
              key={ty.key}
              className={`${styles.wt} ${type === ty.key ? styles.wtActive : ""}`}
              onClick={() => setType(ty.key)}
              aria-pressed={type === ty.key}
            >
              <div className={styles.emoji}>{ty.emoji}</div>
              <div className={styles.wtT}>{ty.t}</div>
              <div className={styles.wtD}>{ty.d}</div>
            </button>
          ))}
        </div>

        {type === "record" && <DiaryFormView />}
        {type === "review" && <ReviewFormView />}
        {type === "doodle" && <DoodleFormView />}
      </div>
    </BetaSkinShell>
  );
}
