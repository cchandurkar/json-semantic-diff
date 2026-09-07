import { ChangeDetectionStrategy, Component, computed, input, model, output } from '@angular/core';
import { CodeEditorComponent } from '../code-editor/code-editor.component';
import { formatJson } from '../../shared/format-json';

@Component({
  selector: 'app-json-input',
  standalone: true,
  imports: [CodeEditorComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './json-input.component.html',
  styleUrl: './json-input.component.css'
})
export class JsonInputComponent {
  readonly label = input.required<string>();
  readonly value = input.required<string>();
  readonly error = input<string | null>(null);
  readonly statusText = input('Waiting for JSON');
  readonly darkMode = input(false);
  readonly editorHeight = model<number>(260);
  readonly valueChange = output<string>();

  readonly isValid = computed(() => {
    if (this.error() || !this.value().trim()) return false;
    if (this.statusText().startsWith('Valid')) return true;
    try {
      JSON.parse(this.value());
      return true;
    } catch {
      return false;
    }
  });

  async fileSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (file) this.valueChange.emit(formatJson(await file.text()));
    input.value = '';
  }

  async dropFile(event: DragEvent): Promise<void> {
    event.preventDefault();
    const file = event.dataTransfer?.files?.[0];
    if (file) this.valueChange.emit(formatJson(await file.text()));
  }

  format(): void {
    this.emitIfChanged(formatJson(this.value()));
  }

  /**
   * Pushing a new document into the editor makes CodeMirror's update listener fire
   * `docChanged`, which echoes the same text straight back. Dropping an echo that
   * already matches `value()` keeps the parent from re-marking the doc dirty.
   * A real keystroke or paste always differs from `value()`, so it passes through.
   */
  onEditorValue(next: string): void {
    this.emitIfChanged(next);
  }

  private emitIfChanged(next: string): void {
    if (next !== this.value()) this.valueChange.emit(next);
  }
}
