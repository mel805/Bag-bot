module.exports = {
  apps: [{
    name: 'bag-discord-bot',
    script: 'src/bot.js',
    cwd: '/workspace',
    instances: 1,
    exec_mode: 'fork',
    watch: false,
    max_memory_restart: '1G',
    env: {
      NODE_ENV: 'production'
    },
    log_file: '/workspace/logs/pm2.log',
    out_file: '/workspace/logs/pm2-out.log',
    error_file: '/workspace/logs/pm2-error.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    restart_delay: 4000,
    max_restarts: 10,
    min_uptime: '10s',
    kill_timeout: 5000,
    listen_timeout: 3000,
    autorestart: true
  }]
};