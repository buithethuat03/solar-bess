import {
  validateScheduleWeights,
  validateWeights,
  type WeightedActivity,
  type WeightedWbsNode
} from 'src/modules/project-controls/domain';

const completeWbs: WeightedWbsNode[] = [
  { id: 'engineering', parentWbsId: null, weight: '60.0000' },
  { id: 'construction', parentWbsId: null, weight: '40.0000' },
  { id: 'design', parentWbsId: 'engineering', weight: '50.0000' },
  { id: 'review', parentWbsId: 'engineering', weight: '50.0000' }
];

const completeActivities: WeightedActivity[] = [
  { id: 'design-a', wbsId: 'design', weight: '60.0000' },
  { id: 'design-b', wbsId: 'design', weight: '40.0000' },
  { id: 'review-a', wbsId: 'review', weight: '100.0000' },
  { id: 'build-a', wbsId: 'construction', weight: '100.0000' }
];

describe('schedule weight invariants — TEST-010', () => {
  it('accepts exact fixed-decimal totals at every submit boundary', () => {
    const result = validateWeights(completeWbs, completeActivities, true);
    expect(result.valid).toBe(true);
    expect(result.issues).toEqual([]);
    expect(result.groupTotals).toEqual({
      ROOT: '100.0000',
      'WBS:engineering': '100.0000',
      'ACTIVITIES:construction': '100.0000',
      'ACTIVITIES:design': '100.0000',
      'ACTIVITIES:review': '100.0000'
    });
  });

  it('allows incremental draft totals but rejects overflow', () => {
    const partial = validateScheduleWeights(
      [
        { id: 'a', weight: '50.0000' },
        { id: 'b', weight: '40.0000' }
      ],
      [{ id: 'task', wbsId: 'a', weight: '25.0000' }],
      'DRAFT'
    );
    expect(partial.valid).toBe(true);

    const overflow = validateScheduleWeights(
      [
        { id: 'a', weight: '60.0000' },
        { id: 'b', weight: '40.0001' }
      ],
      [],
      'DRAFT'
    );
    expect(overflow.issues).toContainEqual(expect.objectContaining({
      code: 'WEIGHT_TOTAL_EXCEEDS_100', actualTotal: '100.0001', expectedTotal: '100.0000'
    }));
  });

  it('requires exact root, sibling and leaf-activity totals before submit', () => {
    const result = validateWeights(
      [
        { id: 'root-a', weight: '60.0000' },
        { id: 'root-b', weight: '30.0000' }
      ],
      [{ id: 'task', wbsId: 'root-a', weight: '99.9999' }],
      true
    );
    expect(result.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'WEIGHT_TOTAL_MUST_EQUAL_100', path: 'wbsNodes' }),
      expect.objectContaining({ code: 'WEIGHT_TOTAL_MUST_EQUAL_100', path: 'activities[wbsId=root-a]' }),
      expect.objectContaining({ code: 'WEIGHT_TOTAL_MUST_EQUAL_100', path: 'activities[wbsId=root-b]' })
    ]));
  });

  it('rejects invalid precision, activities on non-leaf WBS and WBS cycles', () => {
    const result = validateWeights(
      [
        { id: 'a', parentWbsId: 'b', weight: '50.00000' },
        { id: 'b', parentWbsId: 'a', weight: '100.0000' }
      ],
      [{ id: 'task', wbsId: 'a', weight: '100.0000' }],
      false
    );
    expect(result.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'INVALID_WEIGHT' }),
      expect.objectContaining({ code: 'WBS_CYCLE' }),
      expect.objectContaining({ code: 'ACTIVITY_REQUIRES_LEAF_WBS' })
    ]));
  });
});
