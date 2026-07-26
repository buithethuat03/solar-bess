import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * DB-041…DB-043 and DB-079…DB-082 for the Engineering & Plants slice (API-067…API-070,
 * API-072…API-075). The DDL mirrors the entity decorators one-for-one: every `@Check`, `@Unique`
 * and `@Index` appears here under the same name.
 *
 * Shared hardening first: `uq_sites_tenant_project_id` and `uq_wbs_nodes_tenant_project_id` are
 * added at the top of `up()` (and dropped last in `down()`) because other domains wait on these
 * candidate keys to write composite site/WBS foreign keys of their own.
 *
 * Deliberate absences, each a recorded decision:
 * - no substitutions table — API-071 is DEFERRED, its table has no allocated DB id (D3);
 * - no serial_numbers foreign key on equipment.serial_number_id — the table belongs to
 *   Procurement and does not exist yet;
 * - no systems foreign key on equipment.system_id — DB-073 is absent from the implemented schema;
 * - no host/username/password/token/url/endpoint/secret column anywhere on bess_plants or
 *   solar_plants — the SEC-127/SEC-128 control is the schema-level absence of any OT
 *   connectivity coordinate, asserted by tests against information_schema.
 *
 * Quantities and capacities are `numeric(19,4)` and cross this API as text; every foreign key is
 * composite and carries `tenant_id`, so no row can reference another tenant's data.
 */
export class CreateEngineeringPlants1783744000000 implements MigrationInterface {
  name = 'CreateEngineeringPlants1783744000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    // Shared hardening ALTERs — FIRST, other domains depend on them.
    await queryRunner.query(`ALTER TABLE sites
      ADD CONSTRAINT uq_sites_tenant_project_id UNIQUE (tenant_id, project_id, id)`);
    await queryRunner.query(`ALTER TABLE wbs_nodes
      ADD CONSTRAINT uq_wbs_nodes_tenant_project_id UNIQUE (tenant_id, project_id, id)`);

    await queryRunner.query(`CREATE TABLE equipment_models (
      id uuid NOT NULL,
      tenant_id uuid NOT NULL,
      manufacturer_company_id uuid,
      equipment_class varchar(100) NOT NULL,
      manufacturer varchar(200) NOT NULL,
      model varchar(200) NOT NULL,
      ratings jsonb NOT NULL DEFAULT '{}'::jsonb,
      spec_version varchar(60) NOT NULL,
      status varchar(20) NOT NULL,
      superseded_by_id uuid,
      version_no integer NOT NULL DEFAULT 1,
      created_by uuid NOT NULL,
      updated_by uuid NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT pk_equipment_models PRIMARY KEY (id),
      CONSTRAINT uq_equipment_models_tenant_id UNIQUE (tenant_id, id),
      CONSTRAINT uq_equipment_model_identity UNIQUE (tenant_id, manufacturer, model, spec_version),
      CONSTRAINT fk_equipment_model_tenant FOREIGN KEY (tenant_id)
        REFERENCES tenants (id) ON DELETE RESTRICT,
      CONSTRAINT fk_equipment_model_manufacturer FOREIGN KEY (tenant_id, manufacturer_company_id)
        REFERENCES companies (tenant_id, id) ON DELETE RESTRICT,
      CONSTRAINT fk_equipment_model_superseded_by FOREIGN KEY (tenant_id, superseded_by_id)
        REFERENCES equipment_models (tenant_id, id) ON DELETE RESTRICT,
      CONSTRAINT fk_equipment_model_created_by FOREIGN KEY (tenant_id, created_by)
        REFERENCES user_accounts (tenant_id, id) ON DELETE RESTRICT,
      CONSTRAINT fk_equipment_model_updated_by FOREIGN KEY (tenant_id, updated_by)
        REFERENCES user_accounts (tenant_id, id) ON DELETE RESTRICT,
      CONSTRAINT ck_equipment_model_status CHECK
        (status IN ('DRAFT','IN_REVIEW','APPROVED','SUPERSEDED')),
      CONSTRAINT ck_equipment_model_ratings CHECK (jsonb_typeof(ratings) = 'object'),
      CONSTRAINT ck_equipment_model_superseded_self CHECK
        (superseded_by_id IS NULL OR superseded_by_id <> id),
      CONSTRAINT ck_equipment_model_superseded_status CHECK
        (superseded_by_id IS NULL OR status = 'SUPERSEDED'),
      CONSTRAINT ck_equipment_model_version CHECK (version_no >= 1)
    )`);
    await queryRunner.query(`CREATE INDEX idx_equipment_model_class
      ON equipment_models (tenant_id, equipment_class, status)`);

    await queryRunner.query(`CREATE TABLE bill_of_materials (
      id uuid NOT NULL,
      tenant_id uuid NOT NULL,
      project_id uuid NOT NULL,
      design_revision_id uuid NOT NULL,
      version integer NOT NULL,
      status varchar(20) NOT NULL,
      released_by uuid,
      released_at timestamptz,
      snapshot_hash char(64),
      version_no integer NOT NULL DEFAULT 1,
      created_by uuid NOT NULL,
      updated_by uuid NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT pk_bill_of_materials PRIMARY KEY (id),
      CONSTRAINT uq_bill_of_materials_tenant_id UNIQUE (tenant_id, id),
      CONSTRAINT uq_bill_of_materials_project_id UNIQUE (tenant_id, project_id, id),
      CONSTRAINT uq_bom_project_version UNIQUE (tenant_id, project_id, version),
      CONSTRAINT fk_bom_tenant FOREIGN KEY (tenant_id)
        REFERENCES tenants (id) ON DELETE RESTRICT,
      CONSTRAINT fk_bom_project FOREIGN KEY (tenant_id, project_id)
        REFERENCES projects (tenant_id, id) ON DELETE RESTRICT,
      CONSTRAINT fk_bom_design_revision FOREIGN KEY (tenant_id, design_revision_id)
        REFERENCES document_revisions (tenant_id, id) ON DELETE RESTRICT,
      CONSTRAINT fk_bom_released_by FOREIGN KEY (tenant_id, released_by)
        REFERENCES user_accounts (tenant_id, id) ON DELETE RESTRICT,
      CONSTRAINT fk_bom_created_by FOREIGN KEY (tenant_id, created_by)
        REFERENCES user_accounts (tenant_id, id) ON DELETE RESTRICT,
      CONSTRAINT fk_bom_updated_by FOREIGN KEY (tenant_id, updated_by)
        REFERENCES user_accounts (tenant_id, id) ON DELETE RESTRICT,
      CONSTRAINT ck_bom_status CHECK (status IN ('DRAFT','IN_REVIEW','RELEASED','SUPERSEDED')),
      CONSTRAINT ck_bom_version CHECK (version >= 1),
      CONSTRAINT ck_bom_released_pair CHECK ((released_by IS NULL) = (released_at IS NULL)),
      CONSTRAINT ck_bom_released_fields CHECK (status <> 'RELEASED'
        OR (snapshot_hash IS NOT NULL AND released_by IS NOT NULL)),
      CONSTRAINT ck_bom_hash_format CHECK (snapshot_hash IS NULL OR snapshot_hash ~ '^[0-9a-f]{64}$'),
      CONSTRAINT ck_bom_version_no CHECK (version_no >= 1)
    )`);
    // FR-047: one current release per project — structural, not service code.
    await queryRunner.query(`CREATE UNIQUE INDEX uq_bom_released_per_project
      ON bill_of_materials (tenant_id, project_id) WHERE status = 'RELEASED'`);

    await queryRunner.query(`CREATE TABLE bom_lines (
      id uuid NOT NULL,
      tenant_id uuid NOT NULL,
      bill_of_materials_id uuid NOT NULL,
      equipment_model_id uuid,
      line_no integer NOT NULL,
      item_code varchar(80) NOT NULL,
      description varchar(1000),
      quantity numeric(19,4) NOT NULL,
      unit varchar(40) NOT NULL,
      substitution_status varchar(20) NOT NULL DEFAULT 'NONE',
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT pk_bom_lines PRIMARY KEY (id),
      CONSTRAINT uq_bom_lines_tenant_id UNIQUE (tenant_id, id),
      CONSTRAINT uq_bom_line_number UNIQUE (tenant_id, bill_of_materials_id, line_no),
      CONSTRAINT fk_bom_line_tenant FOREIGN KEY (tenant_id)
        REFERENCES tenants (id) ON DELETE RESTRICT,
      CONSTRAINT fk_bom_line_parent FOREIGN KEY (tenant_id, bill_of_materials_id)
        REFERENCES bill_of_materials (tenant_id, id) ON DELETE RESTRICT,
      CONSTRAINT fk_bom_line_equipment_model FOREIGN KEY (tenant_id, equipment_model_id)
        REFERENCES equipment_models (tenant_id, id) ON DELETE RESTRICT,
      CONSTRAINT ck_bom_line_number CHECK (line_no >= 1),
      CONSTRAINT ck_bom_line_quantity CHECK (quantity > 0),
      CONSTRAINT ck_bom_line_substitution CHECK
        (substitution_status IN ('NONE','PROPOSED','APPROVED','REJECTED'))
    )`);
    await queryRunner.query(`CREATE INDEX idx_bom_line_model
      ON bom_lines (tenant_id, equipment_model_id)`);
    await queryRunner.query(`CREATE INDEX idx_bom_line_item_code
      ON bom_lines (tenant_id, item_code)`);

    await queryRunner.query(`CREATE TABLE equipment (
      id uuid NOT NULL,
      tenant_id uuid NOT NULL,
      project_id uuid NOT NULL,
      equipment_model_id uuid NOT NULL,
      serial_number_id uuid,
      parent_equipment_id uuid,
      equipment_type varchar(100) NOT NULL,
      site_id uuid NOT NULL,
      system_id uuid,
      lifecycle_status varchar(20) NOT NULL,
      installed_at timestamptz,
      replaced_by_id uuid,
      version_no integer NOT NULL DEFAULT 1,
      created_by uuid NOT NULL,
      updated_by uuid NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT pk_equipment PRIMARY KEY (id),
      CONSTRAINT uq_equipment_tenant_id UNIQUE (tenant_id, id),
      CONSTRAINT uq_equipment_project_id UNIQUE (tenant_id, project_id, id),
      CONSTRAINT fk_equipment_tenant FOREIGN KEY (tenant_id)
        REFERENCES tenants (id) ON DELETE RESTRICT,
      CONSTRAINT fk_equipment_project FOREIGN KEY (tenant_id, project_id)
        REFERENCES projects (tenant_id, id) ON DELETE RESTRICT,
      CONSTRAINT fk_equipment_model FOREIGN KEY (tenant_id, equipment_model_id)
        REFERENCES equipment_models (tenant_id, id) ON DELETE RESTRICT,
      CONSTRAINT fk_equipment_parent FOREIGN KEY (tenant_id, parent_equipment_id)
        REFERENCES equipment (tenant_id, id) ON DELETE RESTRICT,
      CONSTRAINT fk_equipment_site FOREIGN KEY (tenant_id, project_id, site_id)
        REFERENCES sites (tenant_id, project_id, id) ON DELETE RESTRICT,
      CONSTRAINT fk_equipment_replaced_by FOREIGN KEY (tenant_id, replaced_by_id)
        REFERENCES equipment (tenant_id, id) ON DELETE RESTRICT,
      CONSTRAINT fk_equipment_created_by FOREIGN KEY (tenant_id, created_by)
        REFERENCES user_accounts (tenant_id, id) ON DELETE RESTRICT,
      CONSTRAINT fk_equipment_updated_by FOREIGN KEY (tenant_id, updated_by)
        REFERENCES user_accounts (tenant_id, id) ON DELETE RESTRICT,
      CONSTRAINT ck_equipment_lifecycle CHECK (lifecycle_status IN
        ('RECEIVED','INSTALLED','COMMISSIONED','OPERATIONAL','REPLACED','RETIRED')),
      CONSTRAINT ck_equipment_parent_self CHECK
        (parent_equipment_id IS NULL OR parent_equipment_id <> id),
      CONSTRAINT ck_equipment_replaced_self CHECK
        (replaced_by_id IS NULL OR replaced_by_id <> id),
      CONSTRAINT ck_equipment_replaced_status CHECK
        (replaced_by_id IS NULL OR lifecycle_status = 'REPLACED'),
      CONSTRAINT ck_equipment_version CHECK (version_no >= 1)
    )`);
    await queryRunner.query(`CREATE UNIQUE INDEX uq_equipment_serial
      ON equipment (tenant_id, serial_number_id) WHERE serial_number_id IS NOT NULL`);
    await queryRunner.query(`CREATE INDEX idx_equipment_site
      ON equipment (tenant_id, project_id, site_id)`);
    await queryRunner.query(`CREATE INDEX idx_equipment_model
      ON equipment (tenant_id, equipment_model_id)`);
    await queryRunner.query(`CREATE INDEX idx_equipment_lifecycle
      ON equipment (tenant_id, lifecycle_status)`);

    await queryRunner.query(`CREATE TABLE assets (
      id uuid NOT NULL,
      tenant_id uuid NOT NULL,
      equipment_id uuid NOT NULL,
      project_id uuid NOT NULL,
      site_id uuid NOT NULL,
      asset_code varchar(80) NOT NULL,
      activation_date date,
      operational_status varchar(30) NOT NULL,
      dossier_ref jsonb,
      external_financial_asset_ref varchar(200),
      version_no integer NOT NULL DEFAULT 1,
      created_by uuid NOT NULL,
      updated_by uuid NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT pk_assets PRIMARY KEY (id),
      CONSTRAINT uq_assets_tenant_id UNIQUE (tenant_id, id),
      CONSTRAINT uq_assets_site_id UNIQUE (tenant_id, site_id, id),
      CONSTRAINT uq_asset_code UNIQUE (tenant_id, asset_code),
      CONSTRAINT fk_asset_tenant FOREIGN KEY (tenant_id)
        REFERENCES tenants (id) ON DELETE RESTRICT,
      CONSTRAINT fk_asset_equipment FOREIGN KEY (tenant_id, equipment_id)
        REFERENCES equipment (tenant_id, id) ON DELETE RESTRICT,
      CONSTRAINT fk_asset_site FOREIGN KEY (tenant_id, project_id, site_id)
        REFERENCES sites (tenant_id, project_id, id) ON DELETE RESTRICT,
      CONSTRAINT fk_asset_created_by FOREIGN KEY (tenant_id, created_by)
        REFERENCES user_accounts (tenant_id, id) ON DELETE RESTRICT,
      CONSTRAINT fk_asset_updated_by FOREIGN KEY (tenant_id, updated_by)
        REFERENCES user_accounts (tenant_id, id) ON DELETE RESTRICT,
      CONSTRAINT ck_asset_status CHECK
        (operational_status IN ('PENDING','ACTIVE','SUSPENDED','ARCHIVED')),
      CONSTRAINT ck_asset_version CHECK (version_no >= 1)
    )`);
    await queryRunner.query(`CREATE UNIQUE INDEX uq_asset_equipment_active
      ON assets (tenant_id, equipment_id) WHERE operational_status <> 'ARCHIVED'`);
    await queryRunner.query(`CREATE INDEX idx_asset_site
      ON assets (tenant_id, project_id, site_id)`);

    await queryRunner.query(`CREATE TABLE solar_plants (
      id uuid NOT NULL,
      tenant_id uuid NOT NULL,
      project_id uuid NOT NULL,
      site_id uuid NOT NULL,
      root_asset_id uuid NOT NULL,
      dc_capacity_kwp numeric(19,4) NOT NULL,
      ac_capacity_kw numeric(19,4) NOT NULL,
      configuration_version integer NOT NULL,
      configuration jsonb NOT NULL,
      configuration_hash char(64) NOT NULL,
      baseline_ref jsonb,
      status varchar(20) NOT NULL,
      version_no integer NOT NULL DEFAULT 1,
      created_by uuid NOT NULL,
      updated_by uuid NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT pk_solar_plants PRIMARY KEY (id),
      CONSTRAINT uq_solar_plants_tenant_id UNIQUE (tenant_id, id),
      CONSTRAINT uq_solar_plant_config_version UNIQUE (tenant_id, site_id, configuration_version),
      CONSTRAINT fk_solar_plant_tenant FOREIGN KEY (tenant_id)
        REFERENCES tenants (id) ON DELETE RESTRICT,
      CONSTRAINT fk_solar_plant_site FOREIGN KEY (tenant_id, project_id, site_id)
        REFERENCES sites (tenant_id, project_id, id) ON DELETE RESTRICT,
      CONSTRAINT fk_solar_plant_root_asset FOREIGN KEY (tenant_id, root_asset_id)
        REFERENCES assets (tenant_id, id) ON DELETE RESTRICT,
      CONSTRAINT fk_solar_plant_created_by FOREIGN KEY (tenant_id, created_by)
        REFERENCES user_accounts (tenant_id, id) ON DELETE RESTRICT,
      CONSTRAINT fk_solar_plant_updated_by FOREIGN KEY (tenant_id, updated_by)
        REFERENCES user_accounts (tenant_id, id) ON DELETE RESTRICT,
      CONSTRAINT ck_solar_plant_status CHECK (status IN ('DRAFT','RELEASED','SUPERSEDED')),
      CONSTRAINT ck_solar_plant_dc_capacity CHECK (dc_capacity_kwp > 0),
      CONSTRAINT ck_solar_plant_ac_capacity CHECK (ac_capacity_kw > 0),
      CONSTRAINT ck_solar_plant_config_version CHECK (configuration_version >= 1),
      CONSTRAINT ck_solar_plant_configuration CHECK (jsonb_typeof(configuration) = 'object'),
      CONSTRAINT ck_solar_plant_hash_format CHECK (configuration_hash ~ '^[0-9a-f]{64}$'),
      CONSTRAINT ck_solar_plant_version CHECK (version_no >= 1)
    )`);
    await queryRunner.query(`CREATE UNIQUE INDEX uq_solar_plant_released
      ON solar_plants (tenant_id, site_id) WHERE status = 'RELEASED'`);
    await queryRunner.query(`CREATE INDEX idx_solar_plant_site
      ON solar_plants (tenant_id, project_id, site_id)`);

    // SEC-127/SEC-128: this table intentionally has NO host/username/password/token/url/endpoint/
    // secret column. PM Web can describe a BESS plant but can never store a way to reach one.
    await queryRunner.query(`CREATE TABLE bess_plants (
      id uuid NOT NULL,
      tenant_id uuid NOT NULL,
      project_id uuid NOT NULL,
      site_id uuid NOT NULL,
      root_asset_id uuid NOT NULL,
      power_mw numeric(19,4) NOT NULL,
      energy_mwh numeric(19,4) NOT NULL,
      hierarchy_version integer NOT NULL,
      operating_envelope jsonb NOT NULL,
      point_list_version varchar(60),
      status varchar(20) NOT NULL,
      version_no integer NOT NULL DEFAULT 1,
      created_by uuid NOT NULL,
      updated_by uuid NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT pk_bess_plants PRIMARY KEY (id),
      CONSTRAINT uq_bess_plants_tenant_id UNIQUE (tenant_id, id),
      CONSTRAINT uq_bess_plant_hierarchy_version UNIQUE (tenant_id, site_id, hierarchy_version),
      CONSTRAINT fk_bess_plant_tenant FOREIGN KEY (tenant_id)
        REFERENCES tenants (id) ON DELETE RESTRICT,
      CONSTRAINT fk_bess_plant_site FOREIGN KEY (tenant_id, project_id, site_id)
        REFERENCES sites (tenant_id, project_id, id) ON DELETE RESTRICT,
      CONSTRAINT fk_bess_plant_root_asset FOREIGN KEY (tenant_id, root_asset_id)
        REFERENCES assets (tenant_id, id) ON DELETE RESTRICT,
      CONSTRAINT fk_bess_plant_created_by FOREIGN KEY (tenant_id, created_by)
        REFERENCES user_accounts (tenant_id, id) ON DELETE RESTRICT,
      CONSTRAINT fk_bess_plant_updated_by FOREIGN KEY (tenant_id, updated_by)
        REFERENCES user_accounts (tenant_id, id) ON DELETE RESTRICT,
      CONSTRAINT ck_bess_plant_status CHECK (status IN ('DRAFT','RELEASED','SUPERSEDED')),
      CONSTRAINT ck_bess_plant_power CHECK (power_mw > 0),
      CONSTRAINT ck_bess_plant_energy CHECK (energy_mwh > 0),
      CONSTRAINT ck_bess_plant_hierarchy_version CHECK (hierarchy_version >= 1),
      CONSTRAINT ck_bess_plant_envelope CHECK (jsonb_typeof(operating_envelope) = 'object'),
      CONSTRAINT ck_bess_plant_version CHECK (version_no >= 1)
    )`);
    await queryRunner.query(`CREATE UNIQUE INDEX uq_bess_plant_released
      ON bess_plants (tenant_id, site_id) WHERE status = 'RELEASED'`);
    await queryRunner.query(`CREATE INDEX idx_bess_plant_site
      ON bess_plants (tenant_id, project_id, site_id)`);

    // FR-045: an APPROVED model is an engineering fact other rows (BOM lines, equipment) point at.
    // Its business content is frozen; the APPROVED → SUPERSEDED transition writing
    // superseded_by_id stays legal because status/superseded_by_id are not guarded while APPROVED
    // — the same idiom as issued document revisions. SUPERSEDED is fully terminal.
    await queryRunner.query(`CREATE FUNCTION protect_equipment_model_history()
    RETURNS trigger
    LANGUAGE plpgsql
    AS $$
    BEGIN
      IF TG_OP = 'DELETE' THEN
        IF OLD.status IN ('APPROVED','SUPERSEDED') THEN
          RAISE EXCEPTION USING ERRCODE = '55000',
            MESSAGE = 'approved equipment models cannot be deleted; supersede them instead';
        END IF;
        RETURN OLD;
      END IF;
      IF OLD.status = 'SUPERSEDED'
         AND (to_jsonb(NEW) - ARRAY['version_no','updated_by','updated_at']::text[])
         <> (to_jsonb(OLD) - ARRAY['version_no','updated_by','updated_at']::text[]) THEN
        RAISE EXCEPTION USING ERRCODE = '55000',
          MESSAGE = 'superseded equipment models are immutable';
      END IF;
      IF OLD.status = 'APPROVED' AND (
        NEW.equipment_class IS DISTINCT FROM OLD.equipment_class
        OR NEW.manufacturer IS DISTINCT FROM OLD.manufacturer
        OR NEW.model IS DISTINCT FROM OLD.model
        OR NEW.ratings IS DISTINCT FROM OLD.ratings
        OR NEW.spec_version IS DISTINCT FROM OLD.spec_version
        OR NEW.manufacturer_company_id IS DISTINCT FROM OLD.manufacturer_company_id
      ) THEN
        RAISE EXCEPTION USING ERRCODE = '55000',
          MESSAGE = 'approved equipment model business content is immutable';
      END IF;
      IF OLD.status = 'APPROVED' AND NEW.status IS DISTINCT FROM OLD.status
         AND NEW.status <> 'SUPERSEDED' THEN
        RAISE EXCEPTION USING ERRCODE = '55000',
          MESSAGE = 'an approved equipment model may only be superseded';
      END IF;
      RETURN NEW;
    END $$`);
    await queryRunner.query(`CREATE TRIGGER trg_equipment_model_history
      BEFORE UPDATE OR DELETE ON equipment_models
      FOR EACH ROW EXECUTE FUNCTION protect_equipment_model_history()`);

    // FR-047: a released BOM version is procurement's contract with engineering. It may only be
    // superseded by the release of the next version, never edited or deleted.
    await queryRunner.query(`CREATE FUNCTION protect_bill_of_materials_history()
    RETURNS trigger
    LANGUAGE plpgsql
    AS $$
    BEGIN
      IF TG_OP = 'DELETE' THEN
        IF OLD.status IN ('RELEASED','SUPERSEDED') THEN
          RAISE EXCEPTION USING ERRCODE = '55000',
            MESSAGE = 'released BOM versions cannot be deleted';
        END IF;
        RETURN OLD;
      END IF;
      IF OLD.status = 'SUPERSEDED'
         AND (to_jsonb(NEW) - ARRAY['version_no','updated_by','updated_at']::text[])
         <> (to_jsonb(OLD) - ARRAY['version_no','updated_by','updated_at']::text[]) THEN
        RAISE EXCEPTION USING ERRCODE = '55000',
          MESSAGE = 'superseded BOM versions are immutable';
      END IF;
      IF OLD.status = 'RELEASED' AND (
        NEW.status <> 'SUPERSEDED'
        OR (to_jsonb(NEW) - ARRAY['status','version_no','updated_by','updated_at']::text[])
        <> (to_jsonb(OLD) - ARRAY['status','version_no','updated_by','updated_at']::text[])
      ) THEN
        RAISE EXCEPTION USING ERRCODE = '55000',
          MESSAGE = 'released BOM versions are immutable; they can only be superseded';
      END IF;
      RETURN NEW;
    END $$`);
    await queryRunner.query(`CREATE TRIGGER trg_bill_of_materials_history
      BEFORE UPDATE OR DELETE ON bill_of_materials
      FOR EACH ROW EXECUTE FUNCTION protect_bill_of_materials_history()`);

    // FR-047: the lines ARE the released content, so the freeze is read from the parent status —
    // including INSERT, so no line can be smuggled into an already-released version.
    await queryRunner.query(`CREATE FUNCTION protect_bom_line_history()
    RETURNS trigger
    LANGUAGE plpgsql
    AS $$
    DECLARE
      parent_status varchar(20);
    BEGIN
      IF TG_OP = 'DELETE' THEN
        SELECT status INTO parent_status FROM bill_of_materials
          WHERE tenant_id = OLD.tenant_id AND id = OLD.bill_of_materials_id;
        IF parent_status IN ('RELEASED','SUPERSEDED') THEN
          RAISE EXCEPTION USING ERRCODE = '55000',
            MESSAGE = 'lines of a released BOM version are immutable';
        END IF;
        RETURN OLD;
      END IF;
      SELECT status INTO parent_status FROM bill_of_materials
        WHERE tenant_id = NEW.tenant_id AND id = NEW.bill_of_materials_id;
      IF parent_status IN ('RELEASED','SUPERSEDED') THEN
        RAISE EXCEPTION USING ERRCODE = '55000',
          MESSAGE = 'lines of a released BOM version are immutable';
      END IF;
      RETURN NEW;
    END $$`);
    await queryRunner.query(`CREATE TRIGGER trg_bom_line_history
      BEFORE INSERT OR UPDATE OR DELETE ON bom_lines
      FOR EACH ROW EXECUTE FUNCTION protect_bom_line_history()`);

    // FR-125: physical equipment is never hard-deleted, and RETIRED is terminal.
    await queryRunner.query(`CREATE FUNCTION protect_equipment_history()
    RETURNS trigger
    LANGUAGE plpgsql
    AS $$
    BEGIN
      IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION USING ERRCODE = '55000',
          MESSAGE = 'equipment cannot be deleted; retire it instead';
      END IF;
      IF OLD.lifecycle_status = 'RETIRED'
         AND (to_jsonb(NEW) - ARRAY['version_no','updated_by','updated_at']::text[])
         <> (to_jsonb(OLD) - ARRAY['version_no','updated_by','updated_at']::text[]) THEN
        RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'retired equipment is immutable';
      END IF;
      RETURN NEW;
    END $$`);
    await queryRunner.query(`CREATE TRIGGER trg_equipment_history
      BEFORE UPDATE OR DELETE ON equipment
      FOR EACH ROW EXECUTE FUNCTION protect_equipment_history()`);

    // DB-080: an asset row is the operations ledger identity of equipment — archive, never delete.
    await queryRunner.query(`CREATE FUNCTION protect_asset_history()
    RETURNS trigger
    LANGUAGE plpgsql
    AS $$
    BEGIN
      RAISE EXCEPTION USING ERRCODE = '55000',
        MESSAGE = 'assets cannot be deleted; archive them instead';
    END $$`);
    await queryRunner.query(`CREATE TRIGGER trg_asset_history
      BEFORE DELETE ON assets
      FOR EACH ROW EXECUTE FUNCTION protect_asset_history()`);

    // FR-126/FR-130: a released plant configuration is the engineering baseline O&M reads. It may
    // only be superseded by the next released version; SUPERSEDED is terminal. One function serves
    // both plant tables — they share the lifecycle.
    await queryRunner.query(`CREATE FUNCTION protect_plant_configuration_history()
    RETURNS trigger
    LANGUAGE plpgsql
    AS $$
    BEGIN
      IF TG_OP = 'DELETE' THEN
        IF OLD.status IN ('RELEASED','SUPERSEDED') THEN
          RAISE EXCEPTION USING ERRCODE = '55000',
            MESSAGE = 'released plant configurations cannot be deleted';
        END IF;
        RETURN OLD;
      END IF;
      IF OLD.status = 'SUPERSEDED'
         AND (to_jsonb(NEW) - ARRAY['version_no','updated_by','updated_at']::text[])
         <> (to_jsonb(OLD) - ARRAY['version_no','updated_by','updated_at']::text[]) THEN
        RAISE EXCEPTION USING ERRCODE = '55000',
          MESSAGE = 'superseded plant configurations are immutable';
      END IF;
      IF OLD.status = 'RELEASED' AND (
        NEW.status <> 'SUPERSEDED'
        OR (to_jsonb(NEW) - ARRAY['status','version_no','updated_by','updated_at']::text[])
        <> (to_jsonb(OLD) - ARRAY['status','version_no','updated_by','updated_at']::text[])
      ) THEN
        RAISE EXCEPTION USING ERRCODE = '55000',
          MESSAGE = 'released plant configurations are immutable; they can only be superseded';
      END IF;
      RETURN NEW;
    END $$`);
    await queryRunner.query(`CREATE TRIGGER trg_solar_plant_history
      BEFORE UPDATE OR DELETE ON solar_plants
      FOR EACH ROW EXECUTE FUNCTION protect_plant_configuration_history()`);
    await queryRunner.query(`CREATE TRIGGER trg_bess_plant_history
      BEFORE UPDATE OR DELETE ON bess_plants
      FOR EACH ROW EXECUTE FUNCTION protect_plant_configuration_history()`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TRIGGER IF EXISTS trg_bess_plant_history ON bess_plants');
    await queryRunner.query('DROP TRIGGER IF EXISTS trg_solar_plant_history ON solar_plants');
    await queryRunner.query('DROP FUNCTION IF EXISTS protect_plant_configuration_history()');
    await queryRunner.query('DROP TRIGGER IF EXISTS trg_asset_history ON assets');
    await queryRunner.query('DROP FUNCTION IF EXISTS protect_asset_history()');
    await queryRunner.query('DROP TRIGGER IF EXISTS trg_equipment_history ON equipment');
    await queryRunner.query('DROP FUNCTION IF EXISTS protect_equipment_history()');
    await queryRunner.query('DROP TRIGGER IF EXISTS trg_bom_line_history ON bom_lines');
    await queryRunner.query('DROP FUNCTION IF EXISTS protect_bom_line_history()');
    await queryRunner.query('DROP TRIGGER IF EXISTS trg_bill_of_materials_history ON bill_of_materials');
    await queryRunner.query('DROP FUNCTION IF EXISTS protect_bill_of_materials_history()');
    await queryRunner.query('DROP TRIGGER IF EXISTS trg_equipment_model_history ON equipment_models');
    await queryRunner.query('DROP FUNCTION IF EXISTS protect_equipment_model_history()');

    await queryRunner.query('DROP TABLE IF EXISTS bess_plants');
    await queryRunner.query('DROP TABLE IF EXISTS solar_plants');
    await queryRunner.query('DROP TABLE IF EXISTS assets');
    await queryRunner.query('DROP TABLE IF EXISTS equipment');
    await queryRunner.query('DROP TABLE IF EXISTS bom_lines');
    await queryRunner.query('DROP TABLE IF EXISTS bill_of_materials');
    await queryRunner.query('DROP TABLE IF EXISTS equipment_models');

    // The shared hardening ALTERs go last, mirroring their first position in up().
    await queryRunner.query(`ALTER TABLE wbs_nodes
      DROP CONSTRAINT IF EXISTS uq_wbs_nodes_tenant_project_id`);
    await queryRunner.query(`ALTER TABLE sites
      DROP CONSTRAINT IF EXISTS uq_sites_tenant_project_id`);
  }
}
