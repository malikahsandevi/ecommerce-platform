import { apiClient } from "./api";

// Mirrors the backend's section allowlist exactly. The old bespoke
// "paymentMethods" / "shipping" sections are gone — payment gateways
// and shipping providers are services now, managed as integrations
// entries from the Payment Methods / Shipping tabs.
export type SettingsSection =
  | "general"
  | "storeInfo"
  | "notifications"
  | "integrations"
  | "appearance";

export interface SettingsDocument {
  _id?: string;
  general?: Record<string, unknown>;
  storeInfo?: Record<string, unknown>;
  notifications?: Record<string, unknown>;
  integrations?: Array<Record<string, unknown>>;
  appearance?: Record<string, unknown>;
}

export interface SettingsUser {
  _id: string;
  firstName?: string;
  lastName?: string;
  name?: string;
  email: string;
  avatar?: string;
  role?: string;
  isActive?: boolean;
  /** Panel 2FA state (staff accounts) — drives the Reset 2FA row action. */
  twoFactorEnabled?: boolean;
}

/** One row of Settings → Deleted Items: a soft-deleted record
 *  waiting for a restore or a permanent delete. Display metadata
 *  only — the API never sends the record's own data here. */
export interface DeletedItem {
  module: string;
  moduleLabel: string;
  id: string;
  name: string;
  code?: string | null;
  deletedAt: string;
  deletedBy?: { name?: string | null; email?: string | null } | null;
}

/** The role → module → action permission matrix (GET /permissions). */
export type PermissionMatrixData = Record<
  string,
  Record<string, Record<string, boolean>>
>;

export interface RolePermissionsData {
  modules: string[];
  moduleActions: Record<string, string[]>;
  /** Built-in roles plus every custom role created from the panel. */
  roles: string[];
  customRoles: string[];
  /** The factory permission matrix — Restore Defaults writes these
   *  values back for the built-in roles through updatePermissions. */
  defaults: PermissionMatrixData;
  matrix: PermissionMatrixData;
  canEdit: boolean;
}

/** Fields the Users & Roles edit form may send. A password change is
 *  a trio: `password` (the new one) travels with `currentPassword` and
 *  `confirmPassword`, and the backend verifies the current password
 *  against the edited account's stored hash plus the confirmation
 *  before anything is saved. When no change is wanted, all three are
 *  omitted entirely — blank means "keep the current password". */
export interface UpdateUserValues {
  firstName?: string;
  lastName?: string;
  email?: string;
  password?: string;
  currentPassword?: string;
  confirmPassword?: string;
  role?: string;
  isActive?: boolean;
}

export const settingsService = {
  async getSettings(): Promise<SettingsDocument> {
    const { data } = await apiClient.get<SettingsDocument>("/settings");
    return data;
  },

  /** Settings Lock (Ahsan's order): EVERY save inside Settings
   *  verifies the admin's own password for that save. The panels
   *  collect it through the SecurityCheck modal and pass it here; it
   *  rides in the request body as `securityPassword` (or the
   *  X-Settings-Password header on DELETEs), the API verifies it
   *  against the caller's hash and strips it before anything is
   *  written — a missing/wrong password earns a 403 and nothing is
   *  saved. The value is never stored by this layer. */
  async updateSection(
    section: SettingsSection,
    values: unknown,
    securityPassword?: string,
  ): Promise<SettingsDocument> {
    const { data } = await apiClient.put<SettingsDocument>("/settings", {
      [section]: values,
      ...(securityPassword ? { securityPassword } : {}),
    });
    return data;
  },

  /** The universal appearance write (PUT /settings/appearance): the
   *  TopBar theme toggle and the palette Keep path write the
   *  appearance section from anywhere in the admin — deliberately NOT
   *  password-gated, because a theme choice is the panel's universal
   *  rendering state. The Settings → Appearance panel's own Save does
   *  NOT come through here: it uses the gated updateSection above,
   *  like every other panel save. */
  async updateAppearance(values: Record<string, unknown>): Promise<SettingsDocument> {
    const { data } = await apiClient.put<SettingsDocument>("/settings/appearance", {
      appearance: values,
    });
    return data;
  },

  /** Per-entry save for ONE service entry (PUT
   *  /settings/integrations/:slug) — every entry in the service
   *  builder has its OWN Save button, and saving it writes exactly
   *  that entry server-side; the rest of the array is untouched.
   *  Returns the saved entry (secrets masked) and the full masked
   *  integrations array. */
  async saveIntegration(
    entry: Record<string, unknown>,
    slugOverride?: string,
    securityPassword?: string,
  ): Promise<{ integration: Record<string, unknown> | null; integrations: Array<Record<string, unknown>> }> {
    // The URL slug is the entry's STORED identity (a persisted entry
    // keeps its slug even if its title was renamed).
    const slug = encodeURIComponent(String(slugOverride ?? entry.serviceSlug ?? ""));
    const { data } = await apiClient.put(`/settings/integrations/${slug}`, {
      ...entry,
      ...(securityPassword ? { securityPassword } : {}),
    });
    return data;
  },

  /** Per-entry remove (DELETE /settings/integrations/:slug). A
   *  Settings save, so the per-save security password rides along —
   *  in the header, since a DELETE carries no reliable body. */
  async deleteIntegration(
    serviceSlug: string,
    securityPassword?: string,
  ): Promise<{ integrations: Array<Record<string, unknown>> }> {
    const { data } = await apiClient.delete(
      `/settings/integrations/${encodeURIComponent(serviceSlug)}`,
      {
        headers: securityPassword
          ? { "X-Settings-Password": securityPassword }
          : undefined,
      },
    );
    return data;
  },

  async getUsers(): Promise<SettingsUser[]> {
    const { data } = await apiClient.get<SettingsUser[]>("/users");
    return data;
  },

  async deleteUser(id: string, securityPassword?: string): Promise<void> {
    await apiClient.delete(`/users/${id}`, {
      headers: securityPassword
        ? { "X-Settings-Password": securityPassword }
        : undefined,
    });
  },

  /** Resets a staff account's two-factor authentication (Super Admin
   *  only — the API answers 403 otherwise). A Settings save, so the
   *  per-save security password rides in the body like the other user
   *  writes; the API verifies and strips it before anything changes.
   *  The account enrols again at its next sign-in. */
  async resetUserTwoFactor(id: string, securityPassword?: string): Promise<SettingsUser> {
    const { data } = await apiClient.post<SettingsUser>(`/users/${id}/reset-2fa`, {
      ...(securityPassword ? { securityPassword } : {}),
    });
    return data;
  },

  /** Creates an account from Settings → Users & Roles ("Add User").
   *  The API derives the username from the email and answers with a
   *  clean message when the email is already taken. */
  async createUser(values: {
    firstName: string;
    lastName: string;
    email: string;
    password: string;
    /** The Add User form's confirmation — the API rejects a mismatch
     *  with a 400 and creates nothing. */
    confirmPassword?: string;
    role: string;
    isActive: boolean;
  }, securityPassword?: string): Promise<SettingsUser> {
    const { data } = await apiClient.post<SettingsUser>("/users", {
      ...values,
      ...(securityPassword ? { securityPassword } : {}),
    });
    return data;
  },

  /** Profile / role / active-status / password changes for the Users
   *  & Roles panel. The backend refuses self-demotion, self-deactivation
   *  and removing the last active Super Admin — those errors surface to
   *  the page. A password change rides as a trio (`password` +
   *  `currentPassword` + `confirmPassword`): the backend verifies the
   *  current password and the confirmation before replacing the hash;
   *  omitting all three leaves the password untouched. */
  async updateUser(
    id: string,
    values: UpdateUserValues,
    securityPassword?: string,
  ): Promise<SettingsUser> {
    const { data } = await apiClient.put<SettingsUser>(`/users/${id}`, {
      ...values,
      ...(securityPassword ? { securityPassword } : {}),
    });
    return data;
  },

  /** Creates a custom role (Super Admin only — the API answers 403 for
   *  anyone else). The new role starts with no permissions at all. */
  async createRole(name: string, securityPassword?: string): Promise<{ role: string; roles: string[]; customRoles: string[] }> {
    const { data } = await apiClient.post<{ role: string; roles: string[]; customRoles: string[] }>(
      "/permissions/roles",
      { name, ...(securityPassword ? { securityPassword } : {}) },
    );
    return data;
  },

  /** Deletes a custom role (Super Admin only — the API answers 403 for
   *  anyone else, 400 for a built-in role, and 400 with the assignment
   *  count while any user still holds the role). */
  async deleteRole(name: string, securityPassword?: string): Promise<{ role: string; roles: string[]; customRoles: string[] }> {
    const { data } = await apiClient.delete<{ role: string; roles: string[]; customRoles: string[] }>(
      `/permissions/roles/${encodeURIComponent(name)}`,
      {
        headers: securityPassword
          ? { "X-Settings-Password": securityPassword }
          : undefined,
      },
    );
    return data;
  },

  /** Settings → Deleted Items: every soft-deleted record across all
   *  modules (optionally narrowed to one module segment). The read
   *  sits behind the Settings Lock entry proof like every full
   *  Settings read — the shell's stored unlock rides along through
   *  the API client. */
  async getDeletedItems(module?: string): Promise<DeletedItem[]> {
    const { data } = await apiClient.get<DeletedItem[]>("/trash", {
      params: module ? { module } : undefined,
    });
    return data;
  },

  /** Restores one Deleted Items record to its module, exactly as it
   *  was. A Settings write, so the per-save security password rides
   *  in the body and is verified server-side for this action only. */
  async restoreDeletedItem(
    module: string,
    id: string,
    securityPassword?: string,
  ): Promise<void> {
    await apiClient.post(`/trash/${module}/${id}/restore`, {
      ...(securityPassword ? { securityPassword } : {}),
    });
  },

  /** Permanently deletes one Deleted Items record — the real
   *  removal (for media, the Cloudinary file is destroyed too). A
   *  Settings write: the security password rides in the header, as
   *  on every other DELETE. */
  async permanentlyDeleteItem(
    module: string,
    id: string,
    securityPassword?: string,
  ): Promise<void> {
    await apiClient.delete(`/trash/${module}/${id}`, {
      headers: securityPassword
        ? { "X-Settings-Password": securityPassword }
        : undefined,
    });
  },

  /** The full permission matrix + editor vocabulary. Any staff member
   *  may read it; `canEdit` is true only for Super Admin. */
  async getPermissions(): Promise<RolePermissionsData> {
    const { data } = await apiClient.get<RolePermissionsData>("/permissions");
    return data;
  },

  /** Runs one saved integration endpoint through the backend runner
   *  (POST /settings/execute). The runner executes the SAVED
   *  configuration — the panel saves the entry first, so what is
   *  tested is exactly what is stored. Resolves with the provider's
   *  response data; a provider failure rejects with the API's error
   *  message. */
  async executeIntegration(
    serviceSlug: string,
    endpointName: string,
    payload: Record<string, unknown> = {},
    queryParams: Record<string, unknown> = {},
  ): Promise<{ success: boolean; data: unknown }> {
    const { data } = await apiClient.post<{ success: boolean; data: unknown }>(
      "/settings/execute",
      { serviceSlug, endpointName, payload, queryParams },
    );
    return data;
  },

  /** Replaces the matrix (Super Admin only — the API answers 403 for
   *  anyone else). Returns the stored matrix as merged with defaults. */
  async updatePermissions(matrix: PermissionMatrixData, securityPassword?: string): Promise<PermissionMatrixData> {
    const { data } = await apiClient.put<{ matrix: PermissionMatrixData }>(
      "/permissions",
      { matrix, ...(securityPassword ? { securityPassword } : {}) },
    );
    return data.matrix;
  },
};
