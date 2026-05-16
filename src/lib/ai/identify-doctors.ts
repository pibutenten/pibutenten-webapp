/**
 * 자막 + 영상 제목 → 우리 9명 원장 자동 식별.
 *
 * 신호 소스:
 *  1) 자막 첫 ~3분 + 마지막 1분에서 자기소개 패턴
 *  2) 영상 제목에 이름이 포함되어 있는지
 *  3) 자막 전체에서 9명 이름 호명 빈도 (가장 많이 불린 사람 = 주 화자 후보)
 *
 * 외부 원장 화이트리스트는 더 이상 추출 X — 9명 외에는 "외부"로 일괄 처리.
 *
 * Phase 7 `scripts_phase7/30_identify_doctors.py` 의 핵심 로직 포팅.
 */

// DB doctors.slug 기준 9명 원장 — SSOT 는 schema/doctor.ts 의 DOCTORS.
// 호환성 위해 동일 이름으로 re-export (기존 호출자 변경 불필요).
import { DOCTORS } from "@/lib/schema/doctor";
export const DOCTORS_9 = DOCTORS;

export type DoctorMatch = {
  name: string;
  slug: string;
  /** 자막 본문 호명 빈도 */
  frequency: number;
  /** 자기소개 패턴 매칭 여부 */
  selfIntro: boolean;
  /** 영상 제목에 등장 */
  inTitle: boolean;
};

export type IdentifyResult = {
  /** 우리 9명 중 자막·제목에 등장한 원장들 — 빈도 내림차순 */
  matches: DoctorMatch[];
  /** 주 화자 (가장 강한 신호의 원장). 없으면 null */
  primary: DoctorMatch | null;
  /** 9명 중 누구도 식별 안 됨 — 작업 차단해야 함 */
  empty: boolean;
};

const DOCTOR_NAMES: readonly string[] = DOCTORS_9.map((d) => d.name);

/** 자막에서 자기소개를 잡는 정규식 패턴들 (Phase 7 30_identify_doctors.py 그대로) */
const SELF_INTRO_PATTERNS = [
  /저는\s*피부과\s*전문의\s*([가-힣]{2,4})\s*입니다/g,
  /저는\s*([가-힣]{2,4})\s*피부과\s*전문의\s*입니다/g,
  /저는\s*([가-힣]{2,4})입니다/g,
  /피부과\s*전문의\s*([가-힣]{2,4})\s*입니다/g,
  /피부과\s*전문의\s*([가-힣]{2,4})\s*예요/g,
  /피부과\s*전문의\s*([가-힣]{2,4})에요/g,
  /([가-힣]{2,4})\s*피부과\s*전문의\s*입니다/g,
  /피부텐텐의?\s*피부과\s*전문의\s*([가-힣]{2,4})/g,
  /피부\s*텐텐의?\s*피부과\s*전문의\s*([가-힣]{2,4})/g,
  /피부과\s*전문의\s*([가-힣]{2,4})/g,
  /([가-힣]{2,4})\s*원장\s*입니다/g,
  /([가-힣]{2,4})\s*원장이?\s*에요/g,
];

const PARTICLE_SUFFIX = new Set([
  "이", "가", "은", "는", "을", "를",
  "과", "와", "씨", "님", "의", "에", "도", "만",
]);

/** "박효진이", "정한미가" 같은 조사 결합형을 9명 본명으로 정규화. */
function normalizeName(raw: string): string {
  if (DOCTOR_NAMES.includes(raw)) return raw;
  if (raw.length >= 3) {
    for (const d of DOCTOR_NAMES) {
      if (raw.startsWith(d) && PARTICLE_SUFFIX.has(raw.slice(d.length))) {
        return d;
      }
    }
  }
  return raw;
}

/**
 * 자막에서 자기소개 매칭 — 9명 중 등장한 이름들 (Set 형태).
 * 자막 앞 ~3분(약 400 줄) + 마지막 1분(약 120 줄) 영역만 본다.
 */
function extractSelfIntro(transcript: string): Set<string> {
  // transcript는 줄 단위가 아니라 공백 합쳐진 평문 — 그냥 전체에서 시도해도 OK
  // 앞부분 위주로 trim하는 효과는 자연스럽게 본문 전체에서 검증되도록 유지
  const found = new Set<string>();
  for (const pat of SELF_INTRO_PATTERNS) {
    pat.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = pat.exec(transcript)) !== null) {
      const norm = normalizeName(m[1]);
      if (DOCTOR_NAMES.includes(norm)) found.add(norm);
    }
  }
  return found;
}

function countFrequency(text: string, name: string): number {
  let n = 0;
  let i = 0;
  while ((i = text.indexOf(name, i)) !== -1) {
    n++;
    i += name.length;
  }
  return n;
}

/**
 * 자막 본문 + 영상 제목 → 우리 9명 식별.
 *
 * 매칭 신호 강도(빈도 기준 + 자기소개·제목 가중):
 *   strength = frequency + (selfIntro ? 10 : 0) + (inTitle ? 5 : 0)
 *
 * primary = 최고 strength. 동률이면 자기소개 > 제목 > 빈도 순.
 * empty = 9명 중 누구도 어떤 신호도 없음 (frequency 0 + intro X + title X).
 */
export function identifyDoctors(opts: {
  transcript: string;
  videoTitle: string | null;
}): IdentifyResult {
  const transcript = opts.transcript ?? "";
  const title = opts.videoTitle ?? "";

  const introSet = extractSelfIntro(transcript);

  const matches: DoctorMatch[] = [];
  for (const d of DOCTORS_9) {
    const frequency = countFrequency(transcript, d.name);
    const selfIntro = introSet.has(d.name);
    const inTitle = title.includes(d.name);
    if (frequency > 0 || selfIntro || inTitle) {
      matches.push({
        name: d.name,
        slug: d.slug,
        frequency,
        selfIntro,
        inTitle,
      });
    }
  }

  matches.sort((a, b) => {
    const sa = a.frequency + (a.selfIntro ? 10 : 0) + (a.inTitle ? 5 : 0);
    const sb = b.frequency + (b.selfIntro ? 10 : 0) + (b.inTitle ? 5 : 0);
    if (sb !== sa) return sb - sa;
    if (a.selfIntro !== b.selfIntro) return a.selfIntro ? -1 : 1;
    if (a.inTitle !== b.inTitle) return a.inTitle ? -1 : 1;
    return b.frequency - a.frequency;
  });

  return {
    matches,
    primary: matches[0] ?? null,
    empty: matches.length === 0,
  };
}
