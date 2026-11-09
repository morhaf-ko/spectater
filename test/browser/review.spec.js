import { test, expect } from '@playwright/test';
import { readFile, writeFile, mkdir, access } from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fixture, sample } from '../helpers.js';
import { openReview } from '../../src/review.js';
import { startServer } from '../../src/server.js';
import { launchFixture } from '../../scripts/cli-fixture.js';

async function selectSource(page, text) {
  await page.getByRole('button', { name: 'Source', exact: true }).click();
  await page.locator('#source').evaluate((el, quote) => {
    const textNode = el.firstChild;
    const start = textNode.data.indexOf(quote);
    if (start < 0) throw new Error('Fixture selection missing.');
    const range = document.createRange(); range.setStart(textNode, start); range.setEnd(textNode, start + quote.length);
    window.getSelection().removeAllRanges(); window.getSelection().addRange(range);
    document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
  }, text);
}

test('read, select, comment, submit, CLI retrieve, revise, refresh and restart', async ({ page, browser }) => {
  const f = await fixture();
  let server;
  try {
    const review = await openReview(f.options, { directory: f.stateDir });
    server = await startServer(review);
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
    const batchId = review.state.batches[0].id;
    const cli = await promisify(execFile)(process.execPath, ['bin/spectater.js', 'feedback', '--review', review.state.reviewId, '--batch', batchId], { env: { ...process.env, SPECTATER_STATE_DIR: f.stateDir, SPECTATER_CONFIG: f.configFile } });
    expect(cli.stdout).toContain('Explain the exactness contract.');
    expect(cli.stdout).toBe(await page.locator('#export').inputValue());
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
    await server.close(); server = null;
    const restarted = await openReview(f.options, { directory: f.stateDir });
    server = await startServer(restarted);
    await page.goto(server.url);
    await expect(page.locator('#comments')).toContainText('Explain the exactness contract.');
    await page.getByRole('button', { name: 'Batch 1 · 1 comments' }).click();
    await expect(page.locator('#export')).toHaveValue(cli.stdout);
    console.log(`Browser vertical slice: ${browser.version()}; canonical writes limited to two explicit fixture revisions.`);
  } finally { await server?.close(); await f.cleanup(); }
});

test('rendered precision, source fallback, Unicode/CRLF, inert Markdown and clipboard fallback', async ({ page }) => {
  const source = '# Selection fixture\r\n\r\nPlain text with **bold words**.\r\n\r\nA &amp; B\r\n\r\n😀 Unicode stays exact.\r\n\r\n- [x] Checked task\r\n\r\n| Name | Value |\r\n| --- | --- |\r\n| Cell | Text |\r\n\r\n<script>window.executed = true</script>\r\n\r\n![remote](https://example.org/remote.png)\r\n';
  const f = await fixture(source);
  let server;
  try {
    const review = await openReview(f.options, { directory: f.stateDir }); server = await startServer(review);
    const external = [];
    page.on('request', request => { if (!request.url().startsWith(server.origin)) external.push(request.url()); });
    await page.addInitScript(() => Object.defineProperty(navigator, 'clipboard', { value: { writeText: async () => { throw new Error('denied'); } } }));
    await page.goto(server.url); await expect(page.locator('#message')).toContainText('Ready.');
    expect(await page.evaluate(() => window.executed)).toBeUndefined();
    await expect(page.locator('#rendered table')).toBeVisible();
    async function selectRendered(text, from = 0, to = text.length) {
      await page.locator('#rendered [data-start]').filter({ hasText: text }).first().evaluate((el, offsets) => {
        const range = document.createRange(); range.setStart(el.firstChild, offsets[0]); range.setEnd(el.firstChild, offsets[1]);
        window.getSelection().removeAllRanges(); window.getSelection().addRange(range); document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
      }, [from, to]);
    }
    await selectRendered('bold words'); await expect(page.locator('#selection')).toContainText('Exact source');
    await page.locator('#comment').fill('Rendered emphasis.'); await page.locator('#save').click();
    await expect(page.locator('#comments')).toContainText('Rendered emphasis.');
    await selectRendered('A & B', 2, 3); await expect(page.locator('#selection')).toContainText('Enclosing source span');
    await page.locator('#comment').fill('Entity selection.'); await page.locator('#save').click();
    await expect(page.locator('#comments')).toContainText('Entity selection.');
    expect(review.state.comments[1].slice).toBe('A &amp; B');
    await page.locator('#rendered').evaluate(el => {
      const p = el.querySelector('p'); const range = document.createRange(); range.selectNodeContents(p);
      window.getSelection().removeAllRanges(); window.getSelection().addRange(range); document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    });
    await expect(page.locator('#selection')).toContainText('crosses rendered spans'); await expect(page.locator('#save')).toBeDisabled();
    await selectSource(page, '😀 Unicode'); await page.locator('#comment').fill('Unicode source.'); await page.locator('#save').click();
    await expect(page.locator('#comments')).toContainText('Unicode source.');
    expect(review.state.comments[2].slice).toBe('😀 Unicode');
    expect(review.state.comments[2].start).toBe(source.indexOf('😀 Unicode'));
    await page.locator('#submit').click(); await expect(page.locator('#message')).toContainText('Batch saved.');
    await page.locator('#copy').click(); await expect(page.locator('#message')).toContainText('Clipboard unavailable.');
    const downloaded = page.waitForEvent('download'); await page.locator('#download').click();
    expect((await downloaded).suggestedFilename()).toBe('spectater-feedback.md');
    expect(external).toEqual([]); expect(await readFile(f.file, 'utf8')).toBe(source);
  } finally { await server?.close(); await f.cleanup(); }
});

test('document reader desktop/mobile states and configured source default', async ({ page }) => {
  const source = await readFile(new URL('../../openspec/changes/local-change-review/proposal.md', import.meta.url), 'utf8');
  const f = await fixture(source);
  let server;
  try {
    const review = await openReview({ ...f.options, defaultView: 'source' }, { directory: f.stateDir }); server = await startServer(review);
    await page.goto(server.url); await expect(page.locator('#source')).toBeVisible();
    await page.getByLabel('Theme', { exact: true }).selectOption('light');
    const dir = '.tmp/explore-spectater/screenshots'; await mkdir(dir, { recursive: true });
    await expect(page.locator('#source-lines')).toContainText('1\n2\n3');
    await page.screenshot({ path: `${dir}/desktop-source.png` });
    await page.getByRole('button', { name: 'Rendered', exact: true }).click();
    await expect(page.locator('#rendered h1')).toHaveText('Proposal');
    for (const theme of ['light', 'dark']) {
      await page.getByLabel('Theme', { exact: true }).selectOption(theme);
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      await page.screenshot({ path: `${dir}/desktop-${theme}.png`, fullPage: true });
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    expect(await page.locator('header').count()).toBe(1);
    for (const theme of ['light', 'dark']) {
      await page.getByLabel('Theme', { exact: true }).selectOption(theme);
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      await page.screenshot({ path: `${dir}/mobile-${theme}.png` });
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.locator('aside').scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${dir}/mobile-feedback.png` });
    await page.keyboard.press('Tab');
    expect(await page.evaluate(() => getComputedStyle(document.activeElement).outlineStyle)).not.toBe('none');
  } finally { await server?.close(); await f.cleanup(); }
});

test('system theme follows OS changes; manual choices persist without losing a draft', async ({ page }) => {
  const f = await fixture();
  let server;
  try {
    const review = await openReview(f.options, { directory: f.stateDir }); server = await startServer(review);
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.goto(server.url);
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await expect(page.getByLabel('Theme', { exact: true })).toHaveValue('system');
    await page.emulateMedia({ colorScheme: 'light' });
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    await selectSource(page, 'exact sentence');
    await page.locator('#comment').fill('Draft survives theme changes.');
    await page.getByLabel('Theme', { exact: true }).selectOption('dark');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await expect(page.locator('#comment')).toHaveValue('Draft survives theme changes.');
    await expect(page.locator('#save')).toBeEnabled();
    await page.locator('#save').click(); await expect(page.locator('#comments')).toContainText('Draft survives theme changes.');
    await page.reload();
    await expect(page.getByLabel('Theme', { exact: true })).toHaveValue('dark');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await page.getByLabel('Theme', { exact: true }).selectOption('light');
    await page.emulateMedia({ colorScheme: 'dark' });
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    await page.getByLabel('Theme', { exact: true }).selectOption('system');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await page.emulateMedia({ colorScheme: 'light' });
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  } finally { await server?.close(); await f.cleanup(); }
});

test('theme still works when browser preference storage is unavailable', async ({ page }) => {
  const f = await fixture(); let server;
  try {
    const review = await openReview(f.options, { directory: f.stateDir }); server = await startServer(review);
    await page.addInitScript(() => Object.defineProperty(window, 'localStorage', { get() { throw new Error('storage denied'); } }));
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.goto(server.url);
    await expect(page.locator('#message')).toContainText('Ready.');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await page.getByLabel('Theme', { exact: true }).selectOption('light');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  } finally { await server?.close(); await f.cleanup(); }
});

test('CLI config and no-open defaults survive a forced macOS opener failure', async ({ page }) => {
  test.skip(process.platform !== 'darwin', 'macOS opener contract');
  const f = await fixture();
  const tools = path.join(f.directory, 'tools'); await mkdir(tools);
  const marker = path.join(f.directory, 'opener-called');
  await writeFile(path.join(tools, 'open'), '#!/usr/bin/env bun\nawait Bun.write(process.env.SPECTATER_OPENER_MARKER, "called");\nprocess.exit(1);\n', { mode: 0o700 });
  const env = { PATH: `${tools}:${process.env.PATH}`, SPECTATER_OPENER_MARKER: marker };
  let cli;
  try {
    await writeFile(f.configFile, '{"defaultView":"source","openBrowser":false}');
    cli = await launchFixture('bin/spectater.js', f, { noOpen: false, env });
    await page.goto(cli.url); await expect(page.locator('#source')).toBeVisible();
    expect(cli.errors).toBe(''); await expect(access(marker)).rejects.toThrow();
    await cli.close(); cli = null;
    await writeFile(f.configFile, '{}');
    cli = await launchFixture('bin/spectater.js', f, { noOpen: false, env });
    await expect.poll(() => cli.errors).toContain('Browser opening failed');
    await page.goto(cli.url); await expect(page.locator('#message')).toContainText('Ready.');
    expect(await readFile(marker, 'utf8')).toBe('called');
    await cli.close(); cli = null;
    cli = await launchFixture('bin/spectater.js', f, { noOpen: true, env });
    await page.goto(cli.url); await expect(page.locator('#message')).toContainText('Ready.');
    expect(cli.errors).toBe('');
  } finally { await cli?.close(); await f.cleanup(); }
});
