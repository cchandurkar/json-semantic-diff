import { describe, expect, it } from 'vitest';
import { DEFAULT_DIFF_OPTIONS, DiffOptions, DiffResult, diffJson } from 'json-semantic-diff';
import { buildExportReport, formatReportFilename, formatSettingsSummary } from './export-report-model';

describe('export-report-model', () => {
  describe('formatSettingsSummary', () => {
    it('formats default options correctly', () => {
      const summary = formatSettingsSummary(DEFAULT_DIFF_OPTIONS);

      expect(summary).toEqual([
        { label: 'Normalize timestamps', value: 'Enabled' },
        { label: 'Numeric strings as numbers', value: 'Disabled' },
        { label: 'Treat null and missing as equal', value: 'Disabled' },
        { label: 'Ignore paths', value: 'None' },
        { label: 'Array matching', value: 'Auto' }
      ]);
    });

    it('formats customized options with flipped toggles', () => {
      const options: DiffOptions = {
        normalizeTimestamps: false,
        numericStringsAsNumbers: true,
        nullEqualsMissing: true,
        ignorePaths: []
      };

      const summary = formatSettingsSummary(options);

      expect(summary).toEqual([
        { label: 'Normalize timestamps', value: 'Disabled' },
        { label: 'Numeric strings as numbers', value: 'Enabled' },
        { label: 'Treat null and missing as equal', value: 'Enabled' },
        { label: 'Ignore paths', value: 'None' },
        { label: 'Array matching', value: 'Auto' }
      ]);
    });

    it('formats customized ignore paths correctly', () => {
      const options: DiffOptions = {
        ...DEFAULT_DIFF_OPTIONS,
        ignorePaths: ['$.metadata.id', '$.users[*].token']
      };

      const summary = formatSettingsSummary(options);
      const ignoreSetting = summary.find((s) => s.label === 'Ignore paths');

      expect(ignoreSetting?.value).toBe('$.metadata.id, $.users[*].token');
    });

    it('formats array matching overrides with key, position, and auto strategies', () => {
      const options: DiffOptions = {
        ...DEFAULT_DIFF_OPTIONS,
        arrayMatching: {
          '$.users': { strategy: 'key', fields: ['id', 'orgId'] },
          '$.tags': { strategy: 'position' },
          '$.history': { strategy: 'auto' }
        }
      };

      const summary = formatSettingsSummary(options);
      const arraySetting = summary.find((s) => s.label === 'Array matching');

      expect(arraySetting?.value).toBe('$.users: Match by fields (id, orgId); $.tags: Position; $.history: Auto');
    });
  });

  describe('buildExportReport', () => {
    it('assembles report with flat rows when diff has changes', () => {
      const left = { name: 'Alice', age: 30 };
      const right = { name: 'Alice', age: 31, city: 'Paris' };
      const result: DiffResult = diffJson(left, right, DEFAULT_DIFF_OPTIONS);
      const fixedDate = new Date('2026-09-16T14:30:00Z');

      const report = buildExportReport(result, DEFAULT_DIFF_OPTIONS, true, fixedDate);

      expect(report.title).toBe('JSON Semantic Diff Report');
      expect(report.generatedAt).toBe(fixedDate);
      expect(report.summary.totalChanges).toBe(2); // age modified, city added
      expect(report.rows.length).toBe(2);
      expect(report.changesOnly).toBe(true);
      expect(report.settings.length).toBe(5);
    });

    it('handles empty-diff edge case with changesOnly = true', () => {
      const left = { id: 1, name: 'Same' };
      const right = { id: 1, name: 'Same' };
      const result: DiffResult = diffJson(left, right, DEFAULT_DIFF_OPTIONS);

      const report = buildExportReport(result, DEFAULT_DIFF_OPTIONS, true);

      expect(report.summary.totalChanges).toBe(0);
      expect(report.rows).toEqual([]);
    });

    it('handles unchanged diff with changesOnly = false', () => {
      const left = { id: 1, name: 'Same' };
      const right = { id: 1, name: 'Same' };
      const result: DiffResult = diffJson(left, right, DEFAULT_DIFF_OPTIONS);

      const report = buildExportReport(result, DEFAULT_DIFF_OPTIONS, false);

      expect(report.summary.totalChanges).toBe(0);
      expect(report.rows.length).toBe(2);
      expect(report.rows[0].changeKind).toBe('unchanged');
      expect(report.rows[1].changeKind).toBe('unchanged');
    });
  });

  describe('formatReportFilename', () => {
    it('formats filename with padded timestamp and extension', () => {
      const date = new Date(2026, 8, 16, 9, 5); // Sept 16 2026, 09:05
      expect(formatReportFilename(date, 'html')).toBe('diff-report-2026-09-16-0905.html');
      expect(formatReportFilename(date, 'md')).toBe('diff-report-2026-09-16-0905.md');
    });
  });
});
