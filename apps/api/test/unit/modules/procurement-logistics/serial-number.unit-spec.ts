import {
  isSerialPresent, normalizeSerial
} from 'src/modules/procurement-logistics/domain/serial-number';

describe('DB-054 serial normalization — API-085', () => {
  it.each([
    ['lowercase', 'sn-00042-a', 'SN-00042-A'],
    ['surrounding whitespace', '  SN-00042-A  ', 'SN-00042-A'],
    ['mixed case with inner spaces kept', ' pv Module 001 ', 'PV MODULE 001'],
    ['already normalized', 'BESS-BATT-7', 'BESS-BATT-7']
  ])('normalizes %s', (_label, raw, expected) => {
    expect(normalizeSerial(raw)).toBe(expected);
  });

  it('is idempotent — normalizing twice changes nothing', () => {
    const once = normalizeSerial('  abC-1 ');
    expect(normalizeSerial(once)).toBe(once);
  });

  it('agrees with the database identity upper(btrim(x)) on printable ASCII', () => {
    // The DTO restricts serials to printable ASCII precisely so JS and Postgres cannot diverge;
    // this pins the JS side of that contract.
    const sample = ' abc XYZ-012_./#$% ';
    expect(normalizeSerial(sample)).toBe(sample.trim().toUpperCase());
  });

  it('flags serials that are empty after trimming', () => {
    expect(isSerialPresent('   ')).toBe(false);
    expect(isSerialPresent('')).toBe(false);
    expect(isSerialPresent(' S1 ')).toBe(true);
  });
});
