/**
 * 자동 생성된 PICK 목록 (scripts/select_picks.py).
 * 각 원장님별 추천 글. Card에 Pick 배지 표시용.
 */

export const PICK_IDS_BY_DOCTOR: Record<string, number[]> = {
  "jung-hanmi": [944, 1199, 882, 1061, 1095],
  "rhee-doyoung": [964, 1025, 864, 1144, 1187],
  "kwon-soohyun": [1169, 1097, 308, 920],
  "kim-soohyung": [912, 1003, 1018, 1062],
  "ko-hyerim": [107, 751],
  "kim-jongsic": [952, 1170, 1172, 876],
  "kang-hyunjin": [3, 41],
  "bae-jungmin": [832, 708, 612, 676, 671],
};

export const PICK_IDS: Set<number> = new Set(Object.values(PICK_IDS_BY_DOCTOR).flat());
