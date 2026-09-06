import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import angular from 'angular-eslint';

export default tseslint.config(
  {
    ignores: ['**/dist/**', '**/coverage/**', '**/node_modules/**', '**/.angular/**']
  },

  // Plain TypeScript (packages/core: framework-free, no Angular rules apply here)
  {
    files: ['packages/core/**/*.ts'],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    rules: {
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }]
    }
  },

  // Angular TypeScript (packages/ui only)
  {
    files: ['packages/ui/**/*.ts'],
    extends: [js.configs.recommended, ...tseslint.configs.recommended, ...angular.configs.tsRecommended],
    processor: angular.processInlineTemplates,
    rules: {
      '@angular-eslint/prefer-standalone': 'error',
      '@angular-eslint/prefer-inject': 'error',
      '@angular-eslint/prefer-on-push-component-change-detection': 'error',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      '@angular-eslint/component-selector': ['error', { type: 'element', prefix: 'app', style: 'kebab-case' }]
    }
  },

  // Angular templates (packages/ui only)
  {
    files: ['packages/ui/**/*.html'],
    extends: [...angular.configs.templateRecommended, ...angular.configs.templateAccessibility],
    rules: {
      '@angular-eslint/template/prefer-control-flow': 'error',
      '@angular-eslint/template/prefer-at-empty': 'error',
      '@angular-eslint/template/no-empty-control-flow': 'error'
    }
  }
);
