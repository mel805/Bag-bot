module.exports = {
  apps: [
    {
      name: "bagbot",
      script: "./src/bot.js",
      watch: false,
      autorestart: true,
      env: {
        NODE_ENV: "production"
      }
    }
  ]
};
