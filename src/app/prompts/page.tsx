'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  DragDropContext,
  Droppable,
  Draggable,
  type DropResult,
} from '@hello-pangea/dnd';
import { Button } from '@/components/ui/Button';
import { Badge, statusBadgeVariant } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';
import type { Prompt } from '@/types';

interface PromptFormData {
  title: string;
  content: string;
  working_directory: string;
}

const emptyForm: PromptFormData = { title: '', content: '', working_directory: '' };

export default function PromptsPage() {
  const { showToast } = useToast();
  const [prompts, setPrompts] = useState<Prompt[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<PromptFormData>(emptyForm);
  const [formErrors, setFormErrors] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<{ id: string; title: string } | null>(null);

  const fetchPrompts = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch('/api/prompts');
      if (!res.ok) throw new Error('Failed to load prompts');
      const data: Prompt[] = await res.json();
      setPrompts(data);
    } catch {
      setError('Failed to load prompts. Please try again.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPrompts();
  }, [fetchPrompts]);

  function openCreate() {
    setEditingId(null);
    setForm(emptyForm);
    setFormErrors({});
    setModalOpen(true);
  }

  function openEdit(prompt: Prompt) {
    setEditingId(prompt.id);
    setForm({
      title: prompt.title,
      content: prompt.content,
      working_directory: prompt.working_directory ?? '',
    });
    setFormErrors({});
    setModalOpen(true);
  }

  async function handleSave() {
    const errors: Record<string, boolean> = {};
    if (!form.title.trim()) errors.title = true;
    if (!form.content.trim()) errors.content = true;
    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      return;
    }
    setFormErrors({});
    setSaving(true);
    try {
      const body = {
        title: form.title.trim(),
        content: form.content.trim(),
        working_directory: form.working_directory.trim() || null,
      };

      let res: Response;
      if (editingId) {
        res = await fetch(`/api/prompts/${editingId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
      } else {
        res = await fetch('/api/prompts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
      }
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        showToast(data.error || 'Failed to save prompt', 'error');
        return;
      }
      showToast(editingId ? 'Prompt updated' : 'Prompt created', 'success');
      setModalOpen(false);
      await fetchPrompts();
    } catch {
      showToast('Failed to save prompt', 'error');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    try {
      const res = await fetch(`/api/prompts/${id}`, { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        showToast(data.error || 'Failed to delete prompt', 'error');
        return;
      }
      showToast('Prompt deleted', 'success');
    } catch {
      showToast('Failed to delete prompt', 'error');
    }
    setDeleteConfirm(null);
    await fetchPrompts();
  }

  async function handleDragEnd(result: DropResult) {
    if (!result.destination) return;
    const items = Array.from(prompts);
    const [moved] = items.splice(result.source.index, 1);
    items.splice(result.destination.index, 0, moved);
    setPrompts(items);

    try {
      const res = await fetch('/api/prompts/reorder', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderedIds: items.map((p) => p.id) }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        showToast(data.error || 'Failed to reorder prompts', 'error');
      }
    } catch {
      showToast('Failed to reorder prompts', 'error');
    }
  }

  return (
    <div className="p-6">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Prompt Queue</h1>
        <Button onClick={openCreate}>Add Prompt</Button>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => { setError(null); fetchPrompts(); }} className="font-medium text-red-700 hover:text-red-900 underline">
            Retry
          </button>
        </div>
      )}

      {loading ? (
        <div className="py-12 text-center text-sm text-gray-500">
          Loading...
        </div>
      ) : prompts.length === 0 ? (
        <div className="rounded-lg border border-gray-200 bg-white py-12 text-center">
          <p className="text-sm text-gray-500">
            No prompts yet. Add one to get started.
          </p>
        </div>
      ) : (
        <DragDropContext onDragEnd={handleDragEnd}>
          <Droppable droppableId="prompt-list">
            {(provided) => (
              <div
                ref={provided.innerRef}
                {...provided.droppableProps}
                className="space-y-2"
              >
                {prompts.map((prompt, index) => (
                  <Draggable
                    key={prompt.id}
                    draggableId={prompt.id}
                    index={index}
                  >
                    {(provided, snapshot) => (
                      <div
                        ref={provided.innerRef}
                        {...provided.draggableProps}
                        className={`rounded-lg border bg-white p-4 shadow-sm ${
                          snapshot.isDragging
                            ? 'border-blue-300 shadow-md'
                            : 'border-gray-200'
                        }`}
                      >
                        <div className="flex items-start gap-3">
                          <div
                            {...provided.dragHandleProps}
                            className="mt-1 cursor-grab text-gray-400 hover:text-gray-600"
                          >
                            <svg
                              className="h-5 w-5"
                              fill="currentColor"
                              viewBox="0 0 20 20"
                            >
                              <path d="M7 2a2 2 0 10.001 4.001A2 2 0 007 2zm0 6a2 2 0 10.001 4.001A2 2 0 007 8zm0 6a2 2 0 10.001 4.001A2 2 0 007 14zm6-8a2 2 0 10-.001-4.001A2 2 0 0013 6zm0 2a2 2 0 10.001 4.001A2 2 0 0013 8zm0 6a2 2 0 10.001 4.001A2 2 0 0013 14z" />
                            </svg>
                          </div>

                          <div className="min-w-0 flex-1">
                            <div className="mb-1 flex items-center gap-2">
                              <span className="font-medium text-gray-900">
                                {prompt.title}
                              </span>
                              <Badge
                                variant={statusBadgeVariant(prompt.status)}
                              >
                                {prompt.status}
                              </Badge>
                            </div>
                            <p className="mb-1 line-clamp-2 text-sm text-gray-500">
                              {prompt.content}
                            </p>
                            {prompt.working_directory && (
                              <p className="text-xs text-gray-400">
                                Dir: {prompt.working_directory}
                              </p>
                            )}
                          </div>

                          <div className="flex gap-1">
                            <button
                              onClick={() => openEdit(prompt)}
                              className="rounded p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                              aria-label="Edit prompt"
                            >
                              <svg
                                className="h-4 w-4"
                                fill="none"
                                viewBox="0 0 24 24"
                                strokeWidth={1.5}
                                stroke="currentColor"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L6.832 19.82a4.5 4.5 0 01-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 011.13-1.897L16.863 4.487zm0 0L19.5 7.125"
                                />
                              </svg>
                            </button>
                            <button
                              onClick={() => setDeleteConfirm({ id: prompt.id, title: prompt.title })}
                              className="rounded p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-500"
                              aria-label="Delete prompt"
                            >
                              <svg
                                className="h-4 w-4"
                                fill="none"
                                viewBox="0 0 24 24"
                                strokeWidth={1.5}
                                stroke="currentColor"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0"
                                />
                              </svg>
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                  </Draggable>
                ))}
                {provided.placeholder}
              </div>
            )}
          </Droppable>
        </DragDropContext>
      )}

      {/* Create/Edit Modal */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingId ? 'Edit Prompt' : 'Add Prompt'}
        footer={
          <>
            <Button variant="secondary" onClick={() => setModalOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave} loading={saving}>
              {editingId ? 'Save' : 'Create'}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div>
            <label htmlFor="prompt-title" className="mb-1 block text-sm font-medium text-gray-700">
              Title
            </label>
            <input
              id="prompt-title"
              type="text"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              className={`w-full rounded-md border px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 ${formErrors.title ? 'border-red-500' : 'border-gray-300'}`}
              placeholder="Prompt title"
            />
            {formErrors.title && <p className="mt-1 text-xs text-red-500">Title is required</p>}
          </div>
          <div>
            <label htmlFor="prompt-content" className="mb-1 block text-sm font-medium text-gray-700">
              Content
            </label>
            <textarea
              id="prompt-content"
              value={form.content}
              onChange={(e) => setForm({ ...form, content: e.target.value })}
              rows={6}
              className={`w-full rounded-md border px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 ${formErrors.content ? 'border-red-500' : 'border-gray-300'}`}
              placeholder="Prompt content..."
            />
            {formErrors.content && <p className="mt-1 text-xs text-red-500">Content is required</p>}
          </div>
          <div>
            <label htmlFor="prompt-working-dir" className="mb-1 block text-sm font-medium text-gray-700">
              Working Directory (optional)
            </label>
            <input
              id="prompt-working-dir"
              type="text"
              value={form.working_directory}
              onChange={(e) =>
                setForm({ ...form, working_directory: e.target.value })
              }
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              placeholder="/path/to/project"
            />
          </div>
        </div>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal
        open={deleteConfirm !== null}
        onClose={() => setDeleteConfirm(null)}
        title="Delete Prompt"
        footer={
          <>
            <Button variant="secondary" onClick={() => setDeleteConfirm(null)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={() => deleteConfirm && handleDelete(deleteConfirm.id)}
            >
              Delete
            </Button>
          </>
        }
      >
        <p className="text-sm text-gray-600">
          Are you sure you want to delete &quot;{deleteConfirm?.title}&quot;? This action cannot be
          undone.
        </p>
      </Modal>
    </div>
  );
}
