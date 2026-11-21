import { apiClient } from "./api";

// Mirrors the backend's section allowlist exactly — an earlier version
// also declared an "apiSettings" section the API rejects as unknown.
export type SettingsSection =
  | "general"
  | "storeInfo"
  | "paymentMethods"
  | "shipping"
  | "notifications"
  | "integrations"
  | "appearance";

export interface SettingsDocument {
  _id?: string;
  general?: Record<string, unknown>;
  storeInfo?: Record<string, unknown>;
  paymentMethods?: Array<Record<string, unknown>>;
  shipping?: Record<string, unknown>;
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
  role?: string;
  isActive?: boolean;
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
};