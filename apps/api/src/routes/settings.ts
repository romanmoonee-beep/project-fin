// apps/api/src/routes/settings.ts
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { prisma } from '@pr-gram/database';
import bcrypt from 'bcryptjs';

interface UpdateSettingBody {
  key: string;
  value: any;
}

export default async function settingsRoutes(fastify: FastifyInstance) {
  
  // GET /settings - Получить все настройки
  fastify.get('/', {
    preHandler: [fastify.authenticate, fastify.requireAdmin],
    schema: {
      tags: ['Settings'],
      summary: 'Get system settings',
      security: [{ JWT: [] }]
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const settings = await prisma.systemSetting.findMany({
        select: {
          key: true,
          value: true,
          updatedAt: true
        }
      });

      // Группируем настройки по категориям
      const categorized = settings.reduce((acc, setting) => {
        const category = setting.key.split('_')[0];
        if (!acc[category]) acc[category] = {};
        
        // Скрываем чувствительные данные
        let value = setting.value;
        if (setting.key.includes('secret') || setting.key.includes('password')) {
          value = '***';
        }
        
        acc[category][setting.key] = {
          value,
          updatedAt: setting.updatedAt
        };
        return acc;
      }, {} as Record<string, any>);

      return {
        success: true,
        data: { settings: categorized }
      };
    } catch (error) {
      fastify.log.error('Get settings error:', error);
      return reply.status(500).send({
        success: false,
        error: 'Failed to fetch settings'
      });
    }
  });

  // PUT /settings - Обновить настройку
  fastify.put<{ Body: UpdateSettingBody }>('/', {
    preHandler: [fastify.authenticate, fastify.requireSuperAdmin],
    schema: {
      tags: ['Settings'],
      summary: 'Update system setting',
      security: [{ JWT: [] }],
      body: {
        type: 'object',
        properties: {
          key: { type: 'string', minLength: 1 },
          value: {}
        },
        required: ['key', 'value']
      }
    }
  }, async (request: FastifyRequest<{ Body: UpdateSettingBody }>, reply: FastifyReply) => {
    try {
      const { key, value } = request.body;
      const adminUser = (request as any).user;

      // Специальная обработка для паролей
      let processedValue = value;
      if (key.includes('password') || key.includes('secret')) {
        processedValue = await bcrypt.hash(value.toString(), 12);
      }

      const setting = await prisma.systemSetting.upsert({
        where: { key },
        update: { 
          value: processedValue,
          updatedBy: BigInt(adminUser.userId)
        },
        create: {
          key,
          value: processedValue,
          updatedBy: BigInt(adminUser.userId)
        }
      });

      // Логируем изменение настройки
      await prisma.userActivity.create({
        data: {
          userId: BigInt(adminUser.userId),
          type: 'admin_action',
          description: `Updated system setting: ${key}`,
          metadata: {
            settingKey: key,
            valueType: typeof value,
            isSecret: key.includes('password') || key.includes('secret')
          }
        }
      });

      return {
        success: true,
        data: {
          setting: {
            key: setting.key,
            updatedAt: setting.updatedAt
          }
        },
        message: 'Setting updated successfully'
      };
    } catch (error) {
      fastify.log.error('Update setting error:', error);
      return reply.status(500).send({
        success: false,
        error: 'Failed to update setting'
      });
    }
  });

  // GET /settings/admins - Список администраторов
  fastify.get('/admins', {
    preHandler: [fastify.authenticate, fastify.requireSuperAdmin]
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const admins = await prisma.user.findMany({
        where: {
          role: { in: ['admin', 'super_admin', 'moderator'] }
        },
        select: {
          id: true,
          telegramId: true,
          username: true,
          firstName: true,
          role: true,
          createdAt: true,
          updatedAt: true
        }
      });

      return {
        success: true,
        data: {
          admins: admins.map(admin => ({
            ...admin,
            telegramId: Number(admin.telegramId)
          }))
        }
      };
    } catch (error) {
      fastify.log.error('Get admins error:', error);
      return reply.status(500).send({
        success: false,
        error: 'Failed to fetch admins'
      });
    }
  });
}