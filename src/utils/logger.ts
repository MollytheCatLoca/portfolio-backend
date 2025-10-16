import winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';
import env from '../config/env';

// Define log levels
const levels = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3,
};

// Define colors for console output
const colors = {
  error: 'red',
  warn: 'yellow',
  info: 'green',
  debug: 'blue',
};

winston.addColors(colors);

// Custom format for console
const consoleFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.printf(({ timestamp, level, message, ...meta }) => {
    let metaString = '';
    if (Object.keys(meta).length > 0) {
      metaString = `\n${JSON.stringify(meta, null, 2)}`;
    }
    return `${timestamp} [${level}]: ${message}${metaString}`;
  })
);

// Custom format for files
const fileFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.json()
);

// Transport: Console
const consoleTransport = new winston.transports.Console({
  format: consoleFormat,
});

// Transport: Daily rotate file for all logs
const allLogsTransport = new DailyRotateFile({
  filename: 'logs/app-%DATE%.log',
  datePattern: 'YYYY-MM-DD',
  maxSize: '20m',
  maxFiles: '14d',
  format: fileFormat,
});

// Transport: Daily rotate file for errors only
const errorLogsTransport = new DailyRotateFile({
  filename: 'logs/error-%DATE%.log',
  datePattern: 'YYYY-MM-DD',
  level: 'error',
  maxSize: '20m',
  maxFiles: '30d',
  format: fileFormat,
});

// Transport: Newsletter specific logs
const newsletterLogsTransport = new DailyRotateFile({
  filename: 'logs/newsletter-%DATE%.log',
  datePattern: 'YYYY-MM-DD',
  maxSize: '20m',
  maxFiles: '30d',
  format: fileFormat,
});

// Create logger instance
const logger = winston.createLogger({
  level: env.LOG_LEVEL,
  levels,
  transports: [
    consoleTransport,
    allLogsTransport,
    errorLogsTransport,
  ],
});

// Add newsletter-specific logger
export const newsletterLogger = winston.createLogger({
  level: env.LOG_LEVEL,
  levels,
  transports: [
    consoleTransport,
    newsletterLogsTransport,
  ],
});

// Log unhandled errors
process.on('unhandledRejection', (reason: any, promise: Promise<any>) => {
  logger.error('Unhandled Rejection at:', { promise, reason });
});

process.on('uncaughtException', (error: Error) => {
  logger.error('Uncaught Exception:', error);
  process.exit(1);
});

export default logger;
