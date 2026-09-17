import { describe, expect, it } from 'vitest';
import { DEFAULT_DIFF_OPTIONS, DiffResult, diffJson } from 'json-semantic-diff';
import { buildExportReport } from './export-report-model';
import { escapeHtml, renderHtmlReport } from './html-report';

describe('html-report', () => {
  describe('escapeHtml', () => {
    it('escapes &, <, >, ", and \' characters', () => {
      expect(escapeHtml('foo & bar <baz> "qux" \'quux\'')).toBe('foo &amp; bar &lt;baz&gt; &quot;qux&quot; &#39;quux&#39;');
    });

    it('returns empty string unmodified', () => {
      expect(escapeHtml('')).toBe('');
    });
  });

  describe('renderHtmlReport', () => {
    it('renders a self-contained HTML document with doctype and embedded style', () => {
      const left = { id: 1 };
      const right = { id: 2 };
      const result: DiffResult = diffJson(left, right, DEFAULT_DIFF_OPTIONS);
      const report = buildExportReport(result, DEFAULT_DIFF_OPTIONS, true, new Date('2026-09-16T12:00:00Z'));

      const html = renderHtmlReport(report);

      expect(html).toContain('<!DOCTYPE html>');
      expect(html).toContain('<style>');
      expect(html).toContain('</style>');
      expect(html).toContain('<h1 class="report-title">JSON Semantic Diff Report</h1>');
      expect(html).toContain('Generated on');
    });

    it('supports light and dark theme on the root html element', () => {
      const left = { id: 1 };
      const right = { id: 2 };
      const result: DiffResult = diffJson(left, right, DEFAULT_DIFF_OPTIONS);

      const lightReport = buildExportReport(result, DEFAULT_DIFF_OPTIONS, true, new Date(), 'light');
      const lightHtml = renderHtmlReport(lightReport);
      expect(lightHtml).toContain('<html lang="en" data-theme="light">');

      const darkReport = buildExportReport(result, DEFAULT_DIFF_OPTIONS, true, new Date(), 'dark');
      const darkHtml = renderHtmlReport(darkReport);
      expect(darkHtml).toContain('<html lang="en" data-theme="dark">');
    });

    it('renders document feel with horizontal line dividers instead of boxy sections', () => {
      const left = { id: 1 };
      const right = { id: 2 };
      const result: DiffResult = diffJson(left, right, DEFAULT_DIFF_OPTIONS);
      const report = buildExportReport(result, DEFAULT_DIFF_OPTIONS, true);

      const html = renderHtmlReport(report);

      expect(html).toContain('<hr class="section-divider">');
      expect(html).not.toContain('<div class="section">');
    });

    it('renders comparison settings as a single-column list', () => {
      const left = { id: 1 };
      const right = { id: 2 };
      const result: DiffResult = diffJson(left, right, DEFAULT_DIFF_OPTIONS);
      const report = buildExportReport(result, DEFAULT_DIFF_OPTIONS, true);

      const html = renderHtmlReport(report);

      expect(html).toContain('Comparison Settings');
      expect(html).toContain('<ul class="settings-list">');
      expect(html).toContain('<li class="setting-item">');
      expect(html).toContain('Normalize timestamps');
      expect(html).toContain('Numeric strings as numbers');
      expect(html).toContain('Treat null and missing as equal');
      expect(html).toContain('Ignore paths');
      expect(html).toContain('Array matching');
    });

    it('renders compact summary chips mirroring app language', () => {
      const left = { a: 1, b: 2, c: 3 };
      const right = { a: 1, b: 99, d: 4 }; // b modified, c removed, d added
      const result: DiffResult = diffJson(left, right, DEFAULT_DIFF_OPTIONS);
      const report = buildExportReport(result, DEFAULT_DIFF_OPTIONS, true);

      const html = renderHtmlReport(report);

      expect(html).toContain('<div class="summary-chips">');
      expect(html).toContain('<b>3</b>'); // total
      expect(html).toContain('<b>+1</b>'); // added
      expect(html).toContain('<b>&minus;1</b>'); // removed
      expect(html).toContain('<b>~1</b>'); // modified
    });

    it('embeds live captured diff-view component HTML and CSS when provided', () => {
      const left = { id: 1 };
      const right = { id: 2 };
      const result: DiffResult = diffJson(left, right, DEFAULT_DIFF_OPTIONS);
      const mockComponentHtml = '<app-diff-tree class="mock-tree"><div class="row">Mock row</div></app-diff-tree>';
      const mockCss = '.mock-tree { display: block; }';
      const report = buildExportReport(result, DEFAULT_DIFF_OPTIONS, true, new Date(), 'dark', mockComponentHtml, mockCss);

      const html = renderHtmlReport(report);

      expect(html).toContain('<div class="changes-component-wrapper">');
      expect(html).toContain(mockComponentHtml);
      expect(html).toContain(mockCss);
    });

    it('falls back to semantic rows when no live component DOM is captured', () => {
      const left = { removedField: 'old', modifiedField: 'before' };
      const right = { addedField: 'new', modifiedField: 'after' };
      const result: DiffResult = diffJson(left, right, DEFAULT_DIFF_OPTIONS);
      const report = buildExportReport(result, DEFAULT_DIFF_OPTIONS, true);

      const html = renderHtmlReport(report);

      expect(html).toContain('row-added');
      expect(html).toContain('badge-added');
      expect(html).toContain('row-removed');
      expect(html).toContain('badge-removed');
      expect(html).toContain('row-modified');
      expect(html).toContain('badge-modified');
    });

    it('renders empty-diff sensibly when no changes exist and no captured DOM is passed', () => {
      const left = { same: 'value' };
      const right = { same: 'value' };
      const result: DiffResult = diffJson(left, right, DEFAULT_DIFF_OPTIONS);
      const report = buildExportReport(result, DEFAULT_DIFF_OPTIONS, true);

      const html = renderHtmlReport(report);

      expect(html).toContain('No changes found.');
      expect(html).not.toContain('<table class="diff-table">');
    });

    it('escapes special characters in paths and values to prevent injection/broken markup', () => {
      const left = { '<unsafe>': '<script>alert(1)</script>' };
      const right = { '<unsafe>': '<b>Safe & Sound</b>' };
      const result: DiffResult = diffJson(left, right, DEFAULT_DIFF_OPTIONS);
      const report = buildExportReport(result, DEFAULT_DIFF_OPTIONS, true);

      const html = renderHtmlReport(report);

      expect(html).not.toContain('<script>');
      expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
      expect(html).toContain('&lt;b&gt;Safe &amp; Sound&lt;/b&gt;');
    });

    it('includes static document overrides hiding row-action triggers and neutralizing hover behavior', () => {
      const left = { id: 1 };
      const right = { id: 2 };
      const result: DiffResult = diffJson(left, right, DEFAULT_DIFF_OPTIONS);
      const report = buildExportReport(
        result,
        DEFAULT_DIFF_OPTIONS,
        true,
        new Date(),
        'light',
        '<app-diff-tree><button class="row-actions">...</button></app-diff-tree>',
        '.captured { color: blue; }'
      );

      const html = renderHtmlReport(report);

      expect(html).toContain('.changes-component-wrapper .row-actions');
      expect(html).toContain('display: none !important');
      expect(html).toContain('pointer-events: none');
    });
  });
});
