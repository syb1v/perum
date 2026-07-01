'use client';

import { useState } from 'react';
import { useToast } from '@/context/ToastContext';
import client from '@/types/openapi';
import Modal from '@/components/ui/Modal';
import styles from './ChangePasswordModal.module.css';

interface ChangePasswordModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export default function ChangePasswordModal({ isOpen, onClose }: ChangePasswordModalProps) {
    const { showSuccess, showError } = useToast();
    const [loading, setLoading] = useState(false);
    const [formData, setFormData] = useState({
        currentPassword: '',
        newPassword: '',
        confirmPassword: ''
    });

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (formData.newPassword !== formData.confirmPassword) {
            showError('Пароли не совпадают');
            return;
        }

        if (formData.newPassword.length < 8) {
            showError('Пароль должен быть не менее 8 символов');
            return;
        }

        try {
            setLoading(true);
            const { error } = await client.POST('/api/user/change-password', {
                body: {
                    current_password: formData.currentPassword,
                    new_password: formData.newPassword
                }
            });

            if (error) {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const errDetail = (error as any).detail;
                const errorMessage = typeof errDetail === 'string'
                    ? errDetail
                    : Array.isArray(errDetail)
                        ? errDetail.map((e: { msg: string }) => e.msg).join(', ')
                        : 'Ошибка при смене пароля';
                showError(errorMessage);
                return;
            }

            showSuccess('Пароль успешно изменён');
            onClose();
            setFormData({ currentPassword: '', newPassword: '', confirmPassword: '' });
        } catch (error) {
            console.error(error);
            showError('Внутренняя ошибка');
        } finally {
            setLoading(false);
        }
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Смена пароля">
            <form id="change-password-form" className={styles.form} onSubmit={handleSubmit}>
                {/* Hidden username field for accessibility (DOM warning fix) */}
                <input type="text" autoComplete="username" style={{ display: 'none' }} tabIndex={-1} aria-hidden="true" />
                <div className={styles.formGroup}>
                    <label htmlFor="currentPassword">Текущий пароль</label>
                    <input
                        type="password"
                        id="currentPassword"
                        name="currentPassword"
                        value={formData.currentPassword}
                        onChange={handleChange}
                        required
                        autoComplete="current-password"
                    />
                </div>
                <div className={styles.formGroup}>
                    <label htmlFor="newPassword">Новый пароль</label>
                    <input
                        type="password"
                        id="newPassword"
                        name="newPassword"
                        value={formData.newPassword}
                        onChange={handleChange}
                        required
                        autoComplete="new-password"
                    />
                </div>
                <div className={styles.formGroup}>
                    <label htmlFor="confirmPassword">Подтвердите пароль</label>
                    <input
                        type="password"
                        id="confirmPassword"
                        name="confirmPassword"
                        value={formData.confirmPassword}
                        onChange={handleChange}
                        required
                        autoComplete="new-password"
                    />
                </div>
                <div className={styles.actions}>
                    <button type="submit" className="btn-primary" disabled={loading}>
                        {loading ? 'Обновление...' : 'Обновить пароль'}
                    </button>
                </div>
            </form>
        </Modal>
    );
}
