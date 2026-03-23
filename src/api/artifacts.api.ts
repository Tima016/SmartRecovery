import { apiClient } from './client';

export const artifactsApi = {
    getByCaseId: async (caseId: string) => {
        const response = await apiClient.get(`/cases/${caseId}/artifacts`);
        return response.data;
    }
};
