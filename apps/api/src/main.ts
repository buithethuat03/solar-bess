import 'reflect-metadata';
import { loadAppConfig } from './config/environment';
import { createApplication } from './bootstrap';

async function bootstrap(): Promise<void> {
  const app = await createApplication();
  await app.listen(loadAppConfig().app.port, '0.0.0.0');
}

void bootstrap();
