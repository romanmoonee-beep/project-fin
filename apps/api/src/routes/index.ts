import { FastifyInstance } from 'fastify';
import { loadApiConfig } from '@pr-gram/config';

// Import route modules
import authRoutes from './auth';
import dashboardRoutes from './dashboard';
import usersRoutes from './users';
import tasksRoutes from './tasks';
import checksRoutes from './checks';
import subscriptionsRoutes from './subscriptions';
import financesRoutes from './finances';
import notificationsRoutes from './notifications';
import analyticsRoutes from './analytics';
import settingsRoutes from './settings';
import logsRoutes from './logs';
import webhookRoutes from './webhooks';
import websocketRoutes from './websocket';

const config = loadApiConfig();

export async function setupRoutes(fastify: FastifyInstance) {
  const apiPrefix = config.API_PREFIX || '/api/v1';

  // Health check endpoint (without prefix)
  fastify.get('/health', async (request, reply) => {
    const uptime = process.uptime();
    const memoryUsage = process.memoryUsage();
    
    return {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: Math.floor(uptime),
      memory: {
        rss: Math.round(memoryUsage.rss / 1024 / 1024),
        heapUsed: Math.round(memoryUsage.heapUsed / 1024 / 1024),
        heapTotal: Math.round(memoryUsage.heapTotal / 1024 / 1024),
        external: Math.round(memoryUsage.external / 1024 / 1024)
      },
      nodeVersion: process.version,
      environment: config.NODE_ENV
    };
  });

  // API Info endpoint (without prefix)
  fastify.get('/info', async (request, reply) => {
    return {
      name: 'PR GRAM Admin API',
      version: '1.0.0',
      environment: config.NODE_ENV,
      apiPrefix,
      documentation: `${config.NODE_ENV === 'production' ? 'https' : 'http'}://${request.hostname}${config.SWAGGER_PATH}`,
      endpoints: {
        auth: `${apiPrefix}/auth`,
        dashboard: `${apiPrefix}/dashboard`,
        users: `${apiPrefix}/users`,
        tasks: `${apiPrefix}/tasks`,
        checks: `${apiPrefix}/checks`,
        subscriptions: `${apiPrefix}/subscriptions`,
        finances: `${apiPrefix}/finances`,
        notifications: `${apiPrefix}/notifications`,
        analytics: `${apiPrefix}/analytics`,
        settings: `${apiPrefix}/settings`,
        logs: `${apiPrefix}/logs`,
        websocket: '/ws'
      }
    };
  });

  // Register API routes with prefix
  await fastify.register(async function (fastify) {
    // Authentication routes
    await fastify.register(authRoutes, { prefix: '/auth' });
    
    // Dashboard routes  
    await fastify.register(dashboardRoutes, { prefix: '/dashboard' });
    
    // User management routes
    await fastify.register(usersRoutes, { prefix: '/users' });
    
    // Task management routes
    await fastify.register(tasksRoutes, { prefix: '/tasks' });
    
    // Check management routes
    await fastify.register(checksRoutes, { prefix: '/checks' });
    
    // Subscription check routes
    await fastify.register(subscriptionsRoutes, { prefix: '/subscriptions' });
    
    // Financial management routes
    await fastify.register(financesRoutes, { prefix: '/finances' });
    
    // Notification routes
    await fastify.register(notificationsRoutes, { prefix: '/notifications' });
    
    // Analytics routes
    await fastify.register(analyticsRoutes, { prefix: '/analytics' });
    
    // System settings routes
    await fastify.register(settingsRoutes, { prefix: '/settings' });
    
    // Logs and monitoring routes
    await fastify.register(logsRoutes, { prefix: '/logs' });
    
  }, { prefix: apiPrefix });

  // Webhook routes (without API prefix)
  await fastify.register(webhookRoutes, { prefix: '/webhooks' });
  
  // WebSocket routes (without API prefix)  
  await fastify.register(websocketRoutes);

  // 404 handler for API routes
  fastify.setNotFoundHandler({
    preHandler: fastify.rateLimit({
      max: 10,
      timeWindow: '1 minute'
    })
  }, async (request, reply) => {
    return reply.status(404).send({
      success: false,
      error: 'Not Found',
      message: `API endpoint ${request.method} ${request.url} not found`,
      timestamp: new Date().toISOString()
    });
  });

  fastify.log.info(`API routes registered with prefix: ${apiPrefix}`);
}