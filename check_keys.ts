
import { translations } from './src/i18n/translations';

const ptKeys = Object.keys(translations['pt-BR']);
const esKeys = Object.keys(translations['es-ES']);
const enKeys = Object.keys(translations['en-US']);

console.log('Missing in es-ES:');
ptKeys.forEach(key => {
  if (!esKeys.includes(key)) {
    console.log(`- ${key}`);
  }
});

console.log('\nMissing in en-US:');
ptKeys.forEach(key => {
  if (!enKeys.includes(key)) {
    console.log(`- ${key}`);
  }
});

console.log('\nExtra in es-ES:');
esKeys.forEach(key => {
  if (!ptKeys.includes(key)) {
    console.log(`- ${key}`);
  }
});

console.log('\nMissing in pt-BR (compared to es-ES):');
esKeys.forEach(key => {
  if (!ptKeys.includes(key)) {
    console.log(`- ${key}`);
  }
});

console.log('\nMissing in pt-BR (compared to en-US):');
enKeys.forEach(key => {
  if (!ptKeys.includes(key)) {
    console.log(`- ${key}`);
  }
});
