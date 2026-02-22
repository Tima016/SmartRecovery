import { useContext } from 'react';
import { LanguageContext } from '../context/LanguageContext';
import { translations } from './translations';

export function useTranslation() {
    const { lang } = useContext(LanguageContext);

    function t(key: string): string {
        return translations[lang][key] ?? key;
    }

    return { t, lang };
}
