# Roadmap

Prioritized list of JRXML features not yet implemented, ordered by effort.

## Tier 1 — Trivial (v0.2.0) ✅ Shipped

- [x] 1. `isUnderline` rendering — draw a line under each text line in `drawText()`. Already parsed.
- [x] 2. `lineStyle` (Dashed / Dotted) — pass `dashArray` to pdf-lib `drawLine`. Already parsed.
- [x] 3. `scaleImage` modes (`Clip`, `FillFrame`, `RetainShape`) — math on image intrinsic vs. element size.
- [x] 4. Hex color shorthand `#RGB` — expand to 6-digit in `parseColor()`.
- [x] 5. `printWhenExpression` (basic) — evaluate via `ExpressionEvaluator`, skip element if false.
- [x] 6. Pattern-based number formatting (`#,##0.00`) — `Intl.NumberFormat`.
- [x] 7. Pattern-based date formatting (`yyyy-MM-dd`, `dd.MM.yyyy`) — token-map to `Intl.DateTimeFormat`.

## Tier 2 — Small (v0.3.0) ✅ Shipped

- [x] 8. `<box>` borders + padding.
- [x] 9. Text rotation (`rotation="Left"/"Right"/"UpsideDown"`).
- [x] 10. `markup="styled"` inline styling (`<b>`, `<i>`, `<color>`).
- [x] 11. Arithmetic in expressions (`+ - * / %` with numbers).
- [x] 12. Conditional expressions (`cond ? a : b`).
- [x] 13. `<style>` + style inheritance.
- [x] 14. Java method shims (`.toUpperCase()`, `.trim()`, `.substring()`, `.toString()`).

## Tier 3 — Medium (v0.5.0 / v0.6.0)

- [ ] 15. Automatic multi-page layout (add page on overflow, repeat page/columnHeader).
- [ ] 16. Dynamic band height (`isStretchWithOverflow`, `textAdjust="StretchHeight"`).
- [ ] 17. Report variables with `calculation="Sum"/"Count"/"Average"/"Lowest"/"Highest"/"First"`.
- [ ] 18. `SimpleDateFormat` calls in expressions.
- [ ] 19. Custom font embedding via `fonts` render option.
- [ ] 20. Iterable data source — detail band repeats per row. **Biggest semantic unlock.**
- [ ] 21. Groups (`<group>` + headers/footers). Requires #20.

## Tier 4 — Large (v0.7.0+)

- [ ] 22. `<frame>` (nested element positioning).
- [ ] 23. `<break>` (page/column break) — trivial once #15 exists.
- [ ] 24. Subreports (simple case).
- [ ] 25. Multi-column layout.
- [ ] 26. Hyperlinks / anchors / bookmarks.
- [ ] 27. Resource bundles / i18n (`$R{key}`).

## Tier 5 — Out of scope

- [ ] 28. Charts — ship as separate `jasperreports-charts` plugin.
- [ ] 29. Crosstabs — would need a pivot engine.
- [ ] 30. Barcodes — separate plug-in via `componentElement` hook.
- [ ] 31. `markup="html"` / `"rtf"` — pulls in a huge renderer.
- [ ] 32. `<queryString>` / `<scriptlet>` — intentional: no DB/Java on edge runtimes.

---

## Release sequence

| Version | Scope |
|---|---|
| **v0.2.0** | Tier 1 — polish, no breaking changes |
| **v0.3.0** | Tier 2 — expression engine + styles + box + rotation + markup |
| **v0.4.0** | Layout extras, remaining Tier 2 polish |
| **v0.5.0** | Iterable data + multi-page (#15, #16, #20) — the big one |
| **v0.6.0** | Groups + variable calculations (#17, #21) |
| **v0.7.0+** | Tier 4 as needs arise |
