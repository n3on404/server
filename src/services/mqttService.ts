import mqtt, { MqttClient } from 'mqtt';
import { env } from '../config/environment';

export interface MQTTMessage {
  topic: string;
  payload: any;
  qos?: 0 | 1 | 2;
  retain?: boolean;
}

export interface MQTTConfig {
  brokerUrl: string;
  clientId: string;
  username?: string | undefined;
  password?: string | undefined;
  keepalive?: number | undefined;
  reconnectPeriod?: number | undefined;
  connectTimeout?: number | undefined;
}

class MQTTService {
  private client: MqttClient | null = null;
  private isConnected = false;
  private config: MQTTConfig;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;
  private messageQueue: MQTTMessage[] = [];

  constructor() {
    this.config = {
      brokerUrl: env.MQTT_BROKER_URL || 'mqtt://localhost:1883',
      clientId: `transportation-server-${Date.now()}`,
      username: env.MQTT_USERNAME,
      password: env.MQTT_PASSWORD,
      keepalive: 60,
      reconnectPeriod: 5000,
      connectTimeout: 10000
    };
  }

  /**
   * Connect to MQTT broker
   */
  async connect(): Promise<boolean> {
    try {
      console.log('🔌 Connecting to MQTT broker...', this.config.brokerUrl);

      const connectOptions: any = {
        clientId: this.config.clientId,
        keepalive: this.config.keepalive || 60,
        reconnectPeriod: this.config.reconnectPeriod || 5000,
        connectTimeout: this.config.connectTimeout || 10000,
        clean: false, // Persistent session
        will: {
          topic: 'transport/system/status',
          payload: JSON.stringify({ 
            status: 'offline',
            timestamp: new Date().toISOString(),
            server: 'transportation-server'
          }),
          qos: 1,
          retain: true
        }
      };

      if (this.config.username) {
        connectOptions.username = this.config.username;
      }
      if (this.config.password) {
        connectOptions.password = this.config.password;
      }

      this.client = mqtt.connect(this.config.brokerUrl, connectOptions);

      this.setupEventHandlers();

      return new Promise((resolve) => {
        const timeout = setTimeout(() => {
          console.error('❌ MQTT connection timeout');
          resolve(false);
        }, this.config.connectTimeout);

        this.client!.on('connect', () => {
          clearTimeout(timeout);
          this.isConnected = true;
          this.reconnectAttempts = 0;
          console.log('✅ MQTT broker connected successfully');
          
          // Publish online status
          this.publishSystemStatus('online');
          
          // Process queued messages
          this.processQueuedMessages();
          
          resolve(true);
        });
      });

    } catch (error) {
      console.error('❌ MQTT connection error:', error);
      return false;
    }
  }

  /**
   * Setup MQTT event handlers
   */
  private setupEventHandlers(): void {
    if (!this.client) return;

    this.client.on('connect', () => {
      console.log('✅ MQTT broker connected');
      this.isConnected = true;
      this.reconnectAttempts = 0;
    });

    this.client.on('disconnect', () => {
      console.log('❌ MQTT broker disconnected');
      this.isConnected = false;
    });

    this.client.on('reconnect', () => {
      this.reconnectAttempts++;
      console.log(`🔄 MQTT reconnecting... (attempt ${this.reconnectAttempts})`);
    });

    this.client.on('error', (error) => {
      console.error('❌ MQTT error:', error);
      this.isConnected = false;
    });

    this.client.on('offline', () => {
      console.log('📴 MQTT broker offline');
      this.isConnected = false;
    });

    this.client.on('close', () => {
      console.log('🔒 MQTT connection closed');
      this.isConnected = false;
    });
  }

  /**
   * Publish message to MQTT broker
   */
  async publish(topic: string, payload: any, options: { qos?: 0 | 1 | 2; retain?: boolean } = {}): Promise<boolean> {
    const message: MQTTMessage = {
      topic,
      payload,
      qos: options.qos || 1,
      retain: options.retain || false
    };

    if (!this.isConnected || !this.client) {
      console.log('📦 MQTT not connected, queuing message:', topic);
      this.messageQueue.push(message);
      return false;
    }

    try {
      const payloadString = typeof payload === 'string' ? payload : JSON.stringify(payload);
      
      this.client.publish(topic, payloadString, {
        qos: message.qos || 1,
        retain: message.retain || false
      });

      console.log(`📤 MQTT published: ${topic}`, payload);
      return true;
    } catch (error) {
      console.error('❌ MQTT publish error:', error);
      this.messageQueue.push(message);
      return false;
    }
  }

  /**
   * Process queued messages when connection is restored
   */
  private processQueuedMessages(): void {
    if (this.messageQueue.length === 0) return;

    console.log(`🔄 Processing ${this.messageQueue.length} queued MQTT messages...`);
    
    const messages = [...this.messageQueue];
    this.messageQueue = [];

    messages.forEach(async (message) => {
      await this.publish(message.topic, message.payload, {
        qos: message.qos || 1,
        retain: message.retain || false
      });
    });
  }

  /**
   * Publish system status
   */
  async publishSystemStatus(status: 'online' | 'offline'): Promise<void> {
    await this.publish('transport/system/status', {
      status,
      timestamp: new Date().toISOString(),
      server: 'transportation-server',
      uptime: process.uptime()
    }, { qos: 1, retain: true });
  }

  /**
   * Publish seat availability update
   */
  async publishSeatAvailability(destinationId: string, data: {
    destinationId: string;
    destinationName: string;
    availableSeats: number;
    totalSeats: number;
    timestamp: string;
  }): Promise<void> {
    await this.publish(`transport/route/${destinationId}/seats`, data, { qos: 1, retain: true });
  }

  /**
   * Publish queue update
   */
  async publishQueueUpdate(stationId: string, data: {
    stationId: string;
    stationName: string;
    action: 'vehicle_added' | 'vehicle_removed' | 'vehicle_transferred';
    vehicle: {
      licensePlate: string;
      destinationId: string;
      destinationName: string;
      queuePosition: number;
      availableSeats: number;
      totalSeats: number;
    };
    timestamp: string;
  }): Promise<void> {
    await this.publish(`transport/station/${stationId}/queue`, data, { qos: 2, retain: true });
  }

  /**
   * Publish vehicle status update
   */
  async publishVehicleStatus(vehicleId: string, data: {
    vehicleId: string;
    licensePlate: string;
    status: 'waiting' | 'loading' | 'ready' | 'departed';
    location: string;
    destinationId: string;
    destinationName: string;
    availableSeats: number;
    totalSeats: number;
    timestamp: string;
  }): Promise<void> {
    await this.publish(`transport/vehicle/${vehicleId}/status`, data, { qos: 1, retain: true });
  }

  /**
   * Publish booking event
   */
  async publishBookingEvent(bookingId: string, event: 'created' | 'confirmed' | 'cancelled' | 'completed', data: any): Promise<void> {
    await this.publish(`transport/booking/${bookingId}/${event}`, {
      bookingId,
      event,
      data,
      timestamp: new Date().toISOString()
    }, { qos: 2, retain: false });
  }

  /**
   * Publish destinations update
   */
  async publishDestinationsUpdate(data: {
    destinations: Array<{
      destinationId: string;
      destinationName: string;
      totalAvailableSeats: number;
      vehicleCount: number;
    }>;
    timestamp: string;
  }): Promise<void> {
    await this.publish('transport/destinations/update', data, { qos: 1, retain: true });
  }

  /**
   * Publish staff notification
   */
  async publishStaffNotification(staffId: string, notification: {
    type: 'info' | 'warning' | 'error' | 'success';
    title: string;
    message: string;
    priority: 'low' | 'medium' | 'high' | 'urgent';
    timestamp: string;
  }): Promise<void> {
    await this.publish(`transport/staff/${staffId}/notifications`, notification, { qos: 1, retain: false });
  }

  /**
   * Disconnect from MQTT broker
   */
  async disconnect(): Promise<void> {
    if (this.client) {
      await this.publishSystemStatus('offline');
      this.client.end();
      this.client = null;
      this.isConnected = false;
      console.log('🔌 MQTT broker disconnected');
    }
  }

  /**
   * Get connection status
   */
  getConnectionStatus(): {
    connected: boolean;
    reconnectAttempts: number;
    queuedMessages: number;
  } {
    return {
      connected: this.isConnected,
      reconnectAttempts: this.reconnectAttempts,
      queuedMessages: this.messageQueue.length
    };
  }

  /**
   * Health check
   */
  async healthCheck(): Promise<{
    status: 'healthy' | 'unhealthy';
    connected: boolean;
    reconnectAttempts: number;
    queuedMessages: number;
    brokerUrl: string;
  }> {
    return {
      status: this.isConnected ? 'healthy' : 'unhealthy',
      connected: this.isConnected,
      reconnectAttempts: this.reconnectAttempts,
      queuedMessages: this.messageQueue.length,
      brokerUrl: this.config.brokerUrl
    };
  }
}

// Singleton instance
let mqttServiceInstance: MQTTService | null = null;

export const getMQTTService = (): MQTTService => {
  if (!mqttServiceInstance) {
    mqttServiceInstance = new MQTTService();
  }
  return mqttServiceInstance;
};

export default MQTTService;