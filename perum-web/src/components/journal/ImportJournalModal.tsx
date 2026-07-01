import React, { useState, useRef, useCallback } from 'react';
import api from '@/lib/apiClient';

interface Props {
    classId: number;
    subjectId: number;
    onClose: () => void;
    onSuccess: () => void;
}

interface ParsedGradeRaw {
    student_name: string;
    date: string;
    acronym: string;
    grade_value: number | null;
    attendance_mark: string | null;
    original_cell_text: string;
}

interface ParsingPreviewResponse {
    subject_raw_name: string | null;
    class_raw_name: string | null;
    unique_acronyms: string[];
    unique_dates: string[];
    student_names: string[];
    preview_grades: ParsedGradeRaw[];
    total_grades_found: number;
    validation_errors: string[];
}

export default function ImportJournalModal({ classId, subjectId, onClose, onSuccess }: Props) {
    const [step, setStep] = useState<1 | 2 | 3>(1);
    const [file, setFile] = useState<File | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    
    // Step 2 Data
    const [preview, setPreview] = useState<ParsingPreviewResponse | null>(null);
    const [mapping, setMapping] = useState<Record<string, number>>({});
    
    // Work types for mapping
    const [workTypes, setWorkTypes] = useState<{ id: number, name: string }[]>([]);
    
    // Step 3 Data
    const [execResult, setExecResult] = useState<any>(null);

    // Debug infinite scroll
    const [debugPage, setDebugPage] = useState(1);
    const DEBUG_PAGE_SIZE = 20;
    const sentinelRef = useRef<HTMLDivElement>(null);

    const fileInputRef = useRef<HTMLInputElement>(null);

    // Fetch work types on mount
    React.useEffect(() => {
        api.get<{ work_types: { id: number, name: string }[] }>('/journal/work-types')
            .then(res => setWorkTypes(res.work_types || []))
            .catch(() => {});
    }, []);

    // Infinite scroll sentinel observer for debug view
    React.useEffect(() => {
        if (!sentinelRef.current || !preview) return;
        const observer = new IntersectionObserver((entries) => {
            if (entries[0].isIntersecting) {
                setDebugPage(p => p + 1);
            }
        }, { threshold: 0.1 });
        observer.observe(sentinelRef.current);
        return () => observer.disconnect();
    }, [preview, step]);

    // Reset debug page when preview changes
    React.useEffect(() => { setDebugPage(1); }, [preview]);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            setFile(e.target.files[0]);
            setError(null);
        }
    };

    const handleAnalyze = async () => {
        if (!file) return;
        setLoading(true);
        setError(null);
        
        try {
            const formData = new FormData();
            formData.append('file', file);
            
            const res = await api.postFormData<ParsingPreviewResponse>(`/journal/import/analyze/${classId}/${subjectId}`, formData);
            
            setPreview(res);

            // Маппинг всегда начинается пустым — учитель сам выбирает при каждом импорте
            const emptyMap: Record<string, number> = {};
            res.unique_acronyms.forEach(acro => { emptyMap[acro] = 0; });
            setMapping(emptyMap);

            setStep(2);
        } catch (err: any) {
            setError(err.message || 'Ошибка парсинга файла. Убедитесь, что это корректный PDF.');
        } finally {
            setLoading(false);
        }
    };

    const handleExecute = async () => {
        if (!file || Object.keys(mapping).length === 0) return;
        setLoading(true);
        setError(null);
        
        try {
            const formData = new FormData();
            formData.append('file', file);
            formData.append('mapping', JSON.stringify(mapping));
            
            const res = await api.postFormData<any>(`/journal/import/execute/${classId}/${subjectId}`, formData);
            
            setExecResult(res);
            setStep(3);
        } catch (err: any) {
            setError(err.message || 'Ошибка во время импорта оценок.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
            <div style={{ background: 'var(--bg-card)', padding: '24px', borderRadius: '12px', width: '100%', maxWidth: '700px', border: '1px solid var(--border-color)', maxHeight: '90vh', overflowY: 'auto' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                    <h2 style={{ fontSize: '1.25rem', fontWeight: 600 }}>Импорт ведомости</h2>
                    <button onClick={onClose} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}>
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
                    </button>
                </div>

                {error && (
                    <div style={{ backgroundColor: '#fee2e2', color: '#dc2626', padding: '12px', borderRadius: '8px', marginBottom: '20px', border: '1px solid #fecaca' }}>
                        {error}
                    </div>
                )}

                {step === 1 && (
                    <div>
                        <p style={{ color: 'var(--text-secondary)', marginBottom: '16px' }}>
                            Загрузите PDF-файл выгрузки журнала (поддерживаются форматы Excel/CSV в будущем, сейчас только PDF).
                        </p>
                        
                        <div 
                            style={{ 
                                border: '2px dashed var(--border-color)', borderRadius: '12px', padding: '40px', 
                                textAlign: 'center', cursor: 'pointer', backgroundColor: 'var(--bg-tertiary)',
                                marginBottom: '20px'
                            }}
                            onClick={() => fileInputRef.current?.click()}
                        >
                            <input 
                                type="file" 
                                accept=".pdf" 
                                style={{ display: 'none' }} 
                                ref={fileInputRef}
                                onChange={handleFileChange}
                            />
                            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ color: 'var(--text-secondary)', marginBottom: '12px' }}>
                                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                                <polyline points="17 8 12 3 7 8" />
                                <line x1="12" y1="3" x2="12" y2="15" />
                            </svg>
                            <h3 style={{ fontSize: '1.1rem', fontWeight: 500, marginBottom: '8px' }}>
                                {file ? file.name : "Нажмите или перетащите файл"}
                            </h3>
                            <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Только PDF до 5 МБ</p>
                        </div>
                        
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
                            <button onClick={onClose} style={{ padding: '10px 16px', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'transparent', cursor: 'pointer', color: 'var(--text-primary)' }}>
                                Отмена
                            </button>
                            <button 
                                onClick={handleAnalyze} 
                                disabled={!file || loading}
                                style={{ padding: '10px 16px', borderRadius: '8px', border: 'none', background: 'var(--accent-primary)', color: 'white', cursor: (!file || loading) ? 'not-allowed' : 'pointer', fontWeight: 500, opacity: (!file || loading) ? 0.7 : 1 }}
                            >
                                {loading ? 'Анализ...' : 'Продолжить'}
                            </button>
                        </div>
                    </div>
                )}

                {step === 2 && preview && (
                    <div>
                        <div style={{ backgroundColor: 'var(--bg-tertiary)', padding: '16px', borderRadius: '8px', marginBottom: '20px' }}>
                            <h3 style={{ fontWeight: 600, fontSize: '1.05rem', marginBottom: '8px' }}>Результаты анализа</h3>
                            <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
                                Найдено учеников: <strong style={{ color: 'var(--text-primary)'}}>{preview.student_names.length}</strong><br/>
                                Найдено оценок для импорта: <strong style={{ color: 'var(--text-primary)'}}>{preview.total_grades_found}</strong>
                            </p>
                        </div>

                        <h3 style={{ fontWeight: 600, fontSize: '1.05rem', marginBottom: '12px' }}>Маппинг типов работ</h3>
                        <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', marginBottom: '16px' }}>
                            Система нашла следующие сокращения типов работ в шапке (или выставленные "Д/З" по умолчанию). Укажите, к какому типу работы в ПЭРУМе их привязать:
                        </p>
                        
                        {/* Прогресс маппинга */}
                        {(() => {
                            const total = preview.unique_acronyms.length;
                            const done = Object.values(mapping).filter(v => v > 0).length;
                            const allDone = done === total;
                            return (
                                <div style={{
                                    display: 'flex', alignItems: 'center', gap: '10px',
                                    marginBottom: '16px', padding: '10px 14px',
                                    borderRadius: '8px',
                                    background: allDone ? 'rgba(22,163,74,0.12)' : 'rgba(234,179,8,0.10)',
                                    border: `1px solid ${allDone ? '#16a34a' : '#ca8a04'}`,
                                }}>
                                    <span style={{ fontSize: '1.2rem' }}>{allDone ? '✅' : '⚠️'}</span>
                                    <span style={{ fontSize: '0.9rem', color: allDone ? '#16a34a' : '#ca8a04', fontWeight: 500 }}>
                                        Назначено {done} из {total} сокращений
                                        {!allDone && ' — заполните все перед импортом'}
                                    </span>
                                </div>
                            );
                        })()}

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '24px' }}>
                            {preview.unique_acronyms.map((acro) => (
                                <div key={acro} style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                                    <div style={{ width: '40%', padding: '10px', background: 'var(--bg-tertiary)', borderRadius: '6px', fontWeight: 500 }}>
                                        {acro}
                                    </div>
                                    <div style={{ color: 'var(--text-secondary)' }}>➔</div>
                                    <select 
                                        value={mapping[acro] || ''}
                                        onChange={(e) => setMapping({...mapping, [acro]: Number(e.target.value)})}
                                        style={{ flex: 1, padding: '10px', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'var(--bg-input)', color: 'var(--text-primary)' }}
                                    >
                                        <option value="" disabled>Выберите тип...</option>
                                        {workTypes.map(w => (
                                            <option key={w.id} value={w.id}>{w.name}</option>
                                        ))}
                                    </select>
                                </div>
                            ))}
                        </div>

                        {/* Visually debug view block - infinite scroll */}
                        <div>
                            <h4 style={{ fontSize: '0.95rem', fontWeight: 500, marginBottom: '8px', color: 'var(--text-secondary)' }}>Пример того, что мы распарсили (Debug)</h4>
                            <div style={{ height: '220px', overflowY: 'auto', border: '1px solid var(--border-color)', borderRadius: '6px', padding: '12px', fontSize: '0.85rem' }}>
                                {preview.preview_grades.slice(0, debugPage * DEBUG_PAGE_SIZE).map((g, i) => (
                                    <div key={i} style={{ padding: '5px 0', borderBottom: '1px solid var(--border-color)' }}>
                                        <b>{g.student_name}</b> ({g.date}): {g.original_cell_text} ➔&nbsp;
                                        <span style={{ color: 'var(--accent-primary)' }}>
                                            {g.grade_value ? `Оценка ${g.grade_value}` : g.attendance_mark ? `Пометка ${g.attendance_mark}` : '—'}
                                        </span>
                                    </div>
                                ))}
                                {/* Sentinel — triggers next page load when visible */}
                                {debugPage * DEBUG_PAGE_SIZE < preview.preview_grades.length && (
                                    <div ref={sentinelRef} style={{ height: '20px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                        <span style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>Загрузка...</span>
                                    </div>
                                )}
                            </div>
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '24px' }}>
                            <button onClick={() => setStep(1)} style={{ padding: '10px 16px', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'transparent', cursor: 'pointer', color: 'var(--text-primary)' }}>
                                Назад
                            </button>
                            <button 
                                onClick={handleExecute} 
                                disabled={loading || !Object.values(mapping).every(v => v > 0)}
                                style={{ padding: '10px 24px', borderRadius: '8px', border: 'none', background: '#16a34a', color: 'white', cursor: (loading || !Object.values(mapping).every(v => v > 0)) ? 'not-allowed' : 'pointer', fontWeight: 500 }}
                            >
                                {loading ? 'Импорт...' : 'Подтвердить и импортировать'}
                            </button>
                        </div>
                    </div>
                )}

                {step === 3 && execResult && (
                    <div style={{ textAlign: 'center' }}>
                        <div style={{ width: '64px', height: '64px', borderRadius: '50%', background: '#dcfce7', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
                            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                        </div>
                        
                        <h2 style={{ fontSize: '1.5rem', fontWeight: 600, marginBottom: '8px' }}>Импорт успешно завершён</h2>
                        <p style={{ color: 'var(--text-secondary)', marginBottom: '24px' }}>
                            Журнал обновлён по датам, которые покрывает файл. Ручные оценки сохранены, прежние PDF-импорты в этом диапазоне заменены.
                        </p>

                        <div style={{ display: 'flex', gap: '16px', justifyContent: 'center', marginBottom: '24px', flexWrap: 'wrap' }}>
                            <div style={{ background: 'var(--bg-tertiary)', padding: '16px 24px', borderRadius: '8px', textAlign: 'center' }}>
                                <div style={{ fontSize: '1.75rem', fontWeight: 700, color: '#16a34a' }}>
                                    {execResult.added_count || 0}
                                </div>
                                <div style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Добавлено</div>
                            </div>
                            {(execResult.replaced_count ?? 0) > 0 && (
                                <div style={{ background: 'var(--bg-tertiary)', padding: '16px 24px', borderRadius: '8px', textAlign: 'center' }}>
                                    <div style={{ fontSize: '1.75rem', fontWeight: 700, color: '#0ea5e9' }}>
                                        {execResult.replaced_count}
                                    </div>
                                    <div style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Заменено<br/>(из прошлого PDF)</div>
                                </div>
                            )}
                            {(execResult.skipped_count ?? 0) > 0 && (
                                <div style={{ background: 'var(--bg-tertiary)', padding: '16px 24px', borderRadius: '8px', textAlign: 'center' }}>
                                    <div style={{ fontSize: '1.75rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                                        {execResult.skipped_count}
                                    </div>
                                    <div style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Пропущено</div>
                                </div>
                            )}
                        </div>

                        {execResult.logs && execResult.logs.length > 0 && (
                            <div style={{ textAlign: 'left', background: 'var(--bg-tertiary)', padding: '12px', borderRadius: '8px', maxHeight: '150px', overflowY: 'auto', marginBottom: '24px', fontSize: '0.85rem' }}>
                                <h4 style={{ fontWeight: 600, marginBottom: '8px' }}>Логи и предупреждения:</h4>
                                {execResult.logs.map((log: any, i: number) => (
                                    <div key={i} style={{ color: log.level === 'error' ? '#dc2626' : log.level === 'warning' ? '#ca8a04' : 'var(--text-secondary)', padding: '2px 0' }}>
                                        <b>[{log.student_name} {log.date}]</b> {log.message}
                                    </div>
                                ))}
                            </div>
                        )}
                        
                        <button 
                            onClick={() => {
                                onClose();
                                onSuccess();
                            }}
                            style={{ padding: '12px 32px', borderRadius: '8px', border: 'none', background: 'var(--accent-primary)', color: 'white', cursor: 'pointer', fontWeight: 500, fontSize: '1.1rem' }}
                        >
                            Закрыть и обновить журнал
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}
