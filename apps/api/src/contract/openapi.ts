import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import type { OpenAPIObject } from '@nestjs/swagger';

/** Where the running API serves its machine-readable contract. */
export const OPENAPI_PATH = '/openapi.json';

export function createOpenApiDocument(app: INestApplication): OpenAPIObject {
  const config = new DocumentBuilder()
    .setTitle('Procurely API')
    .setVersion('0.0.0')
    .addBearerAuth()
    .build();
  return SwaggerModule.createDocument(app, config);
}

/** Serves the contract as JSON at OPENAPI_PATH (no Swagger UI). */
export function serveOpenApiDocument(app: INestApplication): void {
  SwaggerModule.setup('openapi', app, createOpenApiDocument(app), {
    ui: false,
    jsonDocumentUrl: OPENAPI_PATH,
  });
}
