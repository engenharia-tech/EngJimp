
import fs from 'fs';

const content = fs.readFileSync('src/i18n/translations.ts', 'utf8');

const langs = ['pt-BR', 'es-ES', 'en-US'];

langs.forEach(lang => {
  const startIdx = content.indexOf(`'${lang}': {`);
  if (startIdx === -1) return;
  
  // Find the closing brace for this language
  let braceCount = 0;
  let endIdx = -1;
  for (let i = startIdx + lang.length + 4; i < content.length; i++) {
    if (content[i] === '{') braceCount++;
    if (content[i] === '}') {
      if (braceCount === 0) {
        endIdx = i;
        break;
      }
      braceCount--;
    }
  }
  
  if (endIdx === -1) return;
  
  const langContent = content.substring(startIdx, endIdx);
  const keyRegex = /^\s*([a-zA-Z0-9_]+):/gm;
  let match;
  const keys = [];
  while ((match = keyRegex.exec(langContent)) !== null) {
    keys.push(match[1]);
  }
  
  const seen = new Set();
  const duplicates = [];
  keys.forEach(key => {
    if (seen.has(key)) {
      duplicates.push(key);
    }
    seen.add(key);
  });
  
  console.log(`Duplicates in ${lang}:`, duplicates);
});
