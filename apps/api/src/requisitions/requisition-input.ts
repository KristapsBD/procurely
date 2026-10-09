import type {
  ApproveRequisitionRequest,
  RejectRequisitionRequest,
  RequisitionLineInput,
  SaveRequisitionRequest,
} from '../contract/api.dto';
import {
  optional,
  requireArray,
  requirePositiveInteger,
  requireString,
  requireText,
  requireUuid,
} from '../contract/input';

function parseLine(value: unknown, index: number): RequisitionLineInput {
  const line = (value ?? {}) as Partial<RequisitionLineInput>;
  const field = `lines[${index}]`;
  return {
    catalogItemId: requireUuid(line.catalogItemId, `${field}.catalogItemId`),
    quantity: requirePositiveInteger(line.quantity, `${field}.quantity`),
  };
}

/** The approver's comment, or null when there is none or it is blank. */
export function parseApproveComment(
  body: Partial<ApproveRequisitionRequest> | undefined,
): string | null {
  const comment = optional(body?.comment, 'comment', requireText);
  return comment ? comment : null;
}

export function parseRejectReason(
  body: Partial<RejectRequisitionRequest> | undefined,
): string {
  return requireString(body?.reason, 'reason');
}

/** Every field is required, but a draft's values may be empty: no cost center, no lines. */
export function parseSaveRequisition(
  body: Partial<SaveRequisitionRequest>,
): SaveRequisitionRequest {
  return {
    costCenterId:
      body?.costCenterId === null
        ? null
        : requireUuid(body?.costCenterId, 'costCenterId'),
    justification: requireText(body?.justification, 'justification'),
    lines: requireArray(body?.lines, 'lines').map(parseLine),
  };
}
