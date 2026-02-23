import type { AutoFinding, AutoSettings } from './types';

export class PromptBuilder {
  constructor(private settings: AutoSettings) {}

  /**
   * Build prompt for discovery phase.
   * Instructs Claude to analyze the codebase and output findings as JSON.
   */
  buildDiscoveryPrompt(stateContext: string, existingFindings: AutoFinding[]): string {
    const existingList = existingFindings.length > 0
      ? existingFindings.map(f =>
          `- [${f.id}] (${f.category}, ${f.priority}) ${f.title}${f.file_path ? ` — ${f.file_path}` : ''}`
        ).join('\n')
      : '(없음)';

    return [
      '당신은 이 프로젝트의 코드 품질 분석가입니다.',
      '',
      '[프로젝트 컨텍스트]',
      stateContext,
      '',
      '[작업]',
      '코드베이스를 분석하여 아래 카테고리의 문제점/개선점을 찾으세요:',
      '1. 버그 (에러 핸들링 누락, 엣지 케이스 등)',
      '2. 테스트 커버리지 부족',
      '3. 접근성(a11y) 문제',
      '4. 성능 개선 가능 사항',
      '5. 보안 취약점',
      '6. UX 개선 아이디어',
      '',
      '[출력 형식]',
      '반드시 아래 JSON 형식으로만 출력하세요:',
      '{',
      '  "findings": [',
      '    {',
      '      "category": "bug|improvement|idea|performance|accessibility|security",',
      '      "priority": "P0|P1|P2|P3",',
      '      "title": "간결한 제목",',
      '      "description": "상세 설명 (재현 방법 또는 개선 방안 포함)",',
      '      "file_path": "관련 파일 경로 (optional)"',
      '    }',
      '  ]',
      '}',
      '',
      '[이미 발견된 항목 (중복 방지)]',
      existingList,
    ].join('\n');
  }

  /**
   * Build prompt for fix phase.
   * Instructs Claude to fix a specific finding.
   */
  buildFixPrompt(stateContext: string, finding: AutoFinding): string {
    return [
      '당신은 이 프로젝트의 시니어 개발자입니다.',
      '',
      '[프로젝트 컨텍스트]',
      stateContext,
      '',
      '[수정할 문제]',
      `- ID: ${finding.id}`,
      `- 카테고리: ${finding.category}`,
      `- 우선순위: ${finding.priority}`,
      `- 제목: ${finding.title}`,
      `- 설명: ${finding.description}`,
      `- 관련 파일: ${finding.file_path ?? '(없음)'}`,
      `- 이전 시도: ${finding.retry_count}회 (최대 ${finding.max_retries}회)`,
      '',
      '[작업]',
      '1. 위 문제를 수정하세요.',
      '2. 관련 테스트가 있다면 테스트도 수정하세요.',
      '3. 새로운 테스트가 필요하면 추가하세요.',
      '4. 변경 사항을 최소화하세요 — 문제와 직접 관련된 코드만 수정합니다.',
      '',
      '[제약]',
      '- 기존 기능을 깨뜨리지 마세요.',
      '- 불필요한 리팩토링을 하지 마세요.',
      '- 파일 삭제는 하지 마세요.',
    ].join('\n');
  }

  /**
   * Build prompt for test phase.
   * Instructs Claude to run tests and analyze results.
   */
  buildTestPrompt(stateContext: string): string {
    return [
      '[프로젝트 컨텍스트]',
      stateContext,
      '',
      '[작업]',
      '다음 명령어로 테스트를 실행하고 결과를 분석하세요:',
      '',
      this.settings.test_command,
      '',
      '[출력 형식]',
      '반드시 아래 JSON 형식으로만 출력하세요:',
      '{',
      '  "summary": {',
      '    "total": 숫자,',
      '    "passed": 숫자,',
      '    "failed": 숫자,',
      '    "skipped": 숫자',
      '  },',
      '  "failures": [',
      '    {',
      '      "test_name": "테스트 이름",',
      '      "file_path": "테스트 파일 경로",',
      '      "error_message": "에러 메시지",',
      '      "category": "bug|regression|flaky",',
      '      "priority": "P0|P1|P2",',
      '      "suggested_fix": "수정 방향 제안"',
      '    }',
      '  ],',
      '  "new_findings": [',
      '    {',
      '      "category": "bug|improvement|idea|performance|accessibility|security",',
      '      "priority": "P0|P1|P2|P3",',
      '      "title": "간결한 제목",',
      '      "description": "상세 설명",',
      '      "file_path": "관련 파일 경로 (optional)"',
      '    }',
      '  ]',
      '}',
    ].join('\n');
  }

  /**
   * Build prompt for improve phase.
   * Similar to fix but focused on improvements rather than bugs.
   */
  buildImprovePrompt(stateContext: string, finding: AutoFinding): string {
    return [
      '당신은 이 프로젝트의 시니어 개발자입니다.',
      '',
      '[프로젝트 컨텍스트]',
      stateContext,
      '',
      '[개선할 항목]',
      `- ID: ${finding.id}`,
      `- 카테고리: ${finding.category}`,
      `- 우선순위: ${finding.priority}`,
      `- 제목: ${finding.title}`,
      `- 설명: ${finding.description}`,
      `- 관련 파일: ${finding.file_path ?? '(없음)'}`,
      `- 이전 시도: ${finding.retry_count}회 (최대 ${finding.max_retries}회)`,
      '',
      '[작업]',
      '1. 위 항목을 개선하세요.',
      '2. 개선 사항에 대한 테스트를 반드시 추가하거나 업데이트하세요.',
      '3. 변경 범위를 최소한으로 유지하세요 — 이 항목과 직접 관련된 부분만 수정합니다.',
      '',
      '[제약]',
      '- 기존 기능을 깨뜨리지 마세요.',
      '- 이 항목의 범위를 벗어나는 리팩토링을 하지 마세요.',
      '- 파일 삭제는 하지 마세요.',
      '- 개선 전후의 동작이 동일한지 테스트로 확인하세요.',
    ].join('\n');
  }

  /**
   * Build prompt for review phase.
   * Instructs Claude to review recent code changes.
   */
  buildReviewPrompt(stateContext: string, recentDiff: string): string {
    return [
      '당신은 이 프로젝트의 시니어 코드 리뷰어입니다.',
      '',
      '[프로젝트 컨텍스트]',
      stateContext,
      '',
      '[작업]',
      '아래 최근 변경 사항을 리뷰하세요.',
      '',
      '[변경 내역 (git diff)]',
      recentDiff,
      '',
      '[관점]',
      '1. 코드 품질 — 가독성, 일관성, 중복 제거',
      '2. 버그 가능성 — 엣지 케이스, 에러 핸들링',
      '3. 성능 — 불필요한 연산, 메모리 누수 가능성',
      '4. 보안 — 입력 검증, XSS, 인젝션',
      '',
      '[출력 형식]',
      '반드시 아래 JSON 형식으로만 출력하세요:',
      '{',
      '  "findings": [',
      '    {',
      '      "category": "bug|improvement|idea|performance|accessibility|security",',
      '      "priority": "P0|P1|P2|P3",',
      '      "title": "간결한 제목",',
      '      "description": "상세 설명 (재현 방법 또는 개선 방안 포함)",',
      '      "file_path": "관련 파일 경로 (optional)"',
      '    }',
      '  ]',
      '}',
    ].join('\n');
  }
}
