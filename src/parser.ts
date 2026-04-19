/**
 * JRXML Parser and Renderer
 */

import { PDFDocument, StandardFonts, rgb, PDFFont, PDFPage, PDFImage } from 'pdf-lib';
import { XMLParser } from './xml-parser';
import { ExpressionEvaluator } from './expression';
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
    const bands = this.parseBands(root);

    this.log('Parse complete');

    return { config, fields, parameters, variables, bands };
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

    return {
      x: XMLParser.getAttrInt(reportElement, 'x', 0),
      y: XMLParser.getAttrInt(reportElement, 'y', 0),
      width: XMLParser.getAttrInt(reportElement, 'width', 100),
      height: XMLParser.getAttrInt(reportElement, 'height', 20),
      uuid: XMLParser.getAttr(reportElement, 'uuid'),
      forecolor: XMLParser.getAttr(reportElement, 'forecolor'),
      backcolor: XMLParser.getAttr(reportElement, 'backcolor'),
      mode: XMLParser.getAttr(reportElement, 'mode') as ReportElement['mode'],
    };
  }

  private parseTextStyle(el: XMLElement): TextStyle {
    const textElement = XMLParser.getChild(el, 'textElement');
    const font = textElement ? XMLParser.getChild(textElement, 'font') : null;

    const style: TextStyle = {
      fontName: 'Helvetica',
      fontSize: 12,
      isBold: false,
      isItalic: false,
      isUnderline: false,
      textAlignment: 'Left',
      verticalAlignment: 'Top',
      forecolor: '#000000',
    };

    if (textElement) {
      style.textAlignment = XMLParser.getAttr(textElement, 'textAlignment', 'Left') as TextStyle['textAlignment'];
      style.verticalAlignment = XMLParser.getAttr(textElement, 'verticalAlignment', 'Top') as TextStyle['verticalAlignment'];
    }

    if (font) {
      style.fontName = XMLParser.getAttr(font, 'fontName', 'Helvetica');
      style.fontSize = XMLParser.getAttrInt(font, 'size', 12);
      style.isBold = XMLParser.getAttrBool(font, 'isBold', false);
      style.isItalic = XMLParser.getAttrBool(font, 'isItalic', false);
      style.isUnderline = XMLParser.getAttrBool(font, 'isUnderline', false);
    }

    const reportElement = XMLParser.getChild(el, 'reportElement');
    if (reportElement) {
      const forecolor = XMLParser.getAttr(reportElement, 'forecolor');
      if (forecolor) style.forecolor = forecolor;
    }

    return style;
  }

  private parseStaticText(el: XMLElement): StaticTextElement {
    const textEl = XMLParser.getChild(el, 'text');
    return {
      type: 'staticText',
      reportElement: this.parseReportElement(el),
      textStyle: this.parseTextStyle(el),
      text: textEl ? XMLParser.getText(textEl) : '',
    };
  }

  private parseTextField(el: XMLElement): TextFieldElement {
    const exprEl = XMLParser.getChild(el, 'textFieldExpression');
    return {
      type: 'textField',
      reportElement: this.parseReportElement(el),
      textStyle: this.parseTextStyle(el),
      expression: exprEl ? XMLParser.getText(exprEl) : '',
      textAdjust: XMLParser.getAttr(el, 'textAdjust') as TextFieldElement['textAdjust'],
      isBlankWhenNull: XMLParser.getAttrBool(el, 'isBlankWhenNull', false),
      pattern: XMLParser.getAttr(el, 'pattern'),
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
    color = color.replace('#', '');
    if (color.length === 6) {
      const r = parseInt(color.substring(0, 2), 16) / 255;
      const g = parseInt(color.substring(2, 4), 16) / 255;
      const b = parseInt(color.substring(4, 6), 16) / 255;
      return rgb(r, g, b);
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
    await this.drawText(element.text, element.reportElement, element.textStyle, bandTopY);
  }

  private async renderTextField(element: TextFieldElement, bandTopY: number): Promise<void> {
    let text = this.evaluator.evaluate(element.expression);
    
    if ((text === null || text === undefined || text === '') && element.isBlankWhenNull) {
      return;
    }
    
    text = text?.toString() || '';
    await this.drawText(text, element.reportElement, element.textStyle, bandTopY);
  }

  private async drawText(
    text: string,
    reportElement: ReportElement,
    textStyle: TextStyle,
    bandTopY: number
  ): Promise<void> {
    if (!text) return;

    const font = this.getFont(textStyle);
    const fontSize = textStyle.fontSize;
    const color = this.parseColor(textStyle.forecolor);

    const x = this.report.config.leftMargin + reportElement.x;
    const elementTopY = bandTopY - reportElement.y;
    const elementBottomY = elementTopY - reportElement.height;

    const lines = this.wrapText(text, font, fontSize, reportElement.width);
    const lineHeight = fontSize * 1.2;
    const totalTextHeight = lines.length * lineHeight;

    let textY: number;
    switch (textStyle.verticalAlignment) {
      case 'Bottom':
        textY = elementBottomY + (lines.length - 1) * lineHeight + fontSize * 0.2;
        break;
      case 'Middle':
        textY = elementTopY - (reportElement.height - totalTextHeight) / 2 - fontSize;
        break;
      case 'Top':
      default:
        textY = elementTopY - fontSize;
        break;
    }

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineY = textY - i * lineHeight;
      const lineWidth = font.widthOfTextAtSize(line, fontSize);

      let textX = x;
      switch (textStyle.textAlignment) {
        case 'Center':
          textX = x + (reportElement.width - lineWidth) / 2;
          break;
        case 'Right':
          textX = x + reportElement.width - lineWidth;
          break;
      }

      this.page.drawText(line, { x: textX, y: lineY, size: fontSize, font, color });
    }
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
    const imagePath = this.evaluator.evaluate(element.expression);
    if (!imagePath) return;

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

    const x = this.report.config.leftMargin + element.reportElement.x;
    const y = bandTopY - element.reportElement.y - element.reportElement.height;

    this.page.drawImage(image, {
      x,
      y,
      width: element.reportElement.width,
      height: element.reportElement.height,
    });
  }

  private async renderLine(element: LineElement, bandTopY: number): Promise<void> {
    const { reportElement, pen, direction } = element;

    const x1 = this.report.config.leftMargin + reportElement.x;
    const y1 = bandTopY - reportElement.y;
    const x2 = x1 + reportElement.width;
    const y2 = y1 - reportElement.height;

    const color = pen ? this.parseColor(pen.lineColor) : rgb(0, 0, 0);
    const thickness = pen?.lineWidth || 1;

    if (direction === 'BottomUp') {
      this.page.drawLine({ start: { x: x1, y: y2 }, end: { x: x2, y: y1 }, thickness, color });
    } else {
      this.page.drawLine({ start: { x: x1, y: y1 }, end: { x: x2, y: y2 }, thickness, color });
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
