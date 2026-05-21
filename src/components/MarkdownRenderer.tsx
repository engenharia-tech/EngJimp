import React from 'react';

interface MarkdownRendererProps {
  content: string;
  theme?: 'light' | 'dark';
}

export const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({ content, theme = 'dark' }) => {
  if (!content) return null;

  // Process text block by block
  const lines = content.split('\n');
  const renderedElements: React.ReactNode[] = [];
  
  let currentList: { type: 'ul' | 'ol'; items: string[] } | null = null;
  let inTable = false;
  let tableHeaders: string[] = [];
  let tableRows: string[][] = [];

  const parseInlineStyles = (text: string): React.ReactNode[] => {
    // Basic tokenizer for bold (**), italic (*), code (`)
    const parts: React.ReactNode[] = [];
    let lastIndex = 0;
    
    // Pattern to match bold (**text**), code (`code`), or italic (*text*)
    const pattern = /(\*\*|`|\*)(.*?)\1/g;
    let match;
    
    while ((match = pattern.exec(text)) !== null) {
      const matchIndex = match.index;
      const delimiter = match[1];
      const innerText = match[2];
      
      // Add preceding plain text
      if (matchIndex > lastIndex) {
        parts.push(text.substring(lastIndex, matchIndex));
      }
      
      // Add styled parts
      if (delimiter === '**') {
        parts.push(
          <strong key={matchIndex} className={theme === 'dark' ? 'font-extrabold text-blue-400' : 'font-extrabold text-blue-600'}>
            {innerText}
          </strong>
        );
      } else if (delimiter === '`') {
        parts.push(
          <code key={matchIndex} className={`font-mono text-xs px-1.5 py-0.5 rounded ${theme === 'dark' ? 'bg-slate-800 text-amber-400' : 'bg-gray-100 text-amber-700'} border border-black/5 dark:border-white/5`}>
            {innerText}
          </code>
        );
      } else {
        parts.push(<em key={matchIndex} className="italic">{innerText}</em>);
      }
      
      lastIndex = pattern.lastIndex;
    }
    
    if (lastIndex < text.length) {
      parts.push(text.substring(lastIndex));
    }
    
    return parts.length > 0 ? parts : [text];
  };

  const flushList = (key: number) => {
    if (!currentList) return null;
    const ListTag = currentList.type;
    const listClass = ListTag === 'ul' ? 'list-disc pl-5 my-2 space-y-1' : 'list-decimal pl-5 my-2 space-y-1';
    
    // We render items
    const el = (
      <ListTag key={`list-${key}`} className={`${listClass} ${theme === 'dark' ? 'text-slate-300' : 'text-gray-700'}`}>
        {currentList.items.map((item, idx) => (
          <li key={idx} className="leading-relaxed">{parseInlineStyles(item)}</li>
        ))}
      </ListTag>
    );
    currentList = null;
    return el;
  };

  const flushTable = (key: number) => {
    if (!inTable) return null;
    const el = (
      <div key={`table-container-${key}`} className="my-4 overflow-x-auto border border-gray-200 dark:border-slate-800 rounded-xl shadow-sm">
        <table className="min-w-full divide-y divide-gray-250 dark:divide-slate-800 text-left text-xs">
          <thead className={theme === 'dark' ? 'bg-slate-900 text-slate-300' : 'bg-gray-50 text-gray-700'}>
            <tr>
              {tableHeaders.map((header, idx) => (
                <th key={idx} className="px-4 py-2.5 font-bold tracking-tight">{header.trim()}</th>
              ))}
            </tr>
          </thead>
          <tbody className={`divide-y divide-gray-200 dark:divide-slate-800 ${theme === 'dark' ? 'bg-black/30' : 'bg-white'}`}>
            {tableRows.map((row, rIdx) => (
              <tr key={rIdx} className={theme === 'dark' ? 'hover:bg-slate-900/45' : 'hover:bg-gray-50/50'}>
                {row.map((cell, cIdx) => (
                  <td key={cIdx} className="px-4 py-2 text-[13px]">{parseInlineStyles(cell.trim())}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
    inTable = false;
    tableHeaders = [];
    tableRows = [];
    return el;
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // 1. Handle code blocks
    if (trimmed.startsWith('```')) {
      if (currentList) {
        const el = flushList(i);
        if (el) renderedElements.push(el);
      }
      if (inTable) {
        const el = flushTable(i);
        if (el) renderedElements.push(el);
      }
      
      let codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith('```')) {
        codeLines.push(lines[i]);
        i++;
      }
      renderedElements.push(
        <pre key={`code-${i}`} className={`p-3 rounded-xl font-mono text-xs overflow-x-auto border ${theme === 'dark' ? 'bg-slate-950 border-slate-800 text-blue-400' : 'bg-gray-50 border-gray-200 text-blue-600'} my-3 leading-relaxed`}>
          <code>{codeLines.join('\n')}</code>
        </pre>
      );
      continue;
    }

    // 2. Handle Tables
    if (trimmed.startsWith('|')) {
      if (currentList) {
        const el = flushList(i);
        if (el) renderedElements.push(el);
      }
      
      const parts = line.split('|').slice(1, -1);
      if (!inTable) {
        inTable = true;
        tableHeaders = parts;
        // Skip separator line if next is dashed separator
        if (i + 1 < lines.length && lines[i + 1].trim().startsWith('|') && lines[i + 1].includes('-')) {
          i++; 
        }
      } else {
        tableRows.push(parts);
      }
      continue;
    } else if (inTable) {
      const el = flushTable(i);
      if (el) renderedElements.push(el);
    }

    // 3. Handle Lists (unordered and ordered)
    const isUnordered = trimmed.startsWith('- ') || trimmed.startsWith('* ');
    const isOrdered = /^\d+\.\s/.test(trimmed);

    if (isUnordered || isOrdered) {
      const listType = isUnordered ? 'ul' : 'ol';
      const itemText = isUnordered ? trimmed.substring(2) : trimmed.replace(/^\d+\.\s/, '');

      if (!currentList) {
        currentList = { type: listType, items: [itemText] };
      } else if (currentList.type === listType) {
        currentList.items.push(itemText);
      } else {
        // flush previous type first
        const el = flushList(i);
        if (el) renderedElements.push(el);
        currentList = { type: listType, items: [itemText] };
      }
      continue;
    } else if (currentList) {
      const el = flushList(i);
      if (el) renderedElements.push(el);
    }

    // 4. Handle Headers
    if (trimmed.startsWith('#')) {
      const level = trimmed.match(/^#+/)?.[0].length || 1;
      const text = trimmed.replace(/^#+\s*/, '');
      const headerClasses = 
        level === 1 ? 'text-lg font-black text-blue-500 my-3' :
        level === 2 ? 'text-base font-bold text-slate-200 dark:text-white my-2 border-b border-black/5 dark:border-white/5 pb-1' :
        'text-sm font-bold text-slate-300 dark:text-slate-100 my-2';
      
      renderedElements.push(
        React.createElement(`h${Math.min(level + 1, 6)}`, {
          key: `h-${i}`,
          className: headerClasses
        }, parseInlineStyles(text))
      );
      continue;
    }

    // 5. Handle empty lines
    if (!trimmed) {
      continue;
    }

    // 6. Normal block
    renderedElements.push(
      <p key={`p-${i}`} className="leading-relaxed my-2 text-justify">
        {parseInlineStyles(line)}
      </p>
    );
  }

  // Final flush loops 
  if (currentList) {
    const el = flushList(lines.length);
    if (el) renderedElements.push(el);
  }
  if (inTable) {
    const el = flushTable(lines.length);
    if (el) renderedElements.push(el);
  }

  return <div className="space-y-1">{renderedElements}</div>;
};
