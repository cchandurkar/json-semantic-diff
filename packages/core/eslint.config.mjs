// Extends the shared repo-root base (plain JS/TS rules) - packages/core is
// framework-free by design, so nothing Angular-specific applies here and
// there are no package-specific additions beyond the base.
import rootConfig from '../../eslint.config.mjs';

export default [...rootConfig];
