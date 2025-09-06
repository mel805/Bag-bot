module.exports = {
  apps: [
    {
      name: "bagbot",
      script: "./src/bot.js",
      
      // 🔄 Restart configuration
      watch: false,
      autorestart: true,
      restart_delay: 5000,
      max_restarts: 5,
      min_uptime: "10s",
      
      // 📊 Performance & Resources
      instances: 1,
      exec_mode: "fork",
      max_memory_restart: "1G",
      
      // 📁 Logs configuration
      log_file: "./logs/combined.log",
      out_file: "./logs/out.log",
      error_file: "./logs/error.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss Z",
      merge_logs: true,
      
      // 🌍 Environment variables
      env: {
        NODE_ENV: "production",
        PM2_SERVE_PATH: ".",
        PM2_SERVE_PORT: 8080
      },
      
      env_development: {
        NODE_ENV: "development",
        LOG_LEVEL: "debug"
      },
      
      // 🔧 Advanced options for Freebox
      node_args: "--max-old-space-size=1024",
      
      // 🚨 Error handling
      kill_timeout: 5000,
      listen_timeout: 8000,
      
      // 📈 Monitoring
      pmx: true,
      
      // 🔄 Graceful shutdown
      kill_retry_time: 100,
      
      // 📱 Health check (optionnel)
      health_check_grace_period: 3000
    }
  ],
  
  // 📊 PM2+ monitoring configuration (optionnel)
  deploy: {
    production: {
      user: "botuser",
      host: "localhost",
      ref: "origin/main",
      repo: "https://github.com/your-repo/bag-discord-bot.git",
      path: "/home/botuser/bag-discord-bot",
      "pre-deploy-local": "",
      "post-deploy": "npm install --production && npm run register && pm2 reload ecosystem.config.js --env production",
      "pre-setup": ""
    }
  }
};
