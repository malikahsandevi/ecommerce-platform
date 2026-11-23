"use client";

import { ShieldAlert } from "lucide-react";
import { useAdminAuth } from "@/services/authContext";
import { useLanguage } from "@/services/i18n";

/**
 * The ONE no-access notice for the whole admin (Ahsan's order: a
 * section a role cannot view is SHOWN this way — never removed from
 * the navigation, never a blank or broken page). Shield in the soft
 * circle, "You don't have permission to view X", and the role line
 * pointing at Settings → Users & Roles — the exact body Settings has
 * always shown. Pages keep their own header shell above it; this
 * component is only the body, and it renders no module data (pages
 * must not fire their data fetches when this shows — the APIs answer
 * 403 for the data anyway).
 */
export default function PermissionNotice({
  section,
  heading,
  message,
}: {
  /** Module/section name, translated here for the default heading. */
  section: string;
  /**
   * Overrides the default heading. Settings and the Dashboard pass
   * their long-standing dedicated strings so their text never changes.
   */
  heading?: string;
  /**
   * Overrides the body line (translated here; {role} is replaced with
   * the caller's role, exactly like the default line). For refusals
   * that are NOT the permission matrix's call — a hard Super-Admin-only
   * surface the matrix cannot grant, e.g. Payment Methods — where the
   * default "change it in Users & Roles" line would be wrong.
   */
  message?: string;
}) {
  const { user } = useAdminAuth();
  const { t } = useLanguage();
  const title =
    heading ??
    t("You don't have permission to view {module}").replace(
      "{module}",
      t(section),
    );
  const body = t(
    message ??
      "Your role ({role}) can't access this section. Ask a Super Admin to change it in Settings → Users & Roles.",
  ).replace("{role}", user?.role || "Staff");
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
      <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--primary-soft)] text-[var(--primary)]">
        <ShieldAlert className="h-7 w-7" />
      </span>
      <h2 className="text-base font-bold text-[var(--text)]">{title}</h2>
      <p className="max-w-sm text-xs text-[var(--text-muted)]">{body}</p>
    </div>
  );
}
