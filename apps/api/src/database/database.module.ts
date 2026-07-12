import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { APP_CONFIG, ConfigurationModule } from '../config/configuration.module';
import type { AppConfig } from '../config/environment';
import { typeOrmOptions } from './data-source';

@Module({
  imports: [
    ConfigurationModule,
    TypeOrmModule.forRootAsync({
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig) => typeOrmOptions(config.database.url)
    })
  ]
})
export class DatabaseModule {}
