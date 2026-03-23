import { apiClient } from './client';

export interface SuspiciousEvent {
    id: string;
    caseId: string;
    title: string;
    description: string;
    severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
    relatedEventIds: string[];
    createdAt: string;
}

export interface TimelineCluster {
    id: string;
    caseId: string;
    startTime: string;
    endTime: string;
    eventCount: number;
    severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
    eventTypes: string[];
    createdAt: string;
}

export const timelineApi = {
    getByCaseId: async (caseId: string, params?: Record<string, string>) => {
        const response = await apiClient.get(`/cases/${caseId}/timeline`, { params });
        return response.data;
    },
    getClusters: async (caseId: string): Promise<TimelineCluster[]> => {
        const { data } = await apiClient.get(`/cases/${caseId}/timeline/clusters`);
        return data;
    },
    getSuspiciousEvents: async (caseId: string): Promise<SuspiciousEvent[]> => {
        const { data } = await apiClient.get(`/cases/${caseId}/timeline/suspicious-events`);
        return data;
    },
    triggerCluster: async (caseId: string) => {
        const { data } = await apiClient.post(`/cases/${caseId}/timeline/cluster`);
        return data;
    },
    triggerDetect: async (caseId: string) => {
        const { data } = await apiClient.post(`/cases/${caseId}/timeline/detect`);
        return data;
    },
    updateNote: async (caseId: string, eventId: string, notes: string) => {
        const response = await apiClient.post(`/cases/${caseId}/timeline/${eventId}/notes`, { notes });
        return response.data;
    },
};
