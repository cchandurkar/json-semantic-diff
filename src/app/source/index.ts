/**
 * Public API of the Source renderer's presentation layer.
 *
 * Framework-free: no Angular imports. Consumes an already-computed `DiffResult`
 * and re-runs no diff logic whatsoever.
 */
export { emitSourceRows, flattenChanges } from './source-emitter';
export { segmentRows, DEFAULT_CONTEXT_LINES } from './source-segments';
export type { SourceCell, SourceDiffRow, SourceRole, SourceSegment } from './source-model';
