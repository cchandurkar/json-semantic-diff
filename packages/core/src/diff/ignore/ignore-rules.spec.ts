import { describe, expect, it } from 'vitest';
import { isValidIgnorePattern, matchesPathPattern, shouldIgnore } from './ignore-rules.js';

describe('ignore-rules', () => {
  describe('shouldIgnore', () => {
    it('matches by path when using 2-argument signature', () => {
      expect(shouldIgnore('$.users[102].name', ['$.users[*].name'])).toBe(true);
      expect(shouldIgnore('$.users[102].name', ['$.users[102].name'])).toBe(true);
      expect(shouldIgnore('$.users[102].name', ['$.users[999].name'])).toBe(false);
    });

    it('matches by both path and id when using 3-argument signature', () => {
      const path = '$.inventory[SKU-1001|BOS].quantity';
      const id = '$.inventory[sku=SKU-1001;store=BOS].quantity';

      // Matches by path representation
      expect(shouldIgnore(path, id, ['$.inventory[SKU-1001|BOS].quantity'])).toBe(true);

      // Matches by id representation
      expect(shouldIgnore(path, id, ['$.inventory[sku=SKU-1001;store=BOS].quantity'])).toBe(true);

      // Matches by wildcard
      expect(shouldIgnore(path, id, ['$.inventory[*].quantity'])).toBe(true);

      // Does not match unrelated rules
      expect(shouldIgnore(path, id, ['$.inventory[SKU-9999|BOS].quantity'])).toBe(false);
      expect(shouldIgnore(path, id, ['$.inventory[sku=SKU-9999;store=BOS].quantity'])).toBe(false);
    });
  });

  describe('matchesPathPattern', () => {
    it('matches exact paths', () => {
      expect(matchesPathPattern('$.a.b', '$.a.b')).toBe(true);
      expect(matchesPathPattern('$.a.b', '$.a.c')).toBe(false);
    });

    it('matches single-segment wildcard *', () => {
      expect(matchesPathPattern('$.a.b.c', '$.a.*.c')).toBe(true);
      expect(matchesPathPattern('$.a.b.x.c', '$.a.*.c')).toBe(false);
    });

    it('matches multi-segment wildcard **', () => {
      expect(matchesPathPattern('$.a.b.c.d', '$.a.**.d')).toBe(true);
      expect(matchesPathPattern('$.a.b.d', '$.a.**.d')).toBe(true);
      expect(matchesPathPattern('$.c.deep.trace', '$.**.trace')).toBe(true);
    });

    it('matches array element wildcard [*]', () => {
      expect(matchesPathPattern('$.arr[0].x', '$.arr[*].x')).toBe(true);
      expect(matchesPathPattern('$.arr[SKU-1001|BOS].x', '$.arr[*].x')).toBe(true);
      expect(matchesPathPattern('$.arr[sku=SKU-1001;store=BOS].x', '$.arr[*].x')).toBe(true);
    });
  });

  describe('isValidIgnorePattern', () => {
    it('accepts valid dot and wildcard patterns', () => {
      expect(isValidIgnorePattern('$')).toBe(true);
      expect(isValidIgnorePattern('$.foo')).toBe(true);
      expect(isValidIgnorePattern('$.foo.bar')).toBe(true);
      expect(isValidIgnorePattern('$.*')).toBe(true);
      expect(isValidIgnorePattern('$.**.field')).toBe(true);
      expect(isValidIgnorePattern('$.**.property')).toBe(true);
    });

    it('accepts valid array patterns including wildcard and identity styles', () => {
      expect(isValidIgnorePattern('$[0]')).toBe(true);
      expect(isValidIgnorePattern('$.arr[*].x')).toBe(true);
      expect(isValidIgnorePattern('$.arr[SKU-1|BOS].x')).toBe(true);
      expect(isValidIgnorePattern('$.arr[sku=X;store=Y].x')).toBe(true);
      expect(isValidIgnorePattern('$.inventory[0].price')).toBe(true);
    });

    it('rejects empty or whitespace-only patterns', () => {
      expect(isValidIgnorePattern('')).toBe(false);
      expect(isValidIgnorePattern('   ')).toBe(false);
      expect(isValidIgnorePattern(null as unknown as string)).toBe(false);
      expect(isValidIgnorePattern(undefined as unknown as string)).toBe(false);
    });

    it('rejects patterns missing the leading $ or separators after $', () => {
      expect(isValidIgnorePattern('foo.bar')).toBe(false);
      expect(isValidIgnorePattern('.foo.bar')).toBe(false);
      expect(isValidIgnorePattern('arr[*].x')).toBe(false);
      expect(isValidIgnorePattern('inventory[sku=X;store=Y].quantity')).toBe(false);
      expect(isValidIgnorePattern('$metadata')).toBe(false);
      expect(isValidIgnorePattern('$foo.bar')).toBe(false);
    });

    it('rejects patterns with empty segments or malformed separators', () => {
      expect(isValidIgnorePattern('$.')).toBe(false);
      expect(isValidIgnorePattern('$..foo')).toBe(false);
      expect(isValidIgnorePattern('$.foo..bar')).toBe(false);
    });

    it('rejects patterns with unbalanced or empty brackets', () => {
      expect(isValidIgnorePattern('$.arr[foo')).toBe(false);
      expect(isValidIgnorePattern('$.arr]foo')).toBe(false);
      expect(isValidIgnorePattern('$.arr[[foo]]')).toBe(false);
      expect(isValidIgnorePattern('$.arr[]')).toBe(false);
      expect(isValidIgnorePattern('$.foo[]')).toBe(false);
      expect(isValidIgnorePattern('$.arr[foo[bar]baz]')).toBe(false);
      expect(isValidIgnorePattern('$.arr[a][b]')).toBe(true);
    });
  });
});
