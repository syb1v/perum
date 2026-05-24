import React, { useState, useEffect } from 'react';
import Modal from '@/components/ui/Modal';
import styles from '@/app/admin/page.module.css';
import api from '@/lib/apiClient';

interface WorkType {
    id: number;
    name: string;
    weight: number;
    is_active: boolean;
}

interface WorkTypeModalProps {
    isOpen: boolean;
    onClose: () => void;
    workType: WorkType | null;
    onSaved: () => void;
}

export default function WorkTypeModal({ isOpen, onClose, workType, onSaved }: WorkTypeModalProps) {
    const [name, setName] = useState('');
    const [weight, setWeight] = useState<number | ''>('');
    const [isActive, setIsActive] = useState(true);
    const [error, setError] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    useEffect(() => {
        if (isOpen) {
            if (workType) {
                setName(workType.name);
                setWeight(workType.weight);
                setIsActive(workType.is_active);
            } else {
                setName('');
                setWeight('');
                setIsActive(true);
            }
            setError('');
        }
    }, [isOpen, workType]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setIsSubmitting(true);

        try {
            const payload = {
                name,
                weight: Number(weight),
                is_active: isActive
            };

            if (workType) {
                await api.put(`/admin/work-types/${workType.id}`, payload);
            } else {
                await api.post('/admin/work-types', payload);
            }

            onSaved();
            onClose();
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } catch (err: any) {
            setError(err.response?.data?.detail || 'Ошибка при сохранении вида работы');
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title={workType ? 'Редактировать вид работы' : 'Добавить вид работы'}
        >
            {error && <div className={styles.errorBanner}>{error}</div>}

            <form onSubmit={handleSubmit} className={styles.form}>
                <div className={styles.formRow} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    <div className={styles.formGroup} style={{ width: '100%' }}>
                        <label className={styles.label}>Название (напр. Контрольная работа)</label>
                        <input
                            type="text"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            className={styles.input}
                            required
                        />
                    </div>
                    <div className={styles.formGroup} style={{ width: '100%' }}>
                        <label className={styles.label}>Вес (коэффициент)</label>
                        <input
                            type="number"
                            value={weight}
                            onChange={(e) => setWeight(e.target.value ? Number(e.target.value) : '')}
                            className={styles.input}
                            min="0.1"
                            max="10.0"
                            step="0.1"
                            required
                        />
                    </div>
                </div>

                <div className={styles.checkboxGroup} style={{ marginTop: '16px' }}>
                    <div className={styles.customCheckbox}>
                        <input
                            type="checkbox"
                            id="isActiveModal"
                            checked={isActive}
                            onChange={(e) => setIsActive(e.target.checked)}
                        />
                        <label htmlFor="isActiveModal">Активен</label>
                    </div>
                </div>

                <div className={styles.formActions} style={{ marginTop: '24px', justifyContent: 'flex-end', display: 'flex', gap: '12px' }}>
                    <button type="button" onClick={onClose} className={styles.cancelBtn} disabled={isSubmitting}>
                        Отмена
                    </button>
                    <button type="submit" className={styles.submitBtn} disabled={isSubmitting}>
                        {isSubmitting ? 'Сохранение...' : (workType ? 'Сохранить изменения' : 'Добавить')}
                    </button>
                </div>
            </form>
        </Modal>
    );
}
