'use client';

import { useState, useEffect } from 'react';
import { User } from '@/types';
import api from '@/lib/apiClient';
import Modal from '@/components/ui/Modal';
import styles from '@/app/admin/page.module.css';
import { useToast } from '@/context/ToastContext';

interface EditUserModalProps {
    isOpen: boolean;
    onClose: () => void;
    user: User | null;
    onSuccess: () => void;
}

export default function EditUserModal({ isOpen, onClose, user, onSuccess }: EditUserModalProps) {
    const { showSuccess, showError } = useToast();
    const [loading, setLoading] = useState(false);

    const [formData, setFormData] = useState({
        login: '',
        first_name: '',
        last_name: '',
        patronymic: '',
        email: '',
        phone: '',
        password: '',
    });

    useEffect(() => {
        if (user && isOpen) {
            setFormData({
                login: user.login || '',
                first_name: user.first_name || '',
                last_name: user.last_name || '',
                patronymic: user.patronymic || '',
                email: user.email || '',
                phone: user.phone || '',
                password: '', // Пароль оставляем пустым, чтобы не перезаписывать без нужды
            });
        }
    }, [user, isOpen]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!user) return;

        // Проверяем, были ли реальные изменения
        if (
            formData.login === (user.login || '') &&
            formData.first_name === (user.first_name || '') &&
            formData.last_name === (user.last_name || '') &&
            formData.patronymic === (user.patronymic || '') &&
            formData.email === (user.email || '') &&
            formData.phone === (user.phone || '') &&
            formData.password === ''
        ) {
            onClose();
            return;
        }

        setLoading(true);
        try {
            const dataToSubmit: Record<string, unknown> = { ...formData };
            if (!dataToSubmit.password) {
                delete dataToSubmit.password; // Не отправлять пустой пароль
            }

            await api.put(`/admin/users/${user.id}`, dataToSubmit);
            showSuccess('Данные пользователя обновлены');
            onSuccess();
            onClose();
        } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : 'Ошибка обновления пользователя';
            showError(errorMessage);
        } finally {
            setLoading(false);
        }
    };

    if (!isOpen || !user) return null;

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={`Редактировать ${user.login}`}>
            <div className={styles.modalBody}>
                <form onSubmit={handleSubmit} className={styles.form}>
                    <div className={styles.formGroup}>
                        <label>Логин:</label>
                        <input
                            type="text"
                            value={formData.login}
                            onChange={e => setFormData({ ...formData, login: e.target.value })}
                            required
                        />
                    </div>

                    <div className={styles.formGroup} style={{ display: 'flex', gap: '10px' }}>
                        <div style={{ flex: 1 }}>
                            <label>Фамилия:</label>
                            <input
                                type="text"
                                value={formData.last_name}
                                onChange={e => setFormData({ ...formData, last_name: e.target.value })}
                                required
                            />
                        </div>
                        <div style={{ flex: 1 }}>
                            <label>Имя:</label>
                            <input
                                type="text"
                                value={formData.first_name}
                                onChange={e => setFormData({ ...formData, first_name: e.target.value })}
                                required
                            />
                        </div>
                    </div>

                    <div className={styles.formGroup}>
                        <label>Отчество:</label>
                        <input
                            type="text"
                            value={formData.patronymic}
                            onChange={e => setFormData({ ...formData, patronymic: e.target.value })}
                        />
                    </div>

                    <div className={styles.formGroup} style={{ display: 'flex', gap: '10px' }}>
                        <div style={{ flex: 1 }}>
                            <label>Email:</label>
                            <input
                                type="email"
                                value={formData.email}
                                onChange={e => setFormData({ ...formData, email: e.target.value })}
                            />
                        </div>
                        <div style={{ flex: 1 }}>
                            <label>Телефон:</label>
                            <input
                                type="text"
                                value={formData.phone}
                                onChange={e => setFormData({ ...formData, phone: e.target.value })}
                            />
                        </div>
                    </div>

                    <div className={styles.formGroup}>
                        <label>Новый пароль (оставьте пустым, если не нужно менять):</label>
                        <input
                            type="password"
                            placeholder="Новый пароль"
                            value={formData.password}
                            onChange={e => setFormData({ ...formData, password: e.target.value })}
                            autoComplete="new-password"
                        />
                    </div>

                    <div className={styles.registerActions} style={{ marginTop: '24px' }}>
                        <button type="button" onClick={onClose} className={styles.btnSecondary} disabled={loading}>
                            Отмена
                        </button>
                        <button type="submit" className={styles.btnPrimary} disabled={loading}>
                            {loading ? 'Сохранение...' : 'Сохранить'}
                        </button>
                    </div>
                </form>
            </div>
        </Modal>
    );
}
