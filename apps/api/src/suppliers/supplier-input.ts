import type {
  CreateSupplierRequest,
  UpdateSupplierRequest,
} from '../contract/api.dto';
import {
  optionalBoolean,
  optionalString,
  requireAnyField,
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
      name: optionalString(body?.name, 'name'),
      active: optionalBoolean(body?.active, 'active'),
    },
    'name or active',
  );
}
