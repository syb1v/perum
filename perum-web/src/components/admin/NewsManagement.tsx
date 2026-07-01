
'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useToast } from '@/context/ToastContext';
import api from '@/lib/apiClient';
import styles from '@/app/admin/page.module.css';
import Modal from '@/components/ui/Modal';
import { NewsItem } from '@/types';
import dynamic from 'next/dynamic';
import 'react-quill-new/dist/quill.snow.css';

const ReactQuill = dynamic(() => import('react-quill-new'), {
    ssr: false,
    loading: () => <p>Загрузка редактора...</p>
});

interface MediaFile {
    url: string;
    type: string;
}

export default function NewsManagement() {
    const { showSuccess, showError } = useToast();
    const [news, setNews] = useState<NewsItem[]>([]);
    const [loading, setLoading] = useState(false);
    const [, setPage] = useState(0);
    const [hasMore, setHasMore] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);

    const canLoadMoreRef = useRef(false);
    canLoadMoreRef.current = hasMore && !loading && !loadingMore;

    const fetchNews = useCallback(async (showLoader = true, isLoadMore = false, currentPage = 0) => {
        if (showLoader && !isLoadMore) setLoading(true);
        if (isLoadMore) setLoadingMore(true);
        try {
            const skip = currentPage * 20;
            const res = await api.get<{ news: NewsItem[], has_more: boolean }>(`/admin/news?skip=${skip}&limit=20`);

            if (isLoadMore) {
                setNews(prev => {
                    const existing = new Set(prev.map(i => i.id));
                    return [...prev, ...(res.news || []).filter(i => !existing.has(i.id))];
                });
            } else {
                setNews(res.news || []);
            }
            setHasMore(res.has_more);
        } catch (error) {
            console.error(error);
            showError('Не удалось загрузить новости');
        } finally {
            if (showLoader && !isLoadMore) setLoading(false);
            if (isLoadMore) setLoadingMore(false);
        }
    }, [showError]);

    const observer = useRef<IntersectionObserver | null>(null);
    const observerRefCallback = useCallback((node: HTMLDivElement | null) => {
        if (observer.current) observer.current.disconnect();
        if (!node) return;
        observer.current = new IntersectionObserver(entries => {
            if (entries[0].isIntersecting && canLoadMoreRef.current) {
                setPage(p => {
                    const nextPage = p + 1;
                    fetchNews(false, true, nextPage);
                    return nextPage;
                });
            }
        }, { rootMargin: '100px' });
        observer.current.observe(node);
    }, [fetchNews]);

    // Modal state
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingNews, setEditingNews] = useState<NewsItem | null>(null);
    const [formData, setFormData] = useState({ title: '', content: '', is_published: true });
    const [mediaFiles, setMediaFiles] = useState<MediaFile[]>([]);
    const [uploadingMedia, setUploadingMedia] = useState(false);


    useEffect(() => {
        setPage(0);
        fetchNews(true, false, 0);
    }, [fetchNews]);



    const handleOpenModal = (item: NewsItem | null = null) => {
        setEditingNews(item);
        if (item) {
            setFormData({ title: item.title, content: item.content, is_published: item.is_published === 1 });
            try {
                setMediaFiles(item.media ? JSON.parse(item.media) : []);
            } catch {
                setMediaFiles([]);
            }
        } else {
            setFormData({ title: '', content: '', is_published: true });
            setMediaFiles([]);
        }
        setIsModalOpen(true);
    };

    const handleSave = async () => {
        if (!formData.title.trim() || !formData.content.trim()) {
            showError('Заполните заголовок и содержание');
            return;
        }

        const payload = {
            ...formData,
            is_published: formData.is_published ? 1 : 0,
            media: mediaFiles.length > 0 ? JSON.stringify(mediaFiles) : null
        };

        try {
            if (editingNews) {
                await api.put(`/admin/news/${editingNews.id}`, payload);
                showSuccess('Новость обновлена');
            } else {
                await api.post('/admin/news', payload);
                showSuccess('Новость создана');
            }
            setIsModalOpen(false);
            setPage(0);
            fetchNews(false, false, 0);
        } catch (error: unknown) {
            showError(error instanceof Error ? error.message : 'Ошибка сохранения');
        }
    };

    const handleDelete = async (id: number) => {
        if (!confirm('Удалить эту новость?')) return;
        try {
            await api.del(`/admin/news/${id}`);
            showSuccess('Новость удалена');
            setPage(0);
            fetchNews(false, false, 0);
        } catch (error: unknown) {
            showError(error instanceof Error ? error.message : 'Ошибка удаления');
        }
    };

    const formatDate = (dateStr: string | null) => {
        if (!dateStr) return '';
        return new Date(dateStr).toLocaleDateString('ru-RU');
    };

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (!e.target.files?.length) return;

        if (mediaFiles.length + e.target.files.length > 5) {
            showError('Максимум 5 медиафайлов');
            return;
        }

        setUploadingMedia(true);
        try {
            const newFiles: MediaFile[] = [];
            for (let i = 0; i < e.target.files.length; i++) {
                const file = e.target.files[i];
                const fd = new FormData();
                fd.append('file', file);
                const res = await api.postFormData<{ url: string, type: string }>('/admin/news/upload-media', fd);
                newFiles.push(res);
            }
            setMediaFiles([...mediaFiles, ...newFiles]);
            showSuccess('Медиа загружено');
        } catch {
            showError('Ошибка загрузки медиа');
        } finally {
            setUploadingMedia(false);
            if (e.target) e.target.value = ''; // reset input
        }
    };

    const handleRemoveMedia = (idx: number) => {
        setMediaFiles(mediaFiles.filter((_, i) => i !== idx));
    };

    return (
        <div className={styles.card} style={{ overflowAnchor: 'none' }}>
            <div className={styles.sectionHeader} style={{ justifyContent: 'space-between' }}>
                <h2>Управление новостями</h2>
                <button className={styles.btnPrimary} onClick={() => handleOpenModal()}>
                    + Создать новость
                </button>
            </div>

            <div className={styles.grid}>
                {loading ? (
                    <p className={styles.empty}>Загрузка...</p>
                ) : news.length === 0 ? (
                    <p className={styles.empty}>Новостей нет</p>
                ) : (
                    news.map(item => (
                        <div key={item.id} className={styles.card} style={{ marginBottom: 0 }}>
                            <div className={styles.sectionHeader} style={{ justifyContent: 'space-between', marginBottom: '8px' }}>
                                <h3 style={{ fontSize: '1.1rem', fontWeight: 600 }}>
                                    {item.title}
                                    {!item.is_published && <span style={{ marginLeft: '10px', fontSize: '0.8rem', color: 'var(--warning)', border: '1px solid var(--warning)', padding: '2px 6px', borderRadius: '4px' }}>Черновик</span>}
                                </h3>
                                <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                                    {formatDate(item.created_at)}
                                </span>
                            </div>
                            <div
                                style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '16px', maxHeight: '100px', overflow: 'hidden', textOverflow: 'ellipsis' }}
                                dangerouslySetInnerHTML={{ __html: item.content }}
                            />
                            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                                <button className={styles.actionBtn} onClick={() => handleOpenModal(item)}>✏️ Ред.</button>
                                <button className={`${styles.actionBtn} ${styles.danger}`} onClick={() => handleDelete(item.id)}>🗑️ Удал.</button>
                            </div>
                        </div>
                    ))
                )}
            </div>

            {hasMore && !loading && (
                <div ref={observerRefCallback} style={{ height: '20px', margin: '20px 0' }}>
                    {loadingMore && <div className={styles.empty}>Загрузка дополнительных новостей...</div>}
                </div>
            )}

            <Modal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                title={editingNews ? 'Редактировать новость' : 'Новая новость'}
            >
                <div className={styles.modalBody}>
                    <div className={styles.formGroup}>
                        <label>Заголовок</label>
                        <input
                            type="text"
                            value={formData.title}
                            onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                        />
                    </div>
                    <div className={styles.formGroup}>
                        <label>Содержание</label>
                        <div style={{ backgroundColor: 'white', color: 'black', borderRadius: '4px', marginTop: '4px' }}>
                            <ReactQuill
                                theme="snow"
                                value={formData.content}
                                onChange={(val) => setFormData({ ...formData, content: val })}
                            />
                        </div>
                    </div>

                    <div className={styles.formGroup} style={{ marginTop: '16px', display: 'flex', alignItems: 'center' }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', margin: 0 }}>
                            <input
                                type="checkbox"
                                checked={formData.is_published}
                                onChange={(e) => setFormData({ ...formData, is_published: e.target.checked })}
                            />
                            Опубликована
                        </label>
                    </div>

                    <div className={styles.formGroup} style={{ marginTop: '16px' }}>
                        <label>Медиа ({mediaFiles.length} / 5)</label>
                        {mediaFiles.length > 0 && (
                            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '8px' }}>
                                {mediaFiles.map((m, idx) => (
                                    <div key={idx} style={{ position: 'relative', width: '100px', height: '100px', borderRadius: '4px', overflow: 'hidden', border: '1px solid var(--border)' }}>
                                        {m.type === 'video' ? (
                                            <video src={m.url} style={{ width: '100%', height: '100%', objectFit: 'cover' }} muted />
                                        ) : (
                                            /* eslint-disable-next-line @next/next/no-img-element */
                                            <img src={m.url} alt="media" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                        )}
                                        <button
                                            onClick={() => handleRemoveMedia(idx)}
                                            style={{ position: 'absolute', top: 4, right: 4, background: 'rgba(0,0,0,0.5)', color: 'white', border: 'none', borderRadius: '50%', width: '20px', height: '20px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px' }}
                                        >
                                            ✕
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}
                        <input
                            type="file"
                            multiple
                            accept="image/jpeg,image/png,image/webp,video/mp4,video/webm"
                            onChange={handleFileUpload}
                            disabled={uploadingMedia || mediaFiles.length >= 5}
                            style={{ display: 'block', marginTop: '8px', color: 'var(--text-secondary)' }}
                        />
                        {uploadingMedia && <div style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', marginTop: '4px' }}>Загрузка медиа...</div>}
                    </div>

                    <div className={styles.registerActions} style={{ marginTop: '24px' }}>
                        <button className={styles.btnSecondary} onClick={() => setIsModalOpen(false)}>
                            Отмена
                        </button>
                        <button className={styles.btnPrimary} onClick={handleSave}>
                            Сохранить
                        </button>
                    </div>
                </div>
            </Modal>
        </div>
    );
}
