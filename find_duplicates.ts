
import { translations } from './src/i18n/translations';

function findDuplicates(lang: string) {
  const keys = Object.keys(translations[lang]);
  const seen = new Set();
  const duplicates = [];
  keys.forEach(key => {
    if (seen.has(key)) {
      duplicates.push(key);
    }
    seen.add(key);
  });
  return duplicates;
}

console.log('Duplicates in pt-BR:', findDuplicates('pt-BR'));
console.log('Duplicates in es-ES:', findDuplicates('es-ES'));
console.log('Duplicates in en-US:', findDuplicates('en-US'));
