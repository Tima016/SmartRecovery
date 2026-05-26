import { apiClient } from './client';

export const evidenceApi = {
    /** List all evidence across all cases (Acquisition page global view) */
    getAll: async (limit?: number) => {
        const response = await apiClient.get('/evidence', { params: { limit } });
        return response.data;
    },

    /** List evidence for a specific case */
    getByCaseId: async (caseId: string) => {
        const response = await apiClient.get(`/cases/${caseId}/evidence`);
        return response.data;
    },

    /** Get single evidence item */
    getById: async (id: string) => {
        const response = await apiClient.get(`/evidence/${id}`);
        return response.data;
    },

    /**
     * Upload a disk image to a case.
     * @param caseId  The case this evidence belongs to
     * @param formData  FormData with 'file' field (+ optional 'description')
     */
    upload: async (caseId: string, formData: FormData) => {
        const response = await apiClient.post(
            `/cases/${caseId}/evidence/upload`,
            formData,
            { headers: { 'Content-Type': 'multipart/form-data' } },
        );
        return response.data;
    },

    /** Delete an evidence item and its MinIO object */
    deleteById: async (id: string) => {
        const response = await apiClient.delete(`/evidence/${id}`);
        return response.data;
    },

    /** Re-verify evidence hashes */
    verify: async (id: string, notes?: string) => {
        const response = await apiClient.patch(`/evidence/${id}/verify`, { notes });
        return response.data;
    },

    /** Ingest evidence from a server-local file path */
    ingestLocalPath: async (caseId: string, filePath: string) => {
        const response = await apiClient.post(`/cases/${caseId}/evidence/ingest-local`, { filePath });
        return response.data;
    },
};
