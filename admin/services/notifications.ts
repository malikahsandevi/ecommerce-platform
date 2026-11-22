"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { apiClient } from "@/services/api";
import { useAdminAuth } from "@/services/authContext";

/**
 * Live TopBar feeds (bell + messages), backed by GET /api/notifications
 * which derives everything from real store data on every call.
 *
 * Read state: the backend feed is stateless, so "read" markers are
 * kept per user in this device's local storage (same pattern as the
 * theme preference) under `admin-notif-read:<userId>` — a capped list
 * of item ids. Item ids embed the state that produced them (a stock
 * level, a pending count), so when the state changes the item gets a
 * new id and the badge lights again.
 */

export interface FeedItem {
  id: string;
  type:
    | "stock_out"
    | "stock_low"
    | "order_new"
    | "reviews_pending"
    | "review_pending"
    | "customer_new";
  title: string;
  time: string;
  path: string;
  recordId: string | null;
}

interface Feeds {
  notifications: FeedItem[];
  inbox: FeedItem[];
  pendingReviews: number;
}

const EMPTY: Feeds = { notifications: [], inbox: [], pendingReviews: 0 };
const READ_LIMIT = 300;
const POLL_MS = 60_000;

function readKey(userId: string) {
  return `admin-notif-read:${userId}`;
}

function loadReadIds(userId: string): Set<string> {
  try {
    const raw = localStorage.getItem(readKey(userId));
    const parsed = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(parsed) ? parsed.filter((x) => typeof x === "string") : []);
  } catch {
    return new Set();
  }
}

function saveReadIds(userId: string, ids: Set<string>) {
  try {
    localStorage.setItem(readKey(userId), JSON.stringify([...ids].slice(-READ_LIMIT)));
  } catch {
    /* storage full/blocked — badges simply stay lit */
  }
}

export function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const diff = Date.now() - then;
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

export function useNotifications() {
  const { user, isAuthenticated } = useAdminAuth();
  const pathname = usePathname();
  const userId = user?.id || user?.email || "anonymous";
  const [feeds, setFeeds] = useState<Feeds>(EMPTY);
  const [readIds, setReadIds] = useState<Set<string>>(new Set());
  const readIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const loaded = loadReadIds(userId);
    readIdsRef.current = loaded;
    setReadIds(loaded);
  }, [userId]);

  const refresh = useCallback(async () => {
    if (!isAuthenticated) return;
    try {
      const res = await apiClient.get("/notifications");
      const data = res.data as Feeds;
      setFeeds({
        notifications: Array.isArray(data.notifications) ? data.notifications : [],
        inbox: Array.isArray(data.inbox) ? data.inbox : [],
        pendingReviews: Number(data.pendingReviews) || 0,
      });
    } catch {
      /* feed unavailable — keep the last good data, stay silent */
    }
  }, [isAuthenticated]);

  // Refresh on mount, on every navigation, and once a minute while
  // the admin stays open.
  useEffect(() => {
    refresh();
  }, [refresh, pathname]);

  useEffect(() => {
    const timer = setInterval(refresh, POLL_MS);
    return () => clearInterval(timer);
  }, [refresh]);

  const markRead = useCallback(
    (items: FeedItem[]) => {
      const next = new Set(readIdsRef.current);
      let changed = false;
      for (const item of items) {
        if (!next.has(item.id)) {
          next.add(item.id);
          changed = true;
        }
      }
      if (!changed) return;
      readIdsRef.current = next;
      setReadIds(next);
      saveReadIds(userId, next);
    },
    [userId],
  );

  const unreadBell = feeds.notifications.filter((n) => !readIds.has(n.id));
  const unreadInbox = feeds.inbox.filter((m) => !readIds.has(m.id));
  // The messages badge counts unread PENDING REVIEWS (customer items
  // awaiting action); signups list alongside but don't light it.
  const unreadInboxReviews = feeds.inbox.filter(
    (m) => m.type === "review_pending" && !readIds.has(m.id),
  );

  return {
    notifications: feeds.notifications,
    inbox: feeds.inbox,
    unreadBell,
    unreadInbox,
    unreadBellCount: unreadBell.length,
    unreadInboxReviewCount: unreadInboxReviews.length,
    markBellRead: () => markRead(feeds.notifications),
    markInboxRead: () => markRead(feeds.inbox),
    refresh,
  };
}
