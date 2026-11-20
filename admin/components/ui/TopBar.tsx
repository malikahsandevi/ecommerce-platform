"use client";

import React, { useState, useRef, useEffect } from "react";
import { MessageSquare, Bell, CheckCheck, ChevronDown, LogOut } from "lucide-react";
import SearchBar, { SearchableEntityRecord } from "@/components/ui/SearchBar";
import ThemeToggle from "@/components/models/ThemeToggle";
import { useAdminAuth } from "@/services/authContext";

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
  notifications = [],
  messages = [],
  searchPlaceholder = "Search...",
  searchData = [],
  searchFields = [],
  onSearchResults,
}: TopBarProps<T>) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [activePopup, setActivePopup] = useState<"msg" | "notif" | "profile" | null>(null);
  const [failedAvatar, setFailedAvatar] = useState<string | null>(null);
  const { logout } = useAdminAuth();

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

  const unreadMsgCount = messages.filter((m) => m.isUnread).length;
  const unreadNotifCount = notifications.filter((n) => n.isUnread).length;
  const avatarSrc = user.avatar?.trim();
  const showAvatarImage = Boolean(avatarSrc && failedAvatar !== avatarSrc);

  const avatar = showAvatarImage ? (
    <img
      src={avatarSrc}
      alt={user.name}
      onError={() => avatarSrc && setFailedAvatar(avatarSrc)}
      className="w-9 h-9 min-w-9 min-h-9 shrink-0 rounded-full object-cover border border-(--primary-light)"
    />
  ) : (
    <span
      className="w-9 h-9 min-w-9 min-h-9 shrink-0 rounded-full bg-(--primary) text-white flex items-center justify-center text-xs font-bold tracking-wide"
      aria-label={`${user.name} profile`}
    >
      {initialsOf(user.name)}
    </span>
  );

  return (
    <header className="w-full min-h-14 bg-(--background) rounded-2xl shadow-sm border border-(--border) px-4 py-3 flex items-center justify-between select-none">
      {/* Dynamic Page Title & Subtitle */}
      <div>
        {showBreadcrumbs && (
          <nav aria-label="Breadcrumb" className="text-[10px] font-medium text-(--text-muted) leading-tight mb-0.5">
            Home <span aria-hidden="true" className="mx-0.5">/</span>{" "}
            <span className="text-(--primary)">{title}</span>
          </nav>
        )}
        <h1 className="text-md md:text-xl font-bold text-(--text) leading-tight">
          {title}
        </h1>
        {subtitle && (
          <p className="text-[10px] text-(--text-muted) font-medium w-auto">
            {subtitle}
          </p>
        )}
      </div>

      {/* Right Controls */}
      <div className="flex items-center gap-1" ref={containerRef}>
        {/* Modular Search Bar Component */}
        {searchData.length > 0 && onSearchResults && (
          <SearchBar
            searchSourceData={searchData}
            searchableFieldsKeys={searchFields}
            onSearchResultsUpdate={onSearchResults}
            searchPlaceholder={searchPlaceholder}
          />
        )}

        {/* Action Icons With Popups */}
        <div className="flex items-center gap-1 relative">
          {/* Message Button & Popup */}
          <div className="relative">
            <button
              type="button"
              onClick={() =>
                setActivePopup(activePopup === "msg" ? null : "msg")
              }
              className={`relative p-0.5 md:p-2 rounded-xl transition-colors ${
                activePopup === "msg"
                  ? "bg-(--primary-light) text-(--primary-dark)"
                  : "text-(--text-muted) hover:text-(--text) hover:bg-(--primary-soft)"
              }`}
            >
              <MessageSquare className="w-5 h-5" />
              {unreadMsgCount > 0 && (
                <span className="absolute top-1 right-1 w-2 h-2 bg-(--primary) rounded-full ring-2 ring-(--background)" />
              )}
            </button>

            {activePopup === "msg" && (
              <div className="absolute right-0 mt-2 w-80 bg-(--background) rounded-2xl shadow-xl border border-(--border) z-50 p-4">
                <div className="flex items-center justify-between pb-3 border-b border-(--border)">
                  <h4 className="text-sm font-bold text-(--text)">Messages</h4>
                  <span className="text-[10px] bg-(--primary-light) text-(--primary-dark) px-2 py-0.5 rounded-full font-bold">
                    {unreadMsgCount} New
                  </span>
                </div>
                {messages.length === 0 ? (
                  <p className="py-6 text-center text-xs text-(--text-muted)">
                    No messages yet.
                  </p>
                ) : (
                  <div className="divide-y divide-(--border) max-h-60 overflow-y-auto">
                    {messages.map((msg) => (
                      <div
                        key={msg.id}
                        className="py-3 px-1 flex flex-col gap-1 hover:bg-(--primary-soft) rounded-lg transition-colors cursor-pointer"
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-(--text)">
                            {msg.sender}
                          </span>
                          <span className="text-[10px] text-(--text-muted)">
                            {msg.time}
                          </span>
                        </div>
                        <p className="text-xs text-(--text-muted) line-clamp-1">
                          {msg.text}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Notification Button & Popup */}
          <div className="relative">
            <button
              type="button"
              onClick={() =>
                setActivePopup(activePopup === "notif" ? null : "notif")
              }
              className={`relative p-0.5 md:p-2 rounded-xl transition-colors ${
                activePopup === "notif"
                  ? "bg-(--primary-light) text-(--primary-dark)"
                  : "text-(--text-muted) hover:text-(--text) hover:bg-(--primary-soft)"
              }`}
            >
              <Bell className="w-5 h-5" />
              {unreadNotifCount > 0 && (
                <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full ring-2 ring-(--background)" />
              )}
            </button>

            {activePopup === "notif" && (
              <div className="absolute right-0 mt-2 w-80 bg-(--background) rounded-2xl shadow-xl border border-(--border) z-50 p-4">
                <div className="flex items-center justify-between pb-3 border-b border-(--border)">
                  <h4 className="text-sm font-bold text-(--text)">Notifications</h4>
                  <span className="text-[10px] bg-red-100 text-red-600 px-2 py-0.5 rounded-full font-bold">
                    {unreadNotifCount} Unread
                  </span>
                </div>
                {notifications.length === 0 ? (
                  <p className="py-6 text-center text-xs text-(--text-muted)">
                    No notifications yet.
                  </p>
                ) : (
                  <div className="divide-y divide-(--border) max-h-60 overflow-y-auto">
                    {notifications.map((notif) => (
                      <div
                        key={notif.id}
                        className="py-3 px-1 flex items-start gap-2 hover:bg-(--primary-soft) rounded-lg transition-colors cursor-pointer"
                      >
                        <div className="mt-0.5">
                          <CheckCheck className="w-4 h-4 text-(--primary)" />
                        </div>
                        <div className="flex flex-col gap-0.5 flex-1">
                          <span className="text-xs font-semibold text-(--text)">
                            {notif.title}
                          </span>
                          <span className="text-[10px] text-(--text-muted)">
                            {notif.time}
                          </span>
                        </div>
                      </div>
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
        <div className="relative">
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
            <div className="absolute right-0 mt-2 w-64 bg-(--background) rounded-2xl shadow-xl border border-(--border) z-50 p-2">
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
