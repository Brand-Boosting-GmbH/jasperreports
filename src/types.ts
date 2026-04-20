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
   * Rows of data to iterate. When provided, the detail band is rendered once
   * per row with `$F{...}` bound to that row's values. Falls back to a single
   * iteration with `options.fields` when omitted.
   */
  dataSource?: Array<Record<string, any>>;

  /**
   * Resource bundle for `$R{key}` lookups.
   */
  resources?: Record<string, any>;

  /**
   * Custom font embedding. Requires the caller to pass a `@pdf-lib/fontkit`
   * instance so pdf-lib can decode arbitrary TrueType/OpenType fonts.
   */
  fonts?: {
    /** A `@pdf-lib/fontkit` module (`import fontkit from '@pdf-lib/fontkit'`). */
    fontkit: any;
    /** Map of font family name → font variant bytes. */
    families: Record<string, CustomFontFamily>;
  };

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
 * Raw bytes for each variant of a custom font family.
 */
export interface CustomFontFamily {
  normal: Uint8Array | ArrayBuffer;
  bold?: Uint8Array | ArrayBuffer;
  italic?: Uint8Array | ArrayBuffer;
  boldItalic?: Uint8Array | ArrayBuffer;
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
 * A `<group>` declaration: groups rows by a common expression value and
 * emits `<groupHeader>` when the value changes (or is first seen) and
 * `<groupFooter>` before the next change or at the end of the report.
 */
export interface ReportGroup {
  name: string;
  expression: string;
  /** Render the header only when the new group starts on a fresh page. */
  isStartNewPage?: boolean;
  /** Render the header on every page the group spans. */
  isReprintHeaderOnEachPage?: boolean;
  header?: Band;
  footer?: Band;
}

/**
 * A `<variable>` declaration with optional calculation + reset semantics.
 */
export interface ReportVariable {
  name: string;
  class: string;
  calculation?:
    | 'Nothing'
    | 'Count'
    | 'DistinctCount'
    | 'Sum'
    | 'Average'
    | 'Lowest'
    | 'Highest'
    | 'First'
    | 'StandardDeviation'
    | 'Variance';
  resetType?: 'None' | 'Report' | 'Page' | 'Column' | 'Group';
  resetGroup?: string;
  incrementType?: 'None' | 'Report' | 'Page' | 'Column' | 'Group';
  incrementGroup?: string;
  expression?: string;
  initialValueExpression?: string;
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
  variables: Map<string, ReportVariable>;

  /** Named `<style>` declarations for inheritance. */
  styles: Map<string, ReportStyle>;

  /** `<group>` declarations in document order (outer-most first). */
  groups: ReportGroup[];
  
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
