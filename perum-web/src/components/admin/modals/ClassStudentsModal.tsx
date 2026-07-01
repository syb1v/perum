
'use client';

import { useState, useEffect, useCallback } from 'react';
import Modal from '@/components/ui/Modal';
import api from '@/lib/apiClient';
import { useToast } from '@/context/ToastContext';
import styles from '@/app/admin/page.module.css';
import { User } from '@/types';

interface ClassStudentsModalProps {
    isOpen: boolean;
    onClose: () => void;
    classId: number | null;
    classNameStr: string;
}

export default function ClassStudentsModal({ isOpen, onClose, classId, classNameStr }: ClassStudentsModalProps) {
    const { showSuccess, showError } = useToast();
    const [students, setStudents] = useState<User[]>([]);
    const [availableStudents, setAvailableStudents] = useState<User[]>([]);
    const [selectedStudentId, setSelectedStudentId] = useState('');
    const [loading, setLoading] = useState(false);

    const fetchData = useCallback(async () => {
        if (!classId) return;
        setLoading(true);
        try {
            const [classStudentsRes, availableRes] = await Promise.all([
                api.get<{ students: User[] }>(`/admin/classes/${classId}/students`),
                api.get<{ students: User[] }>('/admin/students/no-class')
            ]);
            setStudents(classStudentsRes.students);
            setAvailableStudents(availableRes.students);
        } catch (error) {
            console.error(error);
            showError('Не удалось загрузить списки учеников');
        } finally {
            setLoading(false);
        }
    }, [classId, showError]);

    useEffect(() => {
        if (isOpen) {
            fetchData();
            setSelectedStudentId('');
        }
    }, [isOpen, fetchData]);

    const handleAdd = async () => {
        if (!selectedStudentId || !classId) return;

        try {
            await api.post(`/admin/classes/${classId}/students`, { student_id: parseInt(selectedStudentId) });
            showSuccess('Ученик добавлен');
            fetchData();
            setSelectedStudentId('');
        } catch (error: unknown) {
            showError(error instanceof Error ? error.message :  'Ошибка добавления');
        }
    };

    const handleRemove = async (studentId: number) => {
        if (!classId || !confirm('Удалить ученика из класса?')) return;

        try {
            await api.del(`/admin/classes/${classId}/students/${studentId}`);
            showSuccess('Ученик удален из класса');
            fetchData();
        } catch (error: unknown) {
            showError(error instanceof Error ? error.message :  'Ошибка удаления');
        }
    };

    const formatName = (u: User) => {
        return [u.last_name, u.first_name, u.patronymic].filter(Boolean).join(' ') || '—';
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={`Ученики класса ${classNameStr}`}>
            <div className={styles.modalBody}>
                <div className={styles.formGroup} style={{ display: 'flex', gap: '8px' }}>
                    <select
                        style={{ flex: 1 }}
                        value={selectedStudentId}
                        onChange={(e) => setSelectedStudentId(e.target.value)}
                    >
                        <option value="">Выберите ученика для добавления...</option>
                        {availableStudents.map(s => (
                            <option key={s.id} value={s.id}>{formatName(s)} ({s.login})</option>
                        ))}
                    </select>
                    <button className={styles.btnPrimary} onClick={handleAdd} disabled={!selectedStudentId}>
                        Добавить
                    </button>
                </div>

                <div className={styles.tableContainer} style={{ maxHeight: '400px', overflowY: 'auto' }}>
                    <table className={styles.table}>
                        <thead>
                            <tr>
                                <th>ФИО</th>
                                <th>Логин</th>
                                <th style={{ width: '80px' }}>Действия</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                <tr><td colSpan={3} className={styles.empty}>Загрузка...</td></tr>
                            ) : students.length === 0 ? (
                                <tr><td colSpan={3} className={styles.empty}>Нет учеников в классе</td></tr>
                            ) : (
                                students.map(s => (
                                    <tr key={s.id}>
                                        <td>{formatName(s)}</td>
                                        <td>{s.login}</td>
                                        <td>
                                            <button
                                                className={`${styles.actionBtn} ${styles.danger}`}
                                                onClick={() => handleRemove(s.id)}
                                            >
                                                Удалить
                                            </button>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>

                <div className={styles.registerActions} style={{ marginTop: '24px', justifyContent: 'flex-end' }}>
                    <button className={styles.btnSecondary} onClick={onClose}>
                        Закрыть
                    </button>
                </div>
            </div>
        </Modal>
    );
}
