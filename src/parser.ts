/**
 * JRXML Parser and Renderer
 */

import {
  PDFDocument,
  StandardFonts,
  rgb,
  PDFFont,
  PDFPage,
  PDFImage,
  degrees,
  PDFName,
  PDFString,
  PDFHexString,
  PDFArray,
  PDFNumber,
  PDFDict,
  PDFRef,
  PDFEmbeddedPage,
} from 'pdf-lib';
import { XMLParser } from './xml-parser';
import { ExpressionEvaluator } from './expression';
import { formatPattern, isTruthyPrintWhen } from './format';
import type {
  JRXMLRenderOptions,
  ParsedReport,
  ReportConfig,
  ReportElement,
  TextStyle,
  Band,
  BandElement,
  StaticTextElement,
  TextFieldElement,
  ImageElement,
  LineElement,
  RectangleElement,
  EllipseElement,
  XMLElement,
  ReportStyle,
  BoxStyle,
  BoxPen,
  ReportGroup,
  ReportVariable,
  FrameElement,
  BreakElement,
  SubreportElement,
  ElementLink,
} from './types';

// Re-export for library users
export { ExpressionEvaluator };

/**
 * JRXML Parser
 * 
 * Parses JasperReports JRXML XML into a structured representation
 */
export class JRXMLParser {
  private xml: XMLParser;
  private debug: boolean;
  private styles: Map<string, ReportStyle> = new Map();

  constructor(jrxmlContent: string, debug: boolean = false) {
    this.xml = new XMLParser(jrxmlContent);
    this.debug = debug;
  }

  private log(...args: any[]): void {
    if (this.debug) {
      console.log('[JRXMLParser]', ...args);
    }
  }

  /**
   * Parse JRXML content into a structured report
   */
  parse(): ParsedReport {
    const root = this.xml.root;
    
    if (root.tagName !== 'jasperReport') {
      throw new Error('Invalid JRXML: Root element must be jasperReport');
    }

    this.log('Parsing report:', XMLParser.getAttr(root, 'name'));

    const config = this.parseConfig(root);
    const fields = this.parseFields(root);
    const parameters = this.parseParameters(root);
    const variables = this.parseVariables(root);
    this.parseStyles(root); // populate this.styles before parsing bands
    const groups = this.parseGroups(root);
    const bands = this.parseBands(root);

    this.log('Parse complete');

    return { config, fields, parameters, variables, styles: this.styles, groups, bands };
  }

  private parseConfig(root: XMLElement): ReportConfig {
    return {
      name: XMLParser.getAttr(root, 'name', 'Untitled'),
      pageWidth: XMLParser.getAttrInt(root, 'pageWidth', 595),
      pageHeight: XMLParser.getAttrInt(root, 'pageHeight', 842),
      columnWidth: XMLParser.getAttrInt(root, 'columnWidth', 555),
      leftMargin: XMLParser.getAttrInt(root, 'leftMargin', 20),
      rightMargin: XMLParser.getAttrInt(root, 'rightMargin', 20),
      topMargin: XMLParser.getAttrInt(root, 'topMargin', 20),
      bottomMargin: XMLParser.getAttrInt(root, 'bottomMargin', 20),
      orientation: XMLParser.getAttr(root, 'orientation', 'Portrait') as 'Portrait' | 'Landscape',
      columnCount: XMLParser.getAttrInt(root, 'columnCount', 1),
      columnSpacing: XMLParser.getAttrInt(root, 'columnSpacing', 0),
      printOrder: (XMLParser.getAttr(root, 'printOrder', 'Vertical') as 'Vertical' | 'Horizontal'),
    };
  }

  private parseFields(root: XMLElement): Map<string, string> {
    const fields = new Map<string, string>();
    for (const field of XMLParser.getChildren(root, 'field')) {
      const name = XMLParser.getAttr(field, 'name');
      const cls = XMLParser.getAttr(field, 'class', 'java.lang.String');
      if (name) fields.set(name, cls);
    }
    return fields;
  }

  private parseParameters(root: XMLElement): Map<string, { class: string; defaultValue?: string }> {
    const params = new Map();
    for (const param of XMLParser.getChildren(root, 'parameter')) {
      const name = XMLParser.getAttr(param, 'name');
      const cls = XMLParser.getAttr(param, 'class', 'java.lang.String');
      const defaultExpr = XMLParser.getChild(param, 'defaultValueExpression');
      if (name) {
        params.set(name, {
          class: cls,
          defaultValue: defaultExpr ? XMLParser.getText(defaultExpr) : undefined,
        });
      }
    }
    return params;
  }

  private parseVariables(root: XMLElement): Map<string, ReportVariable> {
    const vars = new Map<string, ReportVariable>();
    for (const v of XMLParser.getChildren(root, 'variable')) {
      const name = XMLParser.getAttr(v, 'name');
      if (!name) continue;
      const expr = XMLParser.getChild(v, 'variableExpression');
      const initExpr = XMLParser.getChild(v, 'initialValueExpression');
      vars.set(name, {
        name,
        class: XMLParser.getAttr(v, 'class', 'java.lang.String'),
        calculation: (XMLParser.getAttr(v, 'calculation') || 'Nothing') as ReportVariable['calculation'],
        resetType: (XMLParser.getAttr(v, 'resetType') || 'Report') as ReportVariable['resetType'],
        resetGroup: XMLParser.getAttr(v, 'resetGroup') || undefined,
        incrementType: (XMLParser.getAttr(v, 'incrementType') || 'None') as ReportVariable['incrementType'],
        incrementGroup: XMLParser.getAttr(v, 'incrementGroup') || undefined,
        expression: expr ? XMLParser.getText(expr) : undefined,
        initialValueExpression: initExpr ? XMLParser.getText(initExpr) : undefined,
      });
    }
    return vars;
  }

  private parseGroups(root: XMLElement): ReportGroup[] {
    const groups: ReportGroup[] = [];
    for (const g of XMLParser.getChildren(root, 'group')) {
      const name = XMLParser.getAttr(g, 'name');
      if (!name) continue;
      const exprEl = XMLParser.getChild(g, 'groupExpression');
      const headerContainer = XMLParser.getChild(g, 'groupHeader');
      const footerContainer = XMLParser.getChild(g, 'groupFooter');
      const headerBand = headerContainer ? XMLParser.getChild(headerContainer, 'band') : null;
      const footerBand = footerContainer ? XMLParser.getChild(footerContainer, 'band') : null;
      groups.push({
        name,
        expression: exprEl ? XMLParser.getText(exprEl) : '',
        isStartNewPage: XMLParser.getAttrBool(g, 'isStartNewPage', false),
        isReprintHeaderOnEachPage: XMLParser.getAttrBool(g, 'isReprintHeaderOnEachPage', false),
        header: headerBand ? this.parseBand(headerBand) : undefined,
        footer: footerBand ? this.parseBand(footerBand) : undefined,
      });
    }
    return groups;
  }

  private parseStyles(root: XMLElement): void {
    for (const el of XMLParser.getChildren(root, 'style')) {
      const name = XMLParser.getAttr(el, 'name');
      if (!name) continue;
      const parent = XMLParser.getAttr(el, 'style') || undefined;
      const style: ReportStyle = {
        name,
        parent,
        forecolor: XMLParser.getAttr(el, 'forecolor') || undefined,
        backcolor: XMLParser.getAttr(el, 'backcolor') || undefined,
        mode: (XMLParser.getAttr(el, 'mode') || undefined) as ReportStyle['mode'],
        fontName: XMLParser.getAttr(el, 'fontName') || undefined,
        fontSize: el.attributes['fontSize'] ? parseFloat(el.attributes['fontSize']) : undefined,
        isBold: el.attributes['isBold'] !== undefined ? XMLParser.getAttrBool(el, 'isBold', false) : undefined,
        isItalic: el.attributes['isItalic'] !== undefined ? XMLParser.getAttrBool(el, 'isItalic', false) : undefined,
        isUnderline: el.attributes['isUnderline'] !== undefined ? XMLParser.getAttrBool(el, 'isUnderline', false) : undefined,
        textAlignment: (XMLParser.getAttr(el, 'hTextAlign') || XMLParser.getAttr(el, 'hAlign') || undefined) as ReportStyle['textAlignment'],
        verticalAlignment: (XMLParser.getAttr(el, 'vTextAlign') || XMLParser.getAttr(el, 'vAlign') || undefined) as ReportStyle['verticalAlignment'],
        pattern: XMLParser.getAttr(el, 'pattern') || undefined,
      };
      const boxEl = XMLParser.getChild(el, 'box');
      if (boxEl) style.box = this.parseBox(boxEl);
      this.styles.set(name, style);
    }
  }

  private resolveStyle(name: string | undefined): ReportStyle | null {
    if (!name) return null;
    const style = this.styles.get(name);
    if (!style) return null;
    if (!style.parent) return style;
    // Merge parent chain (shallowly). Child attributes override parent.
    const parent = this.resolveStyle(style.parent);
    if (!parent) return style;
    return { ...parent, ...Object.fromEntries(Object.entries(style).filter(([, v]) => v !== undefined)), box: { ...(parent.box || {}), ...(style.box || {}) } } as ReportStyle;
  }

  private parseBox(boxEl: XMLElement): BoxStyle {
    const readPen = (penEl: XMLElement | null, fallback?: BoxPen): BoxPen | undefined => {
      if (!penEl) return fallback;
      const lineWidth = penEl.attributes['lineWidth'] !== undefined ? parseFloat(penEl.attributes['lineWidth']) : fallback?.lineWidth ?? 1;
      const lineColor = XMLParser.getAttr(penEl, 'lineColor') || fallback?.lineColor || '#000000';
      const lineStyle = (XMLParser.getAttr(penEl, 'lineStyle') || fallback?.lineStyle || 'Solid') as BoxPen['lineStyle'];
      return { lineWidth, lineColor, lineStyle };
    };

    const basePen = readPen(XMLParser.getChild(boxEl, 'pen'));
    const box: BoxStyle = {
      topPen: readPen(XMLParser.getChild(boxEl, 'topPen'), basePen),
      leftPen: readPen(XMLParser.getChild(boxEl, 'leftPen'), basePen),
      bottomPen: readPen(XMLParser.getChild(boxEl, 'bottomPen'), basePen),
      rightPen: readPen(XMLParser.getChild(boxEl, 'rightPen'), basePen),
    };

    const parseIntOrUndef = (key: string): number | undefined => {
      const v = boxEl.attributes[key];
      return v === undefined ? undefined : parseFloat(v);
    };
    const padding = parseIntOrUndef('padding');
    box.topPadding = parseIntOrUndef('topPadding') ?? padding;
    box.leftPadding = parseIntOrUndef('leftPadding') ?? padding;
    box.bottomPadding = parseIntOrUndef('bottomPadding') ?? padding;
    box.rightPadding = parseIntOrUndef('rightPadding') ?? padding;
    return box;
  }

  private parseBands(root: XMLElement): ParsedReport['bands'] {
    const bands: ParsedReport['bands'] = { detail: [] };

    const bandMappings: Array<[string, keyof ParsedReport['bands']]> = [
      ['background', 'background'],
      ['title', 'title'],
      ['pageHeader', 'pageHeader'],
      ['columnHeader', 'columnHeader'],
      ['columnFooter', 'columnFooter'],
      ['pageFooter', 'pageFooter'],
      ['lastPageFooter', 'lastPageFooter'],
      ['summary', 'summary'],
      ['noData', 'noData'],
    ];

    for (const [xmlName, bandName] of bandMappings) {
      const container = XMLParser.getChild(root, xmlName);
      if (container) {
        const band = XMLParser.getChild(container, 'band');
        if (band) (bands as any)[bandName] = this.parseBand(band);
      }
    }

    // Detail bands (can have multiple)
    for (const detail of XMLParser.getChildren(root, 'detail')) {
      const band = XMLParser.getChild(detail, 'band');
      if (band) bands.detail.push(this.parseBand(band));
    }

    return bands;
  }

  private parseBand(bandElement: XMLElement): Band {
    const height = XMLParser.getAttrInt(bandElement, 'height', 0);
    const splitType = XMLParser.getAttr(bandElement, 'splitType') as Band['splitType'];
    const elements: BandElement[] = [];

    for (const child of bandElement.children) {
      const element = this.parseElement(child);
      if (element) elements.push(element);
    }

    return { height, splitType, elements };
  }

  private parseElement(el: XMLElement): BandElement | null {
    switch (el.tagName) {
      case 'staticText': return this.parseStaticText(el);
      case 'textField': return this.parseTextField(el);
      case 'image': return this.parseImage(el);
      case 'line': return this.parseLine(el);
      case 'rectangle': return this.parseRectangle(el);
      case 'ellipse': return this.parseEllipse(el);
      case 'frame': return this.parseFrame(el);
      case 'break': return this.parseBreak(el);
      case 'subreport': return this.parseSubreport(el);
      default: return null;
    }
  }

  private parseReportElement(el: XMLElement): ReportElement {
    const reportElement = XMLParser.getChild(el, 'reportElement');
    if (!reportElement) return { x: 0, y: 0, width: 100, height: 20 };

    const printWhenExpr = XMLParser.getChild(reportElement, 'printWhenExpression');
    const styleName = XMLParser.getAttr(reportElement, 'style') || undefined;
    const inherited = this.resolveStyle(styleName);

    return {
      x: XMLParser.getAttrInt(reportElement, 'x', 0),
      y: XMLParser.getAttrInt(reportElement, 'y', 0),
      width: XMLParser.getAttrInt(reportElement, 'width', 100),
      height: XMLParser.getAttrInt(reportElement, 'height', 20),
      uuid: XMLParser.getAttr(reportElement, 'uuid'),
      forecolor: XMLParser.getAttr(reportElement, 'forecolor') || inherited?.forecolor,
      backcolor: XMLParser.getAttr(reportElement, 'backcolor') || inherited?.backcolor,
      mode: (XMLParser.getAttr(reportElement, 'mode') as ReportElement['mode']) || inherited?.mode,
      printWhenExpression: printWhenExpr ? XMLParser.getText(printWhenExpr) : undefined,
      style: styleName,
    };
  }

  private parseTextStyle(el: XMLElement): TextStyle {
    const textElement = XMLParser.getChild(el, 'textElement');
    const font = textElement ? XMLParser.getChild(textElement, 'font') : null;
    const reportElement = XMLParser.getChild(el, 'reportElement');
    const styleName = reportElement ? XMLParser.getAttr(reportElement, 'style') : '';
    const inherited = this.resolveStyle(styleName);

    const style: TextStyle = {
      fontName: inherited?.fontName ?? 'Helvetica',
      fontSize: inherited?.fontSize ?? 12,
      isBold: inherited?.isBold ?? false,
      isItalic: inherited?.isItalic ?? false,
      isUnderline: inherited?.isUnderline ?? false,
      textAlignment: inherited?.textAlignment ?? 'Left',
      verticalAlignment: inherited?.verticalAlignment ?? 'Top',
      forecolor: inherited?.forecolor ?? '#000000',
    };

    if (textElement) {
      const ta = XMLParser.getAttr(textElement, 'textAlignment');
      if (ta) style.textAlignment = ta as TextStyle['textAlignment'];
      const va = XMLParser.getAttr(textElement, 'verticalAlignment');
      if (va) style.verticalAlignment = va as TextStyle['verticalAlignment'];
      const rot = XMLParser.getAttr(textElement, 'rotation') as TextStyle['rotation'];
      if (rot) style.rotation = rot;
      const markup = XMLParser.getAttr(textElement, 'markup') as TextStyle['markup'];
      if (markup) style.markup = markup;
    }

    if (font) {
      const fn = XMLParser.getAttr(font, 'fontName');
      if (fn) style.fontName = fn;
      if (font.attributes['size']) style.fontSize = parseFloat(font.attributes['size']);
      if (font.attributes['isBold'] !== undefined) style.isBold = XMLParser.getAttrBool(font, 'isBold', false);
      if (font.attributes['isItalic'] !== undefined) style.isItalic = XMLParser.getAttrBool(font, 'isItalic', false);
      if (font.attributes['isUnderline'] !== undefined) style.isUnderline = XMLParser.getAttrBool(font, 'isUnderline', false);
    }

    if (reportElement) {
      const forecolor = XMLParser.getAttr(reportElement, 'forecolor');
      if (forecolor) style.forecolor = forecolor;
    }

    return style;
  }

  /**
   * Resolve the effective box for an element, merging inherited style box
   * with the element's own `<box>` child (child wins).
   */
  private resolveBox(el: XMLElement): BoxStyle | undefined {
    const reportElement = XMLParser.getChild(el, 'reportElement');
    const styleName = reportElement ? XMLParser.getAttr(reportElement, 'style') : '';
    const inherited = this.resolveStyle(styleName);
    const ownBoxEl = XMLParser.getChild(el, 'box');
    const own = ownBoxEl ? this.parseBox(ownBoxEl) : undefined;
    if (!inherited?.box && !own) return undefined;
    return { ...(inherited?.box || {}), ...(own || {}) };
  }

  private parseStaticText(el: XMLElement): StaticTextElement {
    const textEl = XMLParser.getChild(el, 'text');
    return {
      type: 'staticText',
      reportElement: this.parseReportElement(el),
      textStyle: this.parseTextStyle(el),
      text: textEl ? XMLParser.getText(textEl) : '',
      box: this.resolveBox(el),
      link: this.parseLink(el),
    };
  }

  private parseTextField(el: XMLElement): TextFieldElement {
    const exprEl = XMLParser.getChild(el, 'textFieldExpression');
    const inherited = this.resolveStyle(XMLParser.getAttr(XMLParser.getChild(el, 'reportElement') ?? el, 'style'));
    return {
      type: 'textField',
      reportElement: this.parseReportElement(el),
      textStyle: this.parseTextStyle(el),
      expression: exprEl ? XMLParser.getText(exprEl) : '',
      expressionClass: exprEl ? XMLParser.getAttr(exprEl, 'class') || undefined : undefined,
      textAdjust: XMLParser.getAttr(el, 'textAdjust') as TextFieldElement['textAdjust'],
      isBlankWhenNull: XMLParser.getAttrBool(el, 'isBlankWhenNull', false),
      pattern: XMLParser.getAttr(el, 'pattern') || inherited?.pattern || undefined,
      box: this.resolveBox(el),
      link: this.parseLink(el),
    };
  }

  private parseImage(el: XMLElement): ImageElement {
    const exprEl = XMLParser.getChild(el, 'imageExpression');
    return {
      type: 'image',
      reportElement: this.parseReportElement(el),
      expression: exprEl ? XMLParser.getText(exprEl) : '',
      scaleImage: XMLParser.getAttr(el, 'scaleImage') as ImageElement['scaleImage'],
      hAlign: XMLParser.getAttr(el, 'hAlign') as ImageElement['hAlign'],
      vAlign: XMLParser.getAttr(el, 'vAlign') as ImageElement['vAlign'],
      link: this.parseLink(el),
    };
  }

  private parseLine(el: XMLElement): LineElement {
    const graphicElement = XMLParser.getChild(el, 'graphicElement');
    const pen = graphicElement ? XMLParser.getChild(graphicElement, 'pen') : null;

    return {
      type: 'line',
      reportElement: this.parseReportElement(el),
      direction: XMLParser.getAttr(el, 'direction') as LineElement['direction'],
      pen: pen ? {
        lineWidth: parseFloat(XMLParser.getAttr(pen, 'lineWidth', '1')),
        lineColor: XMLParser.getAttr(pen, 'lineColor', '#000000'),
        lineStyle: XMLParser.getAttr(pen, 'lineStyle', 'Solid') as 'Solid' | 'Dashed' | 'Dotted',
      } : undefined,
    };
  }

  private parseRectangle(el: XMLElement): RectangleElement {
    const graphicElement = XMLParser.getChild(el, 'graphicElement');
    const pen = graphicElement ? XMLParser.getChild(graphicElement, 'pen') : null;

    return {
      type: 'rectangle',
      reportElement: this.parseReportElement(el),
      radius: XMLParser.getAttrInt(el, 'radius', 0),
      pen: pen ? {
        lineWidth: parseFloat(XMLParser.getAttr(pen, 'lineWidth', '1')),
        lineColor: XMLParser.getAttr(pen, 'lineColor', '#000000'),
      } : undefined,
    };
  }

  private parseEllipse(el: XMLElement): EllipseElement {
    const graphicElement = XMLParser.getChild(el, 'graphicElement');
    const pen = graphicElement ? XMLParser.getChild(graphicElement, 'pen') : null;

    return {
      type: 'ellipse',
      reportElement: this.parseReportElement(el),
      pen: pen ? {
        lineWidth: parseFloat(XMLParser.getAttr(pen, 'lineWidth', '1')),
        lineColor: XMLParser.getAttr(pen, 'lineColor', '#000000'),
      } : undefined,
    };
  }

  /**
   * Recursively parse a `<frame>` and its nested children. Child elements'
   * coordinates are relative to the frame; the renderer applies the offset.
   */
  private parseFrame(el: XMLElement): FrameElement {
    const children: BandElement[] = [];
    for (const child of el.children) {
      if (child.tagName === 'reportElement' || child.tagName === 'box') continue;
      const parsed = this.parseElement(child);
      if (parsed) children.push(parsed);
    }
    return {
      type: 'frame',
      reportElement: this.parseReportElement(el),
      box: this.resolveBox(el),
      children,
    };
  }

  private parseBreak(el: XMLElement): BreakElement {
    return {
      type: 'break',
      reportElement: this.parseReportElement(el),
      breakType: (XMLParser.getAttr(el, 'type', 'Page') as 'Page' | 'Column'),
    };
  }

  private parseSubreport(el: XMLElement): SubreportElement {
    const exprEl = XMLParser.getChild(el, 'subreportExpression');
    const dsEl = XMLParser.getChild(el, 'dataSourceExpression');
    const params: Array<{ name: string; expression: string }> = [];
    for (const p of XMLParser.getChildren(el, 'subreportParameter')) {
      const name = XMLParser.getAttr(p, 'name');
      const pExpr = XMLParser.getChild(p, 'subreportParameterExpression');
      if (name && pExpr) {
        params.push({ name, expression: XMLParser.getText(pExpr) });
      }
    }
    return {
      type: 'subreport',
      reportElement: this.parseReportElement(el),
      expression: exprEl ? XMLParser.getText(exprEl) : '',
      dataSourceExpression: dsEl ? XMLParser.getText(dsEl) : undefined,
      parameters: params,
    };
  }

  /**
   * Parse hyperlink / anchor attributes from an element. Returns undefined
   * when no link-related attributes are present.
   */
  private parseLink(el: XMLElement): ElementLink | undefined {
    const hyperlinkType = XMLParser.getAttr(el, 'hyperlinkType');
    const anchorExpr = XMLParser.getChild(el, 'anchorNameExpression');
    const refExpr = XMLParser.getChild(el, 'hyperlinkReferenceExpression');
    const anchorRefExpr = XMLParser.getChild(el, 'hyperlinkAnchorExpression');
    const pageExpr = XMLParser.getChild(el, 'hyperlinkPageExpression');

    if (!hyperlinkType && !anchorExpr && !refExpr && !anchorRefExpr && !pageExpr) {
      return undefined;
    }

    const link: ElementLink = {};
    if (hyperlinkType) link.hyperlinkType = hyperlinkType as ElementLink['hyperlinkType'];
    if (refExpr) link.hyperlinkReferenceExpression = XMLParser.getText(refExpr);
    if (anchorRefExpr) link.hyperlinkAnchorExpression = XMLParser.getText(anchorRefExpr);
    if (pageExpr) link.hyperlinkPageExpression = XMLParser.getText(pageExpr);
    if (anchorExpr) {
      link.anchorNameExpression = XMLParser.getText(anchorExpr);
      const bookmarkLevel = anchorExpr.attributes['bookmarkLevel'];
      if (bookmarkLevel !== undefined) link.bookmarkLevel = parseInt(bookmarkLevel, 10) || 0;
    }
    return link;
  }
}

/**
 * JRXML Renderer
 * 
 * Renders a parsed JRXML report to PDF using pdf-lib
 */
export class JRXMLRenderer {
  private pdfDoc!: PDFDocument;
  private page!: PDFPage;
  private fonts: Map<string, PDFFont> = new Map();
  private customFamilies: Set<string> = new Set();
  private report!: ParsedReport;
  private options!: JRXMLRenderOptions;
  private evaluator!: ExpressionEvaluator;
  private currentY: number = 0;

  // Multi-page / iteration state.
  private rows: Array<Record<string, unknown>> = [];
  private pageNumber = 1;
  private totalPages = 0; // resolved on pass 2
  private reportCount = 0; // total rows processed
  private isLastPage = false;

  // Variable + group state.
  private variableValues: Map<string, unknown> = new Map();
  private variableCounts: Map<string, number> = new Map(); // for Average
  private groupPrevValues: Map<string, unknown> = new Map();
  private groupRowCounts: Map<string, number> = new Map();

  // Multi-column state.
  private currentColumn = 0;
  private columnCount = 1;
  private columnWidth = 0;
  private columnSpacing = 0;
  private columnTopY = 0;

  // Hyperlink / anchor / bookmark state.
  private anchors: Map<string, { page: PDFPage; x: number; y: number }> = new Map();
  private pendingLocalLinks: Array<{
    page: PDFPage;
    rect: [number, number, number, number];
    anchorName: string;
  }> = [];
  private bookmarks: Array<{
    title: string;
    page: PDFPage;
    x: number;
    y: number;
    level: number;
  }> = [];

  /**
   * Render a parsed report to PDF
   */
  async render(report: ParsedReport, options: JRXMLRenderOptions = {}): Promise<Uint8Array> {
    this.report = report;
    this.options = options;

    // Two-pass if any expression references PAGE_COUNT — we need the final
    // page count resolved before drawing.
    const needsTwoPass = this.templateReferencesPageCount();
    if (needsTwoPass) {
      await this.renderPass(0);
      this.totalPages = this.pageNumber;
    }
    await this.renderPass(this.totalPages);

    this.finalizeLinksAndBookmarks();

    return await this.pdfDoc.save();
  }

  /**
   * Execute a single pass. `knownTotalPages` is 0 on the first (dry) pass.
   */
  private async renderPass(knownTotalPages: number): Promise<void> {
    this.pdfDoc = await PDFDocument.create();
    await this.embedFonts();

    this.rows = this.options.dataSource && this.options.dataSource.length > 0
      ? this.options.dataSource
      : [this.options.fields || {}];

    this.pageNumber = 1;
    this.reportCount = 0;
    this.isLastPage = false;
    this.variableValues.clear();
    this.variableCounts.clear();
    this.groupPrevValues.clear();
    this.groupRowCounts.clear();
    this.anchors.clear();
    this.pendingLocalLinks = [];
    this.bookmarks = [];
    this.currentColumn = 0;
    this.columnCount = Math.max(1, this.report.config.columnCount ?? 1);
    this.columnWidth = this.report.config.columnWidth;
    this.columnSpacing = this.report.config.columnSpacing ?? 0;
    this.resetEvaluator(this.rows[0] ?? {}, knownTotalPages);
    this.initVariables();

    const { pageWidth, pageHeight } = this.report.config;
    this.page = this.pdfDoc.addPage([pageWidth, pageHeight]);
    this.currentY = pageHeight - this.report.config.topMargin;

    // Background is drawn on every page; title only on the first page.
    if (this.report.bands.title) await this.renderBand(this.report.bands.title);
    if (this.report.bands.pageHeader) await this.renderBand(this.report.bands.pageHeader);
    if (this.report.bands.columnHeader) await this.renderBand(this.report.bands.columnHeader);
    this.columnTopY = this.currentY;

    // Detail iteration — one pass per row, with groups + variables.
    for (let i = 0; i < this.rows.length; i++) {
      this.reportCount = i + 1;
      this.resetEvaluator(this.rows[i], knownTotalPages);

      await this.emitGroupBoundaries(i);
      this.updateVariables(i);
      // Re-sync evaluator with refreshed variables.
      this.evaluator.setVariables(Object.fromEntries(this.variableValues));

      for (const detail of this.report.bands.detail) {
        await this.renderBand(detail);
      }
    }

    // After all rows: emit all group footers (innermost first) and summary.
    await this.emitAllGroupFooters();
    if (this.report.bands.summary) await this.renderBand(this.report.bands.summary);

    // Final page: draw the page footer one more time.
    this.isLastPage = true;
    await this.drawPageFooter();
  }

  private templateReferencesPageCount(): boolean {
    const seen = new Set<string>();
    const walk = (band?: Band): void => {
      if (!band) return;
      for (const el of band.elements) {
        if (el.type === 'textField') seen.add(el.expression);
        if (el.type === 'staticText') seen.add(el.text);
      }
    };
    const { bands, groups } = this.report;
    walk(bands.title); walk(bands.pageHeader); walk(bands.columnHeader);
    walk(bands.columnFooter); walk(bands.pageFooter); walk(bands.lastPageFooter);
    walk(bands.summary); walk(bands.background); walk(bands.noData);
    for (const d of bands.detail) walk(d);
    for (const g of groups) { walk(g.header); walk(g.footer); }
    return Array.from(seen).some((s) => s.includes('PAGE_COUNT') || s.includes('PAGE_NUMBER_TOTAL'));
  }

  private resetEvaluator(row: Record<string, unknown>, knownTotalPages: number): void {
    const baseFields = { ...(this.options.fields || {}), ...row };
    const params = { ...(this.options.parameters || {}) };
    this.evaluator = new ExpressionEvaluator(
      baseFields,
      params,
      Object.fromEntries(this.variableValues),
      this.options.debug,
      this.options.resources || {},
    );
    // Inject built-in variables.
    this.variableValues.set('PAGE_NUMBER', this.pageNumber);
    this.variableValues.set('PAGE_COUNT', knownTotalPages);
    this.variableValues.set('REPORT_COUNT', this.reportCount);
    this.evaluator.setVariables(Object.fromEntries(this.variableValues));
  }

  private initVariables(): void {
    for (const v of this.report.variables.values()) {
      const seed = v.initialValueExpression
        ? this.evaluator.evaluate(v.initialValueExpression)
        : (v.calculation === 'Count' || v.calculation === 'Sum' ? 0 : null);
      this.variableValues.set(v.name, seed);
      this.variableCounts.set(v.name, 0);
    }
  }

  private updateVariables(_rowIndex: number): void {
    for (const v of this.report.variables.values()) {
      // Reset handling (simplified): `Report` never resets after init; `Page`
      // resets on page break (handled in startNewPage). Groups handled via
      // emitGroupBoundaries. For 'None' or 'Report' we just accumulate.
      if (!v.expression) continue;
      const value = this.evaluator.evaluate(v.expression);
      this.accumulateVariable(v, value);
    }
  }

  private accumulateVariable(v: ReportVariable, value: unknown): void {
    const calc = v.calculation || 'Nothing';
    const prev = this.variableValues.get(v.name);
    const count = (this.variableCounts.get(v.name) ?? 0) + 1;
    this.variableCounts.set(v.name, count);
    const toNum = (x: unknown): number => {
      if (x === null || x === undefined || x === '') return 0;
      const n = typeof x === 'number' ? x : Number(x);
      return isNaN(n) ? 0 : n;
    };
    switch (calc) {
      case 'Nothing':
        this.variableValues.set(v.name, value);
        break;
      case 'Count':
      case 'DistinctCount':
        this.variableValues.set(v.name, (typeof prev === 'number' ? prev : 0) + 1);
        break;
      case 'Sum':
        this.variableValues.set(v.name, toNum(prev) + toNum(value));
        break;
      case 'Average': {
        const newSum = toNum(prev) * (count - 1) + toNum(value);
        this.variableValues.set(v.name, newSum / count);
        break;
      }
      case 'Lowest':
        this.variableValues.set(v.name, prev === null || prev === undefined || toNum(value) < toNum(prev) ? value : prev);
        break;
      case 'Highest':
        this.variableValues.set(v.name, prev === null || prev === undefined || toNum(value) > toNum(prev) ? value : prev);
        break;
      case 'First':
        if (prev === null || prev === undefined) this.variableValues.set(v.name, value);
        break;
      default:
        this.variableValues.set(v.name, value);
    }
  }

  private resetPageVariables(): void {
    for (const v of this.report.variables.values()) {
      if (v.resetType === 'Page') {
        const seed = v.initialValueExpression ? this.evaluator.evaluate(v.initialValueExpression) : null;
        this.variableValues.set(v.name, seed);
        this.variableCounts.set(v.name, 0);
      }
    }
  }

  private resetGroupVariables(groupName: string): void {
    for (const v of this.report.variables.values()) {
      if (v.resetType === 'Group' && v.resetGroup === groupName) {
        const seed = v.initialValueExpression ? this.evaluator.evaluate(v.initialValueExpression) : null;
        this.variableValues.set(v.name, seed);
        this.variableCounts.set(v.name, 0);
      }
    }
  }

  /**
   * Detect which groups have changed between the previous and current row,
   * emit outgoing group footers (innermost first), then incoming headers
   * (outermost first).
   */
  private async emitGroupBoundaries(_rowIndex: number): Promise<void> {
    const groups = this.report.groups;
    if (groups.length === 0) return;

    // Determine which groups changed (outermost-first wins — if an outer
    // group changes, all inner groups are considered changed too).
    const changed: boolean[] = new Array(groups.length).fill(false);
    for (let i = 0; i < groups.length; i++) {
      const g = groups[i];
      const value = this.evaluator.evaluate(g.expression);
      const prev = this.groupPrevValues.has(g.name)
        ? this.groupPrevValues.get(g.name)
        : Symbol.for('jasperreports.unset');
      if (prev === Symbol.for('jasperreports.unset') || prev !== value) {
        changed[i] = true;
        // Mark all inner groups as changed too.
        for (let j = i + 1; j < groups.length; j++) changed[j] = true;
      }
    }

    // Emit footers for changed groups (innermost-first), but only if this
    // is not the first time we've seen the group (i.e., prev was set).
    for (let i = groups.length - 1; i >= 0; i--) {
      if (!changed[i]) continue;
      const g = groups[i];
      if (this.groupPrevValues.has(g.name) && g.footer) {
        await this.renderBand(g.footer);
      }
    }

    // Emit headers for changed groups (outermost-first) and update state.
    for (let i = 0; i < groups.length; i++) {
      if (!changed[i]) continue;
      const g = groups[i];
      if (g.header) await this.renderBand(g.header);
      this.groupPrevValues.set(g.name, this.evaluator.evaluate(g.expression));
      this.resetGroupVariables(g.name);
    }
  }

  private async emitAllGroupFooters(): Promise<void> {
    const groups = this.report.groups;
    for (let i = groups.length - 1; i >= 0; i--) {
      const g = groups[i];
      if (this.groupPrevValues.has(g.name) && g.footer) {
        await this.renderBand(g.footer);
      }
    }
  }

  /**
   * Ensure `requiredHeight` fits in the current column; otherwise advance
   * to the next column, or start a new page when columns are exhausted.
   */
  private async ensureSpace(requiredHeight: number): Promise<void> {
    const footerHeight = this.report.bands.pageFooter?.height ?? 0;
    const floor = this.report.config.bottomMargin + footerHeight;
    if (this.currentY - requiredHeight >= floor) return;
    if (this.currentColumn + 1 < this.columnCount) {
      // Advance to next column on the same page.
      this.currentColumn++;
      this.currentY = this.columnTopY;
      return;
    }
    await this.startNewPage();
  }

  private async startNewPage(): Promise<void> {
    // Draw page footer at bottom of the current page first.
    await this.drawPageFooter();

    // Open a new page.
    this.pageNumber++;
    this.currentColumn = 0;
    this.resetPageVariables();
    const { pageWidth, pageHeight } = this.report.config;
    this.page = this.pdfDoc.addPage([pageWidth, pageHeight]);
    this.currentY = pageHeight - this.report.config.topMargin;
    // Sync built-in PAGE_NUMBER into the evaluator.
    this.variableValues.set('PAGE_NUMBER', this.pageNumber);
    this.evaluator.setVariables(Object.fromEntries(this.variableValues));

    if (this.report.bands.pageHeader) await this.renderBandAtY(this.report.bands.pageHeader, this.currentY), this.currentY -= this.report.bands.pageHeader.height;
    if (this.report.bands.columnHeader) await this.renderBandAtY(this.report.bands.columnHeader, this.currentY), this.currentY -= this.report.bands.columnHeader.height;

    // Reprint group headers marked for reprint on each page.
    for (const g of this.report.groups) {
      if (g.isReprintHeaderOnEachPage && g.header && this.groupPrevValues.has(g.name)) {
        await this.renderBandAtY(g.header, this.currentY);
        this.currentY -= g.header.height;
      }
    }
    this.columnTopY = this.currentY;
  }

  private async drawPageFooter(): Promise<void> {
    const footerBand = this.isLastPage && this.report.bands.lastPageFooter
      ? this.report.bands.lastPageFooter
      : this.report.bands.pageFooter;
    if (!footerBand) return;
    const y = this.report.config.bottomMargin + footerBand.height;
    await this.renderBandAtY(footerBand, y);
  }

  private async embedFonts(): Promise<void> {
    const fontMap: Array<[string, typeof StandardFonts[keyof typeof StandardFonts]]> = [
      ['Helvetica', StandardFonts.Helvetica],
      ['Helvetica-Bold', StandardFonts.HelveticaBold],
      ['Helvetica-Oblique', StandardFonts.HelveticaOblique],
      ['Helvetica-BoldOblique', StandardFonts.HelveticaBoldOblique],
      ['Times-Roman', StandardFonts.TimesRoman],
      ['Times-Bold', StandardFonts.TimesRomanBold],
      ['Times-Italic', StandardFonts.TimesRomanItalic],
      ['Times-BoldItalic', StandardFonts.TimesRomanBoldItalic],
      ['Courier', StandardFonts.Courier],
      ['Courier-Bold', StandardFonts.CourierBold],
      ['Courier-Oblique', StandardFonts.CourierOblique],
      ['Courier-BoldOblique', StandardFonts.CourierBoldOblique],
    ];

    this.fonts = new Map();
    this.customFamilies = new Set();
    for (const [name, font] of fontMap) {
      this.fonts.set(name, await this.pdfDoc.embedFont(font));
    }

    // Custom fonts (requires user to pass a fontkit instance).
    const custom = this.options.fonts;
    if (custom && custom.fontkit && custom.families) {
      (this.pdfDoc as any).registerFontkit(custom.fontkit);
      for (const [family, variants] of Object.entries(custom.families)) {
        this.customFamilies.add(family.toLowerCase());
        const embed = async (suffix: string, bytes: Uint8Array | ArrayBuffer | undefined) => {
          if (!bytes) return;
          const f = await this.pdfDoc.embedFont(bytes);
          this.fonts.set(`${family}${suffix}`, f);
        };
        await embed('', variants.normal);
        await embed('-Bold', variants.bold);
        await embed('-Italic', variants.italic);
        await embed('-BoldItalic', variants.boldItalic);
      }
    }
  }



  private getFont(style: TextStyle): PDFFont {
    const fontName = style.fontName;
    const lower = fontName.toLowerCase();

    // Custom family match wins over standard font matching.
    if (this.customFamilies.has(lower)) {
      const variant = style.isBold && style.isItalic ? '-BoldItalic'
        : style.isBold ? '-Bold'
        : style.isItalic ? '-Italic'
        : '';
      const key = `${fontName}${variant}`;
      return this.fonts.get(key) ?? this.fonts.get(fontName) ?? this.fonts.get('Helvetica')!;
    }

    let fontKey = 'Helvetica';

    if (lower.includes('times')) {
      fontKey = 'Times-Roman';
      if (style.isBold && style.isItalic) fontKey = 'Times-BoldItalic';
      else if (style.isBold) fontKey = 'Times-Bold';
      else if (style.isItalic) fontKey = 'Times-Italic';
    } else if (lower.includes('courier') || lower.includes('mono')) {
      fontKey = 'Courier';
      if (style.isBold && style.isItalic) fontKey = 'Courier-BoldOblique';
      else if (style.isBold) fontKey = 'Courier-Bold';
      else if (style.isItalic) fontKey = 'Courier-Oblique';
    } else {
      if (style.isBold && style.isItalic) fontKey = 'Helvetica-BoldOblique';
      else if (style.isBold) fontKey = 'Helvetica-Bold';
      else if (style.isItalic) fontKey = 'Helvetica-Oblique';
    }

    return this.fonts.get(fontKey) || this.fonts.get('Helvetica')!;
  }

  private parseColor(color: string): ReturnType<typeof rgb> {
    if (!color) return rgb(0, 0, 0);
    let hex = color.replace('#', '');
    // Expand 3-digit shorthand (#RGB → #RRGGBB).
    if (hex.length === 3) {
      hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
    }
    if (hex.length === 6) {
      const r = parseInt(hex.substring(0, 2), 16) / 255;
      const g = parseInt(hex.substring(2, 4), 16) / 255;
      const b = parseInt(hex.substring(4, 6), 16) / 255;
      if (!isNaN(r) && !isNaN(g) && !isNaN(b)) return rgb(r, g, b);
    }
    return rgb(0, 0, 0);
  }

  private async renderBand(band: Band): Promise<void> {
    const effectiveHeight = this.measureBandHeight(band);
    // Don't paginate on bands whose splitType is 'Prevent' — but only detail
    // bands are eligible anyway; the rest (headers/footers) we always draw.
    if (band.splitType !== 'Prevent' || band.height <= effectiveHeight) {
      await this.ensureSpace(effectiveHeight);
    }
    await this.renderBandAtY(band, this.currentY);
    this.currentY -= effectiveHeight;
  }

  /**
   * Compute the rendered height of a band accounting for `textAdjust="StretchHeight"`
   * on text fields (which grows the element box to fit wrapped lines).
   */
  private measureBandHeight(band: Band): number {
    let maxBottomOffset = band.height;
    for (const el of band.elements) {
      if (el.type !== 'textField' && el.type !== 'staticText') continue;
      const stretchable = el.type === 'textField' && el.textAdjust === 'StretchHeight';
      if (!stretchable) continue;

      const re = el.reportElement;
      const style = el.textStyle;
      const font = this.getFont(style);
      const padLeft = el.box?.leftPadding ?? 0;
      const padRight = el.box?.rightPadding ?? 0;
      const padTop = el.box?.topPadding ?? 0;
      const padBottom = el.box?.bottomPadding ?? 0;
      const contentWidth = re.width - padLeft - padRight;
      // `stretchable` is only true for textField — no staticText branch needed.
      const tf = el as TextFieldElement;
      const raw = this.evaluator.evaluate(tf.expression);
      const text = tf.pattern
        ? formatPattern(raw, tf.pattern)
        : (raw as unknown)?.toString?.() ?? '';
      const lines = this.wrapText(text, font, style.fontSize, contentWidth);
      const needed = lines.length * style.fontSize * 1.2 + padTop + padBottom;
      const bottom = re.y + Math.max(re.height, needed);
      if (bottom > maxBottomOffset) maxBottomOffset = bottom;
    }
    return maxBottomOffset;
  }

  private async renderBandAtY(band: Band, bandTopY: number, xOffset?: number): Promise<void> {
    const effectiveXOffset = xOffset ?? (this.currentColumn * (this.columnWidth + this.columnSpacing));
    for (const element of band.elements) {
      await this.renderElement(element, bandTopY, effectiveXOffset);
    }
  }

  private async renderElement(element: BandElement, bandTopY: number, xOffset: number = 0): Promise<void> {
    // Gate rendering on `printWhenExpression` if provided.
    const pwe = element.reportElement.printWhenExpression;
    if (pwe) {
      const result = this.evaluator.evaluate(pwe);
      if (!isTruthyPrintWhen(result)) return;
    }

    switch (element.type) {
      case 'staticText':
        await this.renderStaticText(element, bandTopY, xOffset);
        break;
      case 'textField':
        await this.renderTextField(element, bandTopY, xOffset);
        break;
      case 'image':
        await this.renderImage(element, bandTopY, xOffset);
        break;
      case 'line':
        await this.renderLine(element, bandTopY, xOffset);
        break;
      case 'rectangle':
        await this.renderRectangle(element, bandTopY, xOffset);
        break;
      case 'ellipse':
        await this.renderEllipse(element, bandTopY, xOffset);
        break;
      case 'frame':
        await this.renderFrame(element, bandTopY, xOffset);
        break;
      case 'break':
        await this.renderBreak(element);
        break;
      case 'subreport':
        await this.renderSubreport(element, bandTopY, xOffset);
        break;
    }
  }

  private async renderStaticText(element: StaticTextElement, bandTopY: number, xOffset: number = 0): Promise<void> {
    this.drawBox(element.reportElement, element.box, bandTopY, xOffset);
    await this.drawText(element.text, element.reportElement, element.textStyle, bandTopY, element.box, xOffset);
    this.applyLink(element.link, element.reportElement, bandTopY, xOffset, element.text);
  }

  private async renderTextField(element: TextFieldElement, bandTopY: number, xOffset: number = 0): Promise<void> {
    const raw = this.evaluator.evaluate(element.expression);

    if ((raw === null || raw === undefined || raw === '') && element.isBlankWhenNull) {
      return;
    }

    const text = element.pattern
      ? formatPattern(raw, element.pattern)
      : raw?.toString() ?? '';

    // Grow the element box vertically when textAdjust="StretchHeight".
    let reportElement = element.reportElement;
    if (element.textAdjust === 'StretchHeight' && text) {
      const font = this.getFont(element.textStyle);
      const padLeft = element.box?.leftPadding ?? 0;
      const padRight = element.box?.rightPadding ?? 0;
      const padTop = element.box?.topPadding ?? 0;
      const padBottom = element.box?.bottomPadding ?? 0;
      const contentWidth = reportElement.width - padLeft - padRight;
      const lines = this.wrapText(text, font, element.textStyle.fontSize, contentWidth);
      const needed = lines.length * element.textStyle.fontSize * 1.2 + padTop + padBottom;
      if (needed > reportElement.height) {
        reportElement = { ...reportElement, height: needed };
      }
    }

    this.drawBox(reportElement, element.box, bandTopY, xOffset);
    await this.drawText(text, reportElement, element.textStyle, bandTopY, element.box, xOffset);
    this.applyLink(element.link, reportElement, bandTopY, xOffset, text);
  }

  private async drawText(
    text: string,
    reportElement: ReportElement,
    textStyle: TextStyle,
    bandTopY: number,
    box?: BoxStyle,
    xOffset: number = 0,
  ): Promise<void> {
    if (!text) return;

    const font = this.getFont(textStyle);
    const fontSize = textStyle.fontSize;
    const color = this.parseColor(textStyle.forecolor);

    // Apply box padding to the content area.
    const padLeft = box?.leftPadding ?? 0;
    const padRight = box?.rightPadding ?? 0;
    const padTop = box?.topPadding ?? 0;
    const padBottom = box?.bottomPadding ?? 0;

    const x = this.report.config.leftMargin + reportElement.x + xOffset + padLeft;
    const elementTopY = bandTopY - reportElement.y - padTop;
    const elementBottomY = elementTopY - (reportElement.height - padTop - padBottom);
    const contentWidth = reportElement.width - padLeft - padRight;
    const contentHeight = reportElement.height - padTop - padBottom;

    // Rotated text draws a single line along the rotated axis; layout and
    // wrapping differ fundamentally from the unrotated path.
    if (textStyle.rotation && textStyle.rotation !== 'None') {
      this.drawRotatedText(text, x, elementTopY, contentWidth, contentHeight, font, fontSize, color, textStyle);
      return;
    }

    // Parse styled markup into runs if enabled; otherwise a single plain run.
    const runs = textStyle.markup === 'styled'
      ? parseStyledMarkup(text)
      : [{ text, bold: textStyle.isBold, italic: textStyle.isItalic, underline: textStyle.isUnderline, color: textStyle.forecolor }];

    // Wrap the rendered text by measuring with the base font; styled runs
    // inherit width-measurement from the base font for simplicity.
    const plain = runs.map((r) => r.text).join('');
    const lines = this.wrapText(plain, font, fontSize, contentWidth);
    const lineHeight = fontSize * 1.2;
    const totalTextHeight = lines.length * lineHeight;

    let textY: number;
    switch (textStyle.verticalAlignment) {
      case 'Bottom':
        textY = elementBottomY + (lines.length - 1) * lineHeight + fontSize * 0.2;
        break;
      case 'Middle':
        textY = elementTopY - (contentHeight - totalTextHeight) / 2 - fontSize;
        break;
      case 'Top':
      default:
        textY = elementTopY - fontSize;
        break;
    }

    // If markup is styled, draw line-by-line splitting runs across lines.
    if (textStyle.markup === 'styled' && runs.length > 1) {
      this.drawStyledLines(runs, x, textY, lineHeight, contentWidth, fontSize, textStyle);
      return;
    }

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineY = textY - i * lineHeight;
      const lineWidth = font.widthOfTextAtSize(line, fontSize);

      let textX = x;
      switch (textStyle.textAlignment) {
        case 'Center':
          textX = x + (contentWidth - lineWidth) / 2;
          break;
        case 'Right':
          textX = x + contentWidth - lineWidth;
          break;
      }

      this.page.drawText(line, { x: textX, y: lineY, size: fontSize, font, color });

      if (textStyle.isUnderline && line) {
        // Simple underline — one font unit below the baseline, proportional thickness.
        const underlineY = lineY - fontSize * 0.12;
        const underlineThickness = Math.max(0.5, fontSize * 0.06);
        this.page.drawLine({
          start: { x: textX, y: underlineY },
          end: { x: textX + lineWidth, y: underlineY },
          thickness: underlineThickness,
          color,
        });
      }
    }
  }

  /**
   * Draw a rotated single-line text within the element box. Rotation follows
   * JRXML conventions: Left = 90° CCW, Right = 90° CW, UpsideDown = 180°.
   */
  private drawRotatedText(
    text: string,
    boxX: number,
    boxTopY: number,
    boxW: number,
    boxH: number,
    font: PDFFont,
    fontSize: number,
    color: ReturnType<typeof rgb>,
    textStyle: TextStyle,
  ): void {
    const rotation = textStyle.rotation!;
    const textWidth = font.widthOfTextAtSize(text, fontSize);

    // Anchor point at the element box center; the rotation translates
    // (0, 0) to the anchor, then rotates the text.
    const cx = boxX + boxW / 2;
    const cy = boxTopY - boxH / 2;

    let x = cx;
    let y = cy;
    let deg = 0;

    if (rotation === 'Left') { deg = 90; x = cx - fontSize / 2; y = cy - textWidth / 2; }
    else if (rotation === 'Right') { deg = -90; x = cx + fontSize / 2; y = cy + textWidth / 2; }
    else if (rotation === 'UpsideDown') { deg = 180; x = cx + textWidth / 2; y = cy + fontSize / 2; }

    this.page.drawText(text, { x, y, size: fontSize, font, color, rotate: degrees(deg) });
  }

  private drawStyledLines(
    runs: StyledRun[],
    x: number,
    firstLineY: number,
    lineHeight: number,
    maxWidth: number,
    fontSize: number,
    base: TextStyle,
  ): void {
    let cursorX = x;
    let cursorY = firstLineY;
    for (const run of runs) {
      const font = this.getFont({ ...base, isBold: run.bold ?? base.isBold, isItalic: run.italic ?? base.isItalic });
      const color = this.parseColor(run.color ?? base.forecolor);
      const words = run.text.split(/(\s+)/);
      for (const word of words) {
        const w = font.widthOfTextAtSize(word, fontSize);
        if (cursorX - x + w > maxWidth && word.trim()) {
          cursorY -= lineHeight;
          cursorX = x;
        }
        this.page.drawText(word, { x: cursorX, y: cursorY, size: fontSize, font, color });
        if (run.underline) {
          this.page.drawLine({
            start: { x: cursorX, y: cursorY - fontSize * 0.12 },
            end: { x: cursorX + w, y: cursorY - fontSize * 0.12 },
            thickness: Math.max(0.5, fontSize * 0.06),
            color,
          });
        }
        cursorX += w;
      }
    }
  }

  /**
   * Draw the four box borders (if defined). Backcolor fill is handled by
   * the existing report-element rendering path; this only draws the pens.
   */
  private drawBox(re: ReportElement, box: BoxStyle | undefined, bandTopY: number, xOffset: number = 0): void {
    if (!box) return;

    const x = this.report.config.leftMargin + re.x + xOffset;
    const y = bandTopY - re.y - re.height;
    const w = re.width;
    const h = re.height;

    // Opaque backcolor fill (if declared on the reportElement).
    if (re.mode === 'Opaque' && re.backcolor) {
      this.page.drawRectangle({ x, y, width: w, height: h, color: this.parseColor(re.backcolor) });
    }

    const stroke = (pen: BoxPen | undefined, start: { x: number; y: number }, end: { x: number; y: number }) => {
      if (!pen || pen.lineWidth <= 0) return;
      this.page.drawLine({
        start, end,
        thickness: pen.lineWidth,
        color: this.parseColor(pen.lineColor),
        dashArray: this.dashArrayForLineStyle(pen.lineStyle, pen.lineWidth),
      });
    };

    stroke(box.topPen, { x, y: y + h }, { x: x + w, y: y + h });
    stroke(box.bottomPen, { x, y }, { x: x + w, y });
    stroke(box.leftPen, { x, y }, { x, y: y + h });
    stroke(box.rightPen, { x: x + w, y }, { x: x + w, y: y + h });
  }

  private wrapText(text: string, font: PDFFont, fontSize: number, maxWidth: number): string[] {
    const words = text.split(' ');
    const lines: string[] = [];
    let currentLine = '';

    for (const word of words) {
      const testLine = currentLine ? `${currentLine} ${word}` : word;
      const testWidth = font.widthOfTextAtSize(testLine, fontSize);

      if (testWidth > maxWidth && currentLine) {
        lines.push(currentLine);
        currentLine = word;
      } else {
        currentLine = testLine;
      }
    }

    if (currentLine) lines.push(currentLine);
    return lines.length > 0 ? lines : [''];
  }

  private async renderImage(element: ImageElement, bandTopY: number, xOffset: number = 0): Promise<void> {
    const resolved = this.evaluator.evaluate(element.expression);
    if (resolved === null || resolved === undefined || resolved === '') return;
    const imagePath = String(resolved);

    let imageBytes: Uint8Array | null = null;

    if (this.options.imageResolver) {
      imageBytes = await this.options.imageResolver(imagePath);
    }

    if (!imageBytes) return;

    let image: PDFImage;
    try {
      image = await this.pdfDoc.embedPng(imageBytes);
    } catch {
      try {
        image = await this.pdfDoc.embedJpg(imageBytes);
      } catch {
        return;
      }
    }

    const boxX = this.report.config.leftMargin + element.reportElement.x + xOffset;
    const boxY = bandTopY - element.reportElement.y - element.reportElement.height;
    const boxW = element.reportElement.width;
    const boxH = element.reportElement.height;

    const { width: iw, height: ih } = image;
    const scaleMode = element.scaleImage ?? 'FillFrame';

    let drawW = boxW;
    let drawH = boxH;

    if (scaleMode === 'RetainShape') {
      // Preserve aspect ratio, fit inside the box.
      const ratio = Math.min(boxW / iw, boxH / ih);
      drawW = iw * ratio;
      drawH = ih * ratio;
    } else if (scaleMode === 'Clip') {
      // Render at intrinsic size, cropped to the box (pdf-lib has no clipping
      // primitive, so we cap at the box dimensions).
      drawW = Math.min(iw, boxW);
      drawH = Math.min(ih, boxH);
    }
    // 'FillFrame' (default) uses the full box.

    // Horizontal / vertical alignment within the box.
    const hAlign = element.hAlign ?? 'Left';
    const vAlign = element.vAlign ?? 'Top';
    let x = boxX;
    if (hAlign === 'Center') x = boxX + (boxW - drawW) / 2;
    else if (hAlign === 'Right') x = boxX + (boxW - drawW);

    let y = boxY + (boxH - drawH); // default Top (PDF origin is bottom-left)
    if (vAlign === 'Middle') y = boxY + (boxH - drawH) / 2;
    else if (vAlign === 'Bottom') y = boxY;

    this.page.drawImage(image, { x, y, width: drawW, height: drawH });
    this.applyLink(element.link, element.reportElement, bandTopY, xOffset);
  }

  private async renderLine(element: LineElement, bandTopY: number, xOffset: number = 0): Promise<void> {
    const { reportElement, pen, direction } = element;

    const x1 = this.report.config.leftMargin + reportElement.x + xOffset;
    const y1 = bandTopY - reportElement.y;
    const x2 = x1 + reportElement.width;
    const y2 = y1 - reportElement.height;

    const color = pen ? this.parseColor(pen.lineColor) : rgb(0, 0, 0);
    const thickness = pen?.lineWidth || 1;
    const dashArray = this.dashArrayForLineStyle(pen?.lineStyle, thickness);

    const start = direction === 'BottomUp' ? { x: x1, y: y2 } : { x: x1, y: y1 };
    const end = direction === 'BottomUp' ? { x: x2, y: y1 } : { x: x2, y: y2 };

    this.page.drawLine({ start, end, thickness, color, dashArray });
  }

  private dashArrayForLineStyle(
    style: 'Solid' | 'Dashed' | 'Dotted' | undefined,
    thickness: number,
  ): number[] | undefined {
    switch (style) {
      case 'Dashed':
        return [Math.max(3, thickness * 3), Math.max(2, thickness * 2)];
      case 'Dotted':
        return [Math.max(1, thickness), Math.max(1, thickness * 2)];
      case 'Solid':
      default:
        return undefined;
    }
  }

  private async renderRectangle(element: RectangleElement, bandTopY: number, xOffset: number = 0): Promise<void> {
    const { reportElement, pen } = element;

    const x = this.report.config.leftMargin + reportElement.x + xOffset;
    const y = bandTopY - reportElement.y - reportElement.height;
    const width = reportElement.width;
    const height = reportElement.height;

    const borderColor = pen ? this.parseColor(pen.lineColor) : rgb(0, 0, 0);
    const borderWidth = pen?.lineWidth || 1;

    if (reportElement.mode === 'Opaque' && reportElement.backcolor) {
      this.page.drawRectangle({ x, y, width, height, color: this.parseColor(reportElement.backcolor) });
    }

    this.page.drawRectangle({ x, y, width, height, borderColor, borderWidth });
  }

  private async renderEllipse(element: EllipseElement, bandTopY: number, xOffset: number = 0): Promise<void> {
    const { reportElement, pen } = element;

    const centerX = this.report.config.leftMargin + reportElement.x + xOffset + reportElement.width / 2;
    const centerY = bandTopY - reportElement.y - reportElement.height / 2;

    const borderColor = pen ? this.parseColor(pen.lineColor) : rgb(0, 0, 0);
    const borderWidth = pen?.lineWidth || 1;

    if (reportElement.mode === 'Opaque' && reportElement.backcolor) {
      this.page.drawEllipse({
        x: centerX,
        y: centerY,
        xScale: reportElement.width / 2,
        yScale: reportElement.height / 2,
        color: this.parseColor(reportElement.backcolor),
      });
    }

    this.page.drawEllipse({
      x: centerX,
      y: centerY,
      xScale: reportElement.width / 2,
      yScale: reportElement.height / 2,
      borderColor,
      borderWidth,
    });
  }

  // ==========================================================
  // Tier 4: Frame, Break, Subreport, Hyperlinks, Bookmarks
  // ==========================================================

  /**
   * Render a `<frame>` and its children. Frame coordinates are in band
   * space; children are positioned relative to the frame's top-left corner.
   */
  private async renderFrame(element: FrameElement, bandTopY: number, xOffset: number = 0): Promise<void> {
    const re = element.reportElement;

    // Draw frame background + borders.
    if (re.mode === 'Opaque' && re.backcolor) {
      const x = this.report.config.leftMargin + re.x + xOffset;
      const y = bandTopY - re.y - re.height;
      this.page.drawRectangle({
        x, y, width: re.width, height: re.height,
        color: this.parseColor(re.backcolor),
      });
    }
    this.drawBox(re, element.box, bandTopY, xOffset);

    // Children render with an adjusted band-top and x-offset so their
    // own (x, y) coordinates stay relative to the frame.
    const childBandTopY = bandTopY - re.y;
    const childXOffset = xOffset + re.x;
    for (const child of element.children) {
      await this.renderElement(child, childBandTopY, childXOffset);
    }
  }

  /**
   * A `<break>` element forces a page or column break. Column breaks fall
   * back to a page break when no columns remain.
   */
  private async renderBreak(element: BreakElement): Promise<void> {
    if (element.breakType === 'Column' && this.currentColumn + 1 < this.columnCount) {
      this.currentColumn++;
      this.currentY = this.columnTopY;
      return;
    }
    await this.startNewPage();
  }

  /**
   * Render a subreport by invoking the user-supplied `subreportResolver`,
   * rendering the nested report into a standalone PDF, and embedding its
   * first page at the subreport's rectangle.
   */
  private async renderSubreport(element: SubreportElement, bandTopY: number, xOffset: number = 0): Promise<void> {
    const resolver = this.options.subreportResolver;
    if (!resolver) return;

    // Evaluate subreport parameter expressions.
    const params: Record<string, unknown> = {};
    for (const p of element.parameters) {
      params[p.name] = this.evaluator.evaluate(p.expression);
    }

    const resolved = await resolver(element.expression, {
      parameters: params,
      fields: this.evaluator.getFieldsSnapshot?.() ?? {},
    });
    if (!resolved) return;

    const nested = new JRXMLRenderer();
    const subBytes = await nested.render(resolved.report, {
      ...this.options,
      parameters: { ...(this.options.parameters || {}), ...params },
      dataSource: resolved.dataSource,
      fields: resolved.fields ?? this.options.fields,
      // Avoid infinite recursion by keeping the same resolver available.
      subreportResolver: this.options.subreportResolver,
    });

    let embedded: PDFEmbeddedPage[];
    try {
      embedded = await this.pdfDoc.embedPdf(subBytes);
    } catch {
      return;
    }
    if (embedded.length === 0) return;

    const re = element.reportElement;
    const x = this.report.config.leftMargin + re.x + xOffset;
    const y = bandTopY - re.y - re.height;
    this.page.drawPage(embedded[0], { x, y, width: re.width, height: re.height });
  }

  /**
   * Attach a hyperlink / anchor / bookmark to the given rectangle.
   */
  private applyLink(
    link: ElementLink | undefined,
    re: ReportElement,
    bandTopY: number,
    xOffset: number,
    textForBookmark?: string,
  ): void {
    if (!link) return;

    const x1 = this.report.config.leftMargin + re.x + xOffset;
    const y2 = bandTopY - re.y;
    const x2 = x1 + re.width;
    const y1 = y2 - re.height;
    const rect: [number, number, number, number] = [x1, y1, x2, y2];

    // Anchor / bookmark.
    if (link.anchorNameExpression) {
      const name = String(this.evaluator.evaluate(link.anchorNameExpression) ?? '');
      if (name) {
        this.anchors.set(name, { page: this.page, x: x1, y: y2 });
        if (link.bookmarkLevel !== undefined && link.bookmarkLevel > 0) {
          this.bookmarks.push({
            title: textForBookmark || name,
            page: this.page,
            x: x1,
            y: y2,
            level: link.bookmarkLevel,
          });
        }
      }
    }

    // Hyperlink.
    const type = link.hyperlinkType;
    if (type === 'Reference' && link.hyperlinkReferenceExpression) {
      const url = String(this.evaluator.evaluate(link.hyperlinkReferenceExpression) ?? '');
      if (url) this.addUrlAnnotation(this.page, rect, url);
    } else if (type === 'LocalAnchor' && link.hyperlinkAnchorExpression) {
      const anchor = String(this.evaluator.evaluate(link.hyperlinkAnchorExpression) ?? '');
      if (anchor) this.pendingLocalLinks.push({ page: this.page, rect, anchorName: anchor });
    }
  }

  private addUrlAnnotation(page: PDFPage, rect: [number, number, number, number], url: string): void {
    const ctx = this.pdfDoc.context;
    const annot = ctx.obj({
      Type: 'Annot',
      Subtype: 'Link',
      Rect: rect,
      Border: [0, 0, 0],
      A: { Type: 'Action', S: 'URI', URI: PDFString.of(url) },
    });
    this.appendAnnotation(page, annot);
  }

  private addGoToAnnotation(
    page: PDFPage,
    rect: [number, number, number, number],
    targetPage: PDFPage,
    targetX: number,
    targetY: number,
  ): void {
    const ctx = this.pdfDoc.context;
    const dest = ctx.obj([
      targetPage.ref,
      PDFName.of('XYZ'),
      PDFNumber.of(targetX),
      PDFNumber.of(targetY),
      PDFNumber.of(0),
    ]);
    const annot = ctx.obj({
      Type: 'Annot',
      Subtype: 'Link',
      Rect: rect,
      Border: [0, 0, 0],
      Dest: dest,
    });
    this.appendAnnotation(page, annot);
  }

  private appendAnnotation(page: PDFPage, annot: PDFDict | PDFRef): void {
    const pageNode = page.node;
    const existing = pageNode.lookup(PDFName.of('Annots'));
    if (existing instanceof PDFArray) {
      existing.push(annot);
    } else {
      pageNode.set(PDFName.of('Annots'), this.pdfDoc.context.obj([annot]));
    }
  }

  /**
   * Resolve any pending LocalAnchor links and emit bookmarks as a flat
   * outline tree. Called after the final render pass, before save.
   */
  private finalizeLinksAndBookmarks(): void {
    // Local-anchor GoTo links.
    for (const pending of this.pendingLocalLinks) {
      const target = this.anchors.get(pending.anchorName);
      if (!target) continue;
      this.addGoToAnnotation(pending.page, pending.rect, target.page, target.x, target.y);
    }

    // Outline / bookmarks.
    if (this.bookmarks.length === 0) return;
    const ctx = this.pdfDoc.context;

    const outlineRoot = ctx.obj({ Type: 'Outlines' });
    const outlineRootRef = ctx.register(outlineRoot);

    const itemRefs: PDFRef[] = [];
    for (const bm of this.bookmarks) {
      const dest = ctx.obj([
        bm.page.ref,
        PDFName.of('XYZ'),
        PDFNumber.of(bm.x),
        PDFNumber.of(bm.y),
        PDFNumber.of(0),
      ]);
      const item = ctx.obj({
        Title: PDFHexString.fromText(bm.title),
        Parent: outlineRootRef,
        Dest: dest,
      });
      itemRefs.push(ctx.register(item));
    }

    // Link siblings via Next / Prev.
    for (let i = 0; i < itemRefs.length; i++) {
      const itemDict = ctx.lookup(itemRefs[i], PDFDict);
      if (i > 0) itemDict.set(PDFName.of('Prev'), itemRefs[i - 1]);
      if (i < itemRefs.length - 1) itemDict.set(PDFName.of('Next'), itemRefs[i + 1]);
    }

    outlineRoot.set(PDFName.of('First'), itemRefs[0]);
    outlineRoot.set(PDFName.of('Last'), itemRefs[itemRefs.length - 1]);
    outlineRoot.set(PDFName.of('Count'), PDFNumber.of(itemRefs.length));

    this.pdfDoc.catalog.set(PDFName.of('Outlines'), outlineRootRef);
  }
}

// ============================================================
// PUBLIC API
// ============================================================

/**
 * A span of text with optional style overrides, produced by `parseStyledMarkup`.
 */
interface StyledRun {
  text: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  color?: string;
}

/**
 * Parse a tiny subset of Jasper styled markup into style runs.
 *
 * Supported tags: `<b>`, `<i>`, `<u>`, `<color rgb="#RRGGBB">`. Unknown tags
 * are stripped. This is intentionally minimal — full styled markup requires
 * a proper parser and is out of scope for this release.
 */
function parseStyledMarkup(source: string): StyledRun[] {
  const runs: StyledRun[] = [];
  const stack: StyledRun[] = [{ text: '' }];
  const re = /<(\/?)(b|i|u|color)(\s+rgb="(#[0-9a-fA-F]{3,6})")?\s*>/g;
  let lastIndex = 0;
  let m: RegExpExecArray | null;

  const push = (text: string) => {
    if (!text) return;
    const top = stack[stack.length - 1];
    runs.push({ ...top, text });
  };

  while ((m = re.exec(source)) !== null) {
    push(source.substring(lastIndex, m.index));
    const closing = m[1] === '/';
    const tag = m[2].toLowerCase();
    const rgb = m[4];

    if (closing) {
      if (stack.length > 1) stack.pop();
    } else {
      const current = { ...stack[stack.length - 1] };
      if (tag === 'b') current.bold = true;
      else if (tag === 'i') current.italic = true;
      else if (tag === 'u') current.underline = true;
      else if (tag === 'color' && rgb) current.color = rgb;
      stack.push(current);
    }
    lastIndex = m.index + m[0].length;
  }
  push(source.substring(lastIndex));
  return runs;
}

/**
 * Render a JRXML template to PDF
 * 
 * @param jrxmlContent - The JRXML template content as string
 * @param options - Render options including field values and parameters
 * @returns PDF as Uint8Array
 * 
 * @example
 * ```typescript
 * import { renderJRXML } from 'jrxml-lite';
 * 
 * const pdfBytes = await renderJRXML(jrxmlContent, {
 *   fields: {
 *     name: 'Max Mustermann',
 *     date: '2025-01-15',
 *   },
 *   imageResolver: async (path) => {
 *     const res = await fetch(path);
 *     return new Uint8Array(await res.arrayBuffer());
 *   },
 * });
 * ```
 */
export async function renderJRXML(
  jrxmlContent: string,
  options: JRXMLRenderOptions = {}
): Promise<Uint8Array> {
  const parser = new JRXMLParser(jrxmlContent, options.debug);
  const report = parser.parse();
  const renderer = new JRXMLRenderer();
  return renderer.render(report, options);
}

/**
 * Parse JRXML without rendering (for inspection/debugging)
 * 
 * @param jrxmlContent - The JRXML template content as string
 * @param debug - Enable debug logging
 * @returns Parsed report structure
 * 
 * @example
 * ```typescript
 * import { parseJRXML } from 'jrxml-lite';
 * 
 * const report = parseJRXML(jrxmlContent);
 * console.log('Fields:', Array.from(report.fields.keys()));
 * ```
 */
export function parseJRXML(jrxmlContent: string, debug: boolean = false): ParsedReport {
  const parser = new JRXMLParser(jrxmlContent, debug);
  return parser.parse();
}
