// DB entities
export type PromptStatus = 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
export type SessionStatus = 'idle' | 'running' | 'paused' | 'waiting_for_limit' | 'completed' | 'stopped';

export interface Prompt {
  id: string;
  title: string;
  content: string;
  queue_order: number;
  status: PromptStatus;
  working_directory: string | null;
  created_at: string;
  updated_at: string;
}

export interface RunSession {
  id: string;
  status: SessionStatus;
  current_prompt_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface Execution {
  id: string;
  prompt_id: string;
  run_session_id: string;
  status: 'running' | 'completed' | 'failed' | 'rate_limited';
  output: string;
  cost_usd: number | null;
  duration_ms: number | null;
  started_at: string;
  completed_at: string | null;
  prompt_title?: string;
}

// Claude CLI stream-json event types
export interface ClaudeSystemEvent {
  type: 'system';
  subtype: string;
  session_id?: string;
  tools?: string[];
  model?: string;
}

export interface ClaudeAssistantEvent {
  type: 'assistant';
  message: {
    id: string;
    type: 'message';
    role: 'assistant';
    content: Array<{type: 'text'; text: string} | {type: 'tool_use'; id: string; name: string; input: Record<string, unknown>}>;
    model: string;
    stop_reason: string | null;
    usage?: { input_tokens: number; output_tokens: number };
  };
  session_id?: string;
}

export interface ClaudeStreamEvent {
  type: 'content_block_start' | 'content_block_delta' | 'content_block_stop';
  index?: number;
  content_block?: { type: string; text?: string; id?: string; name?: string };
  delta?: { type: string; text?: string; partial_json?: string };
}

export interface ClaudeResultEvent {
  type: 'result';
  subtype: string;
  result?: string;
  cost_usd?: number;
  duration_ms?: number;
  duration_api_ms?: number;
  is_error?: boolean;
  session_id?: string;
  total_cost_usd?: number;
}

export type ClaudeEvent = ClaudeSystemEvent | ClaudeAssistantEvent | ClaudeStreamEvent | ClaudeResultEvent | { type: string; [key: string]: unknown };

// SSE events sent to browser
export type SSEEventType =
  | 'text_delta'
  | 'tool_start'
  | 'tool_end'
  | 'prompt_start'
  | 'prompt_complete'
  | 'prompt_failed'
  | 'rate_limit'
  | 'rate_limit_wait'
  | 'queue_complete'
  | 'queue_stopped'
  | 'session_status'
  | 'error';

export interface SSEEvent {
  type: SSEEventType;
  data: Record<string, unknown>;
  timestamp: string;
}

export interface RateLimitInfo {
  detected: boolean;
  source: 'exit_code' | 'stream_event' | 'text_pattern' | null;
  message: string | null;
  retryAfterMs: number | null;
}

export interface RunStatus {
  sessionId: string | null;
  status: SessionStatus;
  currentPromptId: string | null;
  currentPromptTitle: string | null;
  completedCount: number;
  totalCount: number;
  waitingUntil: string | null;
  retryCount: number;
}

export interface Settings {
  working_directory: string;
  claude_binary: string;
}
