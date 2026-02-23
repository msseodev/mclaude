# mclaude QA Report

**Date:** 2026-02-23
**Tester:** Claude QA Engineer
**Project:** mclaude v0.1.0 — Claude Code Automation Web App
**Stack:** Next.js 16 + React 19 + SQLite + TypeScript

---

## Executive Summary

| Category | Result |
|----------|--------|
| Unit Tests (Vitest) | **94/94 passed** |
| E2E Tests (Playwright) | **83/83 passed** |
| ESLint | **0 errors, 26 warnings** |
| Code Review Issues | **5 Critical, 12 Warning, 12 Suggestion** |
| UX Review Issues | **3 Critical, 10 Warning, 13 Suggestion** |

모든 자동화 테스트는 통과했으나, 코드 리뷰와 UX 분석에서 다수의 개선 사항이 발견되었습니다. 특히 **에러 핸들링 부재**, **메모리 누수 가능성**, **접근성(a11y) 미흡**이 주요 이슈입니다.

---

## 1. Automated Test Results

### 1.1 Unit Tests (Vitest)

| Test File | Tests | Time | Status |
|-----------|-------|------|--------|
| `tests/unit/stream-parser.test.ts` | 9 | 2ms | PASS |
| `tests/unit/rate-limit-detector.test.ts` | 25 | 13ms | PASS |
| `tests/unit/db.test.ts` | 60 | 107ms | PASS |
| **Total** | **94** | **255ms** | **ALL PASS** |

### 1.2 E2E Tests (Playwright)

| Spec File | Tests | Description |
|-----------|-------|-------------|
| `api.spec.ts` | 16 | API routes (prompts, settings, run, history) |
| `dashboard.spec.ts` | 7 | Dashboard UI elements & navigation |
| `history.spec.ts` | 3 | History page, empty state, table |
| `navigation.spec.ts` | 7 | Sidebar navigation & active highlighting |
| `plans.spec.ts` | 29 | Plans API, UI, detail, run integration |
| `prompts.spec.ts` | 10 | Prompts CRUD, ordering, badges |
| `run.spec.ts` | 5 | Run page status, controls, SSE |
| `settings.spec.ts` | 6 | Settings form, save/persist |
| **Total** | **83** | **ALL PASS (19.5s)** |

### 1.3 ESLint

- **Errors:** 0
- **Warnings:** 26 (모두 `@typescript-eslint/no-unused-vars`)
  - API route catch 블록의 미사용 `error` 변수: 19건
  - 앱 코드 미사용 변수 (`isLoading`, `useCallback`, `code`): 3건
  - 테스트 코드 미사용 변수: 3건 + 1건 (`useCallback` import)

---

## 2. Critical Issues

### [C1] 메모리 누수: Output 배열 무한 증가 (Browser Crash 가능)

**파일:** `src/app/run/page.tsx:90`

```typescript
case 'text_delta': {
  const text = (event.data.text as string) ?? '';
  setOutput((prev) => [...prev, { type: 'text', text }]);
  break;
}
```

모든 text delta가 개별 배열 항목으로 추가됩니다. 하나의 프롬프트에서 수천 개의 delta가 발생할 수 있으며, 전체 큐 실행 시 `output` 배열이 무한히 증가합니다. 각 항목이 개별 `<span>`으로 렌더링되므로 (`run/page.tsx:526-530`) 브라우저 탭 OOM crash가 발생할 수 있습니다.

**심각도:** Critical
**권장 조치:** 연속 text_delta를 하나의 문자열로 병합하거나, sliding window 적용, 또는 virtualized renderer 사용

---

### [C2] 모든 API 호출에서 에러를 무시 — 사용자에게 피드백 없음

**영향 범위:** 모든 페이지

| 파일 | 라인 | 패턴 |
|------|------|------|
| `src/app/page.tsx` | 36 | `.catch(() => {})` |
| `src/app/prompts/page.tsx` | 39 | `catch { // ignore }` |
| `src/app/plans/page.tsx` | 32 | `catch { // ignore }` |
| `src/app/plans/[id]/page.tsx` | 38, 53 | `catch { // ignore }` |
| `src/app/run/page.tsx` | 57, 61, 82 | `.catch(() => {})` |
| `src/app/history/page.tsx` | 20 | `.catch(() => {})` |
| `src/app/settings/page.tsx` | 21 | `.catch(() => {})` |
| `src/hooks/useRunStatus.ts` | 17 | `catch { // ignore }` |

API 서버가 다운되거나 네트워크 오류가 발생해도 사용자는 영원한 "Loading..." 상태만 보게 됩니다.
Mutation 작업(저장, 삭제, 순서 변경)도 `res.ok`를 확인하지 않아, 서버 에러 시에도 성공한 것처럼 보입니다.

**심각도:** Critical
**권장 조치:**
- 각 페이지에 `error` state 추가
- 에러 발생 시 인라인 에러 배너 + "재시도" 버튼 표시
- Mutation 실패 시 toast 알림 또는 UI 롤백

---

### [C3] Race Condition: `startQueue`에서 rate limit 대기 중 재시작 시 혼선

**파일:** `src/lib/run-manager.ts:64-145`

```typescript
if (this.executor?.isRunning()) {
  throw new Error('Queue is already running');
}
if (this.currentSessionId) {
  await this.stopQueue();  // queue_stopped 이벤트 발생
}
```

큐가 `waiting_for_limit` 상태일 때 (executor는 null, retryTimer는 활성) `this.executor?.isRunning()`이 false를 반환합니다. `stopQueue()`가 호출되어 `queue_stopped` 이벤트가 발생한 직후 새 세션이 시작되므로, SSE 클라이언트가 `queue_stopped → session_status: running` 순서로 혼란스러운 이벤트를 수신합니다.

**심각도:** Critical
**권장 조치:** `this.retryTimer` 상태도 체크하여 rate limit 대기 중인 경우를 처리

---

### [C4] `processNextPrompt` 미처리 예외로 세션 영구 hang

**파일:** `src/lib/run-manager.ts:144` (및 253, 374, 452, 569)

```typescript
this.processNextPrompt();  // fire-and-forget
```

`ClaudeExecutor.execute()` 내부의 `spawn()`이 동기적으로 throw하면 (잘못된 바이너리 경로 등) 예외가 잡히지 않습니다. 세션이 `running` 상태로 영구 고정되며 서버 재시작 없이는 복구 불가합니다.

**심각도:** Critical
**권장 조치:** try-catch로 감싸고, 실패 시 세션 상태를 `stopped`으로 전환 + SSE로 에러 이벤트 전송

---

### [C5] 설정값 검증 없이 프로세스 실행에 사용 (보안)

**파일:** `src/lib/claude-executor.ts:33-37`, `src/app/api/settings/route.ts:21-23`

- `claude_binary`: 아무 실행 파일 경로나 설정 가능 → `spawn()`에 직접 전달
- `working_directory`: 검증 없이 `cwd`로 전달 → 디렉토리 탐색 가능
- `--dangerously-skip-permissions` 하드코딩 (`claude-executor.ts:61`)

**심각도:** Critical (로컬 도구이므로 실제 위험은 중간)
**권장 조치:**
- `claude_binary`는 `"claude"` 리터럴 또는 실존하는 절대경로만 허용
- `working_directory`는 존재하는 디렉토리인지 `fs.existsSync` 검증
- CSRF 보호 추가 (다른 웹사이트에서 localhost:3000 API 호출 가능)

---

## 3. UX Issues

### [UX-C1] 다크모드 CSS 충돌로 UI 깨짐

**파일:** `src/app/globals.css:15-20`

`prefers-color-scheme: dark` 미디어 쿼리가 정의되어 있으나, 모든 컴포넌트가 `text-gray-900`, `bg-white` 등 라이트모드 클래스만 사용합니다. 다크모드 OS 환경에서 배경은 어둡지만 카드는 흰색, 텍스트는 검정으로 표시되어 시각적으로 깨집니다.

**권장 조치:** 다크모드 CSS 변수를 제거하거나, 모든 컴포넌트에 `dark:` variant 추가

---

### [UX-C2] Modal 접근성 위반 (WCAG 2.1 Level A)

**파일:** `src/components/ui/Modal.tsx`

- Focus trapping 없음 — Tab 키로 모달 외부와 상호작용 가능
- `role="dialog"`, `aria-modal="true"` 누락
- 모달 제목과 `aria-labelledby` 연결 없음
- 닫기 버튼 `aria-label` 없음

---

### [UX-C3] 폼 유효성 검사 피드백 없음

| 파일 | 동작 |
|------|------|
| `src/app/prompts/page.tsx:67` | 빈 title/content → 아무 반응 없이 return |
| `src/app/plans/page.tsx:49` | 빈 name → 아무 반응 없이 return |
| `src/app/plans/[id]/page.tsx:92` | 빈 name → 아무 반응 없이 return |

사용자가 "Create" 클릭 시 아무 일도 안 일어나며, 어떤 필드가 잘못되었는지 알 수 없습니다.

---

### [UX-W1] 아이콘 버튼에 접근성 레이블 없음

편집(연필), 삭제(휴지통), 드래그 핸들, 햄버거 메뉴 버튼 모두 `aria-label` 없음. 스크린 리더가 빈 버튼으로 읽습니다.

**영향 파일:** `prompts/page.tsx`, `plans/page.tsx`, `plans/[id]/page.tsx`, `AppLayout.tsx`

---

### [UX-W2] 삭제 확인에 항목 이름 미표시

```
"Are you sure you want to delete this prompt?"
```

삭제 대상의 이름이 표시되지 않아, 여러 항목이 있을 때 어떤 것을 삭제하는지 확인 불가.

**영향 파일:** `prompts/page.tsx:301-324`, `plans/page.tsx:200-223`

---

### [UX-W3] Plan 항목 제거 시 확인 없이 즉시 삭제

**파일:** `src/app/plans/[id]/page.tsx:232-249`

X 버튼 클릭 시 확인 없이 `handleRemoveItem` 즉시 호출. Prompts/Plans 페이지는 삭제 확인이 있어 일관성 부재.

---

### [UX-W4] History 테이블 모바일 미대응

**파일:** `src/app/history/page.tsx:71-124`

5개 컬럼의 HTML `<table>`이 좁은 화면에서 가로 오버플로우. `overflow-x-auto` 미적용.

---

### [UX-W5] Run 페이지 컨트롤 좁은 화면에서 레이아웃 깨짐

**파일:** `src/app/run/page.tsx:208-238`

Plan selector + Start-from selector + Start button이 한 줄에 배치. 좁은 뷰포트에서 오버플로우.

---

### [UX-W6] 2초 간격 상태 폴링이 모든 페이지에서 실행

**파일:** `src/hooks/useRunStatus.ts:24-28`

Sidebar에서 사용되므로 모든 페이지에서 2초마다 `/api/run/status` 폴링. 큐가 idle 상태일 때도 계속 폴링하여 불필요한 서버 부하 발생.

**권장 조치:** idle 상태에서는 10-15초 간격으로 늘리기

---

### [UX-W7] History 페이지 페이지네이션 없음

**파일:** `src/app/history/page.tsx:17-21`

모든 실행 기록을 한 번에 로드. API는 50개 제한이지만 UI에 "더 보기" 없음.

---

### [UX-W8] Loading 상태가 단순 텍스트 "Loading..."

모든 페이지에서 Skeleton/Shimmer 없이 텍스트만 표시. 콘텐츠 로드 시 레이아웃 시프트 발생.

---

### [UX-W9] "Deleted Prompt" 표시 시 복구 경로 없음

**파일:** `src/app/plans/[id]/page.tsx:223`

삭제된 프롬프트가 Plan에 참조되면 "Deleted Prompt"만 표시. 경고 아이콘이나 정리 방법 안내 없음.

---

### [UX-W10] `<label>`과 `<input>` 미연결

모든 폼에서 `htmlFor`/`id` 연결이 없어 레이블 클릭 시 입력 필드에 포커스되지 않음.

---

## 4. Code Quality Issues (Warning)

### [W1] Reorder API 입력 검증 불충분

**파일:** `src/app/api/prompts/reorder/route.ts:9`, `src/app/api/plans/[id]/items/reorder/route.ts:13`

`orderedIds` 배열의 요소 타입(문자열 여부), 존재 여부, 완전성(누락 ID) 미검증.

---

### [W2] `removePlanItem` DELETE와 reorder가 별도 트랜잭션

**파일:** `src/lib/db.ts:403-424`

DELETE 실행 후 reorder 트랜잭션이 별도로 실행. 중간 crash 시 ordering에 gap 발생 가능.

---

### [W3] SSE 스트림 리스너 누수 가능성

**파일:** `src/app/api/run/stream/route.ts:23-31`

클라이언트 연결 해제 시 listener는 제거되지만 heartbeat interval이 즉시 정리되지 않는 타이밍 윈도우 존재.

---

### [W4] SSE 재연결 시 이벤트 버퍼 중복 재생

**파일:** `src/lib/run-manager.ts:42-47`

재연결 시 500개 이벤트 버퍼가 전체 재전송되어 output이 중복 표시됩니다.

---

### [W5] `processEvent`에서 `onRateLimit` 이중 호출 가능

**파일:** `src/lib/claude-executor.ts:144-151`

stdout handler와 close handler에서 `processEvent`가 호출되어, rate limit 이벤트가 flush 버퍼에도 있을 경우 `onRateLimit`이 두 번 호출됩니다.

**권장 조치:** `processEvent` 시작 부분에 `if (this.killed) return;` 추가

---

### [W6] History API `limit`/`offset` 검증 없음

**파일:** `src/app/api/history/route.ts:7-8`

`?limit=abc` → NaN, `?limit=-1` → 음수가 SQLite에 전달됨. 상한값 미제한.

---

### [W7] Global Prompt이 Plan 모드에서만 적용

**파일:** `src/lib/run-manager.ts:202` vs `:258-266`

`processNextLegacyPrompt`에서는 global_prompt 미적용. "Global Prompt"라는 이름과 실제 동작 불일치.

---

### [W8] React Error Boundary 없음

`error.tsx` 파일이 없어 렌더링 에러 시 전체 앱이 흰 화면으로 crash.

---

## 5. Suggestions

| # | 제안 | 설명 |
|---|------|------|
| S1 | 키보드 단축키 | `N`: 새 프롬프트, `R`: 실행 시작/중지 등 개발자 도구에 필수 |
| S2 | Output 검색/복사 | OutputViewer에 "Copy All" 버튼, 텍스트 검색 기능 |
| S3 | "복제" 기능 | Prompt/Plan "Duplicate" 액션 추가 |
| S4 | Toast 알림 시스템 | 설정 저장, 삭제 성공 등 일관된 피드백 (현재 ephemeral 텍스트) |
| S5 | Breadcrumb | Plan 상세 페이지에 "Plans > Plan Name" 네비게이션 |
| S6 | 사이드바 상태 강화 | 큐 실행 중일 때 더 눈에 띄는 상태 표시 (pulse 애니메이션 등) |
| S7 | Empty State 통일 | 공통 `EmptyState` 컴포넌트로 일관된 빈 상태 표시 |
| S8 | 인라인 SVG 아이콘 추출 | 중복된 SVG를 공유 Icon 컴포넌트로 추출 |
| S9 | `--max-turns` 설정화 | 현재 50으로 하드코딩. 설정 또는 프롬프트별 옵션으로 변경 |
| S10 | 미저장 변경 경고 | 모달 폼 수정 후 닫기 시 확인 다이얼로그 |
| S11 | Migration 개선 | `try { ALTER TABLE }` 대신 `PRAGMA table_info` 확인 후 ALTER |
| S12 | 카드 상호작용 일관성 | Prompts(클릭 불가) vs Plans(클릭 가능) 카드 동작 통일 |

---

## 6. Positive Findings

1. **SQL Injection 방어**: 모든 쿼리가 parameterized statement 사용
2. **WAL 모드**: SQLite 동시 읽기 성능 최적화
3. **HMR-safe 싱글톤**: `globalThis` 패턴으로 Hot Reload 시 인스턴스 유지
4. **우아한 프로세스 종료**: SIGTERM → 5초 대기 → SIGKILL 패턴
5. **SSE 자동 스크롤**: 사용자 스크롤 위치 감지 후 자동 스크롤 on/off
6. **Rate Limit 카운트다운**: 실시간 타이머가 포함된 직관적 rate limit 배너
7. **Drag & Drop**: `@hello-pangea/dnd`로 깔끔한 순서 변경 구현
8. **Cascade Delete**: Plan 삭제 시 관련 항목 자동 정리
9. **TypeScript Strict Mode**: 전체 프로젝트에 strict 모드 적용
10. **종합 테스트**: Unit 94개 + E2E 83개 = 총 177개 테스트

---

## 7. Priority Recommendations

### 즉시 수정 (P0)
1. Output 배열 무한 증가 → 브라우저 crash 방지 (**C1**)
2. `processNextPrompt` try-catch 추가 → 세션 hang 방지 (**C4**)
3. API 에러 피드백 추가 → 사용자 경험 핵심 (**C2**)

### 단기 수정 (P1)
4. 다크모드 CSS 충돌 해결 (**UX-C1**)
5. Modal 접근성 개선 (**UX-C2**)
6. 설정값 검증 추가 (**C5**)
7. SSE 재연결 시 중복 방지 (**W4**)
8. `processEvent` killed 가드 추가 (**W5**)

### 중기 개선 (P2)
9. 폼 유효성 검사 피드백 (**UX-C3**)
10. 반응형 디자인 (History 테이블, Run 컨트롤) (**UX-W4, W5**)
11. 페이지네이션 (**UX-W7**)
12. Error Boundary 추가 (**W8**)
13. Toast 알림 시스템 도입 (**S4**)
14. Polling 최적화 (**UX-W6**)

---

*Report generated by Claude QA Engineer — 2026-02-23*
