'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';
import type { Settings } from '@/types';

export default function SettingsPage() {
  const [form, setForm] = useState<Settings>({
    working_directory: '',
    claude_binary: 'claude',
    global_prompt: '',
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch('/api/settings')
      .then((res) => res.json())
      .then((data: Settings) => setForm(data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function handleSave() {
    setSaving(true);
    setSaved(false);
    try {
      const res = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      if (res.ok) {
        setSaved(true);
        setTimeout(() => setSaved(false), 3000);
      }
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="p-6">
        <h1 className="mb-6 text-2xl font-bold text-gray-900">Settings</h1>
        <p className="text-sm text-gray-500">Loading...</p>
      </div>
    );
  }

  return (
    <div className="p-6">
      <h1 className="mb-6 text-2xl font-bold text-gray-900">Settings</h1>

      <div className="max-w-lg rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Working Directory
            </label>
            <input
              type="text"
              value={form.working_directory}
              onChange={(e) =>
                setForm({ ...form, working_directory: e.target.value })
              }
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              placeholder="/path/to/project"
            />
            <p className="mt-1 text-xs text-gray-500">
              Default working directory for prompts that don&apos;t specify one.
            </p>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Claude Binary
            </label>
            <input
              type="text"
              value={form.claude_binary}
              onChange={(e) =>
                setForm({ ...form, claude_binary: e.target.value })
              }
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              placeholder="claude"
            />
            <p className="mt-1 text-xs text-gray-500">
              Path to the Claude CLI binary.
            </p>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Global Prompt
            </label>
            <textarea
              value={form.global_prompt}
              onChange={(e) =>
                setForm({ ...form, global_prompt: e.target.value })
              }
              rows={4}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              placeholder="Text to prepend to every prompt execution..."
            />
            <p className="mt-1 text-xs text-gray-500">
              This text is prepended to every prompt when running a plan. Useful for
              shared context or instructions.
            </p>
          </div>
        </div>

        <div className="mt-6 flex items-center gap-3">
          <Button onClick={handleSave} loading={saving}>
            Save Settings
          </Button>
          {saved && (
            <span className="text-sm text-green-600">Settings saved.</span>
          )}
        </div>
      </div>
    </div>
  );
}
