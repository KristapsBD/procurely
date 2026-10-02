import { applyDecorators } from '@nestjs/common';
import { ApiBearerAuth, ApiHeader } from '@nestjs/swagger';
import { COMPANY_HEADER } from '@procurely/shared-types';

/** Documents the session token every guarded route needs. */
export const ApiSession = () => ApiBearerAuth();

/** Documents the company header that routes using `CompanyScope` require. */
export const ApiCompanyHeader = () =>
  applyDecorators(
    ApiHeader({
      name: COMPANY_HEADER,
      required: true,
      description: 'The company the person acts in (a company UUID).',
    }),
  );
