"use client";

import { useCallback, useEffect, useState } from "react";
import type { LucideIcon } from "lucide-react";
import {
  Bell,
  Code2,
  CreditCard,
  Link2,
  Palette,
  Settings,
  ShieldCheck,
  Store,
  Truck,
  Users,
} from "lucide-react";
import Button from "@/components/ui/Button";
import PermissionNotice from "@/components/ui/PermissionNotice";
import TopBar from "@/components/ui/TopBar";
import { confirmDialog } from "@/components/ui/ConfirmDialog";
import {
  securityCheckDialog,
  SecurityCheckCancelledError,
} from "@/components/ui/SecurityCheckDialog";
import SettingsLockScreen from "@/components/layout/SettingsLockScreen";
import {
  clearSettingsUnlock,
  hasSettingsUnlock,
  isSettingsLockedError,
} from "@/services/settingsLock";
import { settingsService } from "@/services/settingsService";
import { extractApiError } from "@/services/api";
import type { SettingsDocument, SettingsSection, SettingsUser, UpdateUserValues } from "@/services/settingsService";
import { useAdminAuth } from "@/services/authContext";
import { applyAppearance, type AppearanceSettings } from "@/services/appearance";
import { applyLanguage, useLanguage } from "@/services/i18n";
import { toast } from "@/components/ui/Toast";
import { SettingsPanel } from "../../components/layout/SettingsPanels";

type SettingMenu =
  | "General"
  | "Store Information"
  | "Payment Methods"
  | "Shipping"
  | "Notifications"
  | "Users & Roles"
  | "Security"
  | "API / Integrations"
  | "Appearance";

const settingMenus: { name: SettingMenu; icon: LucideIcon }[] = [
  { name: "General", icon: Settings },
  { name: "Store Information", icon: Store },
  { name: "Payment Methods", icon: CreditCard },
  { name: "Shipping", icon: Truck },
  { name: "Notifications", icon: Bell },
  { name: "Users & Roles", icon: Users },
  { name: "Security", icon: ShieldCheck },
  // { name: "API Settings", icon: Code2 },
  { name: "API / Integrations", icon: Code2 },
  { name: "Appearance", icon: Palette },
];

export default function SettingsPage() {
  const { isAuthenticated, user, hasPermission } = useAdminAuth();
  const { t } = useLanguage();

  const canViewSettings =
    typeof hasPermission !== "function" || hasPermission("Settings", "view");
  const canViewUsers =
    typeof hasPermission !== "function" || hasPermission("Users", "view");

  const topBarUser = {
    name: user?.name || "Admin",
    role: user?.role
      ? user.role.charAt(0).toUpperCase() + user.role.slice(1)
      : "Admin",
    email: user?.email,
    avatar: user?.avatar || "",
  };

  // Every menu entry stays visible for every staff user (Ahsan's
  // order: a section a role cannot access is SHOWN with the
  // permission notice, never removed) — Users & Roles included:
  // selecting it without Users view renders the shared notice in
  // place of the panel, and no users data is fetched. Every service —
  // including the store's own storage and session auth — is a normal
  // entry in the integrations builder, gated by the Settings
  // permissions, so no menu rule is needed here.
  const visibleMenus = settingMenus;
  const [activeMenu, setActiveMenu] = useState<SettingMenu>("General");
  const [settings, setSettings] = useState<SettingsDocument>({});
  const [users, setUsers] = useState<SettingsUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  // Settings Lock: until the admin re-verifies their own password,
  // this page shows the lock screen and no settings data is loaded
  // (the API refuses the full read with 403 SETTINGS_LOCKED anyway).
  const [locked, setLocked] = useState(false);

  const loadSettings = useCallback(() => {
    setLoading(true);
    return settingsService
      .getSettings()
      .then((data) => {
        setSettings(data);
        setLocked(false);
      })
      .catch((loadError: unknown) => {
        if (isSettingsLockedError(loadError)) {
          // The stored unlock proof is gone/expired — back to the
          // lock screen, never an error toast.
          clearSettingsUnlock();
          setLocked(true);
        } else {
          toast.error(loadError instanceof Error ? loadError.message : t("Unable to load settings."));
        }
      })
      .finally(() => {
        setLoading(false);
      });
  }, [t]);

  // The settings API requires the admin token — wait for the session
  // before loading, and reload once it appears (the shell renders this
  // page behind the login popup, so a mount-only fetch would 401 and the
  // page would sit on an error even after signing in). A role without
  // Settings view never fires the fetch at all: the page renders the
  // permission notice below and no settings data is even requested
  // (the API would answer 403 anyway — this keeps the state clean).
  // With Settings view but NO unlock proof, the read would only earn
  // the locked refusal — go straight to the lock screen instead.
  useEffect(() => {
    if (!isAuthenticated || !canViewSettings) return;
    if (!hasSettingsUnlock()) {
      setLocked(true);
      setLoading(false);
      return;
    }
    void loadSettings();
  }, [isAuthenticated, canViewSettings, loadSettings]);

  useEffect(() => {
    if (activeMenu !== "Users & Roles" || !isAuthenticated || !canViewSettings || !canViewUsers || locked) return;
    let cancelled = false;

    settingsService.getUsers()
      .then((data) => {
        if (!cancelled) setUsers(data);
      })
      .catch((loadError: unknown) => {
        if (!cancelled) toast.error(loadError instanceof Error ? loadError.message : t("Unable to load users."));
      });

    return () => {
      cancelled = true;
    };
  }, [activeMenu, isAuthenticated, canViewSettings, canViewUsers, locked]);

  const saveSection = async (section: SettingsSection, value: unknown) => {
    // Settings Lock: every Settings save first verifies the admin's
    // own password (the modal); a cancel saves nothing. The password
    // rides with this one request only — the API re-verifies it
    // server-side before writing.
    const securityPassword = await securityCheckDialog({
      message: t("Enter your own account password to save these settings."),
    });
    if (!securityPassword) return;
    setSaving(true);
    try {
      const updated = await settingsService.updateSection(section, value, securityPassword);
      setSettings(updated);
      // Appearance takes effect immediately, not just in the database.
      if (section === "appearance") {
        applyAppearance(updated.appearance as AppearanceSettings);
      }
      // Language too: saving General re-renders the whole shell in
      // the chosen language without waiting for a reload.
      if (section === "general") {
        const language = (updated.general as { language?: string } | undefined)?.language;
        if (language) applyLanguage(language);
      }
      toast.success(t("Settings saved."));
    } catch (saveError) {
      // Surface the API's own message (extractApiError) — a refused
      // security check, like any other save refusal, must tell the
      // admin WHY nothing was saved, not a generic failure line.
      toast.error(extractApiError(saveError));
    } finally {
      setSaving(false);
    }
  };

  const deleteUser = async (id: string) => {
    const confirmed = await confirmDialog({
      title: t("Delete this user?"),
      message: t("The account will be removed permanently. This cannot be undone."),
      confirmLabel: t("Delete"),
      variant: "danger",
    });
    if (!confirmed) return;
    // Settings Lock: the deletion is a Settings save — it verifies
    // the admin's own password after the danger confirmation.
    const securityPassword = await securityCheckDialog({
      message: t("Enter your own account password to delete this user."),
      confirmLabel: t("Verify & Delete"),
    });
    if (!securityPassword) return;
    try {
      await settingsService.deleteUser(id, securityPassword);
      setUsers((currentUsers) => currentUsers.filter((user) => user._id !== id));
    } catch (deleteError) {
      toast.error(deleteError instanceof Error ? deleteError.message : t("Unable to delete user."));
    }
  };

  const createUser = async (values: {
    firstName: string;
    lastName: string;
    email: string;
    password: string;
    confirmPassword?: string;
    role: string;
    isActive: boolean;
  }) => {
    // Settings Lock: creating an account from Users & Roles is a
    // Settings save — verify first; a cancel aborts silently (the
    // panel treats SecurityCheckCancelledError as "stay quiet").
    const securityPassword = await securityCheckDialog({
      message: t("Enter your own account password to create this user."),
    });
    if (!securityPassword) throw new SecurityCheckCancelledError();
    try {
      const created = await settingsService.createUser(values, securityPassword);
      setUsers((currentUsers) => [...currentUsers, created]);
      toast.success(t("User created."));
    } catch (createError) {
      // Rethrow with the API's message so the Add User form can show it
      // in place (e.g. "A user with this email already exists.").
      const apiMessage = (createError as { response?: { data?: { message?: string } } })?.response
        ?.data?.message;
      throw new Error(
        apiMessage || (createError instanceof Error ? createError.message : t("Unable to create user.")),
      );
    }
  };

  const updateUser = async (id: string, values: UpdateUserValues) => {
    // Settings Lock: same per-save verification as createUser. (A
    // password change inside the edit form keeps its own trio check
    // on top — that flow is unchanged.)
    const securityPassword = await securityCheckDialog({
      message: t("Enter your own account password to save this user."),
    });
    if (!securityPassword) throw new SecurityCheckCancelledError();
    try {
      const updated = await settingsService.updateUser(id, values, securityPassword);
      setUsers((currentUsers) =>
        currentUsers.map((user) => (user._id === id ? { ...user, ...updated } : user)),
      );
      toast.success(t("User updated."));
    } catch (updateError) {
      // Rethrow with the API's message — the panel shows it in place
      // (the Edit User form) or as a toast (inline row changes). The
      // API's own wording explains guard refusals (own role, last
      // Super Admin) better than a generic fallback.
      const apiMessage = (updateError as { response?: { data?: { message?: string } } })?.response
        ?.data?.message;
      throw new Error(
        apiMessage || (updateError instanceof Error ? updateError.message : t("Unable to update user.")),
      );
    }
  };

  // Roles without Settings view get a clean notice, not a broken page
  // (the settings API answers 403 for them anyway).
  if (isAuthenticated && !canViewSettings) {
    return (
      <main className="min-h-full bg-[var(--background)] p-3">
        <header className="mb-3 flex w-full items-center justify-between">
          <TopBar
            title={t("Settings")}
            subtitle={t("Manage your store settings and preferences")}
            user={topBarUser}
            messages={[]}
            notifications={[]}
          />
        </header>
        <PermissionNotice
          section="Settings"
          heading={t("You don't have permission to view Settings")}
        />
      </main>
    );
  }

  // Settings Lock: a role WITH Settings view gets the lock screen
  // until they re-verify their own password — no panel, no settings
  // data (the API refuses the reads too). Precedence is deliberate:
  // no-view → the permission notice above; view + locked → here;
  // view + unlocked → the panels below.
  if (isAuthenticated && locked) {
    return (
      <main className="min-h-full bg-[var(--background)] p-3">
        <header className="mb-3 flex w-full items-center justify-between">
          <TopBar
            title={t("Settings")}
            subtitle={t("Manage your store settings and preferences")}
            user={topBarUser}
            messages={[]}
            notifications={[]}
          />
        </header>
        <SettingsLockScreen
          onUnlocked={() => {
            setLocked(false);
            void loadSettings();
          }}
        />
      </main>
    );
  }

  /* Full Page Theme-Matched Skeleton Component */
  if (loading) {
    return (
      <main className="min-h-full bg-[var(--background)] p-3 flex flex-col gap-3">
        {/* The same TopBar the loaded page shows — it used to be missing
            here entirely, which is why Settings looked different. */}
        <header className="flex w-full items-center justify-between">
          <TopBar
            title={t("Settings")}
            subtitle={t("Manage your store settings and preferences")}
            user={topBarUser}
            messages={[]}
            notifications={[]}
          />
        </header>

        <div className="grid grid-row-2 gap-3 flex-1 animate-pulse">
          {/* Navigation Tab Grid Skeleton */}
          <nav className="h-fit rounded-xl border border-[var(--border)] bg-[var(--background)] p-2 flex flex-wrap gap-3">
            {Array.from({ length: 10 }).map((_, index) => (
              <div
                key={index}
                className="h-10 min-w-[clamp(130px,18%,100%)] flex-1 rounded-lg bg-[var(--primary-soft)] border border-[var(--border)]/60"
              />
            ))}
          </nav>

          {/* Full Page Content Panel Skeleton */}
          <section className="min-w-0 rounded-xl border border-[var(--border)] bg-[var(--surface)]/50 p-6 flex flex-col justify-between space-y-8 flex-1">
            <div className="space-y-6">
              {/* Section Header */}
              <div className="space-y-2 border-b border-[var(--border)] pb-5">
                <div className="h-6 w-48 rounded-md bg-[var(--primary-soft)]" />
                <div className="h-4 w-64 rounded-md bg-[var(--primary-soft)] opacity-70" />
              </div>

              {/* Form Input Fields Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {Array.from({ length: 2 }).map((_, index) => (
                  <div key={index} className="space-y-2">
                    <div className="h-4 w-28 rounded bg-[var(--primary-soft)]" />
                    <div className="h-10 w-full rounded-xl bg-[var(--background)] border border-[var(--border)]" />
                  </div>
                ))}
              </div>

              {/* Store Logo & Image Block Skeleton */}
              <div className="space-y-3 pt-2">
                <div className="space-y-2">
                  <div className="h-4 w-32 rounded bg-[var(--primary-soft)]" />
                  <div className="h-10 w-full rounded-xl bg-[var(--background)] border border-[var(--border)]" />
                </div>
                <div className="h-20 w-20 rounded-xl bg-[var(--surface)] border border-[var(--border)]" />
              </div>
            </div>

            {/* Action Save Button Skeleton */}
            <div className="pt-4 border-t border-[var(--border)] flex justify-end">
              <div className="h-10 w-36 rounded-xl bg-[var(--primary)] opacity-40" />
            </div>
          </section>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-full bg-[var(--background)] p-3">
      <header className="mb-3 flex w-full items-center justify-between">
        <TopBar
          title={t("Settings")}
          subtitle={t("Manage your store settings and preferences")}
          user={topBarUser}
          messages={[]}
          notifications={[]}
        />
      </header>

      <div className="grid grid-row-2 gap-3 ">
        <nav aria-label={t("Settings sections")} className="h-fit rounded-xl border border-[var(--border)] bg-[var(--background)] p-2 flex flex-wrap gap-3">
          {visibleMenus.map(({ name, icon: Icon }) => {
            const active = activeMenu === name;
            return (
              <Button
                key={name}
                variant="secondary"
                aria-current={active ? "page" : undefined}
                onClick={() => {
                  setActiveMenu(name);
                }}
                className={`min-w-[clamp(130px,18%,100%)] flex-1 justify-start text-left ${active ? "text-[var(--primary)]!" : ""}`}
              >
                <Icon size={17} className={active ? "text-[var(--primary)]" : "text-[var(--text-muted)]"} />
                <span className="truncate">{t(name)}</span>
              </Button>
            );
          })}
        </nav>

        <section className="min-w-0">
          {activeMenu === "Users & Roles" && !canViewUsers ? (
            <PermissionNotice section="Users & Roles" />
          ) : (
          <SettingsPanel
            activeMenu={activeMenu}
            settings={settings}
            users={users}
            saving={saving}
            onSave={saveSection}
            onDeleteUser={(id) => void deleteUser(id)}
            onUpdateUser={updateUser}
            onCreateUser={createUser}
            onIntegrationsSync={(integrations) =>
              setSettings((current) => ({ ...current, integrations }))
            }
          />
          )}
        </section>
      </div>
    </main>
  );
}