import { I18n } from '@grammyjs/i18n';
import { LanguageCode } from '@pr-gram/shared';
import path from 'path';

// Create i18n instance for bot
export const createBotI18n = () => {
  const i18n = new I18n({
    defaultLocale: LanguageCode.RU,
    directory: path.resolve(__dirname, '../locales'),
    useSession: true,
    templateData: {
      pluralize: (count: number, forms: [string, string, string]) => {
        const n = Math.abs(count) % 100;
        const n1 = n % 10;
        
        if (n > 10 && n < 20) return forms[2];
        if (n1 > 1 && n1 < 5) return forms[1];
        if (n1 === 1) return forms[0];
        return forms[2];
      },
      formatNumber: (num: number) => {
        return new Intl.NumberFormat('ru-RU').format(num);
      },
      formatCurrency: (amount: number, currency = 'GRAM') => {
        return `${new Intl.NumberFormat('ru-RU').format(amount)} ${currency}`;
      },
    },
  });

  return i18n;
};

// Translation type helpers
export interface TranslationContext {
  t: (key: string, templateData?: any) => string;
  locale: string;
}

// Available locales
export const AVAILABLE_LOCALES = [
  { code: LanguageCode.RU, name: 'Русский', flag: '🇷🇺' },
  { code: LanguageCode.EN, name: 'English', flag: '🇺🇸' },
  { code: LanguageCode.ES, name: 'Español', flag: '🇪🇸' },
  { code: LanguageCode.DE, name: 'Deutsch', flag: '🇩🇪' },
  { code: LanguageCode.FR, name: 'Français', flag: '🇫🇷' },
];

// Locale utilities
export const getLocaleInfo = (code: LanguageCode) => {
  return AVAILABLE_LOCALES.find(locale => locale.code === code);
};

export const isValidLocale = (code: string): code is LanguageCode => {
  return Object.values(LanguageCode).includes(code as LanguageCode);
};

export const getDefaultLocale = (): LanguageCode => {
  return LanguageCode.RU;
};

// Translation key constants for type safety
export const TRANSLATION_KEYS = {
  // Common
  COMMON_BUTTONS_BACK: 'common.buttons.back',
  COMMON_BUTTONS_NEXT: 'common.buttons.next',
  COMMON_BUTTONS_CANCEL: 'common.buttons.cancel',
  COMMON_BUTTONS_HOME: 'common.buttons.home',
  
  // Start
  START_WELCOME: 'start.welcome',
  START_BUTTON: 'start.button',
  START_RETURNING_USER: 'start.returning_user',
  
  // Menu
  MENU_MAIN_TITLE: 'menu.main.title',
  MENU_MAIN_EARN: 'menu.main.earn',
  MENU_MAIN_PROMOTE: 'menu.main.promote',
  MENU_MAIN_SUBSCRIPTION_CHECK: 'menu.main.subscription_check',
  MENU_MAIN_PROFILE: 'menu.main.profile',
  MENU_MAIN_SETTINGS: 'menu.main.settings',
  
  // Tasks
  TASKS_LIST_NO_TASKS: 'tasks.list.no_tasks',
  TASKS_EXECUTION_SUCCESS: 'tasks.verification.success',
  TASKS_CREATION_SUCCESS: 'tasks.creation.success',
  
  // Errors
  ERRORS_GENERAL: 'errors.general',
  ERRORS_INSUFFICIENT_BALANCE: 'errors.insufficient_balance',
  ERRORS_TASK_NOT_FOUND: 'errors.task_not_found',
  
  // Success
  SUCCESS_TASK_CREATED: 'success.task_created',
  SUCCESS_TASK_COMPLETED: 'success.task_completed',
} as const;

// Helper function to load translations dynamically
export const loadTranslations = async (locale: LanguageCode) => {
  try {
    const translations = await import(`../locales/${locale}.json`);
    return translations.default;
  } catch (error) {
    console.warn(`Failed to load translations for locale ${locale}, falling back to Russian`);
    const fallback = await import('../locales/ru.json');
    return fallback.default;
  }
};

// Translation validation utility
export const validateTranslations = (translations: any): boolean => {
  const requiredKeys = [
    'common.buttons.back',
    'start.welcome',
    'menu.main.title',
    'tasks.list.no_tasks',
    'errors.general',
  ];
  
  for (const key of requiredKeys) {
    if (!getNestedValue(translations, key)) {
      console.error(`Missing required translation key: ${key}`);
      return false;
    }
  }
  
  return true;
};

// Helper function to get nested object value by dot notation
const getNestedValue = (obj: any, path: string): any => {
  return path.split('.').reduce((current, key) => current?.[key], obj);
};

// Export the bot i18n instance
export const botI18n = createBotI18n();

// Export types
export type { TranslationContext };