import { describe, it, expect } from 'vitest';
import { renderJRXML, parseJRXML } from './index';

const sampleJRXML = `<?xml version="1.0" encoding="UTF-8"?>
<jasperReport name="TestReport" pageWidth="595" pageHeight="842" 
              leftMargin="20" rightMargin="20" topMargin="20" bottomMargin="20">
  <field name="name" class="java.lang.String"/>
  <field name="date" class="java.lang.String"/>
  
  <title>
    <band height="50">
      <staticText>
        <reportElement x="0" y="0" width="555" height="30"/>
        <textElement textAlignment="Center">
          <font size="24" isBold="true"/>
        </textElement>
        <text><![CDATA[Test Certificate]]></text>
      </staticText>
    </band>
  </title>
  
  <detail>
    <band height="100">
      <textField>
        <reportElement x="0" y="20" width="555" height="30"/>
        <textElement textAlignment="Center">
          <font size="18"/>
        </textElement>
        <textFieldExpression><![CDATA[$F{name}]]></textFieldExpression>
      </textField>
      <textField>
        <reportElement x="0" y="60" width="555" height="20"/>
        <textElement textAlignment="Center"/>
        <textFieldExpression><![CDATA["Date: " + $F{date}]]></textFieldExpression>
      </textField>
    </band>
  </detail>
</jasperReport>`;

describe('parseJRXML', () => {
  it('should parse JRXML and extract config', () => {
    const report = parseJRXML(sampleJRXML);
    
    expect(report.config.name).toBe('TestReport');
    expect(report.config.pageWidth).toBe(595);
    expect(report.config.pageHeight).toBe(842);
    expect(report.config.leftMargin).toBe(20);
  });

  it('should extract fields', () => {
    const report = parseJRXML(sampleJRXML);
    
    expect(report.fields.size).toBe(2);
    expect(report.fields.has('name')).toBe(true);
    expect(report.fields.has('date')).toBe(true);
  });

  it('should parse bands', () => {
    const report = parseJRXML(sampleJRXML);
    
    expect(report.bands.title).toBeDefined();
    expect(report.bands.title?.height).toBe(50);
    expect(report.bands.title?.elements.length).toBe(1);
    
    expect(report.bands.detail.length).toBe(1);
    expect(report.bands.detail[0].elements.length).toBe(2);
  });

  it('should parse static text elements', () => {
    const report = parseJRXML(sampleJRXML);
    const titleElement = report.bands.title?.elements[0];
    
    expect(titleElement?.type).toBe('staticText');
    if (titleElement?.type === 'staticText') {
      expect(titleElement.text).toBe('Test Certificate');
      expect(titleElement.textStyle.fontSize).toBe(24);
      expect(titleElement.textStyle.isBold).toBe(true);
      expect(titleElement.textStyle.textAlignment).toBe('Center');
    }
  });

  it('should parse text field elements', () => {
    const report = parseJRXML(sampleJRXML);
    const detailElement = report.bands.detail[0].elements[0];
    
    expect(detailElement?.type).toBe('textField');
    if (detailElement?.type === 'textField') {
      expect(detailElement.expression).toContain('$F{name}');
    }
  });
});

describe('renderJRXML', () => {
  it('should render PDF with field values', async () => {
    const pdfBytes = await renderJRXML(sampleJRXML, {
      fields: {
        name: 'John Doe',
        date: '2025-01-15',
      },
    });
    
    expect(pdfBytes).toBeInstanceOf(Uint8Array);
    expect(pdfBytes.length).toBeGreaterThan(0);
    
    // Check PDF header
    const header = String.fromCharCode(...pdfBytes.slice(0, 5));
    expect(header).toBe('%PDF-');
  });

  it('should handle empty fields', async () => {
    const pdfBytes = await renderJRXML(sampleJRXML, {
      fields: {},
    });
    
    expect(pdfBytes).toBeInstanceOf(Uint8Array);
    expect(pdfBytes.length).toBeGreaterThan(0);
  });

  it('should handle debug mode', async () => {
    const pdfBytes = await renderJRXML(sampleJRXML, {
      fields: { name: 'Test' },
      debug: true,
    });
    
    expect(pdfBytes).toBeInstanceOf(Uint8Array);
  });
});

describe('Tier 1 features', () => {
  it('accepts #RGB shorthand hex colors without crashing', async () => {
    const jrxml = `<?xml version="1.0" encoding="UTF-8"?>
<jasperReport name="ColorTest" pageWidth="200" pageHeight="200"
              leftMargin="10" rightMargin="10" topMargin="10" bottomMargin="10">
  <title>
    <band height="50">
      <staticText>
        <reportElement x="0" y="0" width="180" height="20" forecolor="#F0C"/>
        <text><![CDATA[Hi]]></text>
      </staticText>
    </band>
  </title>
</jasperReport>`;
    const pdf = await parseJRXML(jrxml);
    expect(pdf.bands.title?.elements[0].reportElement.forecolor).toBe('#F0C');
    const bytes = await renderJRXML(jrxml);
    expect(bytes).toBeInstanceOf(Uint8Array);
  });

  it('parses printWhenExpression and expressionClass', () => {
    const jrxml = `<?xml version="1.0" encoding="UTF-8"?>
<jasperReport name="PrintWhenTest" pageWidth="200" pageHeight="200"
              leftMargin="10" rightMargin="10" topMargin="10" bottomMargin="10">
  <field name="show" class="java.lang.Boolean"/>
  <field name="amount" class="java.lang.Double"/>
  <detail>
    <band height="50">
      <textField pattern="#,##0.00">
        <reportElement x="0" y="0" width="180" height="20">
          <printWhenExpression><![CDATA[$F{show}]]></printWhenExpression>
        </reportElement>
        <textFieldExpression class="java.lang.Double"><![CDATA[$F{amount}]]></textFieldExpression>
      </textField>
    </band>
  </detail>
</jasperReport>`;
    const report = parseJRXML(jrxml);
    const el = report.bands.detail[0].elements[0];
    expect(el.type).toBe('textField');
    expect(el.reportElement.printWhenExpression).toBe('$F{show}');
    if (el.type === 'textField') {
      expect(el.expressionClass).toBe('java.lang.Double');
      expect(el.pattern).toBe('#,##0.00');
    }
  });

  it('renders a pattern-formatted value', async () => {
    const jrxml = `<?xml version="1.0" encoding="UTF-8"?>
<jasperReport name="PatternTest" pageWidth="200" pageHeight="200"
              leftMargin="10" rightMargin="10" topMargin="10" bottomMargin="10">
  <field name="amount" class="java.lang.Double"/>
  <detail>
    <band height="50">
      <textField pattern="#,##0.00">
        <reportElement x="0" y="0" width="180" height="20"/>
        <textFieldExpression class="java.lang.Double"><![CDATA[$F{amount}]]></textFieldExpression>
      </textField>
    </band>
  </detail>
</jasperReport>`;
    const bytes = await renderJRXML(jrxml, { fields: { amount: 1234.5 } });
    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(bytes.length).toBeGreaterThan(0);
  });
});

describe('Tier 2 features', () => {
  it('parses <style> and exposes them on the report', () => {
    const jrxml = `<?xml version="1.0" encoding="UTF-8"?>
<jasperReport name="StyleTest" pageWidth="200" pageHeight="200"
              leftMargin="10" rightMargin="10" topMargin="10" bottomMargin="10">
  <style name="Header" forecolor="#FF0000" fontName="Times-Roman" fontSize="16" isBold="true"/>
  <title>
    <band height="50">
      <staticText>
        <reportElement style="Header" x="0" y="0" width="180" height="20"/>
        <text><![CDATA[Hello]]></text>
      </staticText>
    </band>
  </title>
</jasperReport>`;
    const report = parseJRXML(jrxml);
    expect(report.styles.size).toBe(1);
    expect(report.styles.get('Header')?.forecolor).toBe('#FF0000');
    const el = report.bands.title!.elements[0];
    expect(el.reportElement.style).toBe('Header');
    expect(el.reportElement.forecolor).toBe('#FF0000');
    if (el.type === 'staticText') {
      expect(el.textStyle.fontName).toBe('Times-Roman');
      expect(el.textStyle.fontSize).toBe(16);
      expect(el.textStyle.isBold).toBe(true);
    }
  });

  it('supports style inheritance via parent style', () => {
    const jrxml = `<?xml version="1.0" encoding="UTF-8"?>
<jasperReport name="InheritTest" pageWidth="200" pageHeight="200"
              leftMargin="10" rightMargin="10" topMargin="10" bottomMargin="10">
  <style name="Base" fontSize="10" fontName="Helvetica"/>
  <style name="Child" style="Base" isBold="true"/>
  <title>
    <band height="50">
      <staticText>
        <reportElement style="Child" x="0" y="0" width="180" height="20"/>
        <text><![CDATA[X]]></text>
      </staticText>
    </band>
  </title>
</jasperReport>`;
    const report = parseJRXML(jrxml);
    const el = report.bands.title!.elements[0];
    if (el.type === 'staticText') {
      expect(el.textStyle.fontName).toBe('Helvetica');
      expect(el.textStyle.fontSize).toBe(10);
      expect(el.textStyle.isBold).toBe(true);
    }
  });

  it('parses <box> borders and padding on a textField', () => {
    const jrxml = `<?xml version="1.0" encoding="UTF-8"?>
<jasperReport name="BoxTest" pageWidth="200" pageHeight="200"
              leftMargin="10" rightMargin="10" topMargin="10" bottomMargin="10">
  <field name="name" class="java.lang.String"/>
  <detail>
    <band height="50">
      <textField>
        <reportElement x="0" y="0" width="180" height="30"/>
        <box leftPadding="5" rightPadding="5" topPadding="2" bottomPadding="2">
          <pen lineWidth="1" lineColor="#000000"/>
        </box>
        <textFieldExpression><![CDATA[$F{name}]]></textFieldExpression>
      </textField>
    </band>
  </detail>
</jasperReport>`;
    const report = parseJRXML(jrxml);
    const el = report.bands.detail[0].elements[0];
    if (el.type === 'textField') {
      expect(el.box?.leftPadding).toBe(5);
      expect(el.box?.topPen?.lineWidth).toBe(1);
      expect(el.box?.topPen?.lineColor).toBe('#000000');
    }
  });

  it('parses rotation and markup on textElement', () => {
    const jrxml = `<?xml version="1.0" encoding="UTF-8"?>
<jasperReport name="RotMarkup" pageWidth="200" pageHeight="200"
              leftMargin="10" rightMargin="10" topMargin="10" bottomMargin="10">
  <title>
    <band height="50">
      <staticText>
        <reportElement x="0" y="0" width="180" height="20"/>
        <textElement rotation="Left" markup="styled"/>
        <text><![CDATA[<b>Bold</b> and <i>italic</i>]]></text>
      </staticText>
    </band>
  </title>
</jasperReport>`;
    const report = parseJRXML(jrxml);
    const el = report.bands.title!.elements[0];
    if (el.type === 'staticText') {
      expect(el.textStyle.rotation).toBe('Left');
      expect(el.textStyle.markup).toBe('styled');
    }
  });

  it('renders styled markup without crashing', async () => {
    const jrxml = `<?xml version="1.0" encoding="UTF-8"?>
<jasperReport name="StyledRender" pageWidth="200" pageHeight="200"
              leftMargin="10" rightMargin="10" topMargin="10" bottomMargin="10">
  <title>
    <band height="50">
      <staticText>
        <reportElement x="0" y="0" width="180" height="20"/>
        <textElement markup="styled"/>
        <text><![CDATA[<b>Hello</b> <i>world</i>]]></text>
      </staticText>
    </band>
  </title>
</jasperReport>`;
    const bytes = await renderJRXML(jrxml);
    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(bytes.length).toBeGreaterThan(0);
  });
});
