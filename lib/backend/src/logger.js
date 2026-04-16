/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import pino from 'pino'
import { config } from './config.js'

/**
 * Shared pino logger instance.
 * Uses pino-pretty transport in development for human-readable output.
 */
const logger = pino({
  level: config.logLevel,
  ...(process.env.NODE_ENV !== 'production' && {
    transport: {
      target: 'pino-pretty',
      options: { colorize: true },
    },
  }),
})

export default logger
