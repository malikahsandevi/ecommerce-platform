/**
 * Time zone options for Settings → General.
 *
 * The full IANA list comes from the runtime (Intl.supportedValuesOf —
 * ~420 zones), each labelled with its current UTC offset, e.g.
 * "Asia/Karachi (UTC+05:00)". The stored value is the IANA name itself.
 */

export interface TimeZoneOption {
  label: string;
  value: string;
}

export const DEFAULT_TIME_ZONE = "Asia/Karachi";

const FALLBACK_ZONES = [
  "UTC",
  "Asia/Karachi",
  "Asia/Dubai",
  "Asia/Kolkata",
  "Asia/Dhaka",
  "Europe/London",
  "Europe/Berlin",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "Australia/Sydney",
];

function offsetLabel(timeZone: string): string {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      timeZoneName: "shortOffset",
    }).formatToParts(new Date());
    const raw = parts.find((p) => p.type === "timeZoneName")?.value || "GMT";
    // ICU builds differ: "GMT+05:00", "GMT+5", "GMT-04:00", plain "GMT".
    // Normalize all of them to a zero-padded "UTC±HH:MM".
    const match = raw.match(/^GMT(?:([+-])(\d{1,2})(?::(\d{2}))?)?$/);
    if (!match || !match[1]) return "UTC+00:00";
    const hours = match[2].padStart(2, "0");
    const minutes = (match[3] || "00").padStart(2, "0");
    return `UTC${match[1]}${hours}:${minutes}`;
  } catch {
    return "";
  }
}

let cachedOptions: TimeZoneOption[] | null = null;

export function getTimeZoneOptions(): TimeZoneOption[] {
  if (cachedOptions) return cachedOptions;
  let zones: string[] = [];
  try {
    const supported = (
      Intl as unknown as { supportedValuesOf?: (key: string) => string[] }
    ).supportedValuesOf?.("timeZone");
    if (Array.isArray(supported) && supported.length > 0) zones = supported;
  } catch {
    /* fall through to the fallback list */
  }
  if (zones.length === 0) zones = FALLBACK_ZONES;
  if (!zones.includes("UTC")) zones = ["UTC", ...zones];

  cachedOptions = zones.map((zone) => {
    const offset = offsetLabel(zone);
    return {
      value: zone,
      label: offset ? `${zone} (${offset})` : zone,
    };
  });
  return cachedOptions;
}

/**
 * Maps a stored value to a valid IANA zone. Older builds stored display
 * labels ("(GMT+05:00) Pakistan Standard Time"); empty/unrecognized
 * values fall back to the default zone.
 */
export function resolveTimeZoneValue(stored: unknown): string {
  const raw = String(stored ?? "").trim();
  if (!raw) return DEFAULT_TIME_ZONE;
  const zones = new Set(getTimeZoneOptions().map((o) => o.value));
  if (zones.has(raw)) return raw;
  if (/pakistan/i.test(raw)) return "Asia/Karachi";
  if (/utc|gmt\+00:00/i.test(raw)) return "UTC";
  return DEFAULT_TIME_ZONE;
}
