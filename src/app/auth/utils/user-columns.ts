import { usersTable } from '../../../db/schema.js'

// the user fields that are safe to send to a client (req.user, /auth/me, the admin list): never the password, token
// hashes or the ImageKit file id. one list, so a new secret column can't leak through a select that was missed
export const safeUserColumns = {
  id: usersTable.id,
  firstName: usersTable.firstName,
  lastName: usersTable.lastName,
  age: usersTable.age,
  email: usersTable.email,
  emailVerified: usersTable.emailVerified,
  role: usersTable.role,
  avatarUrl: usersTable.avatarUrl,
  createdAt: usersTable.createdAt,
}
