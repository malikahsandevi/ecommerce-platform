"use client";

import React from "react";
import { ExternalLink } from "lucide-react";
import { STOREFRONT_URL } from "@/config/site";
import { useLanguage } from "@/services/i18n";

// Small pill link to the live storefront, shown beside the Dashboard
// title (Ahsan, 2026-11-26). Always opens in a NEW TAB. Styled after
// the admin's existing rounded-full tag chips; colours come from the
// palette tokens so it follows every palette + dark/light mode.
export const ViewSiteTag = () => {
  const { t } = useLanguage();
  return (
    <a
      href={STOREFRONT_URL}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full border border-(--border) bg-(--surface-muted) px-2.5 py-1 text-[11px] font-semibold text-(--text-muted) transition-colors hover:border-(--primary) hover:text-(--primary)"
    >
      <ExternalLink className="h-3 w-3" aria-hidden="true" />
      {t("View Site")}
    </a>
  );
};

export default ViewSiteTag;
