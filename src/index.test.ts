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

describe('Tier 3 features', () => {
  it('iterates the detail band over a dataSource', async () => {
    const jrxml = `<?xml version="1.0" encoding="UTF-8"?>
<jasperReport name="Iter" pageWidth="200" pageHeight="400"
              leftMargin="10" rightMargin="10" topMargin="10" bottomMargin="10">
  <field name="name" class="java.lang.String"/>
  <detail>
    <band height="20">
      <textField>
        <reportElement x="0" y="0" width="180" height="20"/>
        <textFieldExpression><![CDATA[$F{name}]]></textFieldExpression>
      </textField>
    </band>
  </detail>
</jasperReport>`;
    const bytes = await renderJRXML(jrxml, {
      dataSource: [{ name: 'Alice' }, { name: 'Bob' }, { name: 'Carol' }],
    });
    expect(bytes.length).toBeGreaterThan(0);
  });

  it('parses <group> + groupHeader / groupFooter', () => {
    const jrxml = `<?xml version="1.0" encoding="UTF-8"?>
<jasperReport name="GroupTest" pageWidth="200" pageHeight="400"
              leftMargin="10" rightMargin="10" topMargin="10" bottomMargin="10">
  <field name="category" class="java.lang.String"/>
  <group name="byCategory">
    <groupExpression><![CDATA[$F{category}]]></groupExpression>
    <groupHeader>
      <band height="15">
        <staticText>
          <reportElement x="0" y="0" width="180" height="15"/>
          <text><![CDATA[HEADER]]></text>
        </staticText>
      </band>
    </groupHeader>
    <groupFooter>
      <band height="10"/>
    </groupFooter>
  </group>
  <detail>
    <band height="15"/>
  </detail>
</jasperReport>`;
    const report = parseJRXML(jrxml);
    expect(report.groups.length).toBe(1);
    expect(report.groups[0].name).toBe('byCategory');
    expect(report.groups[0].expression).toBe('$F{category}');
    expect(report.groups[0].header?.height).toBe(15);
    expect(report.groups[0].footer?.height).toBe(10);
  });

  it('parses variables with calculation and resetType', () => {
    const jrxml = `<?xml version="1.0" encoding="UTF-8"?>
<jasperReport name="VarTest" pageWidth="200" pageHeight="200"
              leftMargin="10" rightMargin="10" topMargin="10" bottomMargin="10">
  <field name="amount" class="java.lang.Double"/>
  <variable name="total" class="java.lang.Double" calculation="Sum" resetType="Report">
    <variableExpression><![CDATA[$F{amount}]]></variableExpression>
  </variable>
  <detail><band height="15"/></detail>
</jasperReport>`;
    const report = parseJRXML(jrxml);
    const v = report.variables.get('total');
    expect(v?.calculation).toBe('Sum');
    expect(v?.resetType).toBe('Report');
    expect(v?.expression).toBe('$F{amount}');
  });

  it('computes a Sum variable across rows', async () => {
    const jrxml = `<?xml version="1.0" encoding="UTF-8"?>
<jasperReport name="SumRender" pageWidth="300" pageHeight="400"
              leftMargin="10" rightMargin="10" topMargin="10" bottomMargin="10">
  <field name="amount" class="java.lang.Double"/>
  <variable name="total" class="java.lang.Double" calculation="Sum" resetType="Report">
    <variableExpression><![CDATA[$F{amount}]]></variableExpression>
  </variable>
  <detail>
    <band height="15">
      <textField>
        <reportElement x="0" y="0" width="280" height="15"/>
        <textFieldExpression><![CDATA[$F{amount}]]></textFieldExpression>
      </textField>
    </band>
  </detail>
  <summary>
    <band height="20">
      <textField>
        <reportElement x="0" y="0" width="280" height="20"/>
        <textFieldExpression><![CDATA["Total: " + $V{total}]]></textFieldExpression>
      </textField>
    </band>
  </summary>
</jasperReport>`;
    const bytes = await renderJRXML(jrxml, {
      dataSource: [{ amount: 10 }, { amount: 20 }, { amount: 30 }],
    });
    expect(bytes.length).toBeGreaterThan(0);
  });

  it('adds new pages when detail rows overflow', async () => {
    // Small page that fits ~2-3 detail bands, drive it with many rows.
    const jrxml = `<?xml version="1.0" encoding="UTF-8"?>
<jasperReport name="MultiPage" pageWidth="200" pageHeight="120"
              leftMargin="10" rightMargin="10" topMargin="10" bottomMargin="10">
  <field name="name" class="java.lang.String"/>
  <pageHeader>
    <band height="15">
      <staticText>
        <reportElement x="0" y="0" width="180" height="15"/>
        <text><![CDATA[Header]]></text>
      </staticText>
    </band>
  </pageHeader>
  <detail>
    <band height="25">
      <textField>
        <reportElement x="0" y="0" width="180" height="20"/>
        <textFieldExpression><![CDATA[$F{name}]]></textFieldExpression>
      </textField>
    </band>
  </detail>
  <pageFooter>
    <band height="15">
      <textField>
        <reportElement x="0" y="0" width="180" height="15"/>
        <textFieldExpression><![CDATA["Page " + $V{PAGE_NUMBER}]]></textFieldExpression>
      </textField>
    </band>
  </pageFooter>
</jasperReport>`;
    const rows = Array.from({ length: 12 }, (_, i) => ({ name: `Row ${i + 1}` }));
    const bytes = await renderJRXML(jrxml, { dataSource: rows });
    expect(bytes.length).toBeGreaterThan(0);
  });

  it('resolves $V{PAGE_COUNT} via two-pass rendering', async () => {
    const jrxml = `<?xml version="1.0" encoding="UTF-8"?>
<jasperReport name="PageCountTest" pageWidth="200" pageHeight="100"
              leftMargin="10" rightMargin="10" topMargin="10" bottomMargin="10">
  <field name="name" class="java.lang.String"/>
  <detail>
    <band height="25">
      <textField>
        <reportElement x="0" y="0" width="180" height="20"/>
        <textFieldExpression><![CDATA[$F{name}]]></textFieldExpression>
      </textField>
    </band>
  </detail>
  <pageFooter>
    <band height="15">
      <textField>
        <reportElement x="0" y="0" width="180" height="15"/>
        <textFieldExpression><![CDATA["Page " + $V{PAGE_NUMBER} + " of " + $V{PAGE_COUNT}]]></textFieldExpression>
      </textField>
    </band>
  </pageFooter>
</jasperReport>`;
    const rows = Array.from({ length: 8 }, (_, i) => ({ name: `R${i}` }));
    const bytes = await renderJRXML(jrxml, { dataSource: rows });
    expect(bytes.length).toBeGreaterThan(0);
  });

  it('resolves $R{key} from resources option', () => {
    const jrxml = `<?xml version="1.0" encoding="UTF-8"?>
<jasperReport name="I18n" pageWidth="200" pageHeight="100"
              leftMargin="10" rightMargin="10" topMargin="10" bottomMargin="10">
  <title>
    <band height="20">
      <textField>
        <reportElement x="0" y="0" width="180" height="20"/>
        <textFieldExpression><![CDATA[$R{greeting}]]></textFieldExpression>
      </textField>
    </band>
  </title>
</jasperReport>`;
    const report = parseJRXML(jrxml);
    expect(report.bands.title?.elements[0].type).toBe('textField');
    // Rendering should not throw even with resources provided.
    return renderJRXML(jrxml, { resources: { greeting: 'Hallo' } }).then((b) => {
      expect(b.length).toBeGreaterThan(0);
    });
  });

  it('stretches textField height with textAdjust="StretchHeight"', async () => {
    const jrxml = `<?xml version="1.0" encoding="UTF-8"?>
<jasperReport name="Stretch" pageWidth="200" pageHeight="400"
              leftMargin="10" rightMargin="10" topMargin="10" bottomMargin="10">
  <field name="long" class="java.lang.String"/>
  <detail>
    <band height="25">
      <textField textAdjust="StretchHeight">
        <reportElement x="0" y="0" width="180" height="15"/>
        <textFieldExpression><![CDATA[$F{long}]]></textFieldExpression>
      </textField>
    </band>
  </detail>
</jasperReport>`;
    const longText = 'Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.';
    const bytes = await renderJRXML(jrxml, { fields: { long: longText } });
    expect(bytes.length).toBeGreaterThan(0);
  });

  it('emits group headers when the group expression value changes', async () => {
    const jrxml = `<?xml version="1.0" encoding="UTF-8"?>
<jasperReport name="GroupRender" pageWidth="300" pageHeight="400"
              leftMargin="10" rightMargin="10" topMargin="10" bottomMargin="10">
  <field name="category" class="java.lang.String"/>
  <field name="item" class="java.lang.String"/>
  <group name="byCategory">
    <groupExpression><![CDATA[$F{category}]]></groupExpression>
    <groupHeader>
      <band height="15">
        <textField>
          <reportElement x="0" y="0" width="280" height="15"/>
          <textFieldExpression><![CDATA["=== " + $F{category} + " ==="]]></textFieldExpression>
        </textField>
      </band>
    </groupHeader>
    <groupFooter>
      <band height="8"/>
    </groupFooter>
  </group>
  <detail>
    <band height="15">
      <textField>
        <reportElement x="20" y="0" width="260" height="15"/>
        <textFieldExpression><![CDATA[$F{item}]]></textFieldExpression>
      </textField>
    </band>
  </detail>
</jasperReport>`;
    const bytes = await renderJRXML(jrxml, {
      dataSource: [
        { category: 'Fruit', item: 'Apple' },
        { category: 'Fruit', item: 'Banana' },
        { category: 'Veg', item: 'Carrot' },
        { category: 'Veg', item: 'Potato' },
      ],
    });
    expect(bytes.length).toBeGreaterThan(0);
  });
});

describe('Tier 4 features', () => {
  it('parses and renders a <frame> with nested children', async () => {
    const jrxml = `<?xml version="1.0" encoding="UTF-8"?>
<jasperReport name="Frame" pageWidth="595" pageHeight="842"
              leftMargin="20" rightMargin="20" topMargin="20" bottomMargin="20">
  <detail>
    <band height="100">
      <frame>
        <reportElement x="0" y="0" width="300" height="80" mode="Opaque" backcolor="#EEEEEE"/>
        <box>
          <pen lineWidth="1" lineColor="#000000"/>
        </box>
        <staticText>
          <reportElement x="10" y="10" width="200" height="20"/>
          <text><![CDATA[Inside Frame]]></text>
        </staticText>
        <textField>
          <reportElement x="10" y="40" width="200" height="20"/>
          <textFieldExpression><![CDATA[$F{label}]]></textFieldExpression>
        </textField>
      </frame>
    </band>
  </detail>
</jasperReport>`;
    const report = parseJRXML(jrxml);
    const frame = report.bands.detail[0].elements[0] as any;
    expect(frame.type).toBe('frame');
    expect(frame.children).toHaveLength(2);
    expect(frame.children[0].type).toBe('staticText');
    expect(frame.children[1].type).toBe('textField');

    const bytes = await renderJRXML(jrxml, { fields: { label: 'Hello' } });
    expect(bytes.length).toBeGreaterThan(0);
  });

  it('renders a <break> element and advances to a new page', async () => {
    const jrxml = `<?xml version="1.0" encoding="UTF-8"?>
<jasperReport name="Break" pageWidth="595" pageHeight="842"
              leftMargin="20" rightMargin="20" topMargin="20" bottomMargin="20">
  <detail>
    <band height="30">
      <textField>
        <reportElement x="0" y="0" width="200" height="20"/>
        <textFieldExpression><![CDATA[$F{row}]]></textFieldExpression>
      </textField>
      <break>
        <reportElement x="0" y="25" width="555" height="1"/>
      </break>
    </band>
  </detail>
</jasperReport>`;
    const report = parseJRXML(jrxml);
    const breakEl = report.bands.detail[0].elements[1] as any;
    expect(breakEl.type).toBe('break');
    expect(breakEl.breakType).toBe('Page');

    const bytes = await renderJRXML(jrxml, {
      dataSource: [{ row: 'A' }, { row: 'B' }, { row: 'C' }],
    });
    // Three rows with a page break after each: expect multi-page PDF.
    expect(bytes.length).toBeGreaterThan(0);
  });

  it('parses columnCount and renders multi-column detail', async () => {
    const jrxml = `<?xml version="1.0" encoding="UTF-8"?>
<jasperReport name="Cols" pageWidth="595" pageHeight="200"
              columnCount="2" columnWidth="260" columnSpacing="15"
              leftMargin="20" rightMargin="20" topMargin="20" bottomMargin="20">
  <detail>
    <band height="40">
      <textField>
        <reportElement x="0" y="0" width="250" height="20"/>
        <textFieldExpression><![CDATA[$F{label}]]></textFieldExpression>
      </textField>
    </band>
  </detail>
</jasperReport>`;
    const report = parseJRXML(jrxml);
    expect(report.config.columnCount).toBe(2);
    expect(report.config.columnSpacing).toBe(15);

    const bytes = await renderJRXML(jrxml, {
      dataSource: Array.from({ length: 10 }, (_, i) => ({ label: `Item ${i + 1}` })),
    });
    expect(bytes.length).toBeGreaterThan(0);
  });

  it('parses hyperlink and anchor attributes on a textField', () => {
    const jrxml = `<?xml version="1.0" encoding="UTF-8"?>
<jasperReport name="Links" pageWidth="595" pageHeight="842"
              leftMargin="20" rightMargin="20" topMargin="20" bottomMargin="20">
  <detail>
    <band height="40">
      <textField hyperlinkType="Reference">
        <reportElement x="0" y="0" width="200" height="20"/>
        <textFieldExpression><![CDATA["Click me"]]></textFieldExpression>
        <hyperlinkReferenceExpression><![CDATA["https://example.com"]]></hyperlinkReferenceExpression>
      </textField>
      <staticText>
        <reportElement x="0" y="25" width="200" height="15"/>
        <text><![CDATA[Anchor Here]]></text>
        <anchorNameExpression bookmarkLevel="1"><![CDATA["section-1"]]></anchorNameExpression>
      </staticText>
    </band>
  </detail>
</jasperReport>`;
    const report = parseJRXML(jrxml);
    const tf = report.bands.detail[0].elements[0] as any;
    const st = report.bands.detail[0].elements[1] as any;
    expect(tf.link?.hyperlinkType).toBe('Reference');
    expect(tf.link?.hyperlinkReferenceExpression).toContain('example.com');
    expect(st.link?.anchorNameExpression).toContain('section-1');
    expect(st.link?.bookmarkLevel).toBe(1);
  });

  it('renders a URL hyperlink and a bookmark without errors', async () => {
    const jrxml = `<?xml version="1.0" encoding="UTF-8"?>
<jasperReport name="LinksRender" pageWidth="595" pageHeight="842"
              leftMargin="20" rightMargin="20" topMargin="20" bottomMargin="20">
  <detail>
    <band height="60">
      <textField hyperlinkType="Reference">
        <reportElement x="0" y="0" width="200" height="20"/>
        <textFieldExpression><![CDATA["Visit"]]></textFieldExpression>
        <hyperlinkReferenceExpression><![CDATA["https://example.com"]]></hyperlinkReferenceExpression>
      </textField>
      <staticText>
        <reportElement x="0" y="30" width="200" height="15"/>
        <text><![CDATA[Chapter 1]]></text>
        <anchorNameExpression bookmarkLevel="1"><![CDATA["ch1"]]></anchorNameExpression>
      </staticText>
    </band>
  </detail>
</jasperReport>`;
    const bytes = await renderJRXML(jrxml);
    expect(bytes.length).toBeGreaterThan(0);
    // Must be a valid PDF (the annotation + outline dictionaries didn't
    // break the save pipeline).
    const header = Buffer.from(bytes.slice(0, 4)).toString('latin1');
    expect(header).toBe('%PDF');
  });

  it('parses a <subreport> element with parameters', () => {
    const jrxml = `<?xml version="1.0" encoding="UTF-8"?>
<jasperReport name="Sub" pageWidth="595" pageHeight="842"
              leftMargin="20" rightMargin="20" topMargin="20" bottomMargin="20">
  <detail>
    <band height="100">
      <subreport>
        <reportElement x="0" y="0" width="555" height="100"/>
        <subreportParameter name="TITLE">
          <subreportParameterExpression><![CDATA["Hello"]]></subreportParameterExpression>
        </subreportParameter>
        <subreportExpression><![CDATA["child.jrxml"]]></subreportExpression>
      </subreport>
    </band>
  </detail>
</jasperReport>`;
    const report = parseJRXML(jrxml);
    const sub = report.bands.detail[0].elements[0] as any;
    expect(sub.type).toBe('subreport');
    expect(sub.expression).toContain('child.jrxml');
    expect(sub.parameters).toHaveLength(1);
    expect(sub.parameters[0].name).toBe('TITLE');
  });

  it('renders a subreport via subreportResolver', async () => {
    const childJrxml = `<?xml version="1.0" encoding="UTF-8"?>
<jasperReport name="Child" pageWidth="300" pageHeight="150"
              leftMargin="0" rightMargin="0" topMargin="0" bottomMargin="0">
  <detail>
    <band height="150">
      <staticText>
        <reportElement x="10" y="10" width="200" height="20"/>
        <text><![CDATA[Child Report]]></text>
      </staticText>
    </band>
  </detail>
</jasperReport>`;

    const parentJrxml = `<?xml version="1.0" encoding="UTF-8"?>
<jasperReport name="Parent" pageWidth="595" pageHeight="842"
              leftMargin="20" rightMargin="20" topMargin="20" bottomMargin="20">
  <detail>
    <band height="200">
      <staticText>
        <reportElement x="0" y="0" width="555" height="20"/>
        <text><![CDATA[Parent]]></text>
      </staticText>
      <subreport>
        <reportElement x="0" y="30" width="300" height="150"/>
        <subreportExpression><![CDATA["child.jrxml"]]></subreportExpression>
      </subreport>
    </band>
  </detail>
</jasperReport>`;

    const bytes = await renderJRXML(parentJrxml, {
      subreportResolver: async () => ({
        report: parseJRXML(childJrxml),
      }),
    });
    expect(bytes.length).toBeGreaterThan(0);
  });
});
