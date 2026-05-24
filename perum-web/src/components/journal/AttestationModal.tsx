import React, { useState, useEffect } from 'react';
import api from '@/lib/apiClient';

interface AttestationPreviewResult {
    student_id: number;
    full_name: string;
    grades_count: number;
    average_grade: number | null;
    recommended_grade: string | null;
    status: 'ok' | 'not_enough_grades' | 'failing';
}

interface AttestationModalProps {
    classId: number;
    subjectId: number;
    periodId: number;
    onClose: () => void;
    onSuccess: () => void;
}

export default function AttestationModal({ classId, subjectId, periodId, onClose, onSuccess }: AttestationModalProps) {
    const [isBinary, setIsBinary] = useState(false);
    const [loading, setLoading] = useState(false);
    const [results, setResults] = useState<AttestationPreviewResult[]>([]);
    const [error, setError] = useState('');
    const [saving, setSaving] = useState(false);

    const loadPreview = async (binary: boolean) => {
        try {
            setLoading(true);
            setError('');
            const res = await api.post<{ success: boolean; results: AttestationPreviewResult[] }>(
                `/journal/${subjectId}/class/${classId}/attestation-preview`,
                { period_id: periodId, is_binary: binary }
            );
            setResults(res.results);
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } catch (err: any) {
            setError(err.response?.data?.detail || 'Ошибка загрузки данных аттестации');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadPreview(isBinary);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isBinary]);

    const handleFinalize = async () => {
        if (!confirm('Вы уверены, что хотите выставить итоговые оценки всем ученикам, подходящим под критерии?')) return;
        try {
            setSaving(true);
            setError('');
            const res = await api.post<{ success: boolean; message: string }>(
                `/journal/${subjectId}/class/${classId}/attestation-finalize`,
                { period_id: periodId, is_binary: isBinary }
            );
            alert(res.message);
            onSuccess();
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } catch (err: any) {
            setError(err.response?.data?.detail || 'Ошибка выставления оценок');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
            zIndex: 1000, display: 'flex', justifyContent: 'center', alignItems: 'center'
        }}>
            <div style={{
                background: 'var(--bg-primary)', padding: '24px', borderRadius: '16px',
                width: '100%', maxWidth: '800px', maxHeight: '90vh', overflowY: 'auto',
                border: '1px solid var(--border-color)', position: 'relative',
                boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)'
            }}>
                <button
                    onClick={onClose}
                    style={{ position: 'absolute', top: '24px', right: '24px', background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}
                >
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12" /></svg>
                </button>

                <h2 style={{ fontSize: '1.5rem', marginBottom: '8px', fontWeight: 600 }}>Аттестация класса</h2>
                <p style={{ color: 'var(--text-secondary)', marginBottom: '20px' }}>
                    Предварительный расчет итоговых оценок на основе системных критериев
                </p>

                <div style={{ marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <input
                        type="checkbox"
                        id="binaryToggle"
                        checked={isBinary}
                        onChange={(e) => setIsBinary(e.target.checked)}
                        style={{ width: '16px', height: '16px' }}
                    />
                    <label htmlFor="binaryToggle" style={{ cursor: 'pointer', fontWeight: 500 }}>
                        Промежуточная аттестация (Усвоил / Не усвоил)
                    </label>
                </div>

                {error && <div style={{ padding: '12px', background: '#fee2e2', color: '#dc2626', borderRadius: '8px', marginBottom: '20px' }}>{error}</div>}

                {loading ? (
                    <div style={{ display: 'flex', justifyContent: 'center', padding: '40px' }}>
                        <div style={{ width: '30px', height: '30px', borderRadius: '50%', border: '3px solid #f3f3f3', borderTop: '3px solid #2563eb', animation: 'spin 1s linear infinite' }}></div>
                    </div>
                ) : (
                    <>
                        <div style={{ overflowX: 'auto', marginBottom: '24px' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                                <thead>
                                    <tr style={{ borderBottom: '2px solid var(--border-color)', color: 'var(--text-secondary)' }}>
                                        <th style={{ padding: '12px 8px' }}>Ученик</th>
                                        <th style={{ padding: '12px 8px' }}>Кол-во оценок</th>
                                        <th style={{ padding: '12px 8px' }}>Ср. балл</th>
                                        <th style={{ padding: '12px 8px' }}>Рекомендуемая отметка</th>
                                        <th style={{ padding: '12px 8px' }}>Статус</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {results.map(r => (
                                        <tr key={r.student_id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                                            <td style={{ padding: '12px 8px', fontWeight: 500 }}>{r.full_name}</td>
                                            <td style={{ padding: '12px 8px' }}>{r.grades_count}</td>
                                            <td style={{ padding: '12px 8px' }}>{r.average_grade?.toFixed(2) || '—'}</td>
                                            <td style={{ padding: '12px 8px', fontWeight: 'bold' }}>{r.recommended_grade || '—'}</td>
                                            <td style={{ padding: '12px 8px' }}>
                                                {r.status === 'ok' && <span style={{ color: '#16a34a', padding: '4px 8px', background: '#dcfce7', borderRadius: '12px', fontSize: '13px' }}>Готов к аттестации</span>}
                                                {r.status === 'not_enough_grades' && <span style={{ color: '#ca8a04', padding: '4px 8px', background: '#fef9c3', borderRadius: '12px', fontSize: '13px' }}>Мало оценок</span>}
                                                {r.status === 'failing' && <span style={{ color: '#dc2626', padding: '4px 8px', background: '#fee2e2', borderRadius: '12px', fontSize: '13px' }}>Не успевает</span>}
                                            </td>
                                        </tr>
                                    ))}
                                    {results.length === 0 && (
                                        <tr>
                                            <td colSpan={5} style={{ padding: '24px', textAlign: 'center', color: 'var(--text-secondary)' }}>Ученики не найдены</td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
                            <button
                                onClick={onClose}
                                style={{ padding: '10px 20px', background: 'var(--bg-tertiary)', border: '1px solid var(--border-color)', borderRadius: '8px', cursor: 'pointer', fontWeight: 500, color: 'var(--text-primary)' }}
                            >
                                Отмена
                            </button>
                            <button
                                onClick={handleFinalize}
                                disabled={saving || results.length === 0}
                                style={{
                                    padding: '10px 20px', background: '#2563eb', color: 'white', border: 'none', borderRadius: '8px',
                                    cursor: saving || results.length === 0 ? 'not-allowed' : 'pointer', fontWeight: 500, opacity: saving || results.length === 0 ? 0.7 : 1
                                }}
                            >
                                {saving ? 'Выставление...' : 'Автоматически выставить оценки'}
                            </button>
                        </div>
                    </>
                )}
            </div>
            <style dangerouslySetInnerHTML={{
                __html: `
                @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
            `}} />
        </div>
    );
}
