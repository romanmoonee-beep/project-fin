// Export all conversations
export { createTaskConversation } from './tasks';
export { 
  createCheckConversation, 
  activateCheckConversation 
} from './checks';
export { 
  moderateTaskConversation,
  adminFindUserConversation,
  adminAddBalanceConversation,
  adminBroadcastConversation
} from './moderation';
export { 
  searchUserConversation,
  changeUserBalanceConversation,
  banUserConversation,
  createBroadcastConversation,
  processWithdrawalConversation
} from './admin';
// Import for easier registration
import { createTaskConversation } from './tasks';
import { 
  createCheckConversation, 
  activateCheckConversation 
} from './checks';
import { 
  moderateTaskConversation,
  adminFindUserConversation,
  adminAddBalanceConversation,
  adminBroadcastConversation
} from './moderation';

// Combined conversations for registration
export const taskConversations = createTaskConversation;
export const checkConversations = [
  createCheckConversation,
  activateCheckConversation
];
export const moderationConversations = [
  moderateTaskConversation,
  adminFindUserConversation,
  adminAddBalanceConversation,
  adminBroadcastConversation
];

// All conversations array for easy registration
export const allConversations = [
  createTaskConversation,
  createCheckConversation,
  activateCheckConversation,
  moderateTaskConversation,
  adminFindUserConversation,
  adminAddBalanceConversation,
  adminBroadcastConversation
];