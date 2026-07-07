import api from './apiClient';
import type {
    BootstrapScript,
    CapacityRecommendation,
    CurrentRelease,
    Node,
    NodeListResponse,
    NodeSchool,
    NodeUtilization,
    Organization,
    UpdateHistoryResponse,
} from '@/types';

export const infrastructureApi = {
    async getNodes(orgId?: number, status?: string): Promise<NodeListResponse> {
        const params = new URLSearchParams();
        if (orgId) params.set('org_id', String(orgId));
        if (status) params.set('status_filter', status);
        const query = params.toString() ? `?${params}` : '';
        return api.get<NodeListResponse>(`/platform/nodes${query}`);
    },

    async getNode(nodeId: number): Promise<Node> {
        return api.get<Node>(`/platform/nodes/${nodeId}`);
    },

    async createNode(data: {
        name: string;
        hostname: string;
        ssh_port?: number;
        cpu_cores?: number;
        ram_gb?: number;
        disk_gb?: number;
        org_id?: number;
        max_schools?: number;
    }): Promise<Node> {
        return api.post<Node>('/platform/nodes', data);
    },

    async updateNode(nodeId: number, data: {
        name?: string;
        max_schools?: number;
        status?: string;
    }): Promise<Node> {
        return api.patch<Node>(`/platform/nodes/${nodeId}`, data);
    },

    async deleteNode(nodeId: number): Promise<{ id: number; deleted: boolean }> {
        return api.del(`/platform/nodes/${nodeId}`);
    },

    async drainNode(nodeId: number): Promise<{ id: number; status: string; message: string }> {
        return api.post(`/platform/nodes/${nodeId}/drain`);
    },

    async getNodeSchools(nodeId: number): Promise<{ node_id: number; schools: NodeSchool[]; total: number }> {
        return api.get(`/platform/nodes/${nodeId}/schools`);
    },

    async getNodeUtilization(nodeId: number): Promise<NodeUtilization> {
        return api.get(`/platform/nodes/${nodeId}/utilization`);
    },

    async generateBootstrapScript(nodeId: number): Promise<BootstrapScript> {
        return api.post(`/platform/nodes/${nodeId}/bootstrap-script`);
    },

    async getOrganizations(): Promise<Organization[]> {
        return api.get('/organizations');
    },

    async getCapacityRecommendation(schoolCount: number): Promise<CapacityRecommendation> {
        return api.get(`/platform/capacity/recommendation?school_count=${schoolCount}`);
    },

    async getOrgNodes(): Promise<NodeListResponse> {
        return api.get<NodeListResponse>('/org/nodes');
    },

    async getOrgNode(nodeId: number): Promise<Node> {
        return api.get<Node>(`/org/nodes/${nodeId}`);
    },

    async getOrgNodeUtilization(nodeId: number): Promise<NodeUtilization> {
        return api.get<NodeUtilization>(`/org/nodes/${nodeId}/utilization`);
    },

    async getOrgDns(): Promise<{
        domain: string;
        node_name: string | null;
        dns_target: string | null;
        record_type: string;
        dns_provider: string;
        cf_zone_id: string | null;
        cf_enabled: boolean;
        school_records: Array<{
            name: string;
            fqdn: string;
            type: string;
            content: string;
            node_name: string;
            cf_record_id: string | null;
            status: string;
        }>;
    }> {
        return api.get('/org/dns');
    },

    async syncOrgDns(): Promise<{ synced: number; deleted: number; errors: string[] }> {
        return api.post('/org/dns/sync');
    },
};

export const updateHistoryApi = {
    async getUpdateHistory(schoolId: number, limit = 20): Promise<UpdateHistoryResponse> {
        return api.get<UpdateHistoryResponse>(`/schools/${schoolId}/update-history?limit=${limit}`);
    },

    async getCurrentRelease(): Promise<{ current: CurrentRelease | null; message?: string }> {
        return api.get('/schools/releases/current');
    },

    async getAvailableUpdates(): Promise<{
        available: boolean;
        current_version: string | null;
        updatable_schools: Array<{
            school_id: number;
            school_slug: string;
            current_version: string | null;
            available_version: string;
        }>;
        total_updatable: number;
    }> {
        return api.get('/schools/releases/available');
    },
};
