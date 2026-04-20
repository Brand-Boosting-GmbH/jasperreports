/**
 * JRXML Lite Type Definitions
 */

/**
 * Options for rendering JRXML to PDF
 */
export interface JRXMLRenderOptions {
  /** Field values - maps to $F{fieldName} in JRXML */
  fields?: Record<string, any>;
  
  /** Parameter values - maps to $P{paramName} in JRXML */
  parameters?: Record<string, any>;
  
  /** 
   * Image resolver function - returns image bytes for a given path/expression
   * @param path - The image path from the JRXML expression
   * @returns Image bytes as Uint8Array, or null if not found
   */
  imageResolver?: (path: string) => Promise<Uint8Array | null>;
  
  /** Enable debug logging */
  debug?: boolean;
}

/**
 * Report page configuration
 */
export interface ReportConfig {
  name: string;
  pageWidth: number;
  pageHeight: number;
  columnWidth: number;
  leftMargin: number;
  rightMargin: number;
  topMargin: number;
  bottomMargin: number;
  orientation: 'Portrait' | 'Landscape';
}

/**
 * Report element positioning and styling
 */
export interface ReportElement {
  x: number;
  y: number;
  width: number;
  height: number;
  uuid?: string;
  forecolor?: string;
  backcolor?: string;
  mode?: 'Opaque' | 'Transparent';
  /** Optional expression controlling whether the element is rendered. */
  printWhenExpression?: string;
  /** Name of a report-level `<style>` to inherit attributes from. */
  style?: string;
}

/**
 * Box properties: per-side borders and padding.
 */
export interface BoxPen {
  lineWidth: number;
  lineColor: string;
  lineStyle: 'Solid' | 'Dashed' | 'Dotted';
}

export interface BoxStyle {
  topPen?: BoxPen;
  leftPen?: BoxPen;
  bottomPen?: BoxPen;
  rightPen?: BoxPen;
  topPadding?: number;
  leftPadding?: number;
  bottomPadding?: number;
  rightPadding?: number;
}

/**
 * A named `<style>` declaration from the report template. All fields are
 * optional — they merge into child elements that reference the style.
 */
export interface ReportStyle {
  name: string;
  parent?: string;
  forecolor?: string;
  backcolor?: string;
  mode?: 'Opaque' | 'Transparent';
  fontName?: string;
  fontSize?: number;
  isBold?: boolean;
  isItalic?: boolean;
  isUnderline?: boolean;
  textAlignment?: 'Left' | 'Center' | 'Right' | 'Justified';
  verticalAlignment?: 'Top' | 'Middle' | 'Bottom';
  pattern?: string;
  box?: BoxStyle;
}

/**
 * Text styling properties
 */
export interface TextStyle {
  fontName: string;
  fontSize: number;
  isBold: boolean;
  isItalic: boolean;
  isUnderline: boolean;
  textAlignment: 'Left' | 'Center' | 'Right' | 'Justified';
  verticalAlignment: 'Top' | 'Middle' | 'Bottom';
  forecolor: string;
  /** Rotation applied to the text within its element box. */
  rotation?: 'None' | 'Left' | 'Right' | 'UpsideDown';
  /** Inline markup format; only `none` and `styled` are honored. */
  markup?: 'none' | 'styled' | 'html' | 'rtf';
}

/**
 * Static text element
 */
export interface StaticTextElement {
  type: 'staticText';
  reportElement: ReportElement;
  textStyle: TextStyle;
  text: string;
  box?: BoxStyle;
}

/**
 * Dynamic text field element
 */
export interface TextFieldElement {
  type: 'textField';
  reportElement: ReportElement;
  textStyle: TextStyle;
  expression: string;
  /** Fully-qualified Java class declared on the `<textFieldExpression>` element. */
  expressionClass?: string;
  textAdjust?: 'StretchHeight' | 'ScaleFont';
  isBlankWhenNull: boolean;
  pattern?: string;
  box?: BoxStyle;
}

/**
 * Image element
 */
export interface ImageElement {
  type: 'image';
  reportElement: ReportElement;
  expression: string;
  scaleImage?: 'Clip' | 'FillFrame' | 'RetainShape';
  hAlign?: 'Left' | 'Center' | 'Right';
  vAlign?: 'Top' | 'Middle' | 'Bottom';
}

/**
 * Line element
 */
export interface LineElement {
  type: 'line';
  reportElement: ReportElement;
  direction?: 'TopDown' | 'BottomUp';
  pen?: {
    lineWidth: number;
    lineColor: string;
    lineStyle: 'Solid' | 'Dashed' | 'Dotted';
  };
}

/**
 * Rectangle element
 */
export interface RectangleElement {
  type: 'rectangle';
  reportElement: ReportElement;
  radius?: number;
  pen?: {
    lineWidth: number;
    lineColor: string;
  };
}

/**
 * Ellipse element
 */
export interface EllipseElement {
  type: 'ellipse';
  reportElement: ReportElement;
  pen?: {
    lineWidth: number;
    lineColor: string;
  };
}

/**
 * Union type for all band elements
 */
export type BandElement = 
  | StaticTextElement 
  | TextFieldElement 
  | ImageElement 
  | LineElement 
  | RectangleElement 
  | EllipseElement;

/**
 * Report band (section)
 */
export interface Band {
  height: number;
  splitType?: 'Stretch' | 'Prevent' | 'Immediate';
  elements: BandElement[];
}

/**
 * Parsed JRXML report structure
 */
export interface ParsedReport {
  /** Page configuration */
  config: ReportConfig;
  
  /** Field definitions - Map of field name to Java class */
  fields: Map<string, string>;
  
  /** Parameter definitions */
  parameters: Map<string, { class: string; defaultValue?: string }>;
  
  /** Variable definitions */
  variables: Map<string, { class: string; calculation?: string; expression?: string }>;

  /** Named `<style>` declarations for inheritance. */
  styles: Map<string, ReportStyle>;
  
  /** Report bands */
  bands: {
    background?: Band;
    title?: Band;
    pageHeader?: Band;
    columnHeader?: Band;
    detail: Band[];
    columnFooter?: Band;
    pageFooter?: Band;
    lastPageFooter?: Band;
    summary?: Band;
    noData?: Band;
  };
}

/**
 * Internal XML element representation
 * @internal
 */
export interface XMLElement {
  tagName: string;
  attributes: Record<string, string>;
  children: XMLElement[];
  textContent: string;
}
