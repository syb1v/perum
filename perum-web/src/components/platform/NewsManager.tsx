"use client";

import { useEffect, useState } from "react";
import { papi } from "@/lib/platformApi";
import { useToast } from "@/context/ToastContext";
import Modal from "@/components/platform/Modal";
import styles from "@/app/admin/page.module.css";
import c from "@/components/platform/console.module.css";

type News = {
  id: number;
  title: string;
  body: string;
  is_global: boolean;
  is_published: boolean;
  pinned: boolean;
  target_count: number;
  created_at: string | null;
};

/**
 * Раздел «Новости» в ядре: platform_admin пишет новости и адресует их всем или
 * выбранным организациям. Публикация рассылается организаторам как уведомление.
 */
export default function NewsManager({ orgs }: { orgs: any[] | null }) {
  const toast = useToast();
  const [news, setNews] = useState<News[] | null>(null);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [isGlobal, setIsGlobal] = useState(true);
  const [pinned, setPinned] = useState(false);
  const [orgIds, setOrgIds] = useState<number[]>([]);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<News | null>(null);

  async function load() {
    try { setNews((await papi("/api/news")).news || []); } catch (e: any) { toast.showError(e.message); }
  }
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  function toggleOrg(id: number) {
    setOrgIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (!isGlobal && orgIds.length === 0) { toast.showError("Выберите организации или включите «всем»"); return; }
    setBusy(true);
    try {
      const r = await papi("/api/news", { method: "POST", body: JSON.stringify({ title, body, is_global: isGlobal, org_ids: isGlobal ? [] : orgIds, pinned }) });
      toast.showSuccess(`Новость опубликована · уведомлений отправлено: ${r.delivered}`);
      setTitle(""); setBody(""); setPinned(false); setOrgIds([]); setIsGlobal(true);
      load();
    } catch (e: any) { toast.showError(e.message); } finally { setBusy(false); }
  }

  async function togglePublished(n: News) {
    try { await papi(`/api/news/${n.id}`, { method: "PATCH", body: JSON.stringify({ is_published: !n.is_published }) }); load(); }
    catch (e: any) { toast.showError(e.message); }
  }
  async function togglePinned(n: News) {
    try { await papi(`/api/news/${n.id}`, { method: "PATCH", body: JSON.stringify({ pinned: !n.pinned }) }); load(); }
    catch (e: any) { toast.showError(e.message); }
  }
  async function remove(n: News) {
    if (!confirm(`Удалить новость «${n.title}»?`)) return;
    try { await papi(`/api/news/${n.id}`, { method: "DELETE" }); toast.showInfo("Новость удалена"); load(); }
    catch (e: any) { toast.showError(e.message); }
  }

  return (
    <>
      <div className={styles.card}>
        <h2 className={styles.cardTitle}>Написать новость</h2>
        <p className={c.muted}>Новость увидят организаторы в своём кабинете, а при публикации им придёт уведомление (колокол).</p>
        <form onSubmit={create} className={styles.form}>
          <div className={styles.formGroup}><label className={styles.label}>Заголовок</label><input className={styles.input} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Например: плановые работы 25 июня" required minLength={2} maxLength={255} /></div>
          <div className={styles.formGroup}><label className={styles.label}>Текст</label><textarea className={styles.input} rows={5} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Текст новости…" required /></div>
          <div className={styles.formRow} style={{ alignItems: "center" }}>
            <div className={styles.formGroup}>
              <label className={styles.label} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <input type="checkbox" checked={isGlobal} onChange={(e) => setIsGlobal(e.target.checked)} style={{ width: "auto" }} /> Всем организациям
              </label>
            </div>
            <div className={styles.formGroup}>
              <label className={styles.label} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <input type="checkbox" checked={pinned} onChange={(e) => setPinned(e.target.checked)} style={{ width: "auto" }} /> Закрепить
              </label>
            </div>
          </div>
          {!isGlobal && (
            <div className={styles.formGroup}>
              <label className={styles.label}>Адресаты ({orgIds.length} выбрано)</label>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, maxHeight: 160, overflowY: "auto", padding: 8, border: "1px solid var(--border-color)", borderRadius: 8 }}>
                {(orgs || []).map((o) => (
                  <label key={o.id} style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: "0.84rem", color: "var(--text-secondary)", cursor: "pointer" }}>
                    <input type="checkbox" checked={orgIds.includes(o.id)} onChange={() => toggleOrg(o.id)} style={{ width: "auto" }} /> {o.name}
                  </label>
                ))}
                {orgs && orgs.length === 0 && <span className={c.muted}>Нет организаций.</span>}
              </div>
            </div>
          )}
          <div className={styles.formActions}><button className={styles.submitBtn} disabled={busy}>{busy ? "Публикуется…" : "Опубликовать"}</button></div>
        </form>
      </div>

      <div className={styles.card}>
        <h2 className={styles.cardTitle}>Новости</h2>
        <div className={styles.tableContainer}>
          <table className={styles.table}>
            <thead><tr><th>Заголовок</th><th>Адресаты</th><th>Опубл.</th><th>Закреп.</th><th>Создана</th><th>Действия</th></tr></thead>
            <tbody>{news?.map((n) => (
              <tr key={n.id}>
                <td><b style={{ cursor: "pointer" }} onClick={() => setPreview(n)}>{n.title}</b></td>
                <td>{n.is_global ? "все" : `${n.target_count} орг.`}</td>
                <td><span className={`${styles.statusBadge} ${n.is_published ? styles.success : c.badgeMuted}`}>{n.is_published ? "да" : "нет"}</span></td>
                <td>{n.pinned ? "📌" : "—"}</td>
                <td>{n.created_at ? new Date(n.created_at).toLocaleDateString() : "—"}</td>
                <td style={{ whiteSpace: "nowrap" }}>
                  <button className={styles.actionBtn} onClick={() => togglePublished(n)}>{n.is_published ? "Снять" : "Опубл."}</button>{" "}
                  <button className={styles.actionBtn} onClick={() => togglePinned(n)}>{n.pinned ? "Открепить" : "Закрепить"}</button>{" "}
                  <button className={`${styles.actionBtn} ${styles.danger}`} onClick={() => remove(n)}>Удал.</button>
                </td>
              </tr>
            ))}</tbody>
          </table>
          {news && news.length === 0 && <p className={styles.emptyState}>Новостей пока нет.</p>}
          {news === null && <p className={c.muted}>Загрузка…</p>}
        </div>
      </div>

      {preview && (
        <Modal title={preview.title} onClose={() => setPreview(null)} width={620}>
          <p className={c.muted} style={{ marginTop: 0 }}>{preview.is_global ? "Адресовано всем организациям" : `Адресовано ${preview.target_count} организациям`}{preview.pinned ? " · закреплено" : ""}</p>
          <div style={{ whiteSpace: "pre-wrap", lineHeight: 1.6, color: "var(--text-primary)" }}>{preview.body}</div>
        </Modal>
      )}
    </>
  );
}
