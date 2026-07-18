import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { INestApplication } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';
import { loadAppConfig } from './config/environment';
import { configureSwagger } from './openapi/swagger';

export async function createApplication(): Promise<INestApplication> {
  const app = await NestFactory.create(AppModule, { bodyParser: true });
  const config = loadAppConfig();
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
