import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * Tooltip body rendered into the CDK overlay container.
 *
 * Visual styling lives in `src/styles.css` under the `.difflens-tooltip` panel
 * class, because the overlay pane is created by the CDK outside this component
 * and so cannot be reached by component-scoped styles.
 */
@Component({
  selector: 'app-tooltip',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './tooltip.component.html',
  host: {
    role: 'tooltip',
    '[id]': 'tooltipId()'
  }
})
export class TooltipComponent {
  readonly text = input('');
  readonly tooltipId = input('');
}
