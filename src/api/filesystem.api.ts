import { apiClient } from './client';

export const filesystemApi = {
    getTree: async (caseId: string, parentId?: string) => {
        const query = parentId ? `?parentId=${parentId}` : '';
        const response = await apiClient.get(`/cases/${caseId}/filesystem${query}`);
        return response.data;
    },
    getDeleted: async (caseId: string) => {
        const response = await apiClient.get(`/cases/${caseId}/filesystem/deleted`);
        return response.data;
    },
    advancedSearch: async (caseId: string, params: any) => {
        const query = new URLSearchParams(params).toString();
        const response = await apiClient.get(`/cases/${caseId}/filesystem/search?${query}`);
        return response.data;
    },
    getPreviewUrl: (caseId: string, fileId: string) => {
        return `/api/v1/cases/${caseId}/filesystem/${fileId}/preview`;
    }
};
