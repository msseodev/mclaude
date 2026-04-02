# Auto Mode Improvement Issues

Comprehensive review results from 5 parallel analysis agents (2026-04-02).

---

## CRITICAL (Immediate) — DONE

- [x] ~~DB 인덱스 부재~~ → `initAutoTables()`에 인덱스 추가
- [x] ~~Parallel Worker Finding Race Condition~~ → SQLite transaction atomic pick
- [x] ~~Crash Recovery 부재~~ → 서버 시작 시 orphaned running 상태 리셋
- [x] ~~Git Rollback Fire-and-Forget~~ → `await` 적용

---

## HIGH — DONE

- [x] ~~H-1. `getStatus()` N+1 쿼리 패턴~~ → `getAutoFindingCounts()` SQL 집계 쿼리로 교체
- [x] ~~H-2. SQLite `busy_timeout` 미설정~~ → `db.pragma('busy_timeout = 5000')` 추가
- [x] ~~H-3. JSON 추출 regex greedy 패턴~~ → balanced brace extraction + 100KB 제한
- [x] ~~H-4. Git merge conflict `spawnSync` 블로킹~~ → async `spawn` + 60초 timeout

- [x] ~~H-5. Silent catch로 에러 삼킴~~ → `console.warn()` 로깅 추가 (5개소)
- [x] ~~H-6. 대형 output DB TEXT 무제한 저장~~ → 50KB cap + truncation marker
- [x] ~~H-7. `PLANNER_AGENT_NAMES` 불일치~~ → 단일 Set으로 통일
- [x] ~~H-8. State file write non-atomic~~ → temp file → rename 패턴

---

## MEDIUM — 2~3주 내 개선

### M-1. `auto/page.tsx` 1414줄 단일 파일
- 5개 서브컴포넌트(StartAutoModal, ResumeAutoModal, AddPromptModal, OutputViewer, ParallelBatchViewer) 분리

### M-2. 모바일 반응형 미흡
- 테이블 `overflow-x-auto`만으로 불충분, 카드 레이아웃 필요
- 터치 타겟 44x44px 미달

### M-3. 접근성 부족
- `htmlFor` 누락, `role="tab"` 없음, 키보드 내비게이션 부재
- 컬러 대비 WCAG AA 미달 (inactive tab `text-gray-400`)

### M-4. Finding 중복 감지 threshold 낮음 (0.8)
- **위치**: `finding-extractor.ts:106`
- 유사 이슈("Fix slow database query" vs "Optimize slow DB query") 통과

### M-5. 프롬프트 진화 평가 단순
- **위치**: `prompt-evolver.ts:113-140`
- 분산/샘플 크기 고려 없이 단순 평균으로 판단

### M-6. SSE 폴링 간격 과다 (2초)
- **위치**: `useAutoStatus.ts:26`
- 변경 없을 시 exponential backoff 필요

### M-7. `initAutoTables()` 매 API 요청마다 호출
- 서버 시작 시 1회로 변경

### M-8. `failure_history` JSON 무한 증가
- **위치**: `cycle-engine.ts:689-700`
- 최근 10개로 제한

### M-9. Report API 전체 데이터 로드
- **위치**: `/api/auto/report`
- `getAutoCyclesBySession()` limit 없이 호출 → SQL 집계 쿼리로 변경

### M-10. node_modules symlink → worker 간 패키지 충돌
- **위치**: `parallel-coordinator.ts:330-342`
- copy 또는 lockfile 활용

---

## LOW — 품질 개선

### L-1. 인라인 스타일을 Tailwind 클래스로 통일
- `backgroundColor: '#1E1E1E'` → `bg-[#1E1E1E]`

### L-2. Settings 숫자 입력 validation
- `min="0"` 누락, budget `max` 제한 없음

### L-3. 에이전트 이름 magic string → const assertion
- `'developer'` → `AGENT_NAMES.DEVELOPER`

### L-4. SSE 연결 끊김 시 "마지막 동기화" 표시

### L-5. Detail 모달 breadcrumb 내비게이션

### L-6. Loading skeleton 스크린 추가
