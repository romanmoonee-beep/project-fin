import { WebSocket } from 'ws';
import { logger } from '@pr-gram/shared';
import { v4 as uuidv4 } from 'uuid';

interface ClientConnection {
  id: string;
  socket: WebSocket;
  userId?: number;
  isAdmin: boolean;
  subscribedEvents: Set<string>;
  lastPing: Date;
}

export class WebSocketManager {
  private clients = new Map<string, ClientConnection>();
  private pingInterval: NodeJS.Timeout;

  constructor() {
    // Ping клиентов каждые 30 секунд
    this.pingInterval = setInterval(() => {
      this.pingClients();
    }, 30000);
  }

  /**
   * Добавляет нового WebSocket клиента
   */
  addClient(socket: WebSocket, userId?: number, isAdmin: boolean = false): string {
    const clientId = uuidv4();
    
    const client: ClientConnection = {
      id: clientId,
      socket,
      userId,
      isAdmin,
      subscribedEvents: new Set(),
      lastPing: new Date()
    };

    this.clients.set(clientId, client);

    // Обработка входящих сообщений
    socket.on('message', (data) => {
      try {
        const message = JSON.parse(data.toString());
        this.handleMessage(clientId, message);
      } catch (error) {
        logger.error('Invalid WebSocket message:', error);
      }
    });

    // Обработка закрытия соединения
    socket.on('close', () => {
      this.removeClient(clientId);
    });

    // Обработка ошибок
    socket.on('error', (error) => {
      logger.error(`WebSocket error for client ${clientId}:`, error);
      this.removeClient(clientId);
    });

    // Отправляем приветственное сообщение
    this.sendToClient(clientId, {
      type: 'connection:established',
      data: { clientId, timestamp: new Date().toISOString() }
    });

    logger.info(`WebSocket client connected: ${clientId} (admin: ${isAdmin})`);
    return clientId;
  }

  /**
   * Удаляет клиента
   */
  removeClient(clientId: string): void {
    const client = this.clients.get(clientId);
    if (client) {
      try {
        client.socket.close();
      } catch (error) {
        // Игнорируем ошибки при закрытии
      }
      this.clients.delete(clientId);
      logger.info(`WebSocket client disconnected: ${clientId}`);
    }
  }

  /**
   * Обрабатывает входящие сообщения от клиентов
   */
  private handleMessage(clientId: string, message: any): void {
    const client = this.clients.get(clientId);
    if (!client) return;

    switch (message.type) {
      case 'ping':
        client.lastPing = new Date();
        this.sendToClient(clientId, { type: 'pong', data: { timestamp: new Date().toISOString() } });
        break;

      case 'subscribe':
        if (Array.isArray(message.events)) {
          message.events.forEach((event: string) => {
            client.subscribedEvents.add(event);
          });
          this.sendToClient(clientId, {
            type: 'subscription:confirmed',
            data: { events: Array.from(client.subscribedEvents) }
          });
        }
        break;

      case 'unsubscribe':
        if (Array.isArray(message.events)) {
          message.events.forEach((event: string) => {
            client.subscribedEvents.delete(event);
          });
        }
        break;

      default:
        logger.warn(`Unknown WebSocket message type: ${message.type}`);
    }
  }

  /**
   * Отправляет сообщение конкретному клиенту
   */
  sendToClient(clientId: string, message: any): boolean {
    const client = this.clients.get(clientId);
    if (!client || client.socket.readyState !== WebSocket.OPEN) {
      return false;
    }

    try {
      client.socket.send(JSON.stringify(message));
      return true;
    } catch (error) {
      logger.error(`Failed to send message to client ${clientId}:`, error);
      this.removeClient(clientId);
      return false;
    }
  }

  /**
   * Отправляет сообщение всем подключенным админам
   */
  broadcast(eventType: string, data: any, targetUserId?: number): void {
    const message = {
      type: eventType,
      data,
      timestamp: new Date().toISOString()
    };

    let sentCount = 0;

    for (const [clientId, client] of this.clients) {
      // Проверяем права доступа
      if (!client.isAdmin) continue;

      // Проверяем подписку на событие (если указана)
      if (client.subscribedEvents.size > 0 && !client.subscribedEvents.has(eventType)) {
        continue;
      }

      // Проверяем целевого пользователя (если указан)
      if (targetUserId && client.userId !== targetUserId) {
        continue;
      }

      if (this.sendToClient(clientId, message)) {
        sentCount++;
      }
    }

    logger.debug(`Broadcasted ${eventType} to ${sentCount} clients`);
  }

  /**
   * Отправляет статистику конкретному клиенту
   */
  sendStats(clientId: string): void {
    const stats = {
      connectedClients: this.clients.size,
      adminClients: Array.from(this.clients.values()).filter(c => c.isAdmin).length,
      timestamp: new Date().toISOString()
    };

    this.sendToClient(clientId, {
      type: 'stats',
      data: stats
    });
  }

  /**
   * Пингует всех клиентов для проверки соединения
   */
  private pingClients(): void {
    const now = new Date();
    const timeout = 60000; // 1 минута

    for (const [clientId, client] of this.clients) {
      // Удаляем неактивных клиентов
      if (now.getTime() - client.lastPing.getTime() > timeout) {
        logger.warn(`Removing inactive client: ${clientId}`);
        this.removeClient(clientId);
        continue;
      }

      // Отправляем ping активным клиентам
      if (client.socket.readyState === WebSocket.OPEN) {
        this.sendToClient(clientId, { type: 'ping' });
      }
    }
  }

  /**
   * Возвращает статистику подключений
   */
  getStats() {
    const clients = Array.from(this.clients.values());
    return {
      total: clients.length,
      admins: clients.filter(c => c.isAdmin).length,
      users: clients.filter(c => !c.isAdmin).length,
      active: clients.filter(c => c.socket.readyState === WebSocket.OPEN).length
    };
  }

  /**
   * Закрывает все соединения
   */
  close(): void {
    clearInterval(this.pingInterval);
    
    for (const [clientId] of this.clients) {
      this.removeClient(clientId);
    }
    
    this.clients.clear();
  }
}