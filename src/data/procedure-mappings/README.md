# 시술명·태그 영문 매핑 — 개발자 통합 가이드

> ⚠️ **L2-4(2026-06-07) 변경**: SSOT 가 DB `tag_dictionary` → 빌드타임 스냅샷 `tag-dictionary.generated.json` 으로 일원화되어 **`procedure-mappings.json` 은 삭제**되었습니다. `slug-mapping.ts`(buildSlug 등)는 이제 스냅샷의 `slug` 를 읽습니다. 이 폴더에 남은 것은 슬러그 헬퍼(`slug-mapping.ts`)와 본 가이드뿐입니다.

> 이 폴더는 피부텐텐의 자동 슬러그 생성을 위한 헬퍼(`slug-mapping.ts`)를 포함합니다.
> SEO/AEO/GEO 통합 개발 요청서 §2-3 (글 슬러그 자동 생성) 항목과 연결됩니다.

---

## 편집 방법 (매핑 추가·수정)

매핑(한글→영문 slug·분류·동의어 등)은 **JSON 파일을 직접 편집하지 않습니다**. 다음 한 경로만 사용합니다.

1. **관리자 태그 관리(`/admin/tags`)에서 DB `tag_dictionary` 를 편집** — 한글(ko)·영문 slug(en)·분류·부모·시술 여부·동의어(aliases) 등.
2. **prebuild 가 스냅샷을 재생성** — `scripts/gen-tag-dictionary.mjs`(package.json `prebuild`)가 DB 를 anon REST 로 읽어 `src/data/tag-dictionary.generated.json` 을 산출합니다. `slug-mapping.ts` 는 이 스냅샷의 `slug`(ko/alias → en)만 읽습니다.

상세 SSOT·스냅샷·관리자 편집 구조는 `docs/ARCHITECTURE.md §10`(태그 사전 SSOT)을 참조하십시오.

> ⚠️ **이미 발행된 글이 있는 매핑의 영문 slug 를 변경하면 URL 이 깨집니다.** 기존 slug 는 유지하고 동의어(alias)로 흡수하는 방식이 안전합니다.

---

## 파일 구성

| 파일 | 역할 | 비고 |
|---|---|---|
| `slug-mapping.ts` | TypeScript 헬퍼 (스냅샷 `slug` 읽기 + 슬러그 빌드 로직) | 개발팀 (자주 수정 안 함) |
| `README.md` | 본 가이드 | — |

> 매핑 데이터 자체는 `src/data/tag-dictionary.generated.json`(빌드 스냅샷) — DB `tag_dictionary` SSOT 에서 prebuild 가 생성.

---

## import

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

// 슬러그 자동 생성 (스냅샷 slug 기반)
const slug = buildSlug(tags);
// → 'juvgen-effect-duration'

// 최종 URL
const postUrl = `/doctors/jung-hanmi/2026/${slug}`;
// → '/doctors/jung-hanmi/2026/juvgen-effect-duration'
```

### 2. 충돌 처리

```typescript
import { buildSlug, resolveSlugCollision } from '@/data/procedure-mappings/slug-mapping';

const baseSlug = buildSlug(tags);
// 같은 의사·연도의 기존 슬러그 집합과 비교해 충돌 시 -2, -3 부여
const finalSlug = resolveSlugCollision(baseSlug, existingSlugs);
```

### 3. 단일 한글 → 영문 변환

```typescript
import { getEnglishSlug } from '@/data/procedure-mappings/slug-mapping';

getEnglishSlug('쥬브젠');       // → 'juvgen' (스냅샷 매핑)
getEnglishSlug('미등록태그');   // → null
```

---

## API Reference

`slug-mapping.ts` 의 공개 export (모두 스냅샷 `slug` 동기 읽기):

### `getEnglishSlug(koreanTerm: string): string | null`
단일 한글 태그를 영문 슬러그로 변환. 스냅샷에 없으면 `null`.

### `buildSlug(tags: string[]): string`
여러 태그를 결합하여 URL 슬러그 생성. 영문 단어 기준 기본 3개·최대 4개, 부분 중복 단어 제거. 매핑되지 않은 항목은 무시. 전부 매핑 실패 시 `untagged-{timestamp}` 폴백. 50자 초과 시 마지막 `-` 경계에서 cut.

### `resolveSlugCollision(baseSlug: string, existingSlugs: Set<string>): string`
충돌 시 `-2`, `-3` 등 접미사 자동 부여. 없으면 원본 그대로 반환.

### `isValidPostSlug(s: string): boolean`
post slug 형식(소문자·숫자·하이픈, 길이 범위) 유효성 검사.

### `normalizeToSlug(input: string): string`
임의 문자열을 slug 형식(소문자·하이픈)으로 정규화.

상수: `SLUG_TARGET_WORDS`(3) · `SLUG_MAX_WORDS`(4) · `SLUG_MAX_LEN`(50) · `SLUG_MIN_LEN`(2).

---

## 문의

매핑 데이터 관련 문의는 운영팀(태그 관리 화면)에, 헬퍼 코드 관련 문의는 개발팀에 전달.
