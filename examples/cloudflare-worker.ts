/**
 * Example: Using jrxml-lite in a Cloudflare Worker
 * 
 * This example shows how to render a JRXML template to PDF
 * in response to an HTTP request.
 */

import { renderJRXML } from 'jasperreports';

interface RenderRequest {
  jrxml: string;
  fields: Record<string, any>;
  images?: Record<string, string>; // Map of image key -> URL or base64
}

export default {
  async fetch(request: Request): Promise<Response> {
    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
        },
      });
    }

    if (request.method !== 'POST') {
      return new Response('Method not allowed', { status: 405 });
    }

    try {
      const body = await request.json() as RenderRequest;

      if (!body.jrxml) {
        return Response.json(
          { error: 'Missing "jrxml" field' },
          { status: 400 }
        );
      }

      // Render PDF
      const pdfBytes = await renderJRXML(body.jrxml, {
        fields: body.fields || {},
        imageResolver: async (path) => {
          // Look up image in provided map
          const imageSource = body.images?.[path];
          if (!imageSource) return null;

          // Handle base64 data URLs
          if (imageSource.startsWith('data:')) {
            const base64 = imageSource.replace(/^data:[^;]+;base64,/, '');
            return Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
          }

          // Handle URLs
          if (imageSource.startsWith('http')) {
            const res = await fetch(imageSource);
            if (!res.ok) return null;
            return new Uint8Array(await res.arrayBuffer());
          }

          return null;
        },
      });

      return new Response(pdfBytes, {
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': 'attachment; filename="document.pdf"',
          'Access-Control-Allow-Origin': '*',
        },
      });
    } catch (error: any) {
      console.error('Render error:', error);
      return Response.json(
        { error: 'Render failed', message: error.message },
        { status: 500 }
      );
    }
  },
};

/* ============================================================
 * Example client usage:
 * 
 * const response = await fetch('https://your-worker.workers.dev', {
 *   method: 'POST',
 *   headers: { 'Content-Type': 'application/json' },
 *   body: JSON.stringify({
 *     jrxml: '<jasperReport>...</jasperReport>',
 *     fields: {
 *       Vorname: 'Max',
 *       Nachname: 'Mustermann',
 *       Datum: '2025-01-15',
 *       KosmosLogo_Pfad: 'logo',
 *     },
 *     images: {
 *       logo: 'https://example.com/logo.png',
 *     },
 *   }),
 * });
 * 
 * const pdfBlob = await response.blob();
 * // Download or display the PDF
 * ============================================================ */
