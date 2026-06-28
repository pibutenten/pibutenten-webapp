# 태그 카테고리 전면 개편 실행 계획서

> 작성: 2026-06-28 | 상태: 2차 검수 완료·전반영, 태그 JSON 대기 중
> 검수: 1차 독립 2명 + 2차 독립 2명 = 총 4명 교차 검수 (2026-06-28).
> 1차: 누락 파일 13개 발견·반영. 2차: 누락 파일 1개 + DB RPC 2개 + 실행 모호성 8건 + JSON 절차 부재 발견·반영.

---

## 1. 목표

기존 시술 카테고리 2종(리프팅/스킨부스터)을 **6종으로 확대**하여 시술후기 생태계를 강화한다.
비시술 카테고리(피부고민/홈케어/피부상식)는 유지하되 검색 탭에서 제거한다.

---

## 2. 확정 사항

### 2.1. 카테고리 체계 (10종)

| 구분 | 한글 | slug | 색상 | 후기 가능 |
|---|---|---|---|---|
| 시술 | 리프팅 | `lifting` | `#1E88E5` (딥블루) | O |
| 시술 | 스킨부스터 | `skinbooster` | `#F48FB1` (로즈핑크) | O |
| 시술 | 필러·볼륨 | `filler` | `#FFA726` (앰버) | O |
| 시술 | 주름·윤곽 | `contour` | `#26A69A` (틸) | O |
| 시술 | 레이저 | `laser` | `#E57373` (소프트레드) | O |
| 시술 | 기타 | `other` | `#78909C` (블루그레이) | O |
| 비시술 | 피부고민 | `concerns` | `#7E57C2` (퍼플) | X |
| 비시술 | 홈케어 | `homecare` | `#BF6E5C` (테라코타) | X |
| 비시술 | 피부상식 | `knowledge` | `#9E9D24` (올리브) | X |
| 관리 | 미지정 | `unassigned` | `#BDBDBD` (그레이) | X | <!-- 미지정은 UI 미노출 센티넬: CATEGORIES 배열·검색/온보딩/피드 탭 어디에도 표시 안 됨, KR2SLUG 에서 'unassigned' 로 분리되어 시술 탭 혼입 방지 -->

### 2.2. Slug 규칙

- **URL 라우트** (`/doctors/`, `/reports/`): 복수형 유지 (REST 표준, 변경 불필요)
- **카테고리 slug**: 신규 전부 단수 (`skinbooster`, `filler`, `contour`, `laser`, `other`)
- **기존 slug**: `concerns`, `lifting`, `homecare`, `knowledge` 그대로 유지

### 2.3. 새 태그 자동 등록 정책

- 시술 사전에 없는 태그로 후기 작성 시 → `category='기타'`, `is_procedure=true` 자동 등록
- 이미 `미지정`이던 태그가 후기에 사용되면 → `기타`로 자동 승격
- 새 시술 태그 자동 등록 시 → `tag_review_queue`에 `source='auto_procedure'`로 INSERT하여 관리자가 `/admin/tags` 미검수 큐에서 확인

### 2.4. 검색 UI

- 검색 탭: 시술 6개만 표시 (피부고민/홈케어/피부상식 제거)
- 기존 5탭 → 6탭 (리프팅·스킨부스터·필러볼륨·주름윤곽·레이저·기타)

---

## 3. 입력 자료

### 3.1. 사용자 제공 태그 JSON (전달용/ 폴더 경유, 대기 중)

형식:
```json
{
  "ko": "써마지FLX",
  "en": "thermage-flx",
  "parent": "써마지",
  "category": "리프팅",
  "aliases": ["Thermage FLX"],
  "typos": ["서마지flx"],
  "pubmed": ["Thermage FLX", "monopolar radiofrequency"]
}
```

필드 설명:
- `ko` (필수): 한글 대표명, tag_dictionary.ko UNIQUE 키
- `en` (권장): 영문 slug, URL/SEO/PubMed용
- `parent` (해당 시): 부모 시술 ko (계층 구조)
- `category` (필수): 6종 시술 카테고리 중 하나
- `aliases` (선택): 동의어/대체 표기 → tag_dictionary.aliases 컬럼
- `typos` (선택): 흔한 오타 → tag_normalization 테이블
- `pubmed` (선택): PubMed 검색 키워드 → tag_dictionary.pubmed_keywords 컬럼

### 3.2. 사용자가 제시한 6개 카테고리 초안 태그 목록

(이 목록은 JSON 확정 전 방향 참고용. 최종은 JSON 기준.)

1. **리프팅** (41종): 더블로, 더블로골드, 덴서티, 리니어지, 리니어펌, 리프테라, 리프테라2, 볼뉴머, 브이로, 브이로어드밴스, 비너스레거시, 세르프, 소프웨이브, 슈링크, 슈링크유니버스, 실리프팅, 거상실, 민트실, 잼버실, 캐번실, 코그실, 써마지, 써마지FLX, 엠페이스, 온다, 올리지오, 올리지오X, 올타이트, 울쎄라, 울쎄라프라임, 울트라셀, 울트라셀큐플러스, 울트라포머, 울트라포머MPT, 울핏, 인모드, 인모드포르마, 인모드FX, 텐써마, 텐쎄라, 튠페이스, 티타늄리프팅
2. **스킨부스터** (21종): 리쥬란, 리쥬란아이, 리쥬란힐러, 리쥬란HB플러스, 리쥬란S, 물광주사, 더마샤인, 물톡스, 볼라이트, 비타란, 샤넬주사, 스킨바이브, 엑소좀, 잘루프로, 쥬베룩, 프로파일로, 핑크주사, 하이디알, 힐로웨이브, PDRN, PRP
3. **필러·볼륨** (31종): 래디어스, 레니스나, 스컬트라, 에스테필, 엘란쎄, 올리디아365, 쥬베룩볼륨, 지방이식, 필러, 관자필러, 눈밑필러, 뉴라미스, 더채움, 레스틸렌, 목주름필러, 무턱필러, 미간필러, 벨로테로, 손등필러, 앞광대필러, 애교살필러, 이마필러, 이브아르, 입꼬리필러, 입술필러, 쥬비덤, 코필러, 클레비엘, 턱끝필러, 테오시알, 팔자필러
4. **주름·윤곽** (36종): 더엘주사, 보톡스, 나보타, 눈가보톡스, 뉴럭스, 다한증보톡스, 디스포트, 리즈톡스, 메디톡신, 목보톡스, 미간보톡스, 보툴렉스, 사각턱보톡스, 스킨보톡스, 승모근보톡스, 앨러간보톡스, 어깨보톡스, 원더톡스, 이노톡스, 이마보톡스, 입꼬리보톡스, 잇몸보톡스, 제오민, 종아리보톡스, 침샘보톡스, 코어톡스, 콧볼보톡스, 턱끝보톡스, 허벅지보톡스, 휴톡스, 엘사, 윤곽주사, 조각주사, 쥬브젠, 지방분해주사, 브이올렛, HPL주사
5. **레이저** (44종): 검버섯제거, 골드PTT, 기미레이저, 더마펜, 라비앙, 레이저토닝, 모피어스8, 문신제거, 브이빔, 브이빔퍼펙타, 브이빔프리마, 스칼렛, 스펙트라, 시크릿, 실펌X, 아그네스, 엑셀V, 인트라셀, 점제거, 제네시스, 제모레이저, 아포지, 젠틀맥스, 젠틀맥스프로, 젠틀맥스프로플러스, 클라리티, 튼살레이저, 포텐자, 프락셀, 피코레이저, 디스커버리피코, 엔라이튼, 피코슈어, 피코웨이, 피코케어, 피코플러스, 피코토닝, 피코프락셀, 헬리오스, CO2프락셔널, IPL, 루메카, M22, PDT
6. **기타** (22종): 두피보톡스, 라라필, 마늘주사, 메조테라피, 미라드라이, 밀크필, 바디슈링크, 바디온다, 백옥주사, 블랙필, 비타민주사, 스킨스케일링, 신데렐라주사, 아쿠아필, 엠스컬프트, 여드름압출, 카복시, 쿨소닉, 쿨스컬프팅, 크라이오, 태반주사, LDM

---

## 4. 실행 단계 (순서 엄수)

### Phase 1: DB 마이그레이션 (4개 SQL, 순서대로 적용)

> 최신 마이그레이션 번호: **0310**. 신규 4개는 **0311~0314**.
> 비-ASCII 포함 SQL은 반드시 UTF-8 파일 경로로 적용 (§6 참조).

#### 1-A. `0311_tag_category_overhaul.sql` — CHECK 제약조건 확장

```sql
-- tag_dictionary.category CHECK 에 4종 추가
-- 안전성: 기존 6종은 그대로 보존, 4종만 추가이므로 기존 데이터 위반 없음
ALTER TABLE public.tag_dictionary
  DROP CONSTRAINT IF EXISTS tag_dictionary_category_check;
ALTER TABLE public.tag_dictionary
  ADD CONSTRAINT tag_dictionary_category_check
  CHECK (category IN (
    '피부고민','리프팅','스킨부스터','홈케어','피부상식','미지정',
    '필러·볼륨','주름·윤곽','레이저','기타'
  ));
```

이 마이그레이션은 코드 배포 전에 먼저 적용해도 안전하다 (기존 코드는 기존 6종만 사용).

#### 1-B. `0312_tag_seed_and_reclassify.sql` — JSON 기반 태그 시드

**JSON 처리 절차** (새 세션이 실행할 구체적 절차):

1. 사용자가 `전달용/` 폴더에 둔 JSON 파일을 Node.js로 읽기
2. 기존 `tag_dictionary`를 전수 조회하여 기존 ko 목록 확보
3. JSON 각 항목에 대해 diff 리포트 생성:
   - **재분류**: 이미 존재하는 ko 중 category가 변경되는 것 (예: 보톡스 `스킨부스터` → `주름·윤곽`)
   - **신규 INSERT**: DB에 없는 ko
   - **기존 유지**: 이미 존재하고 category도 동일한 것
4. diff 리포트를 사용자에게 보여주고 확인 받기 (특히 재분류 대상)
5. 확인 후 SQL 마이그레이션 파일 생성

SQL 템플릿:
```sql
-- 재분류 (기존 태그의 카테고리 변경)
UPDATE public.tag_dictionary
SET category = '주름·윤곽', is_procedure = true, updated_at = now()
WHERE ko = '보톡스';

-- 신규 등록
INSERT INTO public.tag_dictionary (ko, category, en, parent_ko, is_procedure, aliases, pubmed_keywords)
VALUES ('써마지FLX', '리프팅', 'thermage-flx', '써마지', true,
        ARRAY['Thermage FLX']::text[], ARRAY['Thermage FLX','monopolar radiofrequency']::text[])
ON CONFLICT (ko) DO UPDATE SET
  category = EXCLUDED.category, en = COALESCE(EXCLUDED.en, tag_dictionary.en),
  parent_ko = COALESCE(EXCLUDED.parent_ko, tag_dictionary.parent_ko),
  is_procedure = true, updated_at = now();

-- 오타 등록 (tag_normalization)
INSERT INTO public.tag_normalization (canonical, variants)
VALUES ('서마지flx', ARRAY['써마지FLX']::text[])
ON CONFLICT (canonical) DO NOTHING;
```

엣지 케이스 처리:
- **중복 ko**: `ON CONFLICT (ko) DO UPDATE` 로 upsert
- **parent_ko 순서**: `parent_ko`가 참조하는 부모 태그를 먼저 INSERT (JSON을 parent 의존 순으로 정렬)
- **category 형식**: JSON의 `category`는 한글(`리프팅`, `필러·볼륨` 등) — DB CHECK와 동일
- **컬럼 타입**: `aliases`와 `pubmed_keywords`는 `text[]` (PostgreSQL 배열)

#### 1-C. `0313_tag_autoregister_v2.sql` — 트리거 수정

현재 동작:
- 사전 미존재 + 용어집 en 있음 → `category='미지정'` upsert
- 둘 다 없음 → `tag_review_queue` 대기

변경 후:
- **후기(`source LIKE 'card:review%'`)에서 사용된 미지정/미등록 태그** → `category='기타'`, `is_procedure=true` 로 upsert
- 그 외(일반 글 등) → 기존대로 `미지정` 또는 `tag_review_queue`
- **미지정 → 기타 승격**: 이미 미지정이던 태그가 후기에 사용되면 → `UPDATE category='기타', is_procedure=true`
- **관리자 확인**: 기타로 자동 등록/승격 시 `tag_review_queue` INSERT (`source='auto_procedure'`). 관리자가 `/admin/tags` 미검수 큐에서 확인. (`notifications` 테이블은 `kind` CHECK 제약조건 확장 + 푸시 트리거 연동 등 부수 작업이 크므로 기존 `tag_review_queue` 워크플로를 활용한다.)

> **참고**: `tag_review_queue` 스키마는 `(id, ko, suggested_en, source, created_at)`. `suggested_category` 컬럼은 없으므로, `source` 컬럼에 `'auto_procedure'`로 인코딩하여 관리자가 기타 카테고리 자동등록임을 식별하도록 한다.

#### 1-D. `0314_review_rpcs_category_expand.sql` — 리포트 RPC 카테고리 매핑 확장 (2차 검수 발견)

`get_review_report_overview()`와 `get_review_summary_pool()` 두 RPC 함수 내부에 한글→영문 slug 매핑이 2종(`리프팅`→`lifting`, `스킨부스터`→`injectables`)으로 하드코딩되어 있다 (마이그 0258, 175행/219행). 신규 카테고리가 전부 `knowledge`로 오매핑되므로, 6종 매핑으로 확장한다.

```sql
-- CASE 분기를 6종으로 확장
CASE t.category
  WHEN '리프팅' THEN 'lifting'
  WHEN '스킨부스터' THEN 'skinbooster'    -- 변경: injectables → skinbooster
  WHEN '필러·볼륨' THEN 'filler'           -- 신규
  WHEN '주름·윤곽' THEN 'contour'          -- 신규
  WHEN '레이저' THEN 'laser'               -- 신규
  WHEN '기타' THEN 'other'                 -- 신규
  ELSE 'other'                             -- fallback: knowledge → other
END AS category
```

> **핵심**: `procedure-report.ts` 334행의 `r.category` 비교값은 이 RPC가 반환하는 **영문 slug**이다. RPC와 코드를 동시에 6종으로 확장해야 한다.

### Phase 2: 코드 변경 (27개 파일)

수정 순서: 타입 정의 → 데이터 계층 → UI 계층 → CSS → 스크립트

> **`injectables` → `skinbooster` 전환 전략**: DB의 `category` 컬럼은 한글(`스킨부스터`)이므로 slug 변경과 무관하다. slug는 코드 측 `KR2SLUG` 매핑에만 존재한다. 코드에서 `injectables`를 `skinbooster`로 일괄 치환하되, `categoryFor()`에는 **빌드 전 과도기용 `"injectables"` fallback을 두지 않는다** — DB·코드·스냅샷이 한 commit에 동시 배포되므로 중간 상태가 존재하지 않는다. 다만 `tsc` 단계에서 누락을 전수 검출하기 위해 `CategorySlug`에서 `"injectables"`를 제거한 뒤 빌드하여, 컴파일 에러가 나는 모든 파일을 수정한다.

#### 2-A. 카테고리 타입 & 상수 (핵심 SSOT)

**① `src/lib/categories.ts`** — CategorySlug 타입 + CATEGORIES 배열

변경:
- `CategorySlug` 유니온에 `"skinbooster" | "filler" | "contour" | "laser" | "other"` 추가, `"injectables"` 제거
- `CATEGORIES` 배열: 9종 정의 (slug + label + color). `unassigned`(미지정)은 관리용 센티넬이므로 UI 배열에 미포함.
- `PROCEDURE_CATEGORIES`: 시술 6종 파생 상수 (검색 탭, 후기 폼용)
- `pickDefaultCategory()`: 시술 카테고리 중 `"other"` 제외 5종에서 랜덤 (기타는 시술 칩이 부족할 수 있으므로)

```typescript
export type CategorySlug =
  | "lifting" | "skinbooster" | "filler" | "contour" | "laser" | "other"
  | "concerns" | "homecare" | "knowledge";

export const CATEGORIES: readonly Category[] = [
  { slug: "lifting",     label: "리프팅",     color: "#1E88E5" },
  { slug: "skinbooster", label: "스킨부스터", color: "#F48FB1" },
  { slug: "filler",      label: "필러·볼륨",  color: "#FFA726" },
  { slug: "contour",     label: "주름·윤곽",  color: "#26A69A" },
  { slug: "laser",       label: "레이저",     color: "#E57373" },
  { slug: "other",       label: "기타",       color: "#78909C" },
  { slug: "concerns",    label: "피부고민",   color: "#7E57C2" },
  { slug: "homecare",    label: "홈케어",     color: "#BF6E5C" },
  { slug: "knowledge",   label: "피부상식",   color: "#9E9D24" },
] as const;

export const PROCEDURE_SLUGS = ["lifting","skinbooster","filler","contour","laser","other"] as const;
export type ProcedureSlug = typeof PROCEDURE_SLUGS[number];

export const PROCEDURE_CATEGORIES = CATEGORIES.filter(
  (c): c is Category & { slug: ProcedureSlug } => (PROCEDURE_SLUGS as readonly string[]).includes(c.slug)
);

export function pickDefaultCategory(): ProcedureSlug {
  const candidates: ProcedureSlug[] = ["lifting","skinbooster","filler","contour","laser"];
  return candidates[Math.floor(Math.random() * candidates.length)];
}
```

**② `scripts/gen-tag-dictionary.mjs`** — KR2SLUG 매핑

```javascript
const KR2SLUG = {
  피부고민: "concerns",
  리프팅: "lifting",
  스킨부스터: "skinbooster",   // 변경: injectables → skinbooster
  홈케어: "homecare",
  피부상식: "knowledge",
  미지정: "other",             // 변경: knowledge → other (미지정 태그도 시술 맥락 가능)
  "필러·볼륨": "filler",       // 신규
  "주름·윤곽": "contour",      // 신규
  레이저: "laser",             // 신규
  기타: "other",               // 신규
};
```

**③ `src/lib/procedure-dict.ts`** — `categoryFor()` 반환값 확장

```typescript
export function categoryFor(keyword: string): CategorySlug {
  const cat = SNAP_CATEGORY[keyword];
  if (cat === "lifting" || cat === "skinbooster" || cat === "filler" ||
      cat === "contour" || cat === "laser" || cat === "other" ||
      cat === "concerns" || cat === "homecare" || cat === "knowledge") {
    return cat;
  }
  return "knowledge";
}
```

**④ `src/lib/category-sets.ts`** — `categorize()` 래퍼 (변경 없이 procedure-dict 통해 자동 반영)

#### 2-B. 후기 리포트 타입 시스템 (검수 후 추가 — 누락 치명)

**⑤ `src/lib/procedure-report.ts`** — `ProcedureCategory` 타입 확장

현재 `"lifting" | "injectables"` 2종 하드코딩 → SSOT에서 파생:

```typescript
import { type ProcedureSlug, PROCEDURE_SLUGS } from "./categories";
export type ProcedureCategory = ProcedureSlug;  // 6종 자동 동기화
```

구체적 수정 지점:
- **113~118행** (한글→영문 slug 변환): 4종 분기 추가
  ```typescript
  // 기존: '리프팅' → 'lifting', '스킨부스터' → 'injectables'
  // 변경: 6종 전부 매핑
  if (taxRow?.category === '리프팅') category = 'lifting';
  else if (taxRow?.category === '스킨부스터') category = 'skinbooster';
  else if (taxRow?.category === '필러·볼륨') category = 'filler';
  else if (taxRow?.category === '주름·윤곽') category = 'contour';
  else if (taxRow?.category === '레이저') category = 'laser';
  else if (taxRow?.category === '기타') category = 'other';
  // 또는 KR→slug 매핑 객체 도입으로 단순화
  ```
- **334행** (RPC 반환값 검증): `r.category`는 DB RPC(`get_review_summary_pool`)가 반환하는 **영문 slug**이다. `PROCEDURE_SLUGS.includes()` 로 통일:
  ```typescript
  const category: ProcedureCategory | null =
    PROCEDURE_SLUGS.includes(r.category as any) ? r.category as ProcedureCategory : null;
  ```

**⑥ `src/lib/procedure-theme.ts`** — `categoryTheme()` 6종 색상 + soft 색상

현재 `if (category === "injectables")` 분기 → CATEGORIES SSOT에서 색상 파생.
단, 이 함수는 `color`(강조) + `soft`(연한 배경) 쌍을 반환한다. CATEGORIES에는 `color`만 있으므로, `soft`는 대표색에서 alpha 0.12~0.15 배경으로 파생한다.

```typescript
import { CATEGORIES } from "./categories";

function hexToSoft(hex: string): string {
  const r = parseInt(hex.slice(1,3),16);
  const g = parseInt(hex.slice(3,5),16);
  const b = parseInt(hex.slice(5,7),16);
  return `rgba(${r},${g},${b},0.12)`;
}

export function categoryTheme(category: string): CategoryTheme {
  const found = CATEGORIES.find(c => c.slug === category);
  if (!found) return { color: "var(--primary)", soft: "transparent" };
  return { color: found.color, soft: hexToSoft(found.color) };
}
```

> **참고**: 기존 리프팅 색상이 `#1E9FD8` → `#1E88E5`로, 스킨부스터가 `#E5689B` → `#F48FB1`로 변경된다. 이는 CATEGORIES SSOT 통일의 결과이며, 리포트 카드 헤더 색조가 약간 달라진다.

#### 2-C. 시술일기 (2차 검수 발견 — 누락 치명)

**⑤-b `src/components/skin/record/SkinDiaryForms.tsx`** — `CAT_COLOR` + `PROCEDURES` 확장

45행의 `CAT_COLOR` 상수가 리프팅/스킨부스터 2종으로 하드코딩:
```typescript
// 현재: { 리프팅: "#29B6F6", 스킨부스터: "#F48FB1" }
// 변경: CATEGORIES 9종 전체로 확장하거나 CATEGORIES.find()로 동적 조회
```

46~48행의 `PROCEDURES` 배열도 리프팅/스킨부스터 2개 탭으로만 분류. 6개 카테고리로 재분류 필요 (현재 보톡스가 스킨부스터에 포함 → 계획상 `주름·윤곽`으로 이동).

> **주의**: 이 파일은 4명의 검수관 중 2차 검수관 C만 발견. `tsc`로 잡히지 않는 하드코딩(한글 문자열 키)이므로 수동 확인 필수.

#### 2-D. 후기 시스템 (3개)

**⑦ `src/lib/review-procedures.ts`** — CATEGORY_ORDER 6종 확대

```typescript
const CATEGORY_ORDER: Record<string, number> = {
  리프팅: 0,
  스킨부스터: 1,
  "필러·볼륨": 2,
  "주름·윤곽": 3,
  레이저: 4,
  기타: 5,
};
```

**⑧ `src/components/review/review-controls.tsx`** — `categoryColor()` 확장

현재 리프팅/스킨부스터만 처리 → CATEGORIES.find() 동적 조회로 변경하면 자동 대응.

**⑨ `src/app/review/new/ReviewForm.tsx`** — 변경 최소

현재 `categoryLabel`로 탭을 동적 생성하므로, `review-procedures.ts`의 CATEGORY_ORDER 수정만으로 탭이 6개로 자동 확장됨. 추가 변경 불필요한지 확인 후 필요시 탭 레이아웃 조정 (6탭 모바일 스크롤 — `overflow-x-auto` + `scrollbarWidth: "none"` 이미 적용되어 기능 동작하나 스크롤 어포던스 유무 확인).

#### 2-D. 검색 UI (4개)

**⑩ `src/lib/popular-keywords.ts`** — PopularByCategory 버킷 확장

```typescript
const buckets: Record<CategorySlug, [string, number][]> = {
  lifting: [], skinbooster: [], filler: [], contour: [], laser: [], other: [],
  concerns: [], homecare: [], knowledge: [],
};
```

반환값도 동일하게 확장. 단, 검색 탭에서는 시술 6종만 사용 (UI에서 필터).

**⑪ `src/components/CategoryWithChips.tsx`** — 시술 6탭만 표시

```typescript
import { PROCEDURE_CATEGORIES, pickDefaultCategory } from "@/lib/categories";
// ...
{PROCEDURE_CATEGORIES.map((c) => { ... })}
```

**비시술 태그 검색 시 정책 확정**: 활성 탭 없이(모든 탭 비활성) 결과만 표시. "전체" 탭 추가는 이번 범위 초과. 비시술 태그 검색은 빈도가 낮으므로 자연스러운 동작이다.

**⑫ `src/components/search/SearchPanel.tsx`** — 하드코딩 `"injectables"` 제거 (검수 후 추가)

43행: `setActiveCat(Math.random() < 0.5 ? "lifting" : "injectables")` → `pickDefaultCategory()` 호출로 교체.

**⑬ `src/app/today/page.tsx`** — `popularByCat.injectables` 접근 수정 (검수 후 추가)

50행: `popularByCat.injectables.slice(0, 4)` → `popularByCat.skinbooster.slice(0, 4)` 변경 또는 PROCEDURE_CATEGORIES 순회 방식으로 리팩터링.

#### 2-E. 카테고리 칩 스타일링 — CSS 모듈 (검수 후 추가 — 누락 치명)

**⑭ `src/components/skin/ui.tsx`** — `CAT_TAG_CLASS` 매핑 확장

현재 5종 매핑:
```typescript
const CAT_TAG_CLASS: Record<CategorySlug, string> = {
  concerns: styles.catConcerns, lifting: styles.catLifting,
  injectables: styles.catInjectables, homecare: styles.catHomecare,
  knowledge: styles.catKnowledge,
};
```
→ 9종으로 확장. `injectables` → `skinbooster` 변경 + 4종 신규 추가.

**⑮ `src/components/skin/app.module.css`** — 카테고리 CSS 클래스 추가

현재 5종만 정의: `.catConcerns`, `.catLifting`, `.catInjectables`, `.catHomecare`, `.catKnowledge`
+ `button.t[data-cat="injectables"]:hover` 등 hover 규칙도 5종만.

변경:
- `.catInjectables` → `.catSkinbooster`로 교체
- `.catLifting` 색상도 `#29B6F6` → `#1E88E5`로 변경 (브랜드색 겹침 해소)
- `.catFiller`, `.catContour`, `.catLaser`, `.catOther` 4종 신규 추가
- `data-cat` 속성값도 일괄 변경

각 카테고리별 CSS 색상 세트 (기존 패턴: 대표색 alpha 0.13~0.18 배경 + 진한 글자):

| slug | 대표색 | 연한 배경 (칩 기본) | 진한 글자 | 활성 배경 |
|---|---|---|---|---|
| lifting | `#1E88E5` | `rgba(30,136,229,0.15)` | `#145ea0` | `#1E88E5` |
| skinbooster | `#F48FB1` | `rgba(244,143,177,0.15)` | `#a33b5e` | `#F48FB1` |
| filler | `#FFA726` | `rgba(255,167,38,0.15)` | `#b5711a` | `#FFA726` |
| contour | `#26A69A` | `rgba(38,166,154,0.15)` | `#1a756c` | `#26A69A` |
| laser | `#E57373` | `rgba(229,115,115,0.15)` | `#a33b3b` | `#E57373` |
| other | `#78909C` | `rgba(120,144,156,0.15)` | `#4d5f69` | `#78909C` |

> **주의**: 이 CSS는 타입 체크(`tsc`)로 잡히지 않으므로 수동 확인 필수.
> **주의**: 리프팅 색상이 기존 `#29B6F6`(파스텔 하늘)에서 `#1E88E5`(딥블루)로 변경된다. 사용자가 인지하고 승인한 변경이다 (브랜드 primary `#4CBFF2`와 겹침 해소).

#### 2-F. CATEGORIES 참조 UI 컴포넌트 (검수 후 추가)

**⑯ `src/components/skin/FeedSidebar.tsx`** — CATEGORIES.map() 으로 탭 동적 생성

**정책 확정**: 전체 유지 (비시술 포함). Q&A 피드에서 비시술 태그(피부고민/홈케어/피부상식)도 활발히 사용되므로 9종 전체 탭이 적절하다. CATEGORIES 확장으로 자동 반영되며, 추가 코드 수정 불필요.

**⑰ `src/app/onboarding/OnboardingClient.tsx`** — CATEGORIES import 로 관심시술 탭 구성

**정책 확정**: `PROCEDURE_CATEGORIES`(시술 6종)만 표시. 온보딩은 "관심 시술 선택"이므로 비시술(피부고민/홈케어/피부상식)은 부적합하다.

```typescript
// 변경: CATEGORIES → PROCEDURE_CATEGORIES import
import { PROCEDURE_CATEGORIES } from "@/lib/categories";
```

**⑱ `src/app/today/KeywordCarousel.tsx`** — CATEGORIES import + categorize 사용

CATEGORIES 확장에 따라 자동 반영되지만, 캐러셀 UI에서 9종 카테고리 색상이 정상 표시되는지 확인.

**⑲ `src/components/report/ProcedureReportCard.tsx`** — categoryTheme 사용

`procedure-theme.ts` 수정 시 자동 반영. 신규 카테고리 리포트 카드 헤더 색상 확인.

#### 2-G. 관리자 UI & API (5개)

**⑳ `src/app/api/admin/tag-dictionary/[id]/route.ts`** — CATEGORIES 상수 확장

```typescript
const CATEGORIES = [
  "피부고민", "리프팅", "스킨부스터", "홈케어", "피부상식", "미지정",
  "필러·볼륨", "주름·윤곽", "레이저", "기타",
] as const;
```

**㉑ `src/app/admin/tags/AdminTagsView.tsx`** — CATEGORIES 상수 동일 확장

**㉒ `src/app/admin/tags/TagQueue.tsx`** — 분류 드롭다운 확장 (10종)

**㉓ `src/app/admin/tags/page.tsx`** — 카테고리별 카운트 쿼리 확장

**㉔ `src/app/admin/tags/TagAdminTable.tsx`** — CATEGORIES 상수 확장 (검수 후 추가)

26행의 6종 한글 CATEGORIES → 10종으로 확장.

**㉕ `src/app/admin/review-reports/AdminReviewReportsView.tsx`** — CATEGORY_LABEL 확장 (검수 후 추가)

42행: `injectables: "주사·스킨부스터"` → `skinbooster: "스킨부스터"` + 4종 신규 라벨 추가.

#### 2-H. SEO/Schema (2개)

**㉖ `src/lib/schema/procedure.ts`** — `keywordToAboutSchema()`

```typescript
// 기존: lifting || injectables → MedicalProcedure
// 변경: 시술 6종 전부 → MedicalProcedure (PROCEDURE_SLUGS import 활용)
if (PROCEDURE_SLUGS.includes(category as any)) {
  return { "@type": "MedicalProcedure", ...baseName, ... };
}
```

**㉗ `src/app/reports/[procedure]/page.tsx`** — schema.org category 출력 확인 (검수 후 추가)

`report.category`를 JSON-LD에 그대로 내보내므로, `ProcedureCategory` 타입 확장이 선행되어야 함. 주석의 `"lifting/injectables"` 업데이트.

#### 2-I. 보조 스크립트 (빌드 파이프라인 외, 비치명)

**`scripts/merge-dictionaries.mjs`** (36행) — `injectables` 하드코딩 → `skinbooster`
**`scripts/analyze-dict-coverage.mjs`** (37, 39행) — `injectables` 하드코딩 → `skinbooster`

빌드에 포함되지 않아 즉시 장애는 아니지만, 향후 실행 시 잘못된 결과를 내므로 함께 수정.

### Phase 3: 빌드 & 검증

> **중요**: Phase 2의 **모든 코드 수정을 완료한 후에** `tsc`를 돌린다. 중간중간 돌리지 않는다 — `CategorySlug` 변경은 연쇄 타입 에러를 발생시키므로, 모든 파일을 일괄 수정한 뒤 한 번만 실행해야 한다.

1. `npx tsc --noEmit` — 타입 체크 (CategorySlug 변경으로 인한 에러 전수 수정)
2. `grep -r "injectables" --include="*.ts" --include="*.tsx" --include="*.mjs" --include="*.css"` → 잔여 참조 0건 확인
3. `npm run build` — prebuild 에서 `gen-tag-dictionary.mjs` 실행 → 새 스냅샷 생성 (DB에 Phase 1 적용 완료 필수)
4. 빌드 성공 확인
5. 코드 검수 (code-reviewer 서브에이전트) — CLAUDE.md §3에 따라 [치명] 항목 시 수정 후 재검수

### Phase 4: 배포

1. `git add` — 변경 파일 명시 stage
2. `git commit` — 커밋 메시지: "feat: 시술 카테고리 6종 확대 (리프팅/스킨부스터/필러볼륨/주름윤곽/레이저/기타)"
3. `git push origin main` — Vercel 자동 배포 트리거

### Phase 5: 문서 갱신

- `docs/CHANGELOG.md` — Added 항목
- `docs/DATABASE.md` — 마이그레이션 표 추가 (0311~0314), tag_dictionary 스키마 갱신
- `docs/PRD.md` — §4.2 검색/피드의 5탭 → 6탭 기술, §4.3 시술후기 카테고리 설명
- `docs/TECH_SPEC.md` — 56행 5개 카테고리 → 6개, 110행 `#29B6F6` → `#1E88E5` (2차 검수 발견)
- `CLAUDE.md` — §5 동기화 페어에 신규 항목 추가:
  ```
  KR2SLUG (gen-tag-dictionary.mjs) ↔ tag_dictionary.category CHECK 제약조건 | 카테고리 추가·제거 시 양쪽 갱신
  ```

---

## 5. 영향 범위 & 회귀 점검

### 5.1. 직접 영향

| 영역 | 영향 | 점검 항목 |
|---|---|---|
| 검색 탭 | 5탭→6탭 | 모바일 가로 스크롤, 탭 색상 구분 |
| 후기 작성 폼 | 2탭→6탭 | 시술 선택 UI 동작, 각 탭 시술 목록 |
| 후기 리포트 | 시술명→카테고리 매핑 | 리포트 페이지 카테고리 배지 색상 |
| 관리자 태그 | 6→10 카테고리 | 필터 칩, 드롭다운, 카운트 쿼리 |
| 인기 키워드 | 5버킷→9버킷 | 각 카테고리별 칩 표시 |
| schema.org | MedicalProcedure 범위 확대 | 구조화 데이터 유효성 |
| 스냅샷 | 카테고리 slug 변경 | `tag-dictionary.generated.json` 재생성 |

### 5.2. 간접 영향 (주의)

| 영역 | 위험 | 대응 |
|---|---|---|
| `injectables` slug 폐기 | 코드 전체에 하드코딩 산재 (~20곳) | `tsc`로 타입 에러 전수 검출 + CSS/data-attr는 수동 grep (`"injectables"` 전역 검색) |
| 온보딩 관심시술 탭 | CATEGORIES 9종 확장 → 온보딩 탭 5→9 자동 증가 | `OnboardingClient.tsx`에서 `PROCEDURE_CATEGORIES`로 교체 검토 또는 전체 유지 정책 결정 |
| FeedSidebar 탭 | CATEGORIES 확장 → 사이드바 탭 5→9 자동 증가 | Q&A 피드에서는 비시술 태그도 사용하므로 전체 유지 적절 (디자인 확인) |
| 키워드 다이제스트 알림 | 새 카테고리 태그도 다이제스트 매칭 대상 | tag_dictionary 기반이므로 자동 반영 |
| card_public_url SQL 함수 | 카테고리와 무관 (type/slug 기반) | 영향 없음 |
| 기존 cards.keywords | 이미 저장된 키워드 문자열에는 영향 없음 | 태그 자체(ko)는 변하지 않고 카테고리만 변경 |
| RSS/Sitemap | 카테고리와 무관 (card type 기반) | 영향 없음 |
| 색상 접근성 | `#E57373`(레이저)과 `#F48FB1`(스킨부스터) 둘 다 붉은 계열 | 색각이상 사용자 구분 어려움. 칩 활성 상태에서만 사용되어 영향 제한적이나 모니터링 |

### 5.3. 호환성

- `injectables` → `skinbooster` 전환: DB·코드·스냅샷이 **한 commit에 동시 배포**되므로 중간 상태 없음. Vercel 빌드 시 `gen-tag-dictionary.mjs`가 DB에서 새 스냅샷을 생성하여 `skinbooster` slug가 자동 반영됨.
- DB의 `category` 컬럼은 한글 문자열(`스킨부스터`)이므로 slug 변경과 무관. slug는 코드 측 매핑 (`KR2SLUG`)에만 존재.
- DB CHECK 제약조건 확장은 "추가"만 수행(기존 6종 보존 + 4종 추가). 기존 데이터가 새 CHECK를 위반하지 않으므로 데이터 유실 위험 없음.
- URL 라우트에 시술 카테고리 slug는 사용되지 않음 (`/reports/[procedure]`는 `tag_dictionary.en` 사용, `/doctors/[slug]`는 의사 slug 사용). slug 변경으로 인한 URL 깨짐 없음.

---

## 6. 비-ASCII 인코딩 주의 (CLAUDE.md §8)

4개 새 카테고리 중 `필러·볼륨`과 `주름·윤곽`에 가운뎃점(·)이 포함되어 있으므로, SQL 마이그레이션은 반드시 **UTF-8 파일 경로**(`node fetch` + `readFileSync`)로 적용한다. PowerShell/curl 콘솔(CP949) 직접 적용 금지.

적용 후 검증 (모든 한글 컬럼 + 함수 본문 전수 검사):
```sql
-- 1. tag_dictionary 전 컬럼
SELECT count(*) FROM tag_dictionary
WHERE position(chr(65533) in category) > 0
   OR position(chr(65533) in ko) > 0
   OR position(chr(65533) in parent_ko) > 0;
-- 결과: 0 이어야 함

-- 2. tag_normalization
SELECT count(*) FROM tag_normalization
WHERE position(chr(65533) in canonical) > 0;
-- 결과: 0 이어야 함

-- 3. DB 함수 본문 (트리거 함수에 한글 포함)
SELECT count(*) FROM pg_proc
WHERE position(chr(65533) in pg_get_functiondef(oid)) > 0;
-- 결과: 0 이어야 함
```

UTF-8 적용 스크립트 패턴 (scratchpad/db.mjs):
```javascript
import { readFileSync } from 'node:fs';
const sql = readFileSync(process.argv[2], 'utf8');
const res = await fetch(
  `https://api.supabase.com/v1/projects/${process.env.SUPABASE_PROJECT_REF}/database/query`,
  { method: 'POST',
    headers: { Authorization: `Bearer ${process.env.SUPABASE_ACCESS_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }) }
);
console.log(await res.json());
```
실행: `node scratchpad/db.mjs supabase/migrations/0311_tag_category_overhaul.sql`

---

## 7. 파일 변경 요약

### 7-A. DB 마이그레이션 (4개)

| # | 파일 | 변경 유형 |
|---|---|---|
| 1 | `supabase/migrations/0311_tag_category_overhaul.sql` | 신규 (CHECK 확장) |
| 2 | `supabase/migrations/0312_tag_seed_and_reclassify.sql` | 신규 (JSON 기반 시드) |
| 3 | `supabase/migrations/0313_tag_autoregister_v2.sql` | 신규 (트리거 수정) |
| 4 | `supabase/migrations/0314_rpc_category_mapping.sql` | 신규 (RPC CASE WHEN 확장) |

### 7-B. 코드 수정 (29개)

| # | 파일 | 변경 내용 | 발견 |
|---|---|---|---|
| 5 | `src/lib/categories.ts` | CategorySlug 타입 + CATEGORIES + PROCEDURE_CATEGORIES + ProcedureSlug | 원안 |
| 6 | `scripts/gen-tag-dictionary.mjs` | KR2SLUG 매핑 확장 | 원안 |
| 7 | `src/lib/procedure-dict.ts` | categoryFor() 반환값 확장 | 원안 |
| 8 | `src/lib/procedure-report.ts` | ProcedureCategory → ProcedureSlug 파생 + 113-118행 6분기 + 334행 slug 비교 | **1차 검수** |
| 9 | `src/lib/procedure-theme.ts` | categoryTheme() CATEGORIES SSOT 파생 + hexToSoft() | **1차 검수** |
| 10 | `src/lib/review-procedures.ts` | CATEGORY_ORDER 6종 확대 | 원안 |
| 11 | `src/components/review/review-controls.tsx` | categoryColor() 동적 조회 | 원안 |
| 12 | `src/app/review/new/ReviewForm.tsx` | 6탭 레이아웃 확인 | 원안 |
| 13 | `src/lib/popular-keywords.ts` | PopularByCategory 버킷 9종 | 원안 |
| 14 | `src/components/CategoryWithChips.tsx` | PROCEDURE_CATEGORIES 6탭 | 원안 |
| 15 | `src/components/search/SearchPanel.tsx` | 하드코딩 "injectables" → pickDefaultCategory() | **1차 검수** |
| 16 | `src/app/today/page.tsx` | popularByCat.injectables → .skinbooster | **1차 검수** |
| 17 | `src/components/skin/ui.tsx` | CAT_TAG_CLASS 9종 매핑 | **1차 검수** |
| 18 | `src/components/skin/app.module.css` | .catInjectables→.catSkinbooster + 4종 신규 CSS | **1차 검수** |
| 19 | `src/components/skin/record/SkinDiaryForms.tsx` | CAT_COLOR + PROCEDURES 하드코딩 6종 확장 | **2차 검수** |
| 20 | `src/components/skin/FeedSidebar.tsx` | CATEGORIES 확장에 따른 탭 영향 확인 | **1차 검수** |
| 21 | `src/app/onboarding/OnboardingClient.tsx` | PROCEDURE_CATEGORIES만 표시 (정책 확정) | **1차 검수** |
| 22 | `src/app/today/KeywordCarousel.tsx` | CATEGORIES + categorize 확장 자동 반영 확인 | **1차 검수** |
| 23 | `src/components/report/ProcedureReportCard.tsx` | categoryTheme 사용 — 자동 반영 확인 | **1차 검수** |
| 24 | `src/lib/schema/procedure.ts` | MedicalProcedure 시술 6종 확대 | 원안 |
| 25 | `src/app/reports/[procedure]/page.tsx` | schema.org category + 주석 업데이트 | **1차 검수** |
| 26 | `src/app/api/admin/tag-dictionary/[id]/route.ts` | CATEGORIES 10종 | 원안 |
| 27 | `src/app/admin/tags/AdminTagsView.tsx` | CATEGORIES 10종 | 원안 |
| 28 | `src/app/admin/tags/TagQueue.tsx` | 드롭다운 10종 | 원안 |
| 29 | `src/app/admin/tags/page.tsx` | 카운트 쿼리 확장 | 원안 |
| 30 | `src/app/admin/tags/TagAdminTable.tsx` | CATEGORIES 10종 | **1차 검수** |
| 31 | `src/app/admin/review-reports/AdminReviewReportsView.tsx` | CATEGORY_LABEL 확장 | **1차 검수** |
| 32 | `scripts/merge-dictionaries.mjs` | injectables → skinbooster (비빌드) | **1차 검수** |
| 33 | `scripts/analyze-dict-coverage.mjs` | injectables → skinbooster (비빌드) | **1차 검수** |

### 7-C. 자동 반영 (수동 수정 불필요, 빌드/타입체크 시 검증만)

| # | 파일 | 비고 |
|---|---|---|
| 34 | `src/data/tag-dictionary.generated.json` | 빌드 시 gen-tag-dictionary.mjs 가 자동 재생성 |
| 35 | `src/components/Card.tsx` | CATEGORIES import → tsc가 자동 검출, 수정 불필요 예상 |

### 7-D. 문서 갱신 (5개)

| # | 파일 | 변경 내용 |
|---|---|---|
| 36 | `docs/CHANGELOG.md` | Added 항목 |
| 37 | `docs/DATABASE.md` | 마이그레이션 표 + tag_dictionary 스키마 |
| 38 | `docs/PRD.md` | §4.2 검색 6탭, §4.3 후기 카테고리 |
| 39 | `docs/TECH_SPEC.md` | §2 태그 사전 카테고리 체계 반영 |
| 40 | `CLAUDE.md` (루트) | §5 동기화 페어 갱신 |

### 7-E. 총계

| 구분 | 건수 |
|---|---|
| DB 마이그레이션 | 4 |
| 코드 수정 | 29 |
| 자동 반영 | 2 |
| 문서 갱신 | 5 |
| **합계** | **40** |

---

## 8. `injectables` 제거 전수 검출 전략

`tsc`가 잡는 것:
- `CategorySlug` 타입에서 `"injectables"` 제거 → 이 타입을 사용하는 모든 곳에서 컴파일 에러
- `PopularByCategory` 등 Record 타입의 키 불일치

`tsc`가 잡지 못하는 것 (수동 grep 필수):
- CSS 클래스명 (`.catInjectables`)
- `data-cat="injectables"` HTML 속성 문자열
- 하드코딩 문자열 비교 (`=== "injectables"`)
- 주석 내 참조

실행 절차:
1. `CategorySlug`에서 `"injectables"` 제거
2. `npx tsc --noEmit` → 에러 목록 확인 → 전수 수정
3. `grep -r "injectables" --include="*.ts" --include="*.tsx" --include="*.mjs" --include="*.css"` → 잔여 참조 수동 수정

---

## 9. 실행 전 체크리스트

### 사전 준비
- [ ] `git tag pre-category-overhaul` — 롤백 지점 생성 (Phase 1-A는 안전한 additive 변경이므로 태그 생성 후 먼저 적용 가능)
- [ ] 사용자 태그 JSON 수령 (전달용/ 폴더)
- [ ] JSON 파싱 → 기존 tag_dictionary 대비 diff 산출 (신규 / 재분류 / 기존 유지 각 건수 보고)

### Phase 1: DB (4개 마이그레이션)
- [ ] `0311_tag_category_overhaul.sql` 적용 — CHECK 확장
- [ ] `0312_tag_seed_and_reclassify.sql` 적용 — JSON 기반 시드 (UTF-8 경로 필수)
- [ ] `0313_tag_autoregister_v2.sql` 적용 — 트리거 수정 (UTF-8 경로 필수)
- [ ] `0314_rpc_category_mapping.sql` 적용 — RPC CASE WHEN 확장
- [ ] UTF-8 깨짐 검증 0건 확인 (§6 쿼리 3종 실행)

### Phase 2: 코드 (29개 파일)
- [ ] `src/lib/categories.ts` — SSOT 변경 (모든 타입/상수 여기서 파생)
- [ ] 나머지 28개 파일 수정
- [ ] `npx tsc --noEmit` 통과 (CategorySlug 변경 전수 검출)
- [ ] `grep -r "injectables" --include="*.ts" --include="*.tsx" --include="*.mjs" --include="*.css"` 잔여 참조 0건
- [ ] `npm run build` 통과 (스냅샷 재생성 포함)

### Phase 3: 검증·배포
- [ ] 코드 검수 (code-reviewer) 통과 — [치명] 없음
- [ ] git commit + push
- [ ] 문서 5개 갱신 (CHANGELOG, DATABASE, PRD, TECH_SPEC, CLAUDE.md)

### Phase 4: 배포 후 확인
- [ ] 검색 탭 6탭 표시 (리프팅·스킨부스터·필러볼륨·주름윤곽·레이저·기타)
- [ ] 후기 작성 폼 6탭 선택
- [ ] 시술 리포트 카드 색상 6종 정상
- [ ] 시술 일기 폼 (SkinDiaryForms) 6종 시술 표시
- [ ] 관리자 태그 UI 10종 카테고리 드롭다운
- [ ] 모바일(375px) 검색 탭 / 후기 폼 탭 수평 스크롤 동작
- [ ] DB RPC: get_review_report_overview / get_review_summary_pool 영문 slug 6종 반환 확인

---

## 10. 검수 결과 요약

독립 서브에이전트 **4명** (1차 2명 + 2차 2명)이 계획서를 교차 검수. 2차는 1차 반영 후 다른 각도(10-패턴 grep / 실행자 시뮬레이션)로 재검수.

### 1차 검수 (검수관 A·B) — 초안 대비 발견

| 등급 | 건수 | 발견 내용 | 조치 |
|---|---|---|---|
| [치명] | 13파일 | 누락 파일 (procedure-report/theme, ui.tsx, app.module.css, SearchPanel, today/page, OnboardingClient, FeedSidebar, KeywordCarousel, ProcedureReportCard, reports/[procedure], TagAdminTable, AdminReviewReportsView, 스크립트 2개) | Phase 2 섹션 추가 |
| [치명] | 1건 | CSS 모듈 `.catInjectables` tsc 미검출 | Phase 2-E 추가 |
| [치명] | 1건 | ProcedureCategory 독자 타입 SSOT 위반 | ProcedureSlug 파생 설계 |
| [주의] | 1건 | notifications kind CHECK 확장 위험 | tag_review_queue 전략 변경 |
| [주의] | 1건 | pickDefaultCategory "other" 포함 시 빈 화면 | 5종 랜덤 |
| [주의] | 1건 | KR2SLUG 미지정→knowledge 오매핑 | →other 변경 |
| [개선] | 2건 | ProcedureCategory SSOT + procedure-theme 파생 | 반영 |

### 2차 검수 (검수관 C·D) — 1차 반영본 대비 발견

| 등급 | 건수 | 발견 내용 | 조치 |
|---|---|---|---|
| [치명] | 1파일 | SkinDiaryForms.tsx: CAT_COLOR·PROCEDURES 한글 하드코딩 (tsc 미검출) | Phase 2-C 추가 |
| [치명] | 2 RPC | get_review_report_overview·get_review_summary_pool: CASE WHEN 하드코딩 | Phase 1-D + 마이그 0314 추가 |
| [주의] | 1건 | JSON 처리 절차 완전 부재 | Phase 1-B 상세 SQL 템플릿 추가 |
| [주의] | 1건 | 마이그레이션 번호 placeholder(03XX) | 0311-0314 확정 |
| [주의] | 1건 | CSS 색상값 미지정 | 6종×4변형 색상표 추가 |
| [주의] | 1건 | procedure-theme soft 색상 파생 누락 | hexToSoft() 함수 추가 |
| [주의] | 1건 | 롤백 전략 부재 | §11 롤백 전략 추가 |
| [주의] | 1건 | TECH_SPEC.md 문서 누락 | Phase 5 추가 |
| [정책] | 3건 | OnboardingClient / FeedSidebar / 비시술 검색 탭 정책 미확정 | 3건 모두 확정 반영 |

### 확인됨 (변경 불필요)

- DB 마이그레이션 순서 정합 (CHECK 확장 → 시드 → 트리거 → RPC)
- 배포 갭 안전성 (한 commit 동시 배포)
- `injectables` → `skinbooster` slug 전환 시 DB 기존 데이터 보존 (ALTER CHECK만으로 충분)
- 비-ASCII 인코딩 주의사항 적절 (UTF-8 파일 경로 의무화)
- URL/라우트에 카테고리 slug 미사용 → 깨짐 없음
- search-query.ts / Sitemap / RSS 영향 없음 (post-category 별개)
- Card.tsx: CATEGORIES import 사용 → tsc 자동 검출

### 정책 결정 (3건 확정)

| 항목 | 결정 | 근거 |
|---|---|---|
| OnboardingClient | `PROCEDURE_CATEGORIES`만 표시 | 온보딩은 시술 관심사 선택이므로 비시술 불필요 |
| FeedSidebar | CATEGORIES 전체 유지 | 피드는 전 카테고리 콘텐츠 탐색 목적 |
| 비시술 태그 검색 | 활성 탭 없음 (탭 선택 해제) | "전체" 탭 추가 시 시술 탭과 혼선, 비시술 태그 검색 빈도 낮음 |

---

## 11. 롤백 전략

### 사전 체크포인트

```bash
git tag pre-category-overhaul
```

실행 시작 전 태그를 찍어두면, 문제 발생 시 `git revert` 또는 `git reset --hard pre-category-overhaul` + DB 롤백으로 복원 가능.

### Phase별 롤백 난이도

| Phase | 롤백 난이도 | 설명 |
|---|---|---|
| 1-A (CHECK 확장) | **안전** | additive 변경이므로 기존 데이터 영향 없음. 코드 배포 전에 먼저 적용 가능 |
| 1-B (태그 시드) | **중간** | 신규 INSERT는 DELETE 가능, 재분류된 category는 원본 기록 필요 |
| 1-C (트리거) | **쉬움** | 이전 트리거 함수 본문으로 CREATE OR REPLACE |
| 1-D (RPC) | **쉬움** | 이전 CASE WHEN으로 CREATE OR REPLACE |
| 2 (코드) | **쉬움** | git revert로 일괄 복원 |

### 권장 순서

1. 코드 배포 전에 Phase 1-A(CHECK 확장)만 먼저 적용 — 이것은 순수 additive이므로 기존 코드와 충돌 없음
2. Phase 1-B~D + Phase 2~5를 한 commit으로 동시 배포
3. 문제 시: `git revert` + RPC/트리거 원복 SQL 실행
