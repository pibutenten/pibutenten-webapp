# 시술명·태그 영문 매핑 사전 — 개발자 통합 가이드

> ⚠️ **L2-4(2026-06-07) 변경**: SSOT 가 DB `tag_dictionary` → 빌드타임 스냅샷 `tag-dictionary.generated.json` 으로 일원화되어 **`procedure-mappings.json` 은 삭제**되었습니다. `slug-mapping.ts`(buildSlug 등)는 이제 스냅샷의 `slug` 를 읽습니다. 매핑 추가·수정은 **DB tag_dictionary**(관리자 '태그 관리' 화면)에서 하고 prebuild 가 스냅샷을 재생성합니다. 아래 JSON 구조·편집 설명은 **이력(deprecated)** 입니다.

> 이 폴더는 피부텐텐의 자동 슬러그 생성을 위한 헬퍼(`slug-mapping.ts`)를 포함합니다.
> SEO/AEO/GEO 통합 개발 요청서 §2-3 (글 슬러그 자동 생성) 항목과 연결됩니다.

---

## 파일 구성

| 파일 | 역할 | 편집 주체 |
|---|---|---|
| `procedure-mappings.json` | 한글→영문 매핑 데이터 | **운영팀** |
| `slug-mapping.ts` | TypeScript 헬퍼 (import + 슬러그 빌드 로직) | 개발팀 (자주 수정 안 함) |
| `README.md` | 본 가이드 | 개발팀·운영팀 공동 |

---

## 권장 배치 위치 (Next.js 프로젝트)

```
project/
├── data/
│   └── procedure-mappings/
│       ├── procedure-mappings.json   ← 데이터
│       ├── slug-mapping.ts           ← 헬퍼
│       └── README.md                 ← 본 문서
├── lib/
│   └── slug.ts                       ← (선택) 추가 비즈니스 로직 wrapping
└── app/
    └── ...
```

`tsconfig.json`에 path alias 설정 권장:

```json
{
  "compilerOptions": {
    "paths": {
      "@/data/*": ["./data/*"]
    }
  }
}
```

이러면 다음과 같이 import 가능:

```typescript
import { buildSlug } from '@/data/procedure-mappings/slug-mapping';
```

---

## 사용 예시

### 1. 기본 슬러그 빌드 (글 발행 시)

```typescript
import { buildSlug } from '@/data/procedure-mappings/slug-mapping';

// 의사가 글 작성 시 선택한 태그
const tags = ['쥬브젠', '효과', '지속기간'];

// 슬러그 자동 생성
const slug = buildSlug(tags);
// → 'juvgen-effect-duration'

// 최종 URL
const postUrl = `/doctors/jung-hanmi/2026/${slug}`;
// → '/doctors/jung-hanmi/2026/juvgen-effect-duration'
```

### 2. 충돌 처리 (실제 운영 코드)

```typescript
import { buildSlug, resolveSlugCollision } from '@/data/procedure-mappings/slug-mapping';

async function createPost(doctorSlug: string, tags: string[], year: number) {
  const baseSlug = buildSlug(tags);

  // DB에서 같은 의사·연도의 기존 슬러그 조회
  const existingSlugs = new Set(
    await db.posts.findMany({
      where: { doctorSlug, year },
      select: { slug: true }
    }).then(rows => rows.map(r => r.slug))
  );

  // 충돌 시 자동으로 -2, -3 부여
  const finalSlug = resolveSlugCollision(baseSlug, existingSlugs);

  return db.posts.create({
    data: { doctorSlug, year, slug: finalSlug, /* ... */ }
  });
}
```

### 3. 단일 한글 → 영문 변환

```typescript
import { getEnglishSlug } from '@/data/procedure-mappings/slug-mapping';

getEnglishSlug('쥬브젠');         // → 'juvgen'
getEnglishSlug('민감피부');        // → 'sensitive-skin' (synonym 자동 처리)
getEnglishSlug('정한미');          // → null (의사명은 별도 매핑)
getEnglishSlug('미등록태그');    // → null
```

### 4. 카테고리별 조회 (편집 도구용)

```typescript
import { getMappingsByCategory } from '@/data/procedure-mappings/slug-mapping';

const liftingProcedures = getMappingsByCategory('lifting');
// → 모든 리프팅 시술 매핑 반환

// 글 작성 UI의 태그 선택 드롭다운에 활용
```

### 5. 자동완성 검색 (태그 입력 UI)

```typescript
import { searchMappings } from '@/data/procedure-mappings/slug-mapping';

// 사용자가 "쥬"라고 타이핑하면
const suggestions = searchMappings('쥬', 5);
// → [
//     { ko: '쥬브젠', en: 'juvgen', ... },
//     { ko: '쥬베룩', en: 'juvelook', ... },
//     { ko: '쥬베룩볼륨', en: 'juvelook-volume', ... },
//     ...
//   ]
```

---

## API Reference

### `getEnglishSlug(koreanTerm: string): string | null`

단일 한글 태그를 영문 슬러그로 변환. 동의어(synonyms)도 자동 처리.

### `buildSlug(tags: string[]): string`

여러 태그를 결합하여 URL 슬러그 생성. 매핑되지 않은 항목은 무시. 전부 매핑 실패 시 `untagged-{timestamp}` 폴백.

### `resolveSlugCollision(baseSlug: string, existingSlugs: Set<string>): string`

충돌 시 `-2`, `-3` 등 접미사 자동 부여. 없으면 원본 그대로 반환.

### `getMappingsByCategory(category: Category): ProcedureMapping[]`

카테고리별 매핑 조회. `Category = 'lifting' | 'injectables' | 'concerns' | 'homecare' | 'knowledge'`.

### `getMappingsByType(type: MappingType): ProcedureMapping[]`

타입별 매핑 조회. `MappingType = 'brand' | 'medical' | 'general' | 'synonym'`.

### `getKoreanTerm(englishSlug: string): string | null`

영문 슬러그 → 한글 (역방향). 같은 영문에 여러 한글이 매핑된 경우 첫 번째 것만 반환.

### `searchMappings(prefix: string, limit?: number): ProcedureMapping[]`

자동완성용 검색. 한글 또는 영문에서 검색.

### `getMappingsMetadata(): { version, lastUpdated, totalEntries }`

매핑 사전 메타데이터 조회 (디버깅·관리 화면용).

---

## 매핑 사전 데이터 구조

`procedure-mappings.json` 구조:

```json
{
  "version": "1.0.0",
  "lastUpdated": "2026-05-07",
  "categories": {
    "lifting": "리프팅",
    "injectables": "스킨부스터",
    "concerns": "피부고민",
    "homecare": "홈케어",
    "knowledge": "피부상식"
  },
  "mappings": [
    {
      "ko": "쥬브젠",
      "en": "juvgen",
      "category": "injectables",
      "type": "brand"
    },
    {
      "ko": "민감성피부",
      "en": "sensitive-skin",
      "category": "concerns",
      "type": "general",
      "synonyms": ["민감피부", "예민피부", "민감성", "민감"]
    }
  ]
}
```

각 매핑 필드:

| 필드 | 필수 | 설명 |
|---|---|---|
| `ko` | ✅ | 한글 표기 (정식 표기) |
| `en` | ✅ | 영문 슬러그 (소문자 + 하이픈) |
| `category` | ✅ | 5개 카테고리 중 하나 |
| `type` | ✅ | brand / medical / general / synonym |
| `synonyms` | 선택 | 같은 슬러그로 매핑되는 다른 한글 표기 |
| `notes` | 선택 | 비고 (브랜드 회사명, 의학 용어 출처 등) |

---

## 운영팀 가이드 — 매핑 추가/수정

### 신규 항목 추가

새로운 시술이나 태그가 등장하면 `procedure-mappings.json`의 `mappings` 배열에 항목 추가:

```json
{
  "ko": "신규시술명",
  "en": "new-procedure",
  "category": "lifting",
  "type": "brand",
  "notes": "회사명 / 출시일 / 비고"
}
```

추가 후 다음 검토:

1. **충돌 검사**: 같은 `en`이 이미 다른 항목에 있는지
2. **동의어 통합**: 비슷한 한글 표기가 있다면 `synonyms`로 통합 (별도 항목 만들지 말 것)
3. **카테고리 정확성**: 5개 카테고리 중 적절한 곳
4. **로마자 표기**: 한 번 정한 영문은 변경 금지 (URL 영구성)

### 수정 시 주의사항

⚠️ **이미 발행된 글이 있는 매핑의 `en` 값을 변경하면 URL이 깨집니다.**

수정해야 하는 경우:
1. 기존 매핑 유지 (변경 금지)
2. 신규 매핑 추가 (동의어로 처리)
3. 또는 개발팀과 협업해서 모든 기존 글 URL 301 리다이렉트 + DB slug 업데이트

가능하면 **새 시술명·태그 추가만 하고 기존 매핑은 절대 수정하지 않는 것**이 안전합니다.

### 표기가 모호한 항목

브랜드 영문 표기가 명확하지 않은 경우:
1. 회사 공식 사이트에서 영문 트레이드마크 확인
2. 학술 논문에서 사용하는 표기 확인
3. 임시로 `notes`에 "표기 추후 확정 시 업데이트" 명시 → 추후 회의에서 확정

---

## 버전 관리

- `version` 필드: semantic versioning (major.minor.patch)
  - `major`: 구조 변경 (호환성 깨짐)
  - `minor`: 신규 항목 다수 추가
  - `patch`: 작은 수정·오타
- `lastUpdated`: 마지막 수정 날짜 (YYYY-MM-DD)
- 모든 변경은 Git 커밋으로 추적

---

## 향후 확장 가능 사항

운영 안정화 후 추가 검토할 기능:

- **Admin UI**: 운영팀이 코드 직접 편집 없이 웹에서 매핑 관리
- **DB 이전**: JSON 파일 → 데이터베이스 이전 (대량 매핑 시)
- **다국어 확장**: 영문 외 일본어·중국어 슬러그 추가
- **AI 자동 제안**: 신규 시술명 입력 시 영문 매핑 AI 제안

---

## 문의

매핑 사전 관련 문의는 운영팀에, 헬퍼 코드 관련 문의는 개발팀에 전달.
