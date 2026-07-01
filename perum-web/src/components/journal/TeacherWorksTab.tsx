import { useState, useEffect, useRef, useCallback } from 'react';
import styles from './TeacherWorksTab.module.css';
import journalStyles from '../../app/teacher/journal/page.module.css';
import { ClassInfo, Subject } from '@/types';

interface WorkItem {
    id: string; // Composite ID like 'hw_1' or 'cw_2'
    type: 'homework' | 'control' | 'independent';
    class_id: number;
    class_name: string;
    subject_id: number;
    subject_name: string;
    title: string;
    description?: string;
    due_date: string;
    created_at: string;
}


interface TeacherWorksTabProps {
    classes: ClassInfo[];
    subjects: Subject[];
}

export default function TeacherWorksTab({ classes, subjects }: TeacherWorksTabProps) {
    const [works, setWorks] = useState<WorkItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedClassId, setSelectedClassId] = useState<number | ''>('');
    const [selectedSubjectId, setSelectedSubjectId] = useState<number | ''>('');
    const [selectedWorkId, setSelectedWorkId] = useState<string | null>(null);

    const [page, setPage] = useState(0);
    const [hasMore, setHasMore] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);

    const LIMIT = 20;

    const observer = useRef<IntersectionObserver | null>(null);
    const lastWorkElementRef = useCallback((node: HTMLTableRowElement | null) => {
        if (loading || loadingMore) return;
        if (observer.current) observer.current.disconnect();
        observer.current = new IntersectionObserver(entries => {
            if (entries[0].isIntersecting && hasMore) {
                setPage(prevPage => prevPage + 1);
            }
        });
        if (node) observer.current.observe(node);
    }, [loading, loadingMore, hasMore]);

    const selectedWork = works.find(w => w.id === selectedWorkId);

    useEffect(() => {
        setWorks([]);
        setPage(0);
        setHasMore(true);
    }, [selectedClassId, selectedSubjectId]);

    useEffect(() => {
        const fetchWorks = async () => {
            if (page === 0) setLoading(true);
            else setLoadingMore(true);

            try {
                const params = new URLSearchParams();
                if (selectedClassId) params.append('class_id', selectedClassId.toString());
                if (selectedSubjectId) params.append('subject_id', selectedSubjectId.toString());
                params.append('limit', LIMIT.toString());
                params.append('offset', (page * LIMIT).toString());

                const queryString = params.toString() ? `?${params.toString()}` : '';

                const res = await fetch(`/api/teacher/works${queryString}`);
                if (!res.ok) throw new Error('Ошибка загрузки работ');

                const data = await res.json();

                setWorks(prev => page === 0 ? data.works : [...prev, ...data.works]);
                setHasMore(data.has_more);
            } catch (error) {
                console.error(error);
            } finally {
                setLoading(false);
                setLoadingMore(false);
            }
        };

        fetchWorks();
    }, [selectedClassId, selectedSubjectId, page]);

    return (
        <div className={styles.worksTab}>
            <div className={journalStyles.journalControls} style={{ marginTop: 0 }}>
                <div className={journalStyles.controlGroup}>
                    <label>Класс</label>
                    <select
                        value={selectedClassId}
                        onChange={(e) => setSelectedClassId(e.target.value ? Number(e.target.value) : '')}
                    >
                        <option value="">Все классы</option>
                        {classes.map(c => (
                            <option key={c.id} value={c.id}>{c.name}</option>
                        ))}
                    </select>
                </div>

                <div className={journalStyles.controlGroup}>
                    <label>Предмет</label>
                    <select
                        value={selectedSubjectId}
                        onChange={(e) => setSelectedSubjectId(e.target.value ? Number(e.target.value) : '')}
                    >
                        <option value="">Все предметы</option>
                        {subjects.map(s => (
                            <option key={s.id} value={s.id}>{s.name}</option>
                        ))}
                    </select>
                </div>
            </div>

            <div className={`${styles.worksLayout} ${selectedWork ? styles.withSidebar : ''}`}>
                <div className={styles.tableSection}>
                    {loading ? (
                        <div className={styles.loadingState}>
                            <div className={styles.spinner}></div>
                            <span>Загрузка...</span>
                        </div>
                    ) : works.length === 0 ? (
                        <div className={styles.emptyState}>
                            <p>Работы не найдены</p>
                        </div>
                    ) : (
                        <div className={styles.tableContainer}>
                            <table className={styles.table}>
                                <thead>
                                    <tr>
                                        <th style={{ width: '12%' }}>Дата</th>
                                        <th style={{ width: '10%' }}>Тип</th>
                                        <th style={{ width: '18%' }}>Предмет</th>
                                        <th style={{ width: '10%' }}>Класс</th>
                                        <th>Тема / Описание</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {works.map((work, index) => {
                                        const isLastElement = index === works.length - 1;
                                        return (
                                            <tr
                                                key={work.id}
                                                ref={isLastElement ? lastWorkElementRef : null}
                                                onClick={() => setSelectedWorkId(work.id)}
                                                className={selectedWorkId === work.id ? styles.selectedRow : ''}
                                            >
                                                <td className={styles.dueDateCell}>
                                                    {work.due_date ? new Date(work.due_date).toLocaleDateString('ru-RU') : '—'}
                                                </td>
                                                <td className={styles.typeCell}>
                                                    <span className={`${styles.typeBadge} ${styles[work.type]}`}>
                                                        {work.type === 'homework' ? 'ДЗ' :
                                                            work.type === 'control' ? 'КР' : 'СР'}
                                                    </span>
                                                </td>
                                                <td>{work.subject_name}</td>
                                                <td>{work.class_name}</td>
                                                <td className={styles.descCell}>
                                                    <strong>{work.title}</strong>
                                                    {work.description && <p className={styles.descText}>{work.description}</p>}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                            {loadingMore && (
                                <div style={{ display: 'flex', justifyContent: 'center', padding: '16px' }}>
                                    <div className={styles.spinner} style={{ width: '20px', height: '20px', borderWidth: '2px' }}></div>
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {selectedWork && (
                    <div className={styles.statsSection}>
                        <div className={styles.statCard}>
                            <div>
                                <h3>Детали работы</h3>
                                <div style={{ marginBottom: '16px' }}>
                                    <span className={`${styles.typeBadge} ${styles[selectedWork.type]}`}>
                                        {selectedWork.type === 'homework' ? 'Домашнее задание' :
                                            selectedWork.type === 'control' ? 'Контрольная работа' : 'Самостоятельная работа'}
                                    </span>
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                    <div>
                                        <strong>Предмет:</strong> {selectedWork.subject_name}
                                    </div>
                                    <div>
                                        <strong>Класс:</strong> {selectedWork.class_name}
                                    </div>
                                    <div>
                                        <strong>Дата:</strong> {selectedWork.due_date ? new Date(selectedWork.due_date).toLocaleDateString('ru-RU') : '—'}
                                    </div>
                                    <div>
                                        <strong>Тема:</strong> {selectedWork.title}
                                    </div>
                                    {selectedWork.description && (
                                        <div>
                                            <strong>Описание:</strong>
                                            <p style={{ marginTop: '4px', whiteSpace: 'pre-wrap', fontSize: '0.9rem' }}>{selectedWork.description}</p>
                                        </div>
                                    )}
                                </div>

                                <div style={{ marginTop: '24px', paddingTop: '16px', borderTop: '1px solid var(--border-color)' }}>
                                    <h4>Статистика (В разработке)</h4>
                                    <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
                                        Здесь будет распределение оценок по данной работе (5, 4, 3, 2, 1).
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
