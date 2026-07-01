"use client";

import { useEffect, useRef, useState } from "react";
import { papi } from "@/lib/platformApi";
import { useToast } from "@/context/ToastContext";
import Modal from "@/components/platform/Modal";
import styles from "@/app/admin/page.module.css";
import c from "@/components/platform/console.module.css";

type Ticket = {
  id: number;
  org_id: number;
  org_name?: string;
  subject: string;
  status: string;
  platform_unread: boolean;
  last_message_at: string | null;
  created_at: string | null;
};
type Msg = { id: number; sender_type: string; body: string; created_at: string | null };

const STATUS_LABEL: Record<string, string> = { open: "открыт", pending: "в работе", closed: "закрыт" };

function badge(status: string): string {
  const map: Record<string, string> = { open: c.badgeWarn, pending: c.badgeWarn, closed: c.badgeMuted };
  return `${styles.statusBadge} ${status === "closed" ? c.badgeMuted : c.badgeWarn}`;
}

/**
 * Раздел «Поддержка» в ядре: инбокс всех тикетов организаций. platform_admin
 * читает переписку, отвечает и меняет статус. Ответ уведомляет организатора.
 */
export default function SupportInbox({ onChanged }: { onChanged?: () => void }) {
  const toast = useToast();
  const [filter, setFilter] = useState("");
  const [tickets, setTickets] = useState<Ticket[] | null>(null);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [thread, setThread] = useState<{ ticket: Ticket; messages: Msg[] } | null>(null);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const bodyRef = useRef<HTMLDivElement>(null);

  async function load() {
    try { setTickets((await papi(`/api/support/admin/tickets${filter ? `?status_filter=${filter}` : ""}`)).tickets || []); }
    catch (e: any) { toast.showError(e.message); }
  }
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [filter]);

  async function openTicket(id: number) {
    setActiveId(id); setThread(null);
    try { setThread(await papi(`/api/support/admin/tickets/${id}`)); load(); onChanged?.(); }
    catch (e: any) { toast.showError(e.message); }
  }
  useEffect(() => {
    if (bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
  }, [thread]);

  async function reply(e: React.FormEvent) {
    e.preventDefault();
    if (!draft.trim() || activeId == null) return;
    const text = draft; setDraft(""); setBusy(true);
    try {
      await papi(`/api/support/admin/tickets/${activeId}/messages`, { method: "POST", body: JSON.stringify({ body: text }) });
      setThread(await papi(`/api/support/admin/tickets/${activeId}`));
      load(); onChanged?.();
    } catch (e: any) { setDraft(text); toast.showError(e.message); } finally { setBusy(false); }
  }

  async function changeStatus(s: string) {
    if (activeId == null) return;
    try {
      await papi(`/api/support/admin/tickets/${activeId}`, { method: "PATCH", body: JSON.stringify({ status: s }) });
      setThread(await papi(`/api/support/admin/tickets/${activeId}`));
      load(); onChanged?.();
    } catch (e: any) { toast.showError(e.message); }
  }

  return (
    <>
      <div className={c.toolbar}>
        <select className={styles.input} style={{ maxWidth: 220 }} value={filter} onChange={(e) => setFilter(e.target.value)}>
          <option value="">Все статусы</option>
          <option value="open">Открытые</option>
          <option value="pending">В работе</option>
          <option value="closed">Закрытые</option>
        </select>
      </div>
      <div className={styles.card}>
        <h2 className={styles.cardTitle}>Обращения</h2>
        <div className={styles.tableContainer}>
          <table className={styles.table}>
            <thead><tr><th>Тема</th><th>Организация</th><th>Статус</th><th>Обновлён</th><th></th></tr></thead>
            <tbody>{tickets?.map((t) => (
              <tr key={t.id}>
                <td><b>{t.subject}</b> {t.platform_unread && <span className={c.warnText} title="Новое сообщение">●</span>}</td>
                <td>{t.org_name || `#${t.org_id}`}</td>
                <td><span className={badge(t.status)}>{STATUS_LABEL[t.status] || t.status}</span></td>
                <td>{t.last_message_at ? new Date(t.last_message_at).toLocaleString() : "—"}</td>
                <td><button className={styles.actionBtn} onClick={() => openTicket(t.id)}>Открыть</button></td>
              </tr>
            ))}</tbody>
          </table>
          {tickets && tickets.length === 0 && <p className={styles.emptyState}>Обращений пока нет.</p>}
          {tickets === null && <p className={c.muted}>Загрузка…</p>}
        </div>
      </div>

      {activeId != null && (
        <Modal title={thread ? thread.ticket.subject : "Обращение"} onClose={() => { setActiveId(null); setThread(null); }} width={680}>
          {!thread ? <p className={c.muted}>Загрузка…</p> : (
            <>
              <div className={c.toolbar} style={{ marginBottom: 12 }}>
                <span className={c.muted}>{thread.ticket.org_name || `#${thread.ticket.org_id}`} · <span className={badge(thread.ticket.status)}>{STATUS_LABEL[thread.ticket.status] || thread.ticket.status}</span></span>
                <span className={c.spacer} />
                {thread.ticket.status !== "closed"
                  ? <button className={styles.actionBtn} onClick={() => changeStatus("closed")}>Закрыть</button>
                  : <button className={styles.actionBtn} onClick={() => changeStatus("open")}>Открыть снова</button>}
              </div>
              <div ref={bodyRef} style={{ maxHeight: 360, overflowY: "auto", display: "flex", flexDirection: "column", gap: 8, padding: 4 }}>
                {thread.messages.map((m) => {
                  const mine = m.sender_type === "platform_admin";
                  return (
                    <div key={m.id} style={{ display: "flex", flexDirection: "column", maxWidth: "82%", alignSelf: mine ? "flex-end" : "flex-start", alignItems: mine ? "flex-end" : "flex-start" }}>
                      <div style={{ padding: "8px 12px", borderRadius: 12, fontSize: "0.88rem", lineHeight: 1.4, whiteSpace: "pre-wrap", wordBreak: "break-word", background: mine ? "var(--accent-primary)" : "var(--bg-tertiary)", color: mine ? "#fff" : "var(--text-primary)", borderBottomRightRadius: mine ? 4 : 12, borderBottomLeftRadius: mine ? 12 : 4 }}>{m.body}</div>
                      <div style={{ fontSize: "0.68rem", color: "var(--text-muted)", marginTop: 3 }}>{mine ? "поддержка" : "организатор"} · {m.created_at ? new Date(m.created_at).toLocaleString() : ""}</div>
                    </div>
                  );
                })}
              </div>
              <form onSubmit={reply} style={{ display: "flex", gap: 8, marginTop: 14 }}>
                <input className={styles.input} style={{ flex: 1 }} value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Ответ организатору…" />
                <button className={styles.submitBtn} disabled={busy || !draft.trim()}>Отправить</button>
              </form>
            </>
          )}
        </Modal>
      )}
    </>
  );
}
