import { getMetadataArgsStorage } from 'typeorm';
import {
  BessPlantEntity, EquipmentEntity, AssetEntity, SolarPlantEntity
} from 'src/database/entities';
import {
  CREDENTIAL_COLUMN_PATTERN, findCredentialShapedColumns
} from 'src/modules/engineering-plants/domain/credential-columns';

/**
 * SEC-127/SEC-128: the schema-level ABSENCE of connectivity/credential fields on the plant tables
 * IS the control that PM Web can never store a way to reach a BESS/OT system. This test freezes
 * that absence at the entity-metadata level; the migration integration spec freezes it at the
 * live information_schema level.
 */
describe('SEC-127/SEC-128 — no credential-shaped column on plant entities', () => {
  function columnNamesOf(target: new () => object): string[] {
    const columns = getMetadataArgsStorage().columns
      .filter((column) => column.target === target);
    expect(columns.length).toBeGreaterThan(0);
    return columns.map((column) => column.options.name ?? column.propertyName);
  }

  it.each([
    ['bess_plants', BessPlantEntity],
    ['solar_plants', SolarPlantEntity],
    ['equipment', EquipmentEntity],
    ['assets', AssetEntity]
  ] as const)('%s carries no host/password/secret/token/credential/url/endpoint column', (_table, entity) => {
    expect(findCredentialShapedColumns(columnNamesOf(entity))).toEqual([]);
  });

  it('the guard itself catches every forbidden shape', () => {
    const offenders = [
      'scada_host', 'password_hash', 'client_secret', 'access_token', 'ot_credential',
      'gateway_url', 'api_endpoint', 'bms_username', 'api_key', 'apikey'
    ];
    expect(findCredentialShapedColumns(['id', 'tenant_id', ...offenders])).toEqual(offenders);
    for (const name of offenders) {
      expect(CREDENTIAL_COLUMN_PATTERN.test(name)).toBe(true);
    }
  });

  it('does not misfire on the legitimate plant vocabulary', () => {
    expect(findCredentialShapedColumns([
      'power_mw', 'energy_mwh', 'hierarchy_version', 'operating_envelope',
      'point_list_version', 'dc_capacity_kwp', 'ac_capacity_kw', 'configuration_hash',
      'root_asset_id', 'dossier_ref', 'external_financial_asset_ref'
    ])).toEqual([]);
  });
});
