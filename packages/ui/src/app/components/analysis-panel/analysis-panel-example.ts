import { DIFF_EXAMPLES, DiffExample } from '../../examples';

/**
 * Picks a random example from the available diff examples.
 * Supports a custom random number generator function for deterministic unit testing.
 */
export function pickRandomExample(examples: readonly DiffExample[] = DIFF_EXAMPLES, rng: () => number = Math.random): DiffExample {
  if (examples.length === 0) {
    throw new Error('No diff examples available to pick from.');
  }
  const index = Math.floor(rng() * examples.length);
  return examples[Math.min(index, examples.length - 1)];
}
