import { apiClient } from './client';

export const reportsApi = {
    exportPdf: async (caseId: string) => {
        const response = await apiClient.get(`/cases/${caseId}/export`, { responseType: 'blob' });
        const url = window.URL.createObjectURL(new Blob([response.data], { type: 'application/pdf' }));
        const link = document.createElement('a');
        link.href = url;
        link.setAttribute('download', `forensic-report-${caseId}.pdf`);
        document.body.appendChild(link);
        link.click();
        link.remove();
    },
    exportJson: async (caseId: string) => {
        const response = await apiClient.get(`/cases/${caseId}/export/json`);
        const jsonStr = JSON.stringify(response.data, null, 2);
        const url = window.URL.createObjectURL(new Blob([jsonStr], { type: 'application/json' }));
        const link = document.createElement('a');
        link.href = url;
        link.setAttribute('download', `forensic-report-${caseId}.json`);
        document.body.appendChild(link);
        link.click();
        link.remove();
    },
    exportCsv: async (caseId: string) => {
        const response = await apiClient.get(`/cases/${caseId}/export/csv`);
        const url = window.URL.createObjectURL(new Blob([response.data], { type: 'text/csv' }));
        const link = document.createElement('a');
        link.href = url;
        link.setAttribute('download', `timeline-${caseId}.csv`);
        document.body.appendChild(link);
        link.click();
        link.remove();
    }
};
