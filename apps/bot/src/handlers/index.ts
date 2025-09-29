// Export all handlers
export { startHandler } from './start';
export { earnHandler } from './earn';
export { promoteHandler } from './promote';
export { subscriptionHandler } from './subscription';
export { checkHandler } from './checks';
export { adminHandler } from './admin';
export { messageHandler } from './messages';

// Import all handlers for easier registration
import { startHandler } from './start';
import { earnHandler } from './earn';
import { promoteHandler } from './promote';
import { subscriptionHandler } from './subscription';
import { checkHandler } from './checks';
import { adminHandler } from './admin';
import { messageHandler } from './messages';

// All handlers array for easy registration
export const allHandlers = [
  startHandler,
  earnHandler,
  promoteHandler,
  subscriptionHandler,
  checkHandler,
  adminHandler,
  messageHandler
];