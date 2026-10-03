import type {
  CreateCatalogItemRequest,
  UpdateCatalogItemRequest,
} from '../contract/api.dto';
import {
  optionalString,
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
  const price = body?.unitPriceMinor;
  return requireAnyField(
    {
      supplierId:
        body?.supplierId === undefined
          ? undefined
          : requireUuid(body.supplierId, 'supplierId'),
      name: optionalString(body?.name, 'name'),
      unitPriceMinor:
        price === undefined
          ? undefined
          : requireMinorAmount(price, 'unitPriceMinor'),
    },
    'supplierId, name or unitPriceMinor',
  );
}
