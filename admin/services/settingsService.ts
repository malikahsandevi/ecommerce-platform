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
}

/** The role → module → action permission matrix (GET /permissions). */
export type PermissionMatrixData = Record<
  string,
  Record<string, Record<string, boolean>>
>;

export interface RolePermissionsData {
  modules: string[];
  moduleActions: Record<string, string[]>;
  roles: string[];
  matrix: PermissionMatrixData;
  canEdit: boolean;
}

export const settingsService = {
  async getSettings(): Promise<SettingsDocument> {
    const { data } = await apiClient.get<SettingsDocument>("/settings");
    return data;
  },

  async updateSection(section: SettingsSection, values: unknown): Promise<SettingsDocument> {
    const { data } = await apiClient.put<SettingsDocument>("/settings", { [section]: values });
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
  ): Promise<{ integration: Record<string, unknown> | null; integrations: Array<Record<string, unknown>> }> {
    // The URL slug is the entry's STORED identity (a persisted entry
    // keeps its slug even if its title was renamed).
    const slug = encodeURIComponent(String(slugOverride ?? entry.serviceSlug ?? ""));
    const { data } = await apiClient.put(`/settings/integrations/${slug}`, entry);
    return data;
  },

  /** Per-entry remove (DELETE /settings/integrations/:slug). */
  async deleteIntegration(
    serviceSlug: string,
  ): Promise<{ integrations: Array<Record<string, unknown>> }> {
    const { data } = await apiClient.delete(
      `/settings/integrations/${encodeURIComponent(serviceSlug)}`,
    );
    return data;
  },

  async getUsers(): Promise<SettingsUser[]> {
    const { data } = await apiClient.get<SettingsUser[]>("/users");
    return data;
  },

  async deleteUser(id: string): Promise<void> {
    await apiClient.delete(`/users/${id}`);
  },

  /** Creates an account from Settings → Users & Roles ("Add User").
   *  The API derives the username from the email and answers with a
   *  clean message when the email is already taken. */
  async createUser(values: {
    firstName: string;
    lastName: string;
    email: string;
    password: string;
    role: string;
    isActive: boolean;
  }): Promise<SettingsUser> {
    const { data } = await apiClient.post<SettingsUser>("/users", values);
    return data;
  },

  /** Role / active-status changes for the Users & Roles panel. The
   *  backend refuses self-demotion, self-deactivation and removing the
   *  last active Super Admin — those errors surface to the page. */
  async updateUser(
    id: string,
    values: { role?: string; isActive?: boolean },
  ): Promise<SettingsUser> {
    const { data } = await apiClient.put<SettingsUser>(`/users/${id}`, values);
    return data;
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
  async updatePermissions(matrix: PermissionMatrixData): Promise<PermissionMatrixData> {
    const { data } = await apiClient.put<{ matrix: PermissionMatrixData }>(
      "/permissions",
      { matrix },
    );
    return data.matrix;
  },
};
