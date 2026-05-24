'use client';

import React, { useState, useEffect } from 'react';
import { useToast } from '@/context/ToastContext';
import { BellSchedule, BellScheduleItem } from '@/types';
import styles from '@/app/admin/page.module.css';
import api from '@/lib/apiClient';

export default function BellSchedulesManager() {
    const { showError, showSuccess } = useToast();
    const [isEditing, setIsEditing] = useState(false);
    const [schedules, setSchedules] = useState<BellSchedule[]>([]);
    const [editingSchedule, setEditingSchedule] = useState<BellSchedule | null>(null);
    const [name, setName] = useState('');
    const [items, setItems] = useState<BellScheduleItem[]>([]);
    const [activeTab, setActiveTab] = useState<'weekday' | 'saturday'>('weekday');

    const fetchSchedules = React.useCallback(async () => {
        try {
            const response = await api.get<{ success: boolean; data: BellSchedule[] }>('/admin/bell-schedules');
            if (response && response.success) {
                setSchedules(response.data || []);
            } else {
                setSchedules([]);
            }
        } catch (error) {
            console.error('Ошибка загрузки шаблонов звонков:', error);
            showError('Ошибка загрузки шаблонов звонков');
        }
    }, [showError]);

    useEffect(() => {
        fetchSchedules();
    }, [fetchSchedules]);

    useEffect(() => {
        if (editingSchedule) {
            setName(editingSchedule.name);
            setItems([...editingSchedule.items]);
        } else {
            setName('');
            setItems([]);
        }
    }, [editingSchedule]);

    const handleAddItem = () => {
        const tabItems = items.filter(i => (activeTab === 'saturday' ? i.is_saturday : !i.is_saturday));
        const nextLesson = tabItems.length > 0 ? Math.max(...tabItems.map(i => i.lesson_number)) + 1 : 1;

        let startTime = '08:00';
        let endTime = '08:45';

        // Попробуем вычислить на основе последнего урока (урок 45 мин + перемена 10 мин)
        if (tabItems.length > 0) {
            const lastEnd = tabItems[tabItems.length - 1].end_time;
            const [lastH, lastM] = lastEnd.split(':').map(Number);
            const dStart = new Date();
            dStart.setHours(lastH, lastM + 10, 0, 0); // +10 min break
            startTime = dStart.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });

            const dEnd = new Date(dStart);
            dEnd.setMinutes(dStart.getMinutes() + 45); // +45 min lesson
            endTime = dEnd.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
        }

        setItems([...items, { lesson_number: nextLesson, start_time: startTime, end_time: endTime, is_saturday: activeTab === 'saturday' }]);
    };

    const handleRemoveItem = (index: number) => {
        const newItems = [...items];
        newItems.splice(index, 1);
        setItems(newItems);
    };

    const handleItemChange = (index: number, field: keyof BellScheduleItem, value: string | number) => {
        const newItems = [...items];
        newItems[index] = { ...newItems[index], [field]: value };
        setItems(newItems);
    };

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!name.trim()) {
            showError('Введите название шаблона');
            return;
        }
        if (items.length === 0) {
            showError('Добавьте хотя бы один урок');
            return;
        }

        try {
            const isNew = !editingSchedule?.id;
            const url = isNew
                ? `/admin/bell-schedules`
                : `/admin/bell-schedules/${editingSchedule.id}`;

            const payload = {
                name: name.trim(),
                items: items
            };

            if (isNew) {
                await api.post(url, payload);
            } else {
                await api.put(url, payload);
            }

            showSuccess(`Шаблон "${name}" успешно сохранен`);
            setIsEditing(false);
            setEditingSchedule(null);
            fetchSchedules();
        } catch (err: unknown) {
            const errorMessage = err instanceof Error ? err.message : 'Произошла ошибка';
            showError(errorMessage);
        }
    };

    const handleDelete = async (schedule: BellSchedule) => {
        if (!confirm(`Удалить шаблон "${schedule.name}"? Это действие необратимо.`)) return;

        try {
            await api.del(`/admin/bell-schedules/${schedule.id}`);

            showSuccess('Шаблон удален');
            fetchSchedules();
        } catch (err: unknown) {
            const errorMessage = err instanceof Error ? err.message : 'Произошла ошибка';
            showError(errorMessage);
        }
    };

    if (isEditing) {
        return (
            <div className={styles.card}>
                <div className={styles.sectionHeader}>
                    <h2>{editingSchedule?.id ? 'Редактировать шаблон звонков' : 'Новый шаблон звонков'}</h2>
                    <button
                        className={styles.btnSecondary}
                        onClick={() => { setIsEditing(false); setEditingSchedule(null); }}
                    >
                        Отмена
                    </button>
                </div>

                <form className={styles.formGroup} onSubmit={handleSave}>
                    <div className={styles.formGroup}>
                        <label>Название шаблона</label>
                        <input
                            type="text"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder="Например: 1 смена (35 мин)"
                            required
                        />
                    </div>

                    <div style={{ marginTop: '20px' }}>
                        <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
                            <button
                                type="button"
                                className={activeTab === 'weekday' ? styles.btnPrimary : styles.btnSecondary}
                                onClick={() => setActiveTab('weekday')}
                            >
                                Понедельник - Пятница
                            </button>
                            <button
                                type="button"
                                className={activeTab === 'saturday' ? styles.btnPrimary : styles.btnSecondary}
                                onClick={() => setActiveTab('saturday')}
                            >
                                Суббота
                            </button>
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                            <label>Расписание звонков ({activeTab === 'weekday' ? 'Пн-Пт' : 'Суббота'})</label>
                            <button type="button" className={styles.btnPrimary} onClick={handleAddItem}>
                                + Добавить урок
                            </button>
                        </div>

                        {items.filter(i => (activeTab === 'saturday' ? i.is_saturday : !i.is_saturday)).length === 0 ? (
                            <p className={styles.empty}>Нет уроков. Нажмите &quot;+ Добавить урок&quot;.</p>
                        ) : (
                            <div className={styles.inputTableContainer}>
                                <table className={styles.table}>
                                    <thead>
                                        <tr>
                                            <th>Урок №</th>
                                            <th>Начало</th>
                                            <th>Конец</th>
                                            <th>Действия</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {items.map((item, index) => ({ item, index }))
                                            .filter(({ item }) => (activeTab === 'saturday' ? item.is_saturday : !item.is_saturday))
                                            .map(({ item, index }) => (
                                                <tr key={index}>
                                                    <td>
                                                        <input
                                                            type="number"
                                                            value={item.lesson_number}
                                                            onChange={e => handleItemChange(index, 'lesson_number', parseInt(e.target.value))}
                                                            min="1" max="15"
                                                            style={{ width: '60px' }}
                                                            required
                                                        />
                                                    </td>
                                                    <td>
                                                        <input
                                                            type="time"
                                                            value={item.start_time}
                                                            onChange={e => handleItemChange(index, 'start_time', e.target.value)}
                                                            required
                                                        />
                                                    </td>
                                                    <td>
                                                        <input
                                                            type="time"
                                                            value={item.end_time}
                                                            onChange={e => handleItemChange(index, 'end_time', e.target.value)}
                                                            required
                                                        />
                                                    </td>
                                                    <td>
                                                        <button
                                                            type="button"
                                                            className={`${styles.actionBtn} ${styles.danger}`}
                                                            onClick={() => handleRemoveItem(index)}
                                                        >
                                                            Удалить
                                                        </button>
                                                    </td>
                                                </tr>
                                            ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>

                    <div className={styles.registerActions} style={{ marginTop: '20px' }}>
                        <button type="button" className={styles.btnSecondary} onClick={() => setIsEditing(false)}>
                            Отмена
                        </button>
                        <button type="submit" className={styles.btnPrimary}>
                            Сохранить шаблон
                        </button>
                    </div>
                </form>
            </div>
        );
    }

    return (
        <div className={styles.card}>
            <div className={styles.sectionHeader} style={{ display: 'flex', justifyContent: 'space-between', width: '100%' }}>
                <h2>Шаблоны расписания звонков</h2>
                <button
                    className={styles.btnPrimary}
                    onClick={() => { setIsEditing(true); setEditingSchedule(null); }}
                >
                    + Создать шаблон
                </button>
            </div>

            <p className={styles.description} style={{ marginBottom: '20px' }}>
                Шаблоны звонков определяют время начала и конца уроков для привязанных к ним классов (например, для разных смен или параллелей).
                При составлении расписания время подставится автоматически.
            </p>

            {schedules.length === 0 ? (
                <div className={styles.empty}>
                    Шаблонов еще нет. Создайте первый шаблон звонков.
                </div>
            ) : (
                <div className={styles.inputTableContainer}>
                    <table className={styles.table}>
                        <thead>
                            <tr>
                                <th>Название шаблона</th>
                                <th>Кол-во уроков</th>
                                <th>Учебные классы</th>
                                <th style={{ textAlign: 'right' }}>Действия</th>
                            </tr>
                        </thead>
                        <tbody>
                            {schedules.map(schedule => (
                                <tr key={schedule.id}>
                                    <td><strong>{schedule.name}</strong></td>
                                    <td>
                                        {schedule.items.filter(i => !i.is_saturday).length} уроков (Пн-Пт)
                                        <br />
                                        <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                                            {schedule.items.filter(i => i.is_saturday).length > 0 ? `${schedule.items.filter(i => i.is_saturday).length} уроков (Суббота)` : 'Суббота выходной'}
                                        </span>
                                    </td>
                                    <td>
                                        {schedule.classes_count > 0
                                            ? <span style={{ color: 'inherit' }}>{schedule.classes_count} классов используют</span>
                                            : <span style={{ color: 'var(--text-secondary)' }}>Не используется</span>
                                        }
                                    </td>
                                    <td style={{ textAlign: 'right' }}>
                                        <button
                                            className={styles.actionBtn}
                                            onClick={() => { setIsEditing(true); setEditingSchedule(schedule); }}
                                        >
                                            ✎ Изменить
                                        </button>
                                        <button
                                            className={`${styles.actionBtn} ${styles.danger}`}
                                            onClick={() => handleDelete(schedule)}
                                            disabled={schedule.classes_count > 0}
                                            title={schedule.classes_count > 0 ? "Сначала отвяжите шаблон от классов" : "Удалить"}
                                        >
                                            🗑 Удалить
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}
