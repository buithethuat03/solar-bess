import { getMetadataStorage as getValidationMetadataStorage } from 'class-validator';
import { getMetadataArgsStorage } from 'typeorm';
import {
  AlarmCaseEntity, MaintenancePlanEntity, ServiceIncidentEntity, WarrantyClaimEntity,
  WorkOrderClosureCycleEntity, WorkOrderEntity
} from 'src/database/entities';
import { findCredentialShapedColumns } from 'src/modules/engineering-plants/domain/credential-columns';
import { AcknowledgeAlarmCaseDto } from 'src/modules/operations-maintenance/dto/operations-maintenance.dto';

/**
 * SEC-127/SEC-128 for the O&M slice. The Engineering slice froze the same absence on the plant
 * tables; the O&M tables are the ones an operator actually touches during an alarm, so the guard is
 * repeated here rather than assumed. The migration integration spec freezes it at the live
 * information_schema level.
 */
describe('SEC-127/SEC-128 — the O&M schema cannot address an OT system', () => {
  function columnNamesOf(target: new () => object): string[] {
    const columns = getMetadataArgsStorage().columns
      .filter((column) => column.target === target);
    expect(columns.length).toBeGreaterThan(0);
    return columns.map((column) => column.options.name ?? column.propertyName);
  }

  it.each([
    ['alarm_cases', AlarmCaseEntity],
    ['service_incidents', ServiceIncidentEntity],
    ['work_orders', WorkOrderEntity],
    ['work_order_closure_cycles', WorkOrderClosureCycleEntity],
    ['maintenance_plans', MaintenancePlanEntity],
    ['warranty_claims', WarrantyClaimEntity]
  ] as const)(
    '%s carries no host/password/secret/token/credential/url/endpoint column',
    (_table, entity) => {
      expect(findCredentialShapedColumns(columnNamesOf(entity))).toEqual([]);
    }
  );

  it('alarm cases store only opaque logical refs to the OT event store, never a payload', () => {
    const columns = columnNamesOf(AlarmCaseEntity);
    expect(columns).toContain('source_event_refs');
    // No tag, gateway, point, raw payload or command column can exist: the projection PM Web keeps
    // is a set of ids plus a quality flag, and nothing that could describe a way back into OT.
    for (const forbidden of [
      'tag_id', 'gateway_id', 'point_id', 'raw_payload', 'command', 'setpoint', 'reset', 'suppress'
    ]) {
      expect(columns).not.toContain(forbidden);
    }
  });

  it('the acknowledge request accepts exactly two local fields and nothing else', () => {
    // The controller validates with `whitelist` + `forbidNonWhitelisted`, so the validated property
    // set IS the accepted request shape: there is no clear/reset/suppress input to send, and no
    // source identifier a caller could aim at the OT system.
    const accepted = [...new Set(
      getValidationMetadataStorage()
        .getTargetValidationMetadatas(AcknowledgeAlarmCaseDto, '', false, false)
        .map((metadata) => metadata.propertyName)
    )].sort();
    expect(accepted).toEqual(['expectedVersion', 'note']);
  });
});
