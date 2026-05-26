import { apiClient } from './client';

export const recoveryApi = {
    getFiles: async (caseId: string) => {
        const response = await apiClient.get(`/cases/${caseId}/recovery/files`);
        return response.data;
    },
    getPreviewUrl: (caseId: string, fileId: string) =>
        `/api/v1/cases/${caseId}/recovery/files/${fileId}/preview`,
    getDownloadUrl: (caseId: string, fileId: string) =>
        `/api/v1/cases/${caseId}/recovery/files/${fileId}/download`,
    runRecovery: async (caseId: string, data: any) => {
        const response = await apiClient.post(`/cases/${caseId}/recovery`, data);
        return response.data;
    },
};
