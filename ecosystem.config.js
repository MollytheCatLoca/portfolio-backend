/**
 * PM2 Ecosystem Configuration
 *
 * Deployment: pm2 start ecosystem.config.js
 * Stop all: pm2 stop ecosystem.config.js
 * Restart all: pm2 restart ecosystem.config.js
 * Logs backend: pm2 logs portfolio-backend
 * Logs worker: pm2 logs newsletter-worker
 * Monitoring: pm2 monit
 */

module.exports = {
  apps: [
    // Backend API Server
    {
      name: 'portfolio-backend',
      script: './dist/index.js',
      cwd: '/root/portfolio-backend',

      // Instances
      instances: 1,
      exec_mode: 'fork',

      // Environment variables
      env: {
        NODE_ENV: 'production',
        PORT: 3001,
      },

      // Logging
      out_file: './logs/backend-out.log',
      error_file: './logs/backend-error.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,

      // Auto restart configuration
      autorestart: true,
      max_restarts: 10,
      min_uptime: '10s',

      // Memory management
      max_memory_restart: '500M',

      // Watch (disabled in production)
      watch: false,
      ignore_watch: ['node_modules', 'logs', '.git'],

      // Process management
      kill_timeout: 5000,
      listen_timeout: 3000,

      // Advanced features
      exp_backoff_restart_delay: 100,
    },

    // Newsletter Queue Worker
    {
      name: 'newsletter-worker',
      script: './dist/worker.js',
      cwd: '/root/portfolio-backend',

      // Instances
      instances: 1,
      exec_mode: 'fork',

      // Environment variables
      env: {
        NODE_ENV: 'production',
        WORKER_POLL_INTERVAL: '10000', // 10 seconds
      },

      // Logging
      out_file: './logs/worker-out.log',
      error_file: './logs/worker-error.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,

      // Auto restart configuration
      autorestart: true,
      max_restarts: 10,
      min_uptime: '10s',

      // Memory management
      max_memory_restart: '300M',

      // Watch (disabled in production)
      watch: false,
      ignore_watch: ['node_modules', 'logs', '.git'],

      // Process management
      kill_timeout: 65000, // 65s to allow current job to finish (max 60s)
      listen_timeout: 3000,

      // Advanced features
      exp_backoff_restart_delay: 100,
    },
  ],
};
