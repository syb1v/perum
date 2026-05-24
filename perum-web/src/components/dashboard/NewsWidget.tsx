'use client';

import { useState, useEffect } from 'react';
import api from '@/lib/apiClient';
import { SkeletonCard } from '@/components/ui/Skeleton';
import type { NewsItem } from '@/types';
import Modal from '@/components/ui/Modal';
import styles from './NewsWidget.module.css';

/* ==========================================
   News Modal
   ========================================== */
function NewsModal({ item, onClose, onLikeToggle }: { item: NewsItem; onClose: () => void; onLikeToggle: (id: number) => void }) {
    let mediaFiles: Array<{ url: string, type: string }> = [];
    try {
        if (item.media) mediaFiles = JSON.parse(item.media);
    } catch { }

    const handleLike = async (e: React.MouseEvent) => {
        e.stopPropagation();
        onLikeToggle(item.id);
    };

    return (
        <Modal isOpen={true} onClose={onClose} title={item.title} size="lg">
            <div className={styles.modalMeta}>
                <span>{new Date(item.created_at || '').toLocaleDateString('ru-RU')}</span>
                {item.author_name && <span>{item.author_name}</span>}
            </div>
            <div
                className={styles.modalText}
                dangerouslySetInnerHTML={{ __html: item.content }}
            />
            {mediaFiles.length > 0 && (
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '16px' }}>
                    {mediaFiles.map((m, idx) => (
                        <div key={idx} style={{ flex: '1 1 calc(50% - 8px)', minWidth: '200px', borderRadius: '8px', overflow: 'hidden', border: '1px solid var(--border)' }}>
                            {m.type === 'video' ? (
                                <video src={m.url} controls style={{ width: '100%', display: 'block' }} />
                            ) : (
                                /* eslint-disable-next-line @next/next/no-img-element */
                                <img src={m.url} alt="media" style={{ width: '100%', display: 'block' }} />
                            )}
                        </div>
                    ))}
                </div>
            )}
            
            {/* Modal Footer (Likes & Views metrics) */}
            <div style={{
                marginTop: '16px', display: 'flex', gap: '16px', alignItems: 'center', 
                paddingTop: '12px', borderTop: '1px solid var(--border)' 
            }}>
                <button 
                    onClick={handleLike}
                    style={{
                        display: 'flex', alignItems: 'center', gap: '6px',
                        background: 'transparent', border: 'none', cursor: 'pointer',
                        color: item.is_liked ? '#ef4444' : 'var(--text-secondary)',
                        fontSize: '0.9rem', fontWeight: 500, padding: '4px 8px',
                        borderRadius: '6px', transition: 'all 0.2s ease',
                        backgroundColor: item.is_liked ? 'rgba(239, 68, 68, 0.1)' : 'transparent'
                    }}
                >
                    <svg width="20" height="20" viewBox="0 0 24 24" fill={item.is_liked ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2">
                        <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>
                    </svg>
                    {item.likes_count || 0}
                </button>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                        <circle cx="12" cy="12" r="3"></circle>
                    </svg>
                    {item.views_count || 0}
                </div>
            </div>
        </Modal>
    );
}

/* ==========================================
   News Widget
   ========================================== */
interface NewsWidgetProps {
    className?: string; // Allow parent to styling (e.g. grid positioning)
    limit?: number;
}

export default function NewsWidget({ className = '', limit = 5 }: NewsWidgetProps) {
    const [news, setNews] = useState<NewsItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedNews, setSelectedNews] = useState<NewsItem | null>(null);
    const [visibleCount, setVisibleCount] = useState(limit);

    useEffect(() => {
        api.get<{ news: NewsItem[] }>('/news')
            .then((data) => setNews(data.news))
            .catch(() => {
                // Silently fail or log error
            })
            .finally(() => setLoading(false));
    }, []);

    const markAsRead = async (newsItem: NewsItem) => {
        if (!newsItem.is_read) {
            // Optimistic update
            setNews(prev => prev.map(n => n.id === newsItem.id ? { ...n, is_read: true, views_count: (n.views_count || 0) + 1 } : n));
            if (selectedNews?.id === newsItem.id) {
                setSelectedNews(prev => prev ? { ...prev, is_read: true, views_count: (prev.views_count || 0) + 1 } : null);
            }
            try {
                await api.post(`/news/${newsItem.id}/read`);
                // Dispatch event to update global unread counter if needed
                window.dispatchEvent(new Event('news_read'));
            } catch { }
        }
    };

    const handleOpenNews = (item: NewsItem) => {
        setSelectedNews(item);
        markAsRead(item);
    };

    const toggleLike = async (id: number) => {
        const item = news.find(n => n.id === id);
        if (!item) return;

        const isCurrentlyLiked = item.is_liked;
        // Optimistic update
        const updatedNews = news.map(n => {
            if (n.id === id) {
                return {
                    ...n,
                    is_liked: !isCurrentlyLiked,
                    likes_count: isCurrentlyLiked ? Math.max(0, (n.likes_count || 1) - 1) : (n.likes_count || 0) + 1
                };
            }
            return n;
        });
        setNews(updatedNews);
        if (selectedNews?.id === id) {
            setSelectedNews(updatedNews.find(n => n.id === id) || null);
        }

        try {
            await api.post(`/news/${id}/like`);
        } catch {
            // Revert on error (could handle properly in production)
        }
    };



    return (
        <>
            <section className={`${styles.card} ${className}`}>
                <div className={styles.newsList}>
                    {loading ? (
                        <><SkeletonCard /><SkeletonCard /></>
                    ) : news.length === 0 ? (
                        <div className={styles.empty}>
                            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                                <rect x="3" y="3" width="18" height="18" rx="2" />
                                <path d="M3 9h18M9 21V9" />
                            </svg>
                            <p>Нет новостей</p>
                        </div>
                    ) : (
                        news.slice(0, visibleCount).map((item) => (
                            <div key={item.id} className={styles.newsItem} onClick={() => handleOpenNews(item)}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                    <span className={styles.newsDate} style={{ position: 'relative' }}>
                                        {!item.is_read && (
                                            <span style={{
                                                position: 'absolute', left: '-12px', top: '50%', transform: 'translateY(-50%)',
                                                width: '6px', height: '6px', borderRadius: '50%', background: '#ef4444'
                                            }} />
                                        )}
                                        {new Date(item.created_at || '').toLocaleDateString('ru-RU')}
                                    </span>
                                    <div style={{ display: 'flex', gap: '10px', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                            <svg width="14" height="14" viewBox="0 0 24 24" fill={item.is_liked ? "#ef4444" : "none"} stroke={item.is_liked ? "#ef4444" : "currentColor"} strokeWidth="2">
                                                <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>
                                            </svg>
                                            {item.likes_count || 0}
                                        </div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                                                <circle cx="12" cy="12" r="3"></circle>
                                            </svg>
                                            {item.views_count || 0}
                                        </div>
                                    </div>
                                </div>
                                <div className={styles.newsTitle}>{item.title}</div>
                                <div
                                    className={styles.newsExcerpt}
                                    dangerouslySetInnerHTML={{ __html: item.content }}
                                />
                            </div>
                        ))
                    )}
                    {news.length > visibleCount && (
                        <button
                            className={styles.showMoreBtn}
                            onClick={() => setVisibleCount(prev => prev + limit)}
                        >
                            Показать ещё ({news.length - visibleCount})
                        </button>
                    )}
                </div>
            </section>

            {selectedNews && (
                <NewsModal
                    item={selectedNews}
                    onClose={() => setSelectedNews(null)}
                    onLikeToggle={toggleLike}
                />
            )}
        </>
    );
}
