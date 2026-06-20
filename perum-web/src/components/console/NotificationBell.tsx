"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { papi } from "@/lib/platformApi";
import { useToast } from "@/context/ToastContext";
import styles from "./NotificationBell.module.css";

type Notif = {
  id: number;
  type: string;
  title: string;
  body: string | null;
  ref_id: number | null;
  is_read: boolean;
  created_at: string | null;
};

const POLL_MS = 30_000;

function timeAgo(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso).getTime();
  const s = Math.max(0, Math.round((Date.now() - d) / 1000));
  if (s < 60) return "только что";
  const m = Math.round(s / 60);
  if (m < 60) return `${m} мин назад`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} ч назад`;
  return new Date(iso).toLocaleDateString();
}

/**
 * Колокол уведомлений организатора: бейдж непрочитанных + выпадающий список.
 * Поллит ленту, всплывающим тостом показывает новые непрочитанные. Источники
 * уведомлений — новости ядра и ответы поддержки (см. perum-core news/support).
 */
export default function NotificationBell() {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Notif[]>([]);
  const [unread, setUnread] = useState(0);
  const seen = useRef<Set<number> | null>(null); // null → первая загрузка (без тостов)
  const wrapRef = useRef<HTMLDivElement>(null);

  const poll = useCallback(async () => {
    try {
      const r = await papi("/api/notifications?limit=20");
      const list: Notif[] = r.notifications || [];
      setItems(list);
      setUnread(list.filter((n) => !n.is_read).length);
      // Всплывашки для новых непрочитанных (не на первой загрузке).
      const fresh = list.filter((n) => !n.is_read);
      if (seen.current !== null) {
        for (const n of fresh) {
          if (!seen.current.has(n.id)) toast.showInfo(n.title);
        }
      }
      seen.current = new Set(fresh.map((n) => n.id));
    } catch { /* non-fatal */ }
  }, [toast]);

  useEffect(() => {
    poll();
    const t = setInterval(poll, POLL_MS);
    return () => clearInterval(t);
  }, [poll]);

  // Закрытие по клику вне.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  async function markRead(n: Notif) {
    if (n.is_read) return;
    setItems((prev) => prev.map((x) => (x.id === n.id ? { ...x, is_read: true } : x)));
    setUnread((u) => Math.max(0, u - 1));
    try { await papi(`/api/notifications/${n.id}/read`, { method: "POST" }); } catch { /* non-fatal */ }
  }

  async function markAll() {
    setItems((prev) => prev.map((x) => ({ ...x, is_read: true })));
    setUnread(0);
    try { await papi("/api/notifications/read-all", { method: "POST" }); } catch { /* non-fatal */ }
  }

  return (
    <div className={styles.wrap} ref={wrapRef}>
      <button className={styles.bellBtn} onClick={() => setOpen((v) => !v)} aria-label="Уведомления">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {unread > 0 && <span className={styles.badge}>{unread > 99 ? "99+" : unread}</span>}
      </button>

      {open && (
        <div className={styles.dropdown}>
          <div className={styles.head}>
            <span>Уведомления</span>
            {unread > 0 && <button className={styles.markAll} onClick={markAll}>Прочитать все</button>}
          </div>
          <div className={styles.list}>
            {items.length === 0 && <div className={styles.empty}>Пока нет уведомлений</div>}
            {items.map((n) => (
              <button
                key={n.id}
                className={`${styles.item} ${n.is_read ? "" : styles.itemUnread}`}
                onClick={() => markRead(n)}
              >
                <span className={`${styles.dot} ${n.type === "support" ? styles.dotSupport : styles.dotNews}`} />
                <span className={styles.itemBody}>
                  <span className={styles.itemTitle}>{n.title}</span>
                  {n.body && <span className={styles.itemText}>{n.body}</span>}
                  <span className={styles.itemTime}>{timeAgo(n.created_at)}</span>
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
