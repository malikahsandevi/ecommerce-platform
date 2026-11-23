"use client";

import { useRef, useState, type InputHTMLAttributes, type ReactNode } from "react";
import { useLanguage } from "@/services/i18n";
import { Eye, EyeOff, LoaderCircle, Save } from "lucide-react";
import Button from "@/components/ui/Button";
import Select from "@/components/ui/Select";
import { StepperButtons, steppedValue } from "@/components/ui/NumberStepper";

export function SettingsCard({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  const { t } = useLanguage();
  return (
    <section className="rounded-xl border border-[var(--border)] bg-[var(--background)] p-5 lg:p-6">
      <header className="mb-6">
        <h2 className="text-base font-semibold text-[var(--text)]">{t(title)}</h2>
        <p className="mt-1 text-xs text-[var(--text-muted)]">{t(description)}</p>
      </header>
      {children}
    </section>
  );
}

export function SettingsInput({
  label,
  className = "",
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  const { t } = useLanguage();
  const inputRef = useRef<HTMLInputElement>(null);
  const isNumber = props.type === "number";
  // Password fields get a show/hide eye toggle at the field's right
  // edge (Ahsan's order): it flips THIS field only between
  // type="password" and type="text". The autocomplete semantics are
  // computed from the DECLARED type below, so revealing the value
  // never changes the field's autofill behaviour.
  const isPassword = props.type === "password";
  const [showPassword, setShowPassword] = useState(false);
  const effectiveType = isPassword && showPassword ? "text" : props.type;

  // Custom steppers for number inputs: compute the stepped value, write
  // it through the native setter and fire a real input event, so the
  // caller's existing onChange (which reads event.target.value) runs
  // exactly as if the value had been typed.
  const handleStep = (dir: 1 | -1) => {
    const input = inputRef.current;
    if (!input) return;
    const step =
      props.step === "any" ? 1 : Number(props.step ?? 1) || 1;
    const min = props.min !== undefined ? Number(props.min) : undefined;
    const max = props.max !== undefined ? Number(props.max) : undefined;
    const next = steppedValue(input.value, dir, step, min, max);
    const setter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      "value",
    )?.set;
    setter?.call(input, String(next));
    input.dispatchEvent(new Event("input", { bubbles: true }));
  };

  return (
    <label className={`block ${className}`}>
      <span className="mb-2 block text-xs font-medium text-[var(--text-soft)]">{t(label)}</span>
      <span className="relative block">
        <input
          ref={inputRef}
          {...props}
          type={effectiveType}
          placeholder={typeof props.placeholder === "string" ? t(props.placeholder) : props.placeholder}
          // AUTOFILL IS OFF across the whole Settings panel (Ahsan's
          // order): the browser must never suggest or populate saved
          // values in a Settings field. Password-type (credential)
          // inputs use "new-password" — the value browsers actually
          // honour for password fields — everything else gets "off".
          // An explicitly-passed value (the 2FA code's "one-time-code")
          // is respected; nothing may pass "on".
          autoComplete={props.autoComplete ?? (props.type === "password" ? "new-password" : "off")}
          spellCheck={false}
          autoCorrect="off"
          autoCapitalize="off"
          className={`h-10 w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 text-sm text-[var(--text)] outline-none transition focus:border-[var(--primary)] focus:ring-2 focus:ring-[var(--primary-light)] ${isNumber ? "pr-7" : ""} ${isPassword ? "pr-10" : ""}`}
        />
        {isNumber && (
          <StepperButtons onStep={handleStep} disabled={props.disabled} />
        )}
        {isPassword && (
          <button
            type="button"
            aria-label={t(showPassword ? "Hide password" : "Show password")}
            onClick={() => setShowPassword((visible) => !visible)}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-[var(--text-muted)] transition-colors hover:text-[var(--text)]"
          >
            {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        )}
      </span>
    </label>
  );
}

export function SettingsSelect({
  label,
  value,
  options,
  onChange,
  placeholder,
  searchable = false,
  searchPlaceholder,
}: {
  label: string;
  value: string;
  options: Array<string | { label: string; value: string }>;
  onChange: (value: string) => void;
  placeholder?: string;
  searchable?: boolean;
  searchPlaceholder?: string;
}) {
  const { t } = useLanguage();
  return (
    <div>
      <span className="mb-2 block text-xs font-medium text-[var(--text-soft)]">{t(label)}</span>
      <Select
        value={value}
        options={options.map((option) =>
          // String options are UI enums (themes, auth types, methods):
          // their DISPLAY label translates, the value stays English.
          // Object options carry data labels (timezones, currencies)
          // and pass through untouched.
          typeof option === "string" ? { label: t(option), value: option } : option,
        )}
        onChange={onChange}
        placeholder={placeholder ? t(placeholder) : placeholder}
        variant="outline"
        fullWidth
        // Settings selects sit beside SettingsInput fields and must
        // match them EXACTLY: h-10 height, px-3 padding, text-sm —
        // the input's own geometry (Ahsan flagged the dropdown
        // rendering bigger than the neighbouring input).
        triggerClassName="h-10 px-3"
        searchable={searchable}
        searchPlaceholder={searchPlaceholder ? t(searchPlaceholder) : searchPlaceholder}
      />
    </div>
  );
}

export function SettingsToggle({
  label,
  enabled,
  onChange,
}: {
  label: string;
  enabled: boolean;
  onChange: (enabled: boolean) => void;
}) {
  const { t } = useLanguage();
  return (
    <button
      type="button"
      role="switch"
      aria-checked={enabled}
      aria-label={t(label)}
      onClick={() => onChange(!enabled)}
      className={`relative h-5 w-9 shrink-0 rounded-full transition ${
        enabled ? "bg-[var(--primary)]" : "bg-[var(--border)]"
      }`}
    >
      <span
        className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition ${
          enabled ? "left-4" : "left-0.5"
        }`}
      />
    </button>
  );
}

export function SettingsSectionTitle({ title }: { title: string }) {
  const { t } = useLanguage();
  return <h3 className="text-sm font-semibold text-[var(--text)]">{t(title)}</h3>;
}

export function SettingsSaveButton({
  onSave,
  saving = false,
}: {
  onSave: () => void;
  saving?: boolean;
}) {
  const { t } = useLanguage();
  return (
    <div className="mt-6 flex justify-end border-t border-[var(--border)] pt-5">
      <Button onClick={onSave} disabled={saving} icon={saving ? LoaderCircle : Save}>
        {saving ? t("Saving...") : t("Save Changes")}
      </Button>
    </div>
  );
}