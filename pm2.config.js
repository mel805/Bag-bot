module.exports = {
  apps: [
    {
      name: 'bag-discord-bot',
      script: 'src/bot.js',
      cwd: '/workspace',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'production',
        PM2_HOME: '/home/ubuntu/.pm2'
      },
      error_file: '/home/ubuntu/.pm2/logs/bag-discord-bot-error.log',
      out_file: '/home/ubuntu/.pm2/logs/bag-discord-bot-out.log',
      log_file: '/home/ubuntu/.pm2/logs/bag-discord-bot.log',
      time: true
    }
  ]
};