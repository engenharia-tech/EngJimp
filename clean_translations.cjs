const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'src/i18n/translations.ts');
const content = fs.readFileSync(filePath, 'utf8');

// This is a very basic parser that assumes the structure:
// export const translations = {
//   "pt-BR": { ... },
//   "es-ES": { ... },
//   "en-US": { ... }
// };

function cleanLanguageObject(langContent) {
    const lines = langContent.split('\n');
    const map = new Map();
    
    // We iterate forwards, later occurrences overwrite earlier ones
    for (let line of lines) {
        const trimmed = line.trim();
        const match = trimmed.match(/^"([^"]+)":\s*(.*)$/);
        if (match) {
            const key = match[1];
            let value = match[2];
            // Remove trailing comma if present
            if (value.endsWith(',')) {
                value = value.slice(0, -1).trim();
            }
            map.set(key, value);
        }
    }

    return Array.from(map.entries())
        .map(([key, value], index, array) => {
            const comma = index === array.length - 1 ? "" : ",";
            return `    "${key}": ${value}${comma}`;
        })
        .join('\n');
}

const ptStart = content.indexOf('"pt-BR": {');
const esStart = content.indexOf('"es-ES": {');
const enStart = content.indexOf('"en-US": {');
const end = content.lastIndexOf('}');

// Get content between braces
function getInnerContent(start, nextStart) {
    let sub = content.substring(start, nextStart).trim();
    // Find first { and last }
    const firstBrace = sub.indexOf('{');
    const lastBrace = sub.lastIndexOf('}');
    return sub.substring(firstBrace + 1, lastBrace).trim();
}

const ptContent = getInnerContent(ptStart, esStart);
const esContent = getInnerContent(esStart, enStart);
const enContent = getInnerContent(enStart, content.length);

const cleanedPt = cleanLanguageObject(ptContent);
const cleanedEs = cleanLanguageObject(esContent);
const cleanedEn = cleanLanguageObject(enContent);

const newContent = `
export type Language = 'pt-BR' | 'es-ES' | 'en-US';

export const translations = {
  "pt-BR": {
${cleanedPt}
  },
  "es-ES": {
${cleanedEs}
  },
  "en-US": {
${cleanedEn}
  }
};
`;

fs.writeFileSync(filePath, newContent);
console.log('Translations cleaned successfully!');
