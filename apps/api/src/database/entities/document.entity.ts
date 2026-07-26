import {
  Check, Column, CreateDateColumn, Entity, Index, PrimaryColumn, Unique,
  UpdateDateColumn, VersionColumn
} from 'typeorm';
import { DocumentClassification, DocumentRecordStatus } from './document-control.enums';

/** DB-022 — the logical document; its bytes live on revisions, never here. */
@Entity({ name: 'documents' })
@Unique('uq_documents_tenant_id', ['tenantId', 'id'])
@Unique('uq_documents_project_id', ['tenantId', 'projectId', 'id'])
@Unique('uq_document_project_code', ['tenantId', 'projectId', 'documentCode'])
@Index('idx_document_register', ['tenantId', 'projectId', 'packageId', 'type', 'discipline'])
@Index('idx_document_classification', ['tenantId', 'projectId', 'classification'])
@Check('ck_document_code', "document_code ~ '^[A-Z0-9][A-Z0-9_./-]{1,79}$'")
@Check('ck_document_classification', "classification IN ('PUBLIC','INTERNAL','CONFIDENTIAL','RESTRICTED')")
@Check('ck_document_status', "status IN ('ACTIVE','SUPERSEDED','ARCHIVED')")
@Check('ck_document_version', 'version_no >= 1')
export class DocumentEntity {
  @PrimaryColumn('uuid') id!: string;
  @Column('uuid', { name: 'tenant_id' }) tenantId!: string;
  @Column('uuid', { name: 'project_id' }) projectId!: string;
  @Column('uuid', { name: 'package_id', nullable: true }) packageId!: string | null;
  @Column({ name: 'document_code', type: 'varchar', length: 80 }) documentCode!: string;
  @Column({ type: 'varchar', length: 400 }) title!: string;
  @Column({ type: 'varchar', length: 100 }) discipline!: string;
  @Column({ type: 'varchar', length: 100 }) type!: string;
  @Column({ type: 'varchar', length: 30 }) classification!: DocumentClassification;
  @Column('uuid', { name: 'owner_id' }) ownerId!: string;
  /** Points at the ISSUED revision that is authoritative today; null until the first issue. */
  @Column('uuid', { name: 'current_revision_id', nullable: true }) currentRevisionId!: string | null;
  @Column({ name: 'legal_hold', type: 'boolean', default: false }) legalHold!: boolean;
  @Column({ type: 'varchar', length: 30 }) status!: DocumentRecordStatus;
  @VersionColumn({ name: 'version_no' }) versionNo!: number;
  @Column('uuid', { name: 'created_by' }) createdBy!: string;
  @Column('uuid', { name: 'updated_by' }) updatedBy!: string;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' }) updatedAt!: Date;
}
