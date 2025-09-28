import { PrismaClient } from '@prisma/client';

// Create Prisma client instance with logging and error handling
export const prisma = new PrismaClient({
  log: [
    {
      emit: 'event',
      level: 'query',
    },
    {
      emit: 'event',
      level: 'error',
    },
    {
      emit: 'event',
      level: 'info',
    },
    {
      emit: 'event',
      level: 'warn',
    },
  ],
  errorFormat: 'colorless',
});

// Log events
prisma.$on('query', (e) => {
  console.log('Query: ' + e.query);
  console.log('Params: ' + e.params);
  console.log('Duration: ' + e.duration + 'ms');
});

prisma.$on('error', (e) => {
  console.error('Prisma Error:', e);
});

prisma.$on('info', (e) => {
  console.info('Prisma Info:', e.message);
});

prisma.$on('warn', (e) => {
  console.warn('Prisma Warning:', e.message);
});

// Graceful shutdown
const gracefulShutdown = async () => {
  console.log('Disconnecting from database...');
  await prisma.$disconnect();
  process.exit(0);
};

process.on('SIGINT', gracefulShutdown);
process.on('SIGTERM', gracefulShutdown);

// Health check function
export const checkDatabaseConnection = async (): Promise<boolean> => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch (error) {
    console.error('Database connection failed:', error);
    return false;
  }
};

// Transaction wrapper with retry logic
export const withTransaction = async <T>(
  callback: (tx: PrismaClient) => Promise<T>,
  maxRetries = 3
): Promise<T> => {
  let attempt = 0;
  
  while (attempt < maxRetries) {
    try {
      return await prisma.$transaction(callback, {
        maxWait: 5000, // 5 seconds
        timeout: 10000, // 10 seconds
      });
    } catch (error) {
      attempt++;
      if (attempt >= maxRetries) {
        throw error;
      }
      
      // Wait before retry (exponential backoff)
      await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000));
    }
  }
  
  throw new Error('Transaction failed after maximum retries');
};

// Database initialization
export const initializeDatabase = async (): Promise<void> => {
  try {
    console.log('Connecting to database...');
    await prisma.$connect();
    
    const isConnected = await checkDatabaseConnection();
    if (!isConnected) {
      throw new Error('Failed to establish database connection');
    }
    
    console.log('Database connected successfully');
  } catch (error) {
    console.error('Database initialization failed:', error);
    throw error;
  }
};