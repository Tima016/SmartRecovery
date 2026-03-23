import { apiClient } from './client';

export const recoveryApi = {
    getFiles: async (caseId: string) => {
        const response = await apiClient.get(`/cases/${caseId}/recovery/files`);
        return response.data;
    },
    runRecovery: async (caseId: string, data: any) => {
        const response = await apiClient.post(`/cases/${caseId}/recovery`, data);
        return response.data;
    }
};
