"use client";

// Password reset completion — the landing page of the emailed link
// (/reset-password?token=…). Rendered bare by AdminShell (no sidebar,
// no login popup): the visitor is signed out by definition. The token
// is single-use and expires in 1 hour; the API re-checks both.

import React, { Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { AlertCircle, CheckCircle2, KeyRound, Loader2 } from "lucide-react";
import BuiltByFooter from "@/components/layout/BuiltByFooter";
import { apiClient } from "@/services/api";
import { describeAuthError } from "@/services/authContext";
import { useLanguage } from "@/services/i18n";

const inputStyle: React.CSSProperties = {
  borderColor: "var(--border)",
  borderWidth: "1px",
  borderStyle: "solid",
  color: "var(--text)",
};

function ResetPasswordForm() {
  const { t } = useLanguage();
  const searchParams = useSearchParams();
  const token = searchParams.get("token") || "";

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (password.length < 6) {
      setError(t("The new password must be at least 6 characters."));
      return;
    }
    if (password !== confirm) {
      setError(t("The passwords do not match."));
      return;
    }

    setLoading(true);
    try {
      await apiClient.post("/auth/reset-password", { token, password });
      setDone(true);
    } catch (err) {
      setError(describeAuthError(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    // Card + credit line are centred as ONE group, so the footer sits
    // tight under the card — the old flex-1 centring wrapper pushed
    // the card to the middle and left the footer at the very bottom
    // of a tall window, hundreds of px below the card.
    <div className="min-h-screen flex flex-col items-center justify-center p-4" style={{ backgroundColor: "var(--background)" }}>
      <div
        className="w-full max-w-sm p-6 rounded-2xl shadow-2xl"
        style={{
          backgroundColor: "var(--background)",
          color: "var(--text)",
          borderColor: "var(--border)",
          borderWidth: "1px",
          borderStyle: "solid",
        }}
      >
        <div className="mb-5 text-center">
          <div
            className="mx-auto mb-3 w-11 h-11 rounded-2xl flex items-center justify-center text-white shadow-sm"
            style={{ backgroundColor: "var(--primary)" }}
          >
            <KeyRound className="w-5 h-5" />
          </div>
          <h1 className="text-base font-bold" style={{ color: "var(--text)" }}>
            {t("Reset Password")}
          </h1>
          <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
            {t("Choose a new password for your admin account")}
          </p>
        </div>

        {!token ? (
          <div className="p-3 text-xs text-red-500 bg-red-500/10 border border-red-500/20 rounded-lg flex items-start gap-2">
            <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
            <span>{t("This reset link is invalid or has expired. Request a new one from the sign-in screen.")}</span>
          </div>
        ) : done ? (
          <div className="space-y-4">
            <div className="p-3 text-xs rounded-lg flex items-start gap-2 text-emerald-600 bg-emerald-500/10 border border-emerald-500/20">
              <CheckCircle2 className="w-3.5 h-3.5 mt-0.5 shrink-0" />
              <span>{t("Your password has been reset. You can now sign in with your new password.")}</span>
            </div>
            <Link
              href="/"
              className="block w-full py-2.5 font-semibold text-xs rounded-xl text-center transition-all hover:opacity-90 text-white"
              style={{ backgroundColor: "var(--primary)" }}
            >
              {t("Go to Sign In")}
            </Link>
          </div>
        ) : (
          <>
            {error && (
              <div className="mb-4 p-3 text-xs text-red-500 bg-red-500/10 border border-red-500/20 rounded-lg flex items-start gap-2">
                <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                <span>{error}</span>
              </div>
            )}
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label htmlFor="new-password" className="block text-xs font-medium mb-1" style={{ color: "var(--text-muted)" }}>
                  {t("New Password")}
                </label>
                <input
                  id="new-password"
                  type="password"
                  required
                  autoComplete="new-password"
                  autoFocus
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full px-3 py-2 text-xs bg-transparent rounded-xl focus:outline-none transition-colors"
                  style={inputStyle}
                />
              </div>

              <div>
                <label htmlFor="confirm-password" className="block text-xs font-medium mb-1" style={{ color: "var(--text-muted)" }}>
                  {t("Confirm New Password")}
                </label>
                <input
                  id="confirm-password"
                  type="password"
                  required
                  autoComplete="new-password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  placeholder="••••••••"
                  className="w-full px-3 py-2 text-xs bg-transparent rounded-xl focus:outline-none transition-colors"
                  style={inputStyle}
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 mt-2 font-semibold text-xs rounded-xl transition-all disabled:opacity-50 hover:opacity-90 text-white inline-flex items-center justify-center gap-2"
                style={{ backgroundColor: "var(--primary)" }}
              >
                {loading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                {loading ? t("Resetting...") : t("Reset Password")}
              </button>
            </form>
          </>
        )}
      </div>
      <BuiltByFooter />
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ResetPasswordForm />
    </Suspense>
  );
}
