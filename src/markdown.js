import gfm from 'remark-gfm';
import parse from 'remark-parse';
import { unified } from 'unified';

const parser = unified().use(parse).use(gfm);
const escapeHtml = (text) =>
  String(text).replace(
    /[&<>"']/g,
    (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char],
  );
export function render(source) {
  const tree = parser.parse(source);
  function node(n) {
    const children = () => (n.children || []).map(node).join('');
    const mapped = (text) => {
      const start = n.position.start.offset,
        end = n.position.end.offset;
      const precision = source.slice(start, end) === text ? 'exact' : 'enclosing';
      return `<span data-start="${start}" data-end="${end}" data-precision="${precision}">${escapeHtml(text)}</span>`;
    };
    switch (n.type) {
      case 'root':
        return children();
      case 'text':
        return mapped(n.value);
      case 'inlineCode':
        return `<code>${mapped(n.value)}</code>`;
      case 'code':
        return `<pre><code>${mapped(n.value)}</code></pre>`;
      case 'html':
        return `<code>${mapped(n.value)}</code>`;
      case 'heading':
        return `<h${n.depth}>${children()}</h${n.depth}>`;
      case 'paragraph':
        return `<p>${children()}</p>`;
      case 'strong':
        return `<strong>${children()}</strong>`;
      case 'emphasis':
        return `<em>${children()}</em>`;
      case 'delete':
        return `<del>${children()}</del>`;
      case 'blockquote':
        return `<blockquote>${children()}</blockquote>`;
      case 'list':
        return n.ordered
          ? `<ol start="${Number.isInteger(n.start) ? n.start : 1}">${children()}</ol>`
          : `<ul>${children()}</ul>`;
      case 'listItem':
        return `<li>${n.checked == null ? '' : `<span aria-label="${n.checked ? 'Complete' : 'Incomplete'}">[${n.checked ? 'x' : ' '}] </span>`}${children()}</li>`;
      case 'table':
        return `<div class="table-scroll"><table>${(n.children || []).map((row, i) => `<tr>${row.children.map((cell) => `<${i ? 'td' : 'th'}>${node(cell)}</${i ? 'td' : 'th'}>`).join('')}</tr>`).join('')}</table></div>`;
      case 'tableCell':
        return children();
      case 'link': {
        let url;
        try {
          const parsed = new URL(n.url);
          if (['https:', 'http:', 'mailto:'].includes(parsed.protocol)) url = parsed.href;
        } catch {
          /* Relative source links have no browser route. */
        }
        return url
          ? `<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${children()}</a>`
          : children();
      }
      case 'image':
      case 'imageReference':
        return mapped(`[Image: ${n.alt || 'image'}; external loading disabled]`);
      case 'linkReference':
        return children();
      case 'break':
        return '<br>';
      case 'thematicBreak':
        return '<hr>';
      default:
        return n.children
          ? children()
          : `<code>${escapeHtml(source.slice(n.position?.start.offset, n.position?.end.offset))}</code>`;
    }
  }
  return node(tree);
}

export function anchor(snapshot, input) {
  const { start, end, precision, quote } = input;
  if (
    !Number.isInteger(start) ||
    !Number.isInteger(end) ||
    start < 0 ||
    end <= start ||
    end > snapshot.source.length ||
    !['exact', 'enclosing'].includes(precision) ||
    typeof quote !== 'string' ||
    !quote.length ||
    quote.length > 10000
  )
    throw new Error('Invalid selection. Select source text again.');
  const slice = snapshot.source.slice(start, end);
  if (slice.length > 10000) throw new Error('Selection exceeds 10,000 characters.');
  if (precision === 'exact' && quote !== slice)
    throw new Error('Selection does not match the reviewed source.');
  return {
    start,
    end,
    precision,
    quote,
    slice,
    prefix: snapshot.source.slice(Math.max(0, start - 32), start),
    suffix: snapshot.source.slice(end, end + 32),
  };
}

export function locate(comment, snapshot) {
  if (!snapshot) return { status: 'orphaned' };
  if (comment.hash === snapshot.hash) return { status: 'current', suggestion: comment.start };
  const needle = comment.prefix + comment.slice + comment.suffix;
  const first = snapshot.source.indexOf(needle);
  if (first < 0 || snapshot.source.indexOf(needle, first + 1) >= 0) return { status: 'orphaned' };
  return { status: 'stale', suggestion: first + comment.prefix.length };
}
