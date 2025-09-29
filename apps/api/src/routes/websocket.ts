import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { SocketStream } from '@fastify/websocket';
import { loadApiConfig } from '@pr-gram/config';
import jwt from 'jsonwebtoken';

const config = loadApiConfig();

interface WebSocketQuery {
  token?: string;
}

interface JWTPayload {
  userId: number;
  role: string;
  isAdmin: boolean;
}

export default async function websocketRoutes(fastify: FastifyInstance) {
  // WebSocket connection endpoint
  fastify.register(async function (fastify) {
    fastify.get('/ws', { websocket: true }, async (connection: SocketStream, request: FastifyRequest<{ Querystring: WebSocketQuery }>) => {
      const { socket } = connection;
      let clientId: string | null = null;
      let isAuthenticated = false;
      let userInfo: JWTPayload | null = null;

      try {
        // Authenticate user via JWT token
        const token = request.query.token;
        if (token) {
          try {
            const decoded = jwt.verify(token, config.JWT_SECRET!) as JWTPayload;
            userInfo = decoded;
            isAuthenticated = true;
            
            // Add client to WebSocket manager
            clientId = fastify.wsManager.addClient(
              socket,
              decoded.userId,
              decoded.isAdmin
            );
            
            fastify.log.info(`WebSocket client authenticated: ${decoded.userId} (admin: ${decoded.isAdmin})`);
            
            // Send authentication success
            socket.send(JSON.stringify({
              type: 'auth:success',
              data: {
                userId: decoded.userId,
                role: decoded.role,
                isAdmin: decoded.isAdmin,
                clientId
              }
            }));
            
          } catch (authError) {
            fastify.log.warn('WebSocket authentication failed:', authError);
            socket.send(JSON.stringify({
              type: 'auth:failed',
              data: { message: 'Invalid or expired token' }
            }));
            socket.close(1008, 'Authentication failed');
            return;
          }
        } else {
          // Allow anonymous connection with limited functionality
          clientId = fastify.wsManager.addClient(socket, undefined, false);
          
          socket.send(JSON.stringify({
            type: 'auth:anonymous',
            data: { 
              message: 'Connected as anonymous user',
              clientId 
            }
          }));
        }

        // Handle incoming messages
        socket.on('message', async (rawMessage) => {
          try {
            const message = JSON.parse(rawMessage.toString());
            await handleWebSocketMessage(fastify, socket, message, userInfo, clientId!);
          } catch (error) {
            fastify.log.error('Error handling WebSocket message:', error);
            socket.send(JSON.stringify({
              type: 'error',
              data: { message: 'Invalid message format' }
            }));
          }
        });

        // Handle connection close
        socket.on('close', (code, reason) => {
          if (clientId) {
            fastify.wsManager.removeClient(clientId);
          }
          fastify.log.info(`WebSocket client disconnected: ${clientId} (code: ${code}, reason: ${reason})`);
        });

        // Handle errors
        socket.on('error', (error) => {
          fastify.log.error(`WebSocket error for client ${clientId}:`, error);
          if (clientId) {
            fastify.wsManager.removeClient(clientId);
          }
        });

      } catch (error) {
        fastify.log.error('WebSocket connection error:', error);
        socket.close(1011, 'Server error');
      }
    });
  });
   
  // WebSocket status endpoint
  fastify.get('/ws/status', async (request, reply) => {
    const stats = fastify.wsManager.getStats();
    
    return {
      websocket: {
        enabled: true,
        endpoint: '/ws',
        connections: stats
      },
      eventBus: {
        connected: fastify.eventBus.isReady(),
        stats: fastify.eventBus.getStats()
      }
    };
  });
  
  // WebSocket broadcast endpoint (admin only)
  fastify.post('/ws/broadcast', {
    preHandler: [fastify.authenticate, fastify.requireAdmin]
  }, async (request, reply) => {
    const { eventType, data, targetUserId } = request.body as {
      eventType: string;
      data: any;
      targetUserId?: number;
    };

    try {
      fastify.wsManager.broadcast(eventType, data, targetUserId);
      
      return {
        success: true,
        message: 'Broadcast sent successfully',
        eventType,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      fastify.log.error('Broadcast error:', error);
      return reply.status(500).send({
        success: false,
        error: 'Failed to send broadcast'
      });
    }
  });
  
    // POST /webhooks/telegram - Webhook для Telegram бота
  fastify.post('/telegram', {
    schema: {
      tags: ['Webhooks'],
      summary: 'Telegram bot webhook endpoint',
      body: { type: 'object' }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      // Здесь будет обработка webhook от Telegram
      // Пока возвращаем заглушку
      return { 
        success: true, 
        message: 'Webhook received',
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      fastify.log.error('Telegram webhook error:', error);
      return reply.status(200).send({ ok: true });
    }
  });

  // POST /webhooks/payment - Webhook для платежных систем
  fastify.post('/payment', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      // Обработка платежных webhook
      return { success: true, message: 'Payment webhook received' };
    } catch (error) {
      fastify.log.error('Payment webhook error:', error);
      return reply.status(200).send({ ok: true });
    }
  });
}

// Handle different types of WebSocket messages
async function handleWebSocketMessage(
  fastify: FastifyInstance,
  socket: any,
  message: any,
  userInfo: JWTPayload | null,
  clientId: string
) {
  const { type, data } = message;

  switch (type) {
    case 'ping':
      // Handled by WebSocketManager
      break;

    case 'subscribe':
      // Subscribe to specific events
      if (data?.events && Array.isArray(data.events)) {
        // Handled by WebSocketManager
        fastify.log.debug(`Client ${clientId} subscribed to events:`, data.events);
      }
      break;

    case 'unsubscribe':
      // Unsubscribe from events
      if (data?.events && Array.isArray(data.events)) {
        // Handled by WebSocketManager
        fastify.log.debug(`Client ${clientId} unsubscribed from events:`, data.events);
      }
      break;

    case 'request_stats':
      // Send current statistics
      if (userInfo?.isAdmin) {
        fastify.wsManager.sendStats(clientId);
      } else {
        socket.send(JSON.stringify({
          type: 'error',
          data: { message: 'Insufficient permissions' }
        }));
      }
      break;

    case 'admin_action':
      // Handle admin-specific actions
      if (userInfo?.isAdmin) {
        await handleAdminAction(fastify, socket, data, userInfo, clientId);
      } else {
        socket.send(JSON.stringify({
          type: 'error',
          data: { message: 'Admin access required' }
        }));
      }
      break;

    default:
      socket.send(JSON.stringify({
        type: 'error',
        data: { message: `Unknown message type: ${type}` }
      }));
      break;
  }
}

// Handle admin-specific WebSocket actions
async function handleAdminAction(
  fastify: FastifyInstance,
  socket: any,
  data: any,
  userInfo: JWTPayload,
  clientId: string
) {
  const { action, payload } = data;

  try {
    switch (action) {
      case 'force_refresh':
        // Force refresh for all connected clients
        fastify.wsManager.broadcast('system:force_refresh', {
          reason: payload?.reason || 'Admin requested refresh',
          adminId: userInfo.userId
        });
        
        socket.send(JSON.stringify({
          type: 'admin_action:success',
          data: { action, message: 'Force refresh sent to all clients' }
        }));
        break;

      case 'maintenance_mode':
        // Toggle maintenance mode
        const enabled = payload?.enabled || false;
        fastify.wsManager.broadcast('system:maintenance_mode', {
          enabled,
          message: payload?.message || 'System maintenance',
          adminId: userInfo.userId
        });
        
        socket.send(JSON.stringify({
          type: 'admin_action:success',
          data: { action, enabled, message: 'Maintenance mode updated' }
        }));
        break;

      case 'broadcast_message':
        // Send custom message to all users
        if (payload?.message) {
          fastify.wsManager.broadcast('system:admin_message', {
            message: payload.message,
            priority: payload.priority || 'normal',
            adminId: userInfo.userId,
            timestamp: new Date().toISOString()
          });
          
          socket.send(JSON.stringify({
            type: 'admin_action:success',
            data: { action, message: 'Message broadcasted successfully' }
          }));
        }
        break;

      default:
        socket.send(JSON.stringify({
          type: 'admin_action:error',
          data: { message: `Unknown admin action: ${action}` }
        }));
        break;
    }
  } catch (error) {
    fastify.log.error('Admin action error:', error);
    socket.send(JSON.stringify({
      type: 'admin_action:error',
      data: { message: 'Failed to execute admin action', action }
    }));
  }
}