# 마이그레이션 실행 이력 (production 적용 순서 기준)

> **SSOT 주의**: 적용된 마이그레이션의 권위 있는 최신 목록은 `docs/DATABASE.md §5`(현 0235까지)이다. 본 파일은 실행 순서·동일번호 충돌 메모 용도로 유지하며, 0112 이후 상세 항목은 DATABASE.md §5 를 참조한다. (0235까지 복제하지 않는다 — 포인터만.)

> ⚠️ **중요**: 동일 번호로 두 파일이 존재하는 케이스가 있습니다. 알파벳순 → 타임스탬프순으로 적용된 실제 순서를 본 문서로 명문화합니다.
> 이미 production에 적용된 파일들이므로 **파일명을 임의로 변경하지 마십시오** (drift 발생).

## 동일 번호 충돌 8쌍 — 적용 순서

| 번호 | 파일 (적용 순서) | 비고 |
|---|---|---|
| 0015 | `0015_article_type.sql` → `0015_profiles_onboarding.sql` | article enum (이후 0076에서 drop) + 온보딩 컬럼 |
| 0044 | `0044_qa_pubmed_refs_multi.sql` → `0044_unify_profiles_auth_user_id.sql` | PubMed multi-ref + auth_user_id 통합 |
| 0046 | `0046_admin_kpi_lists.sql` → `0046_videos_write_policy.sql` | KPI RPC + videos RLS |
| 0047 | `0047_phase9_master.sql` → `0047_qa_view_trigger.sql` | Phase 9 도입 + view 트리거 |
| 0048 | `0048_qa_impressions.sql` → `0048_rpc_v2_profile_id.sql` | impressions 테이블 + RPC profile_id 전환 |
| 0049 | `0049_fix_bae_jungmin_role.sql` → `0049_videos_rls_phase9.sql` | 1회성 role fix + videos RLS Phase 9 |
| 0111 | `0111_contact_email_dedup.sql` (단일) | .tmp 파일은 2026-05-17 cleanup으로 정리 완료 |
| 0292 | `0292_follow_post_pref.sql` + `0292_review_diary_schema.sql` | **병행 세션 동시작업 충돌(2026-06-27)**. 팔로우 새글 알림 pref(notification_preferences) vs 후기·일기 통합 스키마 — 건드리는 객체가 완전히 독립이라 적용 순서 무관. 규약대로 파일명 미변경. |

## 시리얼 흐름 요점

| 구간 | 핵심 변경 |
|---|---|
| 0001~0010 | 초기 스키마 (qas, doctors, profiles, posts, RPCs) |
| 0011~0020 | qas status/type/category/검색 |
| 0021~0030 | handle/shortcode, 멀티 identity 도입, saves/ratings |
| 0031~0045 | profile-identities → profiles 통합 (Phase 9 전 단계) |
| 0046~0060 | KPI, 트리거, RLS 그룹 인지 재정의 |
| 0061~0064 | 메트릭 리셋 + Phase 9 author_id 정착 |
| **0065** | **qas → cards 전면 rename** (가장 큰 분기점) |
| 0066~0078 | cards 기반 RPC/트리거 정리, 옛 트리거 drop |
| 0079~0089 | 알림 시스템, push webhook, card_shares 정규화 |
| **0090~0091** | **persona 시스템 완전 삭제** (alt_*, posted_as drop) |
| 0092~0096 | 잔재 cleanup (rating system drop, avatar_bg_color drop) |
| 0097~0105 | YouTube OAuth, dedup RLS, vault 도입, rate limit |
| 0106~0111 | doctor bundle propagation, soft-delete 익명화, email dedup |

## 누더기 hotfix 누적 구간 (참고용 — 새 환경 적용은 idempotent)

- **`anonymize_user_content_before_delete`**: 0107 → 0107b → 0107c → 0109 → 0110 → 0111 (6번 재정의)
- **`find_duplicate_profiles`**: 0098 → 0102 → 0105 → 0110(DROP) → 0111 (5번 재정의)
- **알림 트리거 함수들**: 0062 → 0063 → 0071 → 0078 rename → 0080/0083 부분 재정의
- **scored RPCs**: 0072 → 0090 → 0094
- **`get_indexable_tags`**: 0092(조건부 `if exists` 정의만, 멱등 base 부재) → **0235 무조건 CREATE OR REPLACE**(qa-only `category='qa'` + 폴더-DB 정합 확보)

향후 안정화 확인 후 squash 마이그레이션 1개로 통합 검토.

## 운영 정책

1. **마이그레이션 파일 rename 금지** — production drift 위험.
2. **동일 번호 신규 생성 금지** — 향후엔 항상 `MAX(현재) + 1` 부여.
3. `.tmp.*` 파일은 `.gitignore`로 차단됨. 발견 시 즉시 삭제.
4. RPC 재정의는 가능하면 **신규 마이그레이션 1개로 OR REPLACE** (기존 파일 수정 X).
