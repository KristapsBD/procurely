import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { serveOpenApiDocument } from './contract/openapi';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  serveOpenApiDocument(app);
  await app.listen(process.env.PORT ?? 3000, '0.0.0.0');
}

void bootstrap();
