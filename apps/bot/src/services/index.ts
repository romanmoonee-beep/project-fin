<<<<<<< HEAD
=======
import { prisma } from '@pr-gram/database';
>>>>>>> b118273 (2-commit)
// Export all services
export { taskService } from './taskService';
export { subscriptionService } from './subscriptionService';
export { telegramService } from './telegramService';
export { notificationService } from './notificationService';
export { balanceService } from './balanceService';
export { verificationService } from './verificationService';
export { checkService } from './checkService';
export { referralService } from './referralService';
export { analyticsService } from './analyticsService';
<<<<<<< HEAD
=======
export { adminService } from './adminService';
export { withdrawalService } from './withdrawalService';
export { broadcastService } from './broadcastService';
>>>>>>> b118273 (2-commit)

// Service initialization
export async function initializeServices() {
  console.log('🔧 Initializing services...');
  
<<<<<<< HEAD
  // Initialize services that need setup
  await notificationService.initialize();
  await taskService.initialize();
  await subscriptionService.initialize();
  
  console.log('✅ All services initialized');
=======
  try {
    // Initialize services that need setup
    await notificationService.initialize();
    
    // Initialize other services if they have init methods
    if (taskService.initialize) {
      await taskService.initialize();
    }
    
    if (subscriptionService.initialize) {
      await subscriptionService.initialize();
    }
    
    if (broadcastService.initialize) {
      await broadcastService.initialize();
    }
    
    console.log('✅ All services initialized successfully');
  } catch (error) {
    console.error('❌ Failed to initialize services:', error);
    throw error;
  }
>>>>>>> b118273 (2-commit)
}

// Service cleanup
export async function shutdownServices() {
  console.log('🔧 Shutting down services...');
  
<<<<<<< HEAD
  await notificationService.shutdown();
  await taskService.shutdown();
  
  console.log('✅ All services shut down');
=======
  try {
    await notificationService.shutdown();
    
    // Shutdown other services if they have shutdown methods
    if (taskService.shutdown) {
      await taskService.shutdown();
    }
    
    if (broadcastService.shutdown) {
      await broadcastService.shutdown();
    }
    
    console.log('✅ All services shut down successfully');
  } catch (error) {
    console.error('❌ Error during service shutdown:', error);
  }
}

// Health check for all services
export async function checkServicesHealth() {
  const health = {
    timestamp: new Date(),
    services: {
      telegram: 'unknown',
      database: 'unknown',
      notification: 'unknown',
      balance: 'unknown',
      verification: 'unknown',
      admin: 'unknown',
      withdrawal: 'unknown',
      broadcast: 'unknown'
    }
  };

  try {
    // Test Telegram service
    await telegramService.getMe();
    health.services.telegram = 'healthy';
  } catch (error) {
    health.services.telegram = 'unhealthy';
  }

  try {
    // Test database connection
    await prisma.$queryRaw`SELECT 1`;
    health.services.database = 'healthy';
  } catch (error) {
    health.services.database = 'unhealthy';
  }
  
  try {
    // Test admin service 
    await adminService.getDashboardStats();
    health.services.admin = 'healthy';
  } catch (error) {
    health.services.admin = 'unhealthy';
  }

  // Other services are considered healthy if they load without errors
  health.services.notification = 'healthy';
  health.services.balance = 'healthy';
  health.services.verification = 'healthy';
  health.services.withdrawal = 'healthy';
  health.services.broadcast = 'healthy';
  
  return health;
>>>>>>> b118273 (2-commit)
}