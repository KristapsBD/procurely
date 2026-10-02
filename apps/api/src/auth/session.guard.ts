import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { AuthedRequest } from '../tenancy/request-scope';
import { SessionTokens } from './session-tokens';

@Injectable()
export class SessionGuard implements CanActivate {
  constructor(private readonly tokens: SessionTokens) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<AuthedRequest>();
    const [scheme, token] = (req.headers.authorization ?? '').split(' ');
    const personId =
      scheme === 'Bearer' && token ? this.tokens.verify(token) : null;
    if (!personId) throw new UnauthorizedException();
    req.personId = personId;
    return true;
  }
}
