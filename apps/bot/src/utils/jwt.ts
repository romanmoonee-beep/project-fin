import jwt from 'jsonwebtoken';
import { prisma } from '@pr-gram/database';
import { config } from '../config';

export function generateAdminToken(userId: number, userLevel: string): string {
  const payload = {
    userId,
    userLevel,
    isAdmin: true,
    type: 'admin_dashboard',
    iat: Math.floor(Date.now() / 1000)
  };

  return jwt.sign(payload, config.ADMIN_JWT_SECRET, {
    expiresIn: config.ADMIN_JWT_EXPIRES
  });
}

export function verifyAdminToken(token: string): any {
  return jwt.verify(token, config.ADMIN_JWT_SECRET);
}

export async function logAdminSession(userId: number, token: string, ipAddress?: string, userAgent?: string): Promise<void> {
  try {
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 минут
    
    await prisma.adminSession.create({
      data: {
        userId,
        token,
        expiresAt,
        ipAddress,
        userAgent,
        isActive: true
      }
    });
  } catch (error) {
    console.error('Log admin session error:', error);
  }
}

export async function validateAdminSession(token: string): Promise<boolean> {
  try {
    // Проверяем JWT токен
    const decoded = verifyAdminToken(token);
    
    // Проверяем сессию в БД
    const session = await prisma.adminSession.findFirst({
      where: {
        token,
        isActive: true,
        expiresAt: {
          gt: new Date()
        }
      }
    });

    if (!session) {
      return false;
    }

    // Обновляем время последнего использования
    await prisma.adminSession.update({
      where: { id: session.id },
      data: { lastUsedAt: new Date() }
    });

    return true;
  } catch (error) {
    console.error('Admin session validation error:', error);
    return false;
  }
}

export async function revokeAdminSession(token: string): Promise<void> {
  try {
    await prisma.adminSession.updateMany({
      where: { token },
      data: { isActive: false }
    });
  } catch (error) {
    console.error('Revoke admin session error:', error);
  }
}

export async function cleanupExpiredSessions(): Promise<void> {
  try {
    await prisma.adminSession.updateMany({
      where: {
        expiresAt: {
          lt: new Date()
        },
        isActive: true
      },
      data: { isActive: false }
    });
  } catch (error) {
    console.error('Cleanup expired sessions error:', error);
  }
}