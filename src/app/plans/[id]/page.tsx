'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  DragDropContext,
  Droppable,
  Draggable,
  type DropResult,
} from '@hello-pangea/dnd';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import type { PlanWithItems, Prompt } from '@/types';

export default function PlanDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [plan, setPlan] = useState<PlanWithItems | null>(null);
  const [loading, setLoading] = useState(true);
  const [prompts, setPrompts] = useState<Prompt[]>([]);
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editForm, setEditForm] = useState({ name: '', description: '', plan_prompt: '' });
  const [saving, setSaving] = useState(false);

  const fetchPlan = useCallback(async () => {
    try {
      const res = await fetch(`/api/plans/${id}`);
      if (res.ok) {
        const data: PlanWithItems = await res.json();
        setPlan(data);
        setEditForm({
          name: data.name,
          description: data.description,
          plan_prompt: data.plan_prompt,
        });
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [id]);

  const fetchPrompts = useCallback(async () => {
    try {
      const res = await fetch('/api/prompts');
      if (res.ok) {
        const data: Prompt[] = await res.json();
        setPrompts(data);
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    fetchPlan();
    fetchPrompts();
  }, [fetchPlan, fetchPrompts]);

  async function handleAddPrompt(promptId: string) {
    await fetch(`/api/plans/${id}/items`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt_id: promptId }),
    });
    setAddModalOpen(false);
    await fetchPlan();
  }

  async function handleRemoveItem(itemId: string) {
    await fetch(`/api/plans/${id}/items/${itemId}`, { method: 'DELETE' });
    await fetchPlan();
  }

  async function handleDragEnd(result: DropResult) {
    if (!result.destination || !plan) return;
    const items = Array.from(plan.items);
    const [moved] = items.splice(result.source.index, 1);
    items.splice(result.destination.index, 0, moved);
    setPlan({ ...plan, items });

    await fetch(`/api/plans/${id}/items/reorder`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderedIds: items.map((i) => i.id) }),
    });
  }

  async function handleEditSave() {
    if (!editForm.name.trim()) return;
    setSaving(true);
    try {
      await fetch(`/api/plans/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: editForm.name.trim(),
          description: editForm.description.trim(),
          plan_prompt: editForm.plan_prompt,
        }),
      });
      setEditModalOpen(false);
      await fetchPlan();
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="p-6">
        <p className="text-sm text-gray-500">Loading...</p>
      </div>
    );
  }

  if (!plan) {
    return (
      <div className="p-6">
        <p className="text-sm text-gray-500">Plan not found.</p>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="mb-6">
        <button
          onClick={() => router.push('/plans')}
          className="mb-3 text-sm text-gray-500 hover:text-gray-700"
        >
          &larr; Back to Plans
        </button>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{plan.name}</h1>
            {plan.description && (
              <p className="mt-1 text-sm text-gray-500">{plan.description}</p>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => setEditModalOpen(true)}>
              Edit Plan
            </Button>
            <Button
              variant="success"
              onClick={() => router.push(`/run?planId=${plan.id}`)}
            >
              Run Plan
            </Button>
          </div>
        </div>
      </div>

      {/* Plan Prompt */}
      {plan.plan_prompt && (
        <div className="mb-6 rounded-lg border border-gray-200 bg-gray-50 p-4">
          <h3 className="mb-1 text-sm font-medium text-gray-700">Plan Prompt</h3>
          <p className="whitespace-pre-wrap text-sm text-gray-600">{plan.plan_prompt}</p>
        </div>
      )}

      {/* Plan Items */}
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900">
          Prompts ({plan.items.length})
        </h2>
        <Button size="sm" onClick={() => setAddModalOpen(true)}>
          Add Prompt
        </Button>
      </div>

      {plan.items.length === 0 ? (
        <div className="rounded-lg border border-gray-200 bg-white py-12 text-center">
          <p className="text-sm text-gray-500">
            No prompts in this plan. Add prompts to define the execution
            sequence.
          </p>
        </div>
      ) : (
        <DragDropContext onDragEnd={handleDragEnd}>
          <Droppable droppableId="plan-items">
            {(provided) => (
              <div
                ref={provided.innerRef}
                {...provided.droppableProps}
                className="space-y-2"
              >
                {plan.items.map((item, index) => (
                  <Draggable
                    key={item.id}
                    draggableId={item.id}
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
                            <span className="font-medium text-gray-900">
                              {item.prompt_title ?? 'Deleted Prompt'}
                            </span>
                            {item.prompt_content && (
                              <p className="mt-1 line-clamp-2 text-sm text-gray-500">
                                {item.prompt_content}
                              </p>
                            )}
                          </div>

                          <button
                            onClick={() => handleRemoveItem(item.id)}
                            className="rounded p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-500"
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
                                d="M6 18L18 6M6 6l12 12"
                              />
                            </svg>
                          </button>
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

      {/* Add Prompt Modal */}
      <Modal
        open={addModalOpen}
        onClose={() => setAddModalOpen(false)}
        title="Add Prompt to Plan"
      >
        {prompts.length === 0 ? (
          <p className="text-sm text-gray-500">
            No prompts available. Create prompts first.
          </p>
        ) : (
          <div className="max-h-80 space-y-1 overflow-y-auto">
            {prompts.map((prompt) => (
              <button
                key={prompt.id}
                onClick={() => handleAddPrompt(prompt.id)}
                className="w-full rounded-md px-3 py-2 text-left hover:bg-gray-100"
              >
                <div className="font-medium text-gray-900">{prompt.title}</div>
                <p className="line-clamp-1 text-sm text-gray-500">
                  {prompt.content}
                </p>
              </button>
            ))}
          </div>
        )}
      </Modal>

      {/* Edit Plan Modal */}
      <Modal
        open={editModalOpen}
        onClose={() => setEditModalOpen(false)}
        title="Edit Plan"
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditModalOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleEditSave} loading={saving}>
              Save
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Name
            </label>
            <input
              type="text"
              value={editForm.name}
              onChange={(e) =>
                setEditForm({ ...editForm, name: e.target.value })
              }
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              placeholder="Plan name"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Description
            </label>
            <textarea
              value={editForm.description}
              onChange={(e) =>
                setEditForm({ ...editForm, description: e.target.value })
              }
              rows={3}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              placeholder="What this plan does..."
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Plan Prompt
            </label>
            <textarea
              value={editForm.plan_prompt}
              onChange={(e) =>
                setEditForm({ ...editForm, plan_prompt: e.target.value })
              }
              rows={4}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              placeholder="Text to prepend to every prompt in this plan..."
            />
            <p className="mt-1 text-xs text-gray-500">
              This text is prepended to every prompt when running this plan.
            </p>
          </div>
        </div>
      </Modal>
    </div>
  );
}
