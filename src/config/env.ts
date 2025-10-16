import { z } from 'zod';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Environment variables schema
const envSchema = z.object({
  // Server
  PORT: z.string().default('3001').transform(Number),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),

  // Database
  DATABASE_URL: z.string().url().startsWith('postgresql://'),

  // Resend
  RESEND_API_KEY: z.string().startsWith('re_'),

  // Security
  API_KEY: z.string().min(20),
  ALLOWED_ORIGINS: z.string().transform((val) => val.split(',')),

  // Logging
  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'debug']).default('info'),

  // Newsletter
  MAX_BATCH_SIZE: z.string().default('100').transform(Number),
  MAX_RETRIES: z.string().default('3').transform(Number),

  // Worker
  WORKER_POLL_INTERVAL: z.string().default('10000').transform(Number), // 10 seconds
});

// Validate and export environment variables
let env: z.infer<typeof envSchema>;

try {
  env = envSchema.parse(process.env);
} catch (error) {
  if (error instanceof z.ZodError) {
    console.error('❌ Environment validation failed:');
    error.errors.forEach((err) => {
      console.error(`  - ${err.path.join('.')}: ${err.message}`);
    });
    process.exit(1);
  }
  throw error;
}

export default env;
