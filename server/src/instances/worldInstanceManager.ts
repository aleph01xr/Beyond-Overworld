import { randomBytes } from 'node:crypto';
import { OVERWORLD_INSTANCE_CAPACITY } from '../../../shared/constants/zones.ts';
import type { WorldInstanceSummary } from '../../../shared/types/domain.ts';
import { upsertInstanceRecord } from '../persistence/database.ts';
import { WorldInstance } from './worldInstance.ts';

const MAX_INSTANCES = 12;

export class WorldInstanceManager {
  private readonly instances = new Map<string, WorldInstance>();

  constructor() {
    this.createInstance({
      instanceId: 'OVERWORLD-1',
      name: 'Highkeep Outpost',
      regionLabel: 'Primary Shard',
      maxPlayers: OVERWORLD_INSTANCE_CAPACITY,
    });
  }

  createInstance(options: {
    instanceId?: string;
    name: string;
    regionLabel?: string;
    maxPlayers?: number;
  }): { ok: boolean; instance?: WorldInstance; error?: string } {
    if (this.instances.size >= MAX_INSTANCES) {
      return {
        ok: false,
        error: `Maximum active shard limit (${MAX_INSTANCES}) reached.`,
      };
    }

    const instanceId =
      options.instanceId ??
      `OW-${randomBytes(3).toString('hex').toUpperCase()}`;

    if (this.instances.has(instanceId)) {
      return { ok: false, error: `Instance ${instanceId} already exists.` };
    }

    const instance = new WorldInstance({
      instanceId,
      name: options.name.trim(),
      regionLabel: options.regionLabel ?? 'Open Shard',
      maxPlayers: options.maxPlayers ?? OVERWORLD_INSTANCE_CAPACITY,
    });
    this.instances.set(instanceId, instance);
    void upsertInstanceRecord(instance.getSummary()).catch(() => {});
    return { ok: true, instance };
  }

  getInstance(instanceId: string): WorldInstance | undefined {
    return this.instances.get(instanceId);
  }

  listInstances(): WorldInstance[] {
    return Array.from(this.instances.values());
  }

  listSummaries(): WorldInstanceSummary[] {
    return this.listInstances().map((inst) => inst.getSummary());
  }

  getTotalConnectedPlayers(): number {
    let total = 0;
    for (const inst of this.instances.values()) {
      total += inst.getConnectedCount();
    }
    return total;
  }

  stepAll(dtMs: number): void {
    for (const inst of this.instances.values()) {
      inst.step(dtMs);
    }
  }
}
