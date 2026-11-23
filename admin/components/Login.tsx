import React, { useState } from "react";
import { AlertCircle, Check, CheckCircle2, Copy, Loader2, MailQuestionMark, ShieldCheck, Store, X } from "lucide-react";
import { describeAuthError, useAdminAuth } from "@/services/authContext";
import { apiClient } from "@/services/api";
import { useLanguage } from "@/services/i18n";

interface AdminLoginPopupProps {
  isOpen: boolean;
  onClose?: () => void;
  onLoginSuccess?: () => void;
  /** Message from the auth provider, e.g. after the session expired. */
  notice?: string | null;
  onDismissNotice?: () => void;
}

export const AdminLoginPopup: React.FC<AdminLoginPopupProps> = ({
  isOpen,
  onClose,
  onLoginSuccess,
  notice,
  onDismissNotice,
}) => {
  const { t } = useLanguage();
  const { login, verifyTwoFactor, startLoginEnrolment, confirmLoginEnrolment } = useAdminAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  // Two-factor second step: set when the API answers the password with a
  // challenge instead of a session. "setup" is the mandatory enrolment
  // an account without 2FA completes in this same sign-in — every admin
  // account has 2FA, and it is only ever asked for here, at login.
  // "forgot" is the password-reset request form (emailed single-use
  // link).
  const [step, setStep] = useState<"credentials" | "code" | "setup" | "forgot">("credentials");
  const [tempToken, setTempToken] = useState("");
  const [code, setCode] = useState("");
  const [forgotSent, setForgotSent] = useState(false);
  const [setupData, setSetupData] = useState<{ secret: string; qrCode: string } | null>(null);
  const [setupLoading, setSetupLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const result = await login(email.trim(), password);
      if (result.status === "two-factor-required") {
        setTempToken(result.tempToken);
        setCode("");
        setStep("code");
        return;
      }
      if (result.status === "two-factor-setup-required") {
        setTempToken(result.tempToken);
        setCode("");
        setSetupData(null);
        setStep("setup");
        // Fetch the enrolment secret + QR for this account right away,
        // so the setup step opens ready to scan.
        setSetupLoading(true);
        try {
          const data = await startLoginEnrolment(result.tempToken);
          setSetupData({ secret: data.secret, qrCode: data.qrCode });
        } catch (setupErr) {
          setError(describeAuthError(setupErr));
        } finally {
          setSetupLoading(false);
        }
        return;
      }
      onLoginSuccess?.();
      onClose?.();
    } catch (err) {
      setError(describeAuthError(err));
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmEnrolment = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      await confirmLoginEnrolment(tempToken, code.trim());
      setStep("credentials");
      setTempToken("");
      setSetupData(null);
      onLoginSuccess?.();
      onClose?.();
    } catch (err) {
      setError(describeAuthError(err));
    } finally {
      setLoading(false);
    }
  };

  const copySetupSecret = async () => {
    if (!setupData) return;
    try {
      await navigator.clipboard.writeText(setupData.secret);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard unavailable — the secret is visible to copy manually */
    }
  };

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      await verifyTwoFactor(tempToken, code.trim());
      setStep("credentials");
      setTempToken("");
      onLoginSuccess?.();
      onClose?.();
    } catch (err) {
      setError(describeAuthError(err));
    } finally {
      setLoading(false);
    }
  };

  const backToCredentials = () => {
    setStep("credentials");
    setTempToken("");
    setCode("");
    setForgotSent(false);
    setSetupData(null);
    setCopied(false);
    setError("");
  };

  const handleForgot = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      // The API always answers with the same generic message (no
      // account enumeration), so success here only means "request
      // accepted" — the copy says exactly that.
      await apiClient.post("/auth/forgot-password", { email: email.trim() });
      setForgotSent(true);
    } catch (err) {
      setError(describeAuthError(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center backdrop-blur-xs p-4">
      <div
        className="w-full max-w-sm p-6 rounded-2xl shadow-2xl relative animate-in fade-in zoom-in-95 duration-200"
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
            {step === "code" || step === "setup" ? (
              <ShieldCheck className="w-5 h-5" />
            ) : step === "forgot" ? (
              <MailQuestionMark className="w-5 h-5" />
            ) : (
              <Store className="w-5 h-5" />
            )}
          </div>
          <h3 className="text-base font-bold" style={{ color: "var(--text)" }}>
            {step === "code"
              ? t("Two-Factor Authentication")
              : step === "setup"
                ? t("Set Up Two-Factor Authentication")
                : step === "forgot"
                  ? t("Reset Password")
                  : t("Admin Sign In")}
          </h3>
          <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
            {step === "code"
              ? t("Enter the 6-digit code from your authenticator app")
              : step === "setup"
                ? t("Every admin account uses two-factor authentication. Scan the QR code with your authenticator app, then enter the code to finish signing in.")
                : step === "forgot"
                  ? t("Enter your account email and we will send you a reset link")
                  : t("Enter your credentials to manage the store")}
          </p>
        </div>

        {notice && (
          <div className="mb-3 p-3 text-xs rounded-lg flex items-start gap-2 text-amber-600 bg-amber-500/10 border border-amber-500/20">
            <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
            <span className="flex-1">{notice}</span>
            {onDismissNotice && (
              <button
                type="button"
                onClick={onDismissNotice}
                aria-label={t("Dismiss notice")}
                className="close-x shrink-0 rounded-md p-0.5"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        )}

        {error && (
          <div className="mb-4 p-3 text-xs text-red-500 bg-red-500/10 border border-red-500/20 rounded-lg flex items-start gap-2">
            <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {step === "forgot" ? (
          forgotSent ? (
            <div className="space-y-4">
              <div className="p-3 text-xs rounded-lg flex items-start gap-2 text-emerald-600 bg-emerald-500/10 border border-emerald-500/20">
                <CheckCircle2 className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                <span>
                  {t("If an account with that email exists, a password reset link has been sent. The link expires in 1 hour.")}
                </span>
              </div>
              <button
                type="button"
                onClick={backToCredentials}
                className="w-full text-center text-xs hover:underline"
                style={{ color: "var(--text-muted)" }}
              >
                {t("Back to sign in")}
              </button>
            </div>
          ) : (
            <form onSubmit={handleForgot} className="space-y-4">
              <div>
                <label
                  className="block text-xs font-medium mb-1"
                  style={{ color: "var(--text-muted)" }}
                >
                  {t("Email Address")}
                </label>
                <input
                  type="email"
                  required
                  autoComplete="username"
                  autoFocus
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="admin@example.com"
                  className="w-full px-3 py-2 text-xs bg-transparent rounded-xl focus:outline-none transition-colors"
                  style={{
                    borderColor: "var(--border)",
                    borderWidth: "1px",
                    borderStyle: "solid",
                    color: "var(--text)",
                  }}
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 mt-2 font-semibold text-xs rounded-xl transition-all disabled:opacity-50 hover:opacity-90 text-white inline-flex items-center justify-center gap-2"
                style={{ backgroundColor: "var(--primary)" }}
              >
                {loading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                {loading ? t("Sending...") : t("Send Reset Link")}
              </button>

              <button
                type="button"
                onClick={backToCredentials}
                className="w-full text-center text-xs hover:underline"
                style={{ color: "var(--text-muted)" }}
              >
                {t("Back to sign in")}
              </button>
            </form>
          )
        ) : step === "code" ? (
          <form onSubmit={handleVerify} className="space-y-4">
            <div>
              <label
                className="block text-xs font-medium mb-1"
                style={{ color: "var(--text-muted)" }}
              >
                {t("Verification Code")}
              </label>
              <input
                type="text"
                required
                inputMode="numeric"
                autoComplete="one-time-code"
                autoFocus
                maxLength={6}
                pattern="[0-9]{6}"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                placeholder="123456"
                className="w-full px-3 py-2 text-center text-sm tracking-[0.4em] bg-transparent rounded-xl focus:outline-none transition-colors"
                style={{
                  borderColor: "var(--border)",
                  borderWidth: "1px",
                  borderStyle: "solid",
                  color: "var(--text)",
                }}
              />
            </div>

            <button
              type="submit"
              disabled={loading || code.length !== 6}
              className="w-full py-2.5 mt-2 font-semibold text-xs rounded-xl transition-all disabled:opacity-50 hover:opacity-90 text-white inline-flex items-center justify-center gap-2"
              style={{ backgroundColor: "var(--primary)" }}
            >
              {loading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              {loading ? t("Verifying...") : t("Verify & Sign In")}
            </button>

            <button
              type="button"
              onClick={backToCredentials}
              className="w-full text-center text-xs hover:underline"
              style={{ color: "var(--text-muted)" }}
            >
              {t("Back to sign in")}
            </button>
          </form>
        ) : step === "setup" ? (
          <form onSubmit={handleConfirmEnrolment} className="space-y-4">
            {setupLoading || !setupData ? (
              <div className="flex items-center justify-center gap-2 py-6 text-xs" style={{ color: "var(--text-muted)" }}>
                <Loader2 className="w-4 h-4 animate-spin" />
                {t("Preparing your authenticator setup...")}
              </div>
            ) : (
              <>
                <div className="flex justify-center">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={setupData.qrCode}
                    alt={t("Two-factor authentication QR code")}
                    className="w-44 h-44 rounded-xl"
                    style={{ borderColor: "var(--border)", borderWidth: "1px", borderStyle: "solid" }}
                  />
                </div>

                <div>
                  <label
                    className="block text-xs font-medium mb-1"
                    style={{ color: "var(--text-muted)" }}
                  >
                    {t("Or enter this key manually")}
                  </label>
                  <div
                    className="flex items-center gap-2 px-3 py-2 rounded-xl"
                    style={{ borderColor: "var(--border)", borderWidth: "1px", borderStyle: "solid" }}
                  >
                    <code className="flex-1 text-[11px] break-all" style={{ color: "var(--text)" }}>
                      {setupData.secret}
                    </code>
                    <button
                      type="button"
                      onClick={() => void copySetupSecret()}
                      aria-label={t("Copy setup key")}
                      className="shrink-0 rounded-md p-1 hover:opacity-80"
                      style={{ color: "var(--text-muted)" }}
                    >
                      {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>

                <div>
                  <label
                    className="block text-xs font-medium mb-1"
                    style={{ color: "var(--text-muted)" }}
                  >
                    {t("Verification Code")}
                  </label>
                  <input
                    type="text"
                    required
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    autoFocus
                    maxLength={6}
                    pattern="[0-9]{6}"
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                    placeholder="123456"
                    className="w-full px-3 py-2 text-center text-sm tracking-[0.4em] bg-transparent rounded-xl focus:outline-none transition-colors"
                    style={{
                      borderColor: "var(--border)",
                      borderWidth: "1px",
                      borderStyle: "solid",
                      color: "var(--text)",
                    }}
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading || code.length !== 6}
                  className="w-full py-2.5 mt-2 font-semibold text-xs rounded-xl transition-all disabled:opacity-50 hover:opacity-90 text-white inline-flex items-center justify-center gap-2"
                  style={{ backgroundColor: "var(--primary)" }}
                >
                  {loading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  {loading ? t("Verifying...") : t("Confirm & Sign In")}
                </button>
              </>
            )}

            <button
              type="button"
              onClick={backToCredentials}
              className="w-full text-center text-xs hover:underline"
              style={{ color: "var(--text-muted)" }}
            >
              {t("Back to sign in")}
            </button>
          </form>
        ) : (
        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label
              className="block text-xs font-medium mb-1"
              style={{ color: "var(--text-muted)" }}
            >
              {t("Email Address")}
            </label>
            <input
              type="email"
              required
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="admin@example.com"
              className="w-full px-3 py-2 text-xs bg-transparent rounded-xl focus:outline-none transition-colors"
              style={{
                borderColor: "var(--border)",
                borderWidth: "1px",
                borderStyle: "solid",
                color: "var(--text)",
              }}
            />
          </div>

          <div>
            <label
              className="block text-xs font-medium mb-1"
              style={{ color: "var(--text-muted)" }}
            >
              {t("Password")}
            </label>
            <input
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full px-3 py-2 text-xs bg-transparent rounded-xl focus:outline-none transition-colors"
              style={{
                borderColor: "var(--border)",
                borderWidth: "1px",
                borderStyle: "solid",
                color: "var(--text)",
              }}
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 mt-2 font-semibold text-xs rounded-xl transition-all disabled:opacity-50 hover:opacity-90 text-white inline-flex items-center justify-center gap-2"
            style={{ backgroundColor: "var(--primary)" }}
          >
            {loading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            {loading ? t("Authenticating...") : t("Login")}
          </button>

          <button
            type="button"
            onClick={() => {
              setStep("forgot");
              setForgotSent(false);
              setError("");
            }}
            className="w-full text-center text-xs hover:underline"
            style={{ color: "var(--text-muted)" }}
          >
            {t("Forgot password?")}
          </button>
        </form>
        )}
      </div>
    </div>
  );
};

export default AdminLoginPopup;
