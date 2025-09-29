import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { prisma } from '@pr-gram/database';
import { UserRole } from '@pr-gram/shared';
import bcrypt from 'bcryptjs';
import { loadApiConfig } from '@pr-gram/config';

const config = loadApiConfig();

// Request/Response types
interface LoginRequest {
  webtoken: string;
  secretKey: string;
}

interface RefreshRequest {
  refreshToken: string;
}

interface AuthResponse {
  success: boolean;
  data?: {
    accessToken: string;
    refreshToken: string;
    user: {
      id: string;
      telegramId: number;
      username?: string;
      role: UserRole;
      isAdmin: boolean;
    };
    expiresIn: number;
  };
  message?: string;
  error?: string;
}

export default async function authRoutes(fastify: FastifyInstance) {
  
  // POST /auth/login - Админский вход через webtoken + secret key
  fastify.post<{ Body: LoginRequest }>('/login', {
    schema: {
      tags: ['Auth'],
      summary: 'Admin login with webtoken and secret key',
      description: 'Authenticate admin user using webtoken and secret key',
      body: {
        type: 'object',
        required: ['webtoken', 'secretKey'],
        properties: {
          webtoken: { 
            type: 'string',
            description: 'WebToken from bot admin panel',
            minLength: 10
          },
          secretKey: { 
            type: 'string',
            description: 'Admin secret key',
            minLength: 8
          }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: {
              type: 'object',
              properties: {
                accessToken: { type: 'string' },
                refreshToken: { type: 'string' },
                user: {
                  type: 'object',
                  properties: {
                    id: { type: 'string' },
                    telegramId: { type: 'number' },
                    username: { type: 'string' },
                    role: { type: 'string' },
                    isAdmin: { type: 'boolean' }
                  }
                },
                expiresIn: { type: 'number' }
              }
            }
          }
        },
        401: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            error: { type: 'string' },
            message: { type: 'string' }
          }
        }
      }
    }
  }, async (request: FastifyRequest<{ Body: LoginRequest }>, reply: FastifyReply): Promise<AuthResponse> => {
    try {
      const { webtoken, secretKey } = request.body;

      // 1. Проверяем webtoken в системных настройках
      const webtokenSetting = await prisma.systemSetting.findUnique({
        where: { key: 'admin_webtokens' }
      });

      if (!webtokenSetting) {
        return reply.status(401).send({
          success: false,
          error: 'Invalid webtoken',
          message: 'Webtoken not found in system'
        });
      }

      const validWebtokens = webtokenSetting.value as { [key: string]: { userId: number; expiresAt: string; isActive: boolean } };
      const webtokenData = validWebtokens[webtoken];

      if (!webtokenData || !webtokenData.isActive) {
        return reply.status(401).send({
          success: false,
          error: 'Invalid webtoken',
          message: 'Webtoken is invalid or inactive'
        });
      }

      // Проверяем срок действия webtoken
      if (new Date(webtokenData.expiresAt) < new Date()) {
        return reply.status(401).send({
          success: false,
          error: 'Webtoken expired',
          message: 'Webtoken has expired'
        });
      }

      // 2. Находим пользователя по userId из webtoken
      const user = await prisma.user.findUnique({
        where: { telegramId: BigInt(webtokenData.userId) }
      });

      if (!user) {
        return reply.status(401).send({
          success: false,
          error: 'User not found',
          message: 'Admin user not found'
        });
      }

      // 3. Проверяем права администратора
      const isAdmin = [UserRole.ADMIN, UserRole.SUPER_ADMIN].includes(user.role);
      if (!isAdmin) {
        return reply.status(401).send({
          success: false,
          error: 'Insufficient permissions',
          message: 'User does not have admin privileges'
        });
      }

      // 4. Проверяем секретный ключ
      const adminSecretKey = await prisma.systemSetting.findUnique({
        where: { key: 'admin_secret_key' }
      });

      if (!adminSecretKey) {
        return reply.status(500).send({
          success: false,
          error: 'Configuration error',
          message: 'Admin secret key not configured'
        });
      }

      const isValidSecretKey = await bcrypt.compare(secretKey, adminSecretKey.value as string);
      if (!isValidSecretKey) {
        return reply.status(401).send({
          success: false,
          error: 'Invalid secret key',
          message: 'Secret key is incorrect'
        });
      }

      // 5. Генерируем JWT токены
      const accessToken = fastify.jwt.sign(
        { 
          userId: Number(user.telegramId),
          role: user.role,
          isAdmin: true,
          webtokenId: webtoken
        },
        { expiresIn: config.JWT_ACCESS_TOKEN_TTL || '15m' }
      );

      const refreshToken = fastify.jwt.sign(
        { 
          userId: Number(user.telegramId),
          type: 'refresh',
          webtokenId: webtoken
        },
        { 
          expiresIn: config.JWT_REFRESH_TOKEN_TTL || '7d'
        }
      );

      // 6. Сохраняем refresh token в БД
      await prisma.systemSetting.upsert({
        where: { key: `refresh_token_${user.telegramId}` },
        update: { 
          value: refreshToken,
          updatedBy: user.telegramId
        },
        create: {
          key: `refresh_token_${user.telegramId}`,
          value: refreshToken,
          updatedBy: user.telegramId
        }
      });

      // 7. Логируем вход в систему
      await prisma.userActivity.create({
        data: {
          userId: user.telegramId,
          type: 'admin_login',
          description: 'Admin logged in via web interface',
          metadata: {
            webtoken: webtoken.substring(0, 10) + '...',
            ip: request.ip,
            userAgent: request.headers['user-agent']
          }
        }
      });

      // 8. Публикуем событие входа
      await fastify.eventBus.publish('admin:action', {
        adminId: Number(user.telegramId),
        action: 'login',
        target: { webtoken },
        timestamp: new Date()
      });

      // 9. Устанавливаем cookie и возвращаем данные
      reply.setCookie('admin_token', accessToken, {
        httpOnly: true,
        secure: config.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: config.JWT_ACCESS_TOKEN_TTL || 900 // 15 minutes
      });

      return {
        success: true,
        data: {
          accessToken,
          refreshToken,
          user: {
            id: user.id,
            telegramId: Number(user.telegramId),
            username: user.username || undefined,
            role: user.role,
            isAdmin: true
          },
          expiresIn: config.JWT_ACCESS_TOKEN_TTL || 900
        }
      };

    } catch (error) {
      fastify.log.error('Login error:', error);
      return reply.status(500).send({
        success: false,
        error: 'Internal server error',
        message: 'An error occurred during login'
      });
    }
  });

  // POST /auth/refresh - Обновление токена
  fastify.post<{ Body: RefreshRequest }>('/refresh', {
    schema: {
      tags: ['Auth'],
      summary: 'Refresh access token',
      body: {
        type: 'object',
        required: ['refreshToken'],
        properties: {
          refreshToken: { type: 'string' }
        }
      }
    }
  }, async (request: FastifyRequest<{ Body: RefreshRequest }>, reply: FastifyReply) => {
    try {
      const { refreshToken } = request.body;

      // Проверяем refresh token
      const decoded = fastify.jwt.verify(refreshToken) as any;
      
      if (decoded.type !== 'refresh') {
        return reply.status(401).send({
          success: false,
          error: 'Invalid token type'
        });
      }

      // Проверяем что токен есть в БД
      const storedToken = await prisma.systemSetting.findUnique({
        where: { key: `refresh_token_${decoded.userId}` }
      });

      if (!storedToken || storedToken.value !== refreshToken) {
        return reply.status(401).send({
          success: false,
          error: 'Invalid refresh token'
        });
      }

      // Получаем пользователя
      const user = await prisma.user.findUnique({
        where: { telegramId: BigInt(decoded.userId) }
      });

      if (!user || ![UserRole.ADMIN, UserRole.SUPER_ADMIN].includes(user.role)) {
        return reply.status(401).send({
          success: false,
          error: 'User not found or insufficient permissions'
        });
      }

      // Генерируем новый access token
      const newAccessToken = fastify.jwt.sign(
        { 
          userId: decoded.userId,
          role: user.role,
          isAdmin: true,
          webtokenId: decoded.webtokenId
        },
        { expiresIn: config.JWT_ACCESS_TOKEN_TTL || '15m' }
      );

      reply.setCookie('admin_token', newAccessToken, {
        httpOnly: true,
        secure: config.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: config.JWT_ACCESS_TOKEN_TTL || 900
      });

      return {
        success: true,
        data: {
          accessToken: newAccessToken,
          expiresIn: config.JWT_ACCESS_TOKEN_TTL || 900
        }
      };

    } catch (error) {
      fastify.log.error('Refresh token error:', error);
      return reply.status(401).send({
        success: false,
        error: 'Invalid or expired refresh token'
      });
    }
  });

  // POST /auth/logout - Выход
  fastify.post('/logout', {
    preHandler: [fastify.authenticate],
    schema: {
      tags: ['Auth'],
      summary: 'Logout admin user',
      security: [{ JWT: [] }]
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = (request as any).user;

      // Удаляем refresh token из БД
      await prisma.systemSetting.deleteMany({
        where: { key: `refresh_token_${user.userId}` }
      });

      // Логируем выход
      await prisma.userActivity.create({
        data: {
          userId: BigInt(user.userId),
          type: 'admin_logout',
          description: 'Admin logged out from web interface',
          metadata: {
            ip: request.ip,
            userAgent: request.headers['user-agent']
          }
        }
      });

      // Публикуем событие выхода
      await fastify.eventBus.publish('admin:action', {
        adminId: user.userId,
        action: 'logout',
        target: {},
        timestamp: new Date()
      });

      // Удаляем cookie
      reply.clearCookie('admin_token');

      return {
        success: true,
        message: 'Logged out successfully'
      };

    } catch (error) {
      fastify.log.error('Logout error:', error);
      return reply.status(500).send({
        success: false,
        error: 'Logout failed'
      });
    }
  });

  // GET /auth/me - Информация о текущем пользователе
  fastify.get('/me', {
    preHandler: [fastify.authenticate],
    schema: {
      tags: ['Auth'],
      summary: 'Get current user info',
      security: [{ JWT: [] }]
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const authUser = (request as any).user;
      
      const user = await prisma.user.findUnique({
        where: { telegramId: BigInt(authUser.userId) },
        select: {
          id: true,
          telegramId: true,
          username: true,
          firstName: true,
          lastName: true,
          role: true,
          createdAt: true,
          updatedAt: true
        }
      });

      if (!user) {
        return reply.status(404).send({
          success: false,
          error: 'User not found'
        });
      }

      return {
        success: true,
        data: {
          ...user,
          telegramId: Number(user.telegramId),
          isAdmin: [UserRole.ADMIN, UserRole.SUPER_ADMIN].includes(user.role)
        }
      };

    } catch (error) {
      fastify.log.error('Get user info error:', error);
      return reply.status(500).send({
        success: false,
        error: 'Failed to get user info'
      });
    }
  });
}