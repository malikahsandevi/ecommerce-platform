"use client";

// Admin language (Settings → General → Language) — a real i18n layer,
// not just a stored value. The choice lives in the settings document
// (general.language, stored as the language's English label), is
// cached on the device (localStorage "admin-language" + the
// "language" cookie, exactly like the theme) so the root layout can
// render <html lang dir> correctly on first paint, and is applied by
// AdminShell once signed in via fetchAndApplyLanguage().
//
// SCOPE: the dictionary (services/i18n-dict.ts) covers the WHOLE
// admin — shell, dashboard, every resource list/form/detail panel,
// all of Settings, media tooling, popups and toast templates. Every
// user-visible UI string goes through t(); data values (names,
// emails, product titles, SKUs, numbers, dates, timezone/currency
// option values) are never translated. t() falls back to the English
// key itself, so an untranslated key degrades to English, never to a
// blank.
//
// DIRECTION: text translates IN PLACE, exactly where it sits — the
// layout and direction NEVER change (always LTR, same positions),
// for every language including Urdu and Arabic (Ahsan's correction:
// flipping the layout would make the panel hard to manage).
import React, { createContext, useContext, useEffect, useState } from "react";
import { apiClient } from "./api";

export interface LanguageDef {
  label: string;
  code: string;
}

export const LANGUAGES: LanguageDef[] = [
  { label: "English", code: "en" },
  { label: "Urdu", code: "ur" },
  { label: "Arabic", code: "ar" },
  { label: "Hindi", code: "hi" },
  { label: "Bengali", code: "bn" },
  { label: "Spanish", code: "es" },
  { label: "French", code: "fr" },
  { label: "German", code: "de" },
  { label: "Turkish", code: "tr" },
  { label: "Chinese (Simplified)", code: "zh" },
];

export const LANGUAGE_OPTIONS = LANGUAGES.map((language) => language.label);

export const languageByLabel = (label?: string | null): LanguageDef =>
  LANGUAGES.find((language) => language.label === label) ?? LANGUAGES[0];

const STORAGE_KEY = "admin-language";
export const LANGUAGE_EVENT = "admin:language";

/** The device-cached language label (what the pre-paint script and
 *  the provider start from, before the settings fetch resolves). */
export function readDeviceLanguage(): string {
  try {
    return localStorage.getItem(STORAGE_KEY) || "English";
  } catch {
    return "English";
  }
}

/** Applies a language everywhere it must land: the <html lang>
 *  attribute, the device cache + cookie (so the next load renders it
 *  server-side), and every mounted useLanguage() consumer via the
 *  event. The layout direction is NEVER touched — text changes in
 *  place, positions stay identical. */
export function applyLanguage(label: string) {
  const def = languageByLabel(label);
  try {
    localStorage.setItem(STORAGE_KEY, def.label);
  } catch { /* private mode — the cookie below still carries it */ }
  document.cookie = `language=${encodeURIComponent(def.label)}; path=/; max-age=31536000; SameSite=Lax`;
  document.documentElement.setAttribute("lang", def.code);
  window.dispatchEvent(new CustomEvent(LANGUAGE_EVENT, { detail: def.label }));
}

/** Loads the saved language from the settings document and applies
 *  it (called once signed in, like Appearance and Currency). */
export async function fetchAndApplyLanguage(): Promise<void> {
  try {
    const { data } = await apiClient.get<{ general?: { language?: string } }>("/settings");
    const saved = data?.general?.language;
    if (saved && saved !== readDeviceLanguage()) applyLanguage(saved);
  } catch { /* keep the device language */ }
}

import { T } from "./i18n-dict";

export function translate(label: string, key: string): string {
  const def = languageByLabel(label);
  if (def.code === "en") return key;
  return T[key]?.[def.code] ?? key;
}

// ── React wiring ─────────────────────────────────────────────────────
interface LanguageContextValue {
  language: string;
  def: LanguageDef;
  t: (key: string) => string;
}

const LanguageContext = createContext<LanguageContextValue>({
  language: "English",
  def: LANGUAGES[0],
  t: (key) => key,
});

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguage] = useState<string>("English");

  useEffect(() => {
    setLanguage(readDeviceLanguage());
    const onChange = (event: Event) => {
      setLanguage((event as CustomEvent<string>).detail || readDeviceLanguage());
    };
    window.addEventListener(LANGUAGE_EVENT, onChange);
    return () => window.removeEventListener(LANGUAGE_EVENT, onChange);
  }, []);

  const def = languageByLabel(language);
  return (
    <LanguageContext.Provider
      value={{ language, def, t: (key: string) => translate(language, key) }}
    >
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage(): LanguageContextValue {
  return useContext(LanguageContext);
}
