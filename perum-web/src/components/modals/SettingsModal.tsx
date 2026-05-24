'use client';

import { useToast } from '@/context/ToastContext';
import Modal from '@/components/ui/Modal';
import styles from './SettingsModal.module.css';

interface SettingsModalProps {
    isOpen: boolean;
    onClose: () => void;
    onOpenChangePassword: () => void;
}

export default function SettingsModal({ isOpen, onClose, onOpenChangePassword }: SettingsModalProps) {
    const { showInfo } = useToast();

    const handleFeatureSoon = () => {
        showInfo('Эта функция скоро появится!');
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Настройки">
            <div className={styles.settingsList}>
                {/* Change Password */}
                <button
                    className={`${styles.settingItem} ${styles.settingItemActive}`}
                    onClick={() => {
                        onClose();
                        onOpenChangePassword();
                    }}
                >
                    <div className={styles.settingIcon}>
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                            <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
                        </svg>
                    </div>
                    <div className={styles.settingInfo}>
                        <span className={styles.settingTitle}>Сменить пароль</span>
                        <span className={styles.settingSubtitle}>Изменить пароль для входа в аккаунт</span>
                    </div>
                    <div className={styles.settingAction}>
                        <svg className={styles.chevron} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="9 18 15 12 9 6"></polyline>
                        </svg>
                    </div>
                </button>

                {/* Security */}
                <div className={styles.settingItem} onClick={handleFeatureSoon}>
                    <div className={styles.settingIcon}>
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
                        </svg>
                    </div>
                    <div className={styles.settingInfo}>
                        <span className={styles.settingTitle}>Безопасность</span>
                        <span className={styles.settingSubtitle}>Настройки двухфакторной аутентификации</span>
                    </div>
                    <div className={styles.settingAction}>
                        <span className={styles.badgeSoon}>СКОРО</span>
                    </div>
                </div>

                {/* Preferences */}
                <div className={styles.settingItem} onClick={handleFeatureSoon}>
                    <div className={styles.settingIcon}>
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <circle cx="12" cy="12" r="3"></circle>
                            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
                        </svg>
                    </div>
                    <div className={styles.settingInfo}>
                        <span className={styles.settingTitle}>Предпочтения</span>
                        <span className={styles.settingSubtitle}>Тема, язык и другие настройки</span>
                    </div>
                    <div className={styles.settingAction}>
                        <span className={styles.badgeSoon}>СКОРО</span>
                    </div>
                </div>
            </div>
        </Modal>
    );
}
