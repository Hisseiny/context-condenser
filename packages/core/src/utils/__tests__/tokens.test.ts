/**
 * packages/core/src/utils/__tests__/tokens.test.ts
 */

import { describe, it, expect } from 'vitest';
import { estimateTokens, estimateCost, savingsPercent } from '../tokens';

describe('estimateTokens', () => {
  it('returns a positive integer for non-empty string', () => {
    const result = estimateTokens('hello world');
    expect(result).toBeGreaterThan(0);
    expect(Number.isInteger(result)).toBe(true);
  });

  it('returns 0 for empty string', () => {
    expect(estimateTokens('')).toBe(0);
  });

  it('scales proportionally with text length', () => {
    const short = estimateTokens('abc');
    const long = estimateTokens('abc'.repeat(100));
    expect(long).toBeGreaterThan(short);
  });

  it('is consistent across calls', () => {
    const text = 'function foo() { return 42; }';
    expect(estimateTokens(text)).toBe(estimateTokens(text));
  });
});

describe('estimateCost', () => {
  it('returns a string starting with $', () => {
    expect(estimateCost(1000)).toMatch(/^\$/);
    expect(estimateCost(1000, 'gpt4')).toMatch(/^\$/);
  });

  it('claude is cheaper than gpt4 for same tokens', () => {
    const claude = parseFloat(estimateCost(100000, 'claude').replace('$', ''));
    const gpt4 = parseFloat(estimateCost(100000, 'gpt4').replace('$', ''));
    expect(claude).toBeLessThan(gpt4);
  });

  it('zero tokens costs $0.0000', () => {
    expect(estimateCost(0)).toBe('$0.0000');
  });
});

describe('savingsPercent', () => {
  it('calculates correct savings for 94% reduction', () => {
    const result = savingsPercent(100000, 6000);
    expect(parseFloat(result)).toBeCloseTo(94, 0);
  });

  it('returns 0.00% when raw equals condensed', () => {
    expect(savingsPercent(1000, 1000)).toBe('0.0%');
  });

  it('returns 0.00% when raw is zero', () => {
    expect(savingsPercent(0, 0)).toBe('0.00%');
  });

  it('format includes % sign', () => {
    expect(savingsPercent(10000, 500)).toMatch(/%$/);
  });
});
