'use client';

import { useEffect, useState } from 'react';
import api from '@/lib/apiClient';

type Ambiguity = { reason: string; table?: string; ids?: number[]; class_id?: number; subject_id?: number; lesson_date?: string; source_rows?: Record<string, number[]>; candidates?: Array<Record<string, number>>; total_count?: number };
type Plan = { plan_token: string; ambiguity_token: string; summary: { groups: number; safe_groups: number; ambiguous_groups: number; occurrences_to_create: number; rows_to_link: number }; ambiguities: Ambiguity[] };
const labels: Record<string, string> = { missing_legacy_date: 'Нет даты урока', no_schedule_candidate: 'Нет кандидата в расписании', multiple_schedule_candidates: 'Несколько подходящих уроков', multiple_existing_occurrences: 'Несколько экземпляров урока', slot_occupied_by_other_subject: 'Слот занят другим предметом', unsupported_homework_semantics: 'Legacy ДЗ требует ручного решения', metadata_conflict: 'Конфликт темы или типа работы', invalid_school_scope: 'Нарушена школьная область данных' };

export default function OccurrenceBackfillPage() {
  const [plan, setPlan] = useState<Plan | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  async function load() { setBusy(true); setMessage(''); try { setPlan(await api.get<Plan>('/admin/maintenance/occurrence-backfill')); setConfirmed(false); } catch (error) { setMessage(error instanceof Error ? error.message : 'Не удалось построить план'); } finally { setBusy(false); } }
  useEffect(() => { void load(); }, []);
  async function apply() { if (!plan || !confirmed) return; setBusy(true); try { const result = await api.post<{ occurrences_created: number; rows_linked: number }>('/admin/maintenance/occurrence-backfill', { plan_token: plan.plan_token, ambiguity_token: plan.ambiguities.length ? plan.ambiguity_token : undefined }); setMessage(`Создано уроков: ${result.occurrences_created}, связано записей: ${result.rows_linked}`); await load(); } catch (error) { setMessage(error instanceof Error ? `${error.message}. Отчёт и план обновлены.` : 'План изменился'); await load(); } finally { setBusy(false); } }
  return <main style={{ maxWidth: 1000, margin: '0 auto', padding: 32 }}>
    <h1>Привязка учебной истории к урокам</h1>
    <p>Система применит только однозначные связи. ДЗ и спорные группы останутся без изменений.</p>
    {message && <p>{message}</p>}
    {busy && !plan ? <p>Строим план…</p> : null}
    {plan && <>
      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(170px,1fr))', gap: 12, margin: '24px 0' }}>
        {Object.entries(plan.summary).map(([key, value]) => <div key={key} style={{ padding: 16, border: '1px solid #ddd', borderRadius: 12 }}><strong>{value}</strong><div>{key}</div></div>)}
      </section>
      <h2>Требуют ручного решения: {plan.ambiguities.length}</h2>
      {plan.ambiguities.map((item, index) => <article key={`${item.reason}-${index}`} style={{ padding: 16, marginBottom: 10, border: '1px solid #e2b6b6', borderRadius: 12 }}><strong>{labels[item.reason] ?? item.reason}</strong><div>Класс: {item.class_id ?? '—'}, предмет: {item.subject_id ?? '—'}, дата: {item.lesson_date ?? '—'}</div>{item.total_count ? <div>Записей: {item.total_count}</div> : null}<pre style={{ whiteSpace: 'pre-wrap' }}>{JSON.stringify({ sources: item.source_rows ?? item.ids, candidates: item.candidates }, null, 2)}</pre></article>)}
      <label style={{ display: 'flex', gap: 8, margin: '24px 0' }}><input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} /> Я проверил отчёт и разрешаю применить только безопасные группы</label>
      <button disabled={busy || !confirmed || plan.summary.safe_groups === 0} onClick={() => void apply()}>{busy ? 'Применяем…' : `Применить ${plan.summary.safe_groups} безопасных групп`}</button>{' '}
      <button disabled={busy} onClick={() => void load()}>Обновить preview</button>
    </>}
  </main>;
}
