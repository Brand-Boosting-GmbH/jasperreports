/**
 * JRXML Expression Evaluator
 * 
 * Evaluates JasperReports expressions like $F{fieldName}, $P{paramName}, etc.
 */

export class ExpressionEvaluator {
  private fields: Record<string, any>;
  private parameters: Record<string, any>;
  private variables: Record<string, any>;
  private debug: boolean;

  constructor(
    fields: Record<string, any> = {},
    parameters: Record<string, any> = {},
    variables: Record<string, any> = {},
    debug: boolean = false
  ) {
    this.fields = fields;
    this.parameters = parameters;
    this.variables = variables;
    this.debug = debug;
  }

  private log(...args: any[]): void {
    if (this.debug) {
      console.log('[ExpressionEvaluator]', ...args);
    }
  }

  /**
   * Evaluate a JRXML expression
   * 
   * Supports:
   * - $F{fieldName} - Field references
   * - $P{paramName} - Parameter references
   * - $V{varName} - Variable references
   * - String concatenation with +
   * - String literals in quotes
   */
  evaluate(expression: string): any {
    if (!expression) return '';

    // Clean expression (remove CDATA wrapper)
    let expr = expression
      .replace(/<!\[CDATA\[/g, '')
      .replace(/\]\]>/g, '')
      .trim();

    this.log('Evaluating:', expr);

    // Handle field references: $F{fieldName}
    expr = expr.replace(/\$F\{(\w+)\}/g, (_match, fieldName) => {
      const value = this.fields[fieldName];
      this.log(`Field ${fieldName} =`, value);
      return value !== undefined && value !== null ? String(value) : '';
    });

    // Handle parameter references: $P{paramName}
    expr = expr.replace(/\$P\{(\w+)\}/g, (_match, paramName) => {
      const value = this.parameters[paramName];
      this.log(`Parameter ${paramName} =`, value);
      return value !== undefined && value !== null ? String(value) : '';
    });

    // Handle variable references: $V{varName}
    expr = expr.replace(/\$V\{(\w+)\}/g, (_match, varName) => {
      const value = this.variables[varName];
      this.log(`Variable ${varName} =`, value);
      return value !== undefined && value !== null ? String(value) : '';
    });

    // If expression still contains operators, try to evaluate concatenation
    if (expr.includes('+') || expr.includes('"') || expr.includes("'")) {
      try {
        const result = this.evaluateConcatenation(expr);
        this.log('Concatenation result:', result);
        return result;
      } catch (e) {
        this.log('Concatenation error:', e);
        return expr;
      }
    }

    return expr;
  }

  /**
   * Evaluate string concatenation expressions
   */
  private evaluateConcatenation(expr: string): string {
    const parts: string[] = [];
    let current = '';
    let inString = false;
    let stringChar = '';

    for (let i = 0; i < expr.length; i++) {
      const char = expr[i];

      if (!inString && (char === '"' || char === "'")) {
        inString = true;
        stringChar = char;
      } else if (inString && char === stringChar) {
        inString = false;
        stringChar = '';
      } else if (!inString && char === '+') {
        if (current.trim()) {
          parts.push(current.trim());
        }
        current = '';
        continue;
      }

      current += char;
    }

    if (current.trim()) {
      parts.push(current.trim());
    }

    // Evaluate each part
    return parts.map(part => {
      part = part.trim();
      // Remove surrounding quotes
      if ((part.startsWith('"') && part.endsWith('"')) ||
          (part.startsWith("'") && part.endsWith("'"))) {
        return part.slice(1, -1);
      }
      return part;
    }).join('');
  }

  /**
   * Update field values
   */
  setFields(fields: Record<string, any>): void {
    this.fields = { ...this.fields, ...fields };
  }

  /**
   * Update parameter values
   */
  setParameters(parameters: Record<string, any>): void {
    this.parameters = { ...this.parameters, ...parameters };
  }

  /**
   * Update variable values
   */
  setVariables(variables: Record<string, any>): void {
    this.variables = { ...this.variables, ...variables };
  }
}
