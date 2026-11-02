// admin tasks the http api deliberately can't do: making the first admin, and demoting or removing an admin.
// running it needs shell access to the server, which is the point: a stolen admin session can't reach it.
//
//   local:       pnpm build && pnpm admin <command>
//   production:  docker exec ckauth-api-1 node dist/scripts/manage-users.js <command>   (any folder on the vps; see docs/DEPLOYMENT.md, "Admins")
//
// commands:
//   role <email> <user|admin>   set a user's role (takes effect on their next request)
//   delete <email>              delete a user and their avatar (no email is sent, unlike a delete from /admin)
//   admins                      list every admin
import { eq } from 'drizzle-orm'
import { z } from 'zod'

import { db } from '../db/index.js'
import { usersTable } from '../db/schema.js'
import { emailModel } from '../app/auth/models.js'
import { availableUserRoles, userRolesEnum } from '../app/auth/utils/constants.js'
import { deleteImage } from '../utils/imagekit.js'

const usage = 'usage: manage-users role <email> <user|admin> | delete <email> | admins'

async function setRole(rawEmail: string | undefined, rawRole: string | undefined) {
  const email = emailModel.parse(rawEmail)
  const role = z.enum(availableUserRoles).parse(rawRole)

  const [user] = await db.update(usersTable).set({role}).where(eq(usersTable.email, email)).returning({id: usersTable.id, emailVerified: usersTable.emailVerified})

  if(!user) {
    throw new Error(`no user with email ${email}`)
  }

  console.log(`${email} is now ${role}`)
  // authenticateToken turns unverified users away before the role is ever checked
  if(!user.emailVerified) {
    console.log('note: this account has not verified its email yet, so it cannot sign in until it does')
  }
}

async function deleteUser(rawEmail: string | undefined) {
  const email = emailModel.parse(rawEmail)

  const [user] = await db.delete(usersTable).where(eq(usersTable.email, email)).returning({avatarFileId: usersTable.avatarFileId})

  if(!user) {
    throw new Error(`no user with email ${email}`)
  }

  console.log(`deleted ${email}`)

  // the row is gone either way; report a leftover file instead of failing
  if(user.avatarFileId) {
    await deleteImage(user.avatarFileId).catch((error) => {
      console.error(`could not delete avatar ${user.avatarFileId} from ImageKit:`, error instanceof Error ? error.message : error)
    })
  }
}

async function listAdmins() {
  const admins = await db.select({email: usersTable.email, firstName: usersTable.firstName}).from(usersTable).where(eq(usersTable.role, userRolesEnum.ADMIN))

  if(admins.length === 0) {
    console.log('no admins yet')
  }
  for(const admin of admins) {
    console.log(`${admin.email} (${admin.firstName})`)
  }
}

async function main() {
  const [command, ...args] = process.argv.slice(2)

  if(command === 'role') {
    await setRole(args[0], args[1])
  } else if(command === 'delete') {
    await deleteUser(args[0])
  } else if(command === 'admins') {
    await listAdmins()
  } else {
    throw new Error(usage)
  }
}

try {
  await main()
} catch (error) {
  // zod's message is a json dump, so show just the first issue
  const message = error instanceof z.ZodError ? error.issues[0]?.message : error instanceof Error ? error.message : String(error)
  console.error(`error: ${message}`)
  process.exitCode = 1
} finally {
  // close the pool so the process exits instead of waiting on idle connections
  await db.$client.end()
}
