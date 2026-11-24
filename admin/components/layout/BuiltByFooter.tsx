import React from "react";

/**
 * The credit line Ahsan asked for at the bottom of EVERY admin page
 * ("har page ky nichy"): one shared component so the line is identical
 * everywhere. Rendered by AdminShell after each page's own content —
 * inside the right content column only, in plain flow directly under
 * the page's last block (never a fixed/sticky overlay, never pushed
 * to the bottom of the window, and NO divider bar above the text —
 * Ahsan's placement order) — and after the card on the standalone
 * reset-password page. Theme variables only, so it follows every
 * palette in dark and light; the portfolio link sits on the name and
 * opens in a new tab.
 *
 * The component carries NO top margin and NO top padding of its own:
 * the visible gap above the text is exactly the page's own bottom
 * padding (the standard p-3 rhythm), so the line sits CLOSE under
 * the last content block — a footer mt-6 + py-4 stack used to add
 * 40px of extra air on top of that, which Ahsan flagged as too much
 * space ("line ky kareeb rakhna hai"). Bottom padding stays, so the
 * text never glues to the window's bottom edge on a scrolled page.
 */
export default function BuiltByFooter() {
  return (
    <footer className="px-3 pb-4 text-center text-[11px] leading-relaxed text-[var(--text-muted)]">
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
