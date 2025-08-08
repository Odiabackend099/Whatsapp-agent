// utils/logger.js
const winston = require('winston');
const expressWinston = require('express-winston');

const logger = winston.createLogger({
  level: 'info',
  transports: [
    new winston.transports.Console({ format: winston.format.json() })
  ]
});

const requestLogger = expressWinston.logger({
  transports: [ new winston.transports.Console() ],
  format: winston.format.json(),
  meta: true,
  msg: "HTTP {{req.method}} {{req.url}}",
  expressFormat: false,
  colorize: false,
  ignoreRoute: () => false
});

module.exports = { logger, requestLogger };
