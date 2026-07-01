'use client';
import React, { useState, useEffect, useCallback } from 'react';
import styles from '../page.module.css';
import api from '@/lib/apiClient';
import { useToast } from '@/context/ToastContext';

interface Appeal {
  id: number;
  grade_id: number;
  grade_value: number | null;
  subject_name: string | null;
  student_id: number;
  student_name: string;
  teacher_id: number;
  teacher_name: string;
  reason: string;
  status: 'pending' | 'approved' | 'rejected';
  teacher_comment: string | null;
  created_at: string;
  resolved_at: string | null;
}

const STATUS_LABEL: Record<Appeal['status'], string> = {
  pending: 'Ожидает решения',
  approved: 'Одобрена',
  rejected: 'Отклонена',
};
const STATUS_COLOR: Record<Appeal['status'], { bg: string; fg: string; border: string }> = {
  pending: { bg: '#fef3c7', fg: '#b45309', border: '#f59e0b' },
  approved: { bg: '#d1fae5', fg: '#047857', border: '#10b981' },
  rejected: { bg: '#fee2e2', fg: '#b91c1c', border: '#ef4444' },
};

export default function GradeAppealsManagement() {
  const { showSuccess, showError } = useToast();
  const [appeals, setAppeals] = useState<Appeal[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<number | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await api.get<{ appeals: Appeal[] }>('/appeals');
      setAppeals(res.appeals || []);
    } catch {
      showError('Не удалось загрузить апелляции');
    } finally {
      setLoading(false);
    }
  }, [showError]);

  useEffect(() => {
    load();
  }, [load]);

  const resolve = async (id: number, status: 'approved' | 'rejected') => {
    let comment: string | null = null;
    if (status === 'rejected') {
      comment = window.prompt('Комментарий к решению (необязательно):') || null;
    }
    setBusyId(id);
    try {
      await api.post(`/appeals/${id}/resolve`, { status, teacher_comment: comment });
      showSuccess(status === 'approved' ? 'Апелляция одобрена' : 'Апелляция отклонена');
      await load();
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Ошибка при сохранении решения');
    } finally {
      setBusyId(null);
    }
  };

  if (loading) return <div>Загрузка апелляций...</div>;

  return (
    <div className={styles['admin-container']}>
      <h1 className={styles['page-title']}>Разбор апелляций (Оспаривание оценок)</h1>
      <p style={{ marginBottom: '2rem' }}>
        Директор или завуч (school_admin) рассматривает спорные оценки: ученик или родитель оспаривает оценку,
        здесь её можно одобрить или отклонить с комментарием.
      </p>

      <div className={styles['grid-container']}>
        {appeals.map((appeal) => {
          const c = STATUS_COLOR[appeal.status];
          return (
            <div
              key={appeal.id}
              style={{
                background: 'white',
                padding: '1.5rem',
                borderRadius: '0.5rem',
                boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
                borderLeft: `4px solid ${c.border}`,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem' }}>
                <strong>
                  Оценка: {appeal.grade_value ?? '—'}
                  {appeal.subject_name ? ` · ${appeal.subject_name}` : ''}
                </strong>
                <span
                  style={{
                    padding: '0.25rem 0.5rem',
                    background: c.bg,
                    color: c.fg,
                    borderRadius: '0.25rem',
                    fontSize: '0.875rem',
                  }}
                >
                  {STATUS_LABEL[appeal.status]}
                </span>
              </div>
              <p><strong>Ученик:</strong> {appeal.student_name}</p>
              <p><strong>Учитель:</strong> {appeal.teacher_name}</p>
              <div style={{ margin: '1rem 0', padding: '1rem', background: '#f8fafc', borderRadius: '0.375rem' }}>
                <em>&laquo;{appeal.reason}&raquo;</em>
              </div>
              {appeal.teacher_comment && (
                <p style={{ color: '#64748b' }}><strong>Комментарий:</strong> {appeal.teacher_comment}</p>
              )}
              {appeal.status === 'pending' && (
                <div style={{ display: 'flex', gap: '1rem', marginTop: '0.5rem' }}>
                  <button
                    disabled={busyId === appeal.id}
                    onClick={() => resolve(appeal.id, 'approved')}
                    style={{ padding: '0.5rem 1rem', background: '#10b981', color: 'white', border: 'none', borderRadius: '0.25rem', cursor: 'pointer' }}
                  >
                    Одобрить
                  </button>
                  <button
                    disabled={busyId === appeal.id}
                    onClick={() => resolve(appeal.id, 'rejected')}
                    style={{ padding: '0.5rem 1rem', background: '#ef4444', color: 'white', border: 'none', borderRadius: '0.25rem', cursor: 'pointer' }}
                  >
                    Отклонить
                  </button>
                </div>
              )}
            </div>
          );
        })}
        {appeals.length === 0 && <p>Нет апелляций.</p>}
      </div>
    </div>
  );
}
