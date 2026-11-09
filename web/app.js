const $ = id => document.getElementById(id);
const route = location.pathname;
let token = location.hash.slice(1) || sessionStorage.getItem(route);
if (token) sessionStorage.setItem(route, token);
history.replaceState(null, '', route);
let state, selectedId, selection, mode = 'rendered', busy = false;

function announce(text, error = false) { $('message').textContent = text; $('message').classList.toggle('error', error); $('message').classList.toggle('quiet', text === 'Ready.'); }
async function api(suffix, input) {
  const response = await fetch(`${route}/${suffix}`, { method: input ? 'POST' : 'GET',
    headers: { Authorization: `Bearer ${token}`, ...(input ? { 'Content-Type': 'application/json' } : {}) },
    ...(input ? { body: JSON.stringify(input) } : {}) });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Review request failed.');
  return data;
}
function element(tag, text, className) {
  const el = document.createElement(tag); el.textContent = text;
  if (className) el.className = className;
  return el;
}
function button(text, handler) { const el = element('button', text); el.type = 'button'; el.addEventListener('click', handler); return el; }
function documentNow() { return state?.documents.find(d => d.id === selectedId); }
function resetSelection() { selection = null; $('selection').textContent = $('comment').value ? 'Draft kept. Select text again.' : 'Select text to comment.'; $('save').disabled = true; }
function displayDocument() {
  const d = documentNow();
  resetSelection();
  $('document-name').textContent = d?.path || 'No readable artifacts';
  $('revision').textContent = d?.hash ? `SHA-256 ${d.hash}` : 'This artifact has no supported Markdown snapshot.';
  $('source').textContent = d?.source || '';
  $('source-lines').textContent = Array.from({ length: (d?.source || '').split('\n').length }, (_, i) => i + 1).join('\n');
  $('rendered').innerHTML = d?.html || '<p>Choose an existing Markdown artifact. Missing and unsupported artifacts appear in navigation.</p>';
  $('source').hidden = mode !== 'source'; $('rendered').hidden = mode !== 'rendered';
  $('source-view').hidden = mode !== 'source';
  $('source-mode').setAttribute('aria-pressed', String(mode === 'source'));
  $('rendered-mode').setAttribute('aria-pressed', String(mode === 'rendered'));
}
function display() {
  $('change').textContent = state.change;
  $('identity').textContent = `${state.schemaName} · ${state.source}`;
  $('location').textContent = state.changeRoot;
  $('artifacts').replaceChildren();
  $('artifact-statuses').replaceChildren();
  if (!documentNow()) selectedId = state.documents.find(d => d.supported)?.id;
  for (const artifact of state.artifacts) {
    const group = element('div', '', 'artifact-group');
    $('artifact-statuses').append(element('p', `${artifact.id} · ${artifact.status}`));
    const docs = state.documents.filter(d => d.artifact === artifact.id);
    if (docs.length > 1) group.append(element('p', artifact.id, 'artifact-status'));
    for (const d of docs) {
      const el = button(`${d.path}${d.supported ? '' : ' (unsupported)'}`, () => { selectedId = d.id; display(); });
      el.className = 'artifact'; if (d.id === selectedId) el.setAttribute('aria-current', 'page'); group.append(el);
    }
    $('artifacts').append(group);
  }
  if (!state.documents.length) $('artifacts').append(element('p', 'No existing artifacts.', 'note'));
  displayDocument();
  $('comments').replaceChildren();
  for (const c of state.comments) {
    const section = element('section', '', 'comment');
    section.append(element('h3', `${c.status} · ${c.state}`), element('p', c.path, 'note'), element('blockquote', c.quote), element('p', c.body));
    const original = element('details', ''); original.append(element('summary', 'Original source context'));
    const snapshot = state.snapshots[c.hash];
    original.append(element('p', `Revision ${c.hash}; ${c.precision} offsets [${c.start}, ${c.end})`, 'note'), element('pre', snapshot?.source.slice(Math.max(0, c.start - 120), c.end + 120) || c.slice));
    section.append(original, button(c.state === 'open' ? 'Resolve' : 'Reopen', () => action({ action: 'resolve', id: c.id })));
    if (c.status === 'stale') section.append(button('Reattach to suggested text', () => action({ action: 'reattach', id: c.id })));
    if (c.status === 'orphaned') section.append(element('p', 'No unique anchor. Keep this feedback or select source and add a new comment.', 'note'));
    $('comments').append(section);
  }
  $('submit').disabled = !state.comments.some(c => c.state === 'open');
  $('submit').hidden = $('submit').disabled;
  $('receipts').replaceChildren();
  for (const batch of [...state.batches].reverse()) {
    const receipt = element('div', '', 'receipt');
    receipt.append(button(`Batch ${batch.sequence} · ${batch.count} comments`, () => showBatch(batch.id)));
    $('receipts').append(receipt);
  }
}
async function operation(fn) {
  if (busy) return;
  busy = true; document.body.setAttribute('aria-busy', 'true');
  try { await fn(); }
  catch (error) { announce(error.message, true); }
  finally { busy = false; document.body.setAttribute('aria-busy', 'false'); }
}
async function action(input) {
  await operation(async () => {
    state = await api('action', { ...input, revision: state.revision });
    if (input.action === 'comment') $('comment').value = '';
    display(); announce(input.action === 'submit' ? 'Batch saved.' : 'Saved.');
    if (input.action === 'submit') await showBatch(state.batches.at(-1).id);
  });
}
async function showBatch(id) {
  try {
    $('export').value = (await api(`batch/${id}`)).markdown;
    $('retrieval-command').textContent = `spectater feedback --review ${state.reviewId} --batch ${id} --format markdown`;
    $('export-details').hidden = false; $('export-details').open = true;
  }
  catch (error) { announce(error.message, true); }
}
function offset(container, node, offset) {
  const range = document.createRange(); range.selectNodeContents(container); range.setEnd(node, offset); return range.toString().length;
}
function captureSelection() {
  if (busy || !state) return;
  const selected = window.getSelection();
  if (!selected.rangeCount || selected.isCollapsed) return;
  const range = selected.getRangeAt(0), d = documentNow();
  const area = mode === 'source' ? $('source') : $('rendered');
  if (!area.contains(range.startContainer) || !area.contains(range.endContainer)) return;
  let start, end, precision;
  if (mode === 'source') {
    start = offset(area, range.startContainer, range.startOffset); end = offset(area, range.endContainer, range.endOffset); precision = 'exact';
  } else {
    const mapped = node => (node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement)?.closest('[data-start]');
    const first = mapped(range.startContainer), last = mapped(range.endContainer);
    if (!first || first !== last) { resetSelection(); $('selection').textContent = 'Selection crosses rendered spans. Use Source.'; return; }
    precision = first.dataset.precision;
    start = Number(first.dataset.start); end = Number(first.dataset.end);
    if (precision === 'exact') { end = start + offset(first, range.endContainer, range.endOffset); start += offset(first, range.startContainer, range.startOffset); }
  }
  selection = { documentId: d.id, hash: d.hash, start, end, precision, quote: range.toString() };
  $('selection').textContent = `${precision === 'exact' ? 'Exact source' : 'Enclosing source span'}: “${selection.quote}”`;
  $('save').disabled = false;
}
document.addEventListener('mouseup', captureSelection);
document.addEventListener('keyup', captureSelection);
$('comment-form').addEventListener('submit', event => { event.preventDefault(); if (selection) action({ action: 'comment', ...selection, body: $('comment').value }); });
$('submit').addEventListener('click', () => action({ action: 'submit' }));
$('refresh').addEventListener('click', () => operation(async () => { state = await api('refresh', {}); display(); announce('Refreshed. Select text again.'); }));
for (const name of ['rendered', 'source']) $(`${name}-mode`).addEventListener('click', () => { mode = name; displayDocument(); });
$('copy').addEventListener('click', async () => {
  try { if (!$('export').value) throw new Error('Submit or open a batch first.'); await navigator.clipboard.writeText($('export').value); announce('Export copied.'); }
  catch { $('export').focus(); $('export').select(); announce('Clipboard unavailable. Copy the selected export or download it.'); }
});
$('download').addEventListener('click', () => {
  if (!$('export').value) return announce('Submit or open a batch first.');
  const url = URL.createObjectURL(new Blob([$ ('export').value], { type: 'text/markdown' }));
  const link = document.createElement('a'); link.href = url; link.download = 'spectater-feedback.md'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
});
operation(async () => { state = await api('state'); mode = state.defaultView; display(); announce('Ready.'); });
