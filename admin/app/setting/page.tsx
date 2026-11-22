"use client";

import { useEffect, useState } from "react";
import type { LucideIcon } from "lucide-react";
import {
  Bell,
  Code2,
  CreditCard,
  Link2,
  Palette,
  Settings,
  ShieldAlert,
  ShieldCheck,
  Store,
  Truck,
  Users,
} from "lucide-react";
import Button from "@/components/ui/Button";
import TopBar from "@/components/ui/TopBar";
import { confirmDialog } from "@/components/ui/ConfirmDialog";
import { settingsService } from "@/services/settingsService";
import type { SettingsDocument, SettingsSection, SettingsUser } from "@/services/settingsService";
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

  // The Users & Roles section is account management — roles without
  // Users view don't see the menu entry at all. Every service —
  // including the store's own storage and session auth — is a normal
  // entry in the integrations builder, gated by the Settings
  // permissions, so no menu rule is needed here.
  const visibleMenus = settingMenus.filter((menu) => {
    if (menu.name === "Users & Roles") return canViewUsers;
    return true;
  });
  const [activeMenu, setActiveMenu] = useState<SettingMenu>("General");
  const [settings, setSettings] = useState<SettingsDocument>({});
  const [users, setUsers] = useState<SettingsUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // The settings API requires the admin token — wait for the session
  // before loading, and reload once it appears (the shell renders this
  // page behind the login popup, so a mount-only fetch would 401 and the
  // page would sit on an error even after signing in).
  useEffect(() => {
    if (!isAuthenticated) return;
    let cancelled = false;
    setLoading(true);
    settingsService.getSettings()
      .then((data) => {
        if (!cancelled) setSettings(data);
      })
      .catch((loadError: unknown) => {
        if (!cancelled) toast.error(loadError instanceof Error ? loadError.message : t("Unable to load settings."));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [isAuthenticated]);

  useEffect(() => {
    if (activeMenu !== "Users & Roles" || !isAuthenticated) return;
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
  }, [activeMenu, isAuthenticated]);

  const saveSection = async (section: SettingsSection, value: unknown) => {
    setSaving(true);
    try {
      const updated = await settingsService.updateSection(section, value);
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
      toast.error(saveError instanceof Error ? saveError.message : t("Unable to save settings."));
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
    try {
      await settingsService.deleteUser(id);
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
    role: string;
    isActive: boolean;
  }) => {
    try {
      const created = await settingsService.createUser(values);
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

  const updateUser = async (id: string, values: { role?: string; isActive?: boolean }) => {
    try {
      const updated = await settingsService.updateUser(id, values);
      setUsers((currentUsers) =>
        currentUsers.map((user) => (user._id === id ? { ...user, ...updated } : user)),
      );
      toast.success(t("User updated."));
    } catch (updateError) {
      // The API's own message explains guard refusals (own role, last
      // Super Admin) better than a generic fallback — prefer it.
      const apiMessage = (updateError as { response?: { data?: { message?: string } } })?.response
        ?.data?.message;
      toast.error(apiMessage || (updateError instanceof Error ? updateError.message : t("Unable to update user.")));
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
        <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--primary-soft)] text-[var(--primary)]">
            <ShieldAlert className="h-7 w-7" />
          </span>
          <h2 className="text-base font-bold text-[var(--text)]">
            {t("You don't have permission to view Settings")}
          </h2>
          <p className="max-w-sm text-xs text-[var(--text-muted)]">
            {t("Your role ({role}) can't access this section. Ask a Super Admin to change it in Settings → Users & Roles.").replace("{role}", user?.role || "Staff")}
          </p>
        </div>
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
          <SettingsPanel
            activeMenu={activeMenu}
            settings={settings}
            users={users}
            saving={saving}
            onSave={saveSection}
            onDeleteUser={(id) => void deleteUser(id)}
            onUpdateUser={(id, values) => void updateUser(id, values)}
            onCreateUser={createUser}
            onIntegrationsSync={(integrations) =>
              setSettings((current) => ({ ...current, integrations }))
            }
          />
        </section>
      </div>
    </main>
  );
}