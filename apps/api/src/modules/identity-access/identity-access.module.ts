import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  AuditEventEntity, AuthenticationSessionEntity, LocalCredentialEntity,
  PackageEntity, ProjectEntity, RoleAssignmentEntity, TenantEntity, UserAccountEntity
} from '../../database/entities';
import { AccessGuard } from './access.guard';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { LoginRateLimitService } from './login-rate-limit.service';
import { PasswordService } from './password.service';
import { TokenService } from './token.service';
import { PermissionGuard } from './permission.guard';
import { PermissionService } from './permission.service';
import { OperationalFoundationModule } from '../operational-foundation/operational-foundation.module';

@Module({
  imports: [
    JwtModule.register({}),
    OperationalFoundationModule,
    TypeOrmModule.forFeature([
      TenantEntity, UserAccountEntity, LocalCredentialEntity,
      AuthenticationSessionEntity, AuditEventEntity, RoleAssignmentEntity, ProjectEntity, PackageEntity
    ])
  ],
  controllers: [AuthController],
  providers: [
    AuthService, TokenService, PasswordService, LoginRateLimitService,
    AccessGuard, PermissionService, PermissionGuard
  ],
  exports: [AuthService, AccessGuard, PermissionService, PermissionGuard]
})
export class IdentityAccessModule {}
