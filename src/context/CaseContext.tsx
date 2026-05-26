import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';

interface CaseContextType {
    selectedCaseId: string | null;
    setSelectedCaseId: (id: string | null) => void;
}

const CaseContext = createContext<CaseContextType | undefined>(undefined);

export const CaseProvider = ({ children }: { children: ReactNode }) => {
    const [selectedCaseId, setSelectedCaseId] = useState<string | null>(
        localStorage.getItem('selectedCaseId') || null
    );

    useEffect(() => {
        if (selectedCaseId) {
            localStorage.setItem('selectedCaseId', selectedCaseId);
        } else {
            localStorage.removeItem('selectedCaseId');
        }
    }, [selectedCaseId]);

    return (
        <CaseContext.Provider value={{ selectedCaseId, setSelectedCaseId }}>
            {children}
        </CaseContext.Provider>
    );
};

export const useCase = () => {
    const context = useContext(CaseContext);
    if (context === undefined) {
        throw new Error('useCase must be used within a CaseProvider');
    }
    return context;
};
