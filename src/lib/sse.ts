import { Response } from 'express';
import { SSEEvent, UserRole } from '../types/shared';

interface SSEClient {
  res: Response;
  establishmentId: number;
  role: UserRole | 'customer';
  sessionId?: number;
}

class SSEManager {
  private clients: Map<string, SSEClient> = new Map();

  addClient(id: string, client: SSEClient) {
    this.clients.set(id, client);
    client.res.on('close', () => this.removeClient(id));
  }

  removeClient(id: string) {
    this.clients.delete(id);
  }

  broadcastToEstablishment(
    establishmentId: number,
    event: SSEEvent,
    roles?: Array<UserRole | 'customer'>
  ) {
    for (const client of this.clients.values()) {
      if (client.establishmentId !== establishmentId) continue;
      if (roles && !roles.includes(client.role)) continue;
      this.send(client.res, event);
    }
  }

  broadcastToSession(sessionId: number, event: SSEEvent) {
    for (const client of this.clients.values()) {
      if (client.sessionId === sessionId) {
        this.send(client.res, event);
      }
    }
  }

  private send(res: Response, event: SSEEvent) {
    try {
      res.write(`event: ${event.type}\n`);
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    } catch {
      // client disconnected
    }
  }

  clientCount() {
    return this.clients.size;
  }
}

export const sseManager = new SSEManager();
