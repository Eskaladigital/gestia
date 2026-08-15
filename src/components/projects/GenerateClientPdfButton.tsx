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
      .replace(/[ \t]{2,}/g, ' ')
      .trim()
  );
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
      const pageW = doc.internal.pageSize.getWidth();
      const pageH = doc.internal.pageSize.getHeight();
      const margin = 20;
      const contentW = pageW - margin * 2;
      let y = 0;

      const BRAND: [number, number, number] = [41, 98, 255]; // #2962ff
      const BRAND_LIGHT: [number, number, number] = [240, 244, 255]; // very light blue
      const DARK: [number, number, number] = [30, 41, 59]; // slate-800
      const GRAY: [number, number, number] = [100, 116, 139]; // slate-500
      const LIGHT_BG: [number, number, number] = [248, 250, 252]; // slate-50
      const BORDER: [number, number, number] = [226, 232, 240]; // slate-200

      const dateStr = new Date().toLocaleDateString('es-ES', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });

      function checkPage(needed: number) {
        if (y + needed > pageH - 25) {
          doc.addPage();
          y = 25;
        }
      }

      function sectionTitle(title: string) {
        checkPage(20);
        y += 8;
        doc.setDrawColor(BRAND[0], BRAND[1], BRAND[2]);
        doc.setLineWidth(1.5);
        doc.line(margin, y - 5, margin, y + 2);
        
        doc.setFontSize(14);
        doc.setTextColor(BRAND[0], BRAND[1], BRAND[2]);
        doc.setFont('helvetica', 'bold');
        doc.text(title.toUpperCase(), margin + 4, y + 1);
        y += 10;
      }

      function labelValue(label: string, value: string | null | undefined, style: 'normal' | 'card' = 'normal') {
        if (!value) return;
        const clean = sanitizeText(value);
        if (!clean) return;

        const indent = style === 'card' ? 5 : 0;
        doc.setFont('helvetica', 'normal');
        const lines = doc.splitTextToSize(clean, contentW - (style === 'card' ? 10 : 0));
        const neededHeight = lines.length * 5 + (style === 'card' ? 16 : 10);
        const fitsAsCard = style === 'card' && neededHeight > 8 && neededHeight < pageH - 50;

        checkPage(Math.min(neededHeight, 20));

        if (fitsAsCard) {
          doc.setFillColor(LIGHT_BG[0], LIGHT_BG[1], LIGHT_BG[2]);
          doc.setDrawColor(BORDER[0], BORDER[1], BORDER[2]);
          doc.setLineWidth(0.3);
          doc.roundedRect(margin, y, contentW, neededHeight - 4, 2, 2, 'FD');
          y += 6;
        }

        doc.setFontSize(8);
        doc.setTextColor(GRAY[0], GRAY[1], GRAY[2]);
        doc.setFont('helvetica', 'bold');
        doc.text(label.toUpperCase(), margin + indent, y);
        y += 5;

        doc.setFontSize(10);
        doc.setTextColor(DARK[0], DARK[1], DARK[2]);
        doc.setFont('helvetica', 'normal');
        for (const line of lines) {
          checkPage(6);
          doc.text(line, margin + indent, y);
          y += 5;
        }
        y += style === 'card' ? 5 : 4;
      }

      // ========== PORTADA ==========
      doc.setFillColor(BRAND_LIGHT[0], BRAND_LIGHT[1], BRAND_LIGHT[2]);
      doc.rect(0, 0, pageW, pageH * 0.45, 'F');
      
      doc.setFillColor(BRAND[0], BRAND[1], BRAND[2]);
      doc.rect(0, pageH * 0.45, pageW, 2, 'F');

      y = pageH * 0.2;
      doc.setTextColor(BRAND[0], BRAND[1], BRAND[2]);
      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.text('INFORME ESTRATÉGICO Y CALENDARIO', margin, y);
      y += 15;

      doc.setTextColor(DARK[0], DARK[1], DARK[2]);
      doc.setFontSize(32);
      const titleLines = doc.splitTextToSize(sanitizeText(data.project.name), contentW);
      doc.text(titleLines, margin, y);
      y += titleLines.length * 12 + 10;

      doc.setFontSize(14);
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
      y = 25;

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
        styles: { fontSize: 9, textColor: DARK, cellPadding: 3 },
        headStyles: { textColor: GRAY, fontStyle: 'bold', fontSize: 8 },
        columnStyles: { 0: { fontStyle: 'bold', cellWidth: 60 } },
      });
      y = (doc as any).lastAutoTable.finalY + 10;

      // ========== TONO ==========
      sectionTitle('Perfil de Tono de Voz');
      const toneKeys = ['tone_formality', 'tone_proximity', 'tone_emotion', 'tone_humor', 'tone_disruption'] as const;
      for (const tk of toneKeys) {
        const val = data.project[tk] ?? 50;
        checkPage(12);
        doc.setFontSize(9);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(DARK[0], DARK[1], DARK[2]);
        doc.text(TONE_LABELS[tk].toUpperCase(), margin, y);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(GRAY[0], GRAY[1], GRAY[2]);
        doc.text(`${val}%`, margin + 35, y);

        doc.setFillColor(LIGHT_BG[0], LIGHT_BG[1], LIGHT_BG[2]);
        doc.roundedRect(margin + 50, y - 3, 100, 4, 2, 2, 'F');
        
        if (val > 0) {
          doc.setFillColor(BRAND[0], BRAND[1], BRAND[2]);
          doc.roundedRect(margin + 50, y - 3, (val / 100) * 100, 4, 2, 2, 'F');
        }
        y += 10;
      }
      y += 5;

      // ========== DISTRIBUCIÓN SEMANAL ==========
      const dist = data.project.weekly_format_distribution;
      if (dist) {
        sectionTitle('Distribución Semanal');
        const totalPosts = (dist.story || 0) + (dist.carrusel || 0) + (dist.publicacion || 0) + (dist.reel || 0);
        
        checkPage(20);
        doc.setFontSize(10);
        doc.setTextColor(DARK[0], DARK[1], DARK[2]);
        doc.text(`Total: ${totalPosts} publicaciones a la semana`, margin, y);
        y += 8;

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
            styles: { fontSize: 9, textColor: DARK, cellPadding: 3, lineColor: BORDER, lineWidth: 0.1 },
            columnStyles: { 0: { fontStyle: 'bold', fillColor: LIGHT_BG } },
          });
          y = (doc as any).lastAutoTable.finalY + 10;
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
            checkPage(12);
            doc.setFontSize(9);
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(DARK[0], DARK[1], DARK[2]);
            doc.text(label.toUpperCase(), margin, y);
            doc.setFont('helvetica', 'normal');
            doc.setTextColor(GRAY[0], GRAY[1], GRAY[2]);
            doc.text(`${val}%`, margin + 35, y);
            doc.setFillColor(LIGHT_BG[0], LIGHT_BG[1], LIGHT_BG[2]);
            doc.roundedRect(margin + 50, y - 3, 100, 4, 2, 2, 'F');
            if (val > 0) {
              doc.setFillColor(BRAND[0], BRAND[1], BRAND[2]);
              doc.roundedRect(margin + 50, y - 3, (val / 100) * 100, 4, 2, 2, 'F');
            }
            y += 10;
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
            ].filter(Boolean).join(' — ');
            doc.setFontSize(9);
            doc.setTextColor(DARK[0], DARK[1], DARK[2]);
            doc.setFont('helvetica', 'bold');
            doc.text(colorLabel, margin + 14, y + 2);

            const colorDetail = [sanitizeText(c.usage), sanitizeText(c.notes)].filter(Boolean).join(' · ');
            if (colorDetail) {
              doc.setFontSize(8);
              doc.setFont('helvetica', 'normal');
              doc.setTextColor(GRAY[0], GRAY[1], GRAY[2]);
              doc.text(doc.splitTextToSize(colorDetail, contentW - 20), margin + 14, y + 7);
              y += 14;
            } else {
              y += 10;
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
            const info = [sanitizeText(f.usage), sanitizeText(f.weights)].filter(Boolean).join(' — ');
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
            checkPage(25);
            doc.setFillColor(LIGHT_BG[0], LIGHT_BG[1], LIGHT_BG[2]);
            doc.setDrawColor(BORDER[0], BORDER[1], BORDER[2]);
            doc.setLineWidth(0.3);
            
            const pTitle = `${sanitizeText(p.name)} ${p.percentage ? `(${p.percentage}%)` : ''}`;
            const pDesc = sanitizeText(p.description) || '';
            const pTopics = Array.isArray(p.example_topics) && p.example_topics.length ? `Temas: ${p.example_topics.map((t: string) => sanitizeText(t)).join(', ')}` : '';
            
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(9);
            const descLines = doc.splitTextToSize(pDesc, contentW - 10);
            const topicLines = pTopics ? doc.splitTextToSize(pTopics, contentW - 10) : [];
            
            const rectH = 8 + (descLines.length * 4.5) + (topicLines.length > 0 ? topicLines.length * 4.5 + 4 : 0);
            doc.roundedRect(margin, y, contentW, rectH, 2, 2, 'FD');
            
            doc.setFontSize(10);
            doc.setTextColor(BRAND[0], BRAND[1], BRAND[2]);
            doc.setFont('helvetica', 'bold');
            doc.text(pTitle, margin + 4, y + 6);
            
            let textY = y + 11;
            doc.setFontSize(9);
            doc.setTextColor(DARK[0], DARK[1], DARK[2]);
            doc.setFont('helvetica', 'normal');
            doc.text(descLines, margin + 4, textY);
            
            if (topicLines.length > 0) {
              textY += descLines.length * 4.5 + 2;
              doc.setFontSize(8);
              doc.setTextColor(GRAY[0], GRAY[1], GRAY[2]);
              doc.setFont('helvetica', 'italic');
              doc.text(topicLines, margin + 4, textY);
            }
            
            y += rectH + 4;
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
              y += 5;
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
            checkPage(25);
            doc.setFillColor(LIGHT_BG[0], LIGHT_BG[1], LIGHT_BG[2]);
            doc.setDrawColor(BORDER[0], BORDER[1], BORDER[2]);
            doc.setLineWidth(0.3);

            const lTitle = sanitizeText(line.theme as string) || 'Línea';
            const lDesc = sanitizeText(line.description as string) || '';
            const lFreq = line.frequency ? `Frecuencia: ${sanitizeText(line.frequency as string)}` : '';
            const lTopics = Array.isArray(line.example_topics) && line.example_topics.length
              ? `Temas: ${(line.example_topics as string[]).map(t => sanitizeText(t)).join(', ')}`
              : '';

            doc.setFont('helvetica', 'normal');
            doc.setFontSize(9);
            const dLines = doc.splitTextToSize(lDesc, contentW - 10);
            const fLine = lFreq ? doc.splitTextToSize(lFreq, contentW - 10) : [];
            const tLines = lTopics ? doc.splitTextToSize(lTopics, contentW - 10) : [];

            const rH = 8 + dLines.length * 4.5 + (fLine.length ? fLine.length * 4.5 + 2 : 0) + (tLines.length ? tLines.length * 4.5 + 2 : 0);
            doc.roundedRect(margin, y, contentW, rH, 2, 2, 'FD');

            doc.setFontSize(10);
            doc.setTextColor(BRAND[0], BRAND[1], BRAND[2]);
            doc.setFont('helvetica', 'bold');
            doc.text(lTitle, margin + 4, y + 6);

            let tY = y + 11;
            doc.setFontSize(9);
            doc.setTextColor(DARK[0], DARK[1], DARK[2]);
            doc.setFont('helvetica', 'normal');
            doc.text(dLines, margin + 4, tY);
            tY += dLines.length * 4.5;

            if (fLine.length) {
              tY += 2;
              doc.setFontSize(8);
              doc.setTextColor(GRAY[0], GRAY[1], GRAY[2]);
              doc.setFont('helvetica', 'bold');
              doc.text(fLine, margin + 4, tY);
              tY += fLine.length * 4.5;
            }
            if (tLines.length) {
              tY += 2;
              doc.setFontSize(8);
              doc.setTextColor(GRAY[0], GRAY[1], GRAY[2]);
              doc.setFont('helvetica', 'italic');
              doc.text(tLines, margin + 4, tY);
            }
            y += rH + 4;
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
          styles: { fontSize: 9, textColor: DARK, cellPadding: 4, lineColor: BORDER, lineWidth: 0.1 },
          headStyles: { fillColor: LIGHT_BG, textColor: DARK, fontStyle: 'bold' },
          columnStyles: { 0: { fontStyle: 'bold', cellWidth: 40 }, 1: { textColor: BRAND, cellWidth: 45 } },
        });
        y = (doc as any).lastAutoTable.finalY + 10;
      }

      // ========== CALENDARIO ==========
      if (data.contentItems.length > 0) {
        doc.addPage();
        y = 25;
        sectionTitle('Calendario de Publicaciones');

        const formatCounts: Record<string, number> = {};
        for (const item of data.contentItems) {
          if (item.format) formatCounts[item.format] = (formatCounts[item.format] || 0) + 1;
        }

        const fmtSummary = Object.entries(formatCounts)
          .map(([k, v]) => `${FORMAT_LABELS[k] || k}: ${v}`)
          .join('   |   ');
        
        doc.setFontSize(10);
        doc.setTextColor(GRAY[0], GRAY[1], GRAY[2]);
        doc.text(`Total: ${data.contentItems.length} publicaciones`, margin, y);
        y += 5;
        doc.setFontSize(9);
        doc.text(fmtSummary, margin, y);
        y += 10;

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
              fontSize: 8,
              cellPadding: 3,
              textColor: DARK,
              lineColor: BORDER,
              lineWidth: 0.1,
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

        // Detalle de cada post
        doc.addPage();
        y = 25;
        sectionTitle('Contenido Detallado por Publicación');

        for (const item of data.contentItems) {
          const d = new Date(item.scheduled_date);
          const dayLabel = d.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
          const fmt = (FORMAT_LABELS[item.format] || item.format || '-').toUpperCase();
          const ctype = CONTENT_TYPE_LABELS[item.content_type] || item.content_type;

          doc.setFont('helvetica', 'normal');
          doc.setFontSize(9);
          const ideaL = doc.splitTextToSize(sanitizeText(item.idea), contentW - 6);
          const copyL = doc.splitTextToSize(sanitizeText(item.copy), contentW - 6);
          const ctaL = item.cta ? doc.splitTextToSize(sanitizeText(item.cta), contentW - 6) : [];
          const hashL = item.hashtags?.length ? doc.splitTextToSize(sanitizeText(item.hashtags.join(' ')), contentW - 6) : [];
          const goalL = item.post_goal ? doc.splitTextToSize(sanitizeText(item.post_goal), contentW - 6) : [];
          const plats = Array.isArray(item.platforms) && item.platforms.length ? item.platforms.join(', ') : '';
          const platL = plats ? doc.splitTextToSize(plats, contentW - 6) : [];

          const specs = item.production_specs;
          const specParts: string[] = [];
          if (specs) {
            if (specs.num_slides != null) specParts.push(`Slides: ${specs.num_slides}`);
            if (specs.duration_seconds != null) specParts.push(`Duracion: ${specs.duration_seconds}s`);
            if (specs.media_type) specParts.push(`Medio: ${MEDIA_TYPE_LABELS[specs.media_type] || specs.media_type}`);
          }
          const specLine = specParts.join('  |  ');
          const specLineL = specLine ? doc.splitTextToSize(specLine, contentW - 6) : [];
          const sceneSumL = specs?.scene_summary?.trim() ? doc.splitTextToSize(sanitizeText(specs.scene_summary), contentW - 6) : [];

          const briefL = item.visual_brief ? doc.splitTextToSize(sanitizeText(item.visual_brief), contentW - 6) : [];
          const promptL = item.visual_prompt ? doc.splitTextToSize(sanitizeText(item.visual_prompt), contentW - 6) : [];

          let cardHeight = 8;
          cardHeight += 4 + 4 + ideaL.length * 4.5 + 2;
          cardHeight += 4 + 4 + copyL.length * 4.5 + 4;
          if (ctaL.length) cardHeight += 4 + 4 + ctaL.length * 4.5 + 2;
          if (goalL.length) cardHeight += 4 + 4 + goalL.length * 4.5 + 2;
          if (hashL.length) cardHeight += 4 + 4 + hashL.length * 4.5 + 2;
          if (platL.length) cardHeight += 4 + 4 + platL.length * 4.5 + 2;
          if (specLineL.length) cardHeight += 4 + 4 + specLineL.length * 4.5 + 2;
          if (sceneSumL.length) cardHeight += 4 + 4 + sceneSumL.length * 4.5 + 2;
          if (briefL.length) cardHeight += 4 + 4 + briefL.length * 4.5 + 2;
          if (promptL.length) cardHeight += 4 + 4 + promptL.length * 4.5 + 2;
          cardHeight += 2;

          checkPage(cardHeight + 10);

          doc.setFillColor(LIGHT_BG[0], LIGHT_BG[1], LIGHT_BG[2]);
          doc.setDrawColor(BORDER[0], BORDER[1], BORDER[2]);
          doc.setLineWidth(0.3);
          doc.rect(margin, y, contentW, 8, 'FD'); 
          
          doc.setFontSize(9);
          doc.setFont('helvetica', 'bold');
          doc.setTextColor(DARK[0], DARK[1], DARK[2]);
          doc.text(`${dayLabel}  |  ${fmt}  |  ${ctype}`, margin + 3, y + 5.5);
          
          y += 8;

          const bodyH = cardHeight - 8;
          doc.rect(margin, y, contentW, bodyH, 'S');

          let bodyY = y + 4;
          
          const drawField = (lbl: string, lines: string[], extraPadding = 2) => {
            if (!lines.length) return;
            doc.setFontSize(8);
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(GRAY[0], GRAY[1], GRAY[2]);
            doc.text(lbl, margin + 3, bodyY);
            bodyY += 4;
            
            doc.setFontSize(9);
            doc.setFont('helvetica', 'normal');
            doc.setTextColor(DARK[0], DARK[1], DARK[2]);
            doc.text(lines, margin + 3, bodyY);
            bodyY += lines.length * 4.5 + extraPadding;
          };

          drawField('IDEA / ENFOQUE', ideaL);
          drawField('COPY (TEXTO)', copyL, 4);
          drawField('CALL TO ACTION (CTA)', ctaL);
          drawField('OBJETIVO DEL POST', goalL);
          drawField('HASHTAGS', hashL);
          drawField('PLATAFORMAS', platL);
          drawField('PRODUCCION (slides / duracion / medio)', specLineL);
          drawField('GUION / ESCENAS', sceneSumL);
          drawField('BRIEF VISUAL', briefL);
          drawField('PROMPT IA (generacion de imagen)', promptL);

          y += bodyH + 8;
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
