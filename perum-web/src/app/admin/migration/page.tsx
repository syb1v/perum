'use client';
import React, { useState, useEffect } from 'react';
import styles from '../page.module.css';

interface PromoteClass {
    class_id: number;
    class_name: string;
    grade_level: number;
    new_grade: number;
    new_name: string;
    student_count: number;
}

interface Grade9Student {
    id: number;
    login: string;
    name: string;
    decision: string;
}

interface Grade9Class {
    class_id: number;
    class_name: string;
    grade_level: number;
    student_count: number;
    students: Grade9Student[];
}

interface GraduateClass {
    class_id: number;
    class_name: string;
    grade_level: number;
    student_count: number;
    action: string;
}

interface Preview {
    promote: PromoteClass[];
    grade_9: Grade9Class[];
    graduate: GraduateClass[];
    total_students: number;
    to_promote: number;
    to_archive: number;
    to_decide: number;
}

export default function AcademicMigrationAdmin() {
    const [step, setStep] = useState<'loading' | 'preview' | 'confirm' | 'running' | 'done'>('loading');
    const [preview, setPreview] = useState<Preview | null>(null);
    const [decisions, setDecisions] = useState<Record<string, string>>({});
    const [result, setResult] = useState<any>(null);
    const [error, setError] = useState('');

    const headers = {
        'Authorization': `Bearer ${typeof window !== 'undefined' ? localStorage.getItem('auth_token') : ''}`,
        'Content-Type': 'application/json'
    };

    useEffect(() => {
        loadPreview();
    }, []);

    const loadPreview = async () => {
        setStep('loading');
        setError('');
        try {
            const res = await fetch('/api/admin/migration/preview', { headers });
            if (!res.ok) throw new Error('Ошибка загрузки');
            const data = await res.json();
            setPreview(data);

            // Init decisions: all 9-graders default to "promote"
            const initDec: Record<string, string> = {};
            for (const cls of data.grade_9) {
                for (const st of cls.students) {
                    initDec[st.id.toString()] = 'promote';
                }
            }
            setDecisions(initDec);
            setStep('preview');
        } catch (e: any) {
            setError(e.message);
            setStep('preview');
        }
    };

    const toggleDecision = (studentId: number) => {
        setDecisions(prev => ({
            ...prev,
            [studentId.toString()]: prev[studentId.toString()] === 'promote' ? 'archive' : 'promote'
        }));
    };

    const setAllDecisions = (classStudents: Grade9Student[], decision: string) => {
        setDecisions(prev => {
            const next = { ...prev };
            for (const st of classStudents) {
                next[st.id.toString()] = decision;
            }
            return next;
        });
    };

    const executeMigration = async () => {
        if (!confirm('⚠️ ВНИМАНИЕ! Это действие необратимо.\n\nВсе классы будут переведены на следующий год.\n11-классники уйдут в архив.\n\nПродолжить?')) return;
        setStep('running');
        try {
            const res = await fetch('/api/admin/migration/execute', {
                method: 'POST', headers,
                body: JSON.stringify({ grade_9_decisions: decisions })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.detail || 'Ошибка');
            setResult(data);
            setStep('done');
        } catch (e: any) {
            setError(e.message);
            setStep('preview');
        }
    };

    if (step === 'loading') {
        return (
            <div className={styles['admin-container']} style={{ justifyContent: 'center', alignItems: 'center' }}>
                <div style={{ textAlign: 'center', padding: 40 }}>
                    <div style={{ fontSize: 48, marginBottom: 16 }}>⏳</div>
                    <div style={{ color: 'var(--text-secondary)' }}>Анализ классов...</div>
                </div>
            </div>
        );
    }

    return (
        <div>
            <h1 className={styles['page-title']}>🎓 Миграция учебного года</h1>

            {error && (
                <div style={{ padding: 16, background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8, color: '#ef4444', marginBottom: 20 }}>
                    ❌ {error}
                </div>
            )}

            {step === 'done' && result && (
                <div className={styles.card}>
                    <div style={{ textAlign: 'center', padding: 32 }}>
                        <div style={{ fontSize: 64, marginBottom: 16 }}>✅</div>
                        <h2 style={{ marginBottom: 8, color: 'var(--text-primary)' }}>Миграция завершена!</h2>
                        <p style={{ color: 'var(--text-secondary)', fontSize: 18, marginBottom: 24 }}>{result.message}</p>
                        <div style={{ display: 'flex', justifyContent: 'center', gap: 32 }}>
                            <div style={{ textAlign: 'center' }}>
                                <div style={{ fontSize: 36, fontWeight: 700, color: '#22c55e' }}>{result.promoted}</div>
                                <div style={{ color: 'var(--text-muted)', fontSize: 14 }}>Переведено</div>
                            </div>
                            <div style={{ textAlign: 'center' }}>
                                <div style={{ fontSize: 36, fontWeight: 700, color: '#f59e0b' }}>{result.archived}</div>
                                <div style={{ color: 'var(--text-muted)', fontSize: 14 }}>В архив</div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {step === 'running' && (
                <div className={styles.card}>
                    <div style={{ textAlign: 'center', padding: 40 }}>
                        <div style={{ fontSize: 48, marginBottom: 16, animation: 'spin 1s linear infinite' }}>⚙️</div>
                        <h2 style={{ color: 'var(--text-primary)' }}>Выполняется миграция...</h2>
                        <p style={{ color: 'var(--text-muted)' }}>Не закрывайте страницу</p>
                    </div>
                </div>
            )}

            {(step === 'preview' || step === 'confirm') && preview && (
                <>
                    {/* Summary */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16, marginBottom: 24 }}>
                        <div className={styles.card} style={{ textAlign: 'center', padding: 20 }}>
                            <div style={{ fontSize: 32, fontWeight: 700, color: 'var(--text-primary)' }}>{preview.total_students}</div>
                            <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>Всего учеников</div>
                        </div>
                        <div className={styles.card} style={{ textAlign: 'center', padding: 20 }}>
                            <div style={{ fontSize: 32, fontWeight: 700, color: '#22c55e' }}>{preview.to_promote}</div>
                            <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>Будут переведены</div>
                        </div>
                        <div className={styles.card} style={{ textAlign: 'center', padding: 20 }}>
                            <div style={{ fontSize: 32, fontWeight: 700, color: '#f59e0b' }}>{preview.to_decide}</div>
                            <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>Ожидают решения (9 кл.)</div>
                        </div>
                        <div className={styles.card} style={{ textAlign: 'center', padding: 20 }}>
                            <div style={{ fontSize: 32, fontWeight: 700, color: '#ef4444' }}>{preview.to_archive}</div>
                            <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>В архив (11 кл.)</div>
                        </div>
                    </div>

                    {/* Standard promotion */}
                    {preview.promote.length > 0 && (
                        <div className={styles.card}>
                            <h2 style={{ marginBottom: 16, color: 'var(--text-primary)' }}>📚 Перевод (1–8, 10 классы)</h2>
                            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                <thead>
                                    <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
                                        <th style={{ textAlign: 'left', padding: '8px 12px', color: 'var(--text-muted)', fontWeight: 500, fontSize: 13 }}>Класс</th>
                                        <th style={{ textAlign: 'center', padding: '8px 12px', color: 'var(--text-muted)', fontWeight: 500, fontSize: 13 }}>Учеников</th>
                                        <th style={{ textAlign: 'center', padding: '8px 12px', color: 'var(--text-muted)', fontWeight: 500, fontSize: 13 }}>→</th>
                                        <th style={{ textAlign: 'left', padding: '8px 12px', color: 'var(--text-muted)', fontWeight: 500, fontSize: 13 }}>Новый класс</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {preview.promote.map(c => (
                                        <tr key={c.class_id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                                            <td style={{ padding: '10px 12px', color: 'var(--text-primary)', fontWeight: 500 }}>{c.class_name}</td>
                                            <td style={{ padding: '10px 12px', textAlign: 'center', color: 'var(--text-secondary)' }}>{c.student_count}</td>
                                            <td style={{ padding: '10px 12px', textAlign: 'center', color: '#22c55e', fontSize: 20 }}>→</td>
                                            <td style={{ padding: '10px 12px', color: '#22c55e', fontWeight: 600 }}>{c.new_name}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}

                    {/* Graduate */}
                    {preview.graduate.length > 0 && (
                        <div className={styles.card} style={{ marginTop: 20 }}>
                            <h2 style={{ marginBottom: 16, color: 'var(--text-primary)' }}>🎓 Выпуск (11 классы → Архив)</h2>
                            {preview.graduate.map(c => (
                                <div key={c.class_id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', background: 'rgba(239,68,68,0.05)', borderRadius: 8, marginBottom: 8 }}>
                                    <div>
                                        <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{c.class_name}</span>
                                        <span style={{ color: 'var(--text-muted)', marginLeft: 12 }}>{c.student_count} учеников</span>
                                    </div>
                                    <span style={{ color: '#ef4444', fontWeight: 500 }}>→ Архив</span>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* 9th grade fork */}
                    {preview.grade_9.length > 0 && (
                        <div className={styles.card} style={{ marginTop: 20 }}>
                            <h2 style={{ marginBottom: 8, color: 'var(--text-primary)' }}>🔀 Развилка (9 классы)</h2>
                            <p style={{ color: 'var(--text-muted)', marginBottom: 16, fontSize: 14 }}>
                                Выберите для каждого ученика: перевести в 10-й класс или отправить в архив
                            </p>

                            {preview.grade_9.map(cls => (
                                <div key={cls.class_id} style={{ marginBottom: 24 }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                                        <h3 style={{ color: 'var(--text-primary)' }}>{cls.class_name} ({cls.student_count} уч.)</h3>
                                        <div style={{ display: 'flex', gap: 8 }}>
                                            <button onClick={() => setAllDecisions(cls.students, 'promote')} style={{ padding: '4px 12px', fontSize: 12, background: 'rgba(34,197,94,0.1)', color: '#22c55e', border: '1px solid rgba(34,197,94,0.3)', borderRadius: 6, cursor: 'pointer' }}>
                                                Всех в 10-й
                                            </button>
                                            <button onClick={() => setAllDecisions(cls.students, 'archive')} style={{ padding: '4px 12px', fontSize: 12, background: 'rgba(239,68,68,0.1)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 6, cursor: 'pointer' }}>
                                                Всех в архив
                                            </button>
                                        </div>
                                    </div>

                                    <div style={{ display: 'grid', gap: 4 }}>
                                        {cls.students.map(st => {
                                            const d = decisions[st.id.toString()] || 'promote';
                                            return (
                                                <div key={st.id} style={{
                                                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                                    padding: '8px 12px', borderRadius: 6,
                                                    background: d === 'archive' ? 'rgba(239,68,68,0.05)' : 'rgba(34,197,94,0.05)',
                                                    border: `1px solid ${d === 'archive' ? 'rgba(239,68,68,0.15)' : 'rgba(34,197,94,0.15)'}`
                                                }}>
                                                    <span style={{ color: 'var(--text-primary)', fontSize: 14 }}>{st.name || st.login}</span>
                                                    <button onClick={() => toggleDecision(st.id)} style={{
                                                        padding: '4px 14px', fontSize: 12, borderRadius: 6, cursor: 'pointer', fontWeight: 500, border: 'none',
                                                        background: d === 'archive' ? '#ef4444' : '#22c55e',
                                                        color: '#fff'
                                                    }}>
                                                        {d === 'archive' ? 'Архив' : 'В 10-й'}
                                                    </button>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Execute button */}
                    {preview.total_students > 0 && (
                        <div style={{ marginTop: 24, display: 'flex', justifyContent: 'center' }}>
                            <button onClick={executeMigration} style={{
                                padding: '14px 40px', fontSize: 16, fontWeight: 600, borderRadius: 10,
                                background: 'linear-gradient(135deg, #ef4444, #dc2626)', color: '#fff',
                                border: 'none', cursor: 'pointer', boxShadow: '0 4px 15px rgba(239,68,68,0.3)'
                            }}>
                                ⚡ Начать миграцию
                            </button>
                        </div>
                    )}

                    {preview.total_students === 0 && (
                        <div className={styles.card} style={{ textAlign: 'center', padding: 40 }}>
                            <div style={{ fontSize: 48, marginBottom: 16 }}>📭</div>
                            <h3 style={{ color: 'var(--text-primary)' }}>Нет данных для миграции</h3>
                            <p style={{ color: 'var(--text-muted)' }}>Классы с grade_level не найдены или пусты</p>
                        </div>
                    )}
                </>
            )}
        </div>
    );
}
