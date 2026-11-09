export const batchStatus = (state, id) =>
  state.queue?.[id]?.status || (state.activity?.[id] ? 'claimed' : 'queued');
export const deliverable = (state, batch) =>
  ['queued', 'claimed'].includes(batchStatus(state, batch.id));
const signature = (comment) =>
  JSON.stringify([comment.hash, comment.start, comment.end, comment.body]);

export function pendingComments(state) {
  const editing = state.batches.find((batch) => batchStatus(state, batch.id) === 'editing');
  const open = state.comments.filter((comment) => comment.state === 'open' && !comment.deletedAt);
  if (editing) {
    const ids = new Set(editing.entries.map((entry) => entry.id));
    return open.filter((comment) => ids.has(comment.id));
  }
  const latest = new Map(),
    queued = new Set();
  for (const batch of state.batches) {
    if (!deliverable(state, batch)) continue;
    for (const entry of batch.entries) {
      latest.set(entry.id, entry);
      if (batchStatus(state, batch.id) === 'queued') queued.add(entry.id);
    }
  }
  return open.filter(
    (comment) =>
      !queued.has(comment.id) &&
      (!latest.has(comment.id) || signature(latest.get(comment.id)) !== signature(comment)),
  );
}
