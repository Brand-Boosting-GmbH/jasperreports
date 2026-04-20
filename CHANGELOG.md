# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]
## [0.5.0] - 2026-04-20

### Added
- **`<frame>` nested layout.** Frames render an optional background +
  border and recursively draw their children with coordinates relative to
  the frame's top-left corner.
- **`<break>` element.** `type="Page"` starts a new page; `type="Column"`
  advances to the next column (falling back to a new page when columns
  are exhausted).
- **Multi-column reports.** `columnCount`, `columnWidth`, and
  `columnSpacing` on `<jasperReport>` are honored. Detail / group bands
  flow column-by-column before spilling to a new page; page headers and
  footers still span the full width.
- **Subreports.** New `subreportResolver(expression, ctx)` render option
  — the parent evaluates `<subreportParameter>` expressions, invokes the
  resolver with `{ parameters, fields }`, renders the returned
  `ParsedReport` into a standalone PDF, and embeds its first page at the
  subreport's rectangle. Data sources and field overrides can be passed
  through via the resolver's return value.
- **Hyperlinks.** `hyperlinkType="Reference"` with
  `<hyperlinkReferenceExpression>` emits a PDF URI link annotation.
  `hyperlinkType="LocalAnchor"` with `<hyperlinkAnchorExpression>` emits
  an internal GoTo annotation, resolved against anchors declared via
  `<anchorNameExpression>` (forward references supported).
- **Anchors and bookmarks.** `<anchorNameExpression bookmarkLevel="N">`
  registers a named destination and, when `bookmarkLevel ≥ 1`, adds an
  entry to the PDF outline (bookmarks panel). The outline is built as a
  flat sibling list in render order.

## [0.4.0] - 2026-04-20

### Added
- **Iterable data source.** New `dataSource: Array<Record<string, any>>`
  render option — the `<detail>` band is rendered once per row, with
  `$F{...}` bound to that row's fields. Falls back to a single iteration
  using `options.fields` when omitted.
- **Automatic multi-page layout.** When a band won't fit above the
  `pageFooter`, a new page is started and the `<pageHeader>` +
  `<columnHeader>` are automatically repeated. `<lastPageFooter>` (if
  present) replaces `<pageFooter>` on the final page.
- **Report variables with calculations.** Full support for
  `calculation="Sum" | "Count" | "DistinctCount" | "Average" | "Lowest" |
  "Highest" | "First" | "Nothing"`, with `resetType="Report" | "Page" |
  "Group"` and optional `resetGroup`. Custom `<variableExpression>` and
  `<initialValueExpression>` are evaluated.
- **Built-in variables** `PAGE_NUMBER`, `PAGE_COUNT`, and `REPORT_COUNT`.
  `PAGE_COUNT` is resolved via transparent two-pass rendering when the
  template references it.
- **Groups.** `<group>` declarations with `<groupExpression>`,
  `<groupHeader>`, and `<groupFooter>`. Headers/footers are emitted
  automatically as the group expression value changes across rows.
  `isReprintHeaderOnEachPage` causes the group header to repeat at the
  top of each page the group spans.
- **Dynamic band height.** `textAdjust="StretchHeight"` on `<textField>`
  grows the text box to fit wrapped lines and extends the band height
  accordingly.
- **Custom font embedding.** New `fonts: { fontkit, families }` render
  option — pass a `@pdf-lib/fontkit` instance plus family bytes
  (normal/bold/italic/boldItalic) to use arbitrary TrueType/OpenType
  fonts. Family names in `<font fontName="…">` resolve to the custom
  family when registered.
- **Resource bundles.** `$R{key}` expressions resolve from the new
  `resources` render option.
- **`SimpleDateFormat` in expressions** — covered by the v0.3.0 engine
  rewrite (roadmap item #18), now verified by Tier 3 tests.

### Changed
- `ParsedReport.variables` is now `Map<string, ReportVariable>` with the
  full variable declaration instead of a shallow subset.
- `ParsedReport` now exposes `groups: ReportGroup[]`.
- Renderer internals are reorganized around a single `renderPass()`
  method that both the dry-run and the final pass share.
## [0.3.0] - 2026-04-20

### Added
- **Expression engine rewrite.** Replaced the regex-based evaluator with a
  recursive-descent parser + evaluator supporting arithmetic (`+ - * / %`),
  comparison (`== != < > <= >=`), logic (`&& || !` with short-circuit),
  ternary (`a ? b : c`), member access, and method calls.
- **Java method shims** for `String` (`toUpperCase`, `substring`, `startsWith`,
  `replace`, `replaceAll`, `charAt`, `split`, `equals`, `equalsIgnoreCase`,
  `isEmpty`, …), `Number` (`toFixed`, `intValue`, `longValue`, …), `Date`
  (`getFullYear`, `getMonth`, `format`, …), and `Boolean`.
- **Constructors:** `new SimpleDateFormat(pattern).format(date)`,
  `new Date(...)`, `new Integer(x)`, `new Double(x)`, `new Boolean(x)`.
- **`<style>` parsing + inheritance.** Top-level `<style>` declarations are
  parsed and merged into elements that reference them via `style="Name"`.
  Nested style inheritance (`parent → child`) is supported.
- **`<box>` borders + padding.** Per-side pens (`topPen`, `leftPen`,
  `bottomPen`, `rightPen`) and paddings (`topPadding`, `leftPadding`,
  `bottomPadding`, `rightPadding`, or shorthand `padding`) are parsed
  and rendered on `<staticText>` and `<textField>` elements.
- **Text rotation.** `rotation="Left" | "Right" | "UpsideDown"` on
  `<textElement>` rotates the drawn text around the element box center.
- **Styled markup.** `markup="styled"` parses inline `<b>`, `<i>`, `<u>`,
  and `<color rgb="#RRGGBB">` tags into style runs rendered with the
  appropriate font variant.
- 40 new unit tests for the expression engine (70 → 75 tests total
  including new Tier 2 integration tests).

### Changed
- `imageResolver` now receives a coerced `string` even when the image
  expression evaluates to a non-string value.
- Public `ParsedReport` now exposes `styles: Map<string, ReportStyle>`.
- `TextStyle` gains optional `rotation` and `markup` fields; `ReportElement`
  gains optional `style`.
- `StaticTextElement` and `TextFieldElement` now carry an optional `box`.

## [0.2.0] - 2026-04-20

### Added
- `isUnderline` is now actually rendered under text lines.
- `lineStyle` on `<line>` elements (`Dashed` / `Dotted`) is now rendered.
- `scaleImage` modes (`FillFrame`, `RetainShape`, `Clip`) with respect for `hAlign` / `vAlign`.
- 3-digit hex color shorthand (`#RGB` → `#RRGGBB`) in `forecolor` / `backcolor` / pen colors.
- `printWhenExpression` on any report element — evaluated and gates rendering.
- `pattern` attribute on `<textField>` now formats numbers (DecimalFormat subset:
  `0`, `#`, `,`, `.`, `%`, `‰`, literal prefix/suffix) and dates (SimpleDateFormat
  subset: `y`, `M`, `d`, `H`, `h`, `m`, `s`, `S`, `a`, `E`, with quoted literals).
- `textField.expressionClass` is now captured from `<textFieldExpression class="…">`.
- New `formatPattern`, `formatNumber`, `formatDate`, `isTruthyPrintWhen` helpers in
  `src/format.ts`, exported for power users via `jasperreports/dist/format` (internal).

### Changed
- Replaced the in-tree hand-rolled XML parser with an adapter over
  [`fast-xml-parser`](https://github.com/NaturalIntelligence/fast-xml-parser)
  for better spec coverage, performance, and maintenance.

## [0.1.0] - 2026-04-19

### Added
- Initial public release.
- `renderJRXML(jrxml, options)` — render a JRXML template to a PDF `Uint8Array`.
- `parseJRXML(jrxml)` — parse a JRXML template into a structured `ParsedReport`.
- Pure-JavaScript XML parser (no DOMParser dependency) for Cloudflare Workers compatibility.
- Support for `staticText`, `textField`, `image`, `line`, `rectangle`, `ellipse`.
- Expression evaluator for `$F{}`, `$P{}`, `$V{}` references with string concatenation.
- Standard PDF fonts (Helvetica, Times, Courier) with Bold/Italic variants.
- Pluggable `imageResolver` for PNG/JPG embedding from any source.
- Dual ESM + CJS build with TypeScript declarations.
