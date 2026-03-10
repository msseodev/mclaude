export default function ChatGuidePage() {
  return (
    <div className="p-6 max-w-3xl">
      <h1 className="text-2xl font-bold text-zinc-100 mb-6">Chat Mode Guide</h1>

      <div className="space-y-8 text-zinc-300">
        <section>
          <h2 className="text-lg font-semibold text-zinc-100 mb-3">Overview</h2>
          <p className="leading-relaxed">
            Chat mode lets you have interactive conversations with Claude Code through the web UI or Discord.
            Unlike Manual/Auto modes which execute pre-defined prompts, Chat mode is for real-time Q&amp;A,
            code exploration, and planning.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-zinc-100 mb-3">Web UI</h2>
          <div className="space-y-3">
            <div className="bg-zinc-900 rounded-lg p-4 border border-zinc-800">
              <h3 className="font-medium text-zinc-100 mb-2">Starting a Chat</h3>
              <ol className="list-decimal list-inside space-y-1 text-sm">
                <li>Switch to Chat mode in the sidebar</li>
                <li>Type your message in the input box</li>
                <li>Press Enter to send (Shift+Enter for newline)</li>
                <li>Claude will respond with streaming output</li>
              </ol>
            </div>
            <div className="bg-zinc-900 rounded-lg p-4 border border-zinc-800">
              <h3 className="font-medium text-zinc-100 mb-2">Session Management</h3>
              <ul className="list-disc list-inside space-y-1 text-sm">
                <li><strong>New Chat</strong> &mdash; Starts a fresh conversation</li>
                <li><strong>Sessions</strong> &mdash; View and switch between past conversations</li>
                <li>Each session maintains its own conversation history via Claude Code&apos;s <code className="bg-zinc-800 px-1 rounded">--resume</code> flag</li>
              </ul>
            </div>
          </div>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-zinc-100 mb-3">Discord Bot</h2>
          <div className="space-y-3">
            <div className="bg-zinc-900 rounded-lg p-4 border border-zinc-800">
              <h3 className="font-medium text-zinc-100 mb-2">Setup</h3>
              <ol className="list-decimal list-inside space-y-1 text-sm">
                <li>Enable the <code className="bg-zinc-800 px-1 rounded">MessageContent</code> intent in the Discord Developer Portal</li>
                <li>Set <code className="bg-zinc-800 px-1 rounded">DISCORD_CHAT_CHANNEL_ID</code> in your <code className="bg-zinc-800 px-1 rounded">.env.local</code></li>
                <li>Restart the Discord bot: <code className="bg-zinc-800 px-1 rounded">npm run discord</code></li>
              </ol>
            </div>
            <div className="bg-zinc-900 rounded-lg p-4 border border-zinc-800">
              <h3 className="font-medium text-zinc-100 mb-2">How It Works</h3>
              <ul className="list-disc list-inside space-y-1 text-sm">
                <li>Send a message in the designated chat channel (or mention the bot)</li>
                <li>The bot creates a Discord Thread for each conversation</li>
                <li>Continue chatting in the thread &mdash; context is maintained</li>
                <li>Each thread maps to a separate Claude Code session</li>
              </ul>
            </div>
            <div className="bg-zinc-900 rounded-lg p-4 border border-zinc-800">
              <h3 className="font-medium text-zinc-100 mb-2">Commands</h3>
              <ul className="list-disc list-inside space-y-1 text-sm">
                <li><code className="bg-zinc-800 px-1 rounded">/chat-new</code> &mdash; Start a new chat session</li>
                <li><code className="bg-zinc-800 px-1 rounded">/chat-sessions</code> &mdash; List recent chat sessions</li>
              </ul>
            </div>
          </div>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-zinc-100 mb-3">Capabilities</h2>
          <div className="bg-zinc-900 rounded-lg p-4 border border-zinc-800">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <h3 className="font-medium text-green-400 mb-2">Can Do</h3>
                <ul className="list-disc list-inside space-y-1">
                  <li>Read and analyze code files</li>
                  <li>Search the codebase (Glob, Grep)</li>
                  <li>Answer questions about the project</li>
                  <li>Explain code and architecture</li>
                  <li>Help plan changes</li>
                  <li>Web search for information</li>
                </ul>
              </div>
              <div>
                <h3 className="font-medium text-amber-400 mb-2">Cannot Do (by design)</h3>
                <ul className="list-disc list-inside space-y-1">
                  <li>Edit or create files</li>
                  <li>Run shell commands</li>
                  <li>Make git commits</li>
                  <li>Install packages</li>
                </ul>
                <p className="mt-2 text-zinc-500">
                  For code changes, use Manual or Auto mode.
                </p>
              </div>
            </div>
          </div>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-zinc-100 mb-3">Architecture</h2>
          <div className="bg-zinc-900 rounded-lg p-4 border border-zinc-800">
            <pre className="text-sm text-zinc-400 leading-relaxed">{`Discord/Web Message
  |
ChatManager (singleton)
  |
ChatExecutor -> claude -p --resume <session-id>
               --tools "Read,Glob,Grep,WebSearch,WebFetch"
               --output-format stream-json
  |
SSE Stream -> Web UI / Discord`}</pre>
          </div>
          <p className="text-sm text-zinc-500 mt-2">
            Each chat session maps to a Claude Code CLI session.
            The <code className="bg-zinc-800 px-1 rounded">--resume</code> flag maintains conversation history
            across multiple messages without re-sending the full history.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-zinc-100 mb-3">Environment Variables</h2>
          <div className="bg-zinc-900 rounded-lg p-4 border border-zinc-800">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-zinc-500 text-left">
                  <th className="pb-2">Variable</th>
                  <th className="pb-2">Required</th>
                  <th className="pb-2">Description</th>
                </tr>
              </thead>
              <tbody className="text-zinc-300">
                <tr>
                  <td className="py-1"><code className="bg-zinc-800 px-1 rounded">DISCORD_CHAT_CHANNEL_ID</code></td>
                  <td className="py-1">For Discord</td>
                  <td className="py-1">Channel where chat messages are received</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}
