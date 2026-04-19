/**
 * XML Parser adapter over `fast-xml-parser`.
 *
 * Preserves the `XMLElement`-shaped output and static helper API expected by
 * `parser.ts`, so the JRXML parser/renderer don't need to know which parser is
 * underneath. Uses `preserveOrder: true` so sibling element order — which
 * matters for band layout — is retained.
 */

import { XMLParser as FastXMLParser } from 'fast-xml-parser';
import type { XMLElement } from './types';

type OrderedNode = Record<string, unknown>;

const ATTR_PREFIX = '@_';
const ATTR_GROUP_KEY = ':@';
const TEXT_KEY = '#text';
const CDATA_KEY = '__cdata';

export class XMLParser {
  private rootElement: XMLElement;

  constructor(xmlString: string) {
    const parser = new FastXMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: ATTR_PREFIX,
      preserveOrder: true,
      trimValues: true,
      parseAttributeValue: false,
      parseTagValue: false,
      cdataPropName: CDATA_KEY,
      processEntities: true,
    });

    const parsed = parser.parse(xmlString) as OrderedNode[];
    const root = this.findRootElement(parsed);
    if (!root) {
      throw new Error('Invalid XML: no root element found');
    }
    this.rootElement = this.convertNode(root);
  }

  private findRootElement(nodes: OrderedNode[]): OrderedNode | undefined {
    // Skip XML prolog (`?xml`) and any comment/DTD-ish nodes.
    return nodes.find((node) => {
      const keys = Object.keys(node).filter((k) => k !== ATTR_GROUP_KEY);
      if (keys.length === 0) return false;
      const tag = keys[0];
      return tag !== '?xml' && tag !== TEXT_KEY && tag !== CDATA_KEY;
    });
  }

  private convertNode(node: OrderedNode): XMLElement {
    const tagName = Object.keys(node).find((k) => k !== ATTR_GROUP_KEY) ?? '';
    const rawChildren = (node[tagName] as OrderedNode[] | undefined) ?? [];
    const rawAttrs = (node[ATTR_GROUP_KEY] as Record<string, unknown> | undefined) ?? {};

    const attributes: Record<string, string> = {};
    for (const [key, value] of Object.entries(rawAttrs)) {
      const name = key.startsWith(ATTR_PREFIX) ? key.slice(ATTR_PREFIX.length) : key;
      attributes[name] = value == null ? '' : String(value);
    }

    const children: XMLElement[] = [];
    let textContent = '';

    for (const child of rawChildren) {
      if (TEXT_KEY in child) {
        const t = String(child[TEXT_KEY] ?? '');
        if (t.trim()) textContent += t;
        continue;
      }
      if (CDATA_KEY in child) {
        textContent += this.extractCDataText(child[CDATA_KEY]);
        continue;
      }
      children.push(this.convertNode(child));
    }

    if (!textContent && children.length > 0) {
      textContent = this.collectDeepText(children);
    }

    return { tagName, attributes, children, textContent };
  }

  private collectDeepText(children: XMLElement[]): string {
    let out = '';
    for (const c of children) {
      out += c.textContent || '';
      if (!c.textContent && c.children.length > 0) {
        out += this.collectDeepText(c.children);
      }
    }
    return out;
  }

  private extractCDataText(value: unknown): string {
    if (value == null) return '';
    if (typeof value === 'string') return value;
    if (Array.isArray(value)) {
      // preserveOrder wraps CDATA content as [{ '#text': '...' }, ...]
      return value.map((v) => this.extractCDataText(v)).join('');
    }
    if (typeof value === 'object') {
      const obj = value as Record<string, unknown>;
      if (TEXT_KEY in obj) return String(obj[TEXT_KEY] ?? '');
      return Object.values(obj).map((v) => this.extractCDataText(v)).join('');
    }
    return String(value);
  }

  get root(): XMLElement {
    return this.rootElement;
  }

  // -----------------------------------------------------------------
  // Static helpers (kept identical to the original API)
  // -----------------------------------------------------------------

  static getAttr(el: XMLElement, name: string, defaultValue: string = ''): string {
    const v = el.attributes[name];
    return v !== undefined ? v : defaultValue;
  }

  static getAttrInt(el: XMLElement, name: string, defaultValue: number = 0): number {
    const v = el.attributes[name];
    return v !== undefined && v !== '' ? parseInt(v, 10) : defaultValue;
  }

  static getAttrBool(el: XMLElement, name: string, defaultValue: boolean = false): boolean {
    const v = el.attributes[name];
    if (v === undefined || v === '') return defaultValue;
    return v.toLowerCase() === 'true';
  }

  static getText(el: XMLElement): string {
    return el.textContent || '';
  }

  static getChild(el: XMLElement, tagName: string): XMLElement | null {
    return el.children.find((c) => c.tagName === tagName) ?? null;
  }

  static getChildren(el: XMLElement, tagName: string): XMLElement[] {
    return el.children.filter((c) => c.tagName === tagName);
  }
}
