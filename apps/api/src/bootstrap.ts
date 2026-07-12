import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { INestApplication } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';
import { loadAppConfig } from './config/environment';

export async function createApplication(): Promise<INestApplication> {
  const app = await NestFactory.create(AppModule, { bodyParser: true });
  const express = app.getHttpAdapter().getInstance() as {
    set: (name: string, value: number) => void;
  };
  express.set('trust proxy', loadAppConfig().app.trustProxyHops);
  app.use(cookieParser());
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  app.enableShutdownHooks();
  return app;
}
