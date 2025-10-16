/**
 * PM2 Ecosystem Configuration
 *
 * Deployment: pm2 start ecosystem.config.js
 * Stop: pm2 stop portfolio-backend
 * Restart: pm2 restart portfolio-backend
 * Logs: pm2 logs portfolio-backend
 * Monitoring: pm2 monit
 */

module.exports = {
  apps: [
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
      out_file: './logs/pm2-out.log',
      error_file: './logs/pm2-error.log',
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
  ],
};
