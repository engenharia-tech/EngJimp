
const fs = require('fs');
const content = fs.readFileSync('src/i18n/translations.ts', 'utf8');

// This is a bit hacky but should work for this specific file structure
const sections = content.split(/\"(pt-BR|es-ES|en-US)\": \{/);

for (let i = 1; i < sections.length; i += 2) {
    const lang = sections[i];
    const body = sections[i+1];
    const lines = body.split('\n');
    const keys = new Set();
    const duplicates = [];
    
    lines.forEach((line, index) => {
        const match = line.match(/^\s*\"([^\"]+)\":/);
        if (match) {
            const key = match[1];
            if (keys.has(key)) {
                duplicates.push({ key, line: index + 1 });
            }
            keys.add(key);
        }
    });
    
    if (duplicates.length > 0) {
        console.log(`Duplicates in ${lang}:`);
        duplicates.forEach(d => console.log(`  Key: "${d.key}" at relative line ${d.line}`));
    } else {
        console.log(`No duplicates in ${lang}`);
    }
}
