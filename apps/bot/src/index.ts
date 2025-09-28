#!/usr/bin/env node

import { Bot } from 'grammy';
import { conversations } from '@grammyjs/conversations';
import { run } from '@grammyjs/runner';
import { apiThrottler } from '@grammyjs/transformer-throttler';
import { parseMode } from '@grammyjs/parse-mode';
import { autoRetry } from '@grammyjs/auto-retry';

import { config } from './config';
import { initializeDatabase } from '@pr-gram/database';

// Middleware
import { sessionMiddleware } from './middleware/session';
import { userMiddleware } from './middleware/user';
import { commandRateLimit, messageRateLimit, antiSpamMiddleware } from './middleware/rateLimit';
import { errorMiddleware } from './middleware/error';
import { loggingMiddleware } from './middleware/logging';

// Handlers
import { startHandler } from './handlers/start';
import { earnHandler } from './handlers/earn';
import { promoteHandler } from './handlers/promote';
import { subscriptionHandler } from './handlers/subscription';
import { checkHandler } from './handlers/checks';
import { adminHandler } from './handlers/admin';
import { messageHandler } from './handlers/messages';

// Conversations
import { taskConversations } from './conversations/tasks';
import { checkConversations } from './conversations/checks';
import { moderationConversations } from './conversations/moderation';

// Menus
import { mainMenu, earnMenu, promoteMenu, subscriptionMenu, profileMenu, adminMenu } from './menus';

// Services
import { subscriptionService } from './services/subscriptionService';
import { taskService } from './services/taskService';
import { notificationService } from './services/notificationService';

import type { BotContext } from './types/context';

class PRGramBot {
  private bot: Bot<BotContext>;

  constructor() {
    this.bot = new Bot<BotContext>(config.BOT_TOKEN);
    this.setupTransformers();
    this.setupMiddleware();
    this.setupConversations();
    this.setupMenus();
    this.setupHandlers();
    this.setupErrorHandling();
  }

  private setupTransformers() {
    // API throttling
    this.bot.api.config.use(apiThrottler());
    
    // Auto-retry failed requests
    this.bot.api.config.use(autoRetry());
    
    // Parse mode transformer
    this.bot.api.config.use(parseMode('HTML'));
  }

  private setupMiddleware() {
    // Core middleware
    this.bot.use(loggingMiddleware);
    this.bot.use(sessionMiddleware);
    this.bot.use(userMiddleware);
    
    // Rate limiting
    this.bot.use(commandRateLimit);
    this.bot.use(messageRateLimit);
    this.bot.use(antiSpamMiddleware);
    
    // Enable conversations
    this.bot.use(conversations());
    
    // Error handling
    this.bot.use(errorMiddleware);
  }

  private setupConversations() {
    // Install all conversations
    this.bot.use(taskConversations);
    this.bot.use(checkConversations);
    this.bot.use(moderationConversations);
  }

  private setupMenus() {
    // Install all menus
    this.bot.use(mainMenu);
    this.bot.use(earnMenu);
    this.bot.use(promoteMenu);
    this.bot.use(subscriptionMenu);
    this.bot.use(profileMenu);
    this.bot.use(adminMenu);
  }

  private setupHandlers() {
    // Command handlers
    this.bot.use(startHandler);
    this.bot.use(earnHandler);
    this.bot.use(promoteHandler);
    this.bot.use(subscriptionHandler);
    this.bot.use(checkHandler);
    this.bot.use(adminHandler);
    
    // Message handlers (including subscription checking)
    this.bot.use(messageHandler);
  }

  private setupErrorHandling() {
    this.bot.catch((err) => {
      console.error('Bot error:', err);
    });

    // Graceful shutdown
    process.once('SIGINT', () => this.shutdown('SIGINT'));
    process.once('SIGTERM', () => this.shutdown('SIGTERM'));
  }

  async start() {
    try {
      // Initialize database
      await initializeDatabase();
      console.log('✅ Database connected');

      // Initialize services
      await this.initializeServices();
      console.log('✅ Services initialized');

      // Start bot
      if (config.WEBHOOK_ENABLED && config.BOT_WEBHOOK_URL) {
        await this.startWebhook();
      } else {
        await this.startPolling();
      }

    } catch (error) {
      console.error('❌ Failed to start bot:', error);
      process.exit(1);
    }
  }

  private async initializeServices() {
    // Start background jobs
    await notificationService.start();
    
    // Initialize other services
    await taskService.initialize();
    await subscriptionService.initialize();
    
    console.log('✅ All services started');
  }

  private async startWebhook() {
    const webhookUrl = `${config.BOT_WEBHOOK_URL}${config.WEBHOOK_PATH}`;
    
    await this.bot.api.setWebhook(webhookUrl, {
      secret_token: config.BOT_WEBHOOK_SECRET,
      allowed_updates: [
        'message',
        'callback_query',
        'inline_query',
        'chat_member',
        'my_chat_member'
      ]
    });

    console.log(`🚀 Bot started with webhook: ${webhookUrl}`);
  }

  private async startPolling() {
    // Delete webhook if exists
    await this.bot.api.deleteWebhook();
    
    // Start polling
    const runner = run(this.bot, {
      runner: {
        fetch: {
          allowed_updates: [
            'message',
            'callback_query',
            'inline_query',
            'chat_member',
            'my_chat_member'
          ]
        }
      }
    });

    console.log('🚀 Bot started with polling');

    // Handle runner errors
    runner.task().catch((error) => {
      console.error('Runner error:', error);
    });
  }

  private async shutdown(signal: string) {
    console.log(`\n📴 Received ${signal}, shutting down gracefully...`);
    
    try {
      // Stop services
      await notificationService.stop();
      
      // Stop bot
      await this.bot.stop();
      
      console.log('✅ Bot stopped gracefully');
      process.exit(0);
    } catch (error) {
      console.error('❌ Error during shutdown:', error);
      process.exit(1);
    }
  }
}

// Start the bot
async function main() {
  console.log('🤖 Starting PR GRAM Bot...');
  
  const bot = new PRGramBot();
  await bot.start();
}

// Handle unhandled errors
process.on('unhandledRejection', (error) => {
  console.error('Unhandled promise rejection:', error);
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught exception:', error);
  process.exit(1);
});

// Start the application
if (require.main === module) {
  main().catch((error) => {
    console.error('Failed to start application:', error);
    process.exit(1);
  });
}