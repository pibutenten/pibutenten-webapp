/**
 * 자동 생성된 PICK 목록 (scripts/select_picks.py).
 * 각 원장님별 추천 글. QACard에 Pick 배지 표시용.
 */

export const PICK_IDS_BY_DOCTOR: Record<string, number[]> = {
  jeonghanmi: [944, 1199, 882, 1061, 1095],
  kwonsuhyun: [1169, 1097, 308, 920],
  kimsoohyung: [912, 1003, 1018, 1062],
  gohyerim: [107, 751],
  kimjongsik: [952, 1170, 1172, 876],
  kanghyunjin: [3, 41],
  baejungmin: [832, 708, 612, 676, 671],
};

export const PICK_IDS: Set<number> = new Set(Object.values(PICK_IDS_BY_DOCTOR).flat());
