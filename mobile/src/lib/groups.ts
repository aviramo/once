// Per-group 6-digit invite codes. Shared between the onboarding step-6 input
// and the settings "My groups" sheet join input — keep them in lockstep
// through this single constant (mirrors bio.ts holding BIO_MIN/BIO_MAX for
// the bio input).
export const INVITE_CODE_LEN = 6

export type Group = {
  id: string
  name: string
}
