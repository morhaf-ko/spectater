import { randomUUID } from 'node:crypto';
import { compareSources, sourceChanges } from './changes.js';
import { createDiscovery, readDocument } from './discovery.js';
import { anchor, locate, render } from './markdown.js';
import { batchStatus, deliverable, pendingComments } from './queue.js';
import { feedback, openStore } from './storage.js';

export async function openReview(options, dependencies = {}) {
  const discovery = dependencies.discover || createDiscovery();
  let review = dependencies.initial || (await discovery(options));
  const store = await openStore(review, dependencies.directory);
  let current = new Map();
  let rendered = new Map();
  let tail = Promise.resolve();
  let fingerprint;
  const observers = new Set();
  const notify = (event) => {
    for (const observer of observers) {
      try {
        observer(event);
      } catch {
        observers.delete(observer);
      }
    }
  };
  const serial = (fn) => {
    const job = tail.then(fn);
    tail = job.catch(() => {});
    return job;
  };
  async function refresh(initial) {
    const next = initial || (await discovery(options));
    if (next.reviewId !== review.reviewId)
      throw new Error('Planning identity changed. Reopen explicitly.');
    const documents = await Promise.all(
      next.documents
        .filter((d) => d.supported)
        .map(async (d) => [d.id, await readDocument(next, d)]),
    );
    if (documents.reduce((n, [, s]) => n + Buffer.byteLength(s.source), 0) > 16 * 1024 * 1024)
      throw new Error('Selected documents exceed 16 MiB.');
    const nextFingerprint = JSON.stringify([
      next.schemaName,
      next.source,
      next.artifacts,
      next.documents,
      documents.map(([id, snapshot]) => [id, snapshot.hash]),
    ]);
    if (nextFingerprint === fingerprint) return;
    const state = store.state;
    for (const [, snapshot] of documents) state.snapshots[snapshot.hash] = snapshot;
    const manifest = Object.fromEntries(
      [...documents]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([id, snapshot]) => [id, { path: snapshot.path, hash: snapshot.hash }]),
    );
    if (
      state.currentDocuments &&
      JSON.stringify(manifest) !== JSON.stringify(state.currentDocuments)
    )
      state.previousDocuments = state.currentDocuments;
    state.currentDocuments = manifest;
    state.documentIds = next.documents.map((d) => d.id);
    state.schemaName = next.schemaName;
    state.revision++;
    const html = new Map(
      documents.map(([, snapshot]) => [
        snapshot.hash,
        rendered.get(snapshot.hash) ?? render(snapshot.source),
      ]),
    );
    await store.commit(state);
    fingerprint = nextFingerprint;
    review = next;
    current = new Map(documents);
    rendered = html;
    notify({ type: 'refresh', revision: state.revision });
  }
  function view() {
    const state = store.state;
    return {
      reviewId: review.reviewId,
      root: review.root,
      changeRoot: review.changeRoot,
      change: review.change,
      defaultView: options.defaultView || 'rendered',
      source: review.source,
      schemaName: review.schemaName,
      artifacts: review.artifacts,
      revision: state.revision,
      documents: review.documents.map((d) => ({
        id: d.id,
        path: d.path,
        supported: d.supported,
        artifact: d.artifact,
        ...current.get(d.id),
        html: rendered.get(current.get(d.id)?.hash),
      })),
      comments: state.comments
        .filter((c) => !c.deletedAt)
        .map((c) => ({ ...c, ...locate(c, current.get(c.documentId)) })),
      deletedComments: state.comments
        .filter((c) => c.deletedAt)
        .map((c) => ({ ...c, ...locate(c, current.get(c.documentId)) })),
      endedAt: state.endedAt,
      endRequestedAt: state.endRequestedAt,
      changes: sourceChanges(state),
      hasPreviousSource: Boolean(state.previousDocuments),
      activity: state.activity || {},
      queue: state.queue || {},
      pendingCommentIds: pendingComments(state).map((comment) => comment.id),
      batches: state.batches.map(({ entries, ...batch }) => ({
        ...batch,
        count: entries.length + (batch.message ? 1 : 0),
        commentIds: entries.map((entry) => entry.id),
      })),
      snapshots: Object.fromEntries(state.comments.map((c) => [c.hash, state.snapshots[c.hash]])),
    };
  }
  async function checkRevision(input) {
    if (input.revision !== store.state.revision)
      throw new Error('Revision conflict. Preserve your draft and refresh.');
    for (const document of review.documents.filter((d) => d.supported)) {
      try {
        if ((await readDocument(review, document)).hash !== current.get(document.id)?.hash)
          throw new Error('Source changed.');
      } catch (error) {
        throw new Error(`Revision conflict: ${error.message} Preserve your draft and refresh.`);
      }
    }
  }
  const now = () => new Date().toISOString();
  const outstanding = (state) =>
    state.batches.some((batch) => ['queued', 'editing'].includes(batchStatus(state, batch.id)));
  const finishPendingEnd = (state) => {
    if (state.endRequestedAt && !outstanding(state)) {
      state.endedAt = now();
      delete state.endRequestedAt;
    }
  };
  const text = (value, label) => {
    if (typeof value !== 'string' || !value.trim() || value.length > 10000)
      throw new Error(`${label} must contain 1–10,000 characters.`);
    return value.trim();
  };
  const metadataActions = new Set(['end', 'resume', 'cancel-batch', 'edit-batch']);
  const findComment = (state, id) => {
    const comment = state.comments.find((c) => c.id === id);
    if (!comment) throw new Error('Unknown comment.');
    return comment;
  };
  const liveComment = (state, id) => {
    const comment = findComment(state, id);
    if (comment.deletedAt) throw new Error('Comment is deleted. Restore it before editing.');
    return comment;
  };
  const queuedBatch = (state, id) => {
    const batch = state.batches.find((item) => item.id === id);
    if (!batch) throw new Error('Unknown feedback batch.');
    if (!['queued', 'editing'].includes(batchStatus(state, batch.id)))
      throw new Error('Batch already handed off or withdrawn. Send a correction instead.');
    return batch;
  };
  const actions = {
    end(state) {
      if (outstanding(state))
        throw new Error('Deliver or cancel queued submissions before ending the review.');
      state.endedAt ||= now();
      delete state.endRequestedAt;
    },
    resume(state) {
      delete state.endedAt;
      delete state.endRequestedAt;
    },
    'cancel-batch'(state, input) {
      const batch = queuedBatch(state, input.id);
      state.queue ||= {};
      state.queue[batch.id] = { status: 'cancelled', at: now() };
      finishPendingEnd(state);
    },
    'edit-batch'(state, input) {
      const batch = queuedBatch(state, input.id);
      if (
        state.batches.some(
          (item) => item.id !== batch.id && batchStatus(state, item.id) === 'editing',
        )
      )
        throw new Error('Finish or cancel the current queued edit first.');
      state.queue ||= {};
      state.queue[batch.id] = { status: 'editing', at: now() };
    },
    comment(state, input) {
      const snapshot = current.get(input.documentId);
      if (!snapshot || snapshot.hash !== input.hash)
        throw new Error('Revision conflict: select the current document.');
      state.comments.push({
        id: randomUUID(),
        documentId: input.documentId,
        path: snapshot.path,
        hash: snapshot.hash,
        ...anchor(snapshot, input),
        body: text(input.body, 'Comment'),
        createdAt: now(),
        state: 'open',
      });
    },
    submit(state, input) {
      const message = input.message ? text(input.message, 'Message') : undefined;
      const entries = pendingComments(state).map((c) => ({
        ...c,
        line: state.snapshots[c.hash].source.slice(0, c.start).split('\n').length,
      }));
      const editing = state.batches.find((batch) => batchStatus(state, batch.id) === 'editing');
      if (!entries.length && !message) {
        if (input.end && !editing) return actions.end(state);
        throw new Error(
          editing
            ? 'Keep an open comment or cancel the queued batch.'
            : 'Add a message or an open comment that is new or changed before submitting.',
        );
      }
      const batch = {
        id: randomUUID(),
        sequence: state.batches.length + 1,
        submittedAt: now(),
        ...(message ? { message } : {}),
        entries,
      };
      state.batches.push(batch);
      if (editing)
        state.queue[editing.id] = {
          status: 'superseded',
          at: batch.submittedAt,
          replacementId: batch.id,
        };
      if (input.end) state.endRequestedAt = batch.submittedAt;
    },
    restore(state, input) {
      delete findComment(state, input.id).deletedAt;
    },
    delete(state, input) {
      liveComment(state, input.id).deletedAt = now();
    },
    edit(state, input) {
      const comment = liveComment(state, input.id);
      comment.body = text(input.body, 'Comment');
      comment.updatedAt = now();
    },
    resolve(state, input) {
      const comment = liveComment(state, input.id);
      comment.state = comment.state === 'open' ? 'resolved' : 'open';
    },
    reattach(state, input) {
      const comment = liveComment(state, input.id);
      const snapshot = current.get(comment.documentId);
      const result = locate(comment, snapshot);
      if (result.status !== 'stale')
        throw new Error('No unique suggested anchor. Select source and add a new comment.');
      comment.previousAnchors = [
        ...(comment.previousAnchors || []),
        { hash: comment.hash, start: comment.start, end: comment.end, slice: comment.slice },
      ];
      Object.assign(
        comment,
        anchor(snapshot, {
          start: result.suggestion,
          end: result.suggestion + comment.slice.length,
          precision: 'exact',
          quote: comment.slice,
        }),
        { hash: snapshot.hash },
      );
    },
  };
  try {
    await refresh(review);
  } catch (error) {
    await store.close();
    throw error;
  }
  return {
    directory: store.directory,
    subscribe(observer) {
      observers.add(observer);
      return () => observers.delete(observer);
    },
    view,
    refresh: () =>
      serial(async () => {
        if (store.state.endedAt)
          throw new Error('Review ended. Resume explicitly to refresh source.');
        await refresh();
        return view();
      }),
    compare: (id) => compareSources(store.state, id, dependencies.diff),
    // Delivers the oldest batch the agent has not replied to, so a lost response is redelivered.
    deliver: () =>
      serial(async () => {
        const state = store.state;
        if (state.endedAt) return null;
        const batch = state.batches.find(
          (item) => deliverable(state, item) && state.activity?.[item.id]?.status !== 'replied',
        );
        if (!batch) return null;
        if (batchStatus(state, batch.id) === 'queued') {
          const at = new Date().toISOString();
          state.queue ||= {};
          state.queue[batch.id] = { status: 'claimed', at };
          state.activity ||= {};
          state.activity[batch.id] = { receivedAt: at, status: 'received', replies: [] };
          finishPendingEnd(state);
          state.revision++;
          await store.commit(state);
          notify({ type: 'activity', revision: state.revision });
          if (state.endedAt) notify({ type: 'lifecycle', revision: state.revision, ended: true });
        }
        return feedback(state, batch.id);
      }),
    recordActivity: (sequence, input) =>
      serial(async () => {
        const state = store.state;
        const batch =
          sequence === undefined
            ? state.batches.find(
                (item) =>
                  batchStatus(state, item.id) === 'claimed' &&
                  state.activity?.[item.id]?.status !== 'replied',
              )
            : state.batches.find((item) => item.sequence === sequence);
        if (!batch)
          throw new Error(
            sequence === undefined
              ? 'No delivered batch is awaiting a reply. Pass --batch to reply to an earlier one.'
              : `Unknown feedback batch: ${sequence}.`,
          );
        if (batchStatus(state, batch.id) !== 'claimed')
          throw new Error('Batch has not been delivered to the agent.');
        if (!['working', 'done'].includes(input.status))
          throw new Error('Reply status must be working or done.');
        const body = input.body ?? '';
        if (
          typeof body !== 'string' ||
          body.length > 10000 ||
          (input.status === 'done' && !body.trim())
        )
          throw new Error('A reply must contain 1–10,000 characters.');
        const activity = state.activity[batch.id];
        const previous = JSON.stringify(activity);
        if (input.status === 'working' && activity.status !== 'replied') {
          activity.startedAt ||= new Date().toISOString();
          activity.status = 'working';
        }
        if (input.status === 'done' && activity.replies.at(-1)?.body !== body.trim()) {
          activity.replies.push({
            id: randomUUID(),
            body: body.trim(),
            at: new Date().toISOString(),
          });
          activity.status = 'replied';
        }
        if (previous !== JSON.stringify(activity)) {
          state.revision++;
          await store.commit(state);
          notify({ type: 'activity', revision: state.revision });
        }
        return { batch: batch.sequence, activity: activity.status };
      }),
    mutate: (input) =>
      serial(async () => {
        const handler = actions[input.action];
        if (!handler) throw new Error('Unknown review action.');
        if (store.state.endedAt && !['resume', 'end'].includes(input.action))
          throw new Error('Review ended. Resume explicitly to change feedback.');
        if (metadataActions.has(input.action)) {
          if (input.revision !== store.state.revision)
            throw new Error('Revision conflict. Refresh review state and retry.');
        } else await checkRevision(input);
        if (input.action === 'resume' && store.state.endedAt) await refresh();
        const state = store.state;
        handler(state, input);
        state.revision++;
        await store.commit(state);
        const lifecycle = ['end', 'resume'].includes(input.action) || Boolean(state.endedAt);
        notify({
          type: lifecycle ? 'lifecycle' : 'activity',
          revision: state.revision,
          ended: Boolean(state.endedAt),
        });
        if (input.action === 'submit')
          notify({ type: 'batch', sequence: state.batches.at(-1).sequence });
        return view();
      }),
    close: () => serial(() => store.close()),
    get state() {
      return store.state;
    },
  };
}
