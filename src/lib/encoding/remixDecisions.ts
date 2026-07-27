/**
 * Remix decisions — reading the model's verdict on each seed cube
 * ===============================================================
 *
 * The remix grammar asks the model to make one of five decisions per seed
 * cube — keep, transform, transplant, discard, add — and to return the
 * complete reinterpreted assembly. What comes back is just a cube list, so
 * the decisions have to be recovered by matching it against the seed.
 *
 * Four of those five are recoverable, and they're the ones worth showing:
 *
 * - **carried**    — the cube kept its seed identity (`processRemixResult`
 *                    hands a cube the seed's id when it lands on the seed's
 *                    cell with the seed's variation). Its cut history rides
 *                    along untouched.
 * - **transplanted** — a different body in a seed cell that asked to inherit
 *                    that cube's operators: the memes survive, the material
 *                    doesn't.
 * - **added**      — no relationship to any seed cube.
 * - **discarded**  — a seed cube nothing carried forward. This is the one
 *                    that matters most and the one a bare cube count hides:
 *                    a discarded cube takes its accumulated cuts with it, and
 *                    those cannot be regenerated.
 *
 * "Transform" isn't separable from "added" here — a cube the model moved,
 * rotated, or swapped for a neighbouring variation is indistinguishable from
 * a new one once it no longer matches its seed cell. Rather than guess, it's
 * folded into `added` and the labels say "new or transformed".
 *
 * Pure so the summary and the viewport read the same numbers from the same
 * place, and so this is testable without a canvas.
 */

import type { EncodedCube } from '../api/encodeSpace';
import type { PlacedCube } from '../cube/types';
import type { OperatorRecord } from '../operators/types';

export interface RemixDecisions {
  /** Seed cubes carried forward with their identity (and cut history) intact. */
  carried: EncodedCube[];
  /** New bodies that inherited a seed cube's operators. */
  transplanted: EncodedCube[];
  /** Cubes with no seed ancestry — genuinely new, or transformed past recognition. */
  added: EncodedCube[];
  /** Seed cubes nothing in the result carried forward. */
  discarded: PlacedCube[];
  /** Cuts lost with the discarded cubes — the part that can't be regenerated. */
  discardedOperatorCount: number;
}

export function remixDecisions(
  result: EncodedCube[],
  seed: PlacedCube[],
  cubeOperators: Record<string, OperatorRecord[]> = {},
): RemixDecisions {
  const seedIds = new Set(seed.map(c => c.id));

  const carried: EncodedCube[] = [];
  const transplanted: EncodedCube[] = [];
  const added: EncodedCube[] = [];

  // Every seed cube a result cube speaks for, either by taking its id or by
  // inheriting its operators.
  const survivingSeedIds = new Set<string>();

  for (const cube of result) {
    const keptSeedIdentity = !!cube.id && seedIds.has(cube.id);
    if (keptSeedIdentity) {
      survivingSeedIds.add(cube.id!);
      carried.push(cube);
      continue;
    }
    const donor = cube.inheritFromSeedId;
    if (donor && seedIds.has(donor)) {
      survivingSeedIds.add(donor);
      transplanted.push(cube);
      continue;
    }
    added.push(cube);
  }

  const discarded = seed.filter(c => !survivingSeedIds.has(c.id));
  const discardedOperatorCount = discarded.reduce(
    (n, c) => n + (cubeOperators[c.id]?.length ?? 0),
    0,
  );

  return { carried, transplanted, added, discarded, discardedOperatorCount };
}
