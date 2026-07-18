import type { PoolClient } from 'pg';
import type { DomainEventJob } from './domain-event';

export interface DomainEventProcessor {
  supports(event: DomainEventJob): boolean;
  process(client: PoolClient, event: DomainEventJob): Promise<void>;
}
