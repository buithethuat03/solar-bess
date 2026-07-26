import {
  Check, Column, CreateDateColumn, Entity, Index, PrimaryColumn, Unique, UpdateDateColumn
} from 'typeorm';
import { SavedViewShareScope, SavedViewTargetType } from './cross-cutting.enums';

/**
 * DB-106 — a user's stored filter/column/sort preset over one register (FR-172, US-023).
 *
 * A saved view stores presentation state, never permission: replaying it re-runs the register
 * query under the caller's CURRENT scope. `ck_saved_view_share_scope` is single-valued in V1 so
 * sharing is impossible by construction rather than merely unimplemented.
 */
@Entity({ name: 'saved_views' })
@Unique('uq_saved_views_tenant_id', ['tenantId', 'id'])
@Unique('uq_saved_view_owner_name', ['tenantId', 'ownerUserId', 'targetType', 'name'])
@Index('idx_saved_view_owner', ['tenantId', 'ownerUserId', 'targetType', 'createdAt'])
@Check('ck_saved_view_name', 'length(trim(name)) > 0')
@Check('ck_saved_view_target', `target_type IN
  ('PROJECT','DOCUMENT','RISK','ISSUE','CHANGE_REQUEST','CONTRACT')`)
// V1: deliberately single-valued — widening this CHECK is the approval gate for sharing.
@Check('ck_saved_view_share_scope', "share_scope IN ('PRIVATE')")
@Check('ck_saved_view_filter_object', "jsonb_typeof(filter_snapshot) = 'object'")
@Check('ck_saved_view_columns_array', "jsonb_typeof(column_snapshot) = 'array'")
@Check('ck_saved_view_sort_array', "jsonb_typeof(sort_snapshot) = 'array'")
@Check('ck_saved_view_version', 'version_no >= 1')
export class SavedViewEntity {
  @PrimaryColumn('uuid') id!: string;
  @Column('uuid', { name: 'tenant_id' }) tenantId!: string;
  @Column('uuid', { name: 'owner_user_id' }) ownerUserId!: string;
  @Column({ type: 'varchar', length: 200 }) name!: string;
  @Column({ name: 'target_type', type: 'varchar', length: 40 }) targetType!: SavedViewTargetType;
  @Column({ name: 'filter_snapshot', type: 'jsonb', default: () => "'{}'::jsonb" })
  filterSnapshot!: Record<string, unknown>;
  @Column({ name: 'column_snapshot', type: 'jsonb', default: () => "'[]'::jsonb" })
  columnSnapshot!: string[];
  @Column({ name: 'sort_snapshot', type: 'jsonb', default: () => "'[]'::jsonb" })
  sortSnapshot!: Record<string, unknown>[];
  @Column({ name: 'share_scope', type: 'varchar', length: 20, default: SavedViewShareScope.PRIVATE })
  shareScope!: SavedViewShareScope;
  @Column({ name: 'version_no', type: 'integer', default: 1 }) versionNo!: number;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' }) updatedAt!: Date;
}
