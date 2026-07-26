import { createHash } from 'node:crypto';
import {
  computeDuplicateKey, normalizeLocationText
} from 'src/modules/opportunity/domain/duplicate-key';

const COMPANY = '0E984725-C51C-4BF4-9960-E1C80E27ABA0';

describe('Opportunity duplicate-key normalizer — API-027 duplicate check', () => {
  it('normalizes location text: trim, lower-case, collapsed internal whitespace', () => {
    expect(normalizeLocationText('  Khu CN   Long Thành ')).toBe('khu cn long thành');
    expect(normalizeLocationText('KHU\tCN\nLONG THÀNH')).toBe('khu cn long thành');
  });

  it('normalizes blank or absent location to null', () => {
    expect(normalizeLocationText(null)).toBeNull();
    expect(normalizeLocationText(undefined)).toBeNull();
    expect(normalizeLocationText('')).toBeNull();
    expect(normalizeLocationText('   \t ')).toBeNull();
  });

  it('computes NULL unless both customer and location are present', () => {
    expect(computeDuplicateKey(null, 'Khu CN Long Thành')).toBeNull();
    expect(computeDuplicateKey(undefined, 'Khu CN Long Thành')).toBeNull();
    expect(computeDuplicateKey(COMPANY, null)).toBeNull();
    expect(computeDuplicateKey(COMPANY, '   ')).toBeNull();
  });

  it('is a sha256 hex digest over the normalized customer + location pair', () => {
    const key = computeDuplicateKey(COMPANY, '  Khu CN   Long Thành ');
    expect(key).toMatch(/^[0-9a-f]{64}$/);
    expect(key).toBe(createHash('sha256')
      .update(`${COMPANY.toLowerCase()}|khu cn long thành`)
      .digest('hex'));
  });

  it('identifies the same site of the same customer regardless of spelling noise', () => {
    const canonical = computeDuplicateKey(COMPANY.toLowerCase(), 'khu cn long thành');
    expect(computeDuplicateKey(COMPANY, '  KHU CN   LONG THÀNH ')).toBe(canonical);
  });

  it('separates different customers and different locations', () => {
    const other = '7d444840-9dc0-11d1-b245-5ffdce74fad2';
    expect(computeDuplicateKey(COMPANY, 'khu cn long thành'))
      .not.toBe(computeDuplicateKey(other, 'khu cn long thành'));
    expect(computeDuplicateKey(COMPANY, 'khu cn long thành'))
      .not.toBe(computeDuplicateKey(COMPANY, 'khu cn nhơn trạch'));
  });
});
