import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddActionResidualRationale1783734000000 implements MigrationInterface {
  name = 'AddActionResidualRationale1783734000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE risk_issue_actions
      ADD COLUMN residual_rationale varchar(2000) NULL`);
    await queryRunner.query(`ALTER TABLE risk_issue_actions
      DROP CONSTRAINT ck_risk_issue_action_residual_complete`);
    await queryRunner.query(`ALTER TABLE risk_issue_actions
      ADD CONSTRAINT ck_risk_issue_action_residual_complete CHECK ((
        residual_probability IS NULL AND residual_cost_impact_rating IS NULL
        AND residual_schedule_impact_rating IS NULL AND residual_hse_impact_rating IS NULL
        AND residual_rationale IS NULL AND residual_risk_version IS NULL
      ) OR (
        risk_id IS NOT NULL AND residual_probability BETWEEN 1 AND 5
        AND residual_cost_impact_rating BETWEEN 1 AND 5
        AND residual_schedule_impact_rating BETWEEN 1 AND 5
        AND residual_hse_impact_rating BETWEEN 1 AND 5
        AND (residual_rationale IS NULL OR length(trim(residual_rationale)) >= 3)
        AND residual_risk_version >= 1
      ))`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DO $$
    BEGIN
      IF EXISTS (
        SELECT 1 FROM risk_issue_actions WHERE residual_rationale IS NOT NULL
      ) THEN
        RAISE EXCEPTION USING ERRCODE = '55000',
          MESSAGE = 'cannot revert residual rationale migration while rationale data exists';
      END IF;
    END $$`);
    await queryRunner.query(`ALTER TABLE risk_issue_actions
      DROP CONSTRAINT ck_risk_issue_action_residual_complete`);
    await queryRunner.query(`ALTER TABLE risk_issue_actions
      ADD CONSTRAINT ck_risk_issue_action_residual_complete CHECK ((
        residual_probability IS NULL AND residual_cost_impact_rating IS NULL
        AND residual_schedule_impact_rating IS NULL AND residual_hse_impact_rating IS NULL
        AND residual_risk_version IS NULL
      ) OR (
        risk_id IS NOT NULL AND residual_probability BETWEEN 1 AND 5
        AND residual_cost_impact_rating BETWEEN 1 AND 5
        AND residual_schedule_impact_rating BETWEEN 1 AND 5
        AND residual_hse_impact_rating BETWEEN 1 AND 5 AND residual_risk_version >= 1
      ))`);
    await queryRunner.query(`ALTER TABLE risk_issue_actions DROP COLUMN residual_rationale`);
  }
}
