import type { Response } from 'express';

export interface RealtimeEventPayload {
  type:
    | 'tenant_updated'
    | 'tenant_deleted'
    | 'platform_settings_updated'
    | 'qr_order_received'
    | 'reservation_received'
    | 'ping';
  tenantId?: string;
  version?: number;
  actorUid?: string;
  clientTabId?: string;
  summary?: string;
  timestamp: string;
}

interface SseClient {
  id: string;
  res: Response;
  uid?: string;
  isAdmin: boolean;
  tenantIds: Set<string>;
}

class RealtimeSseHub {
  private clients = new Map<string, SseClient>();

  addClient(client: SseClient): () => void {
    this.clients.set(client.id, client);
    return () => {
      this.clients.delete(client.id);
    };
  }

  broadcast(event: RealtimeEventPayload): void {
    const serialized = `data: ${JSON.stringify(event)}\n\n`;
    for (const [id, client] of this.clients.entries()) {
      const canReceive =
        event.type === 'platform_settings_updated' ||
        event.type === 'ping' ||
        client.isAdmin ||
        !event.tenantId ||
        client.tenantIds.has(event.tenantId) ||
        client.tenantIds.has('*');

      if (!canReceive) continue;
      try {
        client.res.write(serialized);
      } catch {
        this.clients.delete(id);
      }
    }
  }

  getConnectedCount(): number {
    return this.clients.size;
  }
}

export const realtimeHub = new RealtimeSseHub();
