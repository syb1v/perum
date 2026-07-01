"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { papi } from "@/lib/platformApi";
import styles from "./SupportChatWidget.module.css";

type Ticket = {
  id: number;
  subject: string;
  status: string;
  org_unread: boolean;
  last_message_at: string | null;
  created_at: string | null;
};
type Msg = { id: number; sender_type: string; body: string; created_at: string | null };

const POLL_MS = 15_000;
const STATUS_LABEL: Record<string, string> = { open: "открыт", pending: "в работе", closed: "закрыт" };

function fmt(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleString();
}

/**
 * Плавающий чат поддержки организатора. Кнопка снизу-справа открывает панель со
 * списком тикетов; внутри — переписка по тикету и создание нового обращения.
 * Бэкенд — perum-core /api/support/tickets* (поллинг, без websocket).
 */
export default function SupportChatWidget() {
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<"list" | "thread" | "new">("list");
  const [tickets, setTickets] = useState<Ticket[] | null>(null);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [thread, setThread] = useState<{ ticket: Ticket; messages: Msg[] } | null>(null);
  const [subject, setSubject] = useState("");
  const [firstMsg, setFirstMsg] = useState("");
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [unread, setUnread] = useState(false);
  const bodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => setMounted(true), []);

  const loadTickets = useCallback(async () => {
    try {
      const r = await papi("/api/support/tickets");
      const list: Ticket[] = r.tickets || [];
      setTickets(list);
      setUnread(list.some((t) => t.org_unread));
    } catch { /* non-fatal */ }
  }, []);

  // Фоновый поллинг непрочитанного (даже когда панель закрыта) — подсветка кнопки.
  useEffect(() => {
    loadTickets();
    const t = setInterval(loadTickets, POLL_MS);
    return () => clearInterval(t);
  }, [loadTickets]);

  const loadThread = useCallback(async (id: number) => {
    try {
      const r = await papi(`/api/support/tickets/${id}`);
      setThread(r);
      setUnread(false);
    } catch { /* non-fatal */ }
  }, []);

  // Поллинг открытого треда.
  useEffect(() => {
    if (view !== "thread" || activeId == null) return;
    loadThread(activeId);
    const t = setInterval(() => loadThread(activeId), POLL_MS);
    return () => clearInterval(t);
  }, [view, activeId, loadThread]);

  useEffect(() => {
    if (bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
  }, [thread]);

  function openThread(id: number) { setActiveId(id); setThread(null); setView("thread"); }

  async function createTicket(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const r = await papi("/api/support/tickets", { method: "POST", body: JSON.stringify({ subject, message: firstMsg }) });
      setSubject(""); setFirstMsg("");
      await loadTickets();
      openThread(r.id);
    } catch { /* non-fatal */ } finally { setBusy(false); }
  }

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!draft.trim() || activeId == null) return;
    const text = draft;
    setDraft(""); setBusy(true);
    try {
      await papi(`/api/support/tickets/${activeId}/messages`, { method: "POST", body: JSON.stringify({ body: text }) });
      await loadThread(activeId);
      loadTickets();
    } catch { setDraft(text); } finally { setBusy(false); }
  }

  if (!mounted) return null;

  return createPortal(
    <div className={styles.root}>
      {open && (
        <div className={styles.panel}>
          <div className={styles.header}>
            {view !== "list" ? (
              <button className={styles.back} onClick={() => { setView("list"); loadTickets(); }} aria-label="Назад">‹</button>
            ) : <span className={styles.headerIcon}>💬</span>}
            <span className={styles.headerTitle}>
              {view === "thread" ? (thread?.ticket.subject || "Обращение") : view === "new" ? "Новое обращение" : "Поддержка"}
            </span>
            <button className={styles.close} onClick={() => setOpen(false)} aria-label="Закрыть">✕</button>
          </div>

          {/* СПИСОК ТИКЕТОВ */}
          {view === "list" && (
            <>
              <div className={styles.body}>
                {tickets === null && <div className={styles.muted}>Загрузка…</div>}
                {tickets && tickets.length === 0 && <div className={styles.muted}>У вас пока нет обращений. Задайте вопрос — поддержка ответит здесь.</div>}
                {tickets?.map((t) => (
                  <button key={t.id} className={styles.ticketRow} onClick={() => openThread(t.id)}>
                    <span className={styles.ticketSubj}>{t.subject}</span>
                    <span className={styles.ticketMeta}>
                      <span className={`${styles.status} ${styles["s_" + t.status]}`}>{STATUS_LABEL[t.status] || t.status}</span>
                      <span className={styles.ticketTime}>{fmt(t.last_message_at)}</span>
                      {t.org_unread && <span className={styles.unreadDot} />}
                    </span>
                  </button>
                ))}
              </div>
              <div className={styles.footer}>
                <button className={styles.primaryBtn} onClick={() => setView("new")}>Новое обращение</button>
              </div>
            </>
          )}

          {/* НОВОЕ ОБРАЩЕНИЕ */}
          {view === "new" && (
            <form className={styles.bodyForm} onSubmit={createTicket}>
              <label className={styles.label}>Тема</label>
              <input className={styles.input} value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Кратко о проблеме" required minLength={2} maxLength={255} />
              <label className={styles.label}>Сообщение</label>
              <textarea className={styles.textarea} value={firstMsg} onChange={(e) => setFirstMsg(e.target.value)} placeholder="Опишите вопрос подробнее" required rows={5} />
              <button className={styles.primaryBtn} disabled={busy}>{busy ? "Отправка…" : "Отправить"}</button>
            </form>
          )}

          {/* ПЕРЕПИСКА */}
          {view === "thread" && (
            <>
              <div className={styles.body} ref={bodyRef}>
                {thread === null && <div className={styles.muted}>Загрузка…</div>}
                {thread?.messages.map((m) => (
                  <div key={m.id} className={`${styles.msg} ${m.sender_type === "org_admin" ? styles.msgMine : styles.msgTheirs}`}>
                    <div className={styles.msgBubble}>{m.body}</div>
                    <div className={styles.msgTime}>{m.sender_type === "org_admin" ? "вы" : "поддержка"} · {fmt(m.created_at)}</div>
                  </div>
                ))}
                {thread?.ticket.status === "closed" && <div className={styles.muted}>Обращение закрыто. Новое сообщение откроет его снова.</div>}
              </div>
              <form className={styles.composer} onSubmit={send}>
                <input className={styles.input} value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Сообщение…" />
                <button className={styles.sendBtn} disabled={busy || !draft.trim()} aria-label="Отправить">➤</button>
              </form>
            </>
          )}
        </div>
      )}

      <button className={`${styles.fab} ${unread ? styles.fabUnread : ""}`} onClick={() => { setOpen((v) => !v); if (!open) { setView("list"); loadTickets(); } }} aria-label="Поддержка">
        {open ? (
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
        ) : (
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" /></svg>
        )}
        {unread && !open && <span className={styles.fabDot} />}
      </button>
    </div>,
    document.body,
  );
}
