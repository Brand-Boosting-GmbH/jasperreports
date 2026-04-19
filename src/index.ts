/**
 * JRXML Lite
 * 
 * A lightweight JasperReports JRXML renderer for modern JavaScript environments.
 * Works in Cloudflare Workers, Node.js, Deno, and browsers.
 * 
 * @packageDocumentation
 */

export { 
  renderJRXML, 
  parseJRXML,
  JRXMLParser,
  JRXMLRenderer,
  ExpressionEvaluator,
} from './parser';

export type {
  JRXMLRenderOptions,
  ParsedReport,
  ReportConfig,
  Band,
  BandElement,
  StaticTextElement,
  TextFieldElement,
  ImageElement,
  LineElement,
  RectangleElement,
  EllipseElement,
  TextStyle,
  ReportElement,
} from './types';
