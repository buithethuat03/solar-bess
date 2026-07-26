import { ShipmentMilestoneType, ShipmentStatus } from 'src/database/entities';
import {
  assessMilestoneOrder, deriveShipmentStatus, type MilestoneRecord
} from 'src/modules/procurement-logistics/domain/milestone-policy';

const at = (iso: string) => new Date(iso);
const record = (
  milestoneType: ShipmentMilestoneType, eventTime: string
): MilestoneRecord => ({ milestoneType, eventTime: at(eventTime) });

describe('FR-070 milestone ordering and derived shipment status — API-084', () => {
  describe('assessMilestoneOrder', () => {
    it('accepts the first ranked milestone and a forward walk', () => {
      expect(assessMilestoneOrder([], record(ShipmentMilestoneType.BOOKED, '2026-07-01T00:00Z')))
        .toBe('IN_ORDER');
      const booked = [record(ShipmentMilestoneType.BOOKED, '2026-07-01T00:00Z')];
      expect(assessMilestoneOrder(booked, record(ShipmentMilestoneType.DEPARTED, '2026-07-02T00:00Z')))
        .toBe('IN_ORDER');
      // Skipping stages forward is legal — carriers do not always report every stage.
      expect(assessMilestoneOrder(booked, record(ShipmentMilestoneType.DELIVERED, '2026-07-09T00:00Z')))
        .toBe('IN_ORDER');
    });

    it('refuses a rank regression', () => {
      const stream = [
        record(ShipmentMilestoneType.BOOKED, '2026-07-01T00:00Z'),
        record(ShipmentMilestoneType.ARRIVED, '2026-07-05T00:00Z')
      ];
      expect(assessMilestoneOrder(stream, record(ShipmentMilestoneType.DEPARTED, '2026-07-06T00:00Z')))
        .toBe('OUT_OF_ORDER');
      expect(assessMilestoneOrder(stream, record(ShipmentMilestoneType.BOOKED, '2026-07-06T00:00Z')))
        .toBe('OUT_OF_ORDER');
    });

    it('refuses a rank advance whose event time precedes the recorded ranked events', () => {
      const stream = [record(ShipmentMilestoneType.DEPARTED, '2026-07-05T00:00Z')];
      expect(assessMilestoneOrder(stream, record(ShipmentMilestoneType.ARRIVED, '2026-07-04T00:00Z')))
        .toBe('OUT_OF_ORDER');
      expect(assessMilestoneOrder(stream, record(ShipmentMilestoneType.ARRIVED, '2026-07-05T00:00Z')))
        .toBe('IN_ORDER');
    });

    it('accepts same-stage repeats and EXCEPTION at any point', () => {
      const stream = [
        record(ShipmentMilestoneType.BOOKED, '2026-07-01T00:00Z'),
        record(ShipmentMilestoneType.DEPARTED, '2026-07-02T00:00Z')
      ];
      expect(assessMilestoneOrder(stream, record(ShipmentMilestoneType.DEPARTED, '2026-07-01T12:00Z')))
        .toBe('IN_ORDER');
      expect(assessMilestoneOrder(stream, record(ShipmentMilestoneType.EXCEPTION, '2026-06-30T00:00Z')))
        .toBe('IN_ORDER');
    });
  });

  describe('deriveShipmentStatus', () => {
    it('stays PLANNED without milestones and maps each stage to its status', () => {
      expect(deriveShipmentStatus([])).toBe(ShipmentStatus.PLANNED);
      expect(deriveShipmentStatus([record(ShipmentMilestoneType.BOOKED, '2026-07-01T00:00Z')]))
        .toBe(ShipmentStatus.BOOKED);
      expect(deriveShipmentStatus([
        record(ShipmentMilestoneType.BOOKED, '2026-07-01T00:00Z'),
        record(ShipmentMilestoneType.DEPARTED, '2026-07-02T00:00Z')
      ])).toBe(ShipmentStatus.IN_TRANSIT);
      expect(deriveShipmentStatus([
        record(ShipmentMilestoneType.ARRIVED, '2026-07-05T00:00Z'),
        record(ShipmentMilestoneType.CUSTOMS_CLEARED, '2026-07-06T00:00Z')
      ])).toBe(ShipmentStatus.CUSTOMS);
      expect(deriveShipmentStatus([
        record(ShipmentMilestoneType.DELIVERED, '2026-07-09T00:00Z')
      ])).toBe(ShipmentStatus.DELIVERED);
    });

    it('surfaces EXCEPTION while it is the latest word, then recovers on a later stage', () => {
      const exceptional = [
        record(ShipmentMilestoneType.DEPARTED, '2026-07-02T00:00Z'),
        record(ShipmentMilestoneType.EXCEPTION, '2026-07-03T00:00Z')
      ];
      expect(deriveShipmentStatus(exceptional)).toBe(ShipmentStatus.EXCEPTION);
      expect(deriveShipmentStatus([
        ...exceptional,
        record(ShipmentMilestoneType.ARRIVED, '2026-07-05T00:00Z')
      ])).toBe(ShipmentStatus.CUSTOMS);
    });

    it('reports EXCEPTION when only exceptions exist', () => {
      expect(deriveShipmentStatus([
        record(ShipmentMilestoneType.EXCEPTION, '2026-07-01T00:00Z')
      ])).toBe(ShipmentStatus.EXCEPTION);
    });
  });
});
