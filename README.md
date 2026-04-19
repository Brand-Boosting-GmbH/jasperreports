# jasperreports (lite)

[![npm version](https://img.shields.io/npm/v/jasperreports.svg)](https://www.npmjs.com/package/jasperreports)
[![CI](https://github.com/Brand-Boosting-GmbH/jasperreports/actions/workflows/ci.yml/badge.svg)](https://github.com/Brand-Boosting-GmbH/jasperreports/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)

Lightweight, **zero-Java** JRXML → PDF renderer for modern JavaScript runtimes.

Runs natively in **Cloudflare Workers**, **Node.js 18+**, **Deno**, and **browsers** — no JVM,
no Puppeteer, no headless Chrome. Pure TypeScript + [`pdf-lib`](https://github.com/Hopding/pdf-lib).

> ⚠️ **This is a pragmatic subset, not a full JasperReports port.** It covers roughly the set
> of features you need for certificates, confirmations, tickets, labels and simple
> single-page invoices. See the [Feature matrix](#feature-matrix) below before adopting it —
> if your templates need subreports, charts, groups, tables with sums, or multi-page layout,
> you will be disappointed.

## Why?

Classic JasperReports requires a Java runtime. That rules it out for edge platforms
(Cloudflare Workers, Vercel Edge, Deno Deploy) and makes it awkward for plain Node.js
services. `jasperreports` renders a practical subset of JRXML natively in JavaScript.

| | `jasperreports` | Java JasperReports | Puppeteer |
|---|---|---|---|
| Bundle size | ~27 KB + pdf-lib | hundreds of MB + JVM | ~200 MB |
| Cloudflare Workers | ✅ | ❌ | ❌ |
| Cold start | milliseconds | seconds | seconds |
| Dependencies | `pdf-lib` | JVM | Chromium |
| JRXML coverage | subset (see below) | 100% | N/A |

## Install

```bash
npm install jasperreports
```

## Quick start

```ts
import { renderJRXML } from 'jasperreports';
import { writeFile } from 'node:fs/promises';

const jrxml = await (await fetch('https://example.com/certificate.jrxml')).text();

const pdfBytes = await renderJRXML(jrxml, {
  fields: {
    Vorname: 'Max',
    Nachname: 'Mustermann',
    Datum: '15. Januar 2026',
  },
  imageResolver: async (path) => {
    const res = await fetch(path);
    return new Uint8Array(await res.arrayBuffer());
  },
});

await writeFile('certificate.pdf', pdfBytes);
```

## Is my template supported?

Quick sanity check before you adopt this library — grep your template for unsupported
elements:

```bash
grep -E "<(subreport|group|chart|crosstab|frame|break|componentElement|genericElement)" your-template.jrxml
```

If any match you are almost certainly outside of this library's supported surface.

## Feature matrix

### ✅ Supported

**Report structure**

| Feature | Notes |
|---|---|
| `<jasperReport>` root | `pageWidth`, `pageHeight`, `columnWidth`, margins, `orientation`, `name` |
| `<field>` | `name`, `class` (effectively string) |
| `<parameter>` | `name`, `class`, `defaultValueExpression` |
| `<variable>` | Definitions are parsed, **but calculations are not executed** |
| Bands | `background`, `title`, `pageHeader`, `columnHeader`, `detail`, `columnFooter`, `pageFooter`, `lastPageFooter`, `summary`, `noData` |

**Elements**

| Element | Support |
|---|---|
| `<staticText>` | ✅ Full |
| `<textField>` | ✅ incl. `isBlankWhenNull`, `textAdjust` |
| `<image>` | ✅ PNG/JPG via `imageResolver` callback |
| `<line>` | ✅ incl. `direction` (`TopDown` / `BottomUp`) |
| `<rectangle>` | ✅ fill + border |
| `<ellipse>` | ✅ Full |

**Element attributes**

| Attribute | Support |
|---|---|
| `reportElement` (x, y, width, height) | ✅ |
| `forecolor`, `backcolor` | ✅ hex `#RRGGBB` |
| `mode` (`Opaque` / `Transparent`) | ✅ |
| `textAlignment` | ✅ `Left`, `Center`, `Right` |
| `verticalAlignment` | ✅ `Top`, `Middle`, `Bottom` |
| `fontName` | ✅ `Helvetica`, `Times`, `Courier` (standard PDF fonts) |
| `size`, `isBold`, `isItalic` | ✅ |
| `pen` (`lineWidth`, `lineColor`) | ✅ |

**Expressions**

| Pattern | Example |
|---|---|
| Field reference | `$F{fieldName}` |
| Parameter reference | `$P{paramName}` |
| Variable reference | `$V{varName}` |
| String concatenation | `$F{first} + " " + $F{last}` |
| String literals | `"Prefix: " + $F{value}` |

### ❌ Not supported

**Report-level features**

| Feature | Why not |
|---|---|
| `<subreport>` | Requires nested report execution |
| `<group>` + `groupHeader` / `groupFooter` | Requires data-driven grouping |
| `<style>` / style inheritance | Styles must be inlined |
| `<template>` / external stylesheets | No external resource loading |
| `<queryString>` | No database access |
| `<scriptlet>` | No Java execution |
| `<sortField>` | No data sorting |
| Report variables with calculations (`Sum`, `Average`, `Count`, …) | Only static substitution |
| Resource bundles / i18n | No locale support |

**Elements**

| Element | Status |
|---|---|
| `<frame>` | ❌ grouping container |
| `<break>` | ❌ page / column break |
| `<componentElement>` | ❌ barcodes, lists, maps |
| `<genericElement>` | ❌ custom extensions |
| `<chart>` / `<barChart>` / `<pieChart>` / … | ❌ no chart engine |
| `<crosstab>` | ❌ pivot tables |

**Attributes**

| Attribute | Status | Workaround |
|---|---|---|
| `pattern` (date/number formatting) | ❌ parsed but ignored | Pre-format values before passing them in `fields` |
| `markup` (`html`, `styled`, `rtf`) | ❌ | Plain text only |
| `rotation` (text rotation) | ❌ | — |
| `printWhenExpression` (conditional rendering) | ❌ | Omit the element or pre-filter data |
| `hyperlinkType` / anchors / bookmarks | ❌ | — |
| `box` / border / padding | ❌ | — |
| Line spacing / paragraph indent | ❌ | — |
| `scaleImage` on images | ❌ parsed but ignored | Image always stretches to the element box |
| Custom fonts via `<fontName>` | ❌ | Falls back to Helvetica |
| `isUnderline` | ⚠️ parsed but not rendered | — |
| `lineStyle` (`Dashed` / `Dotted`) | ⚠️ parsed but not rendered | Solid lines only |

**Expressions**

| Feature | Example that won't work |
|---|---|
| Java method calls | `$F{name}.toUpperCase()` |
| Date formatting | `new SimpleDateFormat(...)` |
| Arithmetic | `$F{price} * $F{quantity}` |
| Conditional expressions | `$F{x} != null ? "yes" : "no"` |
| String manipulation | `$F{name}.substring(0, 3)` |

**Layout**

| Feature | Status |
|---|---|
| Multi-page output (automatic page break) | ❌ single page only |
| Multi-column layout | ❌ single column only |
| Dynamic band height (`stretchType`) | ❌ fixed height |

### Rough coverage estimate

Roughly **~70 % of simple certificate / invoice / receipt templates** should work out of
the box.

- ✅ Works well: certificates, diplomas, confirmations, tickets, labels, simple
  fixed-layout invoices, single-page static reports.
- ❌ Will not work: reports with data tables (row lists), financial reports with sums or
  totals, reports with charts or crosstabs, multi-page reports, reports that rely on Java
  expressions for formatting.

## API

### `renderJRXML(jrxml, options?) => Promise<Uint8Array>`

Renders a JRXML template string to a PDF byte array.

```ts
interface JRXMLRenderOptions {
  /** Values for `$F{fieldName}` expressions. */
  fields?: Record<string, unknown>;
  /** Values for `$P{paramName}` expressions. */
  parameters?: Record<string, unknown>;
  /** Resolve image paths to PNG/JPG bytes. */
  imageResolver?: (path: string) => Promise<Uint8Array | null>;
  /** Enable verbose console logging. */
  debug?: boolean;
}
```

### `parseJRXML(jrxml, debug?) => ParsedReport`

Parses a JRXML template without rendering. Useful for introspection, validation,
or building custom renderers.

```ts
import { parseJRXML } from 'jasperreports';

const report = parseJRXML(jrxml);
console.log('Fields:', [...report.fields.keys()]);
console.log('Page:', report.config.pageWidth, 'x', report.config.pageHeight);
```

### Low-level classes

For advanced use cases the underlying classes are also exported:
`JRXMLParser`, `JRXMLRenderer`, `ExpressionEvaluator`.

## Cloudflare Workers example

```ts
import { renderJRXML } from 'jasperreports';

export default {
  async fetch(request: Request): Promise<Response> {
    const { jrxml, fields, images } = await request.json();

    const pdfBytes = await renderJRXML(jrxml, {
      fields,
      imageResolver: async (path) => {
        const url = images?.[path];
        if (!url) return null;
        const res = await fetch(url);
        return new Uint8Array(await res.arrayBuffer());
      },
    });

    return new Response(pdfBytes, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': 'attachment; filename="document.pdf"',
      },
    });
  },
};
```

A full Worker example lives in [examples/cloudflare-worker.ts](examples/cloudflare-worker.ts).

## Design notes

- **No DOMParser.** Cloudflare Workers do not ship `DOMParser`, so this library
  includes a tiny purpose-built XML parser in [src/xml-parser.ts](src/xml-parser.ts).
- **`pdf-lib` over Puppeteer.** ~200 KB versus ~200 MB, and it actually runs on the edge.
- **Pluggable image resolution.** Images are not embedded in the JRXML; you pass an async
  resolver that can pull bytes from URLs, KV, R2, the filesystem, base64, etc.

## Roadmap

- [ ] Automatic multi-page layout
- [ ] Group headers / footers
- [ ] Custom font embedding helpers
- [ ] Richer expression engine (method calls, `SimpleDateFormat`, arithmetic, conditionals)
- [ ] Subreport support (simple cases)
- [ ] Render `isUnderline`, `lineStyle`, `scaleImage`, `pattern`
- [ ] Barcode elements via plug-in

## Development

```bash
npm install
npm test
npm run build
```

## Publishing

Releases are triggered by bumping the `version` field in [package.json](package.json)
on `main`. No tags, no extra commands.

1. One-time setup: add an `NPM_TOKEN` secret to the repo (Settings → Secrets and
   variables → Actions → New repository secret) — a granular npm token with
   **Read and write** access to the `jasperreports` package.
2. Edit [package.json](package.json), change `"version"`, commit, push:

   ```bash
   # bump to whatever you want
   git commit -am "release: v0.1.1"
   git push
   ```

The `.github/workflows/release.yml` workflow compares the local `version` to what's on
npm. If they differ, it runs typecheck + tests + build, publishes with provenance, and
creates a matching GitHub Release (e.g. `v0.1.1`) with auto-generated notes. If the
versions already match, it does nothing.

Prefer the command line? `npm version patch` still works — it edits `package.json` for
you and creates a git tag. The workflow will pick up the version change on push.

### Manual publish from your workstation

```bash
npm login
npm publish    # prepublishOnly runs clean + typecheck + test + build
```

## License

[MIT](./LICENSE) © Brand Boosting GmbH
