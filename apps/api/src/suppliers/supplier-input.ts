import type {
  CreateSupplierRequest,
  UpdateSupplierRequest,
} from '../contract/api.dto';
import {
  optional,
  requireAnyField,
  requireBoolean,
  requireString,
} from '../contract/input';

export function parseCreateSupplier(
  body: Partial<CreateSupplierRequest>,
): CreateSupplierRequest {
  return { name: requireString(body?.name, 'name') };
}

export function parseUpdateSupplier(
  body: Partial<UpdateSupplierRequest>,
): UpdateSupplierRequest {
  return requireAnyField(
    {
      name: optional(body?.name, 'name', requireString),
      active: optional(body?.active, 'active', requireBoolean),
    },
    'name or active',
  );
}
