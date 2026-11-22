"use client";

import React, { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  MessageSquare,
  Bell,
  ChevronDown,
  LogOut,
  PackageX,
  TriangleAlert,
  ShoppingCart,
  Star,
  UserPlus,
  BellRing,
} from "lucide-react";
import SearchBar, { SearchableEntityRecord } from "@/components/ui/SearchBar";
import GlobalSearch from "@/components/ui/GlobalSearch";
import ThemeToggle from "@/components/models/ThemeToggle";
import { useAdminAuth } from "@/services/authContext";
import {
  useNotifications,
  relativeTime,
  type FeedItem,
} from "@/services/notifications";

// Dynamic Interfaces
export interface UserProfile {
  name: string;
  role: string;
  avatar?: string;
  email?: string;
}

export interface NotificationItem {
  id: string;
  title: string;
  time: string;
  isUnread: boolean;
}

export interface MessageItem {
  id: string;
  sender: string;
  text: string;
  time: string;
  isUnread: boolean;
}

interface TopBarProps<T extends SearchableEntityRecord> {
  title: string;
  subtitle?: string;
  user: UserProfile;
  notifications?: NotificationItem[];
  messages?: MessageItem[];
  searchPlaceholder?: string;
  /** Render the global (all-sources) search instead of the legacy
   *  page-local SearchBar. */
  globalSearch?: boolean;
  // Generic Search Bar Props
  searchData?: T[];
  searchFields?: (keyof T)[];
  onSearchResults?: (results: T[]) => void;
}

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "A";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export const TopBar = <T extends SearchableEntityRecord>({
  title,
  subtitle,
  user,
  searchPlaceholder = "Search...",
  globalSearch = false,
  searchData = [],
  searchFields = [],
  onSearchResults,
}: TopBarProps<T>) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [activePopup, setActivePopup] = useState<"msg" | "notif" | "profile" | null>(null);
  const [failedAvatar, setFailedAvatar] = useState<string | null>(null);
  const { logout } = useAdminAuth();
  const router = useRouter();

  // Live bell + inbox feeds (real store data via /api/notifications).
  // The legacy `notifications`/`messages` props are no longer used —
  // the feeds come from the hook so every page stays current.
  const feed = useNotifications();
  // Ids that were unread when a panel was opened — the badge clears on
  // open (items are marked read), but the panel still dots the fresh
  // ones so the user can see what was new.
  const [freshIds, setFreshIds] = useState<Set<string>>(new Set());

  const openPanel = (panel: "msg" | "notif") => {
    if (activePopup === panel) {
      setActivePopup(null);
      return;
    }
    if (panel === "notif") {
      setFreshIds(new Set(feed.unreadBell.map((n) => n.id)));
      feed.markBellRead();
    } else {
      setFreshIds(new Set(feed.unreadInbox.map((m) => m.id)));
      feed.markInboxRead();
    }
    setActivePopup(panel);
  };

  const openFeedItem = (item: FeedItem) => {
    if (item.recordId) {
      try {
        sessionStorage.setItem(
          "openRecord",
          JSON.stringify({ path: item.path, id: item.recordId }),
        );
      } catch {
        /* storage blocked — navigation still happens */
      }
      window.dispatchEvent(new Event("admin:open-record"));
    }
    setActivePopup(null);
    router.push(item.path);
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setActivePopup(null);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Breadcrumb visibility comes from Settings → Appearance (default on).
  const [showBreadcrumbs, setShowBreadcrumbs] = useState(true);
  useEffect(() => {
    const sync = () => {
      try {
        setShowBreadcrumbs(localStorage.getItem("admin-breadcrumbs") !== "0");
      } catch {
        /* keep the default */
      }
    };
    sync();
    window.addEventListener("admin:breadcrumbs-pref", sync);
    return () => window.removeEventListener("admin:breadcrumbs-pref", sync);
  }, []);

  const unreadMsgCount = feed.unreadInboxReviewCount;
  const unreadNotifCount = feed.unreadBellCount;
  const avatarSrc = user.avatar?.trim();
  const showAvatarImage = Boolean(avatarSrc && failedAvatar !== avatarSrc);

  const avatar = showAvatarImage ? (
    <img
      src={avatarSrc}
      alt={user.name}
      onError={() => avatarSrc && setFailedAvatar(avatarSrc)}
      className="w-9 h-9 min-w-9 min-h-9 shrink-0 rounded-full object-cover ring-2 ring-(--primary)"
    />
  ) : (
    <span
      className="w-9 h-9 min-w-9 min-h-9 shrink-0 rounded-full bg-(--primary) text-white flex items-center justify-center text-xs font-bold tracking-wide ring-2 ring-(--primary)"
      aria-label={`${user.name} profile`}
    >
      {initialsOf(user.name)}
    </span>
  );

  return (
    // NORMAL static header (Ahsan, 2026-11-22 fix round: "topbar ko
    // normal karo, fixed hata do") — no sticky/fixed at any size: the
    // bar scrolls away with the page. It is `relative` only so the
    // msg/notif/profile popups can anchor to the HEADER itself (see
    // the popup note below), never to their narrow icon buttons.
    <header className="relative w-full min-h-14 bg-(--background) rounded-2xl shadow-sm border border-(--border) px-4 py-3 flex flex-wrap items-center gap-x-2 gap-y-2 select-none">
      {/* Dynamic Page Title & Subtitle — shrinkable: the title block
          yields (and truncates) before the controls are pushed out. */}
      <div className="min-w-0 order-1">
        {showBreadcrumbs && (
          <nav aria-label="Breadcrumb" className="text-[10px] font-medium text-(--text-muted) leading-tight mb-0.5">
            Home <span aria-hidden="true" className="mx-0.5">/</span>{" "}
            <span className="text-(--primary)">{title}</span>
          </nav>
        )}
        <h1 className="text-md md:text-xl font-bold text-(--text) leading-tight truncate">
          {title}
        </h1>
        {subtitle && (
          <p className="text-[10px] text-(--text-muted) font-medium w-auto truncate">
            {subtitle}
          </p>
        )}
      </div>

      {/* Search — its own flex child so the layout normalises: at md+
          it sits on the single header row between the title and the
          icon cluster, flexible width capped at 480px; below md it
          wraps onto its OWN full-width row under the title row (the
          icons stay up with the title, grouped — they no longer ride
          the search row or stretch across it). */}
      <div className="order-3 basis-full min-w-0 md:order-2 md:basis-auto md:flex-1 md:max-w-[480px]">
        {/* Global search (all sources) or the legacy page-local bar */}
        {globalSearch ? (
          <GlobalSearch />
        ) : (
          searchData.length > 0 &&
          onSearchResults && (
            <SearchBar
              searchSourceData={searchData}
              searchableFieldsKeys={searchFields}
              onSearchResultsUpdate={onSearchResults}
              searchPlaceholder={searchPlaceholder}
            />
          )
        )}
      </div>

      {/* Icon cluster — message + bell (with popups), profile menu and
          the theme toggle, always GROUPED at the right (ml-auto), on
          the title row at every size. None of the wrappers in here is
          `relative`: the popups anchor to the header (nearest
          positioned ancestor) so a 320px popup hangs from the header's
          right edge and can never slide off the viewport's left edge
          the way it did when it hung from the message button itself
          (at 440px the button sits ~110px from the right edge, so a
          right-0 popup on it started off-screen). */}
      <div
        className="order-2 md:order-3 ml-auto flex items-center gap-1 min-w-0"
        ref={containerRef}
      >
        {/* Action Icons With Popups */}
        <div className="flex items-center gap-1">
          {/* Message Button & Popup — customer-originated inbox */}
          <div>
            <button
              type="button"
              aria-label="Messages"
              onClick={() => openPanel("msg")}
              className={`relative p-0.5 md:p-2 rounded-xl transition-colors ${
                activePopup === "msg"
                  ? "bg-(--primary-soft) text-(--primary)"
                  : "text-(--text-muted) hover:text-(--text) hover:bg-(--primary-soft)"
              }`}
            >
              <MessageSquare className="w-5 h-5" />
              {unreadMsgCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 min-w-4 h-4 px-1 bg-(--primary) text-(--primary-text) rounded-full ring-2 ring-(--background) text-[9px] font-bold flex items-center justify-center">
                  {unreadMsgCount}
                </span>
              )}
            </button>

            {activePopup === "msg" && (
              <div className="absolute right-4 top-full mt-1 w-80 max-w-[calc(100vw-1.5rem)] bg-(--background) rounded-2xl shadow-xl border border-(--border) z-50 p-4">
                <div className="flex items-center justify-between pb-3 border-b border-(--border)">
                  <h4 className="text-sm font-bold text-(--text)">Messages</h4>
                  {freshIds.size > 0 && (
                    <span className="text-[10px] bg-(--primary) text-(--primary-text) px-2 py-0.5 rounded-full font-bold">
                      {freshIds.size} New
                    </span>
                  )}
                </div>
                {feed.inbox.length === 0 ? (
                  <p className="py-6 text-center text-xs text-(--text-muted)">
                    No messages
                  </p>
                ) : (
                  <div className="divide-y divide-(--border) max-h-80 overflow-y-auto">
                    {feed.inbox.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => openFeedItem(item)}
                        className="w-full text-left py-3 px-1 flex items-start gap-2 hover:bg-(--primary-soft) rounded-lg transition-colors cursor-pointer"
                      >
                        <span className="mt-0.5 shrink-0">
                          {item.type === "review_pending" ? (
                            <Star className="w-4 h-4 text-(--primary)" />
                          ) : (
                            <UserPlus className="w-4 h-4 text-(--primary)" />
                          )}
                        </span>
                        <span className="flex flex-col gap-0.5 flex-1 min-w-0">
                          <span className="text-xs font-semibold text-(--text) leading-snug">
                            {item.title}
                          </span>
                          <span className="text-[10px] text-(--text-muted)">
                            {relativeTime(item.time)}
                          </span>
                        </span>
                        {freshIds.has(item.id) && (
                          <span className="mt-1.5 w-2 h-2 shrink-0 rounded-full bg-(--primary)" />
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Notification Button & Popup — store/system events */}
          <div>
            <button
              type="button"
              aria-label="Notifications"
              onClick={() => openPanel("notif")}
              className={`relative p-0.5 md:p-2 rounded-xl transition-colors ${
                activePopup === "notif"
                  ? "bg-(--primary-soft) text-(--primary)"
                  : "text-(--text-muted) hover:text-(--text) hover:bg-(--primary-soft)"
              }`}
            >
              <Bell className="w-5 h-5" />
              {unreadNotifCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 min-w-4 h-4 px-1 bg-red-500 text-white rounded-full ring-2 ring-(--background) text-[9px] font-bold flex items-center justify-center">
                  {unreadNotifCount}
                </span>
              )}
            </button>

            {activePopup === "notif" && (
              <div className="absolute right-4 top-full mt-1 w-80 max-w-[calc(100vw-1.5rem)] bg-(--background) rounded-2xl shadow-xl border border-(--border) z-50 p-4">
                <div className="flex items-center justify-between pb-3 border-b border-(--border)">
                  <h4 className="text-sm font-bold text-(--text)">Notifications</h4>
                  {freshIds.size > 0 && (
                    <span className="text-[10px] bg-red-500/10 text-red-500 px-2 py-0.5 rounded-full font-bold">
                      {freshIds.size} New
                    </span>
                  )}
                </div>
                {feed.notifications.length === 0 ? (
                  <p className="py-6 text-center text-xs text-(--text-muted)">
                    No notifications
                  </p>
                ) : (
                  <div className="divide-y divide-(--border) max-h-80 overflow-y-auto">
                    {feed.notifications.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => openFeedItem(item)}
                        className="w-full text-left py-3 px-1 flex items-start gap-2 hover:bg-(--primary-soft) rounded-lg transition-colors cursor-pointer"
                      >
                        <span className="mt-0.5 shrink-0">
                          {item.type === "stock_out" ? (
                            <PackageX className="w-4 h-4 text-red-500" />
                          ) : item.type === "stock_low" ? (
                            <TriangleAlert className="w-4 h-4 text-(--primary)" />
                          ) : item.type === "order_new" ? (
                            <ShoppingCart className="w-4 h-4 text-(--primary)" />
                          ) : item.type === "reviews_pending" ? (
                            <Star className="w-4 h-4 text-(--primary)" />
                          ) : (
                            <BellRing className="w-4 h-4 text-(--primary)" />
                          )}
                        </span>
                        <span className="flex flex-col gap-0.5 flex-1 min-w-0">
                          <span className="text-xs font-semibold text-(--text) leading-snug">
                            {item.title}
                          </span>
                          <span className="text-[10px] text-(--text-muted)">
                            {relativeTime(item.time)}
                          </span>
                        </span>
                        {freshIds.has(item.id) && (
                          <span className="mt-1.5 w-2 h-2 shrink-0 rounded-full bg-red-500" />
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Vertical Divider */}
        <div className="h-6 w-0.5 bg-(--border) mx-1" />

        {/* Profile + Menu */}
        <div>
          <button
            type="button"
            onClick={() =>
              setActivePopup(activePopup === "profile" ? null : "profile")
            }
            className="flex items-center gap-2.5 cursor-pointer hover:bg-(--primary-soft) p-1.5 rounded-xl transition-colors"
          >
            {avatar}
            <span className="md:flex flex-col text-left hidden">
              <span className="text-xs font-bold text-(--text) leading-tight">
                {user.name}
              </span>
              <span className="text-[11px] text-(--text-muted) font-medium">
                {user.role}
              </span>
            </span>
            <ChevronDown className="w-4 h-4 text-(--text-muted) hidden md:block" />
          </button>

          {activePopup === "profile" && (
            <div className="absolute right-4 top-full mt-1 w-64 max-w-[calc(100vw-1.5rem)] bg-(--background) rounded-2xl shadow-xl border border-(--border) z-50 p-2">
              <div className="flex items-center gap-3 px-2 py-2.5 border-b border-(--border)">
                {avatar}
                <div className="min-w-0">
                  <p className="text-xs font-bold text-(--text) truncate">{user.name}</p>
                  {user.email && (
                    <p className="text-[11px] text-(--text-muted) truncate">{user.email}</p>
                  )}
                  <p className="text-[11px] text-(--text-muted)">{user.role}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setActivePopup(null);
                  logout();
                }}
                className="mt-1.5 w-full flex items-center gap-2 px-2 py-2 rounded-xl text-xs font-semibold text-red-500 hover:bg-red-500/10 transition-colors"
              >
                <LogOut className="w-4 h-4" />
                Sign out
              </button>
            </div>
          )}
        </div>

        <ThemeToggle />
      </div>
    </header>
  );
};

export default TopBar;
