'use client';
import React, { useState, useEffect } from 'react';
import styles from '../page.module.css';

interface Appeal {
  id: number;
  student_name: string;
  teacher_name: string;
  grade_value: number;
  reason: string;
  status: 'pending' | 'approved' | 'rejected';
  created_at: string;
}

export default function GradeAppealsManagement() {
  const [appeals, setAppeals] = useState<Appeal[]>([]);
  const [loading, setLoading] = useState(true);

  // Stubbing for visual demonstration of the requested feature
  useEffect(() => {
    setTimeout(() => {
      setAppeals([
        {
          id: 1,
          student_name: 'Иван Иванов (9А)',
          teacher_name: 'Петр Петров (Математика)',
          grade_value: 3,
          reason: 'Не был учтен устный ответ на прошлом уроке',
          status: 'pending',
          created_at: new Date().toISOString()
        }
      ]);
      setLoading(false);
    }, 500);
  }, []);

  if (loading) return <div>Загрузка апелляций...</div>;

  return (
    <div className={styles['admin-container']}>
      <h1 className={styles['page-title']}>Разбор апелляций (Оспаривание оценок)</h1>
      <p style={{marginBottom: '2rem'}}>Здесь директор или завуч(school_admin) может просматривать и модерировать спорные оценки.</p>

      <div className={styles['grid-container']}>
        {appeals.map(appeal => (
          <div key={appeal.id} style={{ background: 'white', padding: '1.5rem', borderRadius: '0.5rem', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', borderLeft: '4px solid #f59e0b' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem' }}>
              <strong>Оценка: {appeal.grade_value}</strong>
              <span style={{ padding: '0.25rem 0.5rem', background: '#fef3c7', color: '#b45309', borderRadius: '0.25rem', fontSize: '0.875rem' }}>Ожидает решения</span>
            </div>
            <p><strong>Ученик:</strong> {appeal.student_name}</p>
            <p><strong>Учитель:</strong> {appeal.teacher_name}</p>
            <div style={{ margin: '1rem 0', padding: '1rem', background: '#f8fafc', borderRadius: '0.375rem' }}>
              <em>"{appeal.reason}"</em>
            </div>
            <div style={{ display: 'flex', gap: '1rem' }}>
              <button style={{ padding: '0.5rem 1rem', background: '#10b981', color: 'white', border: 'none', borderRadius: '0.25rem', cursor: 'pointer' }}>Одобрить изменение</button>
              <button style={{ padding: '0.5rem 1rem', background: '#ef4444', color: 'white', border: 'none', borderRadius: '0.25rem', cursor: 'pointer' }}>Отклонить апелляцию</button>
            </div>
          </div>
        ))}
        {appeals.length === 0 && <p>Нет ожидающих апелляций.</p>}
      </div>
    </div>
  );
}
