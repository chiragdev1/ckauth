import pg from 'pg'
import { drizzle } from 'drizzle-orm/node-postgres'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
// .ts, not .js: node loads this file itself (before tsx is in play) and only strips the types, without remapping extensions
import { testDatabaseUrl } from './database-url.ts'

// runs once before every test file (node --test-global-setup): creates the test database if needed and applies
// the same migrations production gets, so the tests always run against the current schema
export async function globalSetup() {
  const url = new URL(testDatabaseUrl())
  const name = decodeURIComponent(url.pathname.slice(1))

  // CREATE DATABASE has to run from another database; every Postgres server has one called postgres
  const serverUrl = new URL(url)
  serverUrl.pathname = '/postgres'
  const server = new pg.Client({connectionString: serverUrl.toString()})

  try {
    await server.connect()
  } catch (error) {
    throw new Error(`The tests need Postgres, and it isn't reachable (${error instanceof Error ? error.message : error}). Start it with: pnpm db:up`)
  }

  try {
    await server.query(`create database "${name.replaceAll('"', '""')}"`)
  } catch (error) {
    // 42P04: it already exists, from an earlier run
    if((error as {code?: string}).code !== '42P04') {
      throw error
    }
  } finally {
    await server.end()
  }

  const db = drizzle(url.toString())
  try {
    await migrate(db, {migrationsFolder: 'drizzle'})
  } finally {
    await db.$client.end()
  }
}
