import { ApiHeader } from '@nestjs/swagger';
import { COMPANY_HEADER } from '@procurely/shared-types';

/** Documents the company header that routes using `CompanyScope` require. */
export const ApiCompanyHeader = () =>
  ApiHeader({
    name: COMPANY_HEADER,
    required: true,
    description: 'The company the person acts in (a company UUID).',
  });
