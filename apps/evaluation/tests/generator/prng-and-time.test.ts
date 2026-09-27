import { describe, expect, test } from "bun:test";
import {
  ParkMillerPrng,
  PRNG_ALGORITHM,
} from "../../src/seed/generator/prng.ts";
import { timestampByIndex, toUtcIsoString } from "../../src/shared/time.ts";

const PARK_MILLER_VECTOR = [
  48_271, 182_605_794, 1_291_394_886, 1_914_720_637, 2_078_669_041,
] as const;
const PARK_MILLER_MODULUS = 2_147_483_647;

describe("Park-Miller deterministic PRNG", () => {
  test("uses an explicit versioned algorithm and known vector", () => {
    const generator = new ParkMillerPrng(0);

    expect(PRNG_ALGORITHM).toBe("park-miller-48271-v1");
    for (const expectedState of PARK_MILLER_VECTOR) {
      expect(generator.next()).toBe(expectedState / PARK_MILLER_MODULUS);
    }
  });

  test("repeats for the same seed and diverges for another seed", () => {
    const first = new ParkMillerPrng(1234);
    const second = new ParkMillerPrng(1234);
    const different = new ParkMillerPrng(1235);
    let sawDifference = false;

    let index = 0;
    while (index < 1000) {
      const firstValue = first.next();
      const secondValue = second.next();
      const differentValue = different.next();
      expect(firstValue).toBe(secondValue);
      expect(firstValue).toBeGreaterThan(0);
      expect(firstValue).toBeLessThan(1);
      if (firstValue !== differentValue) {
        sawDifference = true;
      }
      index += 1;
    }
    expect(sawDifference).toBe(true);
  });

  test("rejects invalid seeds and bounds", () => {
    expect(() => new ParkMillerPrng(-1)).toThrow();
    expect(() => new ParkMillerPrng(1.5)).toThrow();
    expect(() => new ParkMillerPrng(Number.NaN)).toThrow();
    expect(() => new ParkMillerPrng(0).nextBetween(2, 1)).toThrow();
  });
});

describe("timestamp-by-index generation", () => {
  test("derives each timestamp directly from start plus index times interval", () => {
    const start = Date.parse("2026-01-01T00:00:00.000Z");
    const index = 1_000_000;
    const intervalMilliseconds = 10_000;
    const timestamp = timestampByIndex(start, index, intervalMilliseconds);

    expect(timestamp).toBe(start + index * intervalMilliseconds);
    expect(toUtcIsoString(timestamp)).toBe("2026-04-26T17:46:40.000Z");
  });

  test("rejects unsafe or negative operands", () => {
    expect(() => timestampByIndex(0, -1, 10_000)).toThrow();
    expect(() => timestampByIndex(0, 1.5, 10_000)).toThrow();
    expect(() => timestampByIndex(0, 1, 0)).toThrow();
    expect(() =>
      timestampByIndex(Number.MAX_SAFE_INTEGER, 1, 10_000)
    ).toThrow();
  });
});
