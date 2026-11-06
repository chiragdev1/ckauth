import http from "node:http"
import "dotenv/config"
import { createExpressApplication } from "./app/index.js";
import { logger } from "./utils/logger.js";
import { pruneAuditEvents } from "./app/auth/utils/audit.js";

async function main() {
  try {
    const server = http.createServer(createExpressApplication())
    // caddy keeps idle upstream connections open far longer than node's 5 s default; if node closes one first,
    // caddy can reuse a dead socket and a POST (sign-in, refresh) fails with a 502, so outlive the proxy instead
    server.keepAliveTimeout = 125_000
    // must be longer than keepAliveTimeout, or node can drop a reused connection mid-request
    server.headersTimeout = 126_000
    const PORT: number = process.env.PORT? +process.env.PORT : 8080

    server.listen(PORT, () => {
      logger.info({port: PORT, env: process.env.NODE_ENV}, 'server started')
    })

    // no cron needed: the api is always running. unref, so the timer alone never keeps the process alive
    const prune = () => pruneAuditEvents()
      .then((deleted) => logger.info({deleted}, 'old audit events pruned'))
      .catch((error) => logger.error({err: error}, 'audit event pruning failed'))
    prune()
    setInterval(prune, 24 * 60 * 60 * 1000).unref()
  } catch (error) {
    logger.fatal({err: error}, 'could not start the http server')
    process.exit(1)
  }
}

main()