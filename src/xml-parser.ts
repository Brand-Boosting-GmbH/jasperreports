/**
 * Cross-platform XML Parser
 * 
 * Pure JavaScript implementation - works in Cloudflare Workers, Node.js, Deno, and browsers.
 * Does NOT rely on DOMParser (not available in Cloudflare Workers).
 */

import type { XMLElement } from './types';

export class XMLParser {
  private rootElement: XMLElement;

  constructor(xmlString: string) {
    this.rootElement = this.parseXML(xmlString);
  }

  /**
   * Pure JavaScript XML parser
   * Handles XML with attributes, nested elements, CDATA, and comments
   */
  private parseXML(xml: string): XMLElement {
    // Remove XML declaration and comments
    xml = xml.replace(/<\?xml[^?]*\?>/g, '').trim();
    xml = xml.replace(/<!--[\s\S]*?-->/g, '').trim();
    
    return this.parseElement(xml, 0).element;
  }

  private parseElement(xml: string, start: number): { element: XMLElement; end: number } {
    // Skip whitespace
    while (start < xml.length && /\s/.test(xml[start])) start++;

    if (xml[start] !== '<') {
      throw new Error(`Expected '<' at position ${start}`);
    }

    const tagStart = start + 1;
    let i = tagStart;

    // Get tag name
    while (i < xml.length && !/[\s/>]/.test(xml[i])) i++;
    const tagName = xml.substring(tagStart, i);

    // Parse attributes
    const attributes: Record<string, string> = {};
    while (i < xml.length && xml[i] !== '>' && xml[i] !== '/') {
      while (i < xml.length && /\s/.test(xml[i])) i++;
      
      if (xml[i] === '>' || xml[i] === '/') break;

      const attrNameStart = i;
      while (i < xml.length && xml[i] !== '=' && !/[\s/>]/.test(xml[i])) i++;
      const attrName = xml.substring(attrNameStart, i);

      while (i < xml.length && (xml[i] === '=' || /\s/.test(xml[i]))) i++;

      if (xml[i] === '"' || xml[i] === "'") {
        const quote = xml[i];
        i++;
        const valueStart = i;
        while (i < xml.length && xml[i] !== quote) i++;
        attributes[attrName] = xml.substring(valueStart, i);
        i++;
      }
    }

    // Self-closing tag
    if (xml[i] === '/') {
      i += 2;
      return {
        element: { tagName, attributes, children: [], textContent: '' },
        end: i,
      };
    }

    i++; // Skip '>'

    // Parse children and text
    const children: XMLElement[] = [];
    let textContent = '';

    while (i < xml.length) {
      while (i < xml.length && /\s/.test(xml[i])) i++;

      // Closing tag
      if (xml.substring(i, i + 2 + tagName.length + 1) === `</${tagName}>`) {
        i += 2 + tagName.length + 1;
        break;
      }

      // CDATA
      if (xml.substring(i, i + 9) === '<![CDATA[') {
        const cdataStart = i + 9;
        const cdataEnd = xml.indexOf(']]>', cdataStart);
        if (cdataEnd === -1) throw new Error('Unclosed CDATA');
        textContent += xml.substring(cdataStart, cdataEnd);
        i = cdataEnd + 3;
        continue;
      }

      // Child element
      if (xml[i] === '<' && xml[i + 1] !== '/') {
        const result = this.parseElement(xml, i);
        children.push(result.element);
        i = result.end;
        continue;
      }

      // Text content
      if (xml[i] !== '<') {
        const textStart = i;
        while (i < xml.length && xml[i] !== '<') i++;
        const text = xml.substring(textStart, i).trim();
        if (text) textContent += text;
        continue;
      }

      // Closing tag
      if (xml[i] === '<' && xml[i + 1] === '/') {
        const closeEnd = xml.indexOf('>', i);
        i = closeEnd + 1;
        break;
      }

      i++;
    }

    if (!textContent && children.length > 0) {
      textContent = this.getDeepTextContent({ tagName, attributes, children, textContent: '' });
    }

    return {
      element: { tagName, attributes, children, textContent },
      end: i,
    };
  }

  private getDeepTextContent(el: XMLElement): string {
    if (el.children.length === 0) {
      return el.textContent || '';
    }
    return el.children.map(c => this.getDeepTextContent(c)).join('');
  }

  get root(): XMLElement {
    return this.rootElement;
  }

  // Static helper methods
  static getAttr(el: XMLElement, name: string, defaultValue: string = ''): string {
    return el.attributes[name] || defaultValue;
  }

  static getAttrInt(el: XMLElement, name: string, defaultValue: number = 0): number {
    const val = el.attributes[name];
    return val ? parseInt(val, 10) : defaultValue;
  }

  static getAttrBool(el: XMLElement, name: string, defaultValue: boolean = false): boolean {
    const val = el.attributes[name];
    if (!val) return defaultValue;
    return val.toLowerCase() === 'true';
  }

  static getText(el: XMLElement): string {
    return el.textContent || '';
  }

  static getChild(el: XMLElement, tagName: string): XMLElement | null {
    return el.children.find(c => c.tagName === tagName) || null;
  }

  static getChildren(el: XMLElement, tagName: string): XMLElement[] {
    return el.children.filter(c => c.tagName === tagName);
  }
}
