import { formatGeneratedDate } from '../format';
import { ExportReport } from './export-report-model';

/** Escapes special HTML characters to prevent malformed markup from user-provided content. */
export function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/**
 * Renders a document-style HTML report that mirrors the app's active theme and live diff view.
 * Uses CSS custom properties throughout and embeds the live component DOM when available.
 */
export function renderHtmlReport(report: ExportReport): string {
  const formattedDate = formatGeneratedDate(report.generatedAt);
  const modifiedTotal = report.summary.modified + report.summary.typeChanged;
  const theme = report.theme ?? 'light';

  const settingsRowsHtml = report.settings
    .map(
      (setting) => `        <li class="setting-item">
          <span class="setting-label">${escapeHtml(setting.label)}:</span>
          <span class="setting-value">${escapeHtml(setting.value)}</span>
        </li>`
    )
    .join('\n');

  let changesContentHtml: string;
  if (report.capturedChangesHtml) {
    changesContentHtml = `      <div class="changes-component-wrapper">
${report.capturedChangesHtml}
      </div>`;
  } else if (report.rows.length === 0) {
    changesContentHtml = `      <p class="empty-state">No changes found.</p>`;
  } else {
    const tableRows = report.rows
      .map((row) => {
        let valueHtml: string;
        if (row.changeKind === 'modified' || row.changeKind === 'type-changed') {
          valueHtml = `<span class="val-old"><code>${escapeHtml(row.leftDisplay)}</code></span> <span class="val-arrow">&rarr;</span> <span class="val-new"><code>${escapeHtml(row.rightDisplay)}</code></span>`;
        } else if (row.changeKind === 'added') {
          valueHtml = `<span class="val-new"><code>${escapeHtml(row.rightDisplay)}</code></span>`;
        } else if (row.changeKind === 'removed') {
          valueHtml = `<span class="val-old"><code>${escapeHtml(row.leftDisplay)}</code></span>`;
        } else {
          valueHtml = `<span class="val-unchanged"><code>${escapeHtml(row.leftDisplay)}</code></span>`;
        }

        const badgeHtml = row.arrayMatch ? `<div class="array-match-badge">${escapeHtml(row.arrayMatch.label)}</div>` : '';

        return `        <tr class="diff-row row-${escapeHtml(row.changeKind)}">
          <td class="col-path">
            <code>${escapeHtml(row.path)}</code>
            ${badgeHtml}
          </td>
          <td class="col-type">
            <span class="badge badge-${escapeHtml(row.changeKind)}">${escapeHtml(row.changeKind)}</span>
          </td>
          <td class="col-value">
            ${valueHtml}
          </td>
        </tr>`;
      })
      .join('\n');

    changesContentHtml = `      <table class="diff-table">
        <thead>
          <tr>
            <th class="col-path">Path</th>
            <th class="col-type">Type</th>
            <th class="col-value">Change</th>
          </tr>
        </thead>
        <tbody>
${tableRows}
        </tbody>
      </table>`;
  }

  const additionalCss = report.capturedCss ? `\n/* Live captured styles */\n${report.capturedCss}\n` : '';

  return `<!DOCTYPE html>
<html lang="en" data-theme="${escapeHtml(theme)}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(report.title)}</title>
  <style>
    :root {
      color-scheme: light;
      --sans: Inter, ui-sans-serif, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      --mono: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
      --radius: 4px;
      --background: #f8fafc;
      --foreground: #0f172a;
      --card: #fff;
      --card-foreground: #0f172a;
      --border: #e2e8f0;
      --border-subtle: #edf2f7;
      --border-strong: #cbd5e1;
      --muted: #f1f5f9;
      --muted-foreground: #64748b;
      --subtle-foreground: #64748b;
      --primary: #2563eb;
      --diff-added: #15803d;
      --diff-added-bg: #e6ffed;
      --diff-removed: #dc2626;
      --diff-removed-bg: #ffeef0;
      --diff-modified: #b45309;
      --diff-modified-bg: #fffbeb;
      --json-key: #2563eb;
      --json-string: #15803d;
      --json-number: #7c3aed;
      --json-boolean: #c2410c;
      --json-null: #64748b;
      --json-punctuation: #475569;
    }

    :root[data-theme='dark'] {
      color-scheme: dark;
      --background: #0d1117;
      --foreground: #e6edf3;
      --card: #161b22;
      --card-foreground: #e6edf3;
      --border: #30363d;
      --border-subtle: #21262d;
      --border-strong: #484f58;
      --muted: #161b22;
      --muted-foreground: #8b949e;
      --subtle-foreground: #6e7681;
      --primary: #1f6feb;
      --diff-added: #3fb950;
      --diff-added-bg: #122619;
      --diff-removed: #f85149;
      --diff-removed-bg: #2b1619;
      --diff-modified: #d29922;
      --diff-modified-bg: #261f12;
      --json-key: #79c0ff;
      --json-string: #7ee787;
      --json-number: #d2a8ff;
      --json-boolean: #ff7b72;
      --json-null: #8b949e;
      --json-punctuation: #8b949e;
    }

    *, *::before, *::after {
      box-sizing: border-box;
    }

    body {
      margin: 0;
      padding: 36px 24px;
      background-color: var(--background);
      color: var(--foreground);
      font-family: var(--sans);
      font-size: 14px;
      line-height: 1.5;
    }

    .report-container {
      max-width: 980px;
      margin: 0 auto;
    }

    .report-header {
      margin-bottom: 20px;
    }

    .report-title {
      margin: 0 0 6px;
      font-size: 24px;
      font-weight: 700;
      color: var(--foreground);
      letter-spacing: -0.01em;
    }

    .report-meta {
      margin: 0;
      font-size: 13px;
      color: var(--muted-foreground);
    }

    .section-divider {
      border: 0;
      border-top: 1px solid var(--border);
      margin: 24px 0;
    }

    .report-section {
      margin: 0;
    }

    .section-title {
      margin: 0 0 12px;
      font-size: 15px;
      font-weight: 600;
      color: var(--foreground);
      letter-spacing: -0.005em;
    }

    .settings-list {
      list-style: none;
      margin: 0;
      padding: 0;
      display: flex;
      flex-direction: column;
      gap: 6px;
    }

    .setting-item {
      display: flex;
      align-items: baseline;
      gap: 8px;
      font-size: 13px;
    }

    .setting-label {
      font-weight: 600;
      color: var(--muted-foreground);
      min-width: 220px;
    }

    .setting-value {
      color: var(--foreground);
      font-weight: 500;
      word-break: break-word;
    }

    .summary-chips {
      display: inline-flex;
      flex-wrap: wrap;
      gap: 8px;
      align-items: center;
    }

    .stat-chip {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      border-radius: var(--radius);
      padding: 4px 10px;
      font-size: 12px;
      border: 1px solid transparent;
    }

    .stat-chip b {
      font: 700 13px var(--mono);
      line-height: 1;
    }

    .stat-chip span {
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      opacity: 0.9;
      line-height: 1;
    }

    .stat-chip.total {
      background: var(--muted);
      color: var(--foreground);
      border-color: var(--border);
    }

    .stat-chip.added {
      background: var(--diff-added-bg);
      color: var(--diff-added);
      border-color: color-mix(in srgb, var(--diff-added) 25%, transparent);
    }

    .stat-chip.removed {
      background: var(--diff-removed-bg);
      color: var(--diff-removed);
      border-color: color-mix(in srgb, var(--diff-removed) 25%, transparent);
    }

    .stat-chip.modified {
      background: var(--diff-modified-bg);
      color: var(--diff-modified);
      border-color: color-mix(in srgb, var(--diff-modified) 25%, transparent);
    }

    /* Natural document layout for captured diff view components */
    .changes-component-wrapper {
      margin-top: 12px;
    }

    .changes-component-wrapper app-diff-tree,
    .changes-component-wrapper app-list-diff,
    .changes-component-wrapper app-source-diff {
      display: block !important;
      height: auto !important;
      min-height: auto !important;
    }

    .changes-component-wrapper .tree,
    .changes-component-wrapper .list-container,
    .changes-component-wrapper .source {
      border: 1px solid var(--border);
      border-radius: var(--radius);
      height: auto !important;
      min-height: auto !important;
      overflow: visible !important;
    }

    .changes-component-wrapper .source-scroll {
      height: auto !important;
      min-height: auto !important;
      overflow: visible !important;
    }

    /* Fallback table styles when no live DOM is captured */
    .diff-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 13px;
      border: 1px solid var(--border);
      border-radius: var(--radius);
      background: var(--card);
    }

    .diff-table th {
      text-align: left;
      padding: 8px 12px;
      border-bottom: 1px solid var(--border);
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--muted-foreground);
    }

    .diff-table td {
      padding: 10px 12px;
      border-bottom: 1px solid var(--border-subtle);
      vertical-align: top;
    }

    .diff-table tr:last-child td {
      border-bottom: none;
    }

    .row-added {
      background-color: color-mix(in srgb, var(--diff-added-bg) 60%, transparent);
    }

    .row-removed {
      background-color: color-mix(in srgb, var(--diff-removed-bg) 60%, transparent);
    }

    .row-modified, .row-type-changed {
      background-color: color-mix(in srgb, var(--diff-modified-bg) 60%, transparent);
    }

    .badge {
      display: inline-block;
      padding: 2px 6px;
      border-radius: var(--radius);
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }

    .badge-added {
      background: var(--diff-added-bg);
      color: var(--diff-added);
      border: 1px solid color-mix(in srgb, var(--diff-added) 30%, transparent);
    }

    .badge-removed {
      background: var(--diff-removed-bg);
      color: var(--diff-removed);
      border: 1px solid color-mix(in srgb, var(--diff-removed) 30%, transparent);
    }

    .badge-modified, .badge-type-changed {
      background: var(--diff-modified-bg);
      color: var(--diff-modified);
      border: 1px solid color-mix(in srgb, var(--diff-modified) 30%, transparent);
    }

    .badge-unchanged {
      background: var(--muted);
      color: var(--muted-foreground);
      border: 1px solid var(--border);
    }

    .col-path {
      width: 35%;
    }

    .col-path code {
      color: var(--json-key);
      font-family: var(--mono);
      font-size: 12px;
      word-break: break-all;
    }

    .col-type {
      width: 15%;
    }

    .col-value {
      width: 50%;
    }

    .array-match-badge {
      display: inline-block;
      margin-top: 4px;
      font-size: 11px;
      color: var(--muted-foreground);
      background: var(--muted);
      border-radius: 3px;
      padding: 1px 5px;
    }

    .val-arrow {
      color: var(--muted-foreground);
      margin: 0 4px;
    }

    .val-old code {
      color: var(--diff-removed);
      background: var(--diff-removed-bg);
      padding: 2px 4px;
      border-radius: 3px;
      font-family: var(--mono);
      font-size: 12px;
      word-break: break-word;
      white-space: pre-wrap;
    }

    .val-new code {
      color: var(--diff-added);
      background: var(--diff-added-bg);
      padding: 2px 4px;
      border-radius: 3px;
      font-family: var(--mono);
      font-size: 12px;
      word-break: break-word;
      white-space: pre-wrap;
    }

    .val-unchanged code {
      color: var(--foreground);
      background: var(--muted);
      padding: 2px 4px;
      border-radius: 3px;
      font-family: var(--mono);
      font-size: 12px;
      word-break: break-word;
      white-space: pre-wrap;
    }

    .empty-state {
      margin: 0;
      padding: 16px 0;
      color: var(--muted-foreground);
      font-style: italic;
    }
${additionalCss}
    /* Static document overrides: hide row action kebab triggers and neutralize hover behavior */
    .changes-component-wrapper .row-actions {
      display: none !important;
    }

    .changes-component-wrapper button,
    .changes-component-wrapper [role='button'],
    .changes-component-wrapper .expand,
    .changes-component-wrapper .match-pill,
    .changes-component-wrapper .collapsed-row {
      cursor: default !important;
      pointer-events: none !important;
    }

    .changes-component-wrapper,
    .changes-component-wrapper *,
    .changes-component-wrapper *:hover {
      pointer-events: none;
    }

    .changes-component-wrapper *:hover {
      background: inherit !important;
      color: inherit !important;
      border-color: inherit !important;
      box-shadow: none !important;
    }

    .changes-component-wrapper .diff-row:hover,
    .changes-component-wrapper .list-row:hover,
    .changes-component-wrapper .src-row:hover {
      background: transparent !important;
    }
  </style>
</head>
<body>
  <div class="report-container">
    <header class="report-header">
      <h1 class="report-title">${escapeHtml(report.title)}</h1>
      <p class="report-meta">Generated on ${escapeHtml(formattedDate)}</p>
    </header>

    <hr class="section-divider">

    <section class="report-section" aria-labelledby="settings-heading">
      <h2 id="settings-heading" class="section-title">Comparison Settings</h2>
      <ul class="settings-list">
${settingsRowsHtml}
      </ul>
    </section>

    <hr class="section-divider">

    <section class="report-section" aria-labelledby="summary-heading">
      <h2 id="summary-heading" class="section-title">Summary</h2>
      <div class="summary-chips">
        <span class="stat-chip total">
          <b>${report.summary.totalChanges}</b>
          <span>Total</span>
        </span>
        <span class="stat-chip added">
          <b>+${report.summary.added}</b>
          <span>Added</span>
        </span>
        <span class="stat-chip removed">
          <b>&minus;${report.summary.removed}</b>
          <span>Removed</span>
        </span>
        <span class="stat-chip modified">
          <b>~${modifiedTotal}</b>
          <span>Modified</span>
        </span>
      </div>
    </section>

    <hr class="section-divider">

    <section class="report-section" aria-labelledby="changes-heading">
      <h2 id="changes-heading" class="section-title">Changes</h2>
${changesContentHtml}
    </section>
  </div>
</body>
</html>`;
}
