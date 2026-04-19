# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
