'use client';

import { useState, useEffect } from 'react';
import { infrastructureApi } from '@/lib/infrastructureApi';
import type { Node, NodeListResponse, CapacityRecommendation } from '@/types';
import styles from './infrastructure.module.css';

export default function InfrastructurePage() {
    const [nodes, setNodes] = useState<Node[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [recommendation, setRecommendation] = useState<CapacityRecommendation | null>(null);
    const [schoolCount, setSchoolCount] = useState(10);
    const [showCreateModal, setShowCreateModal] = useState(false);

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
            setError(err instanceof Error ? err.message : 'Failed to load nodes');
        } finally {
            setLoading(false);
        }
    }

    async function handleGetRecommendation() {
        try {
            const rec = await infrastructureApi.getCapacityRecommendation(schoolCount);
            setRecommendation(rec);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to get recommendation');
        }
    }

    async function handleDrainNode(nodeId: number) {
        if (!confirm('Mark this node for draining? New schools will not be assigned.')) return;
        try {
            await infrastructureApi.drainNode(nodeId);
            loadNodes();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to drain node');
        }
    }

    async function handleDeleteNode(nodeId: number) {
        if (!confirm('Delete this node? This cannot be undone.')) return;
        try {
            await infrastructureApi.deleteNode(nodeId);
            loadNodes();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to delete node');
        }
    }

    async function handleDownloadScript(nodeId: number, nodeName: string) {
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
            setError(err instanceof Error ? err.message : 'Failed to generate script');
        }
    }

    function getStatusColor(status: string): string {
        switch (status) {
            case 'active': return styles.statusActive;
            case 'pending_bootstrap': return styles.statusPending;
            case 'draining': return styles.statusDraining;
            case 'offline': return styles.statusOffline;
            case 'decommissioned': return styles.statusDecommissioned;
            default: return '';
        }
    }

    if (loading) {
        return <div className={styles.loading}>Loading infrastructure...</div>;
    }

    return (
        <div className={styles.container}>
            <div className={styles.header}>
                <h1>Infrastructure Management</h1>
                <button className={styles.btnPrimary} onClick={() => setShowCreateModal(true)}>
                    + Add Node
                </button>
            </div>

            {error && <div className={styles.error}>{error}</div>}

            <section className={styles.section}>
                <h2>Nodes ({nodes.length})</h2>
                <div className={styles.nodesGrid}>
                    {nodes.map(node => (
                        <div key={node.id} className={styles.nodeCard}>
                            <div className={styles.nodeHeader}>
                                <h3>{node.name}</h3>
                                <span className={`${styles.statusBadge} ${getStatusColor(node.status)}`}>
                                    {node.status}
                                </span>
                            </div>
                            <div className={styles.nodeInfo}>
                                <div><strong>Hostname:</strong> {node.hostname}</div>
                                <div><strong>Resources:</strong> {node.cpu_cores} CPU / {node.ram_gb}GB RAM / {node.disk_gb}GB Disk</div>
                                <div><strong>Capacity:</strong> {node.max_schools} schools max</div>
                                <div><strong>Organization:</strong> {node.org_id || 'Pool'}</div>
                                <div><strong>Agent:</strong> {node.agent_version || 'Not connected'}</div>
                                <div><strong>Last heartbeat:</strong> {node.last_heartbeat ? new Date(node.last_heartbeat).toLocaleString() : 'Never'}</div>
                            </div>
                            <div className={styles.nodeActions}>
                                {node.status === 'pending_bootstrap' && (
                                    <button className={styles.btnSecondary} onClick={() => handleDownloadScript(node.id, node.name)}>
                                        Download Bootstrap Script
                                    </button>
                                )}
                                {node.status === 'active' && (
                                    <button className={styles.btnWarning} onClick={() => handleDrainNode(node.id)}>
                                        Drain
                                    </button>
                                )}
                                <button className={styles.btnDanger} onClick={() => handleDeleteNode(node.id)}>
                                    Delete
                                </button>
                            </div>
                        </div>
                    ))}
                    {nodes.length === 0 && (
                        <div className={styles.empty}>No nodes registered. Add a node to get started.</div>
                    )}
                </div>
            </section>

            <section className={styles.section}>
                <h2>Capacity Planning</h2>
                <div className={styles.capacityForm}>
                    <label>
                        How many schools do you need to host?
                        <input
                            type="number"
                            value={schoolCount}
                            onChange={(e) => setSchoolCount(Number(e.target.value))}
                            min={1}
                            max={1000}
                        />
                    </label>
                    <button className={styles.btnPrimary} onClick={handleGetRecommendation}>
                        Get Recommendation
                    </button>
                </div>

                {recommendation && (
                    <div className={styles.recommendation}>
                        <p className={styles.summary}>{recommendation.summary}</p>
                        <table className={styles.table}>
                            <thead>
                                <tr>
                                    <th>Configuration</th>
                                    <th>Schools/Node</th>
                                    <th>Nodes Needed</th>
                                </tr>
                            </thead>
                            <tbody>
                                {recommendation.recommendations.map((rec, i) => (
                                    <tr key={i}>
                                        <td>{rec.cpu_cores} CPU / {rec.ram_gb}GB RAM / {rec.disk_gb}GB Disk</td>
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
            setError(err instanceof Error ? err.message : 'Failed to create node');
        } finally {
            setLoading(false);
        }
    }

    return (
        <div className={styles.modal}>
            <div className={styles.modalContent}>
                <h2>Add New Node</h2>
                {error && <div className={styles.error}>{error}</div>}
                <form onSubmit={handleSubmit}>
                    <label>
                        Name
                        <input type="text" value={name} onChange={(e) => setName(e.target.value)} required />
                    </label>
                    <label>
                        Hostname (IP or FQDN)
                        <input type="text" value={hostname} onChange={(e) => setHostname(e.target.value)} required />
                    </label>
                    <label>
                        CPU Cores
                        <input type="number" value={cpuCores} onChange={(e) => setCpuCores(Number(e.target.value))} min={1} />
                    </label>
                    <label>
                        RAM (GB)
                        <input type="number" value={ramGb} onChange={(e) => setRamGb(Number(e.target.value))} min={1} step={0.5} />
                    </label>
                    <label>
                        Disk (GB)
                        <input type="number" value={diskGb} onChange={(e) => setDiskGb(Number(e.target.value))} min={10} />
                    </label>
                    <label>
                        Max Schools
                        <input type="number" value={maxSchools} onChange={(e) => setMaxSchools(Number(e.target.value))} min={1} />
                    </label>
                    <div className={styles.modalActions}>
                        <button type="button" className={styles.btnSecondary} onClick={onClose}>Cancel</button>
                        <button type="submit" className={styles.btnPrimary} disabled={loading}>
                            {loading ? 'Creating...' : 'Create Node'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
