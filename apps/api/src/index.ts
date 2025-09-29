import Fastify from 'fastify';
import { loadApiConfig } from '@pr-gram/config';
import { logger } from '@pr-gram/shared';
import { setupPlugins } from './plugins';
import { setupRoutes } from './routes';
import { WebSocketManager } from './websocket/manager';
import { RedisEventBus } from './events/redis-bus';

// Загружаем конфигурацию из общего .env в корне проекта
const config = loadApiConfig();

const fastify = Fastify({
  logger: {
    level: config.NODE_ENV === 'development' ? 'debug' : 'info',
    transport: config.NODE_ENV === 'development' ? {
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'HH:MM:ss',
        ignore: 'pid,hostname'
      }
    } : undefined
  }
});

async function start() {
  try {
    // Регистрируем плагины
    await setupPlugins(fastify);
    
    // Инициализируем WebSocket Manager
    const wsManager = new WebSocketManager();
    fastify.decorate('wsManager', wsManager);
    
    // Инициализируем Redis Event Bus для real-time синхронизации
    const eventBus = new RedisEventBus();
    await eventBus.connect();
    fastify.decorate('eventBus', eventBus);
    
    // Подключаем события для real-time обновлений
    eventBus.on('user:updated', (data) => {
      wsManager.broadcast('user:updated', data);
    });
    
    eventBus.on('task:created', (data) => {
      wsManager.broadcast('task:created', data);
    });
    
    eventBus.on('task:updated', (data) => {
      wsManager.broadcast('task:updated', data);
    });
    
    eventBus.on('transaction:created', (data) => {
      wsManager.broadcast('transaction:created', data);
    });
    
    eventBus.on('check:activated', (data) => {
      wsManager.broadcast('check:activated', data);
    });
    
    eventBus.on('subscription:checked', (data) => {
      wsManager.broadcast('subscription:checked', data);
    });
    
    // Регистрируем роуты
    await setupRoutes(fastify);
    
    // Обработка graceful shutdown
    const gracefulShutdown = async () => {
      logger.info('Shutting down API server...');
      await eventBus.disconnect();
      await fastify.close();
      process.exit(0);
    };
    
    process.on('SIGTERM', gracefulShutdown);
    process.on('SIGINT', gracefulShutdown);
    
    // Запускаем сервер
    const port = config.API_PORT || 3001;
    const host = config.NODE_ENV === 'production' ? '0.0.0.0' : 'localhost';
    
    await fastify.listen({ port, host });
    
    const displayHost = config.NODE_ENV === 'production' 
      ? (process.env.API_HOST || 'your-server-ip')
      : host;
    
    logger.info(`🚀 API Server running on http${config.NODE_ENV === 'production' ? 's' : ''}://${displayHost}:${port}`);
    logger.info(`📚 API Documentation: http${config.NODE_ENV === 'production' ? 's' : ''}://${displayHost}:${port}/docs`);
    logger.info(`🔌 WebSocket endpoint: ws${config.NODE_ENV === 'production' ? 's' : ''}://${displayHost}:${port}/ws`);
    
  } catch (error) {
    logger.error('Failed to start API server:', error);
    process.exit(1);
  }
}

// Типы для Fastify instance
declare module 'fastify' {
  interface FastifyInstance {
    wsManager: WebSocketManager;
    eventBus: RedisEventBus;
  }
}

start();