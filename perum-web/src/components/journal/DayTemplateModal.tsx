import React, { useState, useEffect } from 'react';
import Modal from '@/components/ui/Modal';
import api from '@/lib/apiClient';
import type { Topic, WorkType, Subject } from '@/types';
import styles from '../../app/teacher/journal/page.module.css';

interface DayTemplateModalProps {
    date: string;
    subject: Subject;
    initialWorkTypeId?: string;
    initialTopicId?: string;
    onSave: (workTypeId: string, topicId: string, shortName: string) => void;
    onClear: () => void;
    onClose: () => void;
}

export default function DayTemplateModal({
    date, subject, initialWorkTypeId, initialTopicId, onSave, onClear, onClose
}: DayTemplateModalProps) {
    const [workTypes, setWorkTypes] = useState<WorkType[]>([]);
    const [topics, setTopics] = useState<Topic[]>([]);
    const [workTypeId, setWorkTypeId] = useState(initialWorkTypeId || '');
    const [topicId, setTopicId] = useState(initialTopicId || '');

    useEffect(() => {
        api.get<{ success: boolean; work_types: WorkType[] }>('/journal/work-types')
            .then(data => {
                if (data.work_types) {
                    setWorkTypes(data.work_types);
                    if (!initialWorkTypeId && data.work_types.length > 0) {
                        setWorkTypeId(data.work_types[0].id.toString());
                    }
                }
            })
            .catch(err => console.error(err));

        api.get<{ topics: Topic[] }>(`/journal/subjects/${subject.id}/topics`)
            .then(data => setTopics(data.topics || []))
            .catch(err => console.error(err));
    }, [subject.id, initialWorkTypeId]);

    const handleSave = () => {
        const wt = workTypes.find(w => w.id.toString() === workTypeId);
        if (wt) {
            // Determine shortname. Use first letters or something custom. 
            // In actual app, WorkType might have a short_name, but if not we can abbreviate it.
            const shortName = wt.name.split(' ').map((word, i) => i < 2 ? word.substring(0, 1).toUpperCase() : '').join('');
            onSave(workTypeId, topicId, shortName);
        }
    };

    return (
        <Modal isOpen={true} onClose={onClose} title={`Шаблон дня: ${new Date(date).toLocaleDateString('ru-RU')}`} size="default">
            <div className={styles.modalBody}>
                <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', marginBottom: '16px' }}>
                    Настройте вид работы и тему, чтобы они подставлялись автоматически при выставлении оценок за этот день.
                </p>

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
                    <button
                        className={styles.btnSecondary}
                        style={{ flex: 1, padding: '10px', background: 'var(--bg-tertiary)', border: '1px solid var(--border-color)', borderRadius: '8px', color: 'var(--text-primary)', cursor: 'pointer' }}
                        onClick={onClear}
                    >
                        Сбросить
                    </button>
                    <button
                        className={styles.btnPrimary}
                        style={{ flex: 2, padding: '10px', background: 'var(--accent-primary)', border: 'none', borderRadius: '8px', color: '#fff', cursor: 'pointer', fontWeight: 600 }}
                        onClick={handleSave}
                    >
                        Сохранить шаблон
                    </button>
                </div>
            </div>
        </Modal>
    );
}
