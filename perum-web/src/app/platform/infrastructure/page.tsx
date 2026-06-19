'use client';

import { useState, useEffect } from 'react';
import { infrastructureApi } from '@/lib/infrastructureApi';
import type { Node, NodeListResponse, CapacityRecommendation } from '@/types';
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

function ResourceBar({ label, used, total, unit }: { label: string; used: number; total: number; unit: string }) {
    const pct = total > 0 ? Math.min((used / total) * 100, 100) : 0;
    return (
        <div className={styles.resourceBar}>
            <div className={styles.resourceBarLabel}>
                <span>{label}</span>
                <span className={styles.resourceBarValue}>{used.toFixed(0)}/{total}{unit}</span>
            </div>
            <div className={styles.resourceBarTrack}>
                <div className={styles.resourceBarFill} style={{ width: `${pct}%`, background: barColor(pct) }} />
            </div>
        </div>
    );
}

export default function InfrastructurePage() {
    const [nodes, setNodes] = useState<Node[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [recommendation, setRecommendation] = useState<CapacityRecommendation | null>(null);
    const [schoolCount, setSchoolCount] = useState(10);
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [scriptLoading, setScriptLoading] = useState<number | null>(null);

    useEffect(() => {
        loadNodes();
    }, []);

    async function loadNodes() {
        try {
            setLoading(true);
            const data: NodeListResponse = await infrastructureApi.getNodes();
            setNodes(data.nodes);
            setError(null);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Не удалось загрузить ноды');
        } finally {
            setLoading(false);
        }
    }

    async function handleGetRecommendation() {
        try {
            const rec = await infrastructureApi.getCapacityRecommendation(schoolCount);
            setRecommendation(rec);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Не удалось получить рекомендацию');
        }
    }

    async function handleDrainNode(nodeId: number) {
        if (!confirm('Пометить ноду для вывода из ротации? Новые школы не будут назначаться.')) return;
        try {
            await infrastructureApi.drainNode(nodeId);
            loadNodes();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Ошибка вывода ноды');
        }
    }

    async function handleDeleteNode(nodeId: number) {
        if (!confirm('Удалить ноду? Это действие необратимо.')) return;
        try {
            await infrastructureApi.deleteNode(nodeId);
            loadNodes();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Ошибка удаления ноды');
        }
    }

    async function handleDownloadScript(nodeId: number) {
        setScriptLoading(nodeId);
        try {
            const script = await infrastructureApi.generateBootstrapScript(nodeId);
            const blob = new Blob([script.content], { type: 'text/x-shellscript' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = script.filename;
            a.click();
            URL.revokeObjectURL(url);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Не удалось сгенерировать скрипт');
        } finally {
            setScriptLoading(null);
        }
    }

    if (loading) {
        return <div className={styles.loading}>Загрузка инфраструктуры...</div>;
    }

    return (
        <div className={styles.container}>
            <div className={styles.header}>
                <h1>Инфраструктура</h1>
                <button className={styles.btnPrimary} onClick={() => setShowCreateModal(true)}>
                    + Добавить ноду
                </button>
            </div>

            {error && <div className={styles.errorBanner}>{error}</div>}

            <section className={styles.section}>
                <div className={styles.sectionHeader}>
                    <h2>Ноды <span className={styles.countBadge}>{nodes.length}</span></h2>
                </div>
                <div className={styles.nodeList}>
                    {nodes.map(node => {
                        const online = isOnline(node);
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
                                    <ResourceBar label="CPU" used={node.cpu_cores} total={node.cpu_cores} unit=" ядер" />
                                    <ResourceBar label="RAM" used={node.ram_gb} total={node.ram_gb} unit=" ГБ" />
                                    <ResourceBar label="Диск" used={node.disk_gb} total={node.disk_gb} unit=" ГБ" />
                                </div>

                                <div className={styles.nodeRowMeta}>
                                    <span className={styles.metaItem}>
                                        <span className={styles.metaIcon}>🏫</span>
                                        {node.max_schools} школ макс
                                    </span>
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
                                </div>

                                <div className={styles.nodeRowActions}>
                                    {(node.status === 'pending_bootstrap' || node.status === 'offline') && (
                                        <button
                                            className={styles.btnInstall}
                                            onClick={() => handleDownloadScript(node.id)}
                                            disabled={scriptLoading === node.id}
                                        >
                                            {scriptLoading === node.id ? '...' : '↓ Скрипт установки'}
                                        </button>
                                    )}
                                    {node.status === 'active' && (
                                        <button className={styles.btnWarn} onClick={() => handleDrainNode(node.id)}>
                                            Вывод
                                        </button>
                                    )}
                                    <button className={styles.btnDanger} onClick={() => handleDeleteNode(node.id)}>
                                        ✕
                                    </button>
                                </div>
                            </div>
                        );
                    })}
                    {nodes.length === 0 && (
                        <div className={styles.emptyState}>
                            Нод нет. Добавьте первую ноду для размещения школ.
                        </div>
                    )}
                </div>
            </section>

            <section className={styles.section}>
                <h2>Планировщик ёмкости</h2>
                <div className={styles.capacityForm}>
                    <label className={styles.capacityLabel}>
                        Сколько школ нужно разместить?
                        <input
                            type="number"
                            value={schoolCount}
                            onChange={(e) => setSchoolCount(Number(e.target.value))}
                            min={1}
                            max={1000}
                            className={styles.capacityInput}
                        />
                    </label>
                    <button className={styles.btnPrimary} onClick={handleGetRecommendation}>
                        Рассчитать
                    </button>
                </div>

                {recommendation && (
                    <div className={styles.recommendation}>
                        <p className={styles.recSummary}>{recommendation.summary}</p>
                        <table className={styles.recTable}>
                            <thead>
                                <tr>
                                    <th>Конфигурация</th>
                                    <th>Школ/нода</th>
                                    <th>Нод нужно</th>
                                </tr>
                            </thead>
                            <tbody>
                                {recommendation.recommendations.map((rec, i) => (
                                    <tr key={i}>
                                        <td>{rec.cpu_cores} CPU / {rec.ram_gb} ГБ RAM / {rec.disk_gb} ГБ Диск</td>
                                        <td>{rec.schools_per_node}</td>
                                        <td>{rec.nodes_needed}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </section>

            {showCreateModal && (
                <CreateNodeModal onClose={() => setShowCreateModal(false)} onCreated={loadNodes} />
            )}
        </div>
    );
}

function CreateNodeModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
    const [name, setName] = useState('');
    const [hostname, setHostname] = useState('');
    const [cpuCores, setCpuCores] = useState(2);
    const [ramGb, setRamGb] = useState(2);
    const [diskGb, setDiskGb] = useState(20);
    const [maxSchools, setMaxSchools] = useState(5);
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        setLoading(true);
        setError(null);
        try {
            await infrastructureApi.createNode({
                name,
                hostname,
                cpu_cores: cpuCores,
                ram_gb: ramGb,
                disk_gb: diskGb,
                max_schools: maxSchools,
            });
            onCreated();
            onClose();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Ошибка создания ноды');
        } finally {
            setLoading(false);
        }
    }

    return (
        <div className={styles.modalOverlay}>
            <div className={styles.modal}>
                <div className={styles.modalHeader}>
                    <h2>Добавить ноду</h2>
                    <button className={styles.modalClose} onClick={onClose}>✕</button>
                </div>
                {error && <div className={styles.errorBanner}>{error}</div>}
                <form onSubmit={handleSubmit} className={styles.modalForm}>
                    <label className={styles.formLabel}>
                        Имя ноды
                        <input className={styles.formInput} type="text" value={name} onChange={(e) => setName(e.target.value)} required placeholder="node-01" />
                    </label>
                    <label className={styles.formLabel}>
                        Хост (IP или FQDN)
                        <input className={styles.formInput} type="text" value={hostname} onChange={(e) => setHostname(e.target.value)} required placeholder="192.168.1.100" />
                    </label>
                    <div className={styles.formRow}>
                        <label className={styles.formLabel}>
                            CPU (ядра)
                            <input className={styles.formInput} type="number" value={cpuCores} onChange={(e) => setCpuCores(Number(e.target.value))} min={1} />
                        </label>
                        <label className={styles.formLabel}>
                            RAM (ГБ)
                            <input className={styles.formInput} type="number" value={ramGb} onChange={(e) => setRamGb(Number(e.target.value))} min={1} step={0.5} />
                        </label>
                        <label className={styles.formLabel}>
                            Диск (ГБ)
                            <input className={styles.formInput} type="number" value={diskGb} onChange={(e) => setDiskGb(Number(e.target.value))} min={10} />
                        </label>
                    </div>
                    <label className={styles.formLabel}>
                        Максимум школ
                        <input className={styles.formInput} type="number" value={maxSchools} onChange={(e) => setMaxSchools(Number(e.target.value))} min={1} />
                    </label>
                    <div className={styles.modalActions}>
                        <button type="button" className={styles.btnSecondary} onClick={onClose}>Отмена</button>
                        <button type="submit" className={styles.btnPrimary} disabled={loading}>
                            {loading ? 'Создание...' : 'Создать'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
