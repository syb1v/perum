'use client';

import { useState, useEffect } from 'react';
import { infrastructureApi } from '@/lib/infrastructureApi';
import type { Node, NodeListResponse, CapacityRecommendation, BootstrapScript, Organization } from '@/types';
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

    async function handleDownloadScript(nodeId: number, nodeName: string) {
        setScriptLoading(nodeId);
        try {
            const script = await infrastructureApi.generateBootstrapScript(nodeId);
            const blob = new Blob([script.content], { type: 'text/x-shellscript' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `perum-node-${nodeName}-bootstrap.sh`;
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
                                            onClick={() => handleDownloadScript(node.id, node.name)}
                                            disabled={scriptLoading === node.id}
                                        >
                                            {scriptLoading === node.id ? '...' : '↓ Скрипт'}
                                        </button>
                                    )}
                                    {node.status === 'active' && (
                                        <button className={styles.btnWarn} onClick={() => handleDrainNode(node.id)}>
                                            Вывод
                                        </button>
                                    )}
                                    <button className={styles.btnDanger} onClick={() => handleDeleteNode(node.id)} title="Удалить ноду">
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
                <CreateNodeWizard
                    onClose={() => setShowCreateModal(false)}
                    onCreated={loadNodes}
                />
            )}
        </div>
    );
}

// ─── 2-Step "Create Node" Wizard ─────────────────────────────────────────────

function CopyButton({ text, label }: { text: string; label?: string }) {
    const [copied, setCopied] = useState(false);

    async function handleCopy() {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    }

    return (
        <button type="button" className={styles.copyBtn} onClick={handleCopy}>
            {copied ? '✓ Скопировано' : (label ?? 'Копировать')}
        </button>
    );
}

function CreateNodeWizard({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
    const [step, setStep] = useState<1 | 2>(1);

    // Step 1 form state
    const [name, setName] = useState('');
    const [hostname, setHostname] = useState('');
    const [port, setPort] = useState(1337);
    const [orgId, setOrgId] = useState<number | ''>('');
    const [maxSchools, setMaxSchools] = useState(5);
    const [cpuCores, setCpuCores] = useState(2);
    const [ramGb, setRamGb] = useState(4);
    const [diskGb, setDiskGb] = useState(40);
    const [orgs, setOrgs] = useState<Organization[]>([]);

    // Step 2 state
    const [bootstrap, setBootstrap] = useState<BootstrapScript | null>(null);

    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        infrastructureApi.getOrganizations()
            .then(setOrgs)
            .catch(() => { /* org list is optional */ });
    }, []);

    async function handleNext(e: React.FormEvent) {
        e.preventDefault();
        setLoading(true);
        setError(null);
        try {
            const node = await infrastructureApi.createNode({
                name,
                hostname,
                ssh_port: port,
                cpu_cores: cpuCores,
                ram_gb: ramGb,
                disk_gb: diskGb,
                org_id: orgId !== '' ? orgId : undefined,
                max_schools: maxSchools,
            });
            const script = await infrastructureApi.generateBootstrapScript(node.id);
            setBootstrap(script);
            onCreated();
            setStep(2);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Ошибка создания ноды');
        } finally {
            setLoading(false);
        }
    }

    return (
        <div className={styles.modalOverlay} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
            <div className={styles.wizardModal}>
                {/* Progress bar */}
                <div className={styles.wizardProgress}>
                    <div className={`${styles.wizardStep} ${step >= 1 ? styles.wizardStepActive : ''}`}>
                        <span className={styles.wizardStepNum}>1</span>
                        <span className={styles.wizardStepLabel}>Настройка</span>
                    </div>
                    <div className={styles.wizardProgressLine} />
                    <div className={`${styles.wizardStep} ${step >= 2 ? styles.wizardStepActive : ''}`}>
                        <span className={styles.wizardStepNum}>2</span>
                        <span className={styles.wizardStepLabel}>Установка</span>
                    </div>
                </div>

                <div className={styles.modalHeader}>
                    <h2>{step === 1 ? 'Добавить ноду' : 'Установка ноды'}</h2>
                    <button className={styles.modalClose} onClick={onClose}>✕</button>
                </div>

                {error && <div className={styles.errorBanner}>{error}</div>}

                {step === 1 ? (
                    <form onSubmit={handleNext} className={styles.modalForm}>
                        <label className={styles.formLabel}>
                            Внутреннее имя
                            <input
                                className={styles.formInput}
                                type="text"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                required
                                placeholder="US-NY-Node-01"
                            />
                        </label>

                        <label className={styles.formLabel}>
                            Организация
                            <select
                                className={styles.formInput}
                                value={orgId}
                                onChange={(e) => setOrgId(e.target.value === '' ? '' : Number(e.target.value))}
                            >
                                <option value="">— Пул (без организации) —</option>
                                {orgs.map(org => (
                                    <option key={org.id} value={org.id}>{org.name}</option>
                                ))}
                            </select>
                        </label>

                        <div className={styles.formRow2}>
                            <label className={styles.formLabel}>
                                Домен или IP
                                <input
                                    className={styles.formInput}
                                    type="text"
                                    value={hostname}
                                    onChange={(e) => setHostname(e.target.value)}
                                    required
                                    placeholder="node.example.com"
                                />
                            </label>
                            <label className={styles.formLabel}>
                                Node Port
                                <input
                                    className={styles.formInput}
                                    type="number"
                                    value={port}
                                    onChange={(e) => setPort(Number(e.target.value))}
                                    min={1}
                                    max={65535}
                                />
                            </label>
                        </div>

                        <div className={styles.formRow3}>
                            <label className={styles.formLabel}>
                                CPU
                                <input
                                    className={styles.formInput}
                                    type="number"
                                    value={cpuCores}
                                    onChange={(e) => setCpuCores(Number(e.target.value))}
                                    min={1}
                                />
                            </label>
                            <label className={styles.formLabel}>
                                RAM (ГБ)
                                <input
                                    className={styles.formInput}
                                    type="number"
                                    value={ramGb}
                                    onChange={(e) => setRamGb(Number(e.target.value))}
                                    min={1}
                                    step={0.5}
                                />
                            </label>
                            <label className={styles.formLabel}>
                                Диск (ГБ)
                                <input
                                    className={styles.formInput}
                                    type="number"
                                    value={diskGb}
                                    onChange={(e) => setDiskGb(Number(e.target.value))}
                                    min={10}
                                />
                            </label>
                        </div>

                        <label className={styles.formLabel}>
                            Макс. школ на ноде
                            <input
                                className={styles.formInput}
                                type="number"
                                value={maxSchools}
                                onChange={(e) => setMaxSchools(Number(e.target.value))}
                                min={1}
                            />
                        </label>

                        <div className={styles.modalActions}>
                            <button type="button" className={styles.btnSecondary} onClick={onClose}>Отмена</button>
                            <button type="submit" className={styles.btnGreen} disabled={loading}>
                                {loading ? 'Создание...' : 'Далее →'}
                            </button>
                        </div>
                    </form>
                ) : (
                    <div className={styles.step2}>
                        {bootstrap && (
                            <>
                                <div className={styles.tokenBlock}>
                                    <div className={styles.tokenLabel}>ENROLLMENT_TOKEN</div>
                                    <div className={styles.tokenRow}>
                                        <code className={styles.tokenValue}>{bootstrap.enrollment_token}</code>
                                        <CopyButton text={bootstrap.enrollment_token} />
                                    </div>
                                    <p className={styles.tokenHint}>Токен действителен 7 дней. Используется только при первом запуске агента.</p>
                                </div>

                                <div className={styles.composeBlock}>
                                    <div className={styles.composeHeader}>
                                        <span className={styles.composeTitle}>docker-compose.yml</span>
                                        <CopyButton text={bootstrap.docker_compose} label="Скопировать" />
                                    </div>
                                    <pre className={styles.composeCode}>{bootstrap.docker_compose}</pre>
                                </div>

                                <p className={styles.step2Hint}>
                                    Скопируйте <code>docker-compose.yml</code> на сервер и выполните:
                                    <br />
                                    <code>docker compose up -d</code>
                                </p>
                            </>
                        )}

                        <div className={styles.modalActions}>
                            <button type="button" className={styles.btnGreen} onClick={onClose}>
                                Готово
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
