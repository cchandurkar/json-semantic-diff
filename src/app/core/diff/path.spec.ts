import { describe, expect, it } from 'vitest';
import { ROOT_SEGMENT, appendId, appendPath, identitySegment, indexSegment, keySegment, segmentLabel, stableValue } from './path';

describe('appendPath (the shipped `path` format)', () => {
  it('serializes each segment kind', () => {
    expect(appendPath('', ROOT_SEGMENT)).toBe('$');
    expect(appendPath('$', keySegment('users'))).toBe('$.users');
    expect(appendPath('$.users', indexSegment(2))).toBe('$.users[2]');
    expect(appendPath('$.users', identitySegment(['userId'], ['102']))).toBe('$.users[102]');
  });

  it('joins composite identity values with a pipe', () => {
    expect(appendPath('$.stock', identitySegment(['store', 'sku'], ['NYC', 'A1']))).toBe('$.stock[NYC|A1]');
  });
});

describe('appendId (the stable identity format)', () => {
  it('matches appendPath for every non-identity segment', () => {
    expect(appendId('', ROOT_SEGMENT)).toBe('$');
    expect(appendId('$', keySegment('users'))).toBe('$.users');
    expect(appendId('$.users', indexSegment(2))).toBe('$.users[2]');
  });

  it('spells out the key paths for identity segments', () => {
    expect(appendId('$.users', identitySegment(['userId'], ['102']))).toBe('$.users[userId=102]');
    expect(appendId('$.stock', identitySegment(['store', 'sku'], ['NYC', 'A1']))).toBe('$.stock[store=NYC;sku=A1]');
  });
});

describe('segmentLabel', () => {
  it('produces the display label for each segment kind', () => {
    expect(segmentLabel(ROOT_SEGMENT)).toBe('root');
    expect(segmentLabel(keySegment('users'))).toBe('users');
    expect(segmentLabel(indexSegment(2))).toBe('[2]');
    expect(segmentLabel(identitySegment(['userId'], ['102']))).toBe('[userId=102]');
    expect(segmentLabel(identitySegment(['store', 'sku'], ['NYC', 'A1']))).toBe('[store+sku=NYC|A1]');
  });
});

describe('stableValue', () => {
  it('passes strings through and JSON-encodes everything else', () => {
    expect(stableValue('abc')).toBe('abc');
    expect(stableValue(102)).toBe('102');
    expect(stableValue(true)).toBe('true');
    expect(stableValue(null)).toBe('null');
    expect(stableValue(undefined)).toBe('∅');
  });
});
