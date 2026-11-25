// the kill switch for sign in with ckauth (docs/OIDC.md). read once, when the app is created:
// while it's off the oidc routers are never mounted, so each milestone can merge into main and deploy dark.
// turning it on or off is a settings change (`docker compose up -d api`), not a code change
export function isOidcEnabled(value: string | undefined = process.env.OIDC_ENABLED): boolean {
  return value === 'true'
}
