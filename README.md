# mclaude

Claude Code 자동화 도구. 여러 프롬프트를 큐에 등록하고 순차적으로 실행하며, rate limit 발생 시 자동으로 대기 후 재시도합니다.

## 주요 기능

- **프롬프트 큐 관리** — 드래그 앤 드롭으로 실행 순서 조정, CRUD
- **순차 자동 실행** — 큐에 등록된 프롬프트를 하나씩 Claude Code CLI로 실행
- **Rate Limit 자동 대응** — exit code, 스트림 이벤트, 텍스트 패턴 감지 후 지수 백오프(5분~40분)로 자동 재시도
- **실시간 모니터링** — SSE 기반 스트리밍으로 실행 출력, 도구 사용 현황 실시간 확인
- **실행 이력** — 비용, 소요시간, 출력 로그를 SQLite에 저장
- **일시정지/재개/중지** — 실행 중 큐 제어

## 기술 스택

- **Frontend**: Next.js 16, React 19, Tailwind CSS 4
- **Backend**: Next.js API Routes (App Router)
- **DB**: better-sqlite3
- **Test**: Vitest (unit), Playwright (E2E)

## 시작하기

```bash
# 의존성 설치
npm install

# 개발 서버 실행
npm run dev
```

http://localhost:3000 에서 접속합니다.

## 프로젝트 구조

```
src/
├── app/
│   ├── api/           # API Routes (prompts, run, history, settings)
│   ├── history/       # 실행 이력 페이지
│   ├── prompts/       # 프롬프트 관리 페이지
│   ├── run/           # 실행 모니터링 페이지
│   └── settings/      # 설정 페이지
├── components/
│   ├── layout/        # AppLayout, Sidebar
│   └── ui/            # Button, Badge, Modal
├── hooks/             # useRunStatus, useSSE
├── lib/
│   ├── claude-executor.ts    # Claude CLI 프로세스 관리
│   ├── run-manager.ts        # 큐 실행 엔진 (싱글톤)
│   ├── stream-parser.ts      # stream-json 파싱
│   ├── rate-limit-detector.ts # Rate limit 감지
│   ├── db.ts                 # SQLite 데이터 레이어
│   └── types.ts              # 타입 정의
└── types/
```

## 테스트

```bash
# 유닛 테스트
npm test

# E2E 테스트
npm run test:e2e
```
