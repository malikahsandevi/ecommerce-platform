"use client";

import { useEffect, useState } from "react";
import { apiClient } from "./api";

/**
 * Store currency (Settings → General → Store Currency).
 *
 * The setting holds an ISO 4217 code. Every money figure in the panel is
 * formatted through here so the whole admin follows the one setting.
 * Amounts are stored as plain numbers — switching currency changes the
 * symbol/format ONLY, never the numbers (no conversion).
 *
 * Mirrors the Appearance plumbing (services/appearance.ts): the shell
 * fetches the settings document once signed in and applies the currency;
 * components either read the active symbol via the formatters at render
 * time or subscribe with useStoreCurrency() when they map data.
 */

export interface CurrencyInfo {
  code: string;
  name: string;
  symbol: string;
}

// The active ISO 4217 currencies: [code, name, symbol]. Where a currency
// has no distinct sign, the code itself is the symbol.
const CURRENCY_ROWS: Array<[string, string, string]> = [
  ["AED", "United Arab Emirates Dirham", "AED"],
  ["AFN", "Afghan Afghani", "؋"],
  ["ALL", "Albanian Lek", "L"],
  ["AMD", "Armenian Dram", "֏"],
  ["ANG", "Netherlands Antillean Guilder", "ƒ"],
  ["AOA", "Angolan Kwanza", "Kz"],
  ["ARS", "Argentine Peso", "$"],
  ["AUD", "Australian Dollar", "$"],
  ["AWG", "Aruban Florin", "ƒ"],
  ["AZN", "Azerbaijani Manat", "₼"],
  ["BAM", "Bosnia-Herzegovina Convertible Mark", "KM"],
  ["BBD", "Barbadian Dollar", "$"],
  ["BDT", "Bangladeshi Taka", "৳"],
  ["BGN", "Bulgarian Lev", "лв"],
  ["BHD", "Bahraini Dinar", "BHD"],
  ["BIF", "Burundian Franc", "BIF"],
  ["BMD", "Bermudian Dollar", "$"],
  ["BND", "Brunei Dollar", "$"],
  ["BOB", "Bolivian Boliviano", "Bs"],
  ["BRL", "Brazilian Real", "R$"],
  ["BSD", "Bahamian Dollar", "$"],
  ["BTN", "Bhutanese Ngultrum", "BTN"],
  ["BWP", "Botswana Pula", "P"],
  ["BYN", "Belarusian Ruble", "Br"],
  ["BZD", "Belize Dollar", "$"],
  ["CAD", "Canadian Dollar", "$"],
  ["CDF", "Congolese Franc", "CDF"],
  ["CHF", "Swiss Franc", "CHF"],
  ["CLP", "Chilean Peso", "$"],
  ["CNY", "Chinese Yuan", "¥"],
  ["COP", "Colombian Peso", "$"],
  ["CRC", "Costa Rican Colón", "₡"],
  ["CUP", "Cuban Peso", "$"],
  ["CVE", "Cape Verdean Escudo", "$"],
  ["CZK", "Czech Koruna", "Kč"],
  ["DJF", "Djiboutian Franc", "DJF"],
  ["DKK", "Danish Krone", "kr"],
  ["DOP", "Dominican Peso", "$"],
  ["DZD", "Algerian Dinar", "DZD"],
  ["EGP", "Egyptian Pound", "£"],
  ["ERN", "Eritrean Nakfa", "ERN"],
  ["ETB", "Ethiopian Birr", "ETB"],
  ["EUR", "Euro", "€"],
  ["FJD", "Fijian Dollar", "$"],
  ["FKP", "Falkland Islands Pound", "£"],
  ["GBP", "British Pound", "£"],
  ["GEL", "Georgian Lari", "₾"],
  ["GHS", "Ghanaian Cedi", "₵"],
  ["GIP", "Gibraltar Pound", "£"],
  ["GMD", "Gambian Dalasi", "GMD"],
  ["GNF", "Guinean Franc", "GNF"],
  ["GTQ", "Guatemalan Quetzal", "Q"],
  ["GYD", "Guyanese Dollar", "$"],
  ["HKD", "Hong Kong Dollar", "$"],
  ["HNL", "Honduran Lempira", "L"],
  ["HTG", "Haitian Gourde", "HTG"],
  ["HUF", "Hungarian Forint", "Ft"],
  ["IDR", "Indonesian Rupiah", "Rp"],
  ["ILS", "Israeli Shekel", "₪"],
  ["INR", "Indian Rupee", "₹"],
  ["IQD", "Iraqi Dinar", "IQD"],
  ["IRR", "Iranian Rial", "IRR"],
  ["ISK", "Icelandic Króna", "kr"],
  ["JMD", "Jamaican Dollar", "$"],
  ["JOD", "Jordanian Dinar", "JOD"],
  ["JPY", "Japanese Yen", "¥"],
  ["KES", "Kenyan Shilling", "KSh"],
  ["KGS", "Kyrgyzstani Som", "KGS"],
  ["KHR", "Cambodian Riel", "៛"],
  ["KMF", "Comorian Franc", "KMF"],
  ["KPW", "North Korean Won", "₩"],
  ["KRW", "South Korean Won", "₩"],
  ["KWD", "Kuwaiti Dinar", "KWD"],
  ["KYD", "Cayman Islands Dollar", "$"],
  ["KZT", "Kazakhstani Tenge", "₸"],
  ["LAK", "Lao Kip", "₭"],
  ["LBP", "Lebanese Pound", "LBP"],
  ["LKR", "Sri Lankan Rupee", "Rs"],
  ["LRD", "Liberian Dollar", "$"],
  ["LSL", "Lesotho Loti", "LSL"],
  ["LYD", "Libyan Dinar", "LYD"],
  ["MAD", "Moroccan Dirham", "MAD"],
  ["MDL", "Moldovan Leu", "MDL"],
  ["MGA", "Malagasy Ariary", "MGA"],
  ["MKD", "Macedonian Denar", "MKD"],
  ["MMK", "Myanmar Kyat", "MMK"],
  ["MNT", "Mongolian Tögrög", "₮"],
  ["MOP", "Macanese Pataca", "MOP"],
  ["MRU", "Mauritanian Ouguiya", "MRU"],
  ["MUR", "Mauritian Rupee", "Rs"],
  ["MVR", "Maldivian Rufiyaa", "MVR"],
  ["MWK", "Malawian Kwacha", "MWK"],
  ["MXN", "Mexican Peso", "$"],
  ["MYR", "Malaysian Ringgit", "RM"],
  ["MZN", "Mozambican Metical", "MT"],
  ["NAD", "Namibian Dollar", "$"],
  ["NGN", "Nigerian Naira", "₦"],
  ["NIO", "Nicaraguan Córdoba", "C$"],
  ["NOK", "Norwegian Krone", "kr"],
  ["NPR", "Nepalese Rupee", "Rs"],
  ["NZD", "New Zealand Dollar", "$"],
  ["OMR", "Omani Rial", "OMR"],
  ["PAB", "Panamanian Balboa", "B/."],
  ["PEN", "Peruvian Sol", "S/"],
  ["PGK", "Papua New Guinean Kina", "PGK"],
  ["PHP", "Philippine Peso", "₱"],
  ["PKR", "Pakistani Rupee", "Rs"],
  ["PLN", "Polish Złoty", "zł"],
  ["PYG", "Paraguayan Guaraní", "₲"],
  ["QAR", "Qatari Riyal", "QAR"],
  ["RON", "Romanian Leu", "lei"],
  ["RSD", "Serbian Dinar", "RSD"],
  ["RUB", "Russian Ruble", "₽"],
  ["RWF", "Rwandan Franc", "RWF"],
  ["SAR", "Saudi Riyal", "SAR"],
  ["SBD", "Solomon Islands Dollar", "$"],
  ["SCR", "Seychellois Rupee", "SCR"],
  ["SDG", "Sudanese Pound", "SDG"],
  ["SEK", "Swedish Krona", "kr"],
  ["SGD", "Singapore Dollar", "$"],
  ["SHP", "Saint Helena Pound", "£"],
  ["SLE", "Sierra Leonean Leone", "SLE"],
  ["SOS", "Somali Shilling", "SOS"],
  ["SRD", "Surinamese Dollar", "$"],
  ["SSP", "South Sudanese Pound", "SSP"],
  ["STN", "São Tomé and Príncipe Dobra", "STN"],
  ["SYP", "Syrian Pound", "SYP"],
  ["SZL", "Swazi Lilangeni", "SZL"],
  ["THB", "Thai Baht", "฿"],
  ["TJS", "Tajikistani Somoni", "TJS"],
  ["TMT", "Turkmenistani Manat", "TMT"],
  ["TND", "Tunisian Dinar", "TND"],
  ["TOP", "Tongan Paʻanga", "TOP"],
  ["TRY", "Turkish Lira", "₺"],
  ["TTD", "Trinidad and Tobago Dollar", "$"],
  ["TWD", "Taiwan Dollar", "$"],
  ["TZS", "Tanzanian Shilling", "TZS"],
  ["UAH", "Ukrainian Hryvnia", "₴"],
  ["UGX", "Ugandan Shilling", "UGX"],
  ["USD", "US Dollar", "$"],
  ["UYU", "Uruguayan Peso", "$"],
  ["UZS", "Uzbekistani Som", "UZS"],
  ["VES", "Venezuelan Bolívar", "VES"],
  ["VND", "Vietnamese Đồng", "₫"],
  ["VUV", "Vanuatu Vatu", "VUV"],
  ["WST", "Samoan Tala", "WST"],
  ["XAF", "Central African CFA Franc", "XAF"],
  ["XCD", "East Caribbean Dollar", "$"],
  ["XOF", "West African CFA Franc", "XOF"],
  ["XPF", "CFP Franc", "XPF"],
  ["YER", "Yemeni Rial", "YER"],
  ["ZAR", "South African Rand", "R"],
  ["ZMW", "Zambian Kwacha", "ZMW"],
  ["ZWL", "Zimbabwean Dollar", "ZWL"],
];

export const CURRENCIES: CurrencyInfo[] = CURRENCY_ROWS.map(
  ([code, name, symbol]) => ({ code, name, symbol }),
);

const CURRENCY_BY_CODE = new Map(CURRENCIES.map((c) => [c.code, c]));

export const DEFAULT_CURRENCY = "USD";

export function currencyInfo(code: string | undefined | null): CurrencyInfo {
  return (
    CURRENCY_BY_CODE.get(String(code || "").toUpperCase()) ||
    CURRENCY_BY_CODE.get(DEFAULT_CURRENCY)!
  );
}

export function currencySymbolFor(code: string | undefined | null): string {
  return currencyInfo(code).symbol;
}

/** Dropdown options for the Store Currency picker: "USD — US Dollar". */
export const CURRENCY_OPTIONS = CURRENCIES.map((c) => ({
  label: `${c.code} — ${c.name}`,
  value: c.code,
}));

// ---------------------------------------------------------------------------
// Active currency state. The module value is the runtime truth; a
// localStorage mirror lets the first render after a reload already use
// the saved currency, and an event lets mounted components re-render /
// re-map when it changes.
// ---------------------------------------------------------------------------

export const STORE_CURRENCY_EVENT = "admin:currency";
const STORAGE_KEY = "admin-currency";

let activeCurrency: string | null = null;

export function getStoreCurrencyCode(): string {
  if (activeCurrency) return activeCurrency;
  if (typeof window !== "undefined") {
    try {
      const cached = window.localStorage.getItem(STORAGE_KEY);
      if (cached && CURRENCY_BY_CODE.has(cached)) return cached;
    } catch {
      /* storage unavailable — fall through to the default */
    }
  }
  return DEFAULT_CURRENCY;
}

export function getCurrencySymbol(): string {
  return currencySymbolFor(getStoreCurrencyCode());
}

export function applyStoreCurrency(code: string | undefined | null): void {
  const next = currencyInfo(code).code;
  activeCurrency = next;
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* non-fatal */
    }
    window.dispatchEvent(new Event(STORE_CURRENCY_EVENT));
  }
}

/** Loads the store currency once and applies it. Reads the shell
 *  bootstrap slice (GET /settings/bootstrap) — the full settings
 *  document requires Settings view, but the currency formats money
 *  panel-wide for every staff session. */
export async function fetchAndApplyStoreCurrency(): Promise<void> {
  try {
    const { data } = await apiClient.get("/settings/bootstrap");
    applyStoreCurrency(data?.general?.currency);
  } catch {
    /* settings may be unreachable — the panel keeps its cached default */
  }
}

/** Subscribes a component to the active currency code. */
export function useStoreCurrency(): string {
  const [code, setCode] = useState<string>(() => getStoreCurrencyCode());
  useEffect(() => {
    const update = () => setCode(getStoreCurrencyCode());
    update();
    window.addEventListener(STORE_CURRENCY_EVENT, update);
    window.addEventListener("storage", update);
    return () => {
      window.removeEventListener(STORE_CURRENCY_EVENT, update);
      window.removeEventListener("storage", update);
    };
  }, []);
  return code;
}

// ---------------------------------------------------------------------------
// Formatters — all read the ACTIVE currency at call time.
// ---------------------------------------------------------------------------

function withSymbol(symbol: string, digits: string): string {
  // Letter symbols ("Rs", "KSh", "CHF") read better with a space; sign
  // symbols ("$", "€", "₹") attach directly, as the panel has always done.
  const needsSpace = symbol.length > 1 && /\p{L}/u.test(symbol);
  return needsSpace ? `${symbol} ${digits}` : `${symbol}${digits}`;
}

/** Whole amounts by default: "$1,130" / "Rs 1,130". Pass decimals for
 *  exact figures (tables, order details): "$60.00" / "Rs 60.00". */
export function formatMoney(value: number, decimals = 0): string {
  const num = Number(value || 0);
  const digits =
    decimals > 0
      ? num.toLocaleString(undefined, {
          minimumFractionDigits: decimals,
          maximumFractionDigits: decimals,
        })
      : Math.round(num).toLocaleString();
  return withSymbol(getCurrencySymbol(), digits);
}

/** Chart-axis style: "$1.1K" / "Rs 1.1K" at 1000+, plain below. */
export function formatMoneyCompact(value: number): string {
  const num = Number(value || 0);
  if (Math.abs(num) >= 1000) {
    return withSymbol(getCurrencySymbol(), `${Math.round(num / 100) / 10}K`);
  }
  return formatMoney(num);
}
