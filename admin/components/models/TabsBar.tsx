import React from "react";
import Button from "../ui/Button";
import { useLanguage } from "@/services/i18n";

export interface TabItem {
  id: string;
  label: string;
  /** Optional record count shown after the label (Categories'
   *  Main/Sub tabs) — a plain number, never part of the translated
   *  label itself. */
  count?: number;
}

export interface HeaderActionButton {
  id: string;
  label: string;
  icon?: React.ElementType;
  variant?: "primary" | "secondary" | "ghost";
  disabled?: boolean;
}

interface TabsBarProps {
  tablist: (string | TabItem)[];
  activeTab: string;
  onTabChange: (tab: string) => void;
  btnlist?: HeaderActionButton[];
  onBtnClick?: (btnId: string) => void;
  /** Static label shown in the tabs' place (the page's "All …" wording),
   *  styled like the active tab but purely presentational: no click,
   *  no filtering, no hover state. */
  label?: string;
}

const TabsBar: React.FC<TabsBarProps> = ({
  tablist = [],
  activeTab,
  onTabChange,
  btnlist = [],
  onBtnClick,
  label,
}) => {
  const { t } = useLanguage();

  return (
    <div className="flex flex-col md:flex-row md:items-center justify-between gap-1 bg-[var(--surface)]">
      {/* Left Tabs Section */}
      <div className="flex items-center gap-3 flex-wrap">
        {label && (
          <span className="text-sm sm:text-md whitespace-nowrap relative pb-1 text-[var(--primary)] font-semibold">
            {t(label)}
            <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-[var(--primary)] rounded-full" />
          </span>
        )}
        {tablist.map((tab) => {
          const tabId = typeof tab === "string" ? tab : tab.id;
          const tabLabel = typeof tab === "string" ? tab : tab.label;
          const isActive = activeTab === tabId;

          return (
            <button
              key={tabId}
              onClick={() => onTabChange && onTabChange(tabId)}
              className={`text-sm sm:text-md whitespace-nowrap transition-all relative cursor-pointer pb-1 ${
                isActive
                  ? "text-[var(--primary)] font-semibold"
                  : "text-[var(--text-muted)] hover:text-[var(--text)]"
              }`}
            >
              {t(tabLabel)}
              {typeof tab !== "string" && tab.count !== undefined && (
                <span className="ml-1.5 text-[11px] font-bold text-[var(--text-muted)]">
                  {tab.count}
                </span>
              )}
              {isActive && (
                <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-[var(--primary)] rounded-full" />
              )}
            </button>
          );
        })}
      </div>

      {/* Right Buttons Section */}
      {btnlist.length > 0 && (
        <div className="flex w-full flex-wrap md:w-auto items-center gap-3 sm:gap-3">
          {btnlist.map((btn) => (
            <Button
              key={btn.id}
              variant={btn.variant || "secondary"}
              size="md"
              icon={btn.icon}
              disabled={btn.disabled}
              className="flex-1 px-[8.2px] md:flex-none whitespace-nowrap"
              onClick={() => onBtnClick && onBtnClick(btn.id)}
            >
              {t(btn.label)}
            </Button>
          ))}
        </div>
      )}
    </div>
  );
};

export default TabsBar;