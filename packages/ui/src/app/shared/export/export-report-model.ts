import { DiffOptions, DiffResult, DiffSummary } from 'json-semantic-diff';
import { ListDiffRow, buildListRows } from '../../components/list-diff/list-view-model';

export interface ExportSettingItem {
  readonly label: string;
  readonly value: string;
}

export interface ExportReport {
  readonly title: string;
  readonly generatedAt: Date;
  readonly settings: ExportSettingItem[];
  readonly summary: DiffSummary;
  readonly rows: ListDiffRow[];
  readonly changesOnly: boolean;
  readonly theme?: 'light' | 'dark';
  readonly capturedChangesHtml?: string;
  readonly capturedCss?: string;
}

/** Formats DiffOptions into human-readable label/value pairs matching sidebar wording. */
export function formatSettingsSummary(options: DiffOptions): ExportSettingItem[] {
  const items: ExportSettingItem[] = [];

  items.push({
    label: 'Normalize timestamps',
    value: options.normalizeTimestamps ? 'Enabled' : 'Disabled'
  });

  items.push({
    label: 'Numeric strings as numbers',
    value: options.numericStringsAsNumbers ? 'Enabled' : 'Disabled'
  });

  items.push({
    label: 'Treat null and missing as equal',
    value: options.nullEqualsMissing ? 'Enabled' : 'Disabled'
  });

  const ignoreCount = options.ignorePaths?.length ?? 0;
  items.push({
    label: 'Ignore paths',
    value: ignoreCount > 0 ? options.ignorePaths.join(', ') : 'None'
  });

  const overrides = options.arrayMatching ? Object.entries(options.arrayMatching) : [];
  let arrayMatchingVal = 'Auto';
  if (overrides.length > 0) {
    arrayMatchingVal = overrides
      .map(([path, override]) => {
        if (override.strategy === 'key') {
          const fields = override.fields?.length ? ` (${override.fields.join(', ')})` : '';
          return `${path}: Match by fields${fields}`;
        }
        if (override.strategy === 'position') {
          return `${path}: Position`;
        }
        return `${path}: Auto`;
      })
      .join('; ');
  }
  items.push({
    label: 'Array matching',
    value: arrayMatchingVal
  });

  return items;
}

/** Assembles the full export report from diff result, options, and view filter state. */
export function buildExportReport(
  result: DiffResult,
  options: DiffOptions,
  changesOnly: boolean,
  generatedAt: Date = new Date(),
  theme?: 'light' | 'dark',
  capturedChangesHtml?: string,
  capturedCss?: string
): ExportReport {
  return {
    title: 'JSON Semantic Diff Report',
    generatedAt,
    settings: formatSettingsSummary(options),
    summary: result.summary,
    rows: buildListRows(result.root, changesOnly),
    changesOnly,
    theme,
    capturedChangesHtml,
    capturedCss
  };
}

/** Formats a timestamp into a consistent report export filename e.g. diff-report-2026-09-16-1545.html */
export function formatReportFilename(date: Date, ext: 'html' | 'md'): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  const yyyy = date.getFullYear();
  const mm = pad(date.getMonth() + 1);
  const dd = pad(date.getDate());
  const hh = pad(date.getHours());
  const min = pad(date.getMinutes());
  return `diff-report-${yyyy}-${mm}-${dd}-${hh}${min}.${ext}`;
}
