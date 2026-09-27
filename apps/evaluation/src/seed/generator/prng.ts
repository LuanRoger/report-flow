const PARK_MILLER_MODULUS = 2_147_483_647;
const PARK_MILLER_MULTIPLIER = 48_271;
const PARK_MILLER_MAXIMUM_SEED = 4_294_967_295;

export const PRNG_ALGORITHM = "park-miller-48271-v1" as const;

export class ParkMillerPrng {
  private state: number;

  constructor(seed: number) {
    if (
      !Number.isSafeInteger(seed) ||
      seed < 0 ||
      seed > PARK_MILLER_MAXIMUM_SEED
    ) {
      throw new Error(
        `PRNG seed must be an integer within [0,${PARK_MILLER_MAXIMUM_SEED}]`
      );
    }

    this.state = (seed % (PARK_MILLER_MODULUS - 1)) + 1;
  }

  next(): number {
    this.state = (this.state * PARK_MILLER_MULTIPLIER) % PARK_MILLER_MODULUS;
    return this.state / PARK_MILLER_MODULUS;
  }

  nextBetween(minimum: number, maximum: number): number {
    if (
      !(Number.isFinite(minimum) && Number.isFinite(maximum)) ||
      maximum < minimum
    ) {
      throw new Error("PRNG bounds must be finite and ordered");
    }
    return minimum + (maximum - minimum) * this.next();
  }
}
