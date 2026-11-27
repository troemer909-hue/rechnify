export const TENANT_ROLES = ["OWNER", "ADMIN", "EDITOR", "REVIEWER"] as const;
export type TenantRoleName = (typeof TENANT_ROLES)[number];
