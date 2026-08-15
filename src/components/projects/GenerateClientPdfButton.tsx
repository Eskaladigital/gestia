'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/Button';

interface Props {
  projectId: string;
  projectName: string;
}

const TONE_LABELS: Record<string, string> = {
  tone_formality: 'Formalidad',
  tone_proximity: 'Proximidad',
  tone_emotion: 'Emoción',
  tone_humor: 'Humor',
  tone_disruption: 'Disrupción',
};

const CLIENT_TYPE_LABELS: Record<string, string> = {
  premium: 'Premium',
  medio: 'Medio',
  low_cost: 'Low cost',
  b2b: 'B2B',
  b2c: 'B2C',
};

const GOAL_LABELS: Record<string, string> = {
  ventas: 'Ventas',
  leads: 'Leads',
  branding: 'Branding',
  viralidad: 'Viralidad',
  comunidad: 'Comunidad',
};

const FORMAT_LABELS: Record<string, string> = {
  story: 'Stories',
  carrusel: 'Carruseles',
  publicacion: 'Publicaciones',
  reel: 'Reels',
};

const CONTENT_TYPE_LABELS: Record<string, string> = {
  educativo: 'Educativo',
  inspiracional: 'Inspiracional',
  comercial: 'Comercial',
  entretenimiento: 'Entretenimiento',
  personal: 'Personal',
  corporativo: 'Corporativo',
};

const MEDIA_TYPE_LABELS: Record<string, string> = {
  imagen: 'Imagen',
  video: 'Video',
};

function sanitizeText(text: string | null | undefined): string {
  if (!text) return '';
  return (
    text
      .replace(/\p{Emoji_Presentation}/gu, '')
      .replace(/\p{Extended_Pictographic}/gu, '')
      .replace(/[\u{FE00}-\u{FE0F}\u{200D}\u{20E3}]/gu, '')
      .replace(/[→⇒]/g, '->')
      .replace(/[←⇐]/g, '<-')
      .replace(/[↔]/g, '<->')
      .replace(/[—–−]/g, '-')
      .replace(/[“”„«»]/g, '"')
      .replace(/[‘’]/g, "'")
      .replace(/[…]/g, '...')
      .replace(/[•]/g, '-')
      .replace(/[×]/g, 'x')
      .replace(/[^\t\n\r\x20-\x7E\u00A0-\u00FF]/g, '')
      .replace(/\r\n/g, '\n')
      .replace(/[ \t]{2,}/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim()
  );
}

function splitParagraphs(text: string): string[] {
  return text
    .split(/\n{2,}/)
    .map((p) => p.replace(/[ \t]+\n/g, '\n').trim())
    .filter(Boolean);
}

export function GenerateClientPdfButton({ projectId, projectName }: Props) {
  const [loading, setLoading] = useState(false);

  async function handleGenerate() {
    setLoading(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/client-report`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(
          typeof body.error === 'string' && body.error
            ? body.error
            : `Error al obtener datos (${res.status})`
        );
      }
      const data = await res.json();

      const { jsPDF } = await import('jspdf');
      const autoTableModule = await import('jspdf-autotable');
      const autoTable = autoTableModule.default;

      const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      // Interlineado global (jspdf-autotable no admite lineHeight por celda:
      // usa el lineHeightFactor del documento jsPDF).
      doc.setLineHeightFactor(1.45);
      const pageW = doc.internal.pageSize.getWidth();
      const pageH = doc.internal.pageSize.getHeight();
      const margin = 22;
      const contentW = pageW - margin * 2;
      const FOOTER_RESERVE = 22;
      const HEADER_TOP = 20;
      let y = 0;

      const BRAND: [number, number, number] = [41, 98, 255];
      const BRAND_LIGHT: [number, number, number] = [240, 244, 255];
      const DARK: [number, number, number] = [30, 41, 59];
      const GRAY: [number, number, number] = [100, 116, 139];
      const MUTED: [number, number, number] = [71, 85, 105];
      const LIGHT_BG: [number, number, number] = [248, 250, 252];
      const BORDER: [number, number, number] = [226, 232, 240];

      const BODY_SIZE = 9.5;
      const BODY_LEAD = 6.0;
      const SMALL_SIZE = 8.5;
      const SMALL_LEAD = 5.4;
      const PARA_GAP = 5;
      const BLOCK_GAP = 9;
      const SECTION_GAP = 14;

      const dateStr = new Date().toLocaleDateString('es-ES', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });

      function checkPage(needed: number) {
        if (y + needed > pageH - FOOTER_RESERVE) {
          doc.addPage();
          y = HEADER_TOP;
        }
      }

      function drawLines(
        lines: string[],
        x: number,
        width: number,
        opts?: { size?: number; lead?: number; justify?: boolean; color?: [number, number, number]; font?: 'normal' | 'bold' | 'italic' }
      ) {
        const size = opts?.size ?? BODY_SIZE;
        const lead = opts?.lead ?? BODY_LEAD;
        const color = opts?.color ?? DARK;
        doc.setFontSize(size);
        doc.setFont('helvetica', opts?.font ?? 'normal');
        doc.setTextColor(color[0], color[1], color[2]);
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          if (!line) {
            y += lead * 0.5;
            continue;
          }
          checkPage(lead + 1);
          const justify = Boolean(opts?.justify) && lines.length > 1 && i < lines.length - 1 && !/^\s*[-*]\s/.test(line);
          if (justify) {
            doc.text(line, x, y, { align: 'justify', maxWidth: width });
          } else {
            doc.text(line, x, y);
          }
          y += lead;
        }
      }

      function drawParagraphs(
        text: string,
        opts?: { x?: number; width?: number; size?: number; lead?: number; justify?: boolean; color?: [number, number, number] }
      ) {
        const x = opts?.x ?? margin;
        const width = opts?.width ?? contentW;
        const size = opts?.size ?? BODY_SIZE;
        const lead = opts?.lead ?? BODY_LEAD;
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(size);

        const paras = splitParagraphs(text);
        paras.forEach((para, idx) => {
          const rawLines = para.split('\n').map((l) => l.trim()).filter(Boolean);
          const hasBullets = rawLines.some((l) => /^[-*]\s+/.test(l));
          if (hasBullets) {
            for (const raw of rawLines) {
              if (/^[-*]\s+/.test(raw)) {
                const item = raw.replace(/^[-*]\s+/, '').trim();
                const wrapped = doc.splitTextToSize(item, width - 6) as string[];
                checkPage(lead + 1);
                doc.setFillColor(BRAND[0], BRAND[1], BRAND[2]);
                doc.circle(x + 1.2, y - 1.2, 0.8, 'F');
                drawLines(wrapped, x + 6, width - 6, { size, lead, justify: false, color: opts?.color });
                y += 2.5;
              } else {
                const wrapped = doc.splitTextToSize(raw, width) as string[];
                drawLines(wrapped, x, width, { size, lead, justify: false, color: opts?.color, font: 'bold' });
                y += 2.5;
              }
            }
          } else {
            const flat = para.replace(/\n/g, ' ').replace(/\s{2,}/g, ' ').trim();
            const wrapped = doc.splitTextToSize(flat, width) as string[];
            drawLines(wrapped, x, width, {
              size,
              lead,
              justify: opts?.justify !== false,
              color: opts?.color,
            });
          }
          if (idx < paras.length - 1) y += PARA_GAP;
        });
      }

      function sectionTitle(title: string) {
        checkPage(26);
        y += SECTION_GAP;
        doc.setDrawColor(BRAND[0], BRAND[1], BRAND[2]);
        doc.setLineWidth(1.8);
        doc.line(margin, y - 3, margin, y + 5);

        doc.setFontSize(13);
        doc.setTextColor(BRAND[0], BRAND[1], BRAND[2]);
        doc.setFont('helvetica', 'bold');
        doc.text(title, margin + 5.5, y + 2.5);
        y += 14;
      }

      function labelValue(label: string, value: string | null | undefined, style: 'normal' | 'card' = 'normal') {
        if (!value) return;
        const clean = sanitizeText(value);
        if (!clean) return;

        const boxed = style === 'card';
        const padX = boxed ? 6 : 0;
        const textW = contentW - padX * 2;

        checkPage(20);

        doc.setFontSize(7.5);
        doc.setTextColor(GRAY[0], GRAY[1], GRAY[2]);
        doc.setFont('helvetica', 'bold');
        doc.text(label.toUpperCase(), margin + padX, y);
        y += 6.5;

        const yBeforeBody = y;
        drawParagraphs(clean, {
          x: margin + padX,
          width: textW,
          size: BODY_SIZE,
          lead: BODY_LEAD,
          justify: true,
          color: DARK,
        });

        if (boxed) {
          const barH = Math.max(y - yBeforeBody + 3, 6);
          doc.setFillColor(BRAND[0], BRAND[1], BRAND[2]);
          doc.rect(margin, yBeforeBody - 4, 2, barH + 2, 'F');
        }

        y += BLOCK_GAP;
      }

      // ========== PORTADA ==========
      doc.setFillColor(BRAND_LIGHT[0], BRAND_LIGHT[1], BRAND_LIGHT[2]);
      doc.rect(0, 0, pageW, pageH * 0.45, 'F');
      
      doc.setFillColor(BRAND[0], BRAND[1], BRAND[2]);
      doc.rect(0, pageH * 0.45, pageW, 2, 'F');

      y = pageH * 0.2;
      doc.setTextColor(BRAND[0], BRAND[1], BRAND[2]);
      doc.setFontSize(11);
      doc.setFont('helvetica', 'bold');
      doc.text('INFORME ESTRATEGICO Y CALENDARIO', margin, y);
      y += 20;

      doc.setTextColor(DARK[0], DARK[1], DARK[2]);
      doc.setFontSize(28);
      const titleLines = doc.splitTextToSize(sanitizeText(data.project.name), contentW) as string[];
      drawLines(titleLines, margin, contentW, { size: 28, lead: 13, justify: false, color: DARK, font: 'bold' });
      y += 12;

      doc.setFontSize(12);
      doc.setTextColor(GRAY[0], GRAY[1], GRAY[2]);
      doc.setFont('helvetica', 'normal');
      doc.text('Estrategia integral de Redes Sociales', margin, y);

      doc.setFontSize(10);
      doc.setTextColor(GRAY[0], GRAY[1], GRAY[2]);
      doc.text(`Fecha de generación: ${dateStr}`, margin, pageH - 30);
      
      if (data.project.url) {
        doc.setTextColor(BRAND[0], BRAND[1], BRAND[2]);
        doc.text(data.project.url, margin, pageH - 24);
      }

      // ========== NUEVA PÁGINA ==========
      doc.addPage();
      y = HEADER_TOP;

      // ========== DATOS GENERALES ==========
      sectionTitle('Resumen del Proyecto');
      labelValue('Sector', data.project.sector);
      labelValue('Ubicación', data.project.location);
      labelValue('Descripción', data.project.description, 'card');
      if (data.project.monthly_fee != null && Number(data.project.monthly_fee) > 0) {
        labelValue(
          'Honorarios mensuales',
          new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(
            Number(data.project.monthly_fee)
          )
        );
      }
      
      checkPage(40);
      autoTable(doc, {
        startY: y,
        margin: { left: margin, right: margin },
        head: [['Variable Estratégica', 'Valor']],
        body: [
          ['Tipo de cliente', sanitizeText(CLIENT_TYPE_LABELS[data.project.client_type] || data.project.client_type) || '-'],
          ['Objetivo principal', sanitizeText(GOAL_LABELS[data.project.primary_goal] || data.project.primary_goal) || '-'],
          ['Objetivos secundarios', data.project.secondary_goals?.map((g: string) => GOAL_LABELS[g] || g).join(', ') || '-'],
          ['Nivel comercial', sanitizeText(data.project.commercial_level) || '-'],
          ['Complejidad', sanitizeText(data.project.complexity) || '-'],
          ['Presencia humana', sanitizeText(data.project.human_presence) || '-'],
          ['Experimentación', sanitizeText(data.project.experimentation) || '-'],
        ],
        theme: 'plain',
        styles: { fontSize: 9, textColor: DARK, cellPadding: { top: 4, right: 5, bottom: 4, left: 4 }, valign: 'middle' },
        headStyles: { textColor: GRAY, fontStyle: 'bold', fontSize: 7.5 },
        columnStyles: { 0: { fontStyle: 'bold', cellWidth: 58 } },
      });
      y = (doc as any).lastAutoTable.finalY + 12;

      // ========== TONO ==========
      sectionTitle('Perfil de Tono de Voz');
      const toneKeys = ['tone_formality', 'tone_proximity', 'tone_emotion', 'tone_humor', 'tone_disruption'] as const;
      for (const tk of toneKeys) {
        const val = data.project[tk] ?? 50;
        checkPage(16);
        doc.setFontSize(9);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(DARK[0], DARK[1], DARK[2]);
        doc.text(TONE_LABELS[tk], margin, y);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(GRAY[0], GRAY[1], GRAY[2]);
        doc.text(`${val}%`, margin + 40, y);

        doc.setFillColor(LIGHT_BG[0], LIGHT_BG[1], LIGHT_BG[2]);
        doc.roundedRect(margin + 54, y - 2.8, 100, 4, 1.8, 1.8, 'F');

        if (val > 0) {
          doc.setFillColor(BRAND[0], BRAND[1], BRAND[2]);
          doc.roundedRect(margin + 54, y - 2.8, (val / 100) * 100, 4, 1.8, 1.8, 'F');
        }
        y += 13;
      }
      y += 5;

      // ========== DISTRIBUCIÓN SEMANAL ==========
      const dist = data.project.weekly_format_distribution;
      if (dist) {
        sectionTitle('Distribución Semanal');
        const totalPosts = (dist.story || 0) + (dist.carrusel || 0) + (dist.publicacion || 0) + (dist.reel || 0);
        
        checkPage(20);
        doc.setFontSize(10);
        doc.setTextColor(MUTED[0], MUTED[1], MUTED[2]);
        doc.setFont('helvetica', 'normal');
        doc.text(`Total: ${totalPosts} publicaciones a la semana`, margin, y);
        y += 9;

        const bodyDist = [];
        for (const [key, label] of Object.entries(FORMAT_LABELS)) {
          if (dist[key] != null && dist[key] > 0) {
            bodyDist.push([label, `${dist[key]} / sem`]);
          }
        }
        
        if (bodyDist.length > 0) {
          autoTable(doc, {
            startY: y,
            margin: { left: margin, right: margin },
            body: bodyDist,
            theme: 'grid',
            styles: { fontSize: 9, textColor: DARK, cellPadding: { top: 4, right: 5, bottom: 4, left: 5 }, lineColor: BORDER, lineWidth: 0.1, valign: 'middle' },
            columnStyles: { 0: { fontStyle: 'bold', fillColor: LIGHT_BG } },
          });
          y = (doc as any).lastAutoTable.finalY + 12;
        }
      }

      // ========== ESTILO DE CONTENIDO ==========
      const cstyle = data.project.content_style;
      if (cstyle && typeof cstyle === 'object') {
        const entries = Object.entries(cstyle as Record<string, number>).filter(([, v]) => v > 0);
        if (entries.length > 0) {
          sectionTitle('Estilo de Contenido (pesos)');
          for (const [key, val] of entries) {
            const label = CONTENT_TYPE_LABELS[key] || key;
            checkPage(16);
            doc.setFontSize(9);
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(DARK[0], DARK[1], DARK[2]);
            doc.text(label, margin, y);
            doc.setFont('helvetica', 'normal');
            doc.setTextColor(GRAY[0], GRAY[1], GRAY[2]);
            doc.text(`${val}%`, margin + 40, y);
            doc.setFillColor(LIGHT_BG[0], LIGHT_BG[1], LIGHT_BG[2]);
            doc.roundedRect(margin + 54, y - 2.8, 100, 4, 1.8, 1.8, 'F');
            if (val > 0) {
              doc.setFillColor(BRAND[0], BRAND[1], BRAND[2]);
              doc.roundedRect(margin + 54, y - 2.8, (val / 100) * 100, 4, 1.8, 1.8, 'F');
            }
            y += 13;
          }
          y += 5;
        }
      }

      // ========== REGLAS IA PERSONALIZADAS ==========
      if (data.project.ai_rules && typeof data.project.ai_rules === 'string' && data.project.ai_rules.trim()) {
        sectionTitle('Reglas IA Personalizadas');
        labelValue('Instrucciones adicionales para la IA', data.project.ai_rules.trim(), 'card');
      }

      // ========== IDENTIDAD VISUAL ==========
      if (data.project.brand_summary || data.project.brand_colors?.length || data.project.brand_fonts?.length) {
        sectionTitle('Identidad Visual');
        labelValue('Resumen de marca', data.project.brand_summary, 'card');

        if (data.project.brand_colors?.length) {
          checkPage(20);
          doc.setFontSize(9);
          doc.setTextColor(GRAY[0], GRAY[1], GRAY[2]);
          doc.setFont('helvetica', 'bold');
          doc.text('PALETA DE COLORES', margin, y);
          y += 6;
          
          for (const c of data.project.brand_colors) {
            checkPage(22);
            const hex = c.hex || '#000';
            const r = parseInt(hex.slice(1, 3), 16) || 0;
            const g = parseInt(hex.slice(3, 5), 16) || 0;
            const b = parseInt(hex.slice(5, 7), 16) || 0;

            doc.setFillColor(r, g, b);
            doc.setDrawColor(BORDER[0], BORDER[1], BORDER[2]);
            doc.circle(margin + 6, y + 4, 5, 'FD');

            const colorLabel = [
              hex.toUpperCase(),
              sanitizeText(c.name) || '',
            ].filter(Boolean).join(' - ');
            doc.setFontSize(9);
            doc.setTextColor(DARK[0], DARK[1], DARK[2]);
            doc.setFont('helvetica', 'bold');
            doc.text(colorLabel, margin + 14, y + 2);

            const colorDetail = [sanitizeText(c.usage), sanitizeText(c.notes)].filter(Boolean).join(' · ');
            if (colorDetail) {
              y += 6;
              drawParagraphs(colorDetail, {
                x: margin + 14,
                width: contentW - 20,
                size: SMALL_SIZE,
                lead: SMALL_LEAD,
                justify: false,
                color: GRAY,
              });
              y += 3;
            } else {
              y += 11;
            }
          }
          y += 4;
        }

        if (data.project.brand_fonts?.length) {
          checkPage(15);
          doc.setFontSize(9);
          doc.setTextColor(GRAY[0], GRAY[1], GRAY[2]);
          doc.setFont('helvetica', 'bold');
          doc.text('TIPOGRAFÍAS', margin, y);
          y += 6;
          for (const f of data.project.brand_fonts) {
            checkPage(8);
            doc.setFontSize(10);
            doc.setTextColor(DARK[0], DARK[1], DARK[2]);
            doc.setFont('helvetica', 'bold');
            doc.text(sanitizeText(f.name), margin, y);
            
            doc.setFontSize(9);
            doc.setFont('helvetica', 'normal');
            doc.setTextColor(GRAY[0], GRAY[1], GRAY[2]);
            const info = [sanitizeText(f.usage), sanitizeText(f.weights)].filter(Boolean).join(' - ');
            if (info) {
              const tlines = doc.splitTextToSize(info, contentW - 50);
              doc.text(tlines, margin + 50, y);
              y += Math.max(tlines.length * 4.5, 6);
            } else {
              y += 6;
            }
          }
          y += 4;
        }

        if (data.project.brand_identity_detail) {
          const bid = data.project.brand_identity_detail;
          if (bid.palette_analysis || bid.typography_analysis || bid.layout_components) {
            checkPage(20);
            y += 4;
            labelValue('Análisis Visual Detallado', [
              bid.palette_analysis ? `Paleta: ${sanitizeText(bid.palette_analysis)}` : '',
              bid.typography_analysis ? `Tipografía: ${sanitizeText(bid.typography_analysis)}` : '',
              bid.layout_components ? `Layout: ${sanitizeText(bid.layout_components)}` : '',
            ].filter(Boolean).join('\n\n'), 'card');
          }
          if (bid.imagery_iconography) {
            labelValue('Imágenes e Iconografía', sanitizeText(bid.imagery_iconography), 'card');
          }
          if (bid.brand_feel_keywords?.length) {
            labelValue('Sensación de Marca (keywords)', bid.brand_feel_keywords.map((k: string) => sanitizeText(k)).join(', '));
          }
          if (bid.accessibility_notes) {
            labelValue('Notas de Accesibilidad', sanitizeText(bid.accessibility_notes));
          }
          if (bid.rrss_practical_tips?.length) {
            labelValue('Tips Prácticos para RRSS', bid.rrss_practical_tips.map((t: string) => `• ${sanitizeText(t)}`).join('\n'), 'card');
          }
          if (bid.dos?.length || bid.donts?.length) {
            checkPage(20);
            labelValue('Recomendaciones de Estilo (DOs & DONTs)', [
              bid.dos?.length ? `DOs:\n• ${bid.dos.map((d: string) => sanitizeText(d)).join('\n• ')}` : '',
              bid.donts?.length ? `\nDONTs:\n• ${bid.donts.map((d: string) => sanitizeText(d)).join('\n• ')}` : ''
            ].filter(Boolean).join('\n'), 'card');
          }
        }
      }

      // ========== ANÁLISIS WEB ==========
      const strat = data.strategy;
      if (strat) {
        sectionTitle('Estrategia de Marca');
        labelValue('Propuesta de valor', strat.value_proposition, 'card');
        labelValue('Público objetivo', strat.target_audience, 'card');
        labelValue('Posicionamiento', strat.positioning, 'card');

        let wsa = strat.web_site_analysis;
        if (typeof wsa === 'string') {
          try { wsa = JSON.parse(wsa); } catch { wsa = null; }
        }
        if (wsa && typeof wsa === 'object') {
          const a = (wsa as Record<string, unknown>).analysis || wsa;
          if (typeof a === 'object' && a !== null) {
            const an = a as Record<string, unknown>;
            if (typeof an.detailed_business_description === 'string') {
              labelValue('Contexto del Negocio', sanitizeText(an.detailed_business_description));
            }
            if (Array.isArray(an.key_services) && an.key_services.length) {
              labelValue('Servicios Detectados', (an.key_services as string[]).map(s => `• ${sanitizeText(s)}`).join('\n'));
            }
            if (Array.isArray(an.unique_selling_points) && an.unique_selling_points.length) {
              labelValue('Diferenciales', (an.unique_selling_points as string[]).map(s => `• ${sanitizeText(s)}`).join('\n'));
            }
          }
        }

        // ========== PILARES DE CONTENIDO ==========
        sectionTitle('Líneas y Pilares de Contenido');
        labelValue('Tono y Voz', strat.tone_guidelines, 'card');
        labelValue('Recomendaciones Estratégicas', strat.recommendations, 'card');

        const pillars = strat.content_pillars;
        if (Array.isArray(pillars) && pillars.length > 0) {
          checkPage(15);
          doc.setFontSize(10);
          doc.setTextColor(DARK[0], DARK[1], DARK[2]);
          doc.setFont('helvetica', 'bold');
          doc.text('PILARES PRINCIPALES', margin, y);
          y += 6;
          
          for (const p of pillars) {
            checkPage(24);
            doc.setFillColor(BRAND[0], BRAND[1], BRAND[2]);
            doc.rect(margin, y, 2.2, 9, 'F');
            const pTitle = `${sanitizeText(p.name)}${p.percentage ? `  (${p.percentage}%)` : ''}`;
            doc.setFontSize(11);
            doc.setTextColor(BRAND[0], BRAND[1], BRAND[2]);
            doc.setFont('helvetica', 'bold');
            doc.text(pTitle, margin + 6, y + 6);
            y += 12;

            const pDesc = sanitizeText(p.description) || '';
            if (pDesc) {
              drawParagraphs(pDesc, { size: BODY_SIZE, lead: BODY_LEAD, justify: true });
            }
            if (Array.isArray(p.example_topics) && p.example_topics.length) {
              y += 3;
              drawParagraphs(`Temas: ${p.example_topics.map((t: string) => sanitizeText(t)).join(', ')}`, {
                size: SMALL_SIZE,
                lead: SMALL_LEAD,
                justify: false,
                color: GRAY,
              });
            }
            y += BLOCK_GAP + 2;
          }
        }
      }

      // ========== ANÁLISIS IA DE COMPETIDORES (detallado) ==========
      if (strat) {
        let compAn = strat.competitor_analysis;
        if (typeof compAn === 'string') { try { compAn = JSON.parse(compAn); } catch { compAn = null; } }
        if (compAn && typeof compAn === 'object') {
          const ca = compAn as Record<string, unknown>;
          const comps = Array.isArray(ca.competitors) ? ca.competitors : [];
          if (comps.length > 0) {
            sectionTitle('Análisis IA de Competidores');
            for (const comp of comps as Record<string, unknown>[]) {
              checkPage(30);
              doc.setFontSize(10);
              doc.setFont('helvetica', 'bold');
              doc.setTextColor(BRAND[0], BRAND[1], BRAND[2]);
              doc.text(sanitizeText(comp.name as string) || 'Competidor', margin, y);
              y += 7.5;
              if (Array.isArray(comp.strengths) && comp.strengths.length) {
                labelValue('Fortalezas', (comp.strengths as string[]).map(s => `• ${sanitizeText(s)}`).join('\n'));
              }
              if (Array.isArray(comp.weaknesses) && comp.weaknesses.length) {
                labelValue('Debilidades', (comp.weaknesses as string[]).map(s => `• ${sanitizeText(s)}`).join('\n'));
              }
              if (comp.estimated_frequency) {
                labelValue('Frecuencia estimada', sanitizeText(comp.estimated_frequency as string));
              }
              if (comp.tone_detected) {
                labelValue('Tono detectado', sanitizeText(comp.tone_detected as string));
              }
              if (Array.isArray(comp.detected_content_types) && comp.detected_content_types.length) {
                labelValue('Tipos de contenido', (comp.detected_content_types as string[]).join(', '));
              }
            }
            if (Array.isArray(ca.market_opportunities) && ca.market_opportunities.length) {
              labelValue('Oportunidades de mercado', (ca.market_opportunities as string[]).map(s => `• ${sanitizeText(s)}`).join('\n'), 'card');
            }
            if (Array.isArray(ca.differentiation_ideas) && ca.differentiation_ideas.length) {
              labelValue('Ideas de diferenciación', (ca.differentiation_ideas as string[]).map(s => `• ${sanitizeText(s)}`).join('\n'), 'card');
            }
            if (Array.isArray(ca.content_gaps) && ca.content_gaps.length) {
              labelValue('Huecos de contenido', (ca.content_gaps as string[]).map(s => `• ${sanitizeText(s)}`).join('\n'), 'card');
            }
            if (typeof ca.recommendations === 'string' && ca.recommendations.trim()) {
              labelValue('Recomendaciones sobre competencia', sanitizeText(ca.recommendations), 'card');
            }
          }
        }
      }

      // ========== LÍNEAS TEMÁTICAS ==========
      if (strat) {
        let tl = strat.thematic_lines;
        if (typeof tl === 'string') { try { tl = JSON.parse(tl); } catch { tl = null; } }
        if (Array.isArray(tl) && tl.length > 0) {
          sectionTitle('Líneas Temáticas');
          for (const line of tl as Record<string, unknown>[]) {
            checkPage(24);
            const lTitle = sanitizeText(line.theme as string) || 'Linea';
            doc.setFillColor(BRAND[0], BRAND[1], BRAND[2]);
            doc.rect(margin, y, 2.2, 9, 'F');
            doc.setFontSize(11);
            doc.setTextColor(BRAND[0], BRAND[1], BRAND[2]);
            doc.setFont('helvetica', 'bold');
            doc.text(lTitle, margin + 6, y + 6);
            y += 12;

            const lDesc = sanitizeText(line.description as string) || '';
            if (lDesc) drawParagraphs(lDesc, { justify: true });
            if (line.frequency) {
              y += 2;
              drawParagraphs(`Frecuencia: ${sanitizeText(line.frequency as string)}`, {
                size: SMALL_SIZE,
                lead: SMALL_LEAD,
                justify: false,
                color: MUTED,
              });
            }
            if (Array.isArray(line.example_topics) && line.example_topics.length) {
              y += 2;
              drawParagraphs(`Temas: ${(line.example_topics as string[]).map((t) => sanitizeText(t)).join(', ')}`, {
                size: SMALL_SIZE,
                lead: SMALL_LEAD,
                justify: false,
                color: GRAY,
              });
            }
            y += BLOCK_GAP + 2;
          }
        }
      }

      // ========== COMPETIDORES ==========
      if (data.competitors.length > 0) {
        sectionTitle(`Competidores (${data.competitors.length})`);
        
        const compBody = data.competitors.map((comp: any) => [
          sanitizeText(comp.name),
          comp.url || '-',
          sanitizeText(comp.reason) || '-'
        ]);

        autoTable(doc, {
          startY: y,
          margin: { left: margin, right: margin },
          head: [['Competidor', 'Web', 'Motivo / Observaciones']],
          body: compBody,
          theme: 'grid',
          styles: { fontSize: 9, textColor: DARK, cellPadding: { top: 4, right: 4, bottom: 4, left: 4 }, lineColor: BORDER, lineWidth: 0.1, valign: 'top' },
          headStyles: { fillColor: LIGHT_BG, textColor: DARK, fontStyle: 'bold' },
          columnStyles: { 0: { fontStyle: 'bold', cellWidth: 40 }, 1: { textColor: BRAND, cellWidth: 45 } },
        });
        y = (doc as any).lastAutoTable.finalY + 10;
      }

      // ========== CALENDARIO ==========
      if (data.contentItems.length > 0) {
        doc.addPage();
        y = HEADER_TOP;
        sectionTitle('Calendario de Publicaciones');

        const formatCounts: Record<string, number> = {};
        for (const item of data.contentItems) {
          if (item.format) formatCounts[item.format] = (formatCounts[item.format] || 0) + 1;
        }

        const fmtSummary = Object.entries(formatCounts)
          .map(([k, v]) => `${FORMAT_LABELS[k] || k}: ${v}`)
          .join('   |   ');
        
        doc.setFontSize(10);
        doc.setTextColor(MUTED[0], MUTED[1], MUTED[2]);
        doc.setFont('helvetica', 'normal');
        doc.text(`Total: ${data.contentItems.length} publicaciones`, margin, y);
        y += 6.5;
        doc.setFontSize(9);
        doc.setTextColor(GRAY[0], GRAY[1], GRAY[2]);
        const fmtLines = doc.splitTextToSize(fmtSummary, contentW) as string[];
        drawLines(fmtLines, margin, contentW, { size: 9, lead: 5.2, justify: false, color: GRAY });
        y += 6;

        const groupedByMonth: Record<string, typeof data.contentItems> = {};
        for (const item of data.contentItems) {
          const d = new Date(item.scheduled_date);
          const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
          if (!groupedByMonth[key]) groupedByMonth[key] = [];
          groupedByMonth[key].push(item);
        }

        const monthNames = [
          'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
          'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
        ];

        for (const [monthKey, items] of Object.entries(groupedByMonth).sort()) {
          const [yearStr, monthStr] = monthKey.split('-');
          const monthLabel = `${monthNames[parseInt(monthStr) - 1]} ${yearStr}`.toUpperCase();

          checkPage(25);
          y += 5;
          
          doc.setFillColor(BRAND[0], BRAND[1], BRAND[2]);
          doc.roundedRect(margin, y, contentW, 8, 1, 1, 'F');
          doc.setFontSize(10);
          doc.setFont('helvetica', 'bold');
          doc.setTextColor(255, 255, 255);
          doc.text(monthLabel, margin + 4, y + 5.5);
          y += 10;

          const tableData = items.map((item: Record<string, unknown>) => {
            const d = new Date(item.scheduled_date as string);
            const dayLabel = d.toLocaleDateString('es-ES', { weekday: 'short', day: '2-digit' }).toUpperCase();
            const sp = item.production_specs as Record<string, unknown> | null;
            const specBits: string[] = [];
            if (sp) {
              if (sp.num_slides != null) specBits.push(`${sp.num_slides} slides`);
              if (sp.duration_seconds != null) specBits.push(`${sp.duration_seconds}s`);
              if (sp.media_type) specBits.push(MEDIA_TYPE_LABELS[sp.media_type as string] || (sp.media_type as string));
            }
            return [
              dayLabel,
              (FORMAT_LABELS[item.format as string] || (item.format as string) || '-').toUpperCase(),
              CONTENT_TYPE_LABELS[item.content_type as string] || (item.content_type as string),
              sanitizeText(String(item.idea || '')),
              specBits.join(' · ') || '-',
            ];
          });

          autoTable(doc, {
            startY: y,
            margin: { left: margin, right: margin },
            head: [['Fecha', 'Formato', 'Tipo', 'Idea Principal', 'Produccion']],
            body: tableData,
            theme: 'grid',
            styles: {
              fontSize: 8.5,
              cellPadding: { top: 3.8, right: 3, bottom: 3.8, left: 3 },
              textColor: DARK,
              lineColor: BORDER,
              lineWidth: 0.1,
              valign: 'top',
            },
            headStyles: {
              fillColor: LIGHT_BG,
              textColor: GRAY,
              fontStyle: 'bold',
              fontSize: 7.5,
            },
            columnStyles: {
              0: { cellWidth: 20, fontStyle: 'bold' },
              1: { cellWidth: 22, fontStyle: 'bold' },
              2: { cellWidth: 24 },
              3: { cellWidth: 'auto' },
              4: { cellWidth: 30 },
            },
          });

          y = (doc as any).lastAutoTable.finalY + 10;
        }

        doc.addPage();
        y = HEADER_TOP;
        sectionTitle('Contenido Detallado por Publicacion');

        const drawPostField = (lbl: string, value: string | null | undefined, opts?: { justify?: boolean }) => {
          const clean = sanitizeText(value);
          if (!clean) return;
          checkPage(18);
          doc.setFontSize(7.5);
          doc.setFont('helvetica', 'bold');
          doc.setTextColor(GRAY[0], GRAY[1], GRAY[2]);
          doc.text(lbl.toUpperCase(), margin + 3, y);
          y += 6;
          drawParagraphs(clean, {
            x: margin + 3,
            width: contentW - 6,
            size: BODY_SIZE,
            lead: BODY_LEAD,
            justify: opts?.justify !== false,
          });
          y += 6;
        };

        for (const item of data.contentItems) {
          const d = new Date(item.scheduled_date);
          const dayLabel = d.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
          const fmt = FORMAT_LABELS[item.format] || item.format || '-';
          const ctype = CONTENT_TYPE_LABELS[item.content_type] || item.content_type;

          checkPage(30);
          y += 5;
          doc.setFillColor(BRAND[0], BRAND[1], BRAND[2]);
          doc.roundedRect(margin, y, contentW, 10, 1.4, 1.4, 'F');
          doc.setFontSize(9);
          doc.setFont('helvetica', 'bold');
          doc.setTextColor(255, 255, 255);
          const head = `${dayLabel}   ·   ${fmt}   ·   ${ctype}`;
          doc.text(head, margin + 4, y + 6.5);
          y += 16;

          drawPostField('Idea / enfoque', item.idea);
          drawPostField('Copy', item.copy);
          drawPostField('Call to action', item.cta, { justify: false });
          drawPostField('Objetivo del post', item.post_goal);
          if (item.hashtags?.length) {
            drawPostField('Hashtags', item.hashtags.join('  '), { justify: false });
          }
          if (Array.isArray(item.platforms) && item.platforms.length) {
            drawPostField('Plataformas', item.platforms.join(', '), { justify: false });
          }

          const specs = item.production_specs;
          const specParts: string[] = [];
          if (specs) {
            if (specs.num_slides != null) specParts.push(`Slides: ${specs.num_slides}`);
            if (specs.duration_seconds != null) specParts.push(`Duracion: ${specs.duration_seconds}s`);
            if (specs.media_type) specParts.push(`Medio: ${MEDIA_TYPE_LABELS[specs.media_type] || specs.media_type}`);
          }
          if (specParts.length) drawPostField('Produccion', specParts.join('   ·   '), { justify: false });
          if (specs?.scene_summary?.trim()) drawPostField('Guion / escenas', specs.scene_summary);
          drawPostField('Brief visual', item.visual_brief);
          drawPostField('Prompt IA', item.visual_prompt);

          y += 5;
          doc.setDrawColor(BORDER[0], BORDER[1], BORDER[2]);
          doc.setLineWidth(0.3);
          doc.line(margin + 8, y, pageW - margin - 8, y);
          y += 7;
        }
      }

      // ========== FOOTER GLOBALES ==========
      const totalPages = doc.getNumberOfPages();
      for (let p = 1; p <= totalPages; p++) {
        doc.setPage(p);
        
        if (p > 1) {
          doc.setFillColor(BRAND[0], BRAND[1], BRAND[2]);
          doc.rect(0, 0, pageW, 10, 'F');
          doc.setTextColor(255, 255, 255);
          doc.setFontSize(8);
          doc.setFont('helvetica', 'bold');
          doc.text(sanitizeText(data.project.name).toUpperCase(), margin, 6.5);
          doc.setFont('helvetica', 'normal');
          doc.text('Estrategia de Redes Sociales', pageW - margin, 6.5, { align: 'right' });
        }

        const ph = doc.internal.pageSize.getHeight();
        doc.setDrawColor(BORDER[0], BORDER[1], BORDER[2]);
        doc.setLineWidth(0.3);
        doc.line(margin, ph - 14, pageW - margin, ph - 14);
        
        doc.setFontSize(8);
        doc.setTextColor(GRAY[0], GRAY[1], GRAY[2]);
        doc.setFont('helvetica', 'normal');
        
        if (p === 1) {
           doc.text(`Generado: ${dateStr}`, margin, ph - 9);
        } else {
           doc.text(`Proyecto: ${sanitizeText(data.project.name)}`, margin, ph - 9);
        }
        
        doc.text(`Página ${p} / ${totalPages}`, pageW - margin, ph - 9, { align: 'right' });
      }

      const safeName = data.project.name
        .replace(/[^a-zA-Z0-9áéíóúñÁÉÍÓÚÑ\s-]/g, '')
        .replace(/\s+/g, '_')
        .slice(0, 40);
      doc.save(`Estrategia_${safeName}.pdf`);
    } catch (err) {
      console.error('Error generando PDF:', err);
      const detail = err instanceof Error ? err.message : '';
      alert(
        detail && /no encontrado|no autorizado|obtener datos/i.test(detail)
          ? 'No se pudo cargar el proyecto para el PDF. Recarga e inténtalo de nuevo.'
          : 'Error al generar el PDF. Inténtalo de nuevo.'
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <Button
      variant="secondary"
      onClick={handleGenerate}
      loading={loading}
      title="Genera un PDF con toda la estrategia y calendario para enviar al cliente"
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
        <polyline points="14 2 14 8 20 8"/>
        <line x1="16" y1="13" x2="8" y2="13"/>
        <line x1="16" y1="17" x2="8" y2="17"/>
        <polyline points="10 9 9 9 8 9"/>
      </svg>
      {loading ? 'Generando PDF…' : 'Descargar PDF'}
    </Button>
  );
}
