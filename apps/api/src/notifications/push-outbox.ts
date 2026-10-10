import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { PushMessage } from './push-sender';

export interface OutboxRecord {
  id: string;
  sentAt: Date;
  message: PushMessage;
}

const CAPACITY = 200;

/**
 * Development only: remembers the latest notifications the API produced, in memory, so delivery
 * can be checked without a phone or a public endpoint. Reading is per device token, so a person
 * only ever gets back what was addressed to their own registered devices.
 */
@Injectable()
export class PushOutbox {
  private readonly records: OutboxRecord[] = [];

  record(messages: PushMessage[]): void {
    for (const message of messages) {
      this.records.push({ id: randomUUID(), sentAt: new Date(), message });
    }
    this.records.splice(0, Math.max(0, this.records.length - CAPACITY));
  }

  clear(): void {
    this.records.length = 0;
  }

  /** Newest first. */
  addressedTo(tokens: readonly string[]): OutboxRecord[] {
    return this.records.filter((r) => tokens.includes(r.message.to)).reverse();
  }
}
