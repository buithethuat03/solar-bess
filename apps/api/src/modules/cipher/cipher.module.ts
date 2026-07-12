import { Global, Module } from '@nestjs/common';
import { CIPHER_KEY } from './cipher.constants';
import { CipherService, parseCipherKey } from './cipher.service';

@Global()
@Module({
  providers: [
    { provide: CIPHER_KEY, useFactory: () => parseCipherKey(process.env.CIPHER_KEY) },
    CipherService
  ],
  exports: [CipherService]
})
export class CipherModule {}
