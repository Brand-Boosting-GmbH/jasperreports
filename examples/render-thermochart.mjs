// Render examples/thermochart.jrxml to examples/thermochart.pdf
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { renderJRXML } from '../dist/index.js';

const here = dirname(fileURLToPath(import.meta.url));
const jrxml = await readFile(join(here, 'thermochart.jrxml'), 'utf8');

const dataSource = [{
  title: 'Reactor Core Temperature',
  value: 72,
  rangeMin: 0,
  rangeMax: 100,
  firstSubRangeMin: 0,
  firstSubRangeMax: 33,
  secondSubRangeMin: 33,
  secondSubRangeMax: 66,
  thirdSubRangeMin: 66,
  thirdSubRangeMax: 100,
}];

const pdf = await renderJRXML(jrxml, { dataSource });
const out = join(here, 'thermochart.pdf');
await writeFile(out, pdf);
console.log(`Wrote ${out} (${pdf.length} bytes)`);
