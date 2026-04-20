# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.3.0] - 2026-04-21

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
