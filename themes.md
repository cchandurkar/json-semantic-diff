Improve the application's light and dark themes using the following semantic color system. Keep the existing layout/components unchanged; this task is only about visual theming and color consistency.

Use CSS variables/design tokens rather than hardcoded colors throughout components.

LIGHT
--background: #f8fafc;
--foreground: #0f172a;
--header: #ffffff;
--sidebar: #f8fafc;
--workspace: #f1f5f9;
--card: #ffffff;
--card-foreground: #0f172a;
--editor: #ffffff;
--editor-foreground: #1e293b;
--border: #e2e8f0;
--border-subtle: #edf2f7;
--muted: #f1f5f9;
--muted-foreground: #64748b;
--subtle-foreground: #94a3b8;
--primary: #2563eb;
--primary-hover: #1d4ed8;
--primary-foreground: #ffffff;
--accent: #eff6ff;
--accent-foreground: #1d4ed8;
--selection: #dbeafe;
--selection-border: #93c5fd;

DARK
--background: #0b1120;
--foreground: #e5e7eb;
--header: #0f172a;
--sidebar: #0f172a;
--workspace: #0b1120;
--card: #111827;
--card-foreground: #e5e7eb;
--editor: #0d1424;
--editor-foreground: #e2e8f0;
--border: #253047;
--border-subtle: #1e293b;
--muted: #172033;
--muted-foreground: #94a3b8;
--subtle-foreground: #64748b;
--primary: #3b82f6;
--primary-hover: #60a5fa;
--primary-foreground: #ffffff;
--accent: #172554;
--accent-foreground: #93c5fd;
--selection: #172554;
--selection-border: #3b82f6;

DIFF COLORS
Light:
added #15803d / bg #f0fdf4
removed #dc2626 / bg #fef2f2
modified #b45309 / bg #fffbeb

Dark:
added #4ade80 / bg #10261b
removed #f87171 / bg #2b161a
modified #fbbf24 / bg #2a2112

JSON SYNTAX
Light:
key #2563eb
string #15803d
number #7c3aed
boolean #c2410c
null #64748b
punctuation #475569

Dark:
key #60a5fa
string #86efac
number #c4b5fd
boolean #fbbf24
null #94a3b8
punctuation #cbd5e1

Design principles:
- Reserve blue primarily for interactive, selected, focused, linked, and primary-action states.
- Do not use blue/cyan decoratively throughout the Inspector.
- Let red/green/amber diff semantics stand out.
- Use subtle surface differences to create hierarchy instead of excessive borders.
- Keep Changes by Area neutral; only use accent colors for hover/selection.
- Avoid pure black in dark mode.
- Maintain WCAG-friendly text contrast.
- Reuse existing Spartan/shadcn-compatible semantic tokens where possible and add app-specific `diff-*`, `editor-*`, and `json-*` tokens.
- Remove component-level hardcoded colors where a semantic token can be used instead.