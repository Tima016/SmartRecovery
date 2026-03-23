import { apiClient } from './client';

export const imagingApi = {
    /** List all imaging jobs (optionally filter by case) */
    getAll: async (caseId?: string) => {
        const response = await apiClient.get('/imaging', { params: caseId ? { caseId } : undefined });
        return response.data;
    },

    /** Get a single imaging job */
    getById: async (id: string) => {
        const response = await apiClient.get(`/imaging/${id}`);
        return response.data;
    },

    /**
     * Start a new imaging job.
     * Body: { caseId, sourceDrive, sourceSizeBytes?, imageFormat? }
     */
    start: async (dto: {
        caseId: string;
        sourceDrive: string;
        sourceSizeBytes?: number;
        imageFormat?: string;
    }) => {
        const response = await apiClient.post('/imaging/start', dto);
        return response.data;
    },

    /** Get live progress for a job */
    getProgress: async (jobId: string) => {
        const response = await apiClient.get(`/imaging/${jobId}/progress`);
        return response.data;
    },

    /** Pause a running imaging job */
    pause: async (jobId: string) => {
        const response = await apiClient.patch(`/imaging/${jobId}/pause`);
        return response.data;
    },

    /** Resume a paused imaging job */
    resume: async (jobId: string) => {
        const response = await apiClient.patch(`/imaging/${jobId}/resume`);
        return response.data;
    },
};
