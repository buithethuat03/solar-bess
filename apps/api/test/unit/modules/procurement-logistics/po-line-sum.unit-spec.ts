import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { randomUUID } from 'node:crypto';
import {
  CreatePurchaseOrderDto
} from 'src/modules/procurement-logistics/dto/procurement-logistics.dto';

/**
 * API-082 DTO validation. The DTO deliberately performs NO arithmetic — the sum identity is the
 * deferred database trigger's job — but it must guarantee that only decimal STRINGS in numeric
 * range reach the service, that at least one line exists and that nested lines are validated.
 */
function payload(overrides: Partial<Record<string, unknown>> = {}) {
  return plainToInstance(CreatePurchaseOrderDto, {
    poNo: 'PO-2026-001', title: 'Mua module PV cho trạm demo',
    supplierProfileId: randomUUID(), totalValue: '1000000.5000', currency: 'VND',
    approvedBy: randomUUID(), costCodeId: randomUUID(),
    lines: [{
      lineNo: 1, description: 'PV module 550Wp', quantity: '1000', uom: 'PCS',
      unitPrice: '1000.0005'
    }],
    ...overrides
  });
}

describe('API-082 purchase order DTO — money stays text, lines stay present', () => {
  it('accepts a well-formed order', async () => {
    const errors = await validate(payload());
    expect(errors).toHaveLength(0);
    // Money fields survive as strings; nothing coerced them into JS numbers.
    const dto = payload();
    expect(typeof dto.totalValue).toBe('string');
    expect(typeof dto.lines[0].quantity).toBe('string');
    expect(typeof dto.lines[0].unitPrice).toBe('string');
  });

  it.each([
    ['negative total', { totalValue: '-1' }],
    ['non-decimal total', { totalValue: '1e6' }],
    ['grouped digits', { totalValue: '1,000' }],
    ['too many decimals', { totalValue: '1.00001' }],
    ['number instead of string', { totalValue: 1000000.5 }],
    ['bad currency', { currency: 'vnd' }]
  ])('rejects %s on the header', async (_label, overrides) => {
    const errors = await validate(payload(overrides));
    expect(errors.length).toBeGreaterThan(0);
  });

  it('requires at least one line and validates each line deeply', async () => {
    expect((await validate(payload({ lines: [] }))).length).toBeGreaterThan(0);

    const badLine = await validate(payload({
      lines: [{
        lineNo: 0, description: 'PV module', quantity: '0.00001', uom: 'PCS', unitPrice: '-5'
      }]
    }));
    const lineErrors = badLine.find((error) => error.property === 'lines');
    expect(lineErrors).toBeDefined();
    const nested = lineErrors!.children?.[0]?.children?.map((child) => child.property) ?? [];
    expect(nested).toEqual(expect.arrayContaining(['lineNo', 'quantity', 'unitPrice']));
  });

  it('rejects a line carrying its own currency — lines ride the header currency', async () => {
    const dto = plainToInstance(CreatePurchaseOrderDto, {
      ...payload(), lines: [{
        lineNo: 1, description: 'PV module', quantity: '1', uom: 'PCS', unitPrice: '1',
        currency: 'USD'
      }]
    });
    const errors = await validate(dto, { whitelist: true, forbidNonWhitelisted: true });
    const lineErrors = errors.find((error) => error.property === 'lines');
    expect(lineErrors).toBeDefined();
  });
});
