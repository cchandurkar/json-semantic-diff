// Shared base config: plain JS/TS rules only, no framework-specific plugins.
// Each package imports and extends this from its own eslint.config.mjs -
// packages/core adds nothing extra (framework-free by design), packages/ui
// adds the Angular-specific plugin/rules on top of this base.
import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: ['**/dist/**', '**/coverage/**', '**/node_modules/**', '**/.angular/**']
  },
  {
    files: ['**/*.ts'],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    rules: {
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }]
    }
  }
);
