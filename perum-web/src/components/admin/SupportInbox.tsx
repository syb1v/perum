'use client';

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import api from '@/lib/apiClient';
import { useToast } from '@/context/ToastContext';
import styles from './SupportInbox.module.css';

interface EmailData {
    id: string;
    subject: string;
    sender: string;
    to?: string;
    date: string;
    body: string;
    html_body: string;
    direction?: 'in' | 'out'; // in = входящее, out = наш ответ
}

interface Thread {
    contactEmail: string;
    contactName: string;
    emails: EmailData[];
    latestDate: number;
}

function extractEmail(raw: string): string {
    if (raw.includes('<') && raw.includes('>')) {
        return raw.split('<')[1].split('>')[0].trim().toLowerCase();
    }
    return raw.trim().toLowerCase();
}

function extractName(raw: string): string {
    if (raw.includes('<')) {
        const name = raw.split('<')[0].trim();
        return name || extractEmail(raw);
    }
    return raw.trim();
}

export default function SupportInbox() {
    const [emails, setEmails] = useState<EmailData[]>([]);
    const [loading, setLoading] = useState(true);
    const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
    const [replyText, setReplyText] = useState('');
    const [actionLoading, setActionLoading] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    const { showSuccess, showError } = useToast();

    const loadEmails = useCallback(async () => {
        setLoading(true);
        try {
            const res = await api.get<{ success: boolean; emails: EmailData[] }>('/admin/support/emails?limit=100');
            setEmails(res.emails || []);
        } catch (error) {
            const errMsg = error instanceof Error ? error.message : 'Неизвестная ошибка';
            showError(`Ошибка загрузки писем: ${errMsg}`);
            console.error(error);
        } finally {
            setLoading(false);
        }
    }, [showError]);

    useEffect(() => {
        loadEmails();
    }, [loadEmails]);

    // Group emails into threads by the OTHER party (not help@...)
    const threads = useMemo(() => {
        const groups: Record<string, Thread> = {};

        emails.forEach(email => {
            // Determine the contact (the person who is NOT our help@ address)
            let contactEmail: string;
            let contactName: string;

            if (email.direction === 'out') {
                // We sent this — contact is the recipient
                contactEmail = extractEmail(email.to || email.sender);
                contactName = extractName(email.to || email.sender);
            } else {
                // They sent this — contact is the sender
                contactEmail = extractEmail(email.sender);
                contactName = extractName(email.sender);
            }

            if (!groups[contactEmail]) {
                groups[contactEmail] = {
                    contactEmail,
                    contactName,
                    emails: [],
                    latestDate: 0
                };
            }

            groups[contactEmail].emails.push(email);

            const emailDate = new Date(email.date).getTime();
            if (emailDate > groups[contactEmail].latestDate) {
                groups[contactEmail].latestDate = emailDate;
                // Update display name with the latest known name
                if (email.direction !== 'out') {
                    groups[contactEmail].contactName = contactName;
                }
            }
        });

        // Sort each thread chronologically (oldest first)
        Object.values(groups).forEach(thread => {
            thread.emails.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
        });

        return Object.values(groups).sort((a, b) => b.latestDate - a.latestDate);
    }, [emails]);

    const activeThread = useMemo(() => {
        return threads.find(t => t.contactEmail === activeThreadId) || null;
    }, [threads, activeThreadId]);

    useEffect(() => {
        if (activeThread && messagesEndRef.current) {
            messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
        }
    }, [activeThread, activeThread?.emails.length]);

    const formatDate = (dateStr: string) => {
        if (!dateStr) return '';
        try {
            const date = new Date(dateStr);
            return date.toLocaleString('ru-RU', {
                day: '2-digit', month: '2-digit', year: 'numeric',
                hour: '2-digit', minute: '2-digit'
            });
        } catch {
            return dateStr;
        }
    };

    const formatShortDate = (dateStr: string) => {
        if (!dateStr) return '';
        try {
            const date = new Date(dateStr);
            const now = new Date();
            const isToday = date.toDateString() === now.toDateString();
            if (isToday) {
                return date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
            }
            return date.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' });
        } catch {
            return dateStr;
        }
    };

    const handleDelete = async (emailId: string) => {
        if (!window.confirm("Удалить это письмо?")) return;

        setActionLoading(true);
        try {
            await api.del(`/admin/support/emails/${emailId}`);
            showSuccess("Письмо удалено");
            setEmails(prev => prev.filter(email => email.id !== emailId));
        } catch (error) {
            console.error(error);
            showError("Ошибка удаления письма");
        } finally {
            setActionLoading(false);
        }
    };

    const handleSendReply = async () => {
        if (!activeThread || !replyText.trim()) return;

        setActionLoading(true);
        const latestEmail = activeThread.emails[activeThread.emails.length - 1];

        try {
            await api.post('/admin/support/emails/reply', {
                to_email: activeThread.contactEmail,
                subject: latestEmail.subject.toLowerCase().startsWith('re:') ? latestEmail.subject : `Re: ${latestEmail.subject}`,
                content: replyText,
                in_reply_to: latestEmail.id
            });
            showSuccess("Ответ успешно отправлен");
            setReplyText('');
            // Перезагружаем письма, чтобы наш ответ появился в треде
            await loadEmails();
        } catch (error) {
            console.error(error);
            showError("Ошибка отправки ответа");
        } finally {
            setActionLoading(false);
        }
    };

    const handleIframeLoad = (e: React.SyntheticEvent<HTMLIFrameElement>) => {
        const iframe = e.currentTarget;
        try {
            if (iframe.contentWindow?.document.body) {
                iframe.style.height = (iframe.contentWindow.document.body.scrollHeight + 20) + 'px';
            }
        } catch {
            // cross-origin safety
        }
    };

    return (
        <div className={styles.container}>
            <div className={styles.header}>
                <h2 className={styles.title}>Поддержка (help@пэрум.рф)</h2>
                <button className={styles.refreshBtn} onClick={loadEmails} disabled={loading || actionLoading}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="23 4 23 10 17 10" />
                        <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
                    </svg>
                    Обновить
                </button>
            </div>

            <div className={styles.splitView}>
                {/* Left: Thread List */}
                <div className={styles.sidebar}>
                    {loading && threads.length === 0 ? (
                        <div className={styles.emptyState}>
                            <div className={styles.spinner} />
                            <p>Загрузка...</p>
                        </div>
                    ) : threads.length === 0 ? (
                        <div className={styles.emptyState}>
                            <p>Входящих писем нет</p>
                        </div>
                    ) : (
                        <div className={styles.threadList}>
                            {threads.map(thread => {
                                const latest = thread.emails[thread.emails.length - 1];
                                const isActive = activeThreadId === thread.contactEmail;
                                return (
                                    <div
                                        key={thread.contactEmail}
                                        className={`${styles.threadItem} ${isActive ? styles.activeThread : ''}`}
                                        onClick={() => setActiveThreadId(thread.contactEmail)}
                                    >
                                        <div className={styles.threadTop}>
                                            <span className={styles.threadName}>{thread.contactName}</span>
                                            <span className={styles.threadDate}>{formatShortDate(latest.date)}</span>
                                        </div>
                                        <div className={styles.threadSubject}>{latest.subject}</div>
                                        <div className={styles.threadPreview}>
                                            {latest.direction === 'out' && <span className={styles.youPrefix}>Вы: </span>}
                                            {latest.body.substring(0, 60)}{latest.body.length > 60 ? '…' : ''}
                                        </div>
                                        {thread.emails.length > 1 && (
                                            <span className={styles.threadBadge}>{thread.emails.length}</span>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>

                {/* Right: Active Thread */}
                <div className={styles.mainView}>
                    {activeThread ? (
                        <>
                            <div className={styles.threadHeaderBar}>
                                <div>
                                    <h3>{activeThread.contactName}</h3>
                                    <p>{activeThread.contactEmail}</p>
                                </div>
                            </div>

                            <div className={styles.messagesList}>
                                {activeThread.emails.map(em => (
                                    <div
                                        key={em.id}
                                        className={`${styles.messageBubble} ${em.direction === 'out' ? styles.outgoing : styles.incoming}`}
                                    >
                                        <div className={styles.bubbleHeader}>
                                            <div className={styles.bubbleMeta}>
                                                <span className={styles.bubbleAuthor}>
                                                    {em.direction === 'out' ? 'Вы (Поддержка)' : extractName(em.sender)}
                                                </span>
                                                <span className={styles.bubbleDate}>{formatDate(em.date)}</span>
                                            </div>
                                            <button
                                                className={styles.deleteBtn}
                                                onClick={() => handleDelete(em.id)}
                                                disabled={actionLoading}
                                                title="Удалить"
                                            >
                                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                    <polyline points="3 6 5 6 21 6"></polyline>
                                                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                                                </svg>
                                            </button>
                                        </div>
                                        {em.subject && (
                                            <div className={styles.bubbleSubject}>{em.subject}</div>
                                        )}
                                        <div className={styles.bubbleContent}>
                                            {em.html_body ? (
                                                <iframe
                                                    srcDoc={em.html_body}
                                                    className={styles.htmlIframe}
                                                    sandbox="allow-same-origin"
                                                    title={`Email ${em.id}`}
                                                    onLoad={handleIframeLoad}
                                                />
                                            ) : (
                                                <pre className={styles.textContent}>{em.body}</pre>
                                            )}
                                        </div>
                                    </div>
                                ))}
                                <div ref={messagesEndRef} />
                            </div>

                            <div className={styles.composerBox}>
                                <textarea
                                    className={styles.replyTextarea}
                                    placeholder={`Ответить ${activeThread.contactName}...`}
                                    value={replyText}
                                    onChange={(e) => setReplyText(e.target.value)}
                                    rows={3}
                                    disabled={actionLoading}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && replyText.trim()) {
                                            handleSendReply();
                                        }
                                    }}
                                />
                                <button
                                    className={styles.sendBtn}
                                    onClick={handleSendReply}
                                    disabled={!replyText.trim() || actionLoading}
                                >
                                    {actionLoading ? (
                                        <div className={styles.spinner} />
                                    ) : (
                                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                            <line x1="22" y1="2" x2="11" y2="13"></line>
                                            <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
                                        </svg>
                                    )}
                                </button>
                            </div>
                        </>
                    ) : (
                        <div className={styles.emptyState}>
                            <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1">
                                <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                                <polyline points="22,6 12,13 2,6" />
                            </svg>
                            <p>Выберите диалог слева</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
