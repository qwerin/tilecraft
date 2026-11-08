import type { components } from './schema.gen'

// Typy z OpenAPI schématu (schema.gen.ts generuje `make gen-types`).
type S = components['schemas']
export type Me = S['Me']
export type MyAccount = S['MyAccount']
export type Account = S['Account']
export type AdminAccount = S['AdminAccount']
export type AdminSignupCode = S['AdminSignupCode']
export type Settings = S['Settings']
export type Member = S['Member']
export type LabMailSettings = S['LabMailSettings']
export type APIToken = S['APIToken']
export type OAuthGrant = S['OAuthGrantOut']
export type OAuthConsent = S['OAuthConsent']
export type OAuthAuthorizeParams = Omit<S['OAuthDecision'], 'approve'>

/** Role ve firmě: vlastník, kancelář (admin), parťák (worker). */
export type Role = 'owner' | 'admin' | 'worker'
