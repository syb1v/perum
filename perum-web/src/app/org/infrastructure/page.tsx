'use client';

import { useState, useEffect } from 'react';
import { infrastructureApi, updateHistoryApi } from '@/lib/infrastructureApi';
import type { Node, NodeListResponse, NodeUtilization, AvailableUpdates, CurrentRelease } from '@/types';
import styles from './infrastructure.module.css';

function statusLabel(status: string): string {
    switch (status) {
        case 'active': return 'Онлайн';
        case 'pending_bootstrap': return 'Не установлена';
        case 'draining': return 'Вывод';
        case 'offline': return 'Оффлайн';
        case 'decommissioned': return 'Выведена';
        default: return status;
    }
}

function isOnline(node: Node): boolean {
    return node.status === 'active';
}

function barColor(pct: number): string {
    if (pct >= 90) return '#e53e3e';
    if (pct >= 70) return '#ed8936';
    return '#48bb78';
}

function ResourceBar({ label, pct, text }: { label: string; pct: number; text: string }) {
    return (
        <div className={styles.resourceBar}>
            <div className={styles.resourceBarLabel}>
                <span>{label}</span>
                <span className={styles.resourceBarValue}>{text}</span>
            </div>
            <div className={styles.resourceBarTrack}>
                <div className={styles.resourceBarFill} style={{ width: `${Math.min(pct, 100)}%`, background: barColor(pct) }} />
            </div>
        </div>
    );
}

export default function OrgInfrastructurePage() {
    const [nodes, setNodes] = useState<Node[]>([]);
    const [utilizations, setUtilizations] = useState<Record<number, NodeUtilization>>({});
    const [currentRelease, setCurrentRelease] = useState<CurrentRelease | null>(null);
    const [availableUpdates, setAvailableUpdates] = useState<AvailableUpdates | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        loadData();
    }, []);

    async function loadData() {
        try {
            setLoading(true);
            const [nodesData, releaseData, updatesData] = await Promise.all([
                infrastructureApi.getOrgNodes(),
                updateHistoryApi.getCurrentRelease(),
                updateHistoryApi.getAvailableUpdates(),
            ]);
            const typedNodes: NodeListResponse = nodesData;
            setNodes(typedNodes.nodes);
            setCurrentRelease(releaseData.current);
            setAvailableUpdates(updatesData);

            const utils: Record<number, NodeUtilization> = {};
            for (const node of typedNodes.nodes) {
                try {
                    utils[node.id] = await infrastructureApi.getOrgNodeUtilization(node.id);
                } catch {
                    // игнорируем ошибку утилизации отдельной ноды
                }
            }
            setUtilizations(utils);
            setError(null);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Не удалось загрузить данные');
        } finally {
            setLoading(false);
        }
    }

    if (loading) {
        return <div className={styles.loading}>Загрузка инфраструктуры...</div>;
    }

    return (
        <div className={styles.container}>
            <h1>Инфраструктура</h1>

            {error && <div className={styles.errorBanner}>{error}</div>}

            <section className={styles.section}>
                <h2>Текущий релиз</h2>
                {currentRelease ? (
                    <div className={styles.releaseCard}>
                        <div className={styles.releaseVersion}>{currentRelease.version_tag}</div>
                        {currentRelease.changelog && (
                            <p className={styles.releaseChangelog}>{currentRelease.changelog}</p>
                        )}
                        <div className={styles.releaseMeta}>
                            Опубликован: {currentRelease.published_at ? new Date(currentRelease.published_at).toLocaleDateString('ru') : 'N/A'}
                        </div>
                    </div>
                ) : (
                    <p className={styles.emptyText}>Релизов нет</p>
                )}
            </section>

            {availableUpdates?.available && (
                <section className={styles.section}>
                    <h2>Доступные обновления ({availableUpdates.total_updatable} школ)</h2>
                    <div className={styles.updatesList}>
                        {availableUpdates.updatable_schools.map(school => (
                            <div key={school.school_id} className={styles.updateItem}>
                                <span className={styles.schoolSlug}>{school.school_slug}</span>
                                <span className={styles.versionArrow}>
                                    {school.current_version ?? 'нет'} → {school.available_version}
                                </span>
                            </div>
                        ))}
                    </div>
                </section>
            )}

            <section className={styles.section}>
                <h2>Мои ноды <span className={styles.countBadge}>{nodes.length}</span></h2>
                <div className={styles.nodeList}>
                    {nodes.map(node => {
                        const online = isOnline(node);
                        const util = utilizations[node.id];
                        const schoolPct = util ? (util.schools_count / Math.max(util.max_schools, 1)) * 100 : 0;
                        return (
                            <div key={node.id} className={styles.nodeRow}>
                                <div className={styles.nodeRowLeft}>
                                    <span className={`${styles.onlineDot} ${online ? styles.dotOnline : styles.dotOffline}`} title={statusLabel(node.status)} />
                                    <div className={styles.nodeMain}>
                                        <span className={styles.nodeName}>{node.name}</span>
                                        <span className={styles.nodeHost}>{node.hostname}</span>
                                    </div>
                                    <span className={`${styles.statusPill} ${styles['status_' + node.status]}`}>
                                        {statusLabel(node.status)}
                                    </span>
                                </div>

                                <div className={styles.nodeRowBars}>
                                    <ResourceBar
                                        label="CPU"
                                        pct={100}
                                        text={`${node.cpu_cores} ядер`}
                                    />
                                    <ResourceBar
                                        label="RAM"
                                        pct={100}
                                        text={`${node.ram_gb} ГБ`}
                                    />
                                    {util ? (
                                        <ResourceBar
                                            label="Школы"
                                            pct={schoolPct}
                                            text={`${util.schools_count}/${util.max_schools}`}
                                        />
                                    ) : (
                                        <ResourceBar
                                            label="Школы"
                                            pct={0}
                                            text={`макс ${node.max_schools}`}
                                        />
                                    )}
                                </div>

                                <div className={styles.nodeRowMeta}>
                                    {!online && (
                                        <span className={styles.offlineHint}>
                                            Нода не установлена — обратитесь к администратору платформы
                                        </span>
                                    )}
                                    {online && (
                                        <>
                                            <span className={styles.metaItem}>
                                                <span className={styles.metaIcon}>⚙</span>
                                                {node.agent_version ?? 'агент не подключён'}
                                            </span>
                                            {node.last_heartbeat && (
                                                <span className={styles.metaItem}>
                                                    <span className={styles.metaIcon}>♡</span>
                                                    {new Date(node.last_heartbeat).toLocaleString('ru')}
                                                </span>
                                            )}
                                        </>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                    {nodes.length === 0 && (
                        <div className={styles.emptyState}>
                            Нод нет. Обратитесь к администратору платформы для добавления нод.
                        </div>
                    )}
                </div>
            </section>
        </div>
    );
}
