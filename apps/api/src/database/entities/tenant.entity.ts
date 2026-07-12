import { Column, CreateDateColumn, Entity, PrimaryColumn, Unique, UpdateDateColumn } from 'typeorm';

@Entity({ name: 'tenants' })
@Unique('tenants_code_key', ['code'])
export class TenantEntity {
  @PrimaryColumn('uuid') id!: string;
  @Column({ length: 64 }) code!: string;
  @Column({ length: 200 }) name!: string;
  @Column({ length: 20, default: 'ACTIVE' }) status!: string;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' }) updatedAt!: Date;
}
