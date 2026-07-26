import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  AuditEventEntity, DocumentEntity, DocumentExternalShareEntity, DocumentReviewCommentEntity,
  DocumentRevisionEntity, PackageEntity, ProjectEntity, ProjectPartyEntity,
  SignatureEnvelopeEntity, TransmittalEntity, TransmittalItemEntity, UserAccountEntity
} from '../../database/entities';
import { IdentityAccessModule } from '../identity-access/identity-access.module';
import { OperationalFoundationModule } from '../operational-foundation/operational-foundation.module';
import { ClamAvMalwareScanner } from './clamav-malware-scanner.service';
import { DocumentControlController } from './document-control.controller';
import { DocumentControlService } from './document-control.service';
import { MALWARE_SCANNER } from './malware-scanner.port';
import { MinioObjectStorage } from './minio-object-storage.service';
import { OBJECT_STORAGE } from './object-storage.port';

@Module({
  imports: [
    IdentityAccessModule,
    OperationalFoundationModule,
    TypeOrmModule.forFeature([
      AuditEventEntity, DocumentEntity, DocumentRevisionEntity, DocumentReviewCommentEntity,
      TransmittalEntity, TransmittalItemEntity, SignatureEnvelopeEntity,
      DocumentExternalShareEntity, PackageEntity, ProjectEntity, ProjectPartyEntity,
      UserAccountEntity
    ])
  ],
  controllers: [DocumentControlController],
  providers: [
    DocumentControlService,
    // ADR-005 infrastructure boundary: the service only ever sees the two ports, so an adapter can
    // be replaced — or stubbed in a test — without the document rules knowing.
    { provide: OBJECT_STORAGE, useClass: MinioObjectStorage },
    { provide: MALWARE_SCANNER, useClass: ClamAvMalwareScanner }
  ]
})
export class DocumentControlModule {}
