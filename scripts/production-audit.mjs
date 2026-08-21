#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const roots = ['src', 'android-custom/app/src/main/java'];
const extensions = new Set(['.ts', '.tsx', '.kt']);
const forbidden = [
  { re: /getStreamUri\([^\n]*\)[\s\S]{0,1200}readFileBase64\(/, msg: 'Native media must not fall back from streaming URI to whole-file Base64.' },
];

function walk(dir, out=[]) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, {withFileTypes:true})) {
    if (entry.name === 'node_modules' || entry.name === '.next' || entry.name === 'build') continue;
    const p=path.join(dir, entry.name);
    if (entry.isDirectory()) walk(p,out);
    else if (extensions.has(path.extname(p))) out.push(p);
  }
  return out;
}

let failures=[];
for (const file of roots.flatMap(r=>walk(r))) {
  const text=fs.readFileSync(file,'utf8');
  for (const rule of forbidden) {
    if (rule.re.test(text)) failures.push(`${file}: ${rule.msg}`);
  }
  const lines=text.split(/\r?\n/);
  lines.forEach((line, i) => {
    if (/readFileBase64\(/.test(line) && !/async\s+readFileBase64\(/.test(line) && !/return\s+await\s+nativeFileSystem\.readFileBase64/.test(line)) {
      failures.push(`${file}:${i+1}: unexpected readFileBase64 call`);
    }
  });
}

if (failures.length) {
  console.error('Production audit FAILED');
  for (const f of failures) console.error(`- ${f}`);
  process.exit(1);
}
console.log('Production audit passed: no known native whole-file media fallback pattern detected.');
