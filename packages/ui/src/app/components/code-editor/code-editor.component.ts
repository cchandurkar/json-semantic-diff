import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnDestroy,
  afterNextRender,
  effect,
  inject,
  input,
  model,
  viewChild
} from '@angular/core';
import { Compartment, EditorState, Extension } from '@codemirror/state';
import {
  EditorView,
  drawSelection,
  highlightActiveLine,
  highlightActiveLineGutter,
  keymap,
  lineNumbers,
  placeholder as cmPlaceholder
} from '@codemirror/view';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { bracketMatching, foldGutter, foldKeymap, HighlightStyle, indentOnInput, syntaxHighlighting } from '@codemirror/language';
import { tags } from '@lezer/highlight';
import { autocompletion, closeBrackets, closeBracketsKeymap, completionKeymap } from '@codemirror/autocomplete';
import { highlightSelectionMatches, searchKeymap } from '@codemirror/search';
import { jsonParseLinter, json } from '@codemirror/lang-json';
import { linter, lintGutter } from '@codemirror/lint';

/**
 * `jsonParseLinter` runs `JSON.parse('')` on an empty document and reports
 * "Unexpected end of JSON input". An untouched editor is not an error, so
 * blank or whitespace-only documents report no diagnostics.
 */
function emptyAwareJsonLinter() {
  const parseLinter = jsonParseLinter();
  return (view: EditorView) => (view.state.doc.toString().trim() ? parseLinter(view) : []);
}
import { oneDarkTheme } from '@codemirror/theme-one-dark';

/**
 * JSON syntax colors driven entirely by the app's `--json-*` CSS custom
 * properties, so ONE style works for both themes: `var(...)` resolves live
 * against `[data-theme]`, no swap needed when the user toggles dark mode.
 */
const jsonHighlightStyle = HighlightStyle.define([
  { tag: tags.propertyName, color: 'var(--json-key)' },
  { tag: tags.string, color: 'var(--json-string)' },
  { tag: tags.number, color: 'var(--json-number)' },
  { tag: tags.bool, color: 'var(--json-boolean)' },
  { tag: tags.null, color: 'var(--json-null)' },
  { tag: [tags.punctuation, tags.bracket, tags.separator], color: 'var(--json-punctuation)' }
]);

@Component({
  selector: 'app-code-editor',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[style.height.px]': 'editorHeight()' },
  templateUrl: './code-editor.component.html',
  styleUrl: './code-editor.component.css'
})
export class CodeEditorComponent implements OnDestroy {
  readonly value = model<string>('');
  readonly editorHeight = model<number>(260);
  readonly darkMode = input(false);
  readonly ariaLabel = input('');
  readonly placeholder = input('');

  private readonly elementRef = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly host = viewChild.required<ElementRef<HTMLElement>>('editorHost');
  private readonly themeCompartment = new Compartment();
  private view?: EditorView;
  private resizeObserver?: ResizeObserver;

  constructor() {
    effect(() => {
      const next = this.value();
      const view = this.view;
      if (!view || next === view.state.doc.toString()) return;
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: next } });
    });

    effect(() => {
      const dark = this.darkMode();
      const view = this.view;
      if (!view) return;
      view.dispatch({ effects: this.themeCompartment.reconfigure(this.themeExtension(dark)) });
    });

    // CodeMirror's `EditorView` reads and writes real DOM (creates elements, measures
    // layout) and must never run during build-time prerendering, which executes in a
    // Node environment with no browser DOM. `afterNextRender` is guaranteed by Angular
    // to run in the browser only, after the first render - the SSR-safe replacement for
    // constructing this view in `ngAfterViewInit` (which DOES run during prerendering).
    afterNextRender(() => {
      const state = EditorState.create({
        doc: this.value(),
        extensions: this.extensions()
      });
      this.view = new EditorView({ state, parent: this.host().nativeElement });
      this.observeResize();
    });
  }

  ngOnDestroy(): void {
    this.resizeObserver?.disconnect();
    this.resizeObserver = undefined;
    this.view?.destroy();
    this.view = undefined;
  }

  /**
   * The native `resize: vertical` handle writes an inline height straight to the DOM,
   * which Angular never sees. Mirroring it back into `editorHeight` lets the parent
   * push the same value onto the sibling editor. The rounded equality check below is
   * the loop guard: the echo back from the host style binding resolves to the value
   * already held by the signal, so the observer stops there.
   */
  private observeResize(): void {
    this.resizeObserver = new ResizeObserver((entries) => {
      const measured = Math.round(entries[0]?.borderBoxSize?.[0]?.blockSize ?? 0);
      if (measured <= 0 || measured === this.editorHeight()) return;
      this.editorHeight.set(measured);
    });
    this.resizeObserver.observe(this.elementRef.nativeElement);
  }

  private themeExtension(dark: boolean): Extension {
    // `oneDarkTheme` supplies dark-mode editor chrome only (background/gutters/
    // selection); syntax colors always come from the token-driven style above,
    // so JSON highlighting stays theme-agnostic in both branches.
    return dark
      ? [oneDarkTheme, syntaxHighlighting(jsonHighlightStyle, { fallback: true })]
      : syntaxHighlighting(jsonHighlightStyle, { fallback: true });
  }

  private extensions(): Extension[] {
    return [
      lineNumbers(),
      highlightActiveLineGutter(),
      history(),
      foldGutter(),
      drawSelection(),
      EditorState.allowMultipleSelections.of(true),
      indentOnInput(),
      bracketMatching(),
      closeBrackets(),
      autocompletion(),
      highlightActiveLine(),
      highlightSelectionMatches(),
      keymap.of([
        ...closeBracketsKeymap,
        ...defaultKeymap,
        ...searchKeymap,
        ...historyKeymap,
        ...foldKeymap,
        ...completionKeymap,
        indentWithTab
      ]),
      json(),
      linter(emptyAwareJsonLinter()),
      lintGutter(),
      cmPlaceholder(this.placeholder()),
      EditorView.lineWrapping,
      EditorView.contentAttributes.of({ 'aria-label': this.ariaLabel() }),
      this.themeCompartment.of(this.themeExtension(this.darkMode())),
      EditorView.updateListener.of((u) => {
        if (u.docChanged) this.value.set(u.state.doc.toString());
      })
    ];
  }
}
