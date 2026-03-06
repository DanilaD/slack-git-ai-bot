// PM2 Ecosystem Config
module.exports = {
  apps: [
    {
      name: "slack-git-ai-bot",
      script: "src/index.js",
      cwd: "/opt/slack-git-ai-bot",
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: "300M",
      env: { NODE_ENV: "production" },
      out_file: "/var/log/slack-bot-out.log",
      error_file: "/var/log/slack-bot-error.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss",
    },
  ],
};
