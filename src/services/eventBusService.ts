import { env } from '../config/environment';

export type SupervisorEvent = {
  id?: string;
  type: string;
  ts: string;
  staffId?: string;
  vehicleId?: string;
  licensePlate?: string;
  destinationId?: string;
  destinationName?: string;
  amount?: number;
  seats?: number;
  status?: string;
  payload?: any;
};

type EventListener = (evt: SupervisorEvent) => void;

class EventBusService {
  private client: any | null = null;
  private listeners: Set<EventListener> = new Set();
  private channelName = 'supervisor_events';
  private heartbeatInterval: NodeJS.Timeout | null = null;

  async connect(): Promise<boolean> {
    try {
      // Lazy require to avoid type dependency during build
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { Client } = require('pg');
      const client = new Client({ connectionString: env.DATABASE_URL });
      await client.connect();
      await client.query(`LISTEN ${this.channelName}`);

      client.on('notification', (msg: any) => {
        if (!msg.payload) return;
        try {
          const evt: SupervisorEvent = JSON.parse(msg.payload);
          this.listeners.forEach((l) => l(evt));
        } catch (e) {
          console.error('Failed to parse supervisor event payload', e);
        }
      });

      client.on('error', (e: unknown) => {
        console.error('PG LISTEN client error', e);
      });

      this.client = client;

      // Optional heartbeat broadcast to keep SSE clients alive
      this.heartbeatInterval = setInterval(() => {
        const evt: SupervisorEvent = { type: 'heartbeat', ts: new Date().toISOString() } as SupervisorEvent;
        this.listeners.forEach((l) => l(evt));
      }, 20000);

      console.log(`✅ EventBusService connected and listening on ${this.channelName}`);
      return true;
    } catch (e) {
      console.error('Failed to connect EventBusService', e);
      return false;
    }
  }

  onEvent(listener: EventListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async disconnect(): Promise<void> {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
    if (this.client) {
      try {
        await this.client.end();
        console.log('🔴 EventBusService disconnected');
      } catch (_) {}
      this.client = null;
    }
    this.listeners.clear();
  }
}

let instance: EventBusService | null = null;
export const getEventBusService = (): EventBusService => {
  if (!instance) instance = new EventBusService();
  return instance;
};

export default getEventBusService;

