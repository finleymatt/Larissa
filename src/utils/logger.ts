import winston from 'winston';

const { combine, timestamp, printf, colorize } = winston.format;

const logFormat = printf(({ level, message, timestamp: ts, ...meta }) => {
  const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
  return `${ts} [${level}] ${message}${metaStr}`;
});

export function createLogger(level: string = 'info'): winston.Logger {
  return winston.createLogger({
    level,
    format: combine(
      timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
      logFormat,
    ),
    transports: [
      new winston.transports.Console({
        format: combine(colorize(), timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }), logFormat),
      }),
      new winston.transports.File({ filename: 'trading-bot.log' }),
      new winston.transports.File({ filename: 'trading-bot-error.log', level: 'error' }),
    ],
  });
}

export const logger = createLogger();
