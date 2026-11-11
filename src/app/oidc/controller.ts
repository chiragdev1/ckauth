import type {Request, Response} from 'express'
import { getSigningKey, OIDC_SIGNING_ALG } from './keys.js'

// the issuer is the site's own origin (https://ckauth.chiragdev.com in production): clients compare the id token's
// `iss` with it exactly, so no trailing slash, and it never comes from the request's Host header
export function oidcIssuer() {
  return (process.env.FRONTEND_URL as string).replace(/\/+$/, '')
}

// these two answer with the plain json their standards define, not the ApiResponse envelope: client libraries
// read the fields at the top level
export class OidcController {

  // openid connect discovery 1.0: a client library needs only the issuer url, and reads everything else from here.
  // it advertises only what the code really does, because a client trusts it and picks options from it
  public handleDiscovery(req: Request, res: Response) {
    const issuer = oidcIssuer()
    const discovery = {
      issuer,
      authorization_endpoint: `${issuer}/oauth/authorize`,
      token_endpoint: `${issuer}/oauth/token`,
      userinfo_endpoint: `${issuer}/oauth/userinfo`,
      revocation_endpoint: `${issuer}/oauth/revoke`,
      end_session_endpoint: `${issuer}/oauth/logout`,
      jwks_uri: `${issuer}/.well-known/jwks.json`,
      // authorization code only, answered in the query string: no implicit or hybrid flow, no fragment (rule 1)
      response_types_supported: ['code'],
      response_modes_supported: ['query'],
      grant_types_supported: ['authorization_code', 'refresh_token'],
      // s256 alone: listing plain would invite a client to downgrade (rule 2)
      code_challenge_methods_supported: ['S256'],
      // a different sub for each app's sector, never one shared id (docs/OIDC.md, pairwise sub)
      subject_types_supported: ['pairwise'],
      id_token_signing_alg_values_supported: [OIDC_SIGNING_ALG],
      // confidential clients send their secret in the Authorization header; public clients send none and rely on pkce.
      // client_secret_post is left out: one way per client type means one code path to get right
      token_endpoint_auth_methods_supported: ['client_secret_basic', 'none'],
      revocation_endpoint_auth_methods_supported: ['client_secret_basic', 'none'],
      scopes_supported: ['openid', 'profile', 'email', 'offline_access'],
      claims_supported: ['iss', 'sub', 'aud', 'exp', 'iat', 'auth_time', 'nonce', 'email', 'email_verified', 'name'],
      // rfc 9207: iss rides on every authorization response, so a client using several providers can't be mixed up (rule 4)
      authorization_response_iss_parameter_supported: true,
      // the spec defaults this one to true, so it has to be switched off out loud: request objects aren't supported
      request_uri_parameter_supported: false,
    }
    res.set('Cache-Control', 'public, max-age=300')
    return res.status(200).json(discovery)
  }

  // rfc 7517: the public half of every key a valid token can be signed with. one today; during a rotation the next
  // key is listed here before it signs anything (docs/OIDC.md, rule 15)
  public async handleJwks(req: Request, res: Response) {
    const {publicJwk} = await getSigningKey()
    // a few minutes, so a new key reaches clients soon after it's published
    res.set('Cache-Control', 'public, max-age=300')
    return res.status(200).json({keys: [publicJwk]})
  }
}
