import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

@Component({
  selector: 'app-search-control',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './search-control.component.html',
  styleUrl: './search-control.component.css'
})
export class SearchControlComponent {
  readonly query = input('');
  readonly resultCount = input(0);
  /** 0-based index of the current result within resultCount. */
  readonly currentIndex = input(0);
  readonly queryChange = output<string>();
  readonly next = output<void>();
  readonly previous = output<void>();
  readonly clear = output<void>();

  onInput(event: Event): void {
    this.queryChange.emit((event.target as HTMLInputElement).value);
  }

  onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter') {
      event.preventDefault();
      if (event.shiftKey) this.previous.emit();
      else this.next.emit();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      this.clear.emit();
    }
  }
}
