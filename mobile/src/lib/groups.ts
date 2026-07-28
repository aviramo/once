// Per-group 6-digit invite codes. Shared between the onboarding step-6 input
// and the settings "My groups" sheet join input — keep them in lockstep
// through this single constant (mirrors bio.ts holding BIO_MIN/BIO_MAX for
// the bio input).
export const INVITE_CODE_LEN = 6

// Field caps for a group, shared by the create form and the settings editors so
// the two can never drift. Mirrored by app_create_group / app_update_group,
// which reject anything longer — keep the pair in lockstep.
export const GROUP_NAME_MAX = 60
export const GROUP_DESCRIPTION_MAX = 500
export const GROUP_LINK_MAX = 300

export type Group = {
  id: string
  name: string
}
