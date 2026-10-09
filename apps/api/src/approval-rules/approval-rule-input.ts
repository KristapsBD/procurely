import { BadRequestException } from '@nestjs/common';
import {
  APPROVER_ROLES,
  type ApproverRole,
  type CreateApprovalRuleRequest,
} from '../contract/api.dto';
import { requireMinorAmount } from '../contract/input';

function requireApproverRole(value: unknown): ApproverRole {
  const role = APPROVER_ROLES.find((r) => r === value);
  if (!role) {
    throw new BadRequestException(
      `requiredRole must be one of ${APPROVER_ROLES.join(', ')}`,
    );
  }
  return role;
}

export function parseCreateApprovalRule(
  body: Partial<CreateApprovalRuleRequest> | undefined,
): CreateApprovalRuleRequest {
  return {
    thresholdMinor: requireMinorAmount(body?.thresholdMinor, 'thresholdMinor'),
    requiredRole: requireApproverRole(body?.requiredRole),
  };
}
