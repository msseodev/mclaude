export class MlaudeApiClient {
  constructor(private baseUrl: string, private apiKey: string) {}

  private async get(path: string) { return this.request('GET', path); }
  private async post(path: string, body?: unknown) { return this.request('POST', path, body); }
  private async patch(path: string, body?: unknown) { return this.request('PATCH', path, body); }
  private async delete(path: string) { return this.request('DELETE', path); }

  getBaseUrl(): string { return this.baseUrl; }
  getApiKey(): string { return this.apiKey; }

  private async request(method: string, path: string, body?: unknown) {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (this.apiKey) {
      headers['Authorization'] = `Bearer ${this.apiKey}`;
    }
    const res = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`API ${method} ${path} failed (${res.status}): ${text}`);
    }
    return res.json();
  }

  // Manual mode
  async getRunStatus() { return this.request('GET', '/api/run/status'); }
  async startRun() { return this.request('POST', '/api/run'); }
  async pauseRun() { return this.request('PATCH', '/api/run', { action: 'pause' }); }
  async resumeRun() { return this.request('PATCH', '/api/run', { action: 'resume' }); }
  async stopRun() { return this.request('DELETE', '/api/run'); }

  // Auto mode
  async getAutoStatus() { return this.request('GET', '/api/auto/status'); }
  async startAuto(initialPrompt?: string, forceDiscovery?: boolean) {
    const body: Record<string, unknown> = {};
    if (initialPrompt) body.initialPrompt = initialPrompt;
    if (forceDiscovery !== undefined) body.forceDiscovery = forceDiscovery;
    return this.request('POST', '/api/auto', Object.keys(body).length > 0 ? body : {});
  }
  async pauseAuto() { return this.request('PATCH', '/api/auto', { action: 'pause' }); }
  async resumeAuto() { return this.request('PATCH', '/api/auto', { action: 'resume' }); }
  async stopAuto() { return this.request('DELETE', '/api/auto'); }

  // Prompts
  async getPrompts() { return this.request('GET', '/api/prompts'); }
  async createPrompt(title: string, content: string) { return this.request('POST', '/api/prompts', { title, content }); }

  // History
  async getHistory(limit = 20) { return this.request('GET', `/api/history?limit=${limit}`); }

  // Chat
  async createChatSession(workingDirectory?: string): Promise<{ id: string; claude_session_id: string }> {
    return this.post('/api/chat', { action: 'create', workingDirectory });
  }
  async sendChatMessage(message: string, sessionId: string): Promise<{ ok: boolean }> {
    return this.post('/api/chat', { action: 'send', message, sessionId });
  }
  async switchChatSession(sessionId: string): Promise<unknown> {
    return this.post('/api/chat', { action: 'switch', sessionId });
  }
  async getChatSessions(): Promise<Array<{ id: string; title: string; message_count: number; updated_at: string }>> {
    return this.get('/api/chat/sessions');
  }
  async stopChatResponse(): Promise<{ ok: boolean }> {
    return this.delete('/api/chat');
  }

  // CEO requests
  async respondToCEORequest(requestId: string, status: string, response: string): Promise<void> {
    await this.patch(`/api/auto/report/requests/${requestId}`, { status, response });
  }
}
