import { BadRequestException } from '@nestjs/common';
import type { RegisterPushDeviceRequest } from '../contract/api.dto';

const EXPO_TOKEN = /^Expo(nent)?PushToken\[[A-Za-z0-9_-]{8,64}\]$/;

export function parsePushToken(
  body: Partial<RegisterPushDeviceRequest> | undefined,
): string {
  const token = typeof body?.token === 'string' ? body.token.trim() : '';
  if (!EXPO_TOKEN.test(token)) {
    throw new BadRequestException('token must be an Expo push token');
  }
  return token;
}
