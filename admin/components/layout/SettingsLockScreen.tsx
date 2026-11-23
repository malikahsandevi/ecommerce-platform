"use client";

import { useState } from "react";
import { Loader2, ShieldAlert } from "lucide-react";
import Button from "@/components/ui/Button";
import { SettingsInput } from "@/components/layout/SettingsControls";
import { verifySettingsPassword } from "@/services/settingsLock";
import { extractApiError } from "@/services/api";
import { useLanguage } from "@/services/i18n";

/**
 * The Settings Lock's entry screen (Ahsan's order): a role WITH
 * Settings view still sees no panel and no settings data until they
 * re-verify with their own account password. Same visual family as
 * the PermissionNotice (shield in the soft rounded square) — the
 * notice is for "your role may not enter", this is for "prove it's
 * you, again". A wrong password shows the API's message and stays
 * locked; the password is cleared either way and never stored.
 */
export default function SettingsLockScreen({
  onUnlocked,
}: {
  onUnlocked: () => void;
}) {
  const { t } = useLanguage();
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (busy) return;
    if (!password) {
      setError(t("Enter your password to continue."));
      return;
    }
    setBusy(true);
    setError("");
    try {
      await verifySettingsPassword(password);
      setPassword("");
      onUnlocked();
    } catch (verifyError) {
      setPassword("");
      setError(extractApiError(verifyError));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
      <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--primary-soft)] text-[var(--primary)]">
        <ShieldAlert className="h-7 w-7" />
      </span>
      <h2 className="text-base font-bold text-[var(--text)]">
        {t("Settings is locked")}
      </h2>
      <p className="max-w-sm text-xs text-[var(--text-muted)]">
        {t("Enter your account password to continue.")}
      </p>

      <form
        className="mt-3 w-full max-w-xs text-left"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <SettingsInput
          label="Your password"
          type="password"
          value={password}
          onChange={(event) => {
            setPassword(event.target.value);
            if (error) setError("");
          }}
          autoFocus
        />
        {error && (
          <p
            className="mt-3 rounded-lg border border-red-300 bg-red-500/10 p-2.5 text-xs text-red-600"
            role="alert"
          >
            {error}
          </p>
        )}
        <Button
          variant="primary"
          size="md"
          type="submit"
          disabled={busy}
          className="mt-4 w-full"
        >
          {busy ? (
            <span className="flex items-center gap-1.5">
              <Loader2 className="h-4 w-4 animate-spin" />
              {t("Verifying...")}
            </span>
          ) : (
            t("Unlock Settings")
          )}
        </Button>
      </form>
    </div>
  );
}
