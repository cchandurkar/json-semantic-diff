/**
 * Browser-only file download utility.
 * Triggers a download by generating an Object URL for a Blob and simulating a link click.
 * Safely guards against invocation in server-side/prerendering environments.
 */
export function downloadFile(filename: string, content: string, mimeType: string): void {
  if (typeof document === 'undefined' || typeof window === 'undefined') {
    return;
  }

  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}
