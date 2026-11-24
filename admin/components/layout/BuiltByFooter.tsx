import React from "react";

/**
 * The credit line Ahsan asked for at the bottom of EVERY admin page
 * ("har page ky nichy"): one shared component so the line is identical
 * everywhere. Rendered by AdminShell after each page's own content
 * (plain flow — never a fixed/sticky overlay) and at the bottom of the
 * standalone reset-password page. Theme variables only, so it follows
 * every palette in dark and light; the portfolio link sits on the
 * name and opens in a new tab.
 */
export default function BuiltByFooter() {
  return (
    <footer className="mt-6 border-t border-[var(--border)] px-3 py-4 text-center text-[11px] leading-relaxed text-[var(--text-muted)]">
      This system is built by{" "}
      <a
        href="https://ahsan-ali-protfolio.vercel.app/"
        target="_blank"
        rel="noopener noreferrer"
        className="font-medium text-[var(--primary)] hover:underline"
      >
        Ahsan Ali
      </a>
    </footer>
  );
}
