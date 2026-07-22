import React, { useState, useEffect } from 'react';
import Modal from '@/components/ui/Modal';
import api from '@/lib/apiClient';
import type { Topic, Subject } from '@/types';
import type { components } from '@perum/api-schema/tenant';
import styles from '../../app/teacher/journal/page.module.css';

type JournalWorkTypes = components['schemas']['JournalWorkTypesOut'];
type JournalWorkType = components['schemas']['JournalWorkTypeOut'];

interface DayTemplateModalProps {
    date: string;
    subject: Subject;
    initialWorkTypeId?: string;
    initialTopicId?: string;
    lessonNumbers: number[];
    initialLessonNumber: number;
    hasTemplate: boolean;
    onLessonChange: (lessonNumber: number) => void;
    onSave: (workTypeId: string, topicId: string, lessonNumber: number) => void | Promise<void>;
    onClear: (lessonNumber: number) => void | Promise<void>;
    onClose: () => void;
}

export default function DayTemplateModal({
    date, subject, initialWorkTypeId, initialTopicId, lessonNumbers, initialLessonNumber,
    hasTemplate, onLessonChange, onSave, onClear, onClose
}: DayTemplateModalProps) {
    const [workTypes, setWorkTypes] = useState<JournalWorkType[]>([]);
    const [topics, setTopics] = useState<Topic[]>([]);
    const [workTypeId, setWorkTypeId] = useState(initialWorkTypeId || '');
    const [topicId, setTopicId] = useState(initialTopicId || '');
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const [optionsLoading, setOptionsLoading] = useState(true);
    const [optionsError, setOptionsError] = useState('');
    const [reload, setReload] = useState(0);

    useEffect(() => {
        setOptionsLoading(true);
        setOptionsError('');
        Promise.all([
            api.get<JournalWorkTypes>('/journal/work-types'),
            api.get<{ topics: Topic[] }>(`/journal/subjects/${subject.id}/topics`),
        ]).then(([data, topicData]) => {
                if (data.work_types) {
                    setWorkTypes(data.work_types);
                    if (!initialWorkTypeId && data.work_types.length > 0) {
                        setWorkTypeId(data.work_types[0].id.toString());
                    }
                }
                setTopics(topicData.topics || []);
            }).catch(err => setOptionsError(err instanceof Error ? err.message : 'Не удалось загрузить параметры'))
            .finally(() => setOptionsLoading(false));
    }, [subject.id, initialWorkTypeId, reload]);

    useEffect(() => {
        setWorkTypeId(initialWorkTypeId || '');
        setTopicId(initialTopicId || '');
    }, [initialWorkTypeId, initialTopicId]);

    const handleSave = async () => {
        const wt = workTypes.find(w => w.id.toString() === workTypeId);
        if (wt) {
            const shortName = wt.name.split(' ').map((word, i) => i < 2 ? word.substring(0, 1).toUpperCase() : '').join('');
            setSaving(true);
            setError('');
            try {
                await onSave(workTypeId, topicId, initialLessonNumber);
            } catch (err) {
                setError(err instanceof Error ? err.message : 'Не удалось сохранить шаблон');
                setSaving(false);
            }
        }
    };

    const handleClear = async () => {
        setSaving(true);
        setError('');
        try {
            await onClear(initialLessonNumber);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Не удалось сбросить шаблон');
            setSaving(false);
        }
    };

    return (
        <Modal isOpen={true} onClose={onClose} title={`Шаблон урока: ${new Date(date).toLocaleDateString('ru-RU')}, урок ${initialLessonNumber}`} size="default">
            <div className={styles.modalBody}>
                <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', marginBottom: '16px' }}>
                    Тип работы и тема будут подставляться в новые оценки этого урока автоматически.
                </p>

                {lessonNumbers.length > 1 && <div className={styles.formGroup} style={{ marginBottom: '16px' }}>
                    <label>Номер урока</label>
                    <select className={styles.select} value={initialLessonNumber} onChange={e => onLessonChange(Number(e.target.value))}>
                        {lessonNumbers.map(number => <option key={number} value={number}>Урок {number}</option>)}
                    </select>
                </div>}

                {optionsLoading && <p>Загрузка параметров...</p>}
                {optionsError && <div><p style={{ color: 'var(--error)' }}>{optionsError}</p><button className={styles.btnSecondary} onClick={() => setReload(value => value + 1)}>Повторить</button></div>}

                <div className={styles.formGroup} style={{ marginBottom: '16px' }}>
                    <label style={{ display: 'block', marginBottom: '6px', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>Тип работы (по умолчанию)</label>
                    <select
                        className={styles.select}
                        style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--bg-input)', color: 'var(--text-primary)' }}
                        value={workTypeId}
                        onChange={e => setWorkTypeId(e.target.value)}
                    >
                        {workTypes.map(wt => (
                            <option key={wt.id} value={wt.id}>{wt.name} (x{wt.weight})</option>
                        ))}
                    </select>
                </div>

                <div className={styles.formGroup} style={{ marginBottom: '24px' }}>
                    <label style={{ display: 'block', marginBottom: '6px', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>Тема (по умолчанию)</label>
                    <select
                        className={styles.select}
                        style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--bg-input)', color: 'var(--text-primary)' }}
                        value={topicId}
                        onChange={e => setTopicId(e.target.value)}
                    >
                        <option value="">Без привязки к теме</option>
                        {topics.map(t => (
                            <option key={t.id} value={t.id}>{t.name}</option>
                        ))}
                    </select>
                </div>

                <div style={{ display: 'flex', gap: '10px' }}>
                    {error && <p style={{ color: 'var(--error)', margin: 0 }}>{error}</p>}
                    <button
                        className={styles.btnSecondary}
                        style={{ flex: 1, padding: '10px', background: 'var(--bg-tertiary)', border: '1px solid var(--border-color)', borderRadius: '8px', color: 'var(--text-primary)', cursor: 'pointer' }}
                        onClick={handleClear}
                        disabled={saving || !hasTemplate}
                    >
                        Отключить автоподстановку
                    </button>
                    <button
                        className={styles.btnPrimary}
                        style={{ flex: 2, padding: '10px', background: 'var(--accent-primary)', border: 'none', borderRadius: '8px', color: '#fff', cursor: 'pointer', fontWeight: 600 }}
                        onClick={handleSave}
                        disabled={saving || optionsLoading || Boolean(optionsError) || !workTypeId}
                    >
                        {saving ? 'Сохранение...' : 'Сохранить шаблон'}
                    </button>
                </div>
            </div>
        </Modal>
    );
}
