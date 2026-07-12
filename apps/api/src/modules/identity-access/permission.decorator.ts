import { SetMetadata } from '@nestjs/common';

export const PERMISSION_METADATA = 'required-permission';

export type PermissionScope = 'TENANT' | 'PROJECT' | 'ANY';

export interface PermissionRequirement {
  action: string | readonly string[];
  scope: PermissionScope;
}

export const RequirePermission = (action: string, scope: PermissionScope = 'ANY') =>
  SetMetadata(PERMISSION_METADATA, { action, scope } satisfies PermissionRequirement);

export const RequireAnyPermission = (
  actions: readonly string[], scope: PermissionScope = 'ANY'
) => SetMetadata(PERMISSION_METADATA, { action: actions, scope } satisfies PermissionRequirement);
