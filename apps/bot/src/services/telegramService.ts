import { Api } from 'grammy';
import { config } from '../config';

export class TelegramService {
  private api: Api;

  constructor() {
    this.api = new Api(config.BOT_TOKEN);
  }

  // Check if user is a member of chat/channel
  async checkChatMember(chatId: string | number, userId: number): Promise<boolean> {
    try {
      const member = await this.api.getChatMember(chatId, userId);
      return ['creator', 'administrator', 'member'].includes(member.status);
    } catch (error) {
      console.error('Check chat member error:', error);
      return false;
    }
  }

  // Get chat information
  async getChat(chatId: string | number) {
    try {
      return await this.api.getChat(chatId);
    } catch (error) {
      console.error('Get chat error:', error);
      throw new Error(`Не удалось получить информацию о чате: ${chatId}`);
    }
  }

  // Get chat administrators
  async getChatAdministrators(chatId: string | number) {
    try {
      return await this.api.getChatAdministrators(chatId);
    } catch (error) {
      console.error('Get chat administrators error:', error);
      return [];
    }
  }

  // Get chat member count
  async getChatMemberCount(chatId: string | number): Promise<number> {
    try {
      return await this.api.getChatMemberCount(chatId);
    } catch (error) {
      console.error('Get chat member count error:', error);
      return 0;
    }
  }

  // Get chat member info
  async getChatMember(chatId: string | number, userId: number) {
    try {
      return await this.api.getChatMember(chatId, userId);
    } catch (error) {
      console.error('Get chat member error:', error);
      throw new Error('Пользователь не найден в чате');
    }
  }

  // Restrict chat member
  async restrictChatMember(
    chatId: string | number, 
    userId: number, 
    permissions: any,
    untilDate?: number
  ) {
    try {
      return await this.api.restrictChatMember(chatId, userId, permissions, {
        until_date: untilDate
      });
    } catch (error) {
      console.error('Restrict chat member error:', error);
      throw new Error('Не удалось ограничить пользователя');
    }
  }

  // Ban chat member
  async banChatMember(chatId: string | number, userId: number, untilDate?: number) {
    try {
      return await this.api.banChatMember(chatId, userId, {
        until_date: untilDate
      });
    } catch (error) {
      console.error('Ban chat member error:', error);
      throw new Error('Не удалось заблокировать пользователя');
    }
  }

  // Unban chat member
  async unbanChatMember(chatId: string | number, userId: number) {
    try {
      return await this.api.unbanChatMember(chatId, userId);
    } catch (error) {
      console.error('Unban chat member error:', error);
      throw new Error('Не удалось разблокировать пользователя');
    }
  }

  // Delete message
  async deleteMessage(chatId: string | number, messageId: number) {
    try {
      return await this.api.deleteMessage(chatId, messageId);
    } catch (error) {
      console.error('Delete message error:', error);
      return false;
    }
  }

  // Send message
  async sendMessage(chatId: string | number, text: string, options?: any) {
    try {
      return await this.api.sendMessage(chatId, text, options);
    } catch (error) {
      console.error('Send message error:', error);
      throw new Error('Не удалось отправить сообщение');
    }
  }

  // Forward message
  async forwardMessage(
    chatId: string | number,
    fromChatId: string | number,
    messageId: number
  ) {
    try {
      return await this.api.forwardMessage(chatId, fromChatId, messageId);
    } catch (error) {
      console.error('Forward message error:', error);
      throw new Error('Не удалось переслать сообщение');
    }
  }

  // Get file
  async getFile(fileId: string) {
    try {
      return await this.api.getFile(fileId);
    } catch (error) {
      console.error('Get file error:', error);
      throw new Error('Не удалось получить файл');
    }
  }

  // Set chat permissions
  async setChatPermissions(chatId: string | number, permissions: any) {
    try {
      return await this.api.setChatPermissions(chatId, permissions);
    } catch (error) {
      console.error('Set chat permissions error:', error);
      throw new Error('Не удалось установить права чата');
    }
  }

  // Validate chat ID format
  isValidChatId(chatId: string): boolean {
    // Check if it's a valid chat ID or username
    return /^-?\d+$/.test(chatId) || /^@[a-zA-Z0-9_]{5,32}$/.test(chatId);
  }

  // Extract username from URL
  extractUsernameFromUrl(url: string): string | null {
    const match = url.match(/t\.me\/([a-zA-Z0-9_]+)/);
    return match ? match[1] : null;
  }

  // Check if URL is valid Telegram URL
  isValidTelegramUrl(url: string): boolean {
    return /^https:\/\/t\.me\/[a-zA-Z0-9_]+/.test(url);
  }

  // Check if invite link is valid
  isValidInviteLink(url: string): boolean {
    return /^https:\/\/t\.me\/\+[a-zA-Z0-9_-]+/.test(url);
  }

  // Get bot info
  async getMe() {
    try {
      return await this.api.getMe();
    } catch (error) {
      console.error('Get me error:', error);
      throw new Error('Не удалось получить информацию о боте');
    }
  }

  // Set webhook
  async setWebhook(url: string, options?: any) {
    try {
      return await this.api.setWebhook(url, options);
    } catch (error) {
      console.error('Set webhook error:', error);
      throw new Error('Не удалось установить webhook');
    }
  }

  // Delete webhook
  async deleteWebhook() {
    try {
      return await this.api.deleteWebhook();
    } catch (error) {
      console.error('Delete webhook error:', error);
      throw new Error('Не удалось удалить webhook');
    }
  }

  // Get webhook info
  async getWebhookInfo() {
    try {
      return await this.api.getWebhookInfo();
    } catch (error) {
      console.error('Get webhook info error:', error);
      throw new Error('Не удалось получить информацию о webhook');
    }
  }

  // Verification helpers
  async verifyChannelSubscription(channelUsername: string, userId: number): Promise<boolean> {
    try {
      const cleanUsername = channelUsername.replace('@', '');
      return await this.checkChatMember(`@${cleanUsername}`, userId);
    } catch (error) {
      console.error('Verify channel subscription error:', error);
      return false;
    }
  }

  async verifyGroupMembership(groupId: string | number, userId: number): Promise<boolean> {
    try {
      return await this.checkChatMember(groupId, userId);
    } catch (error) {
      console.error('Verify group membership error:', error);
      return false;
    }
  }

  // Bulk operations
  async checkMultipleMemberships(
    chatIds: (string | number)[],
    userId: number
  ): Promise<Record<string, boolean>> {
    const results: Record<string, boolean> = {};
    
    await Promise.allSettled(
      chatIds.map(async (chatId) => {
        const isMember = await this.checkChatMember(chatId, userId);
        results[chatId.toString()] = isMember;
      })
    );
    
    return results;
  }

  // Rate limiting helper
  private async withRetry<T>(
    operation: () => Promise<T>,
    maxRetries = 3,
    delay = 1000
  ): Promise<T> {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error: any) {
        if (attempt === maxRetries) throw error;
        
        // Check if it's a rate limit error
        if (error.error_code === 429) {
          const retryAfter = error.parameters?.retry_after || delay / 1000;
          await new Promise(resolve => setTimeout(resolve, retryAfter * 1000));
        } else {
          await new Promise(resolve => setTimeout(resolve, delay * attempt));
        }
      }
    }
    throw new Error('Max retries exceeded');
  }
}

export const telegramService = new TelegramService();