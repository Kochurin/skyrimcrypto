import type { EventFilter, IIpBlockStore, IpBlock, IRevokedTokenStore, ISecurityEventStore, SecurityEvent } from './types.js';

/** Хранилища этапа 5 в памяти — для модульных тестов. */

export class MemorySecurityEventStore implements ISecurityEventStore {
  readonly events: SecurityEvent[] = [];
  failNext = 0;

  async insertMany(events: SecurityEvent[]): Promise<void> {
    if (this.failNext > 0) {
      this.failNext--;
      throw new Error('db down');
    }
    this.events.push(...events.map((e) => ({ ...e })));
  }

  async recent(limit: number): Promise<SecurityEvent[]> {
    return this.events.slice(-limit).reverse();
  }

  async search(f: EventFilter): Promise<SecurityEvent[]> {
    return this.events
      .filter((e) => (!f.type || e.type.startsWith(f.type)) && (!f.ip || e.ip === f.ip) && (!f.userId || e.userId === f.userId))
      .slice(-f.limit)
      .reverse();
  }

  async purgeBefore(date: Date): Promise<number> {
    const before = this.events.length;
    const keep = this.events.filter((e) => e.at >= date);
    this.events.splice(0, this.events.length, ...keep);
    return before - keep.length;
  }
}

export class MemoryIpBlockStore implements IIpBlockStore {
  readonly blocks = new Map<string, IpBlock>();
  failNext = 0;

  async upsert(block: IpBlock): Promise<void> {
    if (this.failNext > 0) {
      this.failNext--;
      throw new Error('db down');
    }
    this.blocks.set(block.ip, { ...block });
  }

  async remove(ip: string): Promise<void> {
    this.blocks.delete(ip);
  }

  async listActive(now: Date): Promise<IpBlock[]> {
    return [...this.blocks.values()].filter((b) => b.until > now);
  }
}

export class MemoryRevokedTokenStore implements IRevokedTokenStore {
  readonly tokens = new Map<string, Date>();

  async revoke(jti: string, expiresAt: Date): Promise<void> {
    this.tokens.set(jti, expiresAt);
  }

  async isRevoked(jti: string): Promise<boolean> {
    return this.tokens.has(jti);
  }

  async purgeExpired(now: Date): Promise<number> {
    let n = 0;
    for (const [jti, exp] of this.tokens) {
      if (exp <= now) {
        this.tokens.delete(jti);
        n++;
      }
    }
    return n;
  }
}
