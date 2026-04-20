/**
 * JRXML Parser and Renderer
 */

import { PDFDocument, StandardFonts, rgb, PDFFont, PDFPage, PDFImage, degrees } from 'pdf-lib';
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
    const bands = this.parseBands(root);

    this.log('Parse complete');

    return { config, fields, parameters, variables, styles: this.styles, bands };
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

  private parseVariables(root: XMLElement): Map<string, { class: string; calculation?: string; expression?: string }> {
    const vars = new Map();
    for (const v of XMLParser.getChildren(root, 'variable')) {
      const name = XMLParser.getAttr(v, 'name');
      const cls = XMLParser.getAttr(v, 'class', 'java.lang.String');
      const calculation = XMLParser.getAttr(v, 'calculation');
      const expr = XMLParser.getChild(v, 'variableExpression');
      if (name) {
        vars.set(name, {
          class: cls,
          calculation,
          expression: expr ? XMLParser.getText(expr) : undefined,
        });
      }
    }
    return vars;
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
  private report!: ParsedReport;
  private options!: JRXMLRenderOptions;
  private evaluator!: ExpressionEvaluator;
  private currentY: number = 0;

  /**
   * Render a parsed report to PDF
   */
  async render(report: ParsedReport, options: JRXMLRenderOptions = {}): Promise<Uint8Array> {
    this.report = report;
    this.options = options;
    this.evaluator = new ExpressionEvaluator(
      options.fields || {},
      options.parameters || {},
      {},
      options.debug
    );

    this.pdfDoc = await PDFDocument.create();
    await this.embedFonts();

    const { pageWidth, pageHeight } = report.config;
    this.page = this.pdfDoc.addPage([pageWidth, pageHeight]);
    this.currentY = pageHeight - report.config.topMargin;

    // Render bands in order
    const bandOrder: Array<keyof ParsedReport['bands']> = [
      'title', 'pageHeader', 'columnHeader'
    ];

    for (const bandName of bandOrder) {
      const band = report.bands[bandName];
      if (band && !Array.isArray(band)) {
        await this.renderBand(band);
      }
    }

    // Detail bands
    for (const detailBand of report.bands.detail) {
      await this.renderBand(detailBand);
    }

    // Footer bands
    if (report.bands.columnFooter) {
      await this.renderBand(report.bands.columnFooter);
    }

    if (report.bands.pageFooter) {
      const footerY = report.config.bottomMargin + report.bands.pageFooter.height;
      await this.renderBandAtY(report.bands.pageFooter, footerY);
    }

    if (report.bands.summary) {
      await this.renderBand(report.bands.summary);
    }

    return await this.pdfDoc.save();
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

    for (const [name, font] of fontMap) {
      this.fonts.set(name, await this.pdfDoc.embedFont(font));
    }
  }

  private getFont(style: TextStyle): PDFFont {
    const fontName = style.fontName.toLowerCase();
    let fontKey = 'Helvetica';

    if (fontName.includes('times')) {
      fontKey = 'Times-Roman';
      if (style.isBold && style.isItalic) fontKey = 'Times-BoldItalic';
      else if (style.isBold) fontKey = 'Times-Bold';
      else if (style.isItalic) fontKey = 'Times-Italic';
    } else if (fontName.includes('courier') || fontName.includes('mono')) {
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
    await this.renderBandAtY(band, this.currentY);
    this.currentY -= band.height;
  }

  private async renderBandAtY(band: Band, bandTopY: number): Promise<void> {
    for (const element of band.elements) {
      await this.renderElement(element, bandTopY);
    }
  }

  private async renderElement(element: BandElement, bandTopY: number): Promise<void> {
    // Gate rendering on `printWhenExpression` if provided.
    const pwe = element.reportElement.printWhenExpression;
    if (pwe) {
      const result = this.evaluator.evaluate(pwe);
      if (!isTruthyPrintWhen(result)) return;
    }

    switch (element.type) {
      case 'staticText':
        await this.renderStaticText(element, bandTopY);
        break;
      case 'textField':
        await this.renderTextField(element, bandTopY);
        break;
      case 'image':
        await this.renderImage(element, bandTopY);
        break;
      case 'line':
        await this.renderLine(element, bandTopY);
        break;
      case 'rectangle':
        await this.renderRectangle(element, bandTopY);
        break;
      case 'ellipse':
        await this.renderEllipse(element, bandTopY);
        break;
    }
  }

  private async renderStaticText(element: StaticTextElement, bandTopY: number): Promise<void> {
    this.drawBox(element.reportElement, element.box, bandTopY);
    await this.drawText(element.text, element.reportElement, element.textStyle, bandTopY, element.box);
  }

  private async renderTextField(element: TextFieldElement, bandTopY: number): Promise<void> {
    const raw = this.evaluator.evaluate(element.expression);

    if ((raw === null || raw === undefined || raw === '') && element.isBlankWhenNull) {
      return;
    }

    const text = element.pattern
      ? formatPattern(raw, element.pattern)
      : raw?.toString() ?? '';

    this.drawBox(element.reportElement, element.box, bandTopY);
    await this.drawText(text, element.reportElement, element.textStyle, bandTopY, element.box);
  }

  private async drawText(
    text: string,
    reportElement: ReportElement,
    textStyle: TextStyle,
    bandTopY: number,
    box?: BoxStyle,
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

    const x = this.report.config.leftMargin + reportElement.x + padLeft;
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
  private drawBox(re: ReportElement, box: BoxStyle | undefined, bandTopY: number): void {
    if (!box) return;

    const x = this.report.config.leftMargin + re.x;
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

  private async renderImage(element: ImageElement, bandTopY: number): Promise<void> {
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

    const boxX = this.report.config.leftMargin + element.reportElement.x;
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
  }

  private async renderLine(element: LineElement, bandTopY: number): Promise<void> {
    const { reportElement, pen, direction } = element;

    const x1 = this.report.config.leftMargin + reportElement.x;
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

  private async renderRectangle(element: RectangleElement, bandTopY: number): Promise<void> {
    const { reportElement, pen } = element;

    const x = this.report.config.leftMargin + reportElement.x;
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

  private async renderEllipse(element: EllipseElement, bandTopY: number): Promise<void> {
    const { reportElement, pen } = element;

    const centerX = this.report.config.leftMargin + reportElement.x + reportElement.width / 2;
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
