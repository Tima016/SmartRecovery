import {
    createContext,
    useContext,
    useState,
    useCallback,
    type ReactNode,
} from 'react';
import type { Lang } from '../i18n/translations';

interface LanguageContextType {
    lang: Lang;
    toggleLang: () => void;
    setLang: (l: Lang) => void;
}

export const LanguageContext = createContext<LanguageContextType>({
    lang: 'en',
    toggleLang: () => { },
    setLang: () => { },
});

export function LanguageProvider({ children }: { children: ReactNode }) {
    const [lang, setLangState] = useState<Lang>(() => {
        return (localStorage.getItem('idfr_lang') as Lang) || 'en';
    });

    const setLang = useCallback((l: Lang) => {
        setLangState(l);
        localStorage.setItem('idfr_lang', l);
    }, []);

    const toggleLang = useCallback(() => {
        setLang(lang === 'en' ? 'uz' : 'en');
    }, [lang, setLang]);

    return (
        <LanguageContext.Provider value={{ lang, toggleLang, setLang }}>
            {children}
        </LanguageContext.Provider>
    );
}

export function useLang() {
    return useContext(LanguageContext);
}
