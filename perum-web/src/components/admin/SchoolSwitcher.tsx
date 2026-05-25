'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import api from '@/lib/apiClient';

interface School {
  id: number;
  name: string;
  is_active: boolean;
  students_count: number;
  classes_count: number;
}

/**
 * Переключатель школ для org_admin: выбирает «текущую школу», под которой работает
 * вся админка/журнал/аналитика. Выбор хранится в localStorage и шлётся как
 * X-School-Id (см. apiClient). Для остальных ролей не отображается.
 */
export default function SchoolSwitcher() {
  const { user } = useAuth();
  const [schools, setSchools] = useState<School[]>([]);
  const [current, setCurrent] = useState<string>('');

  const isOrgAdmin = (user?.role as string | undefined) === 'org_admin';

  useEffect(() => {
    if (!isOrgAdmin) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await api.get<{ schools: School[] }>('/admin/schools');
        if (cancelled) return;
        setSchools(res.schools || []);
        const saved = localStorage.getItem('current_school_id');
        const valid = res.schools?.find((s) => String(s.id) === saved);
        const initial = valid ? saved! : (res.schools?.[0] ? String(res.schools[0].id) : '');
        setCurrent(initial);
        if (initial) localStorage.setItem('current_school_id', initial);
      } catch {
        /* тихо: переключатель просто не покажется */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isOrgAdmin]);

  if (!isOrgAdmin || schools.length === 0) return null;

  const onChange = (value: string) => {
    setCurrent(value);
    localStorage.setItem('current_school_id', value);
    // Перезагружаем, чтобы все экраны перезапросили данные под выбранную школу.
    window.location.reload();
  };

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '0.5rem',
        padding: '0.5rem 1rem',
        background: '#0f172a',
        color: '#e2e8f0',
        borderRadius: '0.5rem',
        margin: '0.75rem 1rem',
      }}
    >
      <span style={{ fontSize: '0.85rem', opacity: 0.8 }}>🏫 Школа:</span>
      <select
        value={current}
        onChange={(e) => onChange(e.target.value)}
        style={{
          background: '#1e293b',
          color: '#e2e8f0',
          border: '1px solid #334155',
          borderRadius: '0.375rem',
          padding: '0.35rem 0.6rem',
          fontSize: '0.9rem',
          cursor: 'pointer',
        }}
      >
        {schools.map((s) => (
          <option key={s.id} value={String(s.id)}>
            {s.name}
            {s.is_active ? '' : ' (неактивна)'} — {s.students_count} уч., {s.classes_count} кл.
          </option>
        ))}
      </select>
    </div>
  );
}
