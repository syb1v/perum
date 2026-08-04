'use client';

import { useState, useEffect, useCallback } from 'react';
import { User } from '@/types';
import api from '@/lib/apiClient';
import Modal from '@/components/ui/Modal';
import styles from '@/app/admin/page.module.css';
import { useToast } from '@/context/ToastContext';
import type { components } from '@perum/api-schema/tenant';

type AdminParentStudentsOut = components['schemas']['AdminParentStudentsOut'];
type ReplaceParentStudentsRequest = components['schemas']['ReplaceParentStudentsRequest'];

interface ParentStudentsModalProps {
    isOpen: boolean;
    onClose: () => void;
    parent: User | null;
    onSuccess: () => void;
}

const PAGE_SIZE = 50;

export default function ParentStudentsModal({ isOpen, onClose, parent, onSuccess }: ParentStudentsModalProps) {
    const { showSuccess, showError } = useToast();
    const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
    const [students, setStudents] = useState<User[]>([]);
    const [hasMore, setHasMore] = useState(false);
    const [query, setQuery] = useState('');
    const [debouncedQuery, setDebouncedQuery] = useState('');
    const [loading, setLoading] = useState(false);
    const [loadingMore, setLoadingMore] = useState(false);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        const timer = setTimeout(() => setQuery(debouncedQuery), 400);
        return () => clearTimeout(timer);
    }, [debouncedQuery]);

    const fetchStudents = useCallback(async (skip: number, searchQuery: string) => {
        const res = await api.get<{ users: User[]; has_more: boolean }>(
            `/admin/users/search?query=${encodeURIComponent(searchQuery)}&role=student&skip=${skip}&limit=${PAGE_SIZE}`
        );
        return res;
    }, []);

    useEffect(() => {
        if (!isOpen || !parent) return;
        let cancelled = false;
        const load = async () => {
            setLoading(true);
            setDebouncedQuery('');
            setQuery('');
            try {
                const [links, firstPage] = await Promise.all([
                    api.get<AdminParentStudentsOut>(`/admin/users/${parent.id}/students`),
                    fetchStudents(0, ''),
                ]);
                if (cancelled) return;
                setSelectedIds(new Set(links.student_ids));
                setStudents(firstPage.users);
                setHasMore(firstPage.has_more);
            } catch {
                if (!cancelled) showError('Не удалось загрузить привязку детей');
            } finally {
                if (!cancelled) setLoading(false);
            }
        };
        void load();
        return () => { cancelled = true; };
    }, [isOpen, parent, fetchStudents, showError]);

    useEffect(() => {
        if (!isOpen || !parent || query === '') return;
        let cancelled = false;
        const searchNow = async () => {
            setLoading(true);
            try {
                const res = await fetchStudents(0, query);
                if (cancelled) return;
                setStudents(res.users);
                setHasMore(res.has_more);
            } catch {
                if (!cancelled) showError('Не удалось выполнить поиск учеников');
            } finally {
                if (!cancelled) setLoading(false);
            }
        };
        void searchNow();
        return () => { cancelled = true; };
    }, [query, isOpen, parent, fetchStudents, showError]);

    const loadMore = async () => {
        if (!hasMore || loadingMore || loading) return;
        setLoadingMore(true);
        try {
            const res = await fetchStudents(students.length, query);
            setStudents(prev => {
                const existing = new Set(prev.map(u => u.id));
                return [...prev, ...res.users.filter(u => !existing.has(u.id))];
            });
            setHasMore(res.has_more);
        } catch {
            showError('Не удалось загрузить дополнительных учеников');
        } finally {
            setLoadingMore(false);
        }
    };

    const toggleStudent = (id: number) => {
        setSelectedIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const handleSave = async () => {
        if (!parent) return;
        if (selectedIds.size === 0 && !window.confirm('У родителя не останется привязанных учеников. Продолжить?')) return;
        setSaving(true);
        try {
            const payload: ReplaceParentStudentsRequest = {
                student_ids: Array.from(selectedIds).sort((a, b) => a - b),
            };
            await api.put<AdminParentStudentsOut>(`/admin/users/${parent.id}/students`, payload);
            showSuccess('Привязка детей обновлена');
            onSuccess();
            onClose();
        } catch {
            showError('Родитель или один из учеников недоступен. Обновите список и повторите.');
        } finally {
            setSaving(false);
        }
    };

    if (!isOpen || !parent) return null;

    const parentName = [parent.last_name, parent.first_name].filter(Boolean).join(' ') || parent.login;

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={`Дети: ${parentName}`}>
            <div className={styles.modalBody}>
                <div className={styles.formGroup}>
                    <input
                        type="text"
                        className={styles.searchInput}
                        placeholder="Поиск ученика по ФИО или логину..."
                        value={debouncedQuery}
                        onChange={e => setDebouncedQuery(e.target.value)}
                        disabled={saving}
                    />
                </div>
                {loading ? (
                    <div className={styles.loading}>Загрузка...</div>
                ) : (
                    <div style={{ maxHeight: '320px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        {students.length === 0 && <div className={styles.empty}>Ученики не найдены</div>}
                        {students.map(student => (
                            <label key={student.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                                <input
                                    type="checkbox"
                                    checked={selectedIds.has(student.id)}
                                    onChange={() => toggleStudent(student.id)}
                                    disabled={saving}
                                />
                                <span>
                                    {[student.last_name, student.first_name, student.patronymic].filter(Boolean).join(' ') || '—'}
                                    {' '}({student.login})
                                </span>
                            </label>
                        ))}
                        {hasMore && (
                            <button type="button" className={styles.actionBtn} onClick={loadMore} disabled={loadingMore || saving}>
                                {loadingMore ? 'Загрузка...' : 'Загрузить ещё'}
                            </button>
                        )}
                    </div>
                )}
                <div style={{ marginTop: '12px', fontSize: '0.9em', opacity: 0.8 }}>
                    Выбрано учеников: {selectedIds.size}
                </div>
                <div className={styles.registerActions} style={{ marginTop: '24px' }}>
                    <button type="button" onClick={onClose} className={styles.btnSecondary} disabled={saving}>
                        Отмена
                    </button>
                    <button type="button" onClick={handleSave} className={styles.btnPrimary} disabled={saving || loading}>
                        {saving ? 'Сохранение...' : 'Сохранить'}
                    </button>
                </div>
            </div>
        </Modal>
    );
}
