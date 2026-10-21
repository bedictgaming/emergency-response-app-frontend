'use strict';
// Narrow replacement for the only fast-glob call in Next ESLint16.3.8.
// All upstream Next/React/a11y/import/TypeScript rules remain unchanged.
const { globSync: nativeGlobSync, statSync } = require('node:fs');

function globSync(pattern, options) {
  if (typeof pattern !== 'string' || !pattern || pattern.length > 4096 || pattern.includes('\0')) throw Error('NEXT_ROOT_GLOB_PATTERN_INVALID');
  if (!options || options.onlyDirectories !== true || Object.keys(options).some(key => key !== 'onlyDirectories')) throw Error('NEXT_ROOT_GLOB_OPTIONS_UNSUPPORTED');
  // Settings are local configuration, not request input. Still reject excessive
  // nesting before invoking any pattern engine; no recursive braces dependency.
  let depth = 0;
  for (const character of pattern) {
    if (character === '{' || character === '(') { if (++depth > 32) throw Error('NEXT_ROOT_GLOB_DEPTH_EXCEEDED'); }
    if (character === '}' || character === ')') depth = Math.max(0, depth - 1);
  }
  return nativeGlobSync(pattern.replaceAll('\\', '/')).filter(file => {
    try { return statSync(file).isDirectory(); }
    catch (error) { if (error.code === 'ENOENT' || error.code === 'ENOTDIR') return false; throw error; }
  }).map(file => file.replaceAll('\\', '/'));
}

module.exports = Object.freeze({ globSync });
