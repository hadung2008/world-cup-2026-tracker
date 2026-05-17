import fs from 'fs';

let content = fs.readFileSync('src/App.tsx', 'utf-8');

// replace duplicate classes
content = content.replace(/(dark:[a-z0-9\-\[\]#]+)(?:\s+\1)+/g, '$1');

// fix root div
content = content.replace(/min-h-screen bg-\[\#F8F9FA\] dark:bg-\[\#0A0A0A\] text-\[\#1A1A1A\] font-sans/, 'min-h-screen bg-[#F8F9FA] dark:bg-[#0A0A0A] text-[#1A1A1A] dark:text-[#E0E0E0] font-sans');

// fix some specific cases
content = content.replace(/hover:text-\\[#1A1A1A\\]/g, 'hover:text-[#1A1A1A] hover:dark:text-white');
content = content.replace(/text-slate-900/g, 'text-slate-900 dark:text-slate-100');

fs.writeFileSync('src/App.tsx', content);
console.log('Cleanup complete.');
