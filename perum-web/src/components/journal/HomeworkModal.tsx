'use client';

import { useState, useRef } from 'react';
import api from '@/lib/apiClient';
import { useToast } from '@/context/ToastContext';
import Modal from '@/components/ui/Modal';
import styles from '../../app/teacher/journal/page.module.css';

interface HomeworkAttachmentInfo {
    id: number;
    filename?: string;
    url_link?: string;
}

interface HomeworkInfo {
    id: number;
    title: string;
    description?: string;
    attachments?: HomeworkAttachmentInfo[];
}

interface HomeworkModalProps {
    classId: number;
    subjectId: number;
    classNameStr?: string;
    subjectName?: string;
    defaultDueDate?: string;
    existingHomework?: HomeworkInfo;
    onClose: () => void;
    onDelete?: () => void;
}

export default function HomeworkModal({
    classId,
    subjectId,
    classNameStr,
    subjectName,
    defaultDueDate,
    existingHomework,
    onClose,
    onDelete
}: HomeworkModalProps) {
    const { showError, showSuccess } = useToast();
    const [title, setTitle] = useState(existingHomework?.title || '');
    const [description, setDescription] = useState(existingHomework?.description || '');
    const [dueDate, setDueDate] = useState(defaultDueDate || '');
    const [loading, setLoading] = useState(false);
    const [deleting, setDeleting] = useState(false);
    const [existingAtts, setExistingAtts] = useState<HomeworkAttachmentInfo[]>(existingHomework?.attachments || []);

    // Вложения
    const [attachments, setAttachments] = useState<(File | { url: string })[]>([]);
    const [linkInput, setLinkInput] = useState('');
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleFileDrop = (e: React.DragEvent) => {
        e.preventDefault();
        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            const files = Array.from(e.dataTransfer.files);
            setAttachments(prev => [...prev, ...files]);
        }
    };

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files.length > 0) {
            const files = Array.from(e.target.files);
            setAttachments(prev => [...prev, ...files]);
        }
    };

    const handleAddLink = () => {
        if (linkInput.trim()) {
            setAttachments(prev => [...prev, { url: linkInput.trim() }]);
            setLinkInput('');
        }
    };

    const removeAttachment = (index: number) => {
        setAttachments(prev => prev.filter((_, i) => i !== index));
    };

    const handleRemoveExistingAttachment = async (attId: number) => {
        if (!confirm('Удалить вложение?')) return;
        try {
            await api.del(`/homework/attachments/${attId}`);
            setExistingAtts(prev => prev.filter(a => a.id !== attId));
            showSuccess('Вложение удалено');
        } catch {
            showError('Ошибка удаления вложения');
        }
    };

    const handleDeleteHomework = async () => {
        if (!existingHomework || !onDelete) return;
        if (!confirm('Вы уверены, что хотите удалить это домашнее задание навсегда?')) return;
        
        setDeleting(true);
        try {
            await api.del(`/homework/${existingHomework.id}`);
            showSuccess('Домашнее задание удалено');
            onDelete();
        } catch {
            showError('Ошибка удаления домашнего задания');
        } finally {
            setDeleting(false);
        }
    };

    const handleSubmit = async () => {
        if (!title) {
            showError('Укажите заголовок задания');
            return;
        }

        const MAX_SIZE = 13 * 1024 * 1024; // 13 MB
        for (const att of attachments) {
            if (!('url' in att)) {
                if (att.size > MAX_SIZE) {
                    showError('Превышен максимальный размер файла (13 МБ)');
                    return;
                }
            }
        }

        setLoading(true);
        try {
            let hwId = existingHomework?.id;

            if (existingHomework) {
                await api.put(`/homework/${existingHomework.id}`, {
                    title,
                    description: description || null,
                    due_date: dueDate ? `${dueDate}T00:00:00` : null
                });
            } else {
                const res = await api.post<{ success: boolean; homework_id: number }>('/homework', {
                    class_id: classId,
                    subject_id: subjectId,
                    title,
                    description: description || null,
                    due_date: dueDate ? `${dueDate}T00:00:00` : null
                });
                hwId = res.homework_id;
            }

            if (attachments.length > 0 && hwId) {
                for (const att of attachments) {
                    const formData = new FormData();
                    if ('url' in att) {
                        formData.append('url_link', att.url);
                    } else {
                        formData.append('file', att);
                    }
                    try {
                        await api.postFormData(`/homework/${hwId}/attachments`, formData);
                    } catch (attErr) {
                        console.error('Failed to upload attachment', attErr);
                        showError('Ошибка загрузки одного из вложений, но ДЗ создано.');
                    }
                }
            }

            showSuccess(existingHomework ? 'Домашнее задание обновлено' : 'Домашнее задание создано');
            onClose();
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : 'Ошибка создания ДЗ';
            showError(message);
        } finally {
            setLoading(false);
        }
    };

    const content = (
        <Modal isOpen={true} onClose={onClose} title={existingHomework ? "Редактировать задание" : "Домашнее задание"} size="default">
            <div className={styles.modalBody}>
                <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
                    <span style={{ padding: '4px 10px', background: 'var(--bg-tertiary)', borderRadius: '20px', fontSize: '0.8rem', border: '1px solid var(--border-color)' }}>
                        {classNameStr}
                    </span>
                    <span style={{ padding: '4px 10px', background: 'rgba(14, 165, 233, 0.1)', borderRadius: '20px', fontSize: '0.8rem', border: '1px solid rgba(14, 165, 233, 0.2)', color: 'var(--accent-primary)' }}>
                        {subjectName}
                    </span>
                </div>

                <div className={styles.formGroup}>
                    <label style={{ display: 'block', marginBottom: '6px', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>Заголовок *</label>
                    <input
                        type="text"
                        style={{ width: '100%', padding: '10px', background: 'var(--bg-input)', border: '1px solid var(--border-color)', borderRadius: '8px', color: 'var(--text-primary)' }}
                        value={title}
                        onChange={e => setTitle(e.target.value)}
                        placeholder="Например: Параграф 15"
                    />
                </div>

                <div className={styles.formGroup}>
                    <label style={{ display: 'block', marginBottom: '6px', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>Описание</label>
                    <textarea
                        style={{ width: '100%', minHeight: '80px', padding: '10px', background: 'var(--bg-input)', border: '1px solid var(--border-color)', borderRadius: '8px', color: 'var(--text-primary)' }}
                        value={description}
                        onChange={e => setDescription(e.target.value)}
                        placeholder="Подробности задания..."
                    />
                </div>

                <div className={styles.formGroup}>
                    <label style={{ display: 'block', marginBottom: '6px', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>Срок сдачи</label>
                    <input
                        type="date"
                        style={{ width: '100%', padding: '10px', background: 'var(--bg-input)', border: '1px solid var(--border-color)', borderRadius: '8px', color: 'var(--text-primary)' }}
                        value={dueDate}
                        onChange={e => setDueDate(e.target.value)}
                    />
                </div>

                <div className={styles.formGroup}>
                    <label style={{ display: 'block', marginBottom: '6px', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>Прикрепить материалы (до 13 МБ)</label>
                    
                    {/* Drag & Drop Zone */}
                    <div 
                        onDragOver={e => e.preventDefault()}
                        onDrop={handleFileDrop}
                        onClick={() => fileInputRef.current?.click()}
                        style={{
                            border: '2px dashed var(--border-color)',
                            borderRadius: '8px',
                            padding: '20px',
                            textAlign: 'center',
                            cursor: 'pointer',
                            background: 'var(--bg-secondary)',
                            transition: 'border-color 0.2s',
                            marginBottom: '10px'
                        }}
                    >
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ margin: '0 auto 8px', color: 'var(--text-secondary)' }}>
                            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                            <polyline points="17 8 12 3 7 8" />
                            <line x1="12" y1="3" x2="12" y2="15" />
                        </svg>
                        <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--text-secondary)' }}>Перетащите файлы сюда или нажмите для выбора</p>
                        <input 
                            type="file" 
                            multiple 
                            ref={fileInputRef} 
                            style={{ display: 'none' }} 
                            onChange={handleFileSelect}
                        />
                    </div>

                    {/* Поле для ссылки */}
                    <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
                        <input
                            type="url"
                            style={{ flex: 1, padding: '10px', background: 'var(--bg-input)', border: '1px solid var(--border-color)', borderRadius: '8px', color: 'var(--text-primary)' }}
                            value={linkInput}
                            onChange={e => setLinkInput(e.target.value)}
                            placeholder="Добавьте ссылку (статья, видео)"
                            onKeyDown={e => e.key === 'Enter' && handleAddLink()}
                        />
                        <button 
                            type="button" 
                            onClick={handleAddLink}
                            style={{ padding: '0 16px', background: 'var(--bg-tertiary)', border: '1px solid var(--border-color)', borderRadius: '8px', cursor: 'pointer', color: 'var(--text-primary)' }}
                        >
                            Добавить
                        </button>
                    </div>

                    {/* Список существующих вложений */}
                    {existingAtts.length > 0 && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: attachments.length > 0 ? '8px' : '0' }}>
                            <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Сохраненные вложения:</p>
                            {existingAtts.map((att) => (
                                <div key={att.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', background: 'var(--bg-secondary)', borderRadius: '6px', border: '1px solid var(--border-color)' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflow: 'hidden' }}>
                                        {att.url_link ? (
                                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, color: 'var(--text-secondary)' }}>
                                                <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path>
                                                <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path>
                                            </svg>
                                        ) : (
                                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, color: 'var(--text-secondary)' }}>
                                                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                                                <polyline points="14 2 14 8 20 8" />
                                                <line x1="16" y1="13" x2="8" y2="13" />
                                                <line x1="16" y1="17" x2="8" y2="17" />
                                                <polyline points="10 9 9 9 8 9" />
                                            </svg>
                                        )}
                                        <a href={att.url_link || `/api/attachments/${att.id}/download`} target="_blank" rel="noopener noreferrer" style={{ fontSize: '0.85rem', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden', color: 'var(--accent-primary)', textDecoration: 'none' }}>
                                            {att.url_link || att.filename}
                                        </a>
                                    </div>
                                    <button 
                                        onClick={() => handleRemoveExistingAttachment(att.id)}
                                        style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#ef4444', display: 'flex', alignItems: 'center' }}
                                        title="Удалить навсегда"
                                    >
                                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Список новых вложений */}
                    {attachments.length > 0 && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            {attachments.map((att, idx) => {
                                const isUrl = 'url' in att;
                                const titleStr = isUrl ? (att as { url: string }).url : (att as File).name;
                                return (
                                    <div key={idx} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', background: 'var(--bg-tertiary)', borderRadius: '6px', border: '1px solid var(--border-color)' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflow: 'hidden' }}>
                                            {isUrl ? (
                                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, color: 'var(--text-secondary)' }}>
                                                    <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path>
                                                    <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path>
                                                </svg>
                                            ) : (
                                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, color: 'var(--text-secondary)' }}>
                                                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                                                    <polyline points="14 2 14 8 20 8" />
                                                    <line x1="16" y1="13" x2="8" y2="13" />
                                                    <line x1="16" y1="17" x2="8" y2="17" />
                                                    <polyline points="10 9 9 9 8 9" />
                                                </svg>
                                            )}
                                            <span style={{ fontSize: '0.85rem', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>
                                                {titleStr}
                                            </span>
                                        </div>
                                        <button 
                                            onClick={() => removeAttachment(idx)}
                                            style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#ef4444', display: 'flex', alignItems: 'center' }}
                                        >
                                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                                        </button>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>

                <div style={{ display: 'flex', gap: '8px', width: '100%' }}>
                    {existingHomework && onDelete && (
                        <button
                            type="button"
                            onClick={handleDeleteHomework}
                            disabled={loading || deleting}
                            style={{ flex: 1, padding: '12px', background: 'transparent', color: '#ef4444', border: '1px solid #ef4444', borderRadius: '8px', fontWeight: 600, cursor: 'pointer' }}
                        >
                            {deleting ? 'Удаление...' : 'Удалить'}
                        </button>
                    )}
                    <button
                        className={styles.btnPrimary}
                        onClick={handleSubmit}
                        disabled={loading || deleting}
                        style={{ flex: existingHomework ? 2 : 1, padding: '12px', background: 'var(--accent-primary)', color: 'white', border: 'none', borderRadius: '8px', fontWeight: 600, cursor: 'pointer' }}
                    >
                        {loading ? 'Сохранение...' : (existingHomework ? 'Сохранить изменения' : 'Создать задание')}
                    </button>
                </div>
            </div>
        </Modal>
    );

    return content;
}
