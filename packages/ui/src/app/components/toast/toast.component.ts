import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { ToastMessage } from '../../shared/toast';

/**
 * Non-modal copy/ignore feedback (more-features.md §11).
 *
 * Deliberately tiny: a live region plus an optional undo button. Dismissal
 * timing is owned by the host, which already holds the message signal.
 */
@Component({
  selector: 'app-toast',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './toast.component.html',
  styleUrl: './toast.component.css'
})
export class ToastComponent {
  readonly message = input<ToastMessage | null>(null);
  readonly undo = output<void>();
  readonly dismissed = output<void>();
}
