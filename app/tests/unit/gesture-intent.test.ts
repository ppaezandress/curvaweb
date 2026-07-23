import { describe, it, expect } from "vitest";
import { palmFacing, MIN_FACING } from "@/lib/gestures/intent";
import type { Landmark } from "@/lib/gestures/vocabulary";

// Estas dos defensas existen por un falso positivo real: al rascarse la cara o apoyar la mano
// en la barbilla, los dedos coinciden con una seña y el cronómetro se movía solo.

// Mano de frente: la palma se ve casi tan ancha como larga.
function handFacing(): Landmark[] {
  const lm: Landmark[] = Array.from({ length: 21 }, () => ({ x: 0.5, y: 0.5 }));
  lm[0] = { x: 0.5, y: 0.7 }; // muñeca
  lm[5] = { x: 0.42, y: 0.55 }; // nudillo índice
  lm[9] = { x: 0.5, y: 0.53 }; // nudillo medio
  lm[17] = { x: 0.58, y: 0.56 }; // nudillo meñique
  return lm;
}

// Mano de canto: los nudillos se alinean en la línea de visión y el ancho se colapsa.
function handSideways(): Landmark[] {
  const lm = handFacing();
  lm[5] = { x: 0.49, y: 0.55 };
  lm[17] = { x: 0.51, y: 0.56 };
  return lm;
}

describe("palma de frente", () => {
  it("una mano de frente puntúa alto en orientación", () => {
    expect(palmFacing(handFacing())).toBeGreaterThan(MIN_FACING);
  });

  it("una mano de canto (apoyada en la cara) puntúa bajo", () => {
    expect(palmFacing(handSideways())).toBeLessThan(MIN_FACING);
  });

  it("no revienta con datos incompletos", () => {
    expect(palmFacing([])).toBe(0);
  });
});
