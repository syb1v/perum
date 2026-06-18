'use client';

import { useState, useEffect } from 'react';
import { infrastructureApi, updateHistoryApi } from '@/lib/infrastructureApi';
import type { Node, NodeListResponse, NodeUtilization, AvailableUpdates, CurrentRelease } from '@/types';
import styles from './infrastructure.module.css';

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
            setNodes(nodesData.nodes);
            setCurrentRelease(releaseData.current);
            setAvailableUpdates(updatesData);

            const utils: Record<number, NodeUtilization> = {};
            for (const node of nodesData.nodes) {
                try {
                    utils[node.id] = await infrastructureApi.getOrgNodeUtilization(node.id);
                } catch {
                    // ignore individual utilization fetch errors
                }
            }
            setUtilizations(utils);
            setError(null);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to load infrastructure data');
        } finally {
            setLoading(false);
        }
    }

    function getStatusColor(status: string): string {
        switch (status) {
            case 'active': return styles.statusActive;
            case 'pending_bootstrap': return styles.statusPending;
            case 'draining': return styles.statusDraining;
            case 'offline': return styles.statusOffline;
            default: return '';
        }
    }

    if (loading) {
        return <div className={styles.loading}>Loading infrastructure...</div>;
    }

    return (
        <div className={styles.container}>
            <h1>My Infrastructure</h1>

            {error && <div className={styles.error}>{error}</div>}

            <section className={styles.section}>
                <h2>Current Release</h2>
                {currentRelease ? (
                    <div className={styles.releaseCard}>
                        <div className={styles.releaseVersion}>{currentRelease.version_tag}</div>
                        {currentRelease.changelog && (
                            <p className={styles.releaseChangelog}>{currentRelease.changelog}</p>
                        )}
                        <div className={styles.releaseMeta}>
                            Published: {currentRelease.published_at ? new Date(currentRelease.published_at).toLocaleDateString() : 'N/A'}
                        </div>
                    </div>
                ) : (
                    <p className={styles.empty}>No releases published yet</p>
                )}
            </section>

            {availableUpdates && availableUpdates.available && (
                <section className={styles.section}>
                    <h2>Available Updates ({availableUpdates.total_updatable} schools)</h2>
                    <div className={styles.updatesList}>
                        {availableUpdates.updatable_schools.map(school => (
                            <div key={school.school_id} className={styles.updateItem}>
                                <span className={styles.schoolSlug}>{school.school_slug}</span>
                                <span className={styles.versionArrow}>
                                    {school.current_version || 'none'} → {school.available_version}
                                </span>
                            </div>
                        ))}
                    </div>
                </section>
            )}

            <section className={styles.section}>
                <h2>My Nodes ({nodes.length})</h2>
                <div className={styles.nodesGrid}>
                    {nodes.map(node => {
                        const util = utilizations[node.id];
                        return (
                            <div key={node.id} className={styles.nodeCard}>
                                <div className={styles.nodeHeader}>
                                    <h3>{node.name}</h3>
                                    <span className={`${styles.statusBadge} ${getStatusColor(node.status)}`}>
                                        {node.status}
                                    </span>
                                </div>
                                <div className={styles.nodeInfo}>
                                    <div><strong>IP:</strong> {node.hostname}</div>
                                    <div><strong>Resources:</strong> {node.cpu_cores} CPU / {node.ram_gb}GB RAM</div>
                                    {util && (
                                        <>
                                            <div><strong>Schools:</strong> {util.schools_count} / {util.max_schools}</div>
                                            <div className={styles.capacityBar}>
                                                <div
                                                    className={styles.capacityFill}
                                                    style={{ width: `${Math.min(util.capacity_percent, 100)}%` }}
                                                />
                                            </div>
                                            <div className={styles.capacityText}>
                                                {util.capacity_percent.toFixed(0)}% capacity used
                                            </div>
                                        </>
                                    )}
                                    <div><strong>Agent:</strong> {node.agent_version || 'Not connected'}</div>
                                    <div><strong>Last heartbeat:</strong> {node.last_heartbeat ? new Date(node.last_heartbeat).toLocaleString() : 'Never'}</div>
                                </div>
                            </div>
                        );
                    })}
                    {nodes.length === 0 && (
                        <div className={styles.empty}>
                            No nodes assigned to your organization yet.
                            Contact your platform administrator.
                        </div>
                    )}
                </div>
            </section>
        </div>
    );
}
