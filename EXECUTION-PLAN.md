# mclaude QA Fix Execution Plan

Based on QA-REPORT.md findings. 4 parallel workstreams.

---

## Workstream 1: Backend Critical Fixes

**Files:** `src/lib/run-manager.ts`, `src/lib/claude-executor.ts`, `src/app/api/run/stream/route.ts`

### 1A. processNextPrompt try-catch (C4)
- Wrap `this.processNextPrompt()` calls at lines 144, 253, 374, 452, 569 in try-catch
- On error: mark session as `stopped`, emit error event via SSE, cleanup state

### 1B. processEvent killed guard (W5)
- Add `if (this.killed) return;` at start of `processEvent` method (line 144 of claude-executor.ts)
- Prevents double onRateLimit calls

### 1C. startQueue race condition (C3)
- In `startQueue()` line 70: also check `this.retryTimer` for waiting_for_limit state
- Change guard to: `if (this.executor?.isRunning() || this.retryTimer) { ... }`

### 1D. SSE stream cleanup (C5)
- In `route.ts` listener catch block (line 28-30): also clear heartbeat interval
- Iterate listeners over snapshot: `for (const listener of [...this.listeners])` in emit()

### 1E. Output array memory fix (C1)
- In `run/page.tsx` handleSSEEvent: coalesce consecutive text_delta entries
- Instead of pushing each delta separately, merge with previous if same type
- Add MAX_OUTPUT_ENTRIES constant (e.g., 10000) and trim from front when exceeded

### 1F. SSE reconnection duplicate prevention (W4)
- Clear output array when SSE reconnects (on `session_status` event with existing output)
- In useSSE.ts: emit a reconnection signal the component can use

---

## Workstream 2: API Validation & DB Fixes

**Files:** `src/app/api/settings/route.ts`, `src/app/api/history/route.ts`, `src/app/api/prompts/reorder/route.ts`, `src/app/api/plans/[id]/items/reorder/route.ts`, `src/lib/db.ts`

### 2A. Settings validation (C5)
- In PUT /api/settings: validate `working_directory` exists using fs.existsSync
- Validate `claude_binary` is 'claude' or absolute path to existing file
- Return 400 with specific error message if validation fails

### 2B. History API limit/offset validation (W6)
- Clamp limit: `Math.max(1, Math.min(parsedLimit || 50, 500))`
- Clamp offset: `Math.max(0, parsedOffset || 0)`
- Handle NaN from parseInt

### 2C. Reorder API input validation (W1)
- Validate all elements in orderedIds are strings
- Return 400 if validation fails

### 2D. removePlanItem atomic transaction (W2)
- Wrap entire removePlanItem (SELECT, DELETE, reorder) in single transaction

### 2E. Migration improvement (S6)
- Replace try/catch ALTER TABLE with PRAGMA table_info check

---

## Workstream 3: Frontend Error Handling & Toast

**Files:** All page components, new Toast component

### 3A. Create Toast notification system
- New file: `src/components/ui/Toast.tsx` — toast context + provider + UI
- Supports success, error, info variants
- Auto-dismiss after 4 seconds
- Position: top-right

### 3B. Add error states to all pages
Apply to each page (dashboard, prompts, plans, plan detail, history, settings, run):
- Add `error` state variable
- In catch blocks: set error message instead of ignoring
- Check `res.ok` before parsing JSON
- Show inline error banner with retry button when error occurs
- For mutation failures: show toast error notification

### 3C. Form validation feedback
- Prompts page: show red border + "required" text on empty title/content
- Plans page: show red border + "required" text on empty name
- Plan detail edit: same pattern
- Settings page: show validation errors from API (from 2A)

### 3D. Delete confirmation with item name
- Prompts page: show prompt title in delete confirmation
- Plans page: show plan name in delete confirmation

### 3E. Run page action error feedback
- Check res.ok on handleStart/Stop/Pause/Resume
- Show toast on failure with error message from API

---

## Workstream 4: Accessibility & CSS Fixes

**Files:** `src/components/ui/Modal.tsx`, `src/app/globals.css`, all pages with icon buttons

### 4A. Dark mode CSS fix
- Remove the `@media (prefers-color-scheme: dark)` block from globals.css
- App is light-only; the dark CSS variables conflict with hardcoded light Tailwind classes

### 4B. Modal accessibility
- Add `role="dialog"` and `aria-modal="true"` to modal container
- Add `aria-labelledby="modal-title"` and `id="modal-title"` to title
- Add `aria-label="Close"` to close button
- Implement focus trapping: on open, focus first focusable element; trap Tab within modal

### 4C. Icon button aria-labels
- Prompts page: `aria-label="Edit prompt"`, `aria-label="Delete prompt"`
- Plans page: `aria-label="Edit plan"`, `aria-label="Delete plan"`
- Plan detail: `aria-label="Remove item"`
- AppLayout hamburger: `aria-label="Open menu"`

### 4D. Form label associations
- Add `id` to inputs and `htmlFor` to labels across all forms:
  - Prompts form (title, content, working_directory)
  - Plans form (name, description)
  - Plan detail edit form (name, description, plan_prompt)
  - Settings form (working_directory, claude_binary, global_prompt)

### 4E. History table responsive
- Wrap table in `<div className="overflow-x-auto">`

---

## Implementation Order

All 4 workstreams execute in parallel. No cross-dependencies between workstreams.
Within each workstream, tasks are sequential (A → B → C → ...).
