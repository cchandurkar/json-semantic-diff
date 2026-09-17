import { formatGeneratedDate } from '../format';
import { ExportReport } from './export-report-model';

/**
 * Sanitizes a string for safe inline code formatting inside a Markdown table cell:
 * - Collapses newlines to spaces so table rows don't break.
 * - Escapes pipe (|) characters to \| so column boundaries remain intact.
 * - Escapes backticks so code spans don't break.
 */
export function formatMarkdownTableCell(text: string): string {
  const singleLine = text.replace(/\r?\n/g, ' ');
  const safePipes = singleLine.replace(/\|/g, '\\|');
  const safeBackticks = safePipes.replace(/`/g, '\\`');
  return `\`${safeBackticks}\``;
}

/**
 * Renders a document-style Markdown report with section dividers (---):
 * (1) Title and generated date
 * (2) Comparison settings list (single column)
 * (3) Summary metrics (compact inline line)
 * (4) Diff changes table: Path | Type | Original | Changed
 */
export function renderMarkdownReport(report: ExportReport): string {
  const formattedDate = formatGeneratedDate(report.generatedAt);
  const modifiedTotal = report.summary.modified + report.summary.typeChanged;

  const lines: string[] = [`# ${report.title}`, '', `*Generated on ${formattedDate}*`, '', '---', '', '## Comparison Settings', ''];

  for (const setting of report.settings) {
    lines.push(`- **${setting.label}**: ${setting.value}`);
  }

  lines.push(
    '',
    '---',
    '',
    '## Summary',
    '',
    `**Total changes**: ${report.summary.totalChanges} · **Added**: +${report.summary.added} · **Removed**: −${report.summary.removed} · **Modified**: ~${modifiedTotal}`,
    '',
    '---',
    '',
    '## Changes',
    ''
  );

  if (report.rows.length === 0) {
    lines.push('No changes found.');
  } else {
    lines.push('| Path | Type | Original | Changed |');
    lines.push('| ---------------------------------------- | --- | --- | --- |');

    for (const row of report.rows) {
      const pathCell = formatMarkdownTableCell(row.path);
      const typeCell = row.changeKind;

      let originalCell: string;
      let changedCell: string;

      if (row.changeKind === 'added') {
        originalCell = '—';
        changedCell = formatMarkdownTableCell(row.rightDisplay);
      } else if (row.changeKind === 'removed') {
        originalCell = formatMarkdownTableCell(row.leftDisplay);
        changedCell = '—';
      } else if (row.changeKind === 'modified' || row.changeKind === 'type-changed') {
        originalCell = formatMarkdownTableCell(row.leftDisplay);
        changedCell = formatMarkdownTableCell(row.rightDisplay);
      } else {
        originalCell = formatMarkdownTableCell(row.leftDisplay);
        changedCell = formatMarkdownTableCell(row.rightDisplay);
      }

      lines.push(`| ${pathCell} | ${typeCell} | ${originalCell} | ${changedCell} |`);
    }
  }

  lines.push('');
  return lines.join('\n');
}
