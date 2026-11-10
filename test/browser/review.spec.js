import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { cli } from '../../scripts/cli-fixture.js';
import { listServers, writeServer } from '../../src/agent.js';
import { openReview } from '../../src/review.js';
import { startServer } from '../../src/server.js';
import { fixture, sample } from '../helpers.js';

// Registers an in-process server so CLI commands can address it by change name.
async function register(f, review, server) {
  await writeServer(f.stateDir, {
    reviewId: review.state.reviewId,
    pid: process.pid,
    url: server.url,
    change: 'example',
    root: f.project,
  });
  return cli('bin/spectater.js', f);
}

async function setTheme(page, value) {
  if (value === 'system') {
    if ((await page.locator('html').getAttribute('data-theme-preference')) !== 'system') {
      if (!(await page.locator('.review-details').evaluate((el) => el.open)))
        await page.locator('.review-details > summary').click();
      await page.getByRole('button', { name: 'Use system theme', exact: true }).click();
    }
  } else if ((await page.locator('html').getAttribute('data-theme')) !== value) {
    await page.getByRole('button', { name: 'Dark mode', exact: true }).click();
  }
}

async function selectSource(page, text) {
  await page.getByRole('button', { name: 'Source', exact: true }).click();
  await page.locator('#source').evaluate((el, quote) => {
    const textNode = el.firstChild;
    const start = textNode.data.indexOf(quote);
    if (start < 0) throw new Error('Fixture selection missing.');
    const range = document.createRange();
    range.setStart(textNode, start);
    range.setEnd(textNode, start + quote.length);
    window.getSelection().removeAllRanges();
    window.getSelection().addRange(range);
    document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
  }, text);
}

test('a real mouse drag in rendered prose opens a usable comment composer', async ({ page }) => {
  const f = await fixture();
  let server;
  try {
    const review = await openReview(f.options, { directory: f.stateDir });
    server = await startServer(review);
    await page.goto(server.url);
    await expect(page.locator('#message')).toContainText('Ready.');
    await expect(page.locator('link[rel="icon"]')).toHaveAttribute('href', '/favicon.svg');
    const icon = await page.request.get(`${server.origin}/favicon.svg`);
    expect(icon.status()).toBe(200);
    expect(icon.headers()['content-type']).toContain('image/svg+xml');
    const bounds = await page
      .locator('#rendered [data-start]')
      .filter({ hasText: 'Review this exact sentence.' })
      .evaluate((el) => {
        const range = document.createRange(),
          text = el.firstChild;
        const start = text.data.indexOf('exact sentence');
        range.setStart(text, start);
        range.setEnd(text, start + 'exact sentence'.length);
        const r = range.getBoundingClientRect();
        return { x: r.x, y: r.y, width: r.width, height: r.height };
      });
    await page.mouse.move(bounds.x + 1, bounds.y + bounds.height / 2);
    await page.mouse.down();
    await page.mouse.move(bounds.x + bounds.width - 1, bounds.y + bounds.height / 2, { steps: 15 });
    await page.mouse.up();
    await expect(page.getByRole('dialog', { name: 'Add comment' })).toBeVisible();
    await expect(page.locator('#comment')).toBeFocused();
    await page.keyboard.type('Selected with the mouse.');
    await page.locator('#save').click();
    await expect(page.locator('#comments')).toContainText('Selected with the mouse.');
    await page
      .locator('#rendered [data-start]')
      .filter({ hasText: 'Review this exact sentence.' })
      .dblclick();
    await expect(page.getByRole('dialog', { name: 'Add comment' })).toBeVisible();
    await expect(page.locator('#comment')).toBeFocused();
  } finally {
    await server?.close();
    await f.cleanup();
  }
});

test('the existing CLI waits for submission and refreshes the active reader without losing drafts', async ({
  page,
}) => {
  const f = await fixture();
  let server;
  try {
    const review = await openReview(f.options, { directory: f.stateDir });
    server = await startServer(review);
    const stream = page.waitForResponse(
      (response) => response.url().endsWith('/events') && response.status() === 200,
    );
    await page.goto(server.url);
    await expect(page.locator('#message')).toContainText('Ready.');
    await stream;
    const run = await register(f, review, server);
    const waiting = run(['wait', 'example', '--timeout', '10']);
    await expect(page.locator('#listener-status')).toHaveText('Feedback listener waiting');
    await selectSource(page, 'exact sentence');
    await page.locator('#comment').fill('Feedback for the waiting conversation.');
    await page.locator('#save').click();
    await page.locator('#submit').click();
    await expect(page.locator('#message')).toContainText('Batch saved.');
    const result = JSON.parse((await waiting).stdout);
    expect(result.status).toBe('batch');
    const { batch } = result;
    expect(batch.sequence).toBe(1);
    expect(batch.entries[0].body).toBe('Feedback for the waiting conversation.');
    await expect(page.locator('#listener-status')).toContainText('No agent waiting');
    await expect(page.locator('#receipts')).toContainText('Received by agent CLI');
    await run(['reply', 'example', '--status', 'working']);
    await expect(page.locator('#receipts')).toContainText('Agent working');
    await selectSource(page, 'exact');
    await page.locator('#comment').fill('Keep this draft during the agent refresh.');
    await writeFile(f.file, `Agent revision.\n\n${sample}`);
    // Source writes update the reader without an explicit refresh command.
    await expect(page.locator('#source')).toContainText('Agent revision.');
    await expect(page.locator('#comments')).toContainText('stale · open');
    await expect(page.locator('#comment')).toHaveValue('Keep this draft during the agent refresh.');
    await expect(page.getByRole('button', { name: 'Resume draft' })).toBeVisible();
    await page.getByRole('button', { name: 'Resume draft' }).click();
    await run(['reply', 'example', '--message', '<script>Reply is plain text.</script>']);
    await expect(page.locator('#receipts')).toContainText('Agent replied');
    await expect(page.locator('#receipts')).toContainText('<script>Reply is plain text.</script>');
    await expect(page.locator('#comment')).toBeFocused();
    await expect(page.locator('#comment')).toHaveValue('Keep this draft during the agent refresh.');
    expect(await page.locator('#receipts script').count()).toBe(0);
    const timeout = JSON.parse((await run(['wait', 'example', '--timeout', '0'])).stdout);
    expect(timeout.status).toBe('timeout');
    expect(new URL(page.url()).pathname).toBe(server.route);
  } finally {
    await server?.close();
    await f.cleanup();
  }
});

test('read, select, comment, submit, CLI retrieve, revise, refresh and restart', async ({
  page,
  browser,
}) => {
  const f = await fixture();
  let server;
  try {
    const review = await openReview(f.options, { directory: f.stateDir });
    server = await startServer(review, { watch: false });
    const before = await readFile(f.file);
    await page.goto(server.url);
    await expect(page.locator('#message')).toContainText('Ready.');
    expect(new URL(page.url()).hash).toBe('');
    await expect(page.locator('#rendered h1')).toHaveText('Fixture proposal');
    await selectSource(page, 'exact sentence');
    await page.getByLabel('Comment on selected text').fill('Explain the exactness contract.');
    await page.getByRole('button', { name: 'Save comment', exact: true }).click();
    await expect(page.locator('#comments')).toContainText('current · open');
    await page.getByRole('button', { name: 'Submit batch', exact: true }).click();
    await expect(page.locator('#message')).toContainText('Batch saved.');
    await expect(page.locator('#receipts')).toContainText('Saved · queued for agent');
    const exported = await cli(
      'bin/spectater.js',
      f,
    )(['feedback', 'example', '--batch', '1', '--format', 'markdown']);
    expect(exported.stdout).toContain('Explain the exactness contract.');
    expect(exported.stdout).toBe(await page.locator('#export').inputValue());
    expect(await readFile(f.file)).toEqual(before);
    await selectSource(page, 'exact');
    await page.getByLabel('Comment on selected text').fill('Keep this unsaved draft.');
    await writeFile(f.file, `Added introduction.\n\n${sample}`);
    await page.getByRole('button', { name: 'Save comment', exact: true }).click();
    await expect(page.locator('#message')).toContainText('Revision conflict');
    await expect(page.locator('#comment')).toHaveValue('Keep this unsaved draft.');
    await page.getByRole('button', { name: 'Refresh source' }).click();
    await expect(page.locator('#comments')).toContainText('stale · open');
    await expect(page.locator('#comment')).toHaveValue('Keep this unsaved draft.');
    await writeFile(f.file, '# Replacement\n\nThe selected sentence was removed.\n');
    await page.getByRole('button', { name: 'Refresh source' }).click();
    await expect(page.locator('#comments')).toContainText('orphaned · open');
    await server.close();
    server = null;
    const restarted = await openReview(f.options, { directory: f.stateDir });
    server = await startServer(restarted);
    await page.goto(server.url);
    await expect(page.locator('#comments')).toContainText('Explain the exactness contract.');
    await page.getByRole('button', { name: 'Batch 1 · 1 items' }).click();
    await expect(page.locator('#export')).toHaveValue(exported.stdout);
    console.log(
      `Browser vertical slice: ${browser.version()}; canonical writes limited to two explicit fixture revisions.`,
    );
  } finally {
    await server?.close();
    await f.cleanup();
  }
});

test('rendered precision, source fallback, Unicode/CRLF, inert Markdown and clipboard fallback', async ({
  page,
}) => {
  const source =
    '# Selection fixture\r\n\r\nPlain text with **bold words**.\r\n\r\nA &amp; B\r\n\r\n😀 Unicode stays exact.\r\n\r\n- [x] Checked task\r\n\r\n| Name | Value |\r\n| --- | --- |\r\n| Cell | Text |\r\n\r\n<script>window.executed = true</script>\r\n\r\n![remote](https://example.org/remote.png)\r\n';
  const f = await fixture(source);
  let server;
  try {
    const review = await openReview(f.options, { directory: f.stateDir });
    server = await startServer(review);
    const external = [];
    page.on('request', (request) => {
      if (!request.url().startsWith(server.origin)) external.push(request.url());
    });
    await page.addInitScript(() =>
      Object.defineProperty(navigator, 'clipboard', {
        value: {
          writeText: async () => {
            throw new Error('denied');
          },
        },
      }),
    );
    await page.goto(server.url);
    await expect(page.locator('#message')).toContainText('Ready.');
    expect(await page.evaluate(() => window.executed)).toBeUndefined();
    await expect(page.locator('#rendered table')).toBeVisible();
    async function selectRendered(text, from = 0, to = text.length) {
      await page
        .locator('#rendered [data-start]')
        .filter({ hasText: text })
        .first()
        .evaluate(
          (el, offsets) => {
            const range = document.createRange();
            range.setStart(el.firstChild, offsets[0]);
            range.setEnd(el.firstChild, offsets[1]);
            window.getSelection().removeAllRanges();
            window.getSelection().addRange(range);
            document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
          },
          [from, to],
        );
    }
    await selectRendered('bold words');
    await expect(page.locator('#selection')).toContainText('Exact source');
    await page.locator('#comment').fill('Rendered emphasis.');
    await page.locator('#save').click();
    await expect(page.locator('#comments')).toContainText('Rendered emphasis.');
    await selectRendered('A & B', 2, 3);
    await expect(page.locator('#selection')).toContainText('Enclosing source span');
    await page.locator('#comment').fill('Entity selection.');
    await page.locator('#save').click();
    await expect(page.locator('#comments')).toContainText('Entity selection.');
    expect(review.state.comments[1].slice).toBe('A &amp; B');
    await page.locator('#rendered').evaluate((el) => {
      const p = el.querySelector('p');
      const range = document.createRange();
      range.selectNodeContents(p);
      window.getSelection().removeAllRanges();
      window.getSelection().addRange(range);
      document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    });
    await expect(page.locator('#selection')).toContainText('Enclosing source span');
    await expect(page.locator('#comment')).toBeFocused();
    await page.locator('#comment').fill('Whole formatted paragraph.');
    await page.locator('#save').click();
    await expect(page.locator('#comments')).toContainText('Whole formatted paragraph.');
    expect(review.state.comments[2].slice).toBe('Plain text with **bold words**.');
    await selectSource(page, '😀 Unicode');
    await page.locator('#comment').fill('Unicode source.');
    await page.locator('#save').click();
    await expect(page.locator('#comments')).toContainText('Unicode source.');
    expect(review.state.comments[3].slice).toBe('😀 Unicode');
    expect(review.state.comments[3].start).toBe(source.indexOf('😀 Unicode'));
    await page.locator('#submit').click();
    await expect(page.locator('#message')).toContainText('Batch saved.');
    await page.locator('#export-details > summary').click();
    await page.locator('#copy').click();
    await expect(page.locator('#message')).toContainText('Clipboard unavailable.');
    const downloaded = page.waitForEvent('download');
    await page.locator('#download').click();
    expect((await downloaded).suggestedFilename()).toBe('spectater-feedback.md');
    expect(external).toEqual([]);
    expect(await readFile(f.file, 'utf8')).toBe(source);
  } finally {
    await server?.close();
    await f.cleanup();
  }
});

test('document reader desktop/mobile states and configured source default', async ({ page }) => {
  const source = await readFile(
    new URL(
      '../../openspec/changes/archive/2026-11-09-local-change-review/proposal.md',
      import.meta.url,
    ),
    'utf8',
  );
  const f = await fixture(source);
  let server;
  try {
    const review = await openReview(
      { ...f.options, defaultView: 'source' },
      { directory: f.stateDir },
    );
    server = await startServer(review);
    await page.goto(server.url);
    await expect(page.locator('#source')).toBeVisible();
    await setTheme(page, 'light');
    const dir = '.tmp/explore-spectater/screenshots';
    await mkdir(dir, { recursive: true });
    await expect(page.locator('#source-lines')).toContainText('1\n2\n3');
    await page.screenshot({ path: `${dir}/desktop-source.png` });
    await page.getByRole('button', { name: 'Rendered', exact: true }).click();
    await expect(page.locator('#rendered h1')).toHaveText('Proposal');
    for (const theme of ['light', 'dark']) {
      await setTheme(page, theme);
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      await page.screenshot({ path: `${dir}/desktop-${theme}.png`, fullPage: true });
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.setViewportSize({ width: 390, height: 844 });
    await page.evaluate(
      () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
    );
    expect(await page.locator('header').count()).toBe(1);
    for (const theme of ['light', 'dark']) {
      await setTheme(page, theme);
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      await page.screenshot({ path: `${dir}/mobile-${theme}.png` });
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.locator('aside').scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${dir}/mobile-feedback.png` });
    await page.keyboard.press('Tab');
    expect(
      await page.evaluate(() => getComputedStyle(document.activeElement).outlineStyle),
    ).not.toBe('none');
  } finally {
    await server?.close();
    await f.cleanup();
  }
});

test('system theme follows OS changes; manual choices persist without losing a draft', async ({
  page,
}) => {
  const f = await fixture();
  let server;
  try {
    const review = await openReview(f.options, { directory: f.stateDir });
    server = await startServer(review);
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.goto(server.url);
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await expect(page.locator('html')).toHaveAttribute('data-theme-preference', 'system');
    await page.emulateMedia({ colorScheme: 'light' });
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    await selectSource(page, 'exact sentence');
    await page.locator('#comment').fill('Draft survives theme changes.');
    await setTheme(page, 'dark');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await expect(page.locator('#comment')).toHaveValue('Draft survives theme changes.');
    await expect(page.locator('#save')).toBeEnabled();
    if (!(await page.locator('#comment-popover').isVisible()))
      await page.getByRole('button', { name: 'Resume draft' }).click();
    await page.locator('#save').click();
    await expect(page.locator('#comments')).toContainText('Draft survives theme changes.');
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-theme-preference', 'dark');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await setTheme(page, 'light');
    await page.emulateMedia({ colorScheme: 'dark' });
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    await setTheme(page, 'system');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await page.emulateMedia({ colorScheme: 'light' });
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  } finally {
    await server?.close();
    await f.cleanup();
  }
});

test('theme still works when browser preference storage is unavailable', async ({ page }) => {
  const f = await fixture();
  let server;
  try {
    const review = await openReview(f.options, { directory: f.stateDir });
    server = await startServer(review);
    await page.addInitScript(() =>
      Object.defineProperty(window, 'localStorage', {
        get() {
          throw new Error('storage denied');
        },
      }),
    );
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.goto(server.url);
    await expect(page.locator('#message')).toContainText('Ready.');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await setTheme(page, 'light');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  } finally {
    await server?.close();
    await f.cleanup();
  }
});

test('CLI config and no-open defaults survive a forced macOS opener failure', async ({ page }) => {
  test.skip(process.platform !== 'darwin', 'macOS opener contract');
  const f = await fixture();
  const tools = path.join(f.directory, 'tools');
  await mkdir(tools);
  const marker = path.join(f.directory, 'opener-called');
  await writeFile(path.join(tools, 'open'), `#!/bin/sh\necho called > "${marker}"\nexit 1\n`, {
    mode: 0o700,
  });
  const run = cli('bin/spectater.js', f, { PATH: `${tools}:${process.env.PATH}` });
  try {
    await writeFile(f.configFile, '{"defaultView":"source","openBrowser":false}');
    const quiet = await run(['open', 'example']);
    expect(quiet.stderr).toBe('');
    await expect(access(marker)).rejects.toThrow();
    await page.goto(JSON.parse(quiet.stdout).url);
    await expect(page.locator('#source')).toBeVisible();
    await writeFile(f.configFile, '{}');
    const failed = await run(['open', 'example']);
    expect(failed.stderr).toContain('Browser opening failed');
    expect(JSON.parse(failed.stdout).opened).toBe(false);
    expect(await readFile(marker, 'utf8')).toBe('called\n');
    expect((await run(['open', 'example', '--no-open'])).stderr).toBe('');
  } finally {
    await run(['stop', 'example']).catch(() => {});
    while ((await listServers(f.stateDir)).length) await new Promise((r) => setTimeout(r, 50));
    await f.cleanup();
  }
});

test('message composer, keyboard shortcuts and Send & End reach a waiting agent', async ({
  page,
}) => {
  const f = await fixture();
  let server;
  try {
    const review = await openReview(f.options, { directory: f.stateDir });
    server = await startServer(review);
    await page.goto(server.url);
    await expect(page.locator('#message')).toContainText('Ready.');
    const run = await register(f, review, server);
    await page.locator('#agent-message').fill('A general note.');
    await page.locator('#agent-message').press('Enter');
    await expect(page.locator('#message')).toContainText('Batch saved.');
    await expect(page.locator('#agent-message')).toHaveValue('');
    const first = JSON.parse((await run(['wait', 'example', '--timeout', '0'])).stdout).batch;
    expect(first.message).toBe('A general note.');
    await run(['reply', 'example', '--message', 'Noted.']);
    await selectSource(page, 'exact');
    await page.locator('#comment').fill('Saved and sent with one shortcut.');
    await page.locator('#comment').press('Shift+Enter');
    await page.locator('#comment').press('ControlOrMeta+Enter');
    await expect(page.locator('#receipts')).toContainText('Batch 2');
    expect(review.state.batches[1].entries[0].body).toBe('Saved and sent with one shortcut.');
    const second = JSON.parse((await run(['wait', 'example', '--timeout', '0'])).stdout).batch;
    await run(['reply', 'example', '--batch', String(second.sequence), '--message', 'Done.']);
    const reviewAction = page.locator('#review-lifecycle');
    await expect(reviewAction).toHaveText('End review');
    await expect(page.getByRole('button', { name: /^(End review|Send & End)$/ })).toHaveCount(1);
    await page.locator('#agent-message').fill('Last note before ending.');
    await expect(reviewAction).toHaveText('Send & End');
    await page.locator('#agent-message').fill('');
    await expect(reviewAction).toHaveText('End review');
    await page.locator('#agent-message').fill('Last note before ending.');
    await page.getByRole('button', { name: 'Send & End', exact: true }).click();
    await expect(page.locator('#end-pending')).toBeVisible();
    const final = JSON.parse((await run(['wait', 'example', '--timeout', '0'])).stdout);
    expect(final.batch.message).toBe('Last note before ending.');
    await expect(page.locator('#listener-status')).toContainText('Review ended');
    await run(['reply', 'example', '--message', 'Final changes made.']);
    expect(JSON.parse((await run(['wait', 'example', '--timeout', '0'])).stdout).status).toBe(
      'ended',
    );
  } finally {
    await server?.close();
    await f.cleanup();
  }
});

test('selection popover supports immediate typing, cached drafts, editing, deletion and undo', async ({
  page,
}) => {
  const f = await fixture();
  let server;
  try {
    const review = await openReview(f.options, { directory: f.stateDir });
    server = await startServer(review);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(server.url);
    await expect(page.locator('#message')).toContainText('Ready.');
    const dir = '.tmp/explore-spectater/screenshots';
    await mkdir(dir, { recursive: true });
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
      for (const theme of ['light', 'dark']) {
        await setTheme(page, theme);
        await selectSource(page, 'exact sentence');
        await expect(page.locator('#comment')).toBeFocused();
        await page.screenshot({ path: `${dir}/popover-${width}-${theme}.png` });
        await page.keyboard.press('Escape');
        await expect(page.locator('#comment-popover')).not.toBeVisible();
      }
    }
    await selectSource(page, 'exact sentence');
    await expect(page.getByRole('dialog', { name: 'Add comment' })).toBeVisible();
    await expect(page.locator('#comment')).toBeFocused();
    const box = await page.locator('#comment-popover').boundingBox();
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(390);
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.y + box.height).toBeLessThanOrEqual(844);
    await page.keyboard.type('Popover feedback.');
    await page.reload();
    await expect(page.locator('#message')).toContainText('Ready.');
    await page.getByRole('button', { name: 'Resume draft' }).click();
    await expect(page.locator('#comment')).toHaveValue('Popover feedback.');
    await page.locator('#save').click();
    await expect(page.locator('#comment-popover')).not.toBeVisible();
    await expect(page.locator('#comments')).toContainText('Popover feedback.');
    await page.locator('#submit').click();
    await expect(page.locator('#message')).toContainText('Batch saved.');
    const exported = await page.locator('#export').inputValue();
    await page.locator('#comments').getByRole('button', { name: 'Edit', exact: true }).click();
    await expect(page.getByRole('dialog', { name: 'Edit comment' })).toBeVisible();
    await page.locator('#comment').fill('Edited feedback.');
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Resume draft' }).click();
    await expect(page.locator('#comment')).toHaveValue('Edited feedback.');
    await page.locator('#save').click();
    await expect(page.locator('#comments')).toContainText('Edited feedback.');
    await page.locator('#comments').getByRole('button', { name: 'Delete', exact: true }).click();
    await expect(page.locator('#comments .comment')).toHaveCount(0);
    await page.getByRole('button', { name: 'Undo', exact: true }).click();
    await expect(page.locator('#comments')).toContainText('Edited feedback.');
    await page.locator('#comments').getByRole('button', { name: 'Delete', exact: true }).click();
    await page.reload();
    await expect(page.locator('#message')).toContainText('Ready.');
    await page.locator('#deleted-comments > summary').click();
    await page.getByRole('button', { name: 'Restore', exact: true }).click();
    await expect(page.locator('#comments')).toContainText('Edited feedback.');
    await page.getByRole('button', { name: 'Batch 1 · 1 items' }).click();
    await expect(page.locator('#export')).toHaveValue(exported);
    expect(await readFile(f.file, 'utf8')).toBe(sample);
  } finally {
    await server?.close();
    await f.cleanup();
  }
});

test('rendered multi-paragraph selections open the composer and preserve enclosing Markdown offsets', async ({
  page,
}) => {
  const source =
    '# Paragraph selection\r\n\r\nAlpha **bold words** and a [safe link](https://example.org) finish the first paragraph.\r\n\r\nSecond paragraph has an &amp; entity, 😀 Unicode, and omega at the end.\r\n\r\n- [x] Generated marker fallback\r\n';
  const f = await fixture(source);
  let server;
  try {
    const review = await openReview(f.options, { directory: f.stateDir });
    server = await startServer(review);
    await page.goto(server.url);
    await expect(page.locator('#message')).toContainText('Ready.');
    expect(new URL(page.url()).pathname).toBe('/review/example');
    const points = await page.locator('#rendered').evaluate((area) => {
      const first = area.querySelector('p [data-start]').firstChild;
      const last = area.querySelectorAll('p')[1].querySelector('[data-start]').firstChild;
      const a = document.createRange();
      a.setStart(first, 0);
      a.setEnd(first, 1);
      const b = document.createRange();
      const end = last.data.indexOf('omega') + 5;
      b.setStart(last, end - 1);
      b.setEnd(last, end);
      const startRect = a.getBoundingClientRect(),
        endRect = b.getBoundingClientRect();
      return {
        x1: startRect.left + 1,
        y1: startRect.top + startRect.height / 2,
        x2: endRect.right - 1,
        y2: endRect.top + endRect.height / 2,
      };
    });
    await page.mouse.move(points.x1, points.y1);
    await page.mouse.down();
    await page.mouse.move(points.x2, points.y2, { steps: 20 });
    await page.mouse.up();
    await expect(page.getByRole('dialog', { name: 'Add comment' })).toBeVisible();
    await expect(page.locator('#comment')).toBeFocused();
    await expect(page.locator('#selection')).toContainText('Enclosing source span');
    await page.keyboard.type('Feedback across two paragraphs.');
    await mkdir('.tmp/explore-spectater/screenshots', { recursive: true });
    await page.screenshot({
      path: '.tmp/explore-spectater/screenshots/multi-paragraph-popover.png',
      fullPage: true,
    });
    await page.locator('#save').click();
    await expect(page.locator('#comments')).toContainText('Feedback across two paragraphs.');
    const comment = review.state.comments[0];
    expect(comment.precision).toBe('enclosing');
    expect(comment.slice).toContain('**bold words**');
    expect(comment.slice).toContain('[safe link](https://example.org)');
    expect(comment.slice).toContain('\r\n\r\nSecond paragraph');
    expect(source.slice(comment.start, comment.end)).toBe(comment.slice);
    // Element boundaries occur when selecting whole blocks instead of text nodes.
    await page.locator('#rendered').evaluate((area) => {
      const paragraphs = area.querySelectorAll('p');
      const range = document.createRange();
      range.setStart(paragraphs[0], 0);
      range.setEnd(paragraphs[1], paragraphs[1].childNodes.length);
      window.getSelection().removeAllRanges();
      window.getSelection().addRange(range);
      document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    });
    await expect(page.locator('#comment')).toBeFocused();
    await page.locator('#comment').fill('Whole blocks.');
    await page.locator('#save').click();
    await expect(page.locator('#comments')).toContainText('Whole blocks.');
    expect(review.state.comments[1].slice).toBe(
      source.slice(source.indexOf('Alpha'), source.indexOf('\r\n\r\n- [x]')),
    );
    await page.locator('#rendered li').evaluate((li) => {
      const range = document.createRange();
      range.selectNodeContents(li);
      window.getSelection().removeAllRanges();
      window.getSelection().addRange(range);
      document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    });
    await expect(page.locator('#message')).toContainText('unmapped content');
    await expect(page.locator('#save')).toBeDisabled();
    expect(await readFile(f.file, 'utf8')).toBe(source);
  } finally {
    await server?.close();
    await f.cleanup();
  }
});

test('queued submissions can be paused, replaced and cancelled; corrections send only changed comments', async ({
  page,
}) => {
  const f = await fixture();
  let server;
  try {
    const review = await openReview(f.options, { directory: f.stateDir });
    server = await startServer(review);
    await page.goto(server.url);
    await expect(page.locator('#message')).toContainText('Ready.');
    await selectSource(page, 'exact');
    await page.locator('#comment').fill('Fix this feedback.');
    await page.locator('#save').click();
    await expect(page.locator('#comments')).toContainText('Fix this feedback.');
    await page.locator('#submit').click();
    await expect(page.locator('#message')).toContainText('Batch saved.');
    await expect(page.locator('#export-details')).not.toHaveAttribute('open', '');
    await expect(page.locator('#copy')).not.toBeVisible();
    await expect(page.locator('#submit')).toBeDisabled();
    await page.getByRole('button', { name: 'Edit queued batch 1', exact: true }).click();
    await expect(page.locator('#queue-editing')).toContainText('delivery paused');
    await page.locator('#comments').getByRole('button', { name: 'Edit', exact: true }).click();
    await page.locator('#comment').fill('Corrected before delivery.');
    await page.locator('#save').click();
    await expect(page.locator('#comments')).toContainText('Corrected before delivery.');
    await page.getByRole('button', { name: 'Update queued batch', exact: true }).click();
    await expect(page.locator('#receipts')).toContainText('Replaced by batch 2');
    expect(review.state.batches[0].entries[0].body).toBe('Fix this feedback.');
    expect(review.state.batches[1].entries[0].body).toBe('Corrected before delivery.');
    await page.getByRole('button', { name: 'Cancel batch 2', exact: true }).click();
    await expect(page.locator('#receipts')).toContainText('Cancelled');
    await expect(page.locator('#comments')).toContainText('Corrected before delivery.');
    await page.locator('#submit').click();
    await expect(page.locator('#receipts')).toContainText('Batch 3');
    const run = await register(f, review, server);
    const result = await run(['wait', 'example', '--timeout', '0']);
    expect(JSON.parse(result.stdout).batch.sequence).toBe(3);
    await expect(page.locator('#receipts')).toContainText('Received by agent CLI');
    await expect(page.getByRole('button', { name: 'Cancel batch 3', exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: 'Send correction', exact: true }).click();
    await page.locator('#comment').fill('A follow-up after handoff.');
    await page.locator('#save').click();
    await expect(page.locator('#comments')).toContainText('A follow-up after handoff.');
    await page.locator('#submit').click();
    await expect(page.locator('#receipts')).toContainText('Batch 4');
    expect(review.state.batches[3].entries).toHaveLength(1);
    expect(review.state.batches[2].entries[0].body).toBe('Corrected before delivery.');
    for (const [width, theme] of [
      [1440, 'light'],
      [390, 'dark'],
    ]) {
      await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
      await setTheme(page, theme);
      await page.locator('#receipts').scrollIntoViewIfNeeded();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      await page.screenshot({
        path: `.tmp/explore-spectater/screenshots/queue-controls-${width}-${theme}.png`,
        fullPage: true,
      });
    }
    await page.reload();
    await expect(page.locator('#message')).toContainText('Ready.');
    await page.locator('#export-details > summary').click();
    await expect(page.locator('#export')).toHaveValue(/A follow-up after handoff/);
  } finally {
    await server?.close();
    await f.cleanup();
  }
});

test('What changed compares snapshots and End review preserves read-only history until explicit resume', async ({
  page,
}) => {
  const f = await fixture();
  let server;
  try {
    const review = await openReview(f.options, { directory: f.stateDir });
    server = await startServer(review);
    await page.goto(server.url);
    await expect(page.locator('#message')).toContainText('Ready.');
    await page.locator('#changes > summary').click();
    await expect(page.locator('#changes-note')).toContainText('first source update');
    const changed =
      '# Updated proposal\n\nReview this exact sentence.\n\n<script>window.diffExecuted = true</script>\n';
    await writeFile(f.file, changed);
    await expect(page.locator('#changed-files')).toContainText('proposal.md · changed');
    await page.getByRole('button', { name: 'proposal.md · changed', exact: true }).click();
    await expect(page.locator('#change-diff')).toContainText('-# Fixture proposal');
    await expect(page.locator('#change-diff')).toContainText('+# Updated proposal');
    await expect(page.locator('#change-diff')).toContainText(
      '<script>window.diffExecuted = true</script>',
    );
    expect(await page.evaluate(() => window.diffExecuted)).toBeUndefined();
    await selectSource(page, 'exact');
    await page.locator('#comment').fill('Do not discard this draft.');
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'End review', exact: true }).click();
    await expect(page.locator('#message')).toContainText('unsaved draft');
    await page.getByRole('button', { name: 'Resume draft', exact: true }).click();
    await page.locator('#save').click();
    await expect(page.locator('#comments')).toContainText('Do not discard this draft.');
    await page.locator('#submit').click();
    await expect(page.locator('#message')).toContainText('Batch saved.');
    await expect(page.locator('body')).toHaveAttribute('aria-busy', 'false');
    await page.getByRole('button', { name: 'End review', exact: true }).click();
    await expect(page.locator('#message')).toContainText('Deliver or cancel');
    await page.getByRole('button', { name: 'Cancel batch 1', exact: true }).click();
    await expect(page.locator('body')).toHaveAttribute('aria-busy', 'false');
    await expect(page.locator('#review-lifecycle')).toHaveText('Send & End');
    const run = await register(f, review, server);
    await run(['end', 'example']);
    await expect(page.locator('#listener-status')).toContainText('Review ended');
    await expect(page.locator('#refresh')).toBeDisabled();
    await expect(
      page.locator('#comments').getByRole('button', { name: 'Edit', exact: true }),
    ).toHaveCount(0);
    await page.reload();
    await expect(page.locator('#listener-status')).toContainText('Review ended');
    await expect(page.locator('#comments')).toContainText('Do not discard this draft.');
    await writeFile(f.file, `New source after review ended.\n\n${changed}`);
    await expect(
      page.getByRole('button', { name: /^(End review|Send & End|Resume review)$/ }),
    ).toHaveCount(1);
    await page.getByRole('button', { name: 'Resume review', exact: true }).click();
    await expect(page.locator('#source')).toContainText('New source after review ended.');
    await expect(page.locator('#comments')).toContainText('stale · open');
    await expect(page.locator('#refresh')).toBeEnabled();
    for (const [width, theme] of [
      [1440, 'light'],
      [390, 'dark'],
    ]) {
      await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
      await setTheme(page, theme);
      if (!(await page.locator('#changes').evaluate((el) => el.open)))
        await page.locator('#changes > summary').click();
      await page.getByRole('button', { name: 'proposal.md · changed', exact: true }).click();
      await expect(page.locator('#change-diff')).toContainText('+New source after review ended.');
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      await page.screenshot({
        path: `.tmp/explore-spectater/screenshots/completion-diff-${width}-${theme}.png`,
        fullPage: true,
      });
    }
  } finally {
    await server?.close();
    await f.cleanup();
  }
});
