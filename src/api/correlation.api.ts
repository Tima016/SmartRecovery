import { apiClient } from './client';

export const correlationApi = {
    getGraph: async (caseId: string) => {
        const response = await apiClient.get(`/cases/${caseId}/correlation/graph`);
        return response.data;
    },
    compute: async (caseId: string) => {
        const response = await apiClient.post(`/cases/${caseId}/correlation/compute`);
        return response.data;
    }
};
