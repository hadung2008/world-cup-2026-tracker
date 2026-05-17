import fs from 'fs';

let content = fs.readFileSync('src/App.tsx', 'utf-8');

// Undo bad replacements if they exist
content = content.replace(/ dark:text-gray-100/g, '');
content = content.replace(/ dark:bg-\\[#141414\\]/g, '');
content = content.replace(/ dark:border-slate-800/g, '');
content = content.replace(/ dark:bg-\\[#1A1A1A\\]/g, '');
content = content.replace(/ dark:bg-\\[#2A2A2A\\]/g, '');
content = content.replace(/ dark:text-slate-400/g, '');
content = content.replace(/ dark:text-slate-500/g, '');
content = content.replace(/ dark:text-slate-200/g, '');

const replacements = [
  [/text-\\[#1A1A1A\\]/g, 'text-[#1A1A1A] dark:text-gray-100'],
  [/bg-white(?!\/)/g, 'bg-white dark:bg-[#141414]'],
  [/border-slate-200/g, 'border-slate-200 dark:border-slate-800'],
  [/bg-slate-50(?!\/)/g, 'bg-slate-50 dark:bg-[#1A1A1A]'],
  [/bg-slate-100(?!\/)/g, 'bg-slate-100 dark:bg-[#2A2A2A]'],
  [/text-slate-500(?!\/)/g, 'text-slate-500 dark:text-slate-400'],
  [/text-slate-400(?!\/)/g, 'text-slate-400 dark:text-slate-500'],
  [/border-slate-100/g, 'border-slate-100 dark:border-slate-800'],
  [/text-slate-700/g, 'text-slate-700 dark:text-slate-200'],
  [/text-slate-800/g, 'text-slate-800 dark:text-slate-200']
];

let i = 0;
for (const [search, replace] of replacements) {
  // Use a temporary token so we don't accidentally match and replace again in subsequent passes
  content = content.replace(search, `__TODO_REPLACE_${i}__`);
  i++;
}

i = 0;
for (const [search, replace] of replacements) {
  content = content.replace(new RegExp(`__TODO_REPLACE_${i}__`, 'g'), replace as string);
  i++;
}

fs.writeFileSync('src/App.tsx', content);
console.log('Transform complete.');
