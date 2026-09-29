import { describe, expect, it } from 'vitest';
import { formatStars, toStars } from '../src/client/lib/format';

describe('stars', () => {
  it('show the 1-10 ratings as 1-5 stars, so old notes still count', () => {
    expect(toStars(10)).toBe(5);
    expect(toStars(7)).toBe(3.5);
    expect(formatStars(8)).toBe('4');
    expect(formatStars(9)).toBe('4,5');
    // An average of 8 and 9 (8,5) is 4,3 stars (rounded to one decimal).
    expect(formatStars(8.5)).toBe('4,3');
    expect(formatStars(null)).toBe('—');
  });
});
