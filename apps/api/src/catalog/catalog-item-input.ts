import type {
  CreateCatalogItemRequest,
  UpdateCatalogItemRequest,
} from '../contract/api.dto';
import {
  optional,
  requireAnyField,
  requireMinorAmount,
  requireString,
  requireUuid,
} from '../contract/input';

export function parseCreateCatalogItem(
  body: Partial<CreateCatalogItemRequest>,
): CreateCatalogItemRequest {
  return {
    supplierId: requireUuid(body?.supplierId, 'supplierId'),
    name: requireString(body?.name, 'name'),
    unitPriceMinor: requireMinorAmount(body?.unitPriceMinor, 'unitPriceMinor'),
  };
}

export function parseUpdateCatalogItem(
  body: Partial<UpdateCatalogItemRequest>,
): UpdateCatalogItemRequest {
  return requireAnyField(
    {
      supplierId: optional(body?.supplierId, 'supplierId', requireUuid),
      name: optional(body?.name, 'name', requireString),
      unitPriceMinor: optional(
        body?.unitPriceMinor,
        'unitPriceMinor',
        requireMinorAmount,
      ),
    },
    'supplierId, name or unitPriceMinor',
  );
}
