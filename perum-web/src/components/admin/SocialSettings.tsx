'use client';

import { useEffect, useState } from 'react';
import api from '@/lib/apiClient';
import styles from './SocialSettings.module.css';

type SocialSettingsDto = {
    social_enabled: boolean;
    friend_scope: 'classmates' | 'school';
    social_min_grade: number | null;
    social_max_grade: number | null;
    parent_chat_visibility: 'disabled' | 'metadata' | 'full';
    message_retention_days: number;
    message_attachments_enabled: boolean;
    social_quiet_hours_start: string | null;
    social_quiet_hours_end: string | null;
};

export default function SocialSettings() {
    const [settings, setSettings] = useState<SocialSettingsDto | null>(null);
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState('');

    useEffect(() => {
        api.patch<SocialSettingsDto>('/admin/social/settings', {})
            .then(setSettings)
            .catch(() => setMessage('Не удалось загрузить настройки общения'));
    }, []);

    const save = async () => {
        if (!settings) return;
        setSaving(true);
        setMessage('');
        try {
            setSettings(await api.patch<SocialSettingsDto>('/admin/social/settings', settings));
            setMessage('Настройки сохранены');
        } catch {
            setMessage('Не удалось сохранить настройки');
        } finally {
            setSaving(false);
        }
    };

    if (!settings) return <div className={styles.card}>{message || 'Загрузка...'}</div>;

    return (
        <section className={styles.card}>
            <div className={styles.heading}>
                <div><h2>Социальные функции</h2><p>Дружба, поиск учеников и ограничения общения</p></div>
                <label className={styles.switch}><input type="checkbox" checked={settings.social_enabled} onChange={e => setSettings({ ...settings, social_enabled: e.target.checked })} /><span /></label>
            </div>
            <div className={styles.grid}>
                <label>Круг поиска<select value={settings.friend_scope} onChange={e => setSettings({ ...settings, friend_scope: e.target.value as SocialSettingsDto['friend_scope'] })}><option value="classmates">Только одноклассники</option><option value="school">Вся школа</option></select></label>
                <label>Видимость для родителей<select value={settings.parent_chat_visibility} onChange={e => setSettings({ ...settings, parent_chat_visibility: e.target.value as SocialSettingsDto['parent_chat_visibility'] })}><option value="disabled">Отключена</option><option value="metadata">Только сведения</option><option value="full">Полная</option></select></label>
                <label>Минимальный класс<input type="number" min="1" max="11" value={settings.social_min_grade ?? ''} onChange={e => setSettings({ ...settings, social_min_grade: e.target.value ? Number(e.target.value) : null })} /></label>
                <label>Максимальный класс<input type="number" min="1" max="11" value={settings.social_max_grade ?? ''} onChange={e => setSettings({ ...settings, social_max_grade: e.target.value ? Number(e.target.value) : null })} /></label>
                <label>Хранение сообщений, дней<input type="number" min="30" max="3650" value={settings.message_retention_days} onChange={e => setSettings({ ...settings, message_retention_days: Number(e.target.value) })} /></label>
                <label>Начало тихих часов<input type="time" value={settings.social_quiet_hours_start?.slice(0, 5) ?? ''} onChange={e => setSettings({ ...settings, social_quiet_hours_start: e.target.value || null })} /></label>
                <label>Конец тихих часов<input type="time" value={settings.social_quiet_hours_end?.slice(0, 5) ?? ''} onChange={e => setSettings({ ...settings, social_quiet_hours_end: e.target.value || null })} /></label>
                <label className={styles.check}><input type="checkbox" checked={settings.message_attachments_enabled} onChange={e => setSettings({ ...settings, message_attachments_enabled: e.target.checked })} />Разрешить вложения</label>
            </div>
            <div className={styles.footer}><span>{message}</span><button onClick={save} disabled={saving}>{saving ? 'Сохранение...' : 'Сохранить'}</button></div>
        </section>
    );
}
