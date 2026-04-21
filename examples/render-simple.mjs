// Render examples/simple.jrxml to examples/simple.pdf
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { renderJRXML } from '../dist/index.js';

const here = dirname(fileURLToPath(import.meta.url));
const jrxml = await readFile(join(here, 'simple.jrxml'), 'utf8');

const dataSource = [
  { name: 'Alice',   occupation: 'Engineer',  place: 'Berlin',    country: 'Germany' },
  { name: 'Bob',     occupation: 'Designer',  place: 'Amsterdam', country: 'Netherlands' },
  { name: 'Carol',   occupation: 'Doctor',    place: 'Vienna',    country: 'Austria' },
  { name: 'Dmitri',  occupation: 'Teacher',   place: 'Prague',    country: 'Czechia' },
  { name: 'Eve',     occupation: 'Architect', place: 'Zurich',    country: 'Switzerland' },
];

const pdf = await renderJRXML(jrxml, { dataSource });
const out = join(here, 'simple.pdf');
await writeFile(out, pdf);
console.log(`Wrote ${out} (${pdf.length} bytes)`);
