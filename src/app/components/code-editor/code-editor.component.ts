import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnDestroy,
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
import { bracketMatching, defaultHighlightStyle, foldGutter, foldKeymap, indentOnInput, syntaxHighlighting } from '@codemirror/language';
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
import { oneDark } from '@codemirror/theme-one-dark';

@Component({
  selector: 'app-code-editor',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[style.height.px]': 'editorHeight()' },
  templateUrl: './code-editor.component.html',
  styleUrl: './code-editor.component.css'
})
export class CodeEditorComponent implements AfterViewInit, OnDestroy {
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
  }

  ngAfterViewInit(): void {
    const state = EditorState.create({
      doc: this.value(),
      extensions: this.extensions()
    });
    this.view = new EditorView({ state, parent: this.host().nativeElement });
    this.observeResize();
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
    this.resizeObserver = new ResizeObserver(entries => {
      const measured = Math.round(entries[0]?.borderBoxSize?.[0]?.blockSize ?? 0);
      if (measured <= 0 || measured === this.editorHeight()) return;
      this.editorHeight.set(measured);
    });
    this.resizeObserver.observe(this.elementRef.nativeElement);
  }

  private themeExtension(dark: boolean): Extension {
    return dark ? oneDark : syntaxHighlighting(defaultHighlightStyle, { fallback: true });
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
      EditorView.updateListener.of(u => {
        if (u.docChanged) this.value.set(u.state.doc.toString());
      })
    ];
  }
}
