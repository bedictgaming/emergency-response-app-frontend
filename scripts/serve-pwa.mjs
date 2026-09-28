process.env.NEXT_EXPORT_DIR = 'out';
process.env.PORT ||= '3100';

console.log(`PWA preview: http://127.0.0.1:${process.env.PORT}`);
await import('./serve-export.mjs');
