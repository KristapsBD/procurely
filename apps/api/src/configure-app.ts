import type { INestApplication } from '@nestjs/common';
import { APP_CONFIG, type AppConfig } from './config';

/** Setup shared by the real server and the HTTP tests, so tests exercise what runs. */
export function configureApp(app: INestApplication): void {
  const config = app.get<AppConfig>(APP_CONFIG);
  if (config.corsAnyOrigin) app.enableCors();
}
