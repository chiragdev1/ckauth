import "dotenv/config"
import { sql } from "drizzle-orm"
import { migrate } from "drizzle-orm/node-postgres/migrator"
import { db } from "./index.js"

// runs in production as a one-off container before the api starts, so the image doesn't need drizzle-kit.
// it connects as the owner (ckauth); the api itself connects as ckauth_api (drizzle/20261107081824_api_database_role)
async function main() {
  try {
    await migrate(db, { migrationsFolder: "./drizzle" })
    console.log("Migrations applied")
    // every time, not only when its migration first ran: puts the role back after a restore onto a new server
    await db.execute(sql`select ensure_api_role()`)
    await setApiRolePassword()
  } catch (error) {
    console.error(`Migration failed, ${error}`)
    process.exitCode = 1
  } finally {
    await db.$client.end()
  }
}

// the migration makes ckauth_api without a login; this gives it one, with the password from /opt/ckauth/.env, on every
// deploy. so the password is never in the repo, and rotating it is: change .env, deploy (or run migrate) and restart the api
async function setApiRolePassword() {
  const password = process.env.API_DB_PASSWORD
  if(!password) {
    console.log("API_DB_PASSWORD not set: ckauth_api keeps no login (fine locally, where the api uses DATABASE_URL's owner)")
    return
  }
  // it's embedded in the api's DATABASE_URL, like POSTGRES_PASSWORD, so only url-safe hex is accepted
  if(!/^[0-9a-f]{32,}$/.test(password)) {
    throw new Error("API_DB_PASSWORD must be at least 32 hex characters (openssl rand -hex 32)")
  }
  // ALTER ROLE can't take a bind parameter, so postgres quotes the value itself with format's %L
  const statement = await db.execute<{sql: string}>(sql`select format('ALTER ROLE ckauth_api WITH LOGIN PASSWORD %L', ${password}::text) as sql`)
  await db.execute(sql.raw(statement.rows[0]!.sql))
  console.log("ckauth_api login set")
}

main()
