
import { translations } from './src/i18n/translations';
import fs from 'fs';

const cleanTranslations = `
export type Language = 'pt-BR' | 'es-ES' | 'en-US';

export const translations = ${JSON.stringify(translations, null, 2)};
`;

fs.writeFileSync('src/i18n/translations.ts', cleanTranslations);
console.log('Translations file cleaned and deduplicated.');
