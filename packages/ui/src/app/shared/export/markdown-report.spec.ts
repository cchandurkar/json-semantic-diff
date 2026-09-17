import { describe, expect, it } from 'vitest';
import { DEFAULT_DIFF_OPTIONS, DiffResult, diffJson } from 'json-semantic-diff';
import { DIFF_EXAMPLES } from '../../examples/diff-examples';
import { buildExportReport } from './export-report-model';
import { formatMarkdownTableCell, renderMarkdownReport } from './markdown-report';

describe('markdown-report', () => {
  describe('formatMarkdownTableCell', () => {
    it('escapes pipes, backticks, and collapses newlines into spaces', () => {
      const input = 'foo | bar\n`baz`';
      expect(formatMarkdownTableCell(input)).toBe('`foo \\| bar \\`baz\\``');
    });
  });

  describe('renderMarkdownReport', () => {
    it('renders standard Markdown header with title and generated date', () => {
      const left = { id: 1 };
      const right = { id: 2 };
      const result: DiffResult = diffJson(left, right, DEFAULT_DIFF_OPTIONS);
      const fixedDate = new Date('2026-09-16T15:30:00Z');
      const report = buildExportReport(result, DEFAULT_DIFF_OPTIONS, true, fixedDate);

      const md = renderMarkdownReport(report);

      expect(md).toContain('# JSON Semantic Diff Report');
      expect(md).toContain('*Generated on');
    });

    it('renders comparison settings as markdown bullet list', () => {
      const left = { id: 1 };
      const right = { id: 2 };
      const result: DiffResult = diffJson(left, right, DEFAULT_DIFF_OPTIONS);
      const report = buildExportReport(result, DEFAULT_DIFF_OPTIONS, true);

      const md = renderMarkdownReport(report);

      expect(md).toContain('## Comparison Settings');
      expect(md).toContain('- **Normalize timestamps**: Enabled');
      expect(md).toContain('- **Numeric strings as numbers**: Disabled');
      expect(md).toContain('- **Treat null and missing as equal**: Disabled');
      expect(md).toContain('- **Ignore paths**: None');
      expect(md).toContain('- **Array matching**: Auto');
    });

    it('renders section separators using Markdown horizontal rules', () => {
      const left = { id: 1 };
      const right = { id: 2 };
      const result: DiffResult = diffJson(left, right, DEFAULT_DIFF_OPTIONS);
      const report = buildExportReport(result, DEFAULT_DIFF_OPTIONS, true);

      const md = renderMarkdownReport(report);

      expect(md).toContain('\n---\n');
    });

    it('renders summary counts matching analysis panel in a compact inline line', () => {
      const left = { a: 1, b: 2, c: 3 };
      const right = { a: 1, b: 99, d: 4 }; // b modified, c removed, d added
      const result: DiffResult = diffJson(left, right, DEFAULT_DIFF_OPTIONS);
      const report = buildExportReport(result, DEFAULT_DIFF_OPTIONS, true);

      const md = renderMarkdownReport(report);

      expect(md).toContain('## Summary');
      expect(md).toContain('**Total changes**: 3 · **Added**: +1 · **Removed**: −1 · **Modified**: ~1');
    });

    it('renders changes as a 4-column Markdown table: Path | Type | Original | Changed', () => {
      const left = { removedField: 'old', modifiedField: 'before' };
      const right = { addedField: 'new', modifiedField: 'after' };
      const result: DiffResult = diffJson(left, right, DEFAULT_DIFF_OPTIONS);
      const report = buildExportReport(result, DEFAULT_DIFF_OPTIONS, true);

      const md = renderMarkdownReport(report);

      expect(md).toContain('## Changes');
      expect(md).toContain('| Path | Type | Original | Changed |');
      expect(md).toContain('| ---------------------------------------- | --- | --- | --- |');
      expect(md).toContain('| `$.addedField` | added | — | `"new"` |');
      expect(md).toContain('| `$.removedField` | removed | `"old"` | — |');
      expect(md).toContain('| `$.modifiedField` | modified | `"before"` | `"after"` |');
    });

    it('renders unchanged rows with both Original and Changed populated when changesOnly is false', () => {
      const left = { same: 'value', changed: 1 };
      const right = { same: 'value', changed: 2 };
      const result: DiffResult = diffJson(left, right, DEFAULT_DIFF_OPTIONS);
      const report = buildExportReport(result, DEFAULT_DIFF_OPTIONS, false);

      const md = renderMarkdownReport(report);

      expect(md).toContain('| `$.same` | unchanged | `"value"` | `"value"` |');
      expect(md).toContain('| `$.changed` | modified | `1` | `2` |');
    });

    it('escapes pipe characters and collapses newlines in table cells to maintain valid 4-column syntax', () => {
      const left = { 'pipe|field': 'value|with|pipe\nand newline' };
      const right = { 'pipe|field': 'value|with|pipe\nand newline\nmodified' };
      const result: DiffResult = diffJson(left, right, DEFAULT_DIFF_OPTIONS);
      const report = buildExportReport(result, DEFAULT_DIFF_OPTIONS, true);

      const md = renderMarkdownReport(report);

      expect(md).toContain(
        '| `$.pipe\\|field` | modified | `"value\\|with\\|pipe and newline"` | `"value\\|with\\|pipe and newline modified"` |'
      );

      const tableLines = md.split('\n').filter((l) => l.startsWith('|'));
      expect(tableLines.length).toBeGreaterThanOrEqual(3);
      for (const line of tableLines) {
        // Exactly 4 columns bounded by 5 unescaped pipes
        const unescapedPipes = line.match(/(?<!\\)\|/g);
        expect(unescapedPipes?.length).toBe(5);
      }
    });

    it('renders empty-diff sensibly when no changes exist', () => {
      const left = { same: 'value' };
      const right = { same: 'value' };
      const result: DiffResult = diffJson(left, right, DEFAULT_DIFF_OPTIONS);
      const report = buildExportReport(result, DEFAULT_DIFF_OPTIONS, true);

      const md = renderMarkdownReport(report);

      expect(md).toContain('No changes found.');
      expect(md).not.toContain('| Path | Type |');
    });

    it('does not include an Array Match column, even when array-match badges are present', () => {
      const example = DIFF_EXAMPLES.find((e) => e.id === 'inventory-by-store')!;
      const result: DiffResult = diffJson(example.original, example.changed, DEFAULT_DIFF_OPTIONS);
      const report = buildExportReport(result, DEFAULT_DIFF_OPTIONS, true);

      const md = renderMarkdownReport(report);

      expect(md).not.toContain('Array Match');
      expect(md).not.toMatch(/Matched by/);

      const tableLines = md.split('\n').filter((l) => l.startsWith('|'));
      for (const line of tableLines) {
        const unescapedPipes = line.match(/(?<!\\)\|/g);
        expect(unescapedPipes?.length).toBe(5);
      }
    });
  });
});
