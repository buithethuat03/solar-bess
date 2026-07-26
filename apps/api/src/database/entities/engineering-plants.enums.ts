/**
 * FR-045 equipment model catalog lifecycle (DB-041). No approve operation exists in the API
 * catalog yet, so API-068 creates DRAFT rows and the APPROVED/SUPERSEDED members are reachable
 * only by seed/migration until a transition operation is allocated (recorded decision D2 of the
 * Engineering & Plants slice).
 */
export enum EquipmentModelStatus {
  DRAFT = 'DRAFT',
  IN_REVIEW = 'IN_REVIEW',
  APPROVED = 'APPROVED',
  SUPERSEDED = 'SUPERSEDED'
}

/**
 * FR-046/FR-047 BOM lifecycle (DB-042). RELEASED and SUPERSEDED rows are frozen by
 * `protect_bill_of_materials_history`; the only legal exit from RELEASED is the atomic supersede
 * that API-070 performs when it releases the next version.
 */
export enum BillOfMaterialsStatus {
  DRAFT = 'DRAFT',
  IN_REVIEW = 'IN_REVIEW',
  RELEASED = 'RELEASED',
  SUPERSEDED = 'SUPERSEDED'
}

/**
 * FR-050 substitution state carried on a BOM line (DB-043). API-071 (substitution submit) is
 * DEFERRED because its table has no allocated DB id; the vocabulary ships so released BOM lines
 * already carry the field the substitution workflow will drive later (recorded decision D3).
 */
export enum BomLineSubstitutionStatus {
  NONE = 'NONE',
  PROPOSED = 'PROPOSED',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED'
}

/** FR-125/FR-126 physical equipment lifecycle (DB-079). RETIRED is terminal and trigger-enforced. */
export enum EquipmentLifecycleStatus {
  RECEIVED = 'RECEIVED',
  INSTALLED = 'INSTALLED',
  COMMISSIONED = 'COMMISSIONED',
  OPERATIONAL = 'OPERATIONAL',
  REPLACED = 'REPLACED',
  RETIRED = 'RETIRED'
}

/** DB-080 operational asset status; ARCHIVED frees the one-active-asset-per-equipment slot. */
export enum AssetOperationalStatus {
  PENDING = 'PENDING',
  ACTIVE = 'ACTIVE',
  SUSPENDED = 'SUSPENDED',
  ARCHIVED = 'ARCHIVED'
}

/**
 * Shared plant configuration lifecycle for DB-081/DB-082. At most one RELEASED row exists per
 * site (partial unique index); RELEASED/SUPERSEDED rows are immutable apart from the
 * RELEASED → SUPERSEDED transition.
 */
export enum PlantStatus {
  DRAFT = 'DRAFT',
  RELEASED = 'RELEASED',
  SUPERSEDED = 'SUPERSEDED'
}
