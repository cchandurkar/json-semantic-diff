import { describe, expect, it } from 'vitest';
import {
  ANALYSIS_PANEL_COLLAPSED_STORAGE_KEY,
  ANALYSIS_PANEL_WIDTH_STORAGE_KEY,
  clampWidth,
  parsePanelWidth,
  readStoredAnalysisPanelCollapsed,
  readStoredAnalysisPanelWidth,
  storeAnalysisPanelCollapsed,
  storeAnalysisPanelWidth
} from './resizable-panel';

describe('clampWidth', () => {
  it('passes values already inside the range through unchanged', () => {
    expect(clampWidth(300, 260, 480)).toBe(300);
  });

  it('clamps values below the minimum up to the minimum', () => {
    expect(clampWidth(100, 260, 480)).toBe(260);
  });

  it('clamps values above the maximum down to the maximum', () => {
    expect(clampWidth(900, 260, 480)).toBe(480);
  });

  it('is inclusive at both boundaries', () => {
    expect(clampWidth(260, 260, 480)).toBe(260);
    expect(clampWidth(480, 260, 480)).toBe(480);
  });
});

describe('parsePanelWidth', () => {
  it('accepts a finite numeric string', () => {
    expect(parsePanelWidth('320')).toBe(320);
    expect(parsePanelWidth('300.5')).toBe(300.5);
  });

  it('rejects missing or non-numeric values', () => {
    expect(parsePanelWidth(null)).toBeNull();
    expect(parsePanelWidth('')).toBeNull();
    expect(parsePanelWidth('wide')).toBeNull();
    expect(parsePanelWidth('NaN')).toBeNull();
  });
});

describe('analysis panel width storage', () => {
  it('round-trips a stored width', () => {
    storeAnalysisPanelWidth(340);
    expect(readStoredAnalysisPanelWidth()).toBe(340);
  });

  it('rounds fractional widths before storing', () => {
    storeAnalysisPanelWidth(300.6);
    expect(readStoredAnalysisPanelWidth()).toBe(301);
  });

  it('treats a corrupted stored value as no choice', () => {
    localStorage.setItem(ANALYSIS_PANEL_WIDTH_STORAGE_KEY, 'nonsense');
    expect(readStoredAnalysisPanelWidth()).toBeNull();
    localStorage.removeItem(ANALYSIS_PANEL_WIDTH_STORAGE_KEY);
    expect(readStoredAnalysisPanelWidth()).toBeNull();
  });
});

describe('analysis panel collapsed storage', () => {
  it('defaults to expanded (false) when nothing is stored', () => {
    localStorage.removeItem(ANALYSIS_PANEL_COLLAPSED_STORAGE_KEY);
    expect(readStoredAnalysisPanelCollapsed()).toBe(false);
  });

  it('round-trips a stored collapsed choice', () => {
    storeAnalysisPanelCollapsed(true);
    expect(readStoredAnalysisPanelCollapsed()).toBe(true);
    storeAnalysisPanelCollapsed(false);
    expect(readStoredAnalysisPanelCollapsed()).toBe(false);
  });

  it('treats any non-"true" stored value as expanded', () => {
    localStorage.setItem(ANALYSIS_PANEL_COLLAPSED_STORAGE_KEY, 'nonsense');
    expect(readStoredAnalysisPanelCollapsed()).toBe(false);
    localStorage.removeItem(ANALYSIS_PANEL_COLLAPSED_STORAGE_KEY);
  });
});
