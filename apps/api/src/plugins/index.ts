import { FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import websocket from '@fastify/websocket';
import jwt from '@fastify/jwt';
import cookie from '@fastify/cookie';
import multipart from '@fastify/multipart';
import swagger from '@fastify/swagger';
import swaggerUI from '@fastify/swagger-ui';
import { config } from '@pr-gram/config';

export async function setupPlugins(fastify: FastifyInstance) {
  // CORS для веб-админки
  await fastify.register(cors, {
    origin: config.NODE_ENV === 'production' 
      ? [
          process.env.ADMIN_URL || 'https://yourdomain.com',
          process.env.WEB_URL || 'https://yourdomain.com',
          ...(process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',') : [])
        ]
      : [
          process.env.CORS_ORIGIN || 'http://localhost:3000',
          'http://localhost:3000',
          'http://localhost:5173',
          'http://127.0.0.1:3000',
          'http://127.0.0.1:5173'
        ],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS']
  });

  // WebSocket поддержка
  await fastify.register(websocket, {
    options: {
      maxPayload: 1048576, // 1MB
      verifyClient: (info) => {
        // Здесь можно добавить авторизацию WebSocket
        return true;
      }
    }
  });

  // JWT для аутентификации
  await fastify.register(jwt, {
    secret: config.JWT_SECRET!,
    cookie: {
      cookieName: 'admin_token',
      signed: false
    },
    sign: {
      expiresIn: '24h'
    }
  });

  // Cookie поддержка
  await fastify.register(cookie, {
    secret: config.JWT_SECRET,
    parseOptions: {}
  });

  // Multipart для загрузки файлов
  await fastify.register(multipart, {
    limits: {
      fieldNameSize: 100,
      fieldSize: 100000,
      fields: 10,
      fileSize: 10000000, // 10MB
      files: 5,
      headerPairs: 2000
    }
  });

  // Swagger документация
  await fastify.register(swagger, {
    swagger: {
      info: {
        title: 'PR GRAM Admin API',
        description: 'API для административной панели PR GRAM Bot',
        version: '1.0.0'
      },
      host: config.NODE_ENV === 'production' 
        ? (process.env.API_HOST || 'api.yourdomain.com')
        : `localhost:${config.API_PORT}`,
      schemes: config.NODE_ENV === 'production' ? ['https'] : ['http', 'https'],
      consumes: ['application/json'],
      produces: ['application/json'],
      tags: [
        { name: 'Auth', description: 'Аутентификация' },
        { name: 'Dashboard', description: 'Главная панель' },
        { name: 'Users', description: 'Управление пользователями' },
        { name: 'Tasks', description: 'Управление заданиями' },
        { name: 'Checks', description: 'Система чеков' },
        { name: 'Subscriptions', description: 'Проверки подписки' },
        { name: 'Finances', description: 'Финансы' },
        { name: 'Notifications', description: 'Уведомления' },
        { name: 'Analytics', description: 'Аналитика' },
        { name: 'Settings', description: 'Настройки' },
        { name: 'Logs', description: 'Логи' }
      ],
      securityDefinitions: {
        JWT: {
          type: 'apiKey',
          name: 'Authorization',
          in: 'header'
        }
      }
    }
  });

  // Swagger UI
  await fastify.register(swaggerUI, {
    routePrefix: '/docs',
    uiConfig: {
      docExpansion: 'list',
      deepLinking: false
    },
    staticCSP: true,
    transformStaticCSP: (header) => header
  });

  // Error handler
  fastify.setErrorHandler(async (error, request, reply) => {
    fastify.log.error(error);

    // JWT ошибки
    if (error.code === 'FST_JWT_NO_AUTHORIZATION_IN_COOKIE') {
      return reply.status(401).send({
        error: 'Unauthorized',
        message: 'Missing or invalid authentication token'
      });
    }

    // Validation ошибки
    if (error.validation) {
      return reply.status(400).send({
        error: 'Validation Error',
        message: 'Invalid request data',
        details: error.validation
      });
    }

    // 500 ошибки
    return reply.status(500).send({
      error: 'Internal Server Error',
      message: config.NODE_ENV === 'development' ? error.message : 'Something went wrong'
    });
  });

  // Not found handler
  fastify.setNotFoundHandler(async (request, reply) => {
    return reply.status(404).send({
      error: 'Not Found',
      message: `Route ${request.method} ${request.url} not found`
    });
  });
}