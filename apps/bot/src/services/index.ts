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

// Service initialization
export async function initializeServices() {
  console.log('🔧 Initializing services...');
  
  // Initialize services that need setup
  await notificationService.initialize();
  await taskService.initialize();
  await subscriptionService.initialize();
  
  console.log('✅ All services initialized');
}

// Service cleanup
export async function shutdownServices() {
  console.log('🔧 Shutting down services...');
  
  await notificationService.shutdown();
  await taskService.shutdown();
  
  console.log('✅ All services shut down');
}