import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';
import { loadAppConfig } from './config/environment';
import { configureSwagger } from './openapi/swagger';

export async function createApplication(): Promise<INestApplication> {
  const config = loadAppConfig();
  // Body parsing is registered by hand because Express defaults to 100 kB, which is far below the
  // ADR-005 document upload body and would turn every real upload into an opaque 413.
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bodyParser: false });
  app.useBodyParser('json', { limit: config.app.jsonBodyLimitBytes });
  app.useBodyParser('urlencoded', { limit: config.app.jsonBodyLimitBytes, extended: true });
  const express = app.getHttpAdapter().getInstance() as {
    set: (name: string, value: number) => void;
  };
  express.set('trust proxy', config.app.trustProxyHops);
  app.use(cookieParser());
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  if (config.app.swaggerEnabled) configureSwagger(app);
  app.enableShutdownHooks();
  return app;
}
