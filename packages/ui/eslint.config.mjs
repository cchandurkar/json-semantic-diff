// Extends the shared repo-root base (plain JS/TS rules) with Angular-specific
// plugin config/rules - only packages/ui uses Angular, so these stay local to
// this package rather than living in the shared root config.
import tseslint from 'typescript-eslint';
import angular from 'angular-eslint';
import rootConfig from '../../eslint.config.mjs';

export default tseslint.config(
  ...rootConfig,
  {
    files: ['**/*.ts'],
    extends: [...angular.configs.tsRecommended],
    processor: angular.processInlineTemplates,
    rules: {
      '@angular-eslint/prefer-standalone': 'error',
      '@angular-eslint/prefer-inject': 'error',
      '@angular-eslint/prefer-on-push-component-change-detection': 'error',
      '@angular-eslint/component-selector': ['error', { type: 'element', prefix: 'app', style: 'kebab-case' }]
    }
  },
  {
    files: ['**/*.html'],
    extends: [...angular.configs.templateRecommended, ...angular.configs.templateAccessibility],
    rules: {
      '@angular-eslint/template/prefer-control-flow': 'error',
      '@angular-eslint/template/prefer-at-empty': 'error',
      '@angular-eslint/template/no-empty-control-flow': 'error'
    }
  }
);
