private setupRedisConnections(): void {
    const redisConfig = {
      host: this.extractHost(config.REDIS_URL),
      port: this.extractPort(config.REDIS_URL),
      password: config.REDIS_PASSWORD,
      retryDelayOnFailover: 100,
      maxRetriesPerRequest: 3,
      lazyConnect: true,
      // Connection timeout
      connectTimeout: 10000,
      commandTimeout: 5000,
      // Production settings
      keepAlive: 30000,
      family: 4, // Force IPv4
      // Clustering support if needed
      enableReadyCheck: true,
      maxLoadingTimeout: 0,
    };

    // Add SSL support for production Redis (like Redis Cloud,import Redis from 'ioredis';
import { EventEmitter } from 'events';
import { loadApiConfig } from '@pr-gram/config';
import { logger } from '@pr-gram/shared';

const config = loadApiConfig();

// Event types for type safety
export interface SystemEvents {
  // User events
  'user:created': { userId: number; userData: any };
  'user:updated': { userId: number; changes: any };
  'user:banned': { userId: number; reason: string };
  'user:level_changed': { userId: number; oldLevel: string; newLevel: string };
  'user:balance_changed': { userId: number; oldBalance: number; newBalance: number; amount: number; reason: string };
  
  // Task events
  'task:created': { taskId: string; authorId: number; taskData: any };
  'task:updated': { taskId: string; changes: any };
  'task:completed': { taskId: string; authorId: number; completedCount: number; targetCount: number };
  'task:boosted': { taskId: string; boostType: string; duration: number };
  
  // Task execution events
  'execution:created': { executionId: string; taskId: string; userId: number };
  'execution:approved': { executionId: string; taskId: string; userId: number; reward: number };
  'execution:rejected': { executionId: string; taskId: string; userId: number; reason: string };
  
  // Check events
  'check:created': { checkId: string; createdBy: number; amount: number; maxActivations: number };
  'check:activated': { checkId: string; activatedBy: number; amount: number; remainingActivations: number };
  'check:expired': { checkId: string; totalActivations: number };
  
  // Subscription events
  'subscription:created': { subscriptionId: string; chatId: number; targetChatId?: number; setupType: string };
  'subscription:updated': { subscriptionId: string; changes: any };
  'subscription:checked': { subscriptionId: string; userId: number; chatId: number; passed: boolean };
  'subscription:deleted': { subscriptionId: string; chatId: number };
  
  // Transaction events
  'transaction:created': { transactionId: string; userId: number; type: string; amount: number; description: string };
  
  // System events
  'system:maintenance_start': { reason: string; estimatedDuration: number };
  'system:maintenance_end': { reason: string; actualDuration: number };
  'system:stats_updated': { timestamp: Date; stats: any };
  
  // Admin events
  'admin:action': { adminId: number; action: string; target: any; timestamp: Date };
  'admin:bulk_operation': { adminId: number; operation: string; affectedIds: string[]; results: any };
}

export class RedisEventBus extends EventEmitter {
  private publisher: Redis;
  private subscriber: Redis;
  private isConnected = false;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;
  private reconnectDelay = 1000; // Start with 1 second

  constructor() {
    super();
    this.setupRedisConnections();
  }

  private setupRedisConnections(): void {
    const redisConfig = {
      host: this.extractHost(config.REDIS_URL),
      port: this.extractPort(config.REDIS_URL),
      password: config.REDIS_PASSWORD,
      retryDelayOnFailover: 100,
      maxRetriesPerRequest: 3,
      lazyConnect: true,
      // Connection timeout
      connectTimeout: 10000,
      commandTimeout: 5000,
    };

    // Publisher connection
    this.publisher = new Redis(redisConfig);
    
    // Subscriber connection (separate connection required for pub/sub)
    this.subscriber = new Redis(redisConfig);

    this.setupEventHandlers();
  }

  private setupEventHandlers(): void {
    // Publisher events
    this.publisher.on('connect', () => {
      logger.info('Redis publisher connected');
    });

    this.publisher.on('error', (error) => {
      logger.error('Redis publisher error:', error);
      this.handleConnectionError();
    });

    this.publisher.on('close', () => {
      logger.warn('Redis publisher connection closed');
      this.isConnected = false;
    });

    // Subscriber events
    this.subscriber.on('connect', () => {
      logger.info('Redis subscriber connected');
      this.isConnected = true;
      this.reconnectAttempts = 0;
      this.subscribeToChannels();
    });

    this.subscriber.on('error', (error) => {
      logger.error('Redis subscriber error:', error);
      this.handleConnectionError();
    });

    this.subscriber.on('close', () => {
      logger.warn('Redis subscriber connection closed');
      this.isConnected = false;
    });

    // Message handling
    this.subscriber.on('message', (channel, message) => {
      this.handleMessage(channel, message);
    });

    this.subscriber.on('pmessage', (pattern, channel, message) => {
      this.handleMessage(channel, message);
    });
  }

  private extractHost(url: string): string {
    try {
      const parsedUrl = new URL(url);
      return parsedUrl.hostname;
    } catch {
      return 'localhost';
    }
  }

  private extractPort(url: string): number {
    try {
      const parsedUrl = new URL(url);
      return parseInt(parsedUrl.port) || 6379;
    } catch {
      return 6379;
    }
  }

  private handleConnectionError(): void {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      const delay = Math.min(this.reconnectDelay * Math.pow(2, this.reconnectAttempts), 30000);
      
      logger.info(`Attempting to reconnect to Redis (${this.reconnectAttempts}/${this.maxReconnectAttempts}) in ${delay}ms`);
      
      setTimeout(() => {
        this.connect();
      }, delay);
    } else {
      logger.error('Max Redis reconnection attempts reached. Manual intervention required.');
    }
  }

  private subscribeToChannels(): void {
    // Subscribe to all event patterns
    const patterns = [
      'prgram:user:*',
      'prgram:task:*',
      'prgram:execution:*',
      'prgram:check:*',
      'prgram:subscription:*',
      'prgram:transaction:*',
      'prgram:system:*',
      'prgram:admin:*'
    ];

    patterns.forEach(pattern => {
      this.subscriber.psubscribe(pattern, (error, count) => {
        if (error) {
          logger.error(`Failed to subscribe to pattern ${pattern}:`, error);
        } else {
          logger.debug(`Subscribed to pattern: ${pattern} (total: ${count})`);
        }
      });
    });
  }

  private handleMessage(channel: string, message: string): void {
    try {
      const eventData = JSON.parse(message);
      const eventType = this.extractEventType(channel);
      
      if (eventType) {
        logger.debug(`Received event: ${eventType}`, { channel, data: eventData });
        this.emit(eventType, eventData);
      }
    } catch (error) {
      logger.error(`Failed to parse message from channel ${channel}:`, error);
    }
  }

  private extractEventType(channel: string): string | null {
    const match = channel.match(/^prgram:(.+)$/);
    return match ? match[1] : null;
  }

  /**
   * Connect to Redis
   */
  async connect(): Promise<void> {
    try {
      await Promise.all([
        this.publisher.connect(),
        this.subscriber.connect()
      ]);
      
      logger.info('Redis Event Bus connected successfully');
    } catch (error) {
      logger.error('Failed to connect to Redis:', error);
      throw error;
    }
  }

  /**
   * Disconnect from Redis
   */
  async disconnect(): Promise<void> {
    try {
      this.removeAllListeners();
      
      await Promise.all([
        this.publisher.disconnect(),
        this.subscriber.disconnect()
      ]);
      
      this.isConnected = false;
      logger.info('Redis Event Bus disconnected');
    } catch (error) {
      logger.error('Error disconnecting from Redis:', error);
      throw error;
    }
  }

  /**
   * Publish an event
   */
  async publish<K extends keyof SystemEvents>(
    eventType: K,
    data: SystemEvents[K],
    options?: { expiry?: number; priority?: 'low' | 'normal' | 'high' }
  ): Promise<void> {
    if (!this.isConnected) {
      logger.warn(`Cannot publish event ${eventType}: Redis not connected`);
      return;
    }

    try {
      const channel = `prgram:${eventType}`;
      const message = JSON.stringify({
        ...data,
        timestamp: new Date().toISOString(),
        eventId: this.generateEventId(),
        priority: options?.priority || 'normal'
      });

      const result = await this.publisher.publish(channel, message);
      
      if (result > 0) {
        logger.debug(`Published event ${eventType} to ${result} subscribers`);
      }

      // Optionally store event with expiry for persistence
      if (options?.expiry) {
        const persistKey = `prgram:events:${eventType}:${Date.now()}`;
        await this.publisher.setex(persistKey, options.expiry, message);
      }

    } catch (error) {
      logger.error(`Failed to publish event ${eventType}:`, error);
      throw error;
    }
  }

  /**
   * Subscribe to specific event types
   */
  subscribe<K extends keyof SystemEvents>(
    eventType: K,
    handler: (data: SystemEvents[K]) => void | Promise<void>
  ): void {
    this.on(eventType, handler);
  }

  /**
   * Unsubscribe from specific event types
   */
  unsubscribe<K extends keyof SystemEvents>(
    eventType: K,
    handler?: (data: SystemEvents[K]) => void | Promise<void>
  ): void {
    if (handler) {
      this.off(eventType, handler);
    } else {
      this.removeAllListeners(eventType);
    }
  }

  /**
   * Get connection status
   */
  isReady(): boolean {
    return this.isConnected && 
           this.publisher.status === 'ready' && 
           this.subscriber.status === 'ready';
  }

  /**
   * Get Redis connection statistics
   */
  getStats() {
    return {
      isConnected: this.isConnected,
      reconnectAttempts: this.reconnectAttempts,
      publisherStatus: this.publisher.status,
      subscriberStatus: this.subscriber.status,
      eventListenerCount: this.eventNames().length
    };
  }

  /**
   * Health check for monitoring
   */
  async healthCheck(): Promise<{ status: 'ok' | 'error'; details: any }> {
    try {
      const publisherPing = await this.publisher.ping();
      const subscriberPing = await this.subscriber.ping();
      
      if (publisherPing === 'PONG' && subscriberPing === 'PONG') {
        return {
          status: 'ok',
          details: {
            publisher: 'connected',
            subscriber: 'connected',
            isReady: this.isReady()
          }
        };
      } else {
        return {
          status: 'error',
          details: {
            publisher: publisherPing,
            subscriber: subscriberPing,
            isReady: this.isReady()
          }
        };
      }
    } catch (error) {
      return {
        status: 'error',
        details: {
          error: error instanceof Error ? error.message : 'Unknown error',
          isReady: this.isReady()
        }
      };
    }
  }

  /**
   * Flush