'use client';

import backgroundImg from '../Background.png';
import { supabase } from './supabase';
import type { User } from '@supabase/supabase-js';
import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Barcode from 'react-barcode';
import {
  AlertTriangle,
  ArrowDownLeft,
  ArrowUpRight,
  Bell,
  Box,
  Check,
  CheckCheck,
  ChevronDown,
  ChevronUp,
  Download,
  Edit3,
  Eye,
  EyeOff,
  FileText,
  Layers,
  List,
  Lock,
  LogOut,
  Mail,
  Maximize2,
  Minimize2,
  Moon,
  MoreHorizontal,
  Package2,
  Palette,
  Plus,
  Printer,
  RefreshCw,
  Repeat,
  RotateCcw,
  Search,
  Settings,
  ShoppingBag,
  Sun,
  Trash2,
  TrendingUp,
  Volume2,
  VolumeX,
  Warehouse,
  X,
} from 'lucide-react';
import Papa from 'papaparse';

type ItemStatus = 'OUT OF STOCK' | 'LOW' | 'OK';

type InventoryItem = {
  id: string;
  name: string;
  sku: string;
  category: string;
  size: string;
  stock: number;
  min: number;
  status: ItemStatus;
  colors: string[];
};

type MovementMeta = {
  sku?: string;
  size?: string;
  colors?: string[];
  previousStock?: number;
  newStock?: number;
  note?: string;
  docNo?: string;
  partyName?: string;
};

type AuditEntry = {
  id: string;
  action: string;
  item: string;
  detail: string;
  user: string;
  time: string;
  direction?: 'INCOMING' | 'OUTGOING' | 'OTHER';
  qtyDelta?: number;
  meta?: MovementMeta;
};

type Category = {
  id: string;
  name: string;
};

type StockDocumentLine = {
  id: string;
  itemId?: string;
  name: string;
  sku: string;
  category: string;
  size: string;
  min?: number;
  colors: string[];
  qty: number;
  isNewCatalogItem?: boolean;
};

type StockDocument = {
  id: string;
  kind: 'INCOMING' | 'OUTGOING';
  docNo: string;
  partyName: string;
  dateTime: string;
  description: string;
  goods: StockDocumentLine[];
  status: 'PENDING' | 'COMPLETED';
  createdAt: string;
  completedAt?: string;
};

type ScanActionMode = 'search' | 'add' | 'deduct';
type BarcodeLabelFormat = 'compact' | 'full';
type InventoryViewMode = 'list' | 'grouped';
type OverviewTab = 'inventory' | 'incoming' | 'outgoing' | 'audit';

type AppNotification = {
  id: string;
  title: string;
  message: string;
  type: 'low_stock' | 'stock_update' | 'scan' | 'info';
  time: string;
  read: boolean;
  closing?: boolean;
};

type CascadeSelectOption = {
  value: string;
  label: string;
};

const UNIT_ESTIMATED_PRICE = 80;
const colorOptions = ['Black', 'White', 'Navy', 'Olive', 'Cream', 'Red', 'Khaki'];
const DEFAULT_SUPPLIERS = ['Select', 'Metro Print Supply', 'Cebu Apparel Wholesaler', 'Pacific Paper & Ink', 'Direct Factory', 'Custom'];
const DEFAULT_CUSTOMERS = ['Select', 'Walk-in Customer', 'Corporate Client', 'Event Organizer', 'Retail Partner', 'Custom'];

function isGmailAddress(email: string): boolean {
  return /^[^\s@]+@gmail\.com$/i.test(email.trim());
}

function formatCurrentDocDateTime(): string {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const hh = String(now.getHours()).padStart(2, '0');
  const min = String(now.getMinutes()).padStart(2, '0');
  return `${yyyy}/${mm}/${dd} ${hh}:${min}`;
}

function computeItemStatus(stock: number, min: number): ItemStatus {
  if (stock <= 0) return 'OUT OF STOCK';
  if (stock <= min) return 'LOW';
  return 'OK';
}

function mapStockDocumentRow(row: any): StockDocument {
  return {
    id: String(row.id),
    kind: row.kind === 'OUTGOING' ? 'OUTGOING' : 'INCOMING',
    docNo: row.doc_no || 'No.1',
    partyName: row.party_name ?? 'Select',
    dateTime: row.date_time || formatCurrentDocDateTime(),
    description: row.description ?? '',
    goods: Array.isArray(row.goods) ? row.goods : [],
    status: row.status === 'COMPLETED' ? 'COMPLETED' : 'PENDING',
    createdAt: row.created_at || new Date().toISOString(),
    completedAt: row.completed_at ?? undefined,
  };
}

function parseMovementMeta(rawDetail: string, rawAction: string): {
  direction: 'INCOMING' | 'OUTGOING' | 'OTHER';
  qtyDelta: number;
  cleanDetail: string;
  meta: MovementMeta;
} {
  let cleanDetail = rawDetail || '';
  let parsedMeta: MovementMeta = {};

  const markerMatch = cleanDetail.match(/\|\|META:(\{.*\})$/);
  if (markerMatch) {
    cleanDetail = cleanDetail.replace(/\|\|META:\{.*\}$/, '').trim();
    try {
      const jsonObj = JSON.parse(markerMatch[1]);
      if (jsonObj && typeof jsonObj === 'object') {
        parsedMeta = jsonObj as MovementMeta;
      }
    } catch {
      // Ignore malformed metadata suffix
    }
  }

  const upperAction = (rawAction || '').toUpperCase();
  let direction: 'INCOMING' | 'OUTGOING' | 'OTHER' = 'OTHER';
  let qtyDelta = 0;

  const qtyMatch = cleanDetail.match(/([+-]\d+)\s*units?/i);
  if (qtyMatch) {
    const qty = parseInt(qtyMatch[1], 10);
    if (!Number.isNaN(qty)) {
      if (qty > 0) {
        direction = 'INCOMING';
        qtyDelta = qty;
      } else if (qty < 0) {
        direction = 'OUTGOING';
        qtyDelta = Math.abs(qty);
      }
    }
  }

  if (direction === 'OTHER') {
    if (upperAction.includes('ADD') || upperAction.includes('INCOMING') || upperAction.includes('PROCUREMENT')) {
      direction = 'INCOMING';
    } else if (
      upperAction.includes('REMOVE') ||
      upperAction.includes('DEDUCT') ||
      upperAction.includes('OUTGOING') ||
      upperAction.includes('ORDER')
    ) {
      direction = 'OUTGOING';
    }
  }

  if (qtyDelta === 0 && typeof parsedMeta.previousStock === 'number' && typeof parsedMeta.newStock === 'number') {
    const diff = parsedMeta.newStock - parsedMeta.previousStock;
    if (diff > 0) {
      direction = 'INCOMING';
      qtyDelta = diff;
    } else if (diff < 0) {
      direction = 'OUTGOING';
      qtyDelta = Math.abs(diff);
    }
  }

  return { direction, qtyDelta, cleanDetail, meta: parsedMeta };
}

const NAMED_COLORS: { name: string; hex: string }[] = [
  { name: 'Black', hex: '#000000' },
  { name: 'Charcoal', hex: '#333333' },
  { name: 'Gray', hex: '#808080' },
  { name: 'Silver', hex: '#C0C0C0' },
  { name: 'White', hex: '#FFFFFF' },
  { name: 'Cream', hex: '#FFFDD0' },
  { name: 'Khaki', hex: '#C3B091' },
  { name: 'Brown', hex: '#8B4513' },
  { name: 'Maroon', hex: '#800000' },
  { name: 'Red', hex: '#EF4444' },
  { name: 'Coral', hex: '#FF7F50' },
  { name: 'Orange', hex: '#F97316' },
  { name: 'Gold', hex: '#EAB308' },
  { name: 'Yellow', hex: '#FACC15' },
  { name: 'Olive', hex: '#6B8E23' },
  { name: 'Lime', hex: '#84CC16' },
  { name: 'Green', hex: '#22C55E' },
  { name: 'Teal', hex: '#14B8A6' },
  { name: 'Cyan', hex: '#06B6D4' },
  { name: 'Sky Blue', hex: '#38BDF8' },
  { name: 'Blue', hex: '#3B82F6' },
  { name: 'Navy', hex: '#1E3A8A' },
  { name: 'Indigo', hex: '#4F46E5' },
  { name: 'Purple', hex: '#A855F7' },
  { name: 'Pink', hex: '#EC4899' },
];

const FEATURED_SWATCHES = [
  'Black',
  'White',
  'Red',
  'Orange',
  'Yellow',
  'Lime',
  'Green',
  'Cyan',
  'Blue',
  'Purple',
  'Pink',
  'Navy',
];

const COLOR_NAME_TO_HEX: Record<string, string> = NAMED_COLORS.reduce(
  (acc, entry) => {
    acc[entry.name.toLowerCase()] = entry.hex;
    return acc;
  },
  {} as Record<string, string>
);

function getColorFill(color: string): string {
  if (color.startsWith('#')) return color;
  return COLOR_NAME_TO_HEX[color.trim().toLowerCase()] || '#A1A1AA';
}

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const clean = hex.replace('#', '').trim();
  if (!/^[0-9a-fA-F]{6}$/.test(clean)) return null;
  return {
    r: parseInt(clean.slice(0, 2), 16),
    g: parseInt(clean.slice(2, 4), 16),
    b: parseInt(clean.slice(4, 6), 16),
  };
}

function rgbToHex(r: number, g: number, b: number): string {
  const clamp = (n: number) => Math.max(0, Math.min(255, Math.round(n)));
  const toHex = (n: number) => clamp(n).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`.toUpperCase();
}

function rgbToHsv(r: number, g: number, b: number): { h: number; s: number; v: number } {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;

  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const d = max - min;

  let h = 0;
  if (d !== 0) {
    if (max === rn) {
      h = 60 * (((gn - bn) / d) % 6);
    } else if (max === gn) {
      h = 60 * ((bn - rn) / d + 2);
    } else {
      h = 60 * ((rn - gn) / d + 4);
    }
  }
  if (h < 0) h += 360;

  const s = max === 0 ? 0 : d / max;
  const v = max;

  return { h, s, v };
}

function hexToColorName(hex: string): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return 'Custom';

  let bestName = 'Custom';
  let bestDist = Infinity;

  for (const entry of NAMED_COLORS) {
    const target = hexToRgb(entry.hex);
    if (!target) continue;
    const dist =
      (rgb.r - target.r) ** 2 +
      (rgb.g - target.g) ** 2 +
      (rgb.b - target.b) ** 2;
    if (dist < bestDist) {
      bestDist = dist;
      bestName = entry.name;
    }
  }

  return bestName;
}

function hsvToHex(h: number, s: number, v: number): string {
  const hue = ((h % 360) + 360) % 360;
  const sat = Math.max(0, Math.min(1, s));
  const val = Math.max(0, Math.min(1, v));

  const c = val * sat;
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = val - c;

  let r1 = 0;
  let g1 = 0;
  let b1 = 0;

  if (hue < 60) {
    r1 = c;
    g1 = x;
  } else if (hue < 120) {
    r1 = x;
    g1 = c;
  } else if (hue < 180) {
    g1 = c;
    b1 = x;
  } else if (hue < 240) {
    g1 = x;
    b1 = c;
  } else if (hue < 300) {
    r1 = x;
    b1 = c;
  } else {
    r1 = c;
    b1 = x;
  }

  return rgbToHex((r1 + m) * 255, (g1 + m) * 255, (b1 + m) * 255);
}

let sharedAudioCtx: AudioContext | null = null;

function getSharedAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const AudioCtx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioCtx) return null;

  if (!sharedAudioCtx || sharedAudioCtx.state === 'closed') {
    sharedAudioCtx = new AudioCtx();
  }
  if (sharedAudioCtx.state === 'suspended') {
    void sharedAudioCtx.resume().catch(() => {});
  }
  return sharedAudioCtx;
}

function playScanFeedbackChime(success = true, doubleBeep = false) {
  if (typeof window === 'undefined') return;
  try {
    const ctx = getSharedAudioContext();
    if (ctx) {
      const now = ctx.currentTime;

      if (!success) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(310, now);
        gain.gain.setValueAtTime(0.45, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.24);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 0.24);
      } else if (doubleBeep) {
        const beepDuration = 0.1;
        const gap = 0.07;
        [0, beepDuration + gap].forEach((offset) => {
          const startAt = now + offset;
          const oscPrimary = ctx.createOscillator();
          const gain = ctx.createGain();
          oscPrimary.type = 'square';
          oscPrimary.frequency.setValueAtTime(1567.98, startAt);
          gain.gain.setValueAtTime(0.8, startAt);
          gain.gain.exponentialRampToValueAtTime(0.01, startAt + beepDuration);
          oscPrimary.connect(gain);
          gain.connect(ctx.destination);
          oscPrimary.start(startAt);
          oscPrimary.stop(startAt + beepDuration);
        });
      } else {
        const duration = 0.16;
        const oscPrimary = ctx.createOscillator();
        const gain = ctx.createGain();
        oscPrimary.type = 'square';
        oscPrimary.frequency.setValueAtTime(1567.98, now);
        gain.gain.setValueAtTime(0.8, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + duration);
        oscPrimary.connect(gain);
        gain.connect(ctx.destination);
        oscPrimary.start(now);
        oscPrimary.stop(now + duration);
      }
    }

    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      if (!success) navigator.vibrate([45, 35, 45]);
      else if (doubleBeep) navigator.vibrate([80, 60, 80]);
      else navigator.vibrate(120);
    }
  } catch {
    // Ignore audio/vibration errors
  }
}

function formatBarcodeItemSizeLabel(name?: string, size?: string): string {
  const cleanName =
    (name || 'ITEM')
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, '')
      .trim() || 'ITEM';
  const cleanSize = (size || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '')
    .trim();
  return cleanSize ? `${cleanName}_${cleanSize}` : cleanName;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function sanitizePdfText(input: string): string {
  return input
    .replace(/[^\x20-\x7E]/g, ' ')
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)')
    .slice(0, 110);
}

function buildSingleBarcodeCardHtml(
  item: InventoryItem,
  copies: number,
  labelFormat: BarcodeLabelFormat
): string {
  const container = document.getElementById(`barcode-label-${item.id}`);
  const itemSizeLabel = formatBarcodeItemSizeLabel(item.name, item.size);
  const colors = item.colors || [];
  const isFull = labelFormat === 'full';
  const barcodeInnerHtml = container?.innerHTML || '';

  const colorCirclesHtml = colors
    .map(
      (color) =>
        `<span class="color-dot" title="${escapeHtml(color)}" style="background:${escapeHtml(
          getColorFill(color)
        )};"></span>`
    )
    .join('');

  const singleCardHtml = `
    <div class="label-card ${isFull ? 'label-full' : 'label-compact'}">
      ${
        isFull
          ? `<div class="top-meta"><span>${escapeHtml(item.category || 'Item')}</span> &bull; <span>Size/Type: ${escapeHtml(
              item.size || '-'
            )}</span></div>`
          : ''
      }
      <div class="item-row">
        <span class="item-mark">${escapeHtml(itemSizeLabel)}</span>
        ${colorCirclesHtml ? `<span class="color-dots">${colorCirclesHtml}</span>` : ''}
      </div>
      <div class="barcode-box">${barcodeInnerHtml}</div>
      ${
        isFull && colors.length > 0
          ? `<div class="color-names">Colors: ${escapeHtml(colors.join(', '))}</div>`
          : ''
      }
    </div>
  `;

  return singleCardHtml.repeat(copies);
}

function openPrintWindowWithCards(titleText: string, cardsHtml: string) {
  const printWin = window.open('', '_blank', 'width=640,height=480');
  if (!printWin) return;

  printWin.document.write(`
    <html>
      <head>
        <title>${escapeHtml(titleText)}</title>
        <style>
          body { font-family: Arial, sans-serif; margin: 0; padding: 12px; background: #ffffff; color: #000000; }
          .sheet { display: flex; flex-wrap: wrap; gap: 10px; align-items: flex-start; justify-content: flex-start; }
          .label-card { border: 1px solid #d4d4d8; border-radius: 8px; padding: 8px 10px; background: #ffffff; display: inline-flex; flex-direction: column; align-items: center; box-sizing: border-box; break-inside: avoid; }
          .label-compact { min-width: 170px; }
          .label-full { min-width: 230px; padding: 10px 12px; }
          .top-meta { font-size: 10px; color: #3f3f46; margin-bottom: 4px; text-align: center; }
          .item-row { display: inline-flex; align-items: center; justify-content: center; gap: 6px; margin-bottom: 4px; }
          .item-mark { font-size: 12px; font-weight: 800; letter-spacing: 0.06em; color: #000000; }
          .color-dots { display: inline-flex; align-items: center; gap: 4px; }
          .color-dot { display: inline-block; width: 11px; height: 11px; border-radius: 9999px; border: 1px solid #27272a; }
          .barcode-box { display: flex; justify-content: center; }
          .color-names { margin-top: 4px; font-size: 10px; color: #27272a; text-align: center; }
        </style>
      </head>
      <body>
        <div class="sheet">${cardsHtml}</div>
        <script>
          window.onload = function () { window.print(); window.close(); };
        </script>
      </body>
    </html>
  `);
  printWin.document.close();
}

function downloadInventoryPdf(
  reportTitle: string,
  subtitle: string,
  sourceItems: InventoryItem[],
  fileSlug: string
) {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  const totalUnits = sourceItems.reduce((sum, item) => sum + item.stock, 0);
  const totalEstValue = sourceItems.reduce((sum, item) => sum + item.stock * UNIT_ESTIMATED_PRICE, 0);
  const lowOrOutCount = sourceItems.filter(
    (item) => item.status === 'LOW' || item.status === 'OUT OF STOCK'
  ).length;
  const generatedAt = new Date().toLocaleString();

  const lines: string[] = [
    'THE PRINTING DEPOT - INVENTORY EXPORT',
    sanitizePdfText(reportTitle),
    sanitizePdfText(subtitle),
    sanitizePdfText(`Generated: ${generatedAt}`),
    sanitizePdfText(
      `Items: ${sourceItems.length} | Total Units: ${totalUnits} | Est. Value: PHP ${totalEstValue.toLocaleString()} | Low/Out: ${lowOrOutCount}`
    ),
    '------------------------------------------------------------------------',
  ];

  if (sourceItems.length === 0) {
    lines.push('No inventory items in this export.');
  } else {
    sourceItems.forEach((item, idx) => {
      const colorsStr = (item.colors || []).join(', ') || '-';
      lines.push(
        sanitizePdfText(
          `${idx + 1}. ${item.name} | SKU: ${item.sku || '-'} | Cat: ${item.category || '-'} | Size: ${item.size || '-'} | Stock: ${item.stock}/${item.min} | ${item.status} | Colors: ${colorsStr}`
        )
      );
    });
  }

  const streamOps: string[] = ['BT', '/F1 10 Tf', '40 760 Td', '14 TL'];
  lines.slice(0, 48).forEach((line, i) => {
    if (i > 0) streamOps.push('T*');
    streamOps.push(`(${sanitizePdfText(line)}) Tj`);
  });
  streamOps.push('ET');
  const contentStream = streamOps.join('\n');

  const pdfObjects = [
    '1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj',
    '2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj',
    '3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >> endobj',
    '4 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj',
    `5 0 obj << /Length ${contentStream.length} >> stream\n${contentStream}\nendstream endobj`,
  ];

  let pdfBody = '%PDF-1.4\n';
  const offsets: number[] = [0];
  for (const obj of pdfObjects) {
    offsets.push(pdfBody.length);
    pdfBody += `${obj}\n`;
  }

  const xrefStart = pdfBody.length;
  pdfBody += `xref\n0 ${pdfObjects.length + 1}\n`;
  pdfBody += '0000000000 65535 f \n';
  for (let i = 1; i <= pdfObjects.length; i++) {
    pdfBody += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  }
  pdfBody += `trailer << /Size ${pdfObjects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;

  const blob = new Blob([pdfBody], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `printing-depot-${fileSlug}.pdf`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function FrostedBackgroundLayer({ darkMode }: { darkMode: boolean }) {
  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
      <div
        className="h-full w-full scale-105 bg-cover bg-center bg-no-repeat transition-opacity duration-200"
        style={{
          backgroundImage: `url('${backgroundImg.src}')`,
          filter: darkMode
            ? 'blur(3px) brightness(0.72) saturate(1.15)'
            : 'blur(3px) brightness(0.96) saturate(1.1)',
        }}
      />
      <div
        className={`absolute inset-0 ${
          darkMode
            ? 'bg-gradient-to-br from-black/35 via-zinc-950/20 to-black/45'
            : 'bg-gradient-to-br from-white/35 via-white/20 to-white/45'
        }`}
      />
    </div>
  );
}

function ColorCircle({ color, size = 'sm' }: { color: string; size?: 'sm' | 'md' | 'lg' }) {
  const fill = getColorFill(color);
  const sizeClass =
    size === 'lg' ? 'h-6 w-6' : size === 'md' ? 'h-5 w-5' : 'h-4 w-4';
  const minPx = size === 'lg' ? '24px' : size === 'md' ? '20px' : '16px';

  return (
    <span
      className={`inline-block rounded-full border border-zinc-400/60 shrink-0 transition-transform duration-150 ease-out motion-reduce:transition-none group-hover:scale-110 ${sizeClass}`}
      style={{ backgroundColor: fill, minWidth: minPx, minHeight: minPx }}
      aria-hidden="true"
    />
  );
}

function PrintingDepotLogo({
  darkMode,
  size = 'md',
  spinning = false,
}: {
  darkMode: boolean;
  size?: 'sm' | 'md';
  spinning?: boolean;
}) {
  const boxSize =
    size === 'sm'
      ? 'h-14 w-14 sm:h-16 sm:w-16 rounded-2xl p-0 m-0'
      : 'h-16 w-16 sm:h-20 sm:w-20 rounded-2xl p-0 m-0';

  return (
    <div
      className={`tpd-logo-mark tpd-click-press relative flex ${boxSize} shrink-0 items-center justify-center overflow-hidden border backdrop-blur-xl saturate-150 ${
        darkMode
          ? 'border-white/20 bg-white/10 text-white shadow-md ring-1 ring-inset ring-white/10'
          : 'border-black/15 bg-white/55 text-black shadow-sm ring-1 ring-inset ring-black/5'
      }`}
    >
      <img
        src="/icon.png"
        alt="The Printing Depot logo"
        className={`h-full w-full p-0 m-0 object-cover ${spinning ? 'animate-spin' : ''}`}
      />
    </div>
  );
}

function BarcodeScanIcon({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M4 8V5a1 1 0 0 1 1-1h3" />
      <path d="M16 4h3a1 1 0 0 1 1 1v3" />
      <path d="M20 16v3a1 1 0 0 1-1 1h-3" />
      <path d="M8 20H5a1 1 0 0 1-1-1v-3" />
      <path d="M7 8v8" />
      <path d="M10 8v8" />
      <path d="M13 8v5" />
      <path d="M17 8v8" />
    </svg>
  );
}

function CascadeSelect({
  value,
  onChange,
  options,
  darkMode,
  fullWidth = false,
  minWidthClass = 'min-w-[165px]',
}: {
  value: string;
  onChange: (nextValue: string) => void;
  options: CascadeSelectOption[];
  darkMode: boolean;
  fullWidth?: boolean;
  minWidthClass?: string;
}) {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number; width: number }>({
    top: 0,
    left: 0,
    width: 210,
  });
  const containerRef = useRef<HTMLDivElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const menuPortalRef = useRef<HTMLDivElement | null>(null);

  const selectedOption = options.find((opt) => opt.value === value) || options[0];

  const updateMenuPosition = () => {
    const btn = buttonRef.current;
    if (!btn || typeof window === 'undefined') return;
    const rect = btn.getBoundingClientRect();
    const menuWidth = fullWidth ? Math.max(rect.width, 190) : Math.max(rect.width, 210);
    const viewportW = window.innerWidth;
    const viewportH = window.innerHeight;
    const clampedLeft = Math.max(12, Math.min(rect.left, viewportW - menuWidth - 12));
    const estimatedHeight = Math.min(options.length * 40 + 16, 260);
    const openAbove = rect.bottom + estimatedHeight + 10 > viewportH && rect.top > estimatedHeight + 12;
    const topPos = openAbove
      ? Math.max(12, rect.top - estimatedHeight - 6)
      : Math.min(viewportH - 12, rect.bottom + 6);

    setCoords({
      top: topPos,
      left: clampedLeft,
      width: menuWidth,
    });
  };

  const toggleMenu = () => {
    if (open) {
      setOpen(false);
    } else {
      updateMenuPosition();
      setOpen(true);
    }
  };

  useEffect(() => {
    if (!open) return;
    updateMenuPosition();

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      const insideTrigger = containerRef.current?.contains(target);
      const insideMenu = menuPortalRef.current?.contains(target);
      if (!insideTrigger && !insideMenu) {
        setOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
      }
    };

    const handleReposition = () => {
      updateMenuPosition();
    };

    document.addEventListener('mousedown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('resize', handleReposition);
    window.addEventListener('scroll', handleReposition, true);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('resize', handleReposition);
      window.removeEventListener('scroll', handleReposition, true);
    };
  }, [open, fullWidth, options.length]);

  const triggerStyle = darkMode
    ? 'border-white/20 bg-zinc-900/55 text-white backdrop-blur-xl saturate-150 ring-1 ring-inset ring-white/10 hover:border-white/35 hover:bg-zinc-900/75'
    : 'border-black/20 bg-white/80 text-zinc-950 backdrop-blur-xl saturate-150 ring-1 ring-inset ring-white/70 hover:border-black/35 hover:bg-white/95';

  const menuStyle = darkMode
    ? 'border-white/25 bg-zinc-900/95 text-white shadow-[0_24px_60px_rgba(0,0,0,0.75)] ring-1 ring-inset ring-white/15'
    : 'border-black/20 bg-white/95 text-zinc-950 shadow-[0_24px_60px_rgba(0,0,0,0.2)] ring-1 ring-inset ring-white/80';

  const menuNode =
    open && typeof document !== 'undefined'
      ? createPortal(
          <div
            ref={menuPortalRef}
            style={{
              position: 'fixed',
              top: `${coords.top}px`,
              left: `${coords.left}px`,
              width: `${coords.width}px`,
              zIndex: 9999,
            }}
            className={`tpd-slide-down rounded-2xl border ${menuStyle} p-1.5 backdrop-blur-2xl saturate-150`}
          >
            <div className="max-h-60 overflow-y-auto overflow-x-hidden space-y-0.5">
              {options.map((opt) => {
                const isSelected = opt.value === value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => {
                      onChange(opt.value);
                      setOpen(false);
                    }}
                    className={`flex w-full items-center justify-between gap-2 rounded-xl px-3 py-2 text-left text-base sm:text-sm font-medium transition-colors duration-100 ${
                      isSelected
                        ? darkMode
                          ? 'bg-white text-black font-semibold'
                          : 'bg-zinc-900 text-white font-semibold'
                        : darkMode
                          ? 'text-zinc-200 hover:bg-white/10 hover:text-white'
                          : 'text-zinc-800 hover:bg-black/5 hover:text-black'
                    }`}
                  >
                    <span className="truncate">{opt.label}</span>
                    {isSelected && <Check size={14} className="shrink-0" />}
                  </button>
                );
              })}
            </div>
          </div>,
          document.body
        )
      : null;

  return (
    <div ref={containerRef} className={`relative ${fullWidth ? 'w-full' : 'inline-block'}`}>
      <button
        ref={buttonRef}
        type="button"
        onClick={toggleMenu}
        aria-expanded={open}
        className={`tpd-click-press flex ${fullWidth ? 'w-full justify-between' : minWidthClass + ' justify-between'} items-center gap-2 rounded-2xl border ${triggerStyle} px-3.5 py-2 text-base sm:text-sm font-medium transition-all duration-150 ease-out motion-reduce:transition-none`}
      >
        <span className="truncate">{selectedOption?.label ?? value}</span>
        <ChevronDown
          size={15}
          className={`shrink-0 transition-transform duration-150 ease-out motion-reduce:transition-none ${
            open ? 'rotate-180' : ''
          }`}
        />
      </button>
      {menuNode}
    </div>
  );
}

export default function InventoryDashboard() {
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authMode, setAuthMode] = useState<'login' | 'signup'>('login');
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authConfirmPassword, setAuthConfirmPassword] = useState('');
  const [showAuthPassword, setShowAuthPassword] = useState(false);
  const [showAuthConfirmPassword, setShowAuthConfirmPassword] = useState(false);
  const [authSubmitting, setAuthSubmitting] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [authMessage, setAuthMessage] = useState<string | null>(null);

  const [confirmDeleteItemId, setConfirmDeleteItemId] = useState<string | null>(null);
  const [confirmDeleteCategoryId, setConfirmDeleteCategoryId] = useState<string | null>(null);
  const [confirmDeleteDocId, setConfirmDeleteDocId] = useState<string | null>(null);
  const [confirmDeleteAuditId, setConfirmDeleteAuditId] = useState<string | null>(null);

  const [items, setItems] = useState<InventoryItem[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [auditLog, setAuditLog] = useState<AuditEntry[]>([]);

  const [documents, setDocuments] = useState<StockDocument[]>([]);
  const [docModalOpen, setDocModalOpen] = useState(false);
  const [editingDocId, setEditingDocId] = useState<string | null>(null);
  const [docKind, setDocKind] = useState<'INCOMING' | 'OUTGOING'>('INCOMING');
  const [docNo, setDocNo] = useState('No.1');
  const [docPartyName, setDocPartyName] = useState('Select');
  const [docCustomParty, setDocCustomParty] = useState('');
  const [docDateTime, setDocDateTime] = useState(formatCurrentDocDateTime());
  const [docDescription, setDocDescription] = useState('');
  const [docGoods, setDocGoods] = useState<StockDocumentLine[]>([]);
  const [docGoodsSearch, setDocGoodsSearch] = useState('');
  const [docInfoExpanded, setDocInfoExpanded] = useState(true);
  const [goodsInfoExpanded, setGoodsInfoExpanded] = useState(true);
  const [addGoodPickerOpen, setAddGoodPickerOpen] = useState(false);
  const [addGoodCatalogQuery, setAddGoodCatalogQuery] = useState('');
  const [inlineNewGoodOpen, setInlineNewGoodOpen] = useState(false);
  const [inlineNewGoodCustomColorOpen, setInlineNewGoodCustomColorOpen] = useState(false);
  const [inlineNewGood, setInlineNewGood] = useState({
    name: '',
    sku: '',
    category: 'Shirts',
    size: 'M',
    stock: '0',
    min: '5',
    colors: [] as string[],
  });
  const inlineNewGoodRef = useRef<HTMLDivElement | null>(null);
  const inventorySectionRef = useRef<HTMLElement | null>(null);
  const [batchScanActive, setBatchScanActive] = useState(false);
  const [docMenuOpenId, setDocMenuOpenId] = useState<string | null>(null);

  const [auditSelectMode, setAuditSelectMode] = useState(false);
  const [selectedAuditIds, setSelectedAuditIds] = useState<Set<string>>(new Set());
  const [confirmDeleteSelectedAudit, setConfirmDeleteSelectedAudit] = useState(false);
  const [confirmClearAllAudit, setConfirmClearAllAudit] = useState(false);
  const [isClearingAudit, setIsClearingAudit] = useState(false);

  const [barcodeSelectMode, setBarcodeSelectMode] = useState(false);
  const [selectedBarcodeItemIds, setSelectedBarcodeItemIds] = useState<Set<string>>(new Set());

  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [topLowStockBanner, setTopLowStockBanner] = useState<(AppNotification & { closing?: boolean }) | null>(null);
  const topBannerTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [isNotifOpen, setIsNotifOpen] = useState(false);
  const seenAuditIdsRef = useRef<Set<string>>(new Set());
  const seenLowStockKeysRef = useRef<Set<string>>(new Set());
  const initialAuditLoadedRef = useRef(false);
  const lowStockChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  const [isAuditMaximized, setIsAuditMaximized] = useState(false);
  const [isSectionMinimized, setIsSectionMinimized] = useState(false);

  const [isSavingItem, setIsSavingItem] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const [isAddingCategory, setIsAddingCategory] = useState(false);
  const [categoryAddSuccess, setCategoryAddSuccess] = useState(false);

  const [scanSuccessBanner, setScanSuccessBanner] = useState<string | null>(null);
  const [continuousScan, setContinuousScan] = useState(true);
  const [scanSoundEnabled, setScanSoundEnabled] = useState(true);
  const [lastScannedSummary, setLastScannedSummary] = useState<string | null>(null);
  const [customCardQty, setCustomCardQty] = useState<Record<string, number>>({});
  const [copiedRestockList, setCopiedRestockList] = useState(false);

  const [cameraRestartNonce, setCameraRestartNonce] = useState(0);

  const [labelFormat, setLabelFormat] = useState<BarcodeLabelFormat>('compact');
  const [printCopiesByItem, setPrintCopiesByItem] = useState<Record<string, number>>({});

  const continuousScanRef = useRef(true);
  const scanSoundEnabledRef = useRef(true);
  const docModalOpenRef = useRef(false);
  const batchScanActiveRef = useRef(false);

  useEffect(() => {
    continuousScanRef.current = continuousScan;
  }, [continuousScan]);

  useEffect(() => {
    scanSoundEnabledRef.current = scanSoundEnabled;
  }, [scanSoundEnabled]);

  useEffect(() => {
    docModalOpenRef.current = docModalOpen;
  }, [docModalOpen]);

  useEffect(() => {
    batchScanActiveRef.current = batchScanActive;
  }, [batchScanActive]);

  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [showLowStockPopUp, setShowLowStockPopUp] = useState(true);
  const [confirmDeleteAccount, setConfirmDeleteAccount] = useState(false);
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);

  const showLowStockPopUpRef = useRef(showLowStockPopUp);

  useEffect(() => {
    showLowStockPopUpRef.current = showLowStockPopUp;
  }, [showLowStockPopUp]);

  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [categoryFilter, setCategoryFilter] = useState('ALL');
  const [activeTab, setActiveTab] = useState<OverviewTab>('inventory');
  const [inventoryViewMode, setInventoryViewMode] = useState<InventoryViewMode>('grouped');
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: '', sku: '', category: 'Shirts', size: 'M', stock: '0', min: '5', colors: [] as string[] });
  const [newCategory, setNewCategory] = useState('');

  const [expandedBarcodes, setExpandedBarcodes] = useState<Record<string, boolean>>({});
  const [pulsedItemIds, setPulsedItemIds] = useState<Record<string, boolean>>({});
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const customColorPanelRef = useRef<HTMLDivElement | null>(null);
  const headerActionsRef = useRef<HTMLDivElement | null>(null);
  const [isActionsCramped, setIsActionsCramped] = useState(false);

  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [scanMode, setScanMode] = useState<ScanActionMode>('search');
  const [scanQuantity, setScanQuantity] = useState<number>(1);
  const [scannerError, setScannerError] = useState<string | null>(null);
  const [scanFeedback, setScanFeedback] = useState<string | null>(null);
  const scannerInstanceRef = useRef<any>(null);
  const scannerRunningRef = useRef(false);
  const scanLockedRef = useRef(false);
  const itemsRef = useRef<InventoryItem[]>([]);
  const scanModeRef = useRef<ScanActionMode>('search');
  const scanQuantityRef = useRef<number>(1);

  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [hue, setHue] = useState(217);
  const [sat, setSat] = useState(0.8);
  const [val, setVal] = useState(0.96);
  const [pickerHex, setPickerHex] = useState('#3B82F6');
  const [previewSwatchName, setPreviewSwatchName] = useState<string | null>(null);

  const [darkMode, setDarkMode] = useState(true);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    let metaViewport = document.querySelector('meta[name="viewport"]') as HTMLMetaElement | null;
    if (!metaViewport) {
      metaViewport = document.createElement('meta');
      metaViewport.name = 'viewport';
      document.head.appendChild(metaViewport);
    }
    metaViewport.setAttribute(
      'content',
      'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no'
    );
  }, []);

  useEffect(() => {
    const el = headerActionsRef.current;
    if (!el) return;

    const checkCramped = () => {
      const hasWrapped = el.scrollHeight > 54;
      const isTightWidth = el.clientWidth > 0 && el.clientWidth < 740;
      setIsActionsCramped(hasWrapped || isTightWidth);
    };

    checkCramped();

    if (typeof ResizeObserver !== 'undefined') {
      const observer = new ResizeObserver(checkCramped);
      observer.observe(el);
      return () => observer.disconnect();
    }

    window.addEventListener('resize', checkCramped);
    return () => window.removeEventListener('resize', checkCramped);
  }, [user]);

  useEffect(() => {
    if (!inlineNewGoodOpen) return;
    inlineNewGoodRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [inlineNewGoodOpen]);

  const fetchStockDocuments = async () => {
    const { data, error } = await supabase
      .from('stock_documents')
      .select('*')
      .order('created_at', { ascending: false });

    if (!error && Array.isArray(data)) {
      setDocuments(data.map(mapStockDocumentRow));
    }
  };

  useEffect(() => {
    if (!user) {
      setDocuments([]);
      return;
    }

    let active = true;
    void fetchStockDocuments();

    const docChannel = supabase
      .channel('public:stock_documents')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'stock_documents' },
        () => {
          if (active) {
            void fetchStockDocuments();
          }
        }
      )
      .subscribe();

    return () => {
      active = false;
      supabase.removeChannel(docChannel);
    };
  }, [user]);

  const togglePicker = () => {
    if (isPickerOpen) {
      setIsPickerOpen(false);
    } else {
      setIsPickerOpen(true);
      requestAnimationFrame(() => {
        customColorPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      });
    }
  };

  const openNotifPanel = () => {
    setNotifications((prev) => prev.map((entry) => ({ ...entry, read: true })));
    setIsNotifOpen(true);
  };

  const closeNotifPanel = () => {
    setIsNotifOpen(false);
  };

  const toggleNotifPanel = () => {
    if (isNotifOpen) {
      closeNotifPanel();
    } else {
      openNotifPanel();
    }
  };

  const openSettingsModal = () => {
    setConfirmDeleteAccount(false);
    setIsSettingsOpen(true);
  };

  const closeSettingsModal = () => {
    setIsSettingsOpen(false);
    setConfirmDeleteAccount(false);
  };

  const openScannerModal = (forBatchDoc = false) => {
    setScanSuccessBanner(null);
    setScannerError(null);
    setScanFeedback(null);
    setBatchScanActive(forBatchDoc);
    setIsScannerOpen(true);
  };

  const closeScannerModal = () => {
    setIsScannerOpen(false);
    setBatchScanActive(false);
    setScanSuccessBanner(null);
  };

  const closeItemModal = () => {
    setIsPickerOpen(false);
    setIsModalOpen(false);
    setSaveSuccess(false);
    setIsSavingItem(false);
  };

  const closeDocModal = () => {
    setDocModalOpen(false);
    setAddGoodPickerOpen(false);
    setInlineNewGoodOpen(false);
    setInlineNewGoodCustomColorOpen(false);
    setBatchScanActive(false);
  };

  const getNextDocNumber = (kind: 'INCOMING' | 'OUTGOING') => {
    const existingCount = documents.filter((d) => d.kind === kind).length;
    return `No.${existingCount + 1}`;
  };

  const openNewDocumentModal = (kind: 'INCOMING' | 'OUTGOING') => {
    setEditingDocId(null);
    setDocKind(kind);
    setDocNo(getNextDocNumber(kind));
    setDocPartyName('Select');
    setDocCustomParty('');
    setDocDateTime(formatCurrentDocDateTime());
    setDocDescription('');
    setDocGoods([]);
    setDocGoodsSearch('');
    setDocInfoExpanded(true);
    setGoodsInfoExpanded(true);
    setAddGoodPickerOpen(false);
    setAddGoodCatalogQuery('');
    setInlineNewGoodOpen(false);
    setInlineNewGoodCustomColorOpen(false);
    setInlineNewGood({
      name: '',
      sku: '',
      category: categories[0]?.name || 'Shirts',
      size: 'M',
      stock: '0',
      min: '5',
      colors: [],
    });
    setDocModalOpen(true);
  };

  const openEditDocumentModal = (doc: StockDocument) => {
    setEditingDocId(doc.id);
    setDocKind(doc.kind);
    setDocNo(doc.docNo);
    const partyList = doc.kind === 'INCOMING' ? DEFAULT_SUPPLIERS : DEFAULT_CUSTOMERS;
    if (partyList.includes(doc.partyName)) {
      setDocPartyName(doc.partyName);
      setDocCustomParty('');
    } else {
      setDocPartyName('Custom');
      setDocCustomParty(doc.partyName);
    }
    setDocDateTime(doc.dateTime);
    setDocDescription(doc.description);
    setDocGoods(doc.goods.map((g) => ({ ...g })));
    setDocGoodsSearch('');
    setDocInfoExpanded(true);
    setGoodsInfoExpanded(true);
    setAddGoodPickerOpen(false);
    setInlineNewGoodOpen(false);
    setInlineNewGoodCustomColorOpen(false);
    setDocMenuOpenId(null);
    setDocModalOpen(true);
  };

  const resolveDocPartyLabel = () => {
    if (docPartyName === 'Custom') return docCustomParty.trim() || 'Custom';
    if (docPartyName === 'Select' && docCustomParty.trim()) return docCustomParty.trim();
    return docPartyName;
  };

  const addCatalogItemToDocument = (catalogItem: InventoryItem, qtyToAdd = 1) => {
    const safeQty = Math.max(1, qtyToAdd);
    setDocGoods((prev) => {
      const idx = prev.findIndex(
        (line) =>
          (line.itemId && line.itemId === catalogItem.id) ||
          (catalogItem.sku && line.sku.trim().toLowerCase() === catalogItem.sku.trim().toLowerCase())
      );
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = { ...next[idx], qty: next[idx].qty + safeQty };
        return next;
      }
      return [
        ...prev,
        {
          id: `line-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          itemId: catalogItem.id,
          name: catalogItem.name,
          sku: catalogItem.sku,
          category: catalogItem.category,
          size: catalogItem.size,
          min: catalogItem.min,
          colors: catalogItem.colors || [],
          qty: safeQty,
        },
      ];
    });
  };

  const addInlineNewItemToDocument = () => {
    const cleanName = inlineNewGood.name.trim();
    if (!cleanName) return;
    const stockVal = Math.max(0, parseInt(inlineNewGood.stock, 10) || 0);
    const minVal = Math.max(0, parseInt(inlineNewGood.min, 10) || 0);
    const safeQty = stockVal > 0 ? stockVal : 1;
    const cleanCat = inlineNewGood.category || categories[0]?.name || 'General';
    const cleanSku = inlineNewGood.sku.trim() || buildSkuForCategory(cleanCat);

    setDocGoods((prev) => [
      ...prev,
      {
        id: `line-new-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        name: cleanName,
        sku: cleanSku,
        category: cleanCat,
        size: inlineNewGood.size.trim() || 'M',
        min: minVal,
        colors: inlineNewGood.colors,
        qty: safeQty,
        isNewCatalogItem: true,
      },
    ]);

    setInlineNewGood({
      name: '',
      sku: '',
      category: cleanCat,
      size: 'M',
      stock: '0',
      min: '5',
      colors: [],
    });
    setInlineNewGoodOpen(false);
    setInlineNewGoodCustomColorOpen(false);
    setAddGoodPickerOpen(false);
  };

  const updateDocLineQty = (lineId: string, nextQty: number) => {
    const clamped = Math.max(1, Number.isNaN(nextQty) ? 1 : nextQty);
    setDocGoods((prev) =>
      prev.map((line) => (line.id === lineId ? { ...line, qty: clamped } : line))
    );
  };

  const removeDocLine = (lineId: string) => {
    setDocGoods((prev) => prev.filter((line) => line.id !== lineId));
  };

  const saveDocumentAsPending = async () => {
    if (docGoods.length === 0) {
      pushNotification('Missing Items', 'Add at least one item before saving.', 'info');
      return;
    }

    const partyLabel = resolveDocPartyLabel();
    const cleanDocNo = docNo.trim() || getNextDocNumber(docKind);
    const cleanDateTime = docDateTime.trim() || formatCurrentDocDateTime();
    const cleanDescription = docDescription.trim();
    const prevDocs = documents;

    setActiveTab(docKind === 'INCOMING' ? 'incoming' : 'outgoing');
    closeDocModal();

    if (editingDocId) {
      const updatedDoc: StockDocument = {
        ...(prevDocs.find((d) => d.id === editingDocId) || {
          id: editingDocId,
          kind: docKind,
          status: 'PENDING' as const,
          createdAt: new Date().toISOString(),
        }),
        docNo: cleanDocNo,
        partyName: partyLabel,
        dateTime: cleanDateTime,
        description: cleanDescription,
        goods: docGoods,
      };

      setDocuments((prev) => prev.map((doc) => (doc.id === editingDocId ? updatedDoc : doc)));

      const { error } = await supabase
        .from('stock_documents')
        .update({
          doc_no: cleanDocNo,
          party_name: partyLabel,
          date_time: cleanDateTime,
          description: cleanDescription,
          goods: docGoods,
        })
        .eq('id', editingDocId);

      if (error) {
        setDocuments(prevDocs);
        pushNotification('Save Failed', error.message, 'info');
      }
    } else {
      const nowIso = new Date().toISOString();
      const newDoc: StockDocument = {
        id: `doc-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        kind: docKind,
        docNo: cleanDocNo,
        partyName: partyLabel,
        dateTime: cleanDateTime,
        description: cleanDescription,
        goods: docGoods,
        status: 'PENDING',
        createdAt: nowIso,
      };

      setDocuments((prev) => [newDoc, ...prev]);

      const { error } = await supabase.from('stock_documents').insert([
        {
          id: newDoc.id,
          created_by: user?.id ?? null,
          kind: newDoc.kind,
          doc_no: newDoc.docNo,
          party_name: newDoc.partyName,
          date_time: newDoc.dateTime,
          description: newDoc.description,
          goods: newDoc.goods,
          status: newDoc.status,
          created_at: newDoc.createdAt,
        },
      ]);

      if (error) {
        setDocuments(prevDocs);
        pushNotification('Save Failed', error.message, 'info');
      }
    }
  };

  const commitDocumentToInventory = async (docId: string) => {
    const targetDoc = documents.find((d) => d.id === docId);
    if (!targetDoc || targetDoc.status === 'COMPLETED') return;

    setDocMenuOpenId(null);

    const isIncoming = targetDoc.kind === 'INCOMING';
    const currentItems = [...(itemsRef.current.length > 0 ? itemsRef.current : items)];

    for (const line of targetDoc.goods) {
      const matchedIdx = currentItems.findIndex(
        (inv) =>
          (line.itemId && inv.id === line.itemId) ||
          (line.sku && inv.sku.trim().toLowerCase() === line.sku.trim().toLowerCase()) ||
          inv.name.trim().toLowerCase() === line.name.trim().toLowerCase()
      );

      if (matchedIdx >= 0) {
        const inv = currentItems[matchedIdx];
        const prevStock = inv.stock;
        const delta = isIncoming ? line.qty : -line.qty;
        const nextStock = Math.max(0, prevStock + delta);
        const nextStatus = computeItemStatus(nextStock, inv.min);
        const dbStatus = nextStatus === 'OUT OF STOCK' ? 'LOW' : nextStatus;

        currentItems[matchedIdx] = {
          ...inv,
          stock: nextStock,
          status: nextStatus,
        };
        triggerStockPulse(inv.id);

        void supabase
          .from('items')
          .update({ stock: nextStock, status: dbStatus })
          .eq('id', inv.id);

        const noteParts = [
          targetDoc.docNo,
          targetDoc.partyName && targetDoc.partyName !== 'Select' ? targetDoc.partyName : '',
          targetDoc.description,
        ]
          .filter(Boolean)
          .join(' • ');

        void logAudit(
          isIncoming ? 'PROCUREMENT' : 'OUTGOING',
          inv.name,
          `${isIncoming ? `+${line.qty}` : `-${line.qty}`} units • ${
            isIncoming ? 'Procurement arrived & added' : 'Customer order deducted'
          } (${prevStock} → ${nextStock} stock)${noteParts ? ` • ${noteParts}` : ''} by ${actorName}`,
          isIncoming ? 'INCOMING' : 'OUTGOING',
          line.qty,
          {
            sku: inv.sku,
            size: inv.size,
            colors: inv.colors,
            previousStock: prevStock,
            newStock: nextStock,
            note: noteParts || (isIncoming ? 'Procurement arrival' : 'Customer order'),
            docNo: targetDoc.docNo,
            partyName: targetDoc.partyName,
          }
        );

        if (nextStatus === 'OUT OF STOCK' || nextStatus === 'LOW') {
          seenLowStockKeysRef.current.add(`${inv.id}::${nextStock}::${inv.min}`);
          void notifyAllUsersLowStock(inv.name, inv.sku, nextStock, inv.min);
        }
      } else {
        const minVal = Math.max(0, Number(line.min ?? 5));
        const createdStock = isIncoming ? line.qty : 0;
        const createdStatus = computeItemStatus(createdStock, minVal);
        const dbStatus = createdStatus === 'OUT OF STOCK' ? 'LOW' : createdStatus;
        const tempId = `temp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
        const createdItem: InventoryItem = {
          id: tempId,
          name: line.name,
          sku: line.sku,
          category: line.category || categories[0]?.name || 'General',
          size: line.size || 'M',
          stock: createdStock,
          min: minVal,
          status: createdStatus,
          colors: line.colors || [],
        };
        currentItems.unshift(createdItem);

        void supabase
          .from('items')
          .insert([
            {
              name: createdItem.name,
              sku: createdItem.sku,
              category: createdItem.category,
              size: createdItem.size,
              stock: createdItem.stock,
              min: createdItem.min,
              status: dbStatus,
              colors: createdItem.colors,
            },
          ])
          .select('id')
          .single()
          .then(({ data }) => {
            if (data?.id) {
              const realId = String(data.id);
              setItems((prev) =>
                prev.map((entry) => (entry.id === tempId ? { ...entry, id: realId } : entry))
              );
            }
          });

        void logAudit(
          isIncoming ? 'PROCUREMENT' : 'OUTGOING',
          createdItem.name,
          `${isIncoming ? `+${line.qty}` : `-${line.qty}`} units • ${
            isIncoming ? 'New item added to inventory on arrival' : 'Customer order item logged'
          } (0 → ${createdStock} stock) • ${targetDoc.docNo} by ${actorName}`,
          isIncoming ? 'INCOMING' : 'OUTGOING',
          line.qty,
          {
            sku: createdItem.sku,
            size: createdItem.size,
            colors: createdItem.colors,
            previousStock: 0,
            newStock: createdStock,
            note: targetDoc.description || targetDoc.docNo,
            docNo: targetDoc.docNo,
            partyName: targetDoc.partyName,
          }
        );
      }
    }

    itemsRef.current = currentItems;
    setItems(currentItems);

    const completedTime = formatCurrentDocDateTime();
    setDocuments((prev) =>
      prev.map((d) =>
        d.id === docId ? { ...d, status: 'COMPLETED', completedAt: completedTime } : d
      )
    );

    if (scanSoundEnabledRef.current) {
      playScanFeedbackChime(true, false);
    }

    await supabase
      .from('stock_documents')
      .update({ status: 'COMPLETED', completed_at: completedTime })
      .eq('id', docId);
  };

  const deleteStockDocument = async (docId: string) => {
    setConfirmDeleteDocId(null);
    setDocMenuOpenId(null);
    const prevDocs = documents;
    setDocuments((prev) => prev.filter((d) => d.id !== docId));

    const { error } = await supabase.from('stock_documents').delete().eq('id', docId);
    if (error) {
      setDocuments(prevDocs);
      pushNotification('Delete Failed', error.message, 'info');
    }
  };

  const actorName = useMemo(() => {
    if (!user) return 'Unknown User';
    return (
      user.user_metadata?.full_name ||
      user.user_metadata?.name ||
      user.email?.split('@')[0] ||
      user.email ||
      'Staff'
    );
  }, [user]);

  const actorNameRef = useRef(actorName);
  useEffect(() => {
    actorNameRef.current = actorName;
  }, [actorName]);

  const unreadCount = useMemo(
    () => notifications.filter((entry) => !entry.read).length,
    [notifications]
  );

  const triggerStockPulse = (itemId: string) => {
    setPulsedItemIds((prev) => ({ ...prev, [itemId]: true }));
    setTimeout(() => {
      setPulsedItemIds((prev) => {
        const next = { ...prev };
        delete next[itemId];
        return next;
      });
    }, 350);
  };

  const dismissTopLowStockBanner = () => {
    if (topBannerTimeoutRef.current) {
      clearTimeout(topBannerTimeoutRef.current);
      topBannerTimeoutRef.current = null;
    }
    setTopLowStockBanner((prev) => (prev ? { ...prev, closing: true } : null));
    setTimeout(() => {
      setTopLowStockBanner(null);
    }, 180);
  };

  const triggerTopLowStockPop = (entry: AppNotification) => {
    if (!showLowStockPopUpRef.current) return;
    if (topBannerTimeoutRef.current) {
      clearTimeout(topBannerTimeoutRef.current);
    }
    setTopLowStockBanner({ ...entry, closing: false });
    topBannerTimeoutRef.current = setTimeout(() => {
      dismissTopLowStockBanner();
    }, 4500);
  };

  const pushNotification = (
    title: string,
    message: string,
    type: AppNotification['type'] = 'info'
  ) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const entry: AppNotification = { id, title, message, type, time, read: false, closing: false };

    setNotifications((prev) => [entry, ...prev].slice(0, 40));

    if (type === 'low_stock') {
      triggerTopLowStockPop(entry);
    }
  };

  const notifyAllUsersLowStock = async (
    itemName: string,
    sku: string,
    stockCount: number,
    minCount: number
  ) => {
    const alertKey = `${itemName}::${stockCount}::${minCount}`;
    const isOut = stockCount <= 0;
    const message = isOut
      ? `${itemName} (${sku || 'No SKU'}) is OUT OF STOCK (0/${minCount}).`
      : `${itemName} (${sku || 'No SKU'}) is low (${stockCount}/${minCount}).`;

    pushNotification(isOut ? 'Out of Stock Alert' : 'Low Stock Alert', message, 'low_stock');

    if (lowStockChannelRef.current) {
      await lowStockChannelRef.current.send({
        type: 'broadcast',
        event: 'low_stock_alert',
        payload: {
          alertKey,
          title: isOut ? 'Out of Stock Alert' : 'Low Stock Alert',
          message,
          actor: actorNameRef.current,
        },
      });
    }
  };

  const markAllNotificationsRead = () => {
    setNotifications((prev) => prev.map((entry) => ({ ...entry, read: true })));
  };

  const clearNotifications = () => {
    setNotifications([]);
  };

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isTypingField =
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable);

      if (e.key === 'Escape') {
        if (isPickerOpen) setIsPickerOpen(false);
        else if (isModalOpen) closeItemModal();
        else if (docModalOpen) closeDocModal();
        else if (isScannerOpen) closeScannerModal();
        else if (isSettingsOpen) closeSettingsModal();
        else if (isNotifOpen) closeNotifPanel();
        else if (isAuditMaximized) setIsAuditMaximized(false);
      } else if (e.key === '/' && !isTypingField && user) {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    isPickerOpen,
    isModalOpen,
    docModalOpen,
    isScannerOpen,
    isSettingsOpen,
    isNotifOpen,
    isAuditMaximized,
    user,
  ]);

  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  useEffect(() => {
    scanModeRef.current = scanMode;
  }, [scanMode]);

  useEffect(() => {
    scanQuantityRef.current = Math.max(1, Number(scanQuantity) || 1);
  }, [scanQuantity]);

  useEffect(() => {
    let active = true;

    supabase.auth
      .getSession()
      .then(({ data: { session } }) => {
        if (!active) return;
        setUser(session?.user ?? null);
      })
      .catch(() => {
        if (!active) return;
        setUser(null);
      })
      .finally(() => {
        if (active) setAuthLoading(false);
      });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!active) return;
      setUser(session?.user ?? null);
      setAuthLoading(false);
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  const t = {
    text: darkMode ? 'text-white' : 'text-zinc-950',
    textMuted: darkMode ? 'text-zinc-200/85' : 'text-zinc-700',
    textMuted2: darkMode ? 'text-zinc-300/75' : 'text-zinc-600',
    dangerText: darkMode ? 'text-red-400' : 'text-red-700',
    successText: darkMode ? 'text-emerald-400' : 'text-emerald-700',
    warnText: darkMode ? 'text-amber-400' : 'text-amber-800',
    border: darkMode ? 'border-white/20' : 'border-black/20',
    cardBg: darkMode
      ? 'bg-zinc-900/40 backdrop-blur-2xl saturate-150 ring-1 ring-inset ring-white/10'
      : 'bg-white/70 backdrop-blur-2xl saturate-150 ring-1 ring-inset ring-white/70',
    cardBg2: darkMode
      ? 'bg-zinc-900/40 backdrop-blur-2xl saturate-150 ring-1 ring-inset ring-white/10'
      : 'bg-white/75 backdrop-blur-2xl saturate-150 ring-1 ring-inset ring-white/70',
    cardBg3: darkMode
      ? 'bg-white/[0.06] backdrop-blur-xl ring-1 ring-inset ring-white/10'
      : 'bg-white/60 backdrop-blur-xl ring-1 ring-inset ring-black/5',
    cardBgHover: darkMode
      ? 'bg-zinc-900/40 backdrop-blur-xl hover:bg-zinc-800/55 ring-1 ring-inset ring-white/10'
      : 'bg-white/70 backdrop-blur-xl hover:bg-white/95 ring-1 ring-inset ring-black/5',
    inputBg: darkMode
      ? 'bg-black/25 backdrop-blur-xl ring-1 ring-inset ring-white/10'
      : 'bg-white/85 backdrop-blur-xl ring-1 ring-inset ring-black/10',
    btnPrimary: darkMode
      ? 'tpd-click-press bg-white text-black border-white/30 hover:bg-zinc-100 hover:-translate-y-0.5 hover:shadow-lg'
      : 'tpd-click-press bg-zinc-900 text-white border-zinc-900 hover:bg-zinc-800 hover:-translate-y-0.5 hover:shadow-lg',
    btnSecondary: darkMode
      ? 'tpd-click-press bg-white/12 text-white border-white/20 backdrop-blur-xl ring-1 ring-inset ring-white/10 hover:bg-white/20 hover:-translate-y-0.5 hover:shadow-md'
      : 'tpd-click-press bg-white/80 text-zinc-950 border-black/20 hover:bg-white hover:-translate-y-0.5 hover:shadow-md',
    btnDangerSubtle: darkMode
      ? 'tpd-click-press border-red-400/40 bg-red-600/25 text-red-200 hover:bg-red-600/35'
      : 'tpd-click-press border-red-300 bg-red-100 text-red-800 hover:bg-red-200',
    tabActive: darkMode
      ? 'tpd-click-press bg-white text-black shadow-sm'
      : 'tpd-click-press bg-zinc-900 text-white shadow-sm',
    tabInactive: darkMode
      ? 'tpd-click-press bg-white/10 text-zinc-200 hover:bg-white/20 hover:text-white'
      : 'tpd-click-press bg-white/75 text-zinc-800 border border-black/15 hover:bg-white hover:text-zinc-950',
    outBg: darkMode
      ? 'bg-zinc-900/70 text-zinc-200 border-zinc-400/40 backdrop-blur-md'
      : 'bg-zinc-900 text-white border-zinc-900',
    lowBg: darkMode
      ? 'bg-red-500/20 text-red-200 border-red-400/35 backdrop-blur-md'
      : 'bg-red-100 text-red-900 border-red-300',
    okBg: darkMode
      ? 'bg-emerald-500/20 text-emerald-200 border-emerald-400/30 backdrop-blur-md'
      : 'bg-emerald-100 text-emerald-900 border-emerald-300',
    incomingBadge: darkMode
      ? 'bg-emerald-500/20 text-emerald-200 border-emerald-400/35'
      : 'bg-emerald-100 text-emerald-900 border-emerald-300',
    outgoingBadge: darkMode
      ? 'bg-amber-500/20 text-amber-200 border-amber-400/35'
      : 'bg-amber-100 text-amber-950 border-amber-300',
    overlay: darkMode ? 'bg-black/45 backdrop-blur-md' : 'bg-zinc-900/25 backdrop-blur-md',
    modalBg: darkMode
      ? 'bg-zinc-900/55 border-white/20 backdrop-blur-2xl saturate-150 ring-1 ring-inset ring-white/15'
      : 'bg-white/75 border-black/20 backdrop-blur-2xl saturate-150 ring-1 ring-inset ring-white/80',
    badgeBg: darkMode
      ? 'border-white/15 bg-white/[0.08] text-zinc-200 backdrop-blur-md'
      : 'border-black/15 bg-white/80 text-zinc-800',
    needsRestockBg: darkMode
      ? 'bg-red-950/35 backdrop-blur-xl ring-1 ring-inset ring-red-400/15'
      : 'bg-red-50/90 ring-1 ring-inset ring-red-200',
    needsRestockBorder: darkMode ? 'border-red-400/35' : 'border-red-300',
  };

  const getStatusBadgeStyle = (status: ItemStatus) => {
    if (status === 'OUT OF STOCK') return t.outBg;
    if (status === 'LOW') return t.lowBg;
    return t.okBg;
  };

  const iconClass = darkMode ? 'text-zinc-300' : 'text-zinc-700';

  const handleManualAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    setAuthMessage(null);

    const normalizedEmail = authEmail.trim().toLowerCase();
    if (!isGmailAddress(normalizedEmail)) {
      setAuthError('Email address must end with @gmail.com.');
      return;
    }

    if (authMode === 'signup' && authPassword !== authConfirmPassword) {
      setAuthError('Passwords do not match.');
      return;
    }

    setAuthSubmitting(true);

    try {
      if (authMode === 'signup') {
        const { data, error } = await supabase.auth.signUp({ email: normalizedEmail, password: authPassword });
        if (error) throw error;
        if (data.session) setUser(data.session.user);
        else {
          setAuthMessage('Account created! Check your Gmail to confirm your account.');
          setAuthConfirmPassword('');
          setAuthMode('login');
        }
      } else {
        const { data, error } = await supabase.auth.signInWithPassword({ email: normalizedEmail, password: authPassword });
        if (error) throw error;
        setUser(data.user);
      }
    } catch (err: any) {
      setAuthError(err.message || 'Authentication failed.');
    } finally {
      setAuthSubmitting(false);
    }
  };

  const handleGoogleLogin = async () => {
    setAuthError(null);
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: typeof window !== 'undefined' ? window.location.origin : undefined },
    });
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setUser(null);
  };

  const handleDeleteAccount = async () => {
    if (!user || isDeletingAccount) return;
    setIsDeletingAccount(true);
    try {
      const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      await supabase.from('audit_logs').insert([
        {
          action: 'DELETE ACCOUNT',
          item: user.email || actorName,
          detail: `Account deletion requested by ${actorName}`,
          user: actorName,
          time: timestamp,
        },
      ]);
      await supabase.auth.signOut();
      setUser(null);
      setIsSettingsOpen(false);
      setConfirmDeleteAccount(false);
    } finally {
      setIsDeletingAccount(false);
    }
  };

  const toggleColor = (color: string) => {
    setForm((current) => ({
      ...current,
      colors: current.colors.includes(color)
        ? current.colors.filter((entry) => entry !== color)
        : [...current.colors, color],
    }));
  };

  const addColorToForm = (colorName: string) => {
    setForm((current) => ({
      ...current,
      colors: current.colors.includes(colorName)
        ? current.colors
        : [...current.colors, colorName],
    }));
  };

  const addColorToInlineNewGood = (colorName: string) => {
    setInlineNewGood((current) => ({
      ...current,
      colors: current.colors.includes(colorName)
        ? current.colors
        : [...current.colors, colorName],
    }));
  };

  const handleQuickSwatchSelect = (colorName: string) => {
    const hex = getColorFill(colorName);
    setPickerHex(hex);
    setPreviewSwatchName(colorName);
    const rgb = hexToRgb(hex);
    if (rgb) {
      const hsv = rgbToHsv(rgb.r, rgb.g, rgb.b);
      setHue(hsv.h);
      setSat(hsv.s);
      setVal(hsv.v);
    }
  };

  const updateSvFromPointer = (clientX: number, clientY: number, rect: DOMRect) => {
    const nextSat = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    const nextVal = Math.max(0, Math.min(1, 1 - (clientY - rect.top) / rect.height));
    const nextHex = hsvToHex(hue, nextSat, nextVal);
    setSat(nextSat);
    setVal(nextVal);
    setPickerHex(nextHex);
    setPreviewSwatchName(null);
  };

  const updateHueFromValue = (nextHue: number) => {
    const nextHex = hsvToHex(nextHue, sat, val);
    setHue(nextHue);
    setPickerHex(nextHex);
    setPreviewSwatchName(null);
  };

  const buildSkuForCategory = (categoryName?: string) => {
    const prefix =
      (categoryName || 'TPD')
        .replace(/[^a-zA-Z0-9]/g, '')
        .slice(0, 3)
        .toUpperCase() || 'TPD';
    const randomCode = Math.floor(100000 + Math.random() * 900000);
    return `${prefix}-${randomCode}`;
  };

  const generateCustomSku = () => {
    setForm((current) => ({ ...current, sku: buildSkuForCategory(current.category) }));
  };

  const toggleBarcodeExpand = (itemId: string) => {
    setExpandedBarcodes((current) => ({
      ...current,
      [itemId]: !current[itemId],
    }));
  };

  const toggleBarcodeSelection = (itemId: string) => {
    setSelectedBarcodeItemIds((prev) => {
      const next = new Set(prev);
      if (next.has(itemId)) {
        next.delete(itemId);
      } else {
        next.add(itemId);
      }
      return next;
    });
  };

  const toggleGroupCollapse = (categoryName: string) => {
    setCollapsedGroups((current) => ({
      ...current,
      [categoryName]: !current[categoryName],
    }));
  };

  const getItemPrintCopies = (itemId: string): number => {
    const raw = printCopiesByItem[itemId];
    return Math.max(1, Math.min(100, Number(raw) || 1));
  };

  const setItemPrintCopies = (itemId: string, copies: number) => {
    const clamped = Math.max(1, Math.min(100, Number.isNaN(copies) ? 1 : copies));
    setPrintCopiesByItem((prev) => ({ ...prev, [itemId]: clamped }));
  };

  const renderLabelColorDots = (colors: string[] = []) => {
    if (colors.length === 0) return null;
    return (
      <span className="inline-flex items-center gap-1" title={colors.join(', ')}>
        {colors.map((color) => (
          <span
            key={color}
            className="inline-block h-3.5 w-3.5 rounded-full border border-black/40 shrink-0"
            style={{ backgroundColor: getColorFill(color) }}
          />
        ))}
      </span>
    );
  };

  const downloadBarcodePng = (item: InventoryItem) => {
    if (!item.sku) return;
    const container = document.getElementById(`barcode-label-${item.id}`);
    const svg = container?.querySelector('svg');
    if (!svg) return;

    const itemSizeLabel = formatBarcodeItemSizeLabel(item.name, item.size);
    const colors = item.colors || [];
    const isFull = labelFormat === 'full';
    const svgData = new XMLSerializer().serializeToString(svg);
    const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(svgBlob);

    const img = new Image();
    img.onload = () => {
      const padding = 18;
      const headerHeight = isFull ? 44 : 24;
      const footerHeight = isFull ? 24 : 0;
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(img.width + padding * 2, isFull ? 280 : 220);
      canvas.height = img.height + padding * 2 + headerHeight + footerHeight;

      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        ctx.strokeStyle = '#d4d4d8';
        ctx.lineWidth = 1;
        ctx.strokeRect(4, 4, canvas.width - 8, canvas.height - 8);

        let yCursor = padding + 10;
        if (isFull) {
          ctx.fillStyle = '#52525b';
          ctx.font = 'bold 10px Arial, sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText(
            `${(item.category || 'ITEM').toUpperCase()} • SIZE/TYPE ${item.size || '-'}`,
            canvas.width / 2,
            yCursor
          );
          yCursor += 16;
        }

        ctx.fillStyle = '#000000';
        ctx.font = 'bold 13px Arial, sans-serif';
        ctx.textAlign = 'center';
        const dotRadius = 5;
        const dotGap = 13;
        const dotsWidth = colors.length > 0 ? colors.length * dotGap + 6 : 0;
        const textWidth = ctx.measureText(itemSizeLabel).width;
        const groupStartX = canvas.width / 2 - (textWidth + dotsWidth) / 2;

        ctx.textAlign = 'left';
        ctx.fillText(itemSizeLabel, groupStartX, yCursor + 4);

        colors.forEach((color, idx) => {
          const cx = groupStartX + textWidth + 10 + idx * dotGap + dotRadius;
          const cy = yCursor;
          ctx.beginPath();
          ctx.arc(cx, cy, dotRadius, 0, Math.PI * 2);
          ctx.fillStyle = getColorFill(color);
          ctx.fill();
          ctx.lineWidth = 1;
          ctx.strokeStyle = '#3f3f46';
          ctx.stroke();
        });

        const drawX = (canvas.width - img.width) / 2;
        const barcodeTop = padding + headerHeight;
        ctx.drawImage(img, drawX, barcodeTop);

        if (isFull && colors.length > 0) {
          ctx.fillStyle = '#27272a';
          ctx.font = '11px Arial, sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText(`Colors: ${colors.join(', ')}`, canvas.width / 2, barcodeTop + img.height + 16);
        }

        const pngUrl = canvas.toDataURL('image/png');
        const link = document.createElement('a');
        const safeSku = item.sku.replace(/[^a-zA-Z0-9_-]/g, '_');
        link.href = pngUrl;
        link.download = `barcode-${safeSku}-${itemSizeLabel}-${labelFormat}.png`;
        link.click();
      }
      URL.revokeObjectURL(url);
    };
    img.src = url;
  };

  const printBarcodeLabel = (item: InventoryItem, copiesOverride?: number) => {
    if (!item.sku) return;
    const copies = Math.max(1, Math.min(100, copiesOverride ?? getItemPrintCopies(item.id)));
    const cardsHtml = buildSingleBarcodeCardHtml(item, copies, labelFormat);
    if (!cardsHtml) return;
    openPrintWindowWithCards(`THE PRINTING DEPOT - ${item.sku} (${copies}x)`, cardsHtml);
  };

  const printSelectedBarcodes = () => {
    const chosenItems = items.filter(
      (entry) => selectedBarcodeItemIds.has(entry.id) && Boolean(entry.sku)
    );
    if (chosenItems.length === 0) return;

    const allCardsHtml = chosenItems
      .map((entry) => buildSingleBarcodeCardHtml(entry, getItemPrintCopies(entry.id), labelFormat))
      .filter(Boolean)
      .join('');
    if (!allCardsHtml) return;
    openPrintWindowWithCards(
      `THE PRINTING DEPOT - Batch Barcodes (${chosenItems.length} items)`,
      allCardsHtml
    );
  };

  const fetchData = async () => {
    const { data: itemData } = await supabase.from('items').select('*').order('created_at', { ascending: false });
    if (itemData) {
      const mapped: InventoryItem[] = itemData.map((row: any) => {
        const stockNum = Number(row.stock ?? 0);
        const minNum = Number(row.min ?? 5);
        const computedStatus = computeItemStatus(stockNum, minNum);
        return {
          id: String(row.id),
          name: row.name || '',
          sku: row.sku || '',
          category: row.category || '',
          size: row.size || 'M',
          stock: stockNum,
          min: minNum,
          status: computedStatus,
          colors: Array.isArray(row.colors) ? row.colors : [],
        };
      });
      itemsRef.current = mapped;
      setItems(mapped);
    }

    const { data: catData } = await supabase.from('categories').select('*').order('created_at', { ascending: true });
    if (catData) {
      setCategories(catData.map((row: any) => ({ id: String(row.id), name: row.name })));
    }

    const { data: auditData } = await supabase.from('audit_logs').select('*').order('created_at', { ascending: false });
    if (auditData) {
      const mappedAudit: AuditEntry[] = auditData.map((row: any) => {
        const parsed = parseMovementMeta(row.detail || '', row.action || '');
        return {
          id: String(row.id),
          action: row.action,
          item: row.item,
          detail: parsed.cleanDetail,
          user: row.user,
          time: row.time,
          direction: parsed.direction,
          qtyDelta: parsed.qtyDelta,
          meta: parsed.meta,
        };
      });
      setAuditLog(mappedAudit);

      if (!initialAuditLoadedRef.current) {
        mappedAudit.forEach((entry) => seenAuditIdsRef.current.add(entry.id));
        initialAuditLoadedRef.current = true;
      } else {
        for (const entry of [...mappedAudit].reverse()) {
          if (!seenAuditIdsRef.current.has(entry.id)) {
            seenAuditIdsRef.current.add(entry.id);
            if (entry.user && entry.user !== actorNameRef.current) {
              pushNotification(
                `${entry.action} • ${entry.item}`,
                `${entry.detail}`,
                'stock_update'
              );
            }
          }
        }
      }
    }
  };

  useEffect(() => {
    if (!user) return;

    let fetchDebounceRef: ReturnType<typeof setTimeout> | null = null;
    const scheduleFetchData = () => {
      if (fetchDebounceRef) clearTimeout(fetchDebounceRef);
      fetchDebounceRef = setTimeout(() => {
        void fetchData();
      }, 80);
    };

    void fetchData();

    const itemChannel = supabase
      .channel('public:items')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'items' }, (payload: any) => {
        const nextRow = payload?.new;
        if (nextRow) {
          const stockNum = Number(nextRow.stock ?? 0);
          const minNum = Number(nextRow.min ?? 5);
          const statusNow = computeItemStatus(stockNum, minNum);
          if (statusNow === 'OUT OF STOCK' || statusNow === 'LOW') {
            const alertKey = `${nextRow.id ?? nextRow.name}::${stockNum}::${minNum}`;
            if (!seenLowStockKeysRef.current.has(alertKey)) {
              seenLowStockKeysRef.current.add(alertKey);
              pushNotification(
                statusNow === 'OUT OF STOCK' ? 'Out of Stock Alert' : 'Low Stock Alert',
                `${nextRow.name || 'Item'} (${nextRow.sku || 'No SKU'}) is at ${stockNum} stock (Min: ${minNum}).`,
                'low_stock'
              );
            }
          }
        }
        scheduleFetchData();
      })
      .subscribe();

    const alertBroadcastChannel = supabase
      .channel('tpd:all-users-low-stock')
      .on('broadcast', { event: 'low_stock_alert' }, (msg: any) => {
        const data = msg?.payload;
        if (!data) return;
        if (data.alertKey) {
          if (seenLowStockKeysRef.current.has(data.alertKey)) return;
          seenLowStockKeysRef.current.add(data.alertKey);
        }
        pushNotification(
          data.title || 'Low Stock Alert',
          data.message || 'An item reached low stock.',
          'low_stock'
        );
      })
      .subscribe();

    lowStockChannelRef.current = alertBroadcastChannel;

    const catChannel = supabase.channel('public:categories').on('postgres_changes', { event: '*', schema: 'public', table: 'categories' }, scheduleFetchData).subscribe();
    const auditChannel = supabase.channel('public:audit_logs').on('postgres_changes', { event: '*', schema: 'public', table: 'audit_logs' }, scheduleFetchData).subscribe();

    return () => {
      if (fetchDebounceRef) clearTimeout(fetchDebounceRef);
      lowStockChannelRef.current = null;
      supabase.removeChannel(itemChannel);
      supabase.removeChannel(alertBroadcastChannel);
      supabase.removeChannel(catChannel);
      supabase.removeChannel(auditChannel);
    };
  }, [user]);

  const logAudit = async (
    action: string,
    item: string,
    detail: string,
    direction: 'INCOMING' | 'OUTGOING' | 'OTHER' = 'OTHER',
    qtyDelta = 0,
    meta?: MovementMeta
  ) => {
    const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const optimisticEntry: AuditEntry = {
      id: `opt-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      action,
      item,
      detail,
      user: actorName,
      time: timestamp,
      direction,
      qtyDelta,
      meta,
    };
    seenAuditIdsRef.current.add(optimisticEntry.id);
    setAuditLog((prev) => [optimisticEntry, ...prev]);

    const dbDetail = meta ? `${detail} ||META:${JSON.stringify(meta)}` : detail;

    const { data, error } = await supabase
      .from('audit_logs')
      .insert([
        {
          action,
          item,
          detail: dbDetail,
          user: actorName,
          time: timestamp,
        },
      ])
      .select('id')
      .single();

    if (!error && data?.id) {
      const realId = String(data.id);
      seenAuditIdsRef.current.add(realId);
      setAuditLog((prev) =>
        prev.map((entry) => (entry.id === optimisticEntry.id ? { ...entry, id: realId } : entry))
      );
    }
  };

  const deleteAuditLog = async (auditId: string) => {
    setConfirmDeleteAuditId(null);
    const prevLog = auditLog;
    setAuditLog((prev) => {
      const next = prev.filter((entry) => entry.id !== auditId);
      if (next.length === 0) {
        setAuditSelectMode(false);
        setConfirmDeleteSelectedAudit(false);
      }
      return next;
    });
    setSelectedAuditIds((prev) => {
      const next = new Set(prev);
      next.delete(auditId);
      if (next.size === 0) setConfirmDeleteSelectedAudit(false);
      return next;
    });
    if (!auditId.startsWith('opt-')) {
      const { error } = await supabase.from('audit_logs').delete().eq('id', auditId);
      if (error) {
        setAuditLog(prevLog);
        pushNotification('Delete Failed', error.message, 'info');
      }
    }
  };

  const toggleAuditSelection = (auditId: string) => {
    setConfirmDeleteSelectedAudit(false);
    setSelectedAuditIds((prev) => {
      const next = new Set(prev);
      if (next.has(auditId)) {
        next.delete(auditId);
      } else {
        next.add(auditId);
      }
      return next;
    });
  };

  const toggleSelectAllAudit = () => {
    setConfirmDeleteSelectedAudit(false);
    if (selectedAuditIds.size === auditLog.length && auditLog.length > 0) {
      setSelectedAuditIds(new Set());
    } else {
      setSelectedAuditIds(new Set(auditLog.map((entry) => entry.id)));
    }
  };

  const deleteSelectedAuditLogs = async () => {
    if (selectedAuditIds.size === 0 || isClearingAudit) return;
    setIsClearingAudit(true);
    const idsToDelete = Array.from(selectedAuditIds);
    const prevLog = auditLog;

    setAuditLog((prev) => prev.filter((entry) => !selectedAuditIds.has(entry.id)));
    setSelectedAuditIds(new Set());
    setConfirmDeleteSelectedAudit(false);

    const dbIds = idsToDelete.filter((id) => !id.startsWith('opt-'));
    if (dbIds.length > 0) {
      const { error } = await supabase.from('audit_logs').delete().in('id', dbIds);
      if (error) {
        setAuditLog(prevLog);
        pushNotification('Delete Failed', error.message, 'info');
      }
    }
    setIsClearingAudit(false);
  };

  const clearAllAuditLogs = async () => {
    if (auditLog.length === 0 || isClearingAudit) return;
    setIsClearingAudit(true);
    const prevLog = auditLog;
    const realIds = prevLog.map((entry) => entry.id).filter((id) => !id.startsWith('opt-'));

    setAuditLog([]);
    setSelectedAuditIds(new Set());
    setAuditSelectMode(false);
    setConfirmDeleteSelectedAudit(false);
    setConfirmClearAllAudit(false);

    if (realIds.length > 0) {
      const { error } = await supabase.from('audit_logs').delete().in('id', realIds);
      if (error) {
        setAuditLog(prevLog);
        pushNotification('Clear Failed', error.message, 'info');
      }
    }
    setIsClearingAudit(false);
  };

  const adjustStock = async (
    itemId: string,
    delta: number,
    source: 'button' | 'scan' = 'button',
    customNote?: string
  ) => {
    if (!delta) return;
    const currentItems = itemsRef.current.length > 0 ? itemsRef.current : items;
    const item = currentItems.find((entry) => entry.id === itemId);
    if (!item) return;

    const previousStock = item.stock;
    const nextStock = Math.max(0, previousStock + delta);
    const actualDelta = nextStock - previousStock;
    const nextStatus = computeItemStatus(nextStock, item.min);
    const dbStatus = nextStatus === 'OUT OF STOCK' ? 'LOW' : nextStatus;
    const trimmedNote = (customNote ?? '').trim();

    const updatedList = currentItems.map((entry) =>
      entry.id === itemId ? { ...entry, stock: nextStock, status: nextStatus } : entry
    );
    itemsRef.current = updatedList;
    setItems(updatedList);
    triggerStockPulse(itemId);

    void supabase
      .from('items')
      .update({ stock: nextStock, status: dbStatus })
      .eq('id', itemId)
      .then(({ error }) => {
        if (error) {
          void fetchData();
        }
      });

    if (actualDelta !== 0) {
      const isIncoming = actualDelta > 0;
      const reasonText = isIncoming
        ? 'Procurement buy / incoming restock'
        : 'Customer order going out';
      const noteSegment = trimmedNote ? ` • Ref: ${trimmedNote}` : '';
      const statusNote =
        !isIncoming && nextStock === 0
          ? ' (Now OUT OF STOCK)'
          : nextStatus === 'LOW'
            ? ' (Low stock alert)'
            : '';

      void logAudit(
        isIncoming ? 'PROCUREMENT' : 'OUTGOING',
        item.name,
        `${isIncoming ? `+${actualDelta}` : actualDelta} units • ${reasonText} (${previousStock} → ${nextStock} stock)${statusNote}${noteSegment} by ${actorName}`,
        isIncoming ? 'INCOMING' : 'OUTGOING',
        Math.abs(actualDelta),
        {
          sku: item.sku,
          size: item.size,
          colors: item.colors,
          previousStock,
          newStock: nextStock,
          note: trimmedNote || reasonText,
        }
      );
    }

    if (nextStatus === 'OUT OF STOCK' || nextStatus === 'LOW') {
      seenLowStockKeysRef.current.add(`${item.id}::${nextStock}::${item.min}`);
      void notifyAllUsersLowStock(item.name, item.sku, nextStock, item.min);
    } else if (source === 'scan') {
      pushNotification(
        actualDelta >= 0 ? 'Procurement Scan' : 'Outgoing Scan',
        `${item.name}: ${actualDelta >= 0 ? `+${actualDelta}` : actualDelta} (${previousStock} → ${nextStock})`,
        'scan'
      );
    }

    return { item, nextStock, actualDelta, previousStock };
  };

  const processScannedCode = async (
    rawCode: string,
    stopCameraFn?: () => Promise<void>,
    allowCloseModal = true
  ) => {
    const cleaned = rawCode.trim();
    if (!cleaned) return;

    const keepOpen = continuousScanRef.current || batchScanActiveRef.current;
    const playChime = scanSoundEnabledRef.current;
    let shouldUnlockInFinally = keepOpen;

    try {
      setScannerError(null);
      setScanFeedback(null);

      if (docModalOpenRef.current) {
        const matchedCatalogItem = itemsRef.current.find(
          (entry) => entry.sku.trim().toLowerCase() === cleaned.toLowerCase()
        );
        const qty = Math.max(1, Number(scanQuantityRef.current) || 1);

        if (matchedCatalogItem) {
          addCatalogItemToDocument(matchedCatalogItem, qty);
          if (playChime) playScanFeedbackChime(true, keepOpen);
          const msg = `${matchedCatalogItem.name} (+${qty}) added to ${docNo}`;
          setScanSuccessBanner(`Scanned ${msg}`);
          setScanFeedback(`Added ${matchedCatalogItem.name} (${matchedCatalogItem.sku}) x${qty} to goods.`);
          return;
        } else {
          if (playChime) playScanFeedbackChime(false, false);
          setScanFeedback(`No item found with SKU "${cleaned}".`);
          return;
        }
      }

      setQuery(cleaned);
      setStatusFilter('ALL');
      setCategoryFilter('ALL');
      setActiveTab('inventory');

      const currentMode = scanModeRef.current;

      if (currentMode === 'search') {
        const match = itemsRef.current.find(
          (entry) =>
            entry.sku.trim().toLowerCase() === cleaned.toLowerCase() ||
            `${entry.name} ${entry.sku}`.toLowerCase().includes(cleaned.toLowerCase())
        );
        if (playChime) playScanFeedbackChime(true, keepOpen);
        const summary = match
          ? `${match.name} (${match.size || '-'}) • ${match.stock} in stock • ${match.status}`
          : `Showing matches for "${cleaned}"`;
        setLastScannedSummary(summary);
        setScanSuccessBanner(`Found: ${summary}`);
        setScanFeedback(`Shown in Inventory: ${summary}`);
        pushNotification('Barcode Scanned', `Found ${summary}.`, 'scan');

        if (!keepOpen) {
          shouldUnlockInFinally = false;
          if (stopCameraFn) await stopCameraFn();
          if (allowCloseModal) closeScannerModal();
        }
        return;
      }

      const matchedItem = itemsRef.current.find(
        (entry) => entry.sku.trim().toLowerCase() === cleaned.toLowerCase()
      );

      if (!matchedItem) {
        if (playChime) playScanFeedbackChime(false, false);
        setScanFeedback(`No exact SKU match for "${cleaned}".`);
        pushNotification('SKU Not Found', `No exact SKU match for "${cleaned}".`, 'low_stock');

        if (!keepOpen) {
          shouldUnlockInFinally = false;
          if (stopCameraFn) await stopCameraFn();
          if (allowCloseModal) closeScannerModal();
        }
        return;
      }

      const qty = Math.max(1, Number(scanQuantityRef.current) || 1);
      const delta = currentMode === 'add' ? qty : -qty;
      const result = await adjustStock(matchedItem.id, delta, 'scan');
      const prevCount = result?.previousStock ?? matchedItem.stock;
      const resultingStock = result?.nextStock ?? Math.max(0, matchedItem.stock + delta);
      const actualDelta = result?.actualDelta ?? delta;

      if (playChime) playScanFeedbackChime(true, keepOpen);
      const dirTag = actualDelta >= 0 ? 'ADD' : 'DEDUCT';
      const label = `${matchedItem.name} [${dirTag} ${actualDelta >= 0 ? `+${actualDelta}` : actualDelta} • ${prevCount} → ${resultingStock}]`;
      setLastScannedSummary(label);
      setScanSuccessBanner(`Scanned ${label}`);
      setScanFeedback(
        `${matchedItem.name}: ${actualDelta >= 0 ? 'Added' : 'Deducted'} ${Math.abs(actualDelta)} (${prevCount} → ${resultingStock}).`
      );

      if (!keepOpen) {
        shouldUnlockInFinally = false;
        if (stopCameraFn) await stopCameraFn();
        if (allowCloseModal) closeScannerModal();
      }
    } finally {
      if (shouldUnlockInFinally) {
        setTimeout(() => {
          scanLockedRef.current = false;
        }, 350);
      }
    }
  };

  useEffect(() => {
    let active = true;

    const cleanupDomVideoTracks = () => {
      const readerEl = document.getElementById('barcode-camera-reader');
      if (!readerEl) return;
      const videos = readerEl.querySelectorAll('video');
      videos.forEach((video) => {
        const stream = video.srcObject as MediaStream | null;
        if (stream) {
          stream.getTracks().forEach((track) => track.stop());
          video.srcObject = null;
        }
      });
    };

    const stopScanner = async () => {
      const instance = scannerInstanceRef.current;
      if (instance && scannerRunningRef.current) {
        scannerRunningRef.current = false;
        try {
          await instance.stop();
        } catch {
          // Ignore stop errors
        }
        try {
          instance.clear();
        } catch {
          // Ignore clear errors
        }
      }
      cleanupDomVideoTracks();
    };

    const startScanner = async () => {
      if (!isScannerOpen) {
        await stopScanner();
        return;
      }

      if (typeof window !== 'undefined') {
        const isLocalhost =
          window.location.hostname === 'localhost' ||
          window.location.hostname === '127.0.0.1' ||
          window.location.hostname === '[::1]';
        if (!window.isSecureContext && !isLocalhost) {
          setScannerError('Camera requires HTTPS or localhost.');
          return;
        }
        if (!navigator.mediaDevices || typeof navigator.mediaDevices.getUserMedia !== 'function') {
          setScannerError('Camera API is unavailable in this browser.');
          return;
        }
      }

      await stopScanner();
      if (!active) return;

      scanLockedRef.current = false;
      setScannerError(null);
      setScanFeedback(null);
      setScanSuccessBanner(null);

      try {
        const mod = await import('html5-qrcode');
        if (!active) return;

        const { Html5Qrcode, Html5QrcodeSupportedFormats } = mod;
        const scanner =
          scannerInstanceRef.current ||
          new Html5Qrcode('barcode-camera-reader', {
            formatsToSupport: [
              Html5QrcodeSupportedFormats.CODE_128,
              Html5QrcodeSupportedFormats.CODE_39,
              Html5QrcodeSupportedFormats.EAN_13,
              Html5QrcodeSupportedFormats.EAN_8,
              Html5QrcodeSupportedFormats.UPC_A,
              Html5QrcodeSupportedFormats.UPC_E,
              Html5QrcodeSupportedFormats.QR_CODE,
            ],
            useBarCodeDetectorIfSupported: true,
            verbose: false,
          });
        scannerInstanceRef.current = scanner;

        const scanConfig = {
          fps: 24,
          aspectRatio: 1.333,
          qrbox: (viewfinderWidth: number, viewfinderHeight: number) => {
            const width = Math.min(280, Math.max(170, Math.floor(viewfinderWidth * 0.82)));
            const height = Math.min(130, Math.max(76, Math.floor(viewfinderHeight * 0.55)));
            return { width, height };
          },
        };

        const onDecoded = async (decodedText: string) => {
          if (!active || scanLockedRef.current) return;
          const cleaned = decodedText.trim();
          if (!cleaned) return;

          scanLockedRef.current = true;
          await processScannedCode(cleaned, stopScanner, true);
        };

        const onFrameMiss = () => {};

        let cameraDevices: { id: string; label: string }[] = [];
        try {
          const rawCams = await Html5Qrcode.getCameras();
          if (rawCams && rawCams.length > 0) {
            cameraDevices = rawCams.map((cam, idx) => ({
              id: cam.id,
              label: cam.label || `Camera ${idx + 1}`,
            }));
          }
        } catch {}

        let started = false;
        let lastStartError: any = null;

        const backCamId = cameraDevices.find((c) => /back|rear|environment/i.test(c.label))?.id;
        if (backCamId) {
          try {
            await scanner.start(backCamId, scanConfig, onDecoded, onFrameMiss);
            started = true;
          } catch (err) {
            lastStartError = err;
          }
        }

        if (!started && active) {
          try {
            await scanner.start({ facingMode: 'environment' }, scanConfig, onDecoded, onFrameMiss);
            started = true;
          } catch (err) {
            lastStartError = err;
          }
        }

        if (!started && active) {
          try {
            await scanner.start({ facingMode: 'user' }, scanConfig, onDecoded, onFrameMiss);
            started = true;
          } catch (err) {
            lastStartError = err;
          }
        }

        if (!started && cameraDevices.length > 0 && active) {
          for (const cam of cameraDevices) {
            try {
              await scanner.start(cam.id, scanConfig, onDecoded, onFrameMiss);
              started = true;
              break;
            } catch (err) {
              lastStartError = err;
            }
          }
        }

        if (started && active) {
          scannerRunningRef.current = true;
        } else if (active) {
          const errName = String(lastStartError?.name || '');
          const errMsg = String(lastStartError?.message || '');
          if (/NotAllowedError|PermissionDenied/i.test(errName + errMsg)) {
            setScannerError('Camera permission denied. Allow access and tap Retry.');
          } else if (/NotFoundError|DevicesNotFound/i.test(errName + errMsg)) {
            setScannerError('No camera detected on this device.');
          } else if (/NotReadableError|TrackStartError|AbortError/i.test(errName + errMsg)) {
            setScannerError('Camera is busy. Close other camera apps and tap Retry.');
          } else {
            setScannerError(`Camera could not start${errMsg ? ` (${errMsg})` : ''}. Tap Retry.`);
          }
        }
      } catch (err: any) {
        if (active) {
          const detail = err?.message ? ` (${err.message})` : '';
          setScannerError(`Scanner failed to start${detail}.`);
        }
      }
    };

    void startScanner();

    return () => {
      active = false;
      void stopScanner();
    };
  }, [isScannerOpen, cameraRestartNonce]);

  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      const matchesQuery = `${item.name} ${item.sku} ${item.size} ${(item.colors || []).join(' ')}`.toLowerCase().includes(query.toLowerCase());
      const matchesStatus = statusFilter === 'ALL' || item.status === statusFilter;
      const matchesCategory = categoryFilter === 'ALL' || item.category === categoryFilter;
      return matchesQuery && matchesStatus && matchesCategory;
    });
  }, [items, query, statusFilter, categoryFilter]);

  const groupedFilteredItems = useMemo(() => {
    const groupMap = new Map<string, InventoryItem[]>();

    categories.forEach((cat) => {
      groupMap.set(cat.name, []);
    });

    filteredItems.forEach((item) => {
      const catName = item.category?.trim() || 'Uncategorized';
      if (!groupMap.has(catName)) {
        groupMap.set(catName, []);
      }
      groupMap.get(catName)!.push(item);
    });

    const groups: {
      category: string;
      items: InventoryItem[];
      totalStock: number;
      lowCount: number;
      allColors: string[];
    }[] = [];

    groupMap.forEach((groupItems, category) => {
      if (groupItems.length === 0) return;
      const totalStock = groupItems.reduce((sum, item) => sum + item.stock, 0);
      const lowCount = groupItems.filter((item) => item.status === 'LOW' || item.status === 'OUT OF STOCK').length;
      const allColors = Array.from(new Set(groupItems.flatMap((item) => item.colors || [])));
      groups.push({
        category,
        items: groupItems,
        totalStock,
        lowCount,
        allColors,
      });
    });

    return groups;
  }, [filteredItems, categories]);

  const incomingDocuments = useMemo(
    () => documents.filter((d) => d.kind === 'INCOMING'),
    [documents]
  );

  const outgoingDocuments = useMemo(
    () => documents.filter((d) => d.kind === 'OUTGOING'),
    [documents]
  );

  const pendingIncomingCount = useMemo(
    () => incomingDocuments.filter((d) => d.status === 'PENDING').length,
    [incomingDocuments]
  );

  const pendingOutgoingCount = useMemo(
    () => outgoingDocuments.filter((d) => d.status === 'PENDING').length,
    [outgoingDocuments]
  );

  const incomingEntries = useMemo(() => {
    return auditLog.filter((entry) => {
      const parsed = parseMovementMeta(entry.detail || '', entry.action || '');
      return (entry.direction || parsed.direction) === 'INCOMING';
    });
  }, [auditLog]);

  const outgoingEntries = useMemo(() => {
    return auditLog.filter((entry) => {
      const parsed = parseMovementMeta(entry.detail || '', entry.action || '');
      return (entry.direction || parsed.direction) === 'OUTGOING';
    });
  }, [auditLog]);

  const totalIncomingUnits = useMemo(() => {
    return incomingEntries.reduce((sum, entry) => {
      const qty =
        typeof entry.qtyDelta === 'number' && entry.qtyDelta > 0
          ? entry.qtyDelta
          : parseMovementMeta(entry.detail || '', entry.action || '').qtyDelta;
      return sum + qty;
    }, 0);
  }, [incomingEntries]);

  const totalOutgoingUnits = useMemo(() => {
    return outgoingEntries.reduce((sum, entry) => {
      const qty =
        typeof entry.qtyDelta === 'number' && entry.qtyDelta > 0
          ? entry.qtyDelta
          : parseMovementMeta(entry.detail || '', entry.action || '').qtyDelta;
      return sum + qty;
    }, 0);
  }, [outgoingEntries]);

  const hasActiveFilters = query.trim() !== '' || statusFilter !== 'ALL' || categoryFilter !== 'ALL';

  const resetFilters = () => {
    setQuery('');
    setStatusFilter('ALL');
    setCategoryFilter('ALL');
  };

  const totalValue = items.reduce((sum, item) => sum + item.stock * UNIT_ESTIMATED_PRICE, 0);
  const lowStockItems = useMemo(
    () => items.filter((item) => item.status === 'LOW' || item.status === 'OUT OF STOCK'),
    [items]
  );
  const lowStockCount = lowStockItems.length;

  const copyRestockOrder = async () => {
    if (lowStockItems.length === 0) return;
    const lines = lowStockItems.map((item) => {
      const colorPart = item.colors.length ? ` [${item.colors.join(', ')}]` : '';
      return `- ${item.name} (${item.sku || 'No SKU'}) • Size/Type: ${item.size}${colorPart} • Stock: ${item.stock}/${item.min} → ${item.status}`;
    });
    const text = `THE PRINTING DEPOT — PROCUREMENT BUY LIST\n${lines.join('\n')}`;
    try {
      await navigator.clipboard.writeText(text);
      setCopiedRestockList(true);
      pushNotification('Buy List Copied', `${lowStockItems.length} item(s) copied.`, 'info');
      setTimeout(() => setCopiedRestockList(false), 1200);
    } catch {
      pushNotification('Copy Unavailable', 'Unable to access clipboard.', 'info');
    }
  };

  const scrollInventoryToFit = () => {
    requestAnimationFrame(() => {
      inventorySectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });
  };

  const openCreateModal = (defaultCategory?: string) => {
    setActiveTab('inventory');
    scrollInventoryToFit();
    setEditingId(null);
    setForm({
      name: '',
      sku: '',
      category: defaultCategory || categories[0]?.name || 'Shirts',
      size: 'M',
      stock: '0',
      min: '5',
      colors: [],
    });
    setPreviewSwatchName(null);
    setSaveSuccess(false);
    setIsSavingItem(false);
    setIsPickerOpen(false);
    setIsModalOpen(true);
  };

  const openEditModal = (item: InventoryItem) => {
    setEditingId(item.id);
    setForm({
      name: item.name,
      sku: item.sku,
      category: item.category,
      size: item.size,
      stock: String(item.stock),
      min: String(item.min),
      colors: item.colors || [],
    });
    setPreviewSwatchName(null);
    setSaveSuccess(false);
    setIsSavingItem(false);
    setIsPickerOpen(false);
    setIsModalOpen(true);
  };

  const submitItem = () => {
    if (isSavingItem || saveSuccess) return;
    setIsSavingItem(true);

    const stockVal = Math.max(0, Number(form.stock) || 0);
    const minVal = Math.max(0, Number(form.min) || 0);
    const calculatedStatus: ItemStatus = computeItemStatus(stockVal, minVal);
    const dbStatus = calculatedStatus === 'OUT OF STOCK' ? 'LOW' : calculatedStatus;

    const dbPayload = {
      name: form.name,
      sku: form.sku,
      category: form.category,
      size: form.size,
      stock: stockVal,
      min: minVal,
      status: dbStatus,
      colors: form.colors,
    };

    const localPayload: Omit<InventoryItem, 'id'> = {
      name: form.name,
      sku: form.sku,
      category: form.category,
      size: form.size,
      stock: stockVal,
      min: minVal,
      status: calculatedStatus,
      colors: form.colors,
    };

    const previousItems = itemsRef.current;

    if (editingId) {
      const existingItem = previousItems.find((entry) => entry.id === editingId);
      const prevStock = existingItem ? existingItem.stock : stockVal;
      const stockDiff = stockVal - prevStock;

      const updatedList = previousItems.map((entry) =>
        entry.id === editingId ? { ...entry, ...localPayload } : entry
      );
      itemsRef.current = updatedList;
      setItems(updatedList);
      triggerStockPulse(editingId);
      closeItemModal();

      void supabase.from('items').update(dbPayload).eq('id', editingId).then(({ error }) => {
        if (error) {
          itemsRef.current = previousItems;
          setItems(previousItems);
          pushNotification('Update Failed', error.message, 'info');
          return;
        }
        if (stockDiff > 0) {
          void logAudit(
            'PROCUREMENT',
            form.name,
            `+${stockDiff} units • Procurement buy / incoming stock (${prevStock} → ${stockVal} stock) by ${actorName}`,
            'INCOMING',
            stockDiff,
            {
              sku: form.sku,
              size: form.size,
              colors: form.colors,
              previousStock: prevStock,
              newStock: stockVal,
              note: 'Procurement planning to buy',
            }
          );
        } else if (stockDiff < 0) {
          void logAudit(
            'OUTGOING',
            form.name,
            `${stockDiff} units • Customer order going out (${prevStock} → ${stockVal} stock) by ${actorName}`,
            'OUTGOING',
            Math.abs(stockDiff),
            {
              sku: form.sku,
              size: form.size,
              colors: form.colors,
              previousStock: prevStock,
              newStock: stockVal,
              note: 'Customer order fulfillment',
            }
          );
        } else {
          void logAudit('EDIT ITEM', form.name, `Edited item details by ${actorName}`, 'OTHER', 0, {
            sku: form.sku,
            size: form.size,
            colors: form.colors,
            previousStock: prevStock,
            newStock: stockVal,
          });
        }
        if (calculatedStatus === 'OUT OF STOCK' || calculatedStatus === 'LOW') {
          seenLowStockKeysRef.current.add(`${editingId}::${stockVal}::${minVal}`);
          void notifyAllUsersLowStock(form.name, form.sku, stockVal, minVal);
        }
      });
    } else {
      const tempId = `temp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      const optimisticItem: InventoryItem = { id: tempId, ...localPayload };
      const updatedList = [optimisticItem, ...previousItems];
      itemsRef.current = updatedList;
      setItems(updatedList);
      closeItemModal();

      void supabase
        .from('items')
        .insert([dbPayload])
        .select('id')
        .single()
        .then(({ data, error }) => {
          if (error) {
            itemsRef.current = previousItems;
            setItems(previousItems);
            pushNotification('Create Failed', error.message, 'info');
            return;
          }
          if (data?.id) {
            const realId = String(data.id);
            const replaced = itemsRef.current.map((entry) =>
              entry.id === tempId ? { ...entry, id: realId } : entry
            );
            itemsRef.current = replaced;
            setItems(replaced);
          }
          if (stockVal > 0) {
            void logAudit(
              'PROCUREMENT',
              form.name,
              `+${stockVal} units • Initial procurement stock (0 → ${stockVal} stock) by ${actorName}`,
              'INCOMING',
              stockVal,
              {
                sku: form.sku,
                size: form.size,
                colors: form.colors,
                previousStock: 0,
                newStock: stockVal,
                note: 'Initial procurement buy',
              }
            );
          } else {
            void logAudit('NEW ITEM', form.name, `Created new item (0 stock) by ${actorName}`, 'OTHER', 0, {
              sku: form.sku,
              size: form.size,
              colors: form.colors,
              previousStock: 0,
              newStock: 0,
            });
          }
          if (calculatedStatus === 'OUT OF STOCK' || calculatedStatus === 'LOW') {
            seenLowStockKeysRef.current.add(`${form.name}::${stockVal}::${minVal}`);
            void notifyAllUsersLowStock(form.name, form.sku, stockVal, minVal);
          }
        });
    }
  };

  const deleteItem = (itemId: string) => {
    setConfirmDeleteItemId((prev) => (prev === itemId ? null : null));
    const previousItems = itemsRef.current;
    const item = previousItems.find((entry) => entry.id === itemId);
    const filtered = previousItems.filter((entry) => entry.id !== itemId);
    itemsRef.current = filtered;
    setItems(filtered);
    setSelectedBarcodeItemIds((prev) => {
      const next = new Set(prev);
      next.delete(itemId);
      return next;
    });

    void supabase.from('items').delete().eq('id', itemId).then(({ error }) => {
      if (error) {
        itemsRef.current = previousItems;
        setItems(previousItems);
        return;
      }
      if (item) {
        void logAudit('REMOVE ITEM', item.name, `Removed item by ${actorName}`, 'OTHER', 0, {
          sku: item.sku,
          size: item.size,
          colors: item.colors,
          previousStock: item.stock,
          newStock: 0,
        });
      }
    });
  };

  const addCategory = () => {
    const cleanName = newCategory.trim();
    if (!cleanName || isAddingCategory || categoryAddSuccess) return;

    if (categories.some((cat) => cat.name.toLowerCase() === cleanName.toLowerCase())) {
      pushNotification('Duplicate Category', `"${cleanName}" already exists.`, 'info');
      return;
    }

    const tempId = `temp-cat-${Date.now()}`;
    const prevCategories = categories;
    setCategories((prev) => [...prev, { id: tempId, name: cleanName }]);
    setNewCategory('');

    void supabase
      .from('categories')
      .insert([{ name: cleanName }])
      .select('id')
      .single()
      .then(({ data, error }) => {
        if (error) {
          setCategories(prevCategories);
          pushNotification('Category Error', error.message, 'info');
          return;
        }
        if (data?.id) {
          setCategories((prev) =>
            prev.map((cat) => (cat.id === tempId ? { ...cat, id: String(data.id) } : cat))
          );
        }
        void logAudit('ADD CATEGORY', cleanName, `Added category by ${actorName}`, 'OTHER', 0);
      });
  };

  const deleteCategory = (categoryId: string, categoryName: string) => {
    setConfirmDeleteCategoryId(null);
    const hasItems = itemsRef.current.some((item) => item.category === categoryName);
    if (hasItems) {
      pushNotification('Category In Use', `Reassign items in "${categoryName}" first.`, 'info');
      return;
    }

    const prevCategories = categories;
    setCategories((prev) => prev.filter((cat) => cat.id !== categoryId));
    if (categoryFilter === categoryName) {
      setCategoryFilter('ALL');
    }

    void supabase.from('categories').delete().eq('id', categoryId).then(({ error }) => {
      if (error) {
        setCategories(prevCategories);
        pushNotification('Category Error', error.message, 'info');
        return;
      }
      void logAudit('REMOVE CATEGORY', categoryName, `Removed category by ${actorName}`, 'OTHER', 0);
    });
  };

  const exportInventory = (format: 'csv') => {
    const rows = items.map((item) => ({
      brand: 'THE PRINTING DEPOT',
      name: item.name,
      sku: item.sku,
      category: item.category,
      size: item.size,
      stock: item.stock,
      min: item.min,
      status: item.status,
      colors: (item.colors || []).join(', '),
    }));
    if (format === 'csv') {
      const csv = Papa.unparse(rows);
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'printing-depot-inventory.csv';
      link.click();
      URL.revokeObjectURL(url);
    }
  };

  const handleExportPdfChoice = (choice: 'all' | 'filtered') => {
    if (choice === 'all') {
      downloadInventoryPdf(
        'Complete Inventory Report',
        'All inventory items across all categories and statuses',
        items,
        'all'
      );
    } else {
      const filterDesc = [
        query.trim() ? `Search: "${query.trim()}"` : null,
        statusFilter !== 'ALL' ? `Status: ${statusFilter}` : null,
        categoryFilter !== 'ALL' ? `Category: ${categoryFilter}` : null,
      ]
        .filter(Boolean)
        .join(' • ');

      downloadInventoryPdf(
        'Filtered Inventory Report',
        filterDesc || 'Current filtered / displayed inventory items',
        filteredItems,
        'filtered'
      );
    }
  };

  const renderStockDocumentCard = (doc: StockDocument) => {
    const isIncoming = doc.kind === 'INCOMING';
    const isPending = doc.status === 'PENDING';
    const totalUnits = doc.goods.reduce((sum, line) => sum + line.qty, 0);
    const isConfirmingDocDelete = confirmDeleteDocId === doc.id;

    return (
      <div
        key={doc.id}
        className={`rounded-2xl border p-4 transition-all duration-150 ${
          isPending
            ? isIncoming
              ? 'border-emerald-400/35 bg-emerald-500/12 backdrop-blur-xl'
              : 'border-white/25 bg-white/[0.09] backdrop-blur-xl'
            : `${t.border} ${t.cardBg3}`
        }`}
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-black text-sm">{doc.docNo}</span>
              <span
                className={`rounded-full border px-2.5 py-0.5 text-[10px] font-bold ${
                  isPending
                    ? isIncoming
                      ? t.incomingBadge
                      : t.badgeBg
                    : t.okBg
                }`}
              >
                {isPending ? 'PENDING' : isIncoming ? 'ADDED' : 'DEDUCTED'}
              </span>
              <span className={`rounded-full border ${t.badgeBg} px-2 py-0.5 text-[10px] font-bold tabular-nums`}>
                {totalUnits} qty
              </span>
            </div>

            <div className={`mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs ${t.textMuted}`}>
              {doc.partyName && doc.partyName !== 'Select' && (
                <span>
                  <strong>{isIncoming ? 'Supplier:' : 'Customer:'}</strong> {doc.partyName}
                </span>
              )}
              <span className="tabular-nums">{doc.dateTime}</span>
              {doc.description && <span>&bull; {doc.description}</span>}
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {isPending && (
              <button
                type="button"
                onClick={() => void commitDocumentToInventory(doc.id)}
                title={
                  isIncoming
                    ? 'Add goods to inventory'
                    : 'Deduct goods from stock'
                }
                aria-label="Confirm and apply to stock"
                className="tpd-click-press inline-flex items-center gap-1 rounded-xl border border-emerald-400/40 bg-emerald-600 px-3 py-1.5 text-xs font-extrabold text-white shadow-sm hover:bg-emerald-700"
              >
                <Check size={14} strokeWidth={3} />
                <span>{isIncoming ? 'Arrive & Add' : 'Deduct Stock'}</span>
              </button>
            )}
            {isPending && (
              <button
                type="button"
                onClick={() => openEditDocumentModal(doc)}
                title="Edit document"
                className={`tpd-click-press rounded-xl border ${t.border} ${t.btnSecondary} p-1.5`}
              >
                <Edit3 size={13} />
              </button>
            )}
            <button
              type="button"
              onClick={() => setConfirmDeleteDocId((prev) => (prev === doc.id ? null : doc.id))}
              title="Delete document"
              className={`tpd-click-press rounded-xl border ${t.border} p-1.5 ${t.dangerText} hover:bg-red-500/15`}
            >
              <Trash2 size={13} />
            </button>
          </div>
        </div>

        {isConfirmingDocDelete && (
          <div
            className={`tpd-slide-down mt-2.5 flex items-center justify-between gap-2 rounded-xl border ${t.needsRestockBorder} ${t.needsRestockBg} px-3 py-1.5 text-xs`}
          >
            <span className="font-semibold">you want to delete ?</span>
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={() => void deleteStockDocument(doc.id)}
                className="tpd-click-press rounded-lg border border-red-700 bg-red-600 px-2.5 py-0.5 text-[11px] font-bold text-white hover:bg-red-700"
              >
                Yes
              </button>
              <button
                type="button"
                onClick={() => setConfirmDeleteDocId(null)}
                className={`tpd-click-press rounded-lg border ${t.border} ${t.btnSecondary} px-2.5 py-0.5 text-[11px] font-semibold`}
              >
                No
              </button>
            </div>
          </div>
        )}

        <div className={`mt-3 space-y-1.5 border-t ${t.border} pt-2.5`}>
          {doc.goods.map((line) => {
            const matchedInv = items.find(
              (inv) =>
                (line.itemId && inv.id === line.itemId) ||
                (line.sku && inv.sku.trim().toLowerCase() === line.sku.trim().toLowerCase())
            );
            const projectedStock = matchedInv
              ? isIncoming
                ? matchedInv.stock + line.qty
                : Math.max(0, matchedInv.stock - line.qty)
              : isIncoming
                ? line.qty
                : 0;

            return (
              <div
                key={line.id}
                className={`flex flex-wrap items-center justify-between gap-2 rounded-xl border ${t.border} ${t.cardBg2} px-3 py-2 text-xs`}
              >
                <div className="min-w-0">
                  <span className="font-bold">{line.name}</span>
                  {line.isNewCatalogItem && (
                    <span className={`ml-1.5 rounded-full border ${t.badgeBg} px-1.5 py-0.5 text-[9px] font-bold`}>
                      NEW
                    </span>
                  )}
                  {line.sku && <span className={`ml-2 font-mono text-[11px] ${t.textMuted2}`}>{line.sku}</span>}
                  {line.size && <span className={`ml-2 text-[11px] ${t.textMuted}`}>({line.size})</span>}
                  {(line.colors || []).length > 0 && (
                    <span className="ml-2 inline-flex items-center gap-1 align-middle">
                      {(line.colors || []).map((c) => (
                        <ColorCircle key={c} color={c} size="sm" />
                      ))}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0 tabular-nums">
                  <span className="font-extrabold">
                    {isIncoming ? `+${line.qty}` : `-${line.qty}`}
                  </span>
                  {isPending && (
                    <span className={`text-[11px] ${t.textMuted2}`}>
                      ({matchedInv ? matchedInv.stock : 0} → {projectedStock})
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const renderMovementCard = (entry: AuditEntry, kind: 'incoming' | 'outgoing') => {
    const parsed = parseMovementMeta(entry.detail || '', entry.action || '');
    const meta = entry.meta || parsed.meta;
    const qty =
      typeof entry.qtyDelta === 'number' && entry.qtyDelta > 0 ? entry.qtyDelta : parsed.qtyDelta;
    const isIncoming = kind === 'incoming';

    return (
      <div
        key={entry.id}
        className={`rounded-2xl border ${t.border} ${t.cardBgHover} p-3.5 transition-all duration-150 ease-out motion-reduce:transition-none`}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-bold text-sm truncate">{entry.item}</p>
              <span
                className={`rounded-full border px-2 py-0.5 text-[10px] font-bold shrink-0 ${
                  isIncoming ? t.incomingBadge : t.badgeBg
                }`}
              >
                {isIncoming ? 'PROCUREMENT' : 'OUTGOING'}
              </span>
              {qty > 0 && (
                <span className={`rounded-full border ${t.badgeBg} px-2 py-0.5 text-[10px] font-extrabold tabular-nums`}>
                  {isIncoming ? `+${qty}` : `-${qty}`}
                </span>
              )}
            </div>

            <p className={`mt-1 text-xs ${t.textMuted}`}>{entry.detail}</p>

            <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px]">
              {meta?.docNo && (
                <span className={`rounded-lg border ${t.badgeBg} px-2 py-0.5 font-bold`}>
                  {meta.docNo}
                </span>
              )}
              {meta?.partyName && meta.partyName !== 'Select' && (
                <span className={`rounded-lg border ${t.badgeBg} px-2 py-0.5`}>
                  {meta.partyName}
                </span>
              )}
              {meta?.sku && (
                <span className={`rounded-lg border ${t.badgeBg} px-2 py-0.5 font-mono`}>
                  {meta.sku}
                </span>
              )}
              {typeof meta?.previousStock === 'number' && typeof meta?.newStock === 'number' && (
                <span className={`rounded-lg border ${t.badgeBg} px-2 py-0.5 font-semibold tabular-nums`}>
                  {meta.previousStock} → {meta.newStock}
                </span>
              )}
            </div>

            {entry.user && (
              <p className={`mt-1.5 text-[11px] font-medium ${t.successText} truncate`}>
                By: {entry.user}
              </p>
            )}
          </div>

          <div className={`text-right text-xs ${t.textMuted2} shrink-0 tabular-nums`}>
            <p className="font-semibold">{entry.action}</p>
            <p>{entry.time}</p>
          </div>
        </div>
      </div>
    );
  };

  const renderInventoryCard = (item: InventoryItem) => {
    const isExpanded = Boolean(expandedBarcodes[item.id]);
    const isPulsed = Boolean(pulsedItemIds[item.id]);
    const isBarcodeSelected = selectedBarcodeItemIds.has(item.id);
    const isConfirmingDelete = confirmDeleteItemId === item.id;
    const customQty = Math.max(1, Number(customCardQty[item.id]) || 5);
    const copiesCount = getItemPrintCopies(item.id);
    const barcodeItemSizeLabel = formatBarcodeItemSizeLabel(item.name, item.size);
    const isOutOfStock = item.stock <= 0 || item.status === 'OUT OF STOCK';

    return (
      <div
        key={item.id}
        className={`flex flex-col justify-between rounded-2xl border p-3 transition-all duration-150 ease-out motion-reduce:transition-none hover:-translate-y-0.5 hover:shadow-lg ${
          isBarcodeSelected
            ? 'border-sky-400/70 ring-2 ring-sky-400/20'
            : isPulsed
              ? 'border-emerald-500/70 ring-2 ring-emerald-500/20'
              : t.border
        } ${t.cardBgHover}`}
      >
        <div>
          <div className="flex items-start justify-between gap-1.5">
            <div className="flex items-start gap-2 min-w-0 flex-1">
              {barcodeSelectMode && (
                <input
                  type="checkbox"
                  checked={isBarcodeSelected}
                  onChange={() => toggleBarcodeSelection(item.id)}
                  aria-label={`Select barcode for ${item.name}`}
                  className="mt-0.5 h-3.5 w-3.5 rounded border-zinc-600 accent-sky-400 cursor-pointer shrink-0"
                />
              )}
              <div className="min-w-0 flex-1">
                <p className="font-bold text-xs sm:text-sm truncate">{item.name}</p>
                <p className={`text-[11px] ${t.textMuted2} truncate`}>
                  {item.sku || 'No SKU'} &bull; {item.size}
                </p>
              </div>
            </div>
            <span
              className={`rounded-full border px-2 py-0.5 text-[10px] font-bold shrink-0 ${getStatusBadgeStyle(
                item.status
              )}`}
            >
              {item.status}
            </span>
          </div>

          <div className="mt-2 flex items-center justify-between gap-2 text-xs tabular-nums">
            <span className={t.textMuted}>
              Stock:{' '}
              <strong
                className={`inline-block transition-transform duration-150 ease-out motion-reduce:transition-none ${
                  isPulsed
                    ? `scale-105 ${t.successText}`
                    : isOutOfStock
                      ? `${t.dangerText} font-black`
                      : t.text
                }`}
              >
                {item.stock}
              </strong>
            </span>
            <span className={`text-[11px] ${t.textMuted2}`}>Min: {item.min}</span>
          </div>

          {(item.colors || []).length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {(item.colors || []).map((color) => (
                <span
                  key={color}
                  className={`group inline-flex items-center gap-1 rounded-full border ${t.badgeBg} px-2 py-0.5 text-[10px]`}
                >
                  <ColorCircle color={color} size="sm" />
                  <span className="truncate max-w-[68px]">{color}</span>
                </span>
              ))}
            </div>
          )}
        </div>

        <div className={`mt-2.5 pt-2 border-t ${t.border} space-y-2`}>
          <div className="flex items-center justify-between gap-1">
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => void adjustStock(item.id, -1, 'button')}
                title="Deduct -1"
                className={`tpd-click-press rounded-full border ${t.border} ${t.btnSecondary} h-7 w-7 text-xs font-bold flex items-center justify-center`}
              >
                -
              </button>
              <button
                type="button"
                onClick={() => void adjustStock(item.id, 1, 'button')}
                title="Add +1"
                className={`tpd-click-press rounded-full border ${t.border} ${t.btnSecondary} h-7 w-7 text-xs font-bold flex items-center justify-center`}
              >
                +
              </button>
              <div className={`inline-flex items-center rounded-full border ${t.border} ${t.inputBg} pl-1.5 pr-1 py-0.5`}>
                <input
                  type="number"
                  min={1}
                  value={customQty}
                  onChange={(e) => {
                    const parsed = parseInt(e.target.value, 10);
                    setCustomCardQty((prev) => ({
                      ...prev,
                      [item.id]: Number.isNaN(parsed) ? 1 : Math.max(1, parsed),
                    }));
                  }}
                  aria-label={`Custom quantity for ${item.name}`}
                  className={`w-9 bg-transparent text-center text-xs font-bold tabular-nums outline-none ${t.text}`}
                />
                <button
                  type="button"
                  onClick={() => void adjustStock(item.id, customQty, 'button')}
                  title={`Add +${customQty}`}
                  className={`tpd-click-press rounded-full border ${t.btnPrimary} px-1.5 py-0.5 text-[10px] font-bold tabular-nums`}
                >
                  +{customQty}
                </button>
              </div>
            </div>

            <div className="flex items-center gap-1 shrink-0">
              <button
                type="button"
                onClick={() => openEditModal(item)}
                title="Edit item"
                aria-label="Edit item"
                className={`tpd-click-press rounded-full border ${t.border} ${t.btnSecondary} p-1.5`}
              >
                <Edit3 size={12} />
              </button>
              <button
                type="button"
                onClick={() =>
                  setConfirmDeleteItemId((prev) => (prev === item.id ? null : item.id))
                }
                title="Delete item"
                aria-label="Delete item"
                className={`tpd-click-press rounded-full border ${t.border} ${t.btnSecondary} p-1.5 ${t.dangerText}`}
              >
                <Trash2 size={12} />
              </button>
            </div>
          </div>

          {isConfirmingDelete && (
            <div
              className={`tpd-slide-down flex items-center justify-between gap-2 rounded-xl border ${t.needsRestockBorder} ${t.needsRestockBg} px-2.5 py-1.5 text-[11px]`}
            >
              <span className="font-semibold">you want to delete ?</span>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  type="button"
                  onClick={() => deleteItem(item.id)}
                  className="tpd-click-press rounded-lg border border-red-700 bg-red-600 px-2 py-0.5 text-[10px] font-bold text-white hover:bg-red-700"
                >
                  Yes
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmDeleteItemId(null)}
                  className={`tpd-click-press rounded-lg border ${t.border} ${t.btnSecondary} px-2 py-0.5 text-[10px] font-semibold`}
                >
                  No
                </button>
              </div>
            </div>
          )}

          {item.sku && (
            <div className="flex items-center justify-between gap-1 text-[11px]">
              <button
                type="button"
                onClick={() => toggleBarcodeExpand(item.id)}
                className={`tpd-click-press inline-flex items-center gap-1 rounded-lg border ${t.border} ${t.cardBg3} px-2 py-1 text-[10px] font-semibold ${t.textMuted}`}
              >
                {isExpanded ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
                <span>Barcode</span>
              </button>

              <div className="flex items-center gap-1">
                <input
                  type="number"
                  min={1}
                  max={100}
                  value={copiesCount}
                  onChange={(e) => setItemPrintCopies(item.id, parseInt(e.target.value, 10))}
                  aria-label={`Print copies for ${item.name}`}
                  className={`w-9 rounded-lg border ${t.border} ${t.inputBg} px-1 py-0.5 text-center text-xs font-bold tabular-nums outline-none ${t.text}`}
                />
                <button
                  type="button"
                  onClick={() => printBarcodeLabel(item, copiesCount)}
                  className={`inline-flex items-center gap-1 rounded-lg border ${t.btnSecondary} px-2 py-1 text-[10px] font-semibold tabular-nums`}
                >
                  <Printer size={11} />
                  <span>Print</span>
                </button>
              </div>
            </div>
          )}

          {item.sku && (
            <div className={isExpanded ? 'tpd-slide-down pt-1 block' : 'hidden'}>
              <div
                className="flex flex-col items-center rounded-xl border border-zinc-300 bg-white text-black px-2 py-1.5"
              >
                <div className="mb-0.5 flex items-center justify-center gap-1">
                  <span className="text-[10px] font-extrabold tracking-wider text-black">
                    {barcodeItemSizeLabel}
                  </span>
                  {renderLabelColorDots(item.colors)}
                </div>
                <div id={`barcode-label-${item.id}`}>
                  <Barcode
                    value={item.sku}
                    format="CODE128"
                    height={labelFormat === 'full' ? 32 : 26}
                    width={1.15}
                    fontSize={10}
                    margin={1}
                  />
                </div>
                <button
                  type="button"
                  onClick={() => downloadBarcodePng(item)}
                  className="mt-1 inline-flex items-center gap-1 rounded-md border border-zinc-300 bg-zinc-100 px-2 py-0.5 text-[10px] font-semibold text-zinc-800 hover:bg-zinc-200"
                >
                  <Download size={10} />
                  <span>Save PNG</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  };

  if (authLoading) {
    return (
      <main className={`relative flex min-h-screen items-center justify-center ${t.text}`}>
        <FrostedBackgroundLayer darkMode={darkMode} />
        <div className={`relative z-10 flex flex-col items-center gap-3 rounded-3xl border ${t.border} ${t.cardBg} px-8 py-6 shadow-2xl`}>
          <PrintingDepotLogo darkMode={darkMode} size="md" spinning />
          <p className={`text-sm ${t.textMuted}`}>Loading The Printing Depot...</p>
        </div>
      </main>
    );
  }

  if (!user) {
    return (
      <main className={`relative flex min-h-screen items-center justify-center px-4 py-10 ${t.text} overflow-x-hidden`}>
        <FrostedBackgroundLayer darkMode={darkMode} />
        <div className={`tpd-modal-enter relative z-10 w-full max-w-md rounded-3xl border ${t.border} ${t.cardBg2} p-6 sm:p-8 shadow-2xl transition-all duration-150 ease-out motion-reduce:transition-none`}>
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <PrintingDepotLogo darkMode={darkMode} size="md" />
              <div className="min-w-0">
                <p className={`text-[10px] uppercase tracking-[0.3em] ${t.textMuted}`}>INVENTORY SYSTEM</p>
                <h1 className="mt-0.5 text-xl sm:text-2xl font-black tracking-tight truncate">THE PRINTING DEPOT</h1>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setDarkMode(!darkMode)}
              aria-label="Toggle theme"
              className={`tpd-click-press shrink-0 rounded-2xl border ${t.border} ${t.cardBg} p-2.5 transition-transform duration-150 ease-out motion-reduce:transition-none hover:scale-105`}
            >
              {darkMode ? <Sun size={18} className="text-yellow-300" /> : <Moon size={18} className="text-zinc-700" />}
            </button>
          </div>

          <button
            type="button"
            onClick={handleGoogleLogin}
            className={`mt-6 flex w-full items-center justify-center gap-3 rounded-2xl border ${t.btnSecondary} px-4 py-3 text-sm font-semibold transition-all duration-150 ease-out motion-reduce:transition-none`}
          >
            Continue with Google
          </button>

          <div className="my-5 flex items-center gap-3">
            <div className={`h-px flex-1 border-t ${t.border}`} />
            <span className={`text-xs uppercase ${t.textMuted2}`}>or with gmail</span>
            <div className={`h-px flex-1 border-t ${t.border}`} />
          </div>

          {authError && <div className={`tpd-slide-down mb-4 rounded-2xl border ${t.lowBg} px-4 py-3 text-xs font-medium`}>{authError}</div>}
          {authMessage && <div className={`tpd-slide-down mb-4 rounded-2xl border ${t.okBg} px-4 py-3 text-xs font-medium`}>{authMessage}</div>}

          <form onSubmit={handleManualAuth} className="space-y-4">
            <div>
              <label className={`mb-1.5 block text-xs font-medium ${t.textMuted}`}>Gmail Address (@gmail.com)</label>
              <div className={`flex items-center gap-2.5 rounded-2xl border ${t.border} ${t.inputBg} px-3.5 py-2.5`}>
                <Mail size={16} className={iconClass} />
                <input
                  type="email"
                  required
                  pattern="[^@\s]+@gmail\.com"
                  title="Email address must end with @gmail.com"
                  value={authEmail}
                  onChange={(e) => setAuthEmail(e.target.value)}
                  placeholder="name@gmail.com"
                  className={`w-full bg-transparent text-base outline-none ${t.text}`}
                />
              </div>
            </div>

            <div>
              <label className={`mb-1.5 block text-xs font-medium ${t.textMuted}`}>Password</label>
              <div className={`flex items-center gap-2.5 rounded-2xl border ${t.border} ${t.inputBg} px-3.5 py-2.5`}>
                <Lock size={16} className={iconClass} />
                <input
                  type={showAuthPassword ? 'text' : 'password'}
                  required
                  minLength={6}
                  value={authPassword}
                  onChange={(e) => setAuthPassword(e.target.value)}
                  placeholder="••••••••"
                  className={`w-full bg-transparent text-base outline-none ${t.text}`}
                />
                <button
                  type="button"
                  onClick={() => setShowAuthPassword((prev) => !prev)}
                  aria-label={showAuthPassword ? 'Hide password' : 'Show password'}
                  title={showAuthPassword ? 'Hide password' : 'Show password'}
                  className={`tpd-click-press shrink-0 rounded-lg p-1 ${t.textMuted}`}
                >
                  {showAuthPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {authMode === 'signup' && (
              <div>
                <label className={`mb-1.5 block text-xs font-medium ${t.textMuted}`}>Re-type Password</label>
                <div className={`flex items-center gap-2.5 rounded-2xl border ${t.border} ${t.inputBg} px-3.5 py-2.5`}>
                  <Lock size={16} className={iconClass} />
                  <input
                    type={showAuthConfirmPassword ? 'text' : 'password'}
                    required
                    minLength={6}
                    value={authConfirmPassword}
                    onChange={(e) => setAuthConfirmPassword(e.target.value)}
                    placeholder="Re-type password"
                    className={`w-full bg-transparent text-base outline-none ${t.text}`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowAuthConfirmPassword((prev) => !prev)}
                    aria-label={showAuthConfirmPassword ? 'Hide password confirmation' : 'Show password confirmation'}
                    title={showAuthConfirmPassword ? 'Hide password confirmation' : 'Show password confirmation'}
                    className={`tpd-click-press shrink-0 rounded-lg p-1 ${t.textMuted}`}
                  >
                    {showAuthConfirmPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>
            )}

            <button type="submit" disabled={authSubmitting} className={`flex w-full items-center justify-center gap-2 rounded-2xl border ${t.btnPrimary} px-4 py-3 text-sm font-semibold transition-all duration-150 ease-out motion-reduce:transition-none disabled:opacity-50`}>
              {authSubmitting && <img src="/icon.png" alt="" className="h-4 w-4 animate-spin object-contain" />}
              <span>{authSubmitting ? 'Please wait...' : authMode === 'login' ? 'Log In' : 'Create account'}</span>
            </button>
          </form>

          <div className="mt-6 text-center text-sm">
            {authMode === 'login' ? (
              <p className={t.textMuted}>
                Don&apos;t have an account?{' '}
                <button
                  type="button"
                  onClick={() => {
                    setAuthError(null);
                    setAuthMessage(null);
                    setAuthMode('signup');
                  }}
                  className="tpd-click-press font-semibold underline underline-offset-4"
                >
                  Create account
                </button>
              </p>
            ) : (
              <p className={t.textMuted}>
                Already have an account?{' '}
                <button
                  type="button"
                  onClick={() => {
                    setAuthError(null);
                    setAuthMessage(null);
                    setAuthConfirmPassword('');
                    setAuthMode('login');
                  }}
                  className="tpd-click-press font-semibold underline underline-offset-4"
                >
                  Log in
                </button>
              </p>
            )}
          </div>
        </div>
      </main>
    );
  }

  const allSelectableColors = Array.from(new Set([...colorOptions, ...form.colors]));
  const allInlineSelectableColors = Array.from(new Set([...colorOptions, ...inlineNewGood.colors]));
  const currentHueHex = hsvToHex(hue, 1, 1);
  const currentMatchedName = hexToColorName(pickerHex);

  const statusOptions: CascadeSelectOption[] = [
    { value: 'ALL', label: 'All status' },
    { value: 'OUT OF STOCK', label: 'Out of stock' },
    { value: 'LOW', label: 'Low' },
    { value: 'OK', label: 'Ok' },
  ];

  const categoryFilterOptions: CascadeSelectOption[] = [
    { value: 'ALL', label: 'All categories' },
    ...categories.map((category) => ({ value: category.name, label: category.name })),
  ];

  const modalCategoryOptions: CascadeSelectOption[] = categories.map((category) => ({
    value: category.name,
    label: category.name,
  }));

  const partyOptions: CascadeSelectOption[] = (
    docKind === 'INCOMING' ? DEFAULT_SUPPLIERS : DEFAULT_CUSTOMERS
  ).map((p) => ({ value: p, label: p }));

  const filteredDocGoods = docGoods.filter((line) =>
    `${line.name} ${line.sku} ${line.size} ${line.category}`
      .toLowerCase()
      .includes(docGoodsSearch.toLowerCase())
  );

  const catalogSearchResults = items.filter((entry) =>
    `${entry.name} ${entry.sku} ${entry.category} ${entry.size}`
      .toLowerCase()
      .includes(addGoodCatalogQuery.toLowerCase())
  );

  const printableFilteredItems = filteredItems.filter((entry) => Boolean(entry.sku));
  const selectedPrintableCount = items.filter(
    (entry) => selectedBarcodeItemIds.has(entry.id) && Boolean(entry.sku)
  ).length;

  return (
    <main className={`relative min-h-screen ${t.text} transition-colors duration-150 motion-reduce:transition-none overflow-x-hidden`}>
      <FrostedBackgroundLayer darkMode={darkMode} />

      {topLowStockBanner && showLowStockPopUp && (
        <div className="fixed top-4 left-1/2 z-[60] w-full max-w-md -translate-x-1/2 px-3 pointer-events-none">
          <div
            className={`${
              topLowStockBanner.closing ? 'tpd-slide-out-top' : 'tpd-slide-in-top'
            } pointer-events-auto flex items-center justify-between gap-3 rounded-full border ${t.needsRestockBorder} ${t.modalBg} px-4 py-2.5 shadow-2xl`}
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className={`relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${t.lowBg} ${t.dangerText}`}>
                <AlertTriangle size={18} />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className={`text-[10px] font-extrabold uppercase tracking-wider ${t.dangerText}`}>
                    Alert
                  </span>
                  <span className={`text-[10px] ${t.textMuted2} tabular-nums`}>
                    &bull; {topLowStockBanner.time}
                  </span>
                </div>
                <p className="text-xs font-bold truncate">{topLowStockBanner.title}</p>
                <p className={`text-[11px] ${t.textMuted} truncate`}>{topLowStockBanner.message}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={dismissTopLowStockBanner}
              aria-label="Dismiss stock alert"
              className={`tpd-click-press rounded-full p-1.5 ${t.textMuted} hover:bg-black/10 shrink-0`}
            >
              <X size={14} />
            </button>
          </div>
        </div>
      )}

      <div className="relative z-10 mx-auto flex max-w-7xl flex-col gap-6 px-3 sm:px-6 lg:px-8 py-4 sm:py-6">
        <header className={`relative z-30 flex flex-col gap-4 rounded-3xl border ${t.border} ${t.cardBg} p-4 sm:p-5 shadow-2xl transition-colors duration-150 motion-reduce:transition-none lg:flex-row lg:items-center lg:justify-between`}>
          <div className="flex items-center justify-between lg:justify-start lg:gap-4">
            <div className="flex items-center gap-3 min-w-0 flex-1">
              <PrintingDepotLogo darkMode={darkMode} size="sm" />
              <div className="min-w-0 flex-1">
                <p className={`text-[10px] sm:text-xs uppercase tracking-[0.3em] ${t.textMuted}`}>INVENTORY SYSTEM</p>
                <h1 className="mt-0.5 text-lg sm:text-2xl font-black tracking-tight lg:text-3xl truncate">THE PRINTING DEPOT</h1>
                <p className={`mt-0.5 text-xs ${t.textMuted} truncate`}>Signed in as <span className="font-semibold">{actorName}</span></p>
              </div>
            </div>
            <div className="flex items-center gap-2 lg:hidden shrink-0">
              <button
                type="button"
                onClick={toggleNotifPanel}
                aria-label="Notifications"
                className={`tpd-click-press relative rounded-2xl border ${t.border} ${t.btnSecondary} p-2.5`}
              >
                <Bell size={18} />
                {unreadCount > 0 && (
                  <span className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold text-white tabular-nums">
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                )}
              </button>
              <button
                type="button"
                onClick={openSettingsModal}
                aria-label="Settings"
                className={`tpd-click-press rounded-2xl border ${t.border} ${t.btnSecondary} p-2.5`}
              >
                <Settings size={18} />
              </button>
              <button onClick={() => setDarkMode(!darkMode)} aria-label="Toggle theme" className={`tpd-click-press rounded-2xl border ${t.border} ${t.btnSecondary} p-2.5`}>
                {darkMode ? <Sun size={18} className="text-yellow-300" /> : <Moon size={18} className="text-zinc-700" />}
              </button>
              <button
                type="button"
                onClick={handleLogout}
                title="Sign Out"
                aria-label="Sign Out"
                className={`tpd-click-press rounded-2xl border ${t.border} ${t.btnSecondary} p-2.5 ${t.dangerText}`}
              >
                <LogOut size={18} />
              </button>
            </div>
          </div>

          <div
            ref={headerActionsRef}
            className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center sm:gap-2.5"
          >
            <button
              type="button"
              onClick={toggleNotifPanel}
              aria-label="Notifications"
              title="Notifications"
              className={`tpd-click-press relative hidden lg:flex rounded-2xl border ${t.border} ${t.btnSecondary} p-2.5`}
            >
              <Bell size={18} />
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold text-white tabular-nums">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </button>
            <button
              type="button"
              onClick={openSettingsModal}
              aria-label="Settings"
              title="Settings"
              className={`group hidden lg:flex rounded-2xl border ${t.border} ${t.btnSecondary} p-2.5`}
            >
              <Settings size={18} className="transition-transform duration-150 ease-out motion-reduce:transition-none group-hover:rotate-45" />
            </button>
            <button
              type="button"
              onClick={() => setDarkMode(!darkMode)}
              title={darkMode ? 'Light Mode' : 'Dark Mode'}
              aria-label={darkMode ? 'Light Mode' : 'Dark Mode'}
              className={`tpd-click-press hidden rounded-2xl border ${t.border} ${t.btnSecondary} p-2.5 lg:block`}
            >
              {darkMode ? <Sun size={18} className="text-yellow-300" /> : <Moon size={18} className="text-zinc-700" />}
            </button>
            <button
              type="button"
              onClick={() => openNewDocumentModal('INCOMING')}
              className={`group rounded-2xl border ${t.btnSecondary} px-3.5 py-3 sm:py-2.5 text-xs sm:text-sm font-semibold flex items-center justify-center gap-1.5`}
            >
              <ArrowDownLeft size={15} className={t.successText} />
              <span>Procurement</span>
            </button>
            <button
              type="button"
              onClick={() => openNewDocumentModal('OUTGOING')}
              className={`group rounded-2xl border ${t.btnSecondary} px-3.5 py-3 sm:py-2.5 text-xs sm:text-sm font-semibold flex items-center justify-center gap-1.5`}
            >
              <ArrowUpRight size={15} className={iconClass} />
              <span>Outgoing</span>
            </button>
            <button
              type="button"
              onClick={() => openScannerModal(false)}
              title="Scan Barcode"
              aria-label="Scan Barcode"
              className={`group rounded-2xl border ${t.btnSecondary} px-3.5 py-3 sm:py-2.5 text-xs sm:text-sm font-semibold flex items-center justify-center gap-2`}
            >
              <BarcodeScanIcon className="h-4 w-4" />
              <span>Scan</span>
            </button>
            <button onClick={() => openCreateModal()} className={`group rounded-2xl border ${t.btnPrimary} px-4 py-3 sm:py-2.5 text-sm font-semibold flex items-center justify-center gap-2`}>
              <Plus size={16} /> New Item
            </button>
            <button
              type="button"
              onClick={handleLogout}
              title="Sign Out"
              aria-label="Sign Out"
              className={`group hidden lg:flex rounded-2xl border ${t.btnSecondary} ${
                isActionsCramped ? 'p-2.5' : 'px-4 py-2.5'
              } text-sm font-semibold ${t.dangerText} items-center justify-center gap-2`}
            >
              <LogOut size={16} className="shrink-0" />
              {!isActionsCramped && <span>Sign Out</span>}
            </button>
          </div>

          {isNotifOpen && (
            <div className="tpd-slide-in-right absolute right-3 top-full mt-2 z-[60] w-full max-w-sm rounded-3xl border border-white/20 bg-zinc-900/95 text-white p-4 shadow-2xl backdrop-blur-2xl">
              <div className={`flex items-center justify-between gap-2 pb-3 border-b ${t.border}`}>
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-bold">Notifications</h3>
                  <span className={`rounded-full border ${t.badgeBg} px-2 py-0.5 text-[11px] tabular-nums`}>
                    {unreadCount} unread
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  {notifications.length > 0 && (
                    <>
                      <button
                        type="button"
                        onClick={markAllNotificationsRead}
                        title="Mark all read"
                        className={`tpd-click-press inline-flex items-center gap-1 rounded-xl border ${t.border} ${t.btnSecondary} px-2 py-1 text-[11px] font-medium`}
                      >
                        <CheckCheck size={12} />
                        <span>Read</span>
                      </button>
                      <button
                        type="button"
                        onClick={clearNotifications}
                        title="Clear notifications"
                        className={`tpd-click-press rounded-xl border ${t.btnDangerSubtle} px-2 py-1 text-[11px] font-semibold`}
                      >
                        Clear
                      </button>
                    </>
                  )}
                  <button
                    type="button"
                    onClick={closeNotifPanel}
                    aria-label="Close notifications"
                    className={`tpd-click-press rounded-xl border ${t.border} ${t.btnSecondary} p-1`}
                  >
                    <X size={13} />
                  </button>
                </div>
              </div>

              <div className="mt-3 max-h-72 space-y-2 overflow-y-auto pr-1">
                {notifications.length === 0 ? (
                  <p className={`py-6 text-center text-xs ${t.textMuted}`}>
                    No notifications yet.
                  </p>
                ) : (
                  notifications.map((entry) => (
                    <div
                      key={entry.id}
                      onClick={() =>
                        setNotifications((prev) =>
                          prev.map((n) => (n.id === entry.id ? { ...n, read: true } : n))
                        )
                      }
                      className={`tpd-click-press cursor-pointer rounded-2xl border p-3 transition-colors duration-100 ${
                        entry.type === 'low_stock' ? t.needsRestockBorder : t.border
                      } ${!entry.read ? t.cardBgHover : t.cardBg3}`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-xs font-bold truncate">
                          {!entry.read && <span className="mr-1.5 inline-block h-2 w-2 rounded-full bg-emerald-500" />}
                          {entry.title}
                        </p>
                        <span className={`text-[10px] ${t.textMuted2} shrink-0 tabular-nums`}>{entry.time}</span>
                      </div>
                      <p className={`mt-1 text-xs ${t.textMuted}`}>{entry.message}</p>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </header>

        <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
          {[
            { label: 'Total Items', value: items.length, icon: Package2 },
            { label: 'Inventory Value', value: `₱${totalValue.toLocaleString()}`, icon: TrendingUp },
            { label: 'Procurement', value: `+${totalIncomingUnits}`, icon: ArrowDownLeft },
            { label: 'Outgoing', value: `-${totalOutgoingUnits}`, icon: ShoppingBag },
            { label: 'Low / Out', value: lowStockCount, icon: Box },
            { label: 'Categories', value: categories.length, icon: Warehouse },
          ].map((card) => (
            <div key={card.label} className={`group rounded-3xl border ${t.border} ${t.cardBg2} p-4 sm:p-5 transition-transform duration-150 ease-out motion-reduce:transition-none hover:-translate-y-0.5 hover:shadow-xl`}>
              <div className="flex items-center justify-between gap-1.5">
                <p className={`text-xs sm:text-sm ${t.textMuted} truncate`}>{card.label}</p>
                <card.icon className={`h-4 w-4 sm:h-5 sm:w-5 ${iconClass} shrink-0`} />
              </div>
              <p className="mt-3 sm:mt-4 text-xl sm:text-2xl xl:text-3xl font-black tabular-nums truncate">{card.value}</p>
            </div>
          ))}
        </section>

        <section className="grid gap-6 grid-cols-1">
          <div
            className={`${
              isAuditMaximized
                ? 'fixed inset-4 z-40 overflow-y-auto shadow-2xl'
                : ''
            } rounded-3xl border ${t.border} ${t.cardBg2} p-4 sm:p-5`}
          >
            <div className={`flex items-center justify-between gap-2 ${isSectionMinimized ? '' : 'mb-4'}`}>
              <div>
                <h2 className="text-lg sm:text-xl font-bold">Recent audit activity</h2>
                <p className={`text-xs sm:text-sm ${t.textMuted}`}>Procurement, outgoing orders, and item updates</p>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <div className={`rounded-full border ${t.border} ${t.cardBg3} px-3 py-1 text-xs sm:text-sm tabular-nums ${t.textMuted}`}>{auditLog.length}</div>
                <button
                  type="button"
                  onClick={() => setIsSectionMinimized((prev) => !prev)}
                  title={isSectionMinimized ? 'Expand' : 'Minimize'}
                  aria-label={isSectionMinimized ? 'Expand' : 'Minimize'}
                  className={`tpd-click-press rounded-xl border ${t.border} ${t.btnSecondary} p-2`}
                >
                  <Minimize2 size={14} />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setIsSectionMinimized(false);
                    setIsAuditMaximized((prev) => !prev);
                  }}
                  title={isAuditMaximized ? 'Exit fullscreen' : 'Maximize'}
                  aria-label={isAuditMaximized ? 'Exit fullscreen' : 'Maximize'}
                  className={`tpd-click-press rounded-xl border ${t.border} ${t.btnSecondary} p-2`}
                >
                  <Maximize2 size={14} />
                </button>
              </div>
            </div>

            {!isSectionMinimized && (
              <div className={`space-y-3 ${isAuditMaximized ? 'max-h-[70vh]' : 'max-h-72'} overflow-y-auto pr-1`}>
                {auditLog.length === 0 ? (
                  <p className={`text-sm ${t.textMuted} py-6 text-center`}>No audit events yet.</p>
                ) : (
                  auditLog.map((entry) => {
                    const parsed = parseMovementMeta(entry.detail || '', entry.action || '');
                    const dir = entry.direction || parsed.direction;
                    const meta = entry.meta || parsed.meta;
                    return (
                      <div key={entry.id} className={`rounded-2xl border ${t.border} ${t.cardBg3} p-3`}>
                        <div className="flex items-center justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="font-semibold text-xs sm:text-sm truncate">{entry.item}</p>
                              {dir === 'INCOMING' && (
                                <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold shrink-0 ${t.incomingBadge}`}>
                                  PROCUREMENT
                                </span>
                              )}
                              {dir === 'OUTGOING' && (
                                <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold shrink-0 ${t.badgeBg}`}>
                                  OUTGOING
                                </span>
                              )}
                              {typeof meta?.previousStock === 'number' && typeof meta?.newStock === 'number' && (
                                <span className={`rounded-full border ${t.badgeBg} px-2 py-0.5 text-[10px] font-semibold tabular-nums`}>
                                  {meta.previousStock} → {meta.newStock}
                                </span>
                              )}
                            </div>
                            <p className={`text-[11px] sm:text-xs ${t.textMuted} truncate`}>{entry.detail}</p>
                            {entry.user && <p className={`mt-0.5 text-[10px] font-medium ${t.successText} truncate`}>By: {entry.user}</p>}
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <div className={`text-right text-[11px] sm:text-xs ${t.textMuted2}`}>
                              <p className="font-semibold">{entry.action}</p>
                              <p className="tabular-nums">{entry.time}</p>
                            </div>
                            <button
                              type="button"
                              onClick={() =>
                                setConfirmDeleteAuditId((prev) => (prev === entry.id ? null : entry.id))
                              }
                              title="Delete audit log"
                              aria-label="Delete audit log"
                              className={`tpd-click-press rounded-xl border ${t.border} ${t.btnSecondary} p-1.5 ${t.dangerText}`}
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                        </div>

                        {confirmDeleteAuditId === entry.id && (
                          <div
                            className={`tpd-slide-down mt-2 flex items-center justify-between gap-2 rounded-xl border ${t.needsRestockBorder} ${t.needsRestockBg} px-2.5 py-1.5 text-[11px]`}
                          >
                            <span className="font-semibold">you want to delete ?</span>
                            <div className="flex items-center gap-1 shrink-0">
                              <button
                                type="button"
                                onClick={() => void deleteAuditLog(entry.id)}
                                className="tpd-click-press rounded-lg border border-red-700 bg-red-600 px-2 py-0.5 text-[10px] font-bold text-white hover:bg-red-700"
                              >
                                Yes
                              </button>
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteAuditId(null)}
                                className={`tpd-click-press rounded-lg border ${t.border} ${t.btnSecondary} px-2 py-0.5 text-[10px] font-semibold`}
                              >
                                No
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            )}
          </div>
        </section>

        <section ref={inventorySectionRef} className="grid gap-6 xl:grid-cols-[1.5fr_0.5fr]">
          <div className={`rounded-3xl border ${t.border} ${t.cardBg2} p-4 sm:p-5`}>
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h2 className="text-xl sm:text-2xl font-black">Inventory overview</h2>
                <p className={`text-sm ${t.textMuted}`}>Synced table &bull; Press <kbd className={`rounded border ${t.border} ${t.cardBg3} px-1.5 py-0.5 text-[11px]`}>/</kbd> or <kbd className={`rounded border ${t.border} ${t.cardBg3} px-1.5 py-0.5 text-[11px]`}>Enter</kbd> to search</p>
              </div>
              <div className="flex flex-col gap-2.5 sm:flex-row sm:flex-wrap sm:items-center">
                <label className={`flex items-center gap-2 rounded-2xl border ${t.border} ${t.inputBg} px-3 py-2`}>
                  <Search size={16} className={iconClass} />
                  <input
                    ref={searchInputRef}
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' && query.trim()) {
                        event.preventDefault();
                        const exact = items.find(
                          (entry) => entry.sku.trim().toLowerCase() === query.trim().toLowerCase()
                        );
                        if (exact) {
                          setStatusFilter('ALL');
                          setCategoryFilter('ALL');
                          setActiveTab('inventory');
                        }
                      }
                    }}
                    placeholder="Search or scan SKU"
                    className={`w-full bg-transparent text-base sm:text-sm outline-none sm:w-44 ${t.text}`}
                  />
                </label>
                <button
                  type="button"
                  onClick={() => openScannerModal(false)}
                  title="Scan Barcode"
                  className={`group inline-flex items-center justify-center gap-2 rounded-2xl border ${t.btnSecondary} px-3.5 py-2 text-sm font-semibold`}
                >
                  <BarcodeScanIcon className="h-4 w-4" />
                  <span>Scan</span>
                </button>
                <CascadeSelect
                  value={statusFilter}
                  onChange={setStatusFilter}
                  options={statusOptions}
                  darkMode={darkMode}
                  minWidthClass="min-w-[145px]"
                />
                <CascadeSelect
                  value={categoryFilter}
                  onChange={setCategoryFilter}
                  options={categoryFilterOptions}
                  darkMode={darkMode}
                  minWidthClass="min-w-[165px]"
                />
                {hasActiveFilters && (
                  <button
                    type="button"
                    onClick={resetFilters}
                    className={`tpd-click-press inline-flex items-center justify-center gap-1.5 rounded-2xl border ${t.border} ${t.btnSecondary} px-3 py-2 text-xs font-semibold`}
                  >
                    <RotateCcw size={13} />
                    <span>Reset</span>
                  </button>
                )}
              </div>
            </div>

            {lastScannedSummary && (
              <div className={`mt-4 flex flex-wrap items-center justify-between gap-2 rounded-2xl border ${t.border} ${t.cardBg3} px-3.5 py-2 text-xs`}>
                <div className="flex items-center gap-2 min-w-0">
                  <span className="h-2 w-2 rounded-full bg-emerald-500 shrink-0" />
                  <span className={t.textMuted}>Last scan:</span>
                  <strong className="truncate">{lastScannedSummary}</strong>
                </div>
                <button
                  type="button"
                  onClick={() => setLastScannedSummary(null)}
                  className={`text-[11px] ${t.textMuted2}`}
                >
                  Dismiss
                </button>
              </div>
            )}

            <div className={`mt-6 flex flex-col gap-3 border-b ${t.border} pb-3 text-sm`}>
              <div className="flex flex-wrap gap-2">
                <button onClick={() => setActiveTab('inventory')} className={`rounded-full px-4 py-1.5 font-medium ${activeTab === 'inventory' ? t.tabActive : t.tabInactive}`}>Inventory</button>
                <button onClick={() => setActiveTab('incoming')} className={`rounded-full px-4 py-1.5 font-medium ${activeTab === 'incoming' ? t.tabActive : t.tabInactive}`}>
                  Procurement ({pendingIncomingCount})
                </button>
                <button onClick={() => setActiveTab('outgoing')} className={`rounded-full px-4 py-1.5 font-medium ${activeTab === 'outgoing' ? t.tabActive : t.tabInactive}`}>
                  Outgoing ({pendingOutgoingCount})
                </button>
                <button onClick={() => setActiveTab('audit')} className={`rounded-full px-4 py-1.5 font-medium ${activeTab === 'audit' ? t.tabActive : t.tabInactive}`}>
                  Audit Log ({auditLog.length})
                </button>
              </div>

              {activeTab === 'inventory' && (
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setBarcodeSelectMode((prev) => {
                        if (prev) setSelectedBarcodeItemIds(new Set());
                        return !prev;
                      });
                    }}
                    className={`tpd-click-press inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold ${
                      barcodeSelectMode ? t.tabActive : t.tabInactive
                    }`}
                  >
                    <Printer size={12} />
                    <span>{barcodeSelectMode ? 'Done' : 'Multi-Print'}</span>
                  </button>

                  {barcodeSelectMode && (
                    <>
                      <button
                        type="button"
                        onClick={() => {
                          if (selectedBarcodeItemIds.size === printableFilteredItems.length && printableFilteredItems.length > 0) {
                            setSelectedBarcodeItemIds(new Set());
                          } else {
                            setSelectedBarcodeItemIds(new Set(printableFilteredItems.map((entry) => entry.id)));
                          }
                        }}
                        className={`tpd-click-press rounded-full border ${t.tabInactive} px-3 py-1 text-xs font-semibold`}
                      >
                        {selectedBarcodeItemIds.size === printableFilteredItems.length && printableFilteredItems.length > 0
                          ? 'Deselect All'
                          : 'Select All'}
                      </button>
                      <button
                        type="button"
                        onClick={printSelectedBarcodes}
                        disabled={selectedPrintableCount === 0}
                        className={`tpd-click-press inline-flex items-center gap-1.5 rounded-full border ${t.btnPrimary} px-3.5 py-1 text-xs font-bold disabled:opacity-40 tabular-nums`}
                      >
                        <Printer size={12} />
                        <span>Print ({selectedPrintableCount})</span>
                      </button>
                    </>
                  )}

                  <div className={`inline-flex items-center gap-1 rounded-full border p-0.5 text-xs ${t.border} ${t.cardBg3}`}>
                    <button
                      type="button"
                      onClick={() => setInventoryViewMode('grouped')}
                      className={`inline-flex items-center gap-1 rounded-full px-3 py-1 font-semibold ${
                        inventoryViewMode === 'grouped' ? t.tabActive : t.textMuted
                      }`}
                    >
                      <Layers size={12} />
                      <span>Group</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setInventoryViewMode('list')}
                      className={`inline-flex items-center gap-1 rounded-full px-3 py-1 font-semibold ${
                        inventoryViewMode === 'list' ? t.tabActive : t.textMuted
                      }`}
                    >
                      <List size={12} />
                      <span>List</span>
                    </button>
                  </div>

                  <div className={`inline-flex items-center gap-1 rounded-full border p-0.5 text-xs ${t.border} ${t.cardBg3}`}>
                    <button
                      type="button"
                      onClick={() => setLabelFormat('compact')}
                      className={`rounded-full px-3 py-1 font-semibold ${
                        labelFormat === 'compact' ? t.tabActive : t.textMuted
                      }`}
                    >
                      Compact
                    </button>
                    <button
                      type="button"
                      onClick={() => setLabelFormat('full')}
                      className={`rounded-full px-3 py-1 font-semibold ${
                        labelFormat === 'full' ? t.tabActive : t.textMuted
                      }`}
                    >
                      Full
                    </button>
                  </div>
                </div>
              )}
            </div>

            {activeTab === 'inventory' ? (
              <div className="mt-5 space-y-4">
                {filteredItems.length === 0 ? (
                  <div className={`rounded-2xl border border-dashed ${t.border} ${t.cardBg3} py-10 px-4 text-center`}>
                    <p className="text-sm font-bold">No items found</p>
                    <p className={`mt-1 text-xs ${t.textMuted}`}>
                      {hasActiveFilters ? 'Clear or reset your filters.' : 'Add an item to get started.'}
                    </p>
                    {hasActiveFilters && (
                      <button
                        type="button"
                        onClick={resetFilters}
                        className={`mt-3 inline-flex items-center gap-1.5 rounded-2xl border ${t.btnPrimary} px-3.5 py-1.5 text-xs font-semibold`}
                      >
                        <RotateCcw size={12} />
                        <span>Reset</span>
                      </button>
                    )}
                  </div>
                ) : inventoryViewMode === 'grouped' ? (
                  groupedFilteredItems.map((group) => {
                    const isCollapsed = Boolean(collapsedGroups[group.category]);
                    return (
                      <div
                        key={group.category}
                        className={`rounded-3xl border ${t.border} ${t.cardBg3} p-3.5 sm:p-4`}
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <button
                            type="button"
                            onClick={() => toggleGroupCollapse(group.category)}
                            className="flex items-center gap-2.5 text-left min-w-0 flex-1"
                          >
                            <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-xl border ${t.border} ${t.cardBg2}`}>
                              {isCollapsed ? <ChevronDown size={15} /> : <ChevronUp size={15} />}
                            </span>
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <h3 className="text-base sm:text-lg font-black uppercase tracking-wide truncate">
                                  {group.category}
                                </h3>
                                <span className={`rounded-full border ${t.badgeBg} px-2.5 py-0.5 text-[11px] font-semibold tabular-nums`}>
                                  {group.items.length} {group.items.length === 1 ? 'item' : 'items'}
                                </span>
                                <span className={`rounded-full border ${t.badgeBg} px-2.5 py-0.5 text-[11px] font-semibold tabular-nums`}>
                                  {group.totalStock} stock
                                </span>
                                {group.lowCount > 0 && (
                                  <span className={`rounded-full border px-2.5 py-0.5 text-[11px] font-bold tabular-nums ${t.lowBg}`}>
                                    {group.lowCount} low
                                  </span>
                                )}
                              </div>

                              {group.allColors.length > 0 && (
                                <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                                  {group.allColors.map((color) => (
                                    <span
                                      key={color}
                                      className={`inline-flex items-center gap-1 rounded-full border ${t.badgeBg} px-2 py-0.5 text-[10px]`}
                                    >
                                      <ColorCircle color={color} size="sm" />
                                      <span>{color}</span>
                                    </span>
                                  ))}
                                </div>
                              )}
                            </div>
                          </button>

                          <button
                            type="button"
                            onClick={() => openCreateModal(group.category)}
                            className={`tpd-click-press inline-flex items-center gap-1 rounded-xl border ${t.btnSecondary} px-2.5 py-1.5 text-xs font-semibold shrink-0`}
                          >
                            <Plus size={13} />
                            <span>Add</span>
                          </button>
                        </div>

                        {!isCollapsed && (
                          <div className={`mt-3.5 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 border-t ${t.border} pt-3.5`}>
                            {group.items.map((item) => renderInventoryCard(item))}
                          </div>
                        )}
                      </div>
                    );
                  })
                ) : (
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                    {filteredItems.map((item) => renderInventoryCard(item))}
                  </div>
                )}
              </div>
            ) : activeTab === 'incoming' || activeTab === 'outgoing' ? (
              <div className={`mt-5 space-y-4 rounded-2xl border ${t.border} ${t.cardBg3} p-4 max-h-[560px] overflow-y-auto`}>
                <div className={`flex flex-wrap items-center justify-between gap-3 rounded-2xl border ${t.border} ${t.cardBg2} p-3`}>
                  <p className={`text-xs ${t.textMuted}`}>
                    {activeTab === 'incoming'
                      ? 'Save first; stock adds when you click Arrive & Add (✓).'
                      : 'Save first; stock deducts when you click Deduct Stock (✓).'}
                  </p>
                  <button
                    type="button"
                    onClick={() =>
                      openNewDocumentModal(activeTab === 'incoming' ? 'INCOMING' : 'OUTGOING')
                    }
                    className={`tpd-click-press inline-flex items-center gap-1.5 rounded-2xl border ${t.btnPrimary} px-3.5 py-2 text-xs font-bold shrink-0`}
                  >
                    <Plus size={14} />
                    <span>{activeTab === 'incoming' ? 'New Procurement' : 'New outgoing'}</span>
                  </button>
                </div>

                <div className="space-y-3">
                  <h3 className={`text-xs font-extrabold uppercase tracking-wider ${activeTab === 'incoming' ? t.successText : t.textMuted}`}>
                    {activeTab === 'incoming'
                      ? `Procurement (${incomingDocuments.length})`
                      : `Outgoing (${outgoingDocuments.length})`}
                  </h3>
                  {(activeTab === 'incoming' ? incomingDocuments : outgoingDocuments).length === 0 ? (
                    <p className={`py-4 text-center text-xs ${t.textMuted}`}>
                      No documents yet.
                    </p>
                  ) : (
                    (activeTab === 'incoming' ? incomingDocuments : outgoingDocuments).map((doc) =>
                      renderStockDocumentCard(doc)
                    )
                  )}
                </div>

                <div className={`space-y-2.5 border-t ${t.border} pt-4`}>
                  <h3 className={`text-xs font-extrabold uppercase tracking-wider ${t.textMuted}`}>
                    {activeTab === 'incoming'
                      ? `Applied Arrivals (${incomingEntries.length})`
                      : `Applied Deductions (${outgoingEntries.length})`}
                  </h3>
                  {(activeTab === 'incoming' ? incomingEntries : outgoingEntries).length === 0 ? (
                    <p className={`py-4 text-center text-xs ${t.textMuted}`}>
                      No applied movements yet.
                    </p>
                  ) : (
                    (activeTab === 'incoming' ? incomingEntries : outgoingEntries).map((entry) =>
                      renderMovementCard(entry, activeTab)
                    )
                  )}
                </div>
              </div>
            ) : (
              <div className={`mt-5 space-y-3 rounded-2xl border ${t.border} ${t.cardBg3} p-4 max-h-[500px] overflow-y-auto`}>
                {auditLog.length > 0 && (
                  <div className={`flex flex-wrap items-center justify-between gap-2 pb-3 border-b ${t.border}`}>
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setAuditSelectMode((prev) => {
                            if (prev) {
                              setSelectedAuditIds(new Set());
                              setConfirmDeleteSelectedAudit(false);
                            }
                            return !prev;
                          });
                        }}
                        className={`tpd-click-press inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-semibold ${
                          auditSelectMode ? t.tabActive : t.tabInactive
                        }`}
                      >
                        <Check size={13} />
                        <span>{auditSelectMode ? 'Cancel' : 'Select'}</span>
                      </button>

                      {auditSelectMode && (
                        <>
                          <button
                            type="button"
                            onClick={toggleSelectAllAudit}
                            className={`tpd-click-press rounded-xl border ${t.tabInactive} px-3 py-1.5 text-xs font-semibold`}
                          >
                            {selectedAuditIds.size === auditLog.length ? 'Deselect All' : 'Select All'}
                          </button>

                          {!confirmDeleteSelectedAudit ? (
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteSelectedAudit(true)}
                              disabled={selectedAuditIds.size === 0 || isClearingAudit}
                              className={`inline-flex items-center gap-1.5 rounded-xl border ${t.btnDangerSubtle} px-3 py-1.5 text-xs font-bold disabled:opacity-40 tabular-nums`}
                            >
                              <Trash2 size={13} />
                              <span>Delete ({selectedAuditIds.size})</span>
                            </button>
                          ) : (
                            <div className="flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={deleteSelectedAuditLogs}
                                disabled={isClearingAudit}
                                className="tpd-click-press rounded-xl border border-red-700 bg-red-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-red-700 disabled:opacity-60 tabular-nums"
                              >
                                {isClearingAudit ? 'Deleting...' : `Confirm (${selectedAuditIds.size})`}
                              </button>
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteSelectedAudit(false)}
                                className={`tpd-click-press rounded-xl border ${t.btnSecondary} px-2.5 py-1.5 text-xs font-semibold`}
                              >
                                Cancel
                              </button>
                            </div>
                          )}
                        </>
                      )}
                    </div>

                    {!confirmClearAllAudit ? (
                      <button
                        type="button"
                        onClick={() => setConfirmClearAllAudit(true)}
                        disabled={isClearingAudit}
                        className={`inline-flex items-center gap-1.5 rounded-xl border ${t.btnDangerSubtle} px-3 py-1.5 text-xs font-bold disabled:opacity-40`}
                      >
                        <Trash2 size={13} />
                        <span>Clear All</span>
                      </button>
                    ) : (
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={clearAllAuditLogs}
                          disabled={isClearingAudit}
                          className="tpd-click-press rounded-xl border border-red-700 bg-red-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-red-700 disabled:opacity-60"
                        >
                          {isClearingAudit ? 'Clearing...' : 'Confirm Clear'}
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmClearAllAudit(false)}
                          className={`tpd-click-press rounded-xl border ${t.btnSecondary} px-2.5 py-1.5 text-xs font-semibold`}
                        >
                          Cancel
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {auditLog.length === 0 ? (
                  <p className={`py-8 text-center text-sm ${t.textMuted}`}>No audit events yet.</p>
                ) : (
                  auditLog.map((entry) => {
                    const isChecked = selectedAuditIds.has(entry.id);
                    return (
                      <div
                        key={entry.id}
                        onClick={() => {
                          if (auditSelectMode) toggleAuditSelection(entry.id);
                        }}
                        className={`rounded-2xl border p-3 transition-all duration-150 ease-out motion-reduce:transition-none ${
                          auditSelectMode ? 'cursor-pointer' : ''
                        } ${
                          isChecked
                            ? `${t.needsRestockBorder} ${t.needsRestockBg}`
                            : `${t.border} ${t.cardBgHover}`
                        }`}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex items-center gap-3 min-w-0 flex-1">
                            {auditSelectMode && (
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={() => toggleAuditSelection(entry.id)}
                                onClick={(e) => e.stopPropagation()}
                                aria-label={`Select audit log for ${entry.item}`}
                                className="h-4 w-4 rounded border-zinc-600 accent-red-600 cursor-pointer shrink-0"
                              />
                            )}
                            <div className="min-w-0 flex-1">
                              <p className="font-semibold text-sm truncate">{entry.item}</p>
                              <p className={`text-xs ${t.textMuted} truncate`}>{entry.detail}</p>
                              {entry.user && <p className={`mt-0.5 text-[11px] font-medium ${t.successText} truncate`}>By: {entry.user}</p>}
                            </div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <div className={`text-right text-xs ${t.textMuted2}`}>
                              <p className="font-semibold">{entry.action}</p>
                              <p className="tabular-nums">{entry.time}</p>
                            </div>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setConfirmDeleteAuditId((prev) => (prev === entry.id ? null : entry.id));
                              }}
                              title="Delete audit log"
                              aria-label="Delete audit log"
                              className={`tpd-click-press rounded-xl border ${t.border} ${t.btnSecondary} p-1.5 ${t.dangerText}`}
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                        </div>

                        {confirmDeleteAuditId === entry.id && (
                          <div
                            onClick={(e) => e.stopPropagation()}
                            className={`tpd-slide-down mt-2 flex items-center justify-between gap-2 rounded-xl border ${t.needsRestockBorder} ${t.needsRestockBg} px-2.5 py-1.5 text-[11px]`}
                          >
                            <span className="font-semibold">you want to delete ?</span>
                            <div className="flex items-center gap-1 shrink-0">
                              <button
                                type="button"
                                onClick={() => void deleteAuditLog(entry.id)}
                                className="tpd-click-press rounded-lg border border-red-700 bg-red-600 px-2 py-0.5 text-[10px] font-bold text-white hover:bg-red-700"
                              >
                                Yes
                              </button>
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteAuditId(null)}
                                className={`tpd-click-press rounded-lg border ${t.border} ${t.btnSecondary} px-2 py-0.5 text-[10px] font-semibold`}
                              >
                                No
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            )}
          </div>

          <div className="space-y-6">
            <div className={`rounded-3xl border ${t.border} ${t.cardBg2} p-4 sm:p-5`}>
              <h3 className="text-lg font-bold">Category manager</h3>
              <p className={`mt-1 text-sm ${t.textMuted}`}>Organize item groups.</p>
              <div className="mt-4 flex gap-2">
                <input
                  value={newCategory}
                  onChange={(event) => setNewCategory(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      addCategory();
                    }
                  }}
                  placeholder="New category"
                  className={`flex-1 rounded-2xl border ${t.border} ${t.inputBg} px-3 py-2 text-base sm:text-sm outline-none ${t.text}`}
                />
                <button
                  type="button"
                  onClick={addCategory}
                  disabled={isAddingCategory}
                  className={`inline-flex items-center justify-center gap-1.5 rounded-2xl border ${t.btnPrimary} px-3.5 py-2 text-sm font-semibold disabled:opacity-70 shrink-0`}
                >
                  {categoryAddSuccess ? (
                    <>
                      <Check size={15} strokeWidth={3} className={t.successText} />
                      <span>Added</span>
                    </>
                  ) : isAddingCategory ? (
                    <>
                      <img src="/icon.png" alt="" className="h-4 w-4 animate-spin object-contain" />
                      <span>Adding...</span>
                    </>
                  ) : (
                    <span>Add</span>
                  )}
                </button>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                {categories.map((category) => (
                  <div key={category.id} className="inline-flex flex-col gap-1.5">
                    <span className={`inline-flex items-center gap-1.5 rounded-full border ${t.badgeBg} py-1 pr-2 pl-3 text-sm`}>
                      <span>{category.name}</span>
                      <button
                        type="button"
                        onClick={() =>
                          setConfirmDeleteCategoryId((prev) => (prev === category.id ? null : category.id))
                        }
                        title={`Remove ${category.name}`}
                        className={`tpd-click-press rounded-full p-0.5 hover:${t.dangerText}`}
                      >
                        <X size={13} />
                      </button>
                    </span>
                    {confirmDeleteCategoryId === category.id && (
                      <div
                        className={`tpd-slide-down flex items-center justify-between gap-2 rounded-xl border ${t.needsRestockBorder} ${t.needsRestockBg} px-2.5 py-1 text-[11px]`}
                      >
                        <span className="font-semibold">you want to delete ?</span>
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            onClick={() => deleteCategory(category.id, category.name)}
                            className="tpd-click-press rounded-lg border border-red-700 bg-red-600 px-2 py-0.5 text-[10px] font-bold text-white hover:bg-red-700"
                          >
                            Yes
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteCategoryId(null)}
                            className={`tpd-click-press rounded-lg border ${t.border} ${t.btnSecondary} px-2 py-0.5 text-[10px] font-semibold`}
                          >
                            No
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div className={`rounded-3xl border ${t.border} ${t.cardBg2} p-4 sm:p-5`}>
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-lg font-bold">Needs restocking</h3>
                {lowStockItems.length > 0 && (
                  <button
                    type="button"
                    onClick={copyRestockOrder}
                    className={`tpd-click-press inline-flex items-center gap-1.5 rounded-xl border ${t.btnSecondary} px-2.5 py-1 text-xs font-semibold`}
                  >
                    {copiedRestockList ? <Check size={12} className={t.successText} /> : <CopyIcon size={12} />}
                    <span>{copiedRestockList ? 'Copied' : 'Copy List'}</span>
                  </button>
                )}
              </div>
              <div className="mt-4 space-y-2.5">
                {lowStockItems.map((item) => (
                  <div key={item.id} className={`flex items-center justify-between gap-2 rounded-2xl border ${t.needsRestockBorder} ${t.needsRestockBg} p-3 text-sm`}>
                    <div className="min-w-0">
                      <p className="font-semibold truncate">{item.name}</p>
                      <p className={`text-xs ${t.textMuted} tabular-nums`}>{item.sku || 'No SKU'} &bull; {item.stock}/{item.min}</p>
                    </div>
                    <span className="shrink-0 rounded-xl border border-red-700 bg-red-600 px-2.5 py-1 text-xs font-extrabold text-white shadow-sm">
                      {item.stock <= 0 ? 'Out' : 'Buy'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>
      </div>

      {docModalOpen && (
        <div className={`tpd-fade-in fixed inset-0 z-50 flex items-center justify-center ${t.overlay} p-2 sm:p-4 overflow-y-auto`}>
          <div className={`tpd-modal-enter my-auto max-h-[90dvh] w-full max-w-lg overflow-y-auto rounded-3xl border ${t.modalBg} p-4 sm:p-6 shadow-2xl`}>
            <div className={`flex items-center justify-between gap-2 pb-3 border-b ${t.border}`}>
              <div className="flex items-center gap-2.5">
                <button
                  type="button"
                  onClick={closeDocModal}
                  aria-label="Close document"
                  className={`tpd-click-press rounded-2xl border ${t.border} ${t.btnSecondary} p-2`}
                >
                  <ChevronDown size={18} className="rotate-90" />
                </button>
                <div>
                  <p className={`text-[10px] uppercase tracking-[0.28em] ${t.textMuted}`}>
                    {docKind === 'INCOMING' ? 'INCOMING STOCK' : 'OUTGOING ORDER'}
                  </p>
                  <h3 className="text-lg sm:text-xl font-black">
                    {docKind === 'INCOMING' ? 'Procurement' : 'Outgoing'}
                  </h3>
                  <p className={`text-[11px] ${t.textMuted}`}>
                    {docKind === 'INCOMING'
                      ? 'Saved first; adds to stock on ✓'
                      : 'Saved first; deducts from stock on ✓'}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-1.5 relative">
                <button
                  type="button"
                  onClick={() => void saveDocumentAsPending()}
                  title="Save document"
                  aria-label="Save document"
                  className="tpd-click-press rounded-full border border-emerald-400/40 bg-emerald-600 p-2 text-white shadow-md hover:bg-emerald-700"
                >
                  <Check size={18} strokeWidth={2.5} />
                </button>
                <button
                  type="button"
                  onClick={() => setDocMenuOpenId((prev) => (prev === 'modal' ? null : 'modal'))}
                  aria-label="More options"
                  className={`tpd-click-press rounded-2xl border ${t.border} ${t.btnSecondary} p-2`}
                >
                  <MoreHorizontal size={18} />
                </button>

                {docMenuOpenId === 'modal' && (
                  <div className={`tpd-slide-down absolute right-0 top-full mt-1.5 z-20 w-48 rounded-2xl border ${t.modalBg} p-1.5 shadow-2xl text-xs`}>
                    <button
                      type="button"
                      onClick={() => {
                        setDocNo(getNextDocNumber(docKind));
                        setDocDateTime(formatCurrentDocDateTime());
                        setDocMenuOpenId(null);
                      }}
                      className={`flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left transition-colors ${
                        darkMode ? 'hover:bg-white/10' : 'hover:bg-black/5'
                      }`}
                    >
                      <RefreshCw size={13} />
                      <span>Reset No &amp; Time</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setDocGoods([]);
                        setDocMenuOpenId(null);
                      }}
                      className={`flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left ${t.dangerText} hover:bg-red-500/15`}
                    >
                      <Trash2 size={13} />
                      <span>Clear Goods</span>
                    </button>
                  </div>
                )}
              </div>
            </div>

            <div className="mt-4">
              <button
                type="button"
                onClick={() => setDocInfoExpanded((prev) => !prev)}
                className="flex w-full items-center justify-between text-left"
              >
                <span className="text-sm sm:text-base font-extrabold">Document details</span>
                {docInfoExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
              </button>

              {docInfoExpanded && (
                <div className="mt-3 space-y-3">
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div className={`rounded-2xl border ${t.border} ${t.inputBg} px-3.5 py-2`}>
                      <label className={`block text-[11px] font-semibold ${t.textMuted}`}>Document No</label>
                      <input
                        value={docNo}
                        onChange={(e) => setDocNo(e.target.value)}
                        className={`mt-0.5 w-full bg-transparent text-base sm:text-sm font-bold outline-none ${t.text}`}
                      />
                    </div>

                    <div className="flex flex-col justify-center">
                      <span className={`mb-1 block text-[11px] font-semibold ${t.textMuted}`}>
                        {docKind === 'INCOMING' ? 'Supplier' : 'Customer'}
                      </span>
                      <CascadeSelect
                        value={docPartyName}
                        onChange={setDocPartyName}
                        options={partyOptions}
                        darkMode={darkMode}
                        fullWidth
                      />
                    </div>
                  </div>

                  {docPartyName === 'Custom' && (
                    <input
                      value={docCustomParty}
                      onChange={(e) => setDocCustomParty(e.target.value)}
                      placeholder={docKind === 'INCOMING' ? 'Supplier name' : 'Customer name'}
                      className={`w-full rounded-2xl border ${t.border} ${t.inputBg} px-3.5 py-2 text-base sm:text-xs outline-none ${t.text}`}
                    />
                  )}

                  <div className={`rounded-2xl border ${t.border} ${t.inputBg} px-3.5 py-2`}>
                    <label className={`block text-[11px] font-semibold ${t.textMuted}`}>Date &amp; Time</label>
                    <input
                      value={docDateTime}
                      onChange={(e) => setDocDateTime(e.target.value)}
                      className={`mt-0.5 w-full bg-transparent text-base sm:text-sm font-bold tabular-nums outline-none ${t.text}`}
                    />
                  </div>

                  <div className={`rounded-2xl border ${t.border} ${t.inputBg} px-3.5 py-2`}>
                    <label className={`block text-[11px] font-semibold ${t.textMuted}`}>Note</label>
                    <input
                      value={docDescription}
                      onChange={(e) => setDocDescription(e.target.value)}
                      placeholder="Optional note"
                      className={`mt-0.5 w-full bg-transparent text-base sm:text-sm outline-none ${t.text}`}
                    />
                  </div>
                </div>
              )}
            </div>

            <div className="mt-5">
              <button
                type="button"
                onClick={() => setGoodsInfoExpanded((prev) => !prev)}
                className="flex w-full items-center justify-between text-left"
              >
                <span className="text-sm sm:text-base font-extrabold">
                  Items ({docGoods.length})
                </span>
                {goodsInfoExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
              </button>

              {goodsInfoExpanded && (
                <div className="mt-3 space-y-3">
                  <div className="flex items-center gap-2">
                    <label className={`flex flex-1 items-center gap-2 rounded-2xl border ${t.border} ${t.inputBg} px-3.5 py-2`}>
                      <Search size={16} className={iconClass} />
                      <input
                        value={docGoodsSearch}
                        onChange={(e) => setDocGoodsSearch(e.target.value)}
                        placeholder="Search items..."
                        className={`w-full bg-transparent text-base sm:text-sm outline-none ${t.text}`}
                      />
                    </label>
                    <button
                      type="button"
                      onClick={() => openScannerModal(true)}
                      title="Scan barcode into items"
                      aria-label="Scan barcode into items"
                      className={`tpd-click-press rounded-2xl border ${t.border} ${t.btnSecondary} p-2.5`}
                    >
                      <BarcodeScanIcon className="h-4 w-4" />
                    </button>
                  </div>

                  {filteredDocGoods.length === 0 ? (
                    <div className={`rounded-2xl border border-dashed ${t.border} ${t.cardBg3} py-7 px-4 text-center`}>
                      <Box size={32} className={`mx-auto ${iconClass} opacity-60`} />
                      <p className={`mt-2 text-xs font-semibold ${t.textMuted}`}>No items added</p>
                    </div>
                  ) : (
                    <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                      {filteredDocGoods.map((line) => (
                        <div
                          key={line.id}
                          className={`flex items-center justify-between gap-2 rounded-2xl border ${t.border} ${t.cardBg3} px-3 py-2 text-xs`}
                        >
                          <div className="min-w-0 flex-1">
                            <p className="font-bold truncate">{line.name}</p>
                            <p className={`text-[11px] ${t.textMuted2} truncate`}>
                              {line.sku || 'No SKU'} &bull; {line.size || '-'}
                            </p>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <button
                              type="button"
                              onClick={() => updateDocLineQty(line.id, line.qty - 1)}
                              className={`rounded-lg border ${t.border} ${t.btnSecondary} px-2 py-0.5 font-bold`}
                            >
                              -
                            </button>
                            <input
                              type="number"
                              min={1}
                              value={line.qty}
                              onChange={(e) => updateDocLineQty(line.id, parseInt(e.target.value, 10))}
                              className={`w-12 rounded-lg border ${t.border} ${t.inputBg} px-1 py-0.5 text-center text-base font-bold tabular-nums outline-none ${t.text}`}
                            />
                            <button
                              type="button"
                              onClick={() => updateDocLineQty(line.id, line.qty + 1)}
                              className={`rounded-lg border ${t.border} ${t.btnSecondary} px-2 py-0.5 font-bold`}
                            >
                              +
                            </button>
                            <button
                              type="button"
                              onClick={() => removeDocLine(line.id)}
                              className={`rounded-lg p-1 ${t.dangerText} hover:bg-red-500/15`}
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {addGoodPickerOpen && (
                    <div className={`tpd-slide-down rounded-2xl border ${t.border} ${t.cardBg3} p-3 space-y-2.5`}>
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-bold">Select item</span>
                        <div className="flex items-center gap-2">
                          {docKind === 'INCOMING' && (
                            <button
                              type="button"
                              onClick={() => {
                                setInlineNewGoodOpen((prev) => {
                                  const next = !prev;
                                  if (!next) setInlineNewGoodCustomColorOpen(false);
                                  return next;
                                });
                              }}
                              className={`tpd-click-press inline-flex items-center gap-1 rounded-xl border px-2.5 py-1 text-[11px] font-bold ${
                                inlineNewGoodOpen ? t.tabActive : t.btnSecondary
                              }`}
                            >
                              <Plus size={12} />
                              <span>{inlineNewGoodOpen ? 'Close' : 'New Item'}</span>
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => {
                              setAddGoodPickerOpen(false);
                              setInlineNewGoodOpen(false);
                              setInlineNewGoodCustomColorOpen(false);
                            }}
                            className={`text-xs ${t.textMuted}`}
                          >
                            Done
                          </button>
                        </div>
                      </div>

                      {docKind === 'INCOMING' && inlineNewGoodOpen && (
                        <div
                          ref={inlineNewGoodRef}
                          className={`tpd-slide-down rounded-2xl border ${t.border} ${t.cardBg2} p-3.5 space-y-3`}
                        >
                          <div>
                            <p className={`text-[10px] uppercase tracking-[0.25em] ${t.textMuted}`}>CREATE</p>
                            <h4 className="text-base font-black">New item</h4>
                          </div>

                          <div className="grid gap-3 sm:grid-cols-2">
                            <div className="sm:col-span-2">
                              <label className={`mb-1 block text-xs ${t.textMuted}`}>Item Name</label>
                              <input
                                value={inlineNewGood.name}
                                onChange={(e) =>
                                  setInlineNewGood((prev) => ({ ...prev, name: e.target.value }))
                                }
                                placeholder="Item Name"
                                className={`w-full rounded-2xl border ${t.border} ${t.inputBg} px-3.5 py-2 text-base sm:text-sm outline-none ${t.text}`}
                              />
                            </div>

                            <div>
                              <label className={`mb-1 block text-xs ${t.textMuted}`}>SKU / Barcode</label>
                              <div className="flex items-center gap-2">
                                <input
                                  value={inlineNewGood.sku}
                                  onChange={(e) =>
                                    setInlineNewGood((prev) => ({ ...prev, sku: e.target.value }))
                                  }
                                  placeholder="Scan or type SKU"
                                  className={`w-full rounded-2xl border ${t.border} ${t.inputBg} px-3.5 py-2 text-base sm:text-sm outline-none ${t.text}`}
                                />
                                <button
                                  type="button"
                                  onClick={() =>
                                    setInlineNewGood((prev) => ({
                                      ...prev,
                                      sku: buildSkuForCategory(prev.category),
                                    }))
                                  }
                                  className={`tpd-click-press shrink-0 rounded-2xl border ${t.btnSecondary} px-3 py-2 text-xs font-semibold`}
                                >
                                  Auto
                                </button>
                              </div>
                            </div>

                            <div>
                              <label className={`mb-1 block text-xs ${t.textMuted}`}>Category</label>
                              <CascadeSelect
                                value={inlineNewGood.category}
                                onChange={(valCat) =>
                                  setInlineNewGood((prev) => ({ ...prev, category: valCat }))
                                }
                                options={
                                  modalCategoryOptions.length > 0
                                    ? modalCategoryOptions
                                    : [{ value: 'General', label: 'General' }]
                                }
                                darkMode={darkMode}
                                fullWidth
                              />
                            </div>

                            <div>
                              <label className={`mb-1 block text-xs ${t.textMuted}`}>Size / Type</label>
                              <input
                                value={inlineNewGood.size}
                                onChange={(e) =>
                                  setInlineNewGood((prev) => ({ ...prev, size: e.target.value }))
                                }
                                placeholder="M"
                                className={`w-full rounded-2xl border ${t.border} ${t.inputBg} px-3.5 py-2 text-base sm:text-sm outline-none ${t.text}`}
                              />
                            </div>

                            <div>
                              <label className={`mb-1 block text-xs ${t.textMuted}`}>Stock</label>
                              <input
                                type="number"
                                min={0}
                                value={inlineNewGood.stock}
                                onChange={(e) =>
                                  setInlineNewGood((prev) => ({ ...prev, stock: e.target.value }))
                                }
                                className={`w-full rounded-2xl border ${t.border} ${t.inputBg} px-3.5 py-2 text-base sm:text-sm tabular-nums outline-none ${t.text}`}
                              />
                            </div>

                            <div className="sm:col-span-2">
                              <label className={`mb-1 block text-xs ${t.textMuted}`}>Min Stock</label>
                              <input
                                type="number"
                                min={0}
                                value={inlineNewGood.min}
                                onChange={(e) =>
                                  setInlineNewGood((prev) => ({ ...prev, min: e.target.value }))
                                }
                                className={`w-full rounded-2xl border ${t.border} ${t.inputBg} px-3.5 py-2 text-base sm:text-sm tabular-nums outline-none ${t.text}`}
                              />
                            </div>

                            <div className="sm:col-span-2">
                              <div className="mb-1.5 flex items-center justify-between gap-2">
                                <label className={`text-xs ${t.textMuted}`}>Colors</label>
                                <button
                                  type="button"
                                  onClick={() => setInlineNewGoodCustomColorOpen((prev) => !prev)}
                                  className={`tpd-click-press inline-flex items-center gap-1 rounded-full border ${t.btnSecondary} px-2.5 py-1 text-[11px] font-semibold`}
                                >
                                  <Palette size={12} />
                                  <span>{inlineNewGoodCustomColorOpen ? 'Hide Custom Color' : 'Custom Color'}</span>
                                </button>
                              </div>

                              <div className="flex flex-wrap gap-1.5">
                                {allInlineSelectableColors.map((color) => {
                                  const active = inlineNewGood.colors.includes(color);
                                  return (
                                    <button
                                      key={color}
                                      type="button"
                                      onClick={() =>
                                        setInlineNewGood((prev) => ({
                                          ...prev,
                                          colors: prev.colors.includes(color)
                                            ? prev.colors.filter((c) => c !== color)
                                            : [...prev.colors, color],
                                        }))
                                      }
                                      className={`group flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium ${
                                        active ? t.tabActive : t.tabInactive
                                      }`}
                                    >
                                      <ColorCircle color={color} size="sm" />
                                      <span>{color}</span>
                                    </button>
                                  );
                                })}
                              </div>

                              {inlineNewGoodCustomColorOpen && (
                                <div className={`tpd-slide-down mt-2.5 rounded-2xl border ${t.border} ${t.cardBg3} p-3 space-y-3`}>
                                  <div className="flex flex-wrap gap-1.5">
                                    {FEATURED_SWATCHES.map((swatchName) => {
                                      const swatchHex = getColorFill(swatchName);
                                      const isCurrent =
                                        previewSwatchName === swatchName ||
                                        pickerHex.toLowerCase() === swatchHex.toLowerCase();
                                      return (
                                        <button
                                          key={swatchName}
                                          type="button"
                                          onClick={() => handleQuickSwatchSelect(swatchName)}
                                          title={swatchName}
                                          aria-label={swatchName}
                                          className={`tpd-click-press h-6 w-6 rounded-full border transition-transform duration-100 hover:scale-110 ${
                                            isCurrent
                                              ? 'ring-2 ring-sky-400 scale-110 border-white'
                                              : 'border-zinc-500/50'
                                          }`}
                                          style={{ backgroundColor: swatchHex }}
                                        />
                                      );
                                    })}
                                  </div>

                                  <div
                                    role="slider"
                                    tabIndex={0}
                                    aria-label="Color saturation and brightness"
                                    aria-valuemin={0}
                                    aria-valuemax={100}
                                    aria-valuenow={Math.round(sat * 100)}
                                    onPointerDown={(e) => {
                                      e.currentTarget.setPointerCapture(e.pointerId);
                                      updateSvFromPointer(e.clientX, e.clientY, e.currentTarget.getBoundingClientRect());
                                    }}
                                    onPointerMove={(e) => {
                                      if (e.buttons === 1 || e.pointerType === 'touch') {
                                        updateSvFromPointer(e.clientX, e.clientY, e.currentTarget.getBoundingClientRect());
                                      }
                                    }}
                                    className="relative h-28 w-full cursor-crosshair touch-none select-none rounded-xl border border-zinc-500/40 overflow-hidden"
                                    style={{ backgroundColor: currentHueHex }}
                                  >
                                    <div
                                      className="absolute inset-0"
                                      style={{
                                        background: 'linear-gradient(to right, #ffffff, rgba(255,255,255,0))',
                                      }}
                                    />
                                    <div
                                      className="absolute inset-0"
                                      style={{
                                        background: 'linear-gradient(to top, #000000, rgba(0,0,0,0))',
                                      }}
                                    />
                                    <div
                                      className="pointer-events-none absolute h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-[0_0_0_1.5px_rgba(0,0,0,0.75)]"
                                      style={{
                                        left: `${sat * 100}%`,
                                        top: `${(1 - val) * 100}%`,
                                        backgroundColor: pickerHex,
                                      }}
                                    />
                                  </div>

                                  <input
                                    type="range"
                                    min={0}
                                    max={360}
                                    value={Math.round(hue)}
                                    onChange={(e) => updateHueFromValue(Number(e.target.value))}
                                    aria-label="Hue slider"
                                    className="tpd-hue-slider w-full cursor-pointer"
                                  />

                                  <div className="flex flex-wrap items-center justify-between gap-2">
                                    <div className="flex items-center gap-2 min-w-0">
                                      <span
                                        className="h-6 w-6 shrink-0 rounded-full border border-zinc-500/50"
                                        style={{ backgroundColor: pickerHex }}
                                      />
                                      <span className="text-xs font-bold truncate">
                                        {previewSwatchName ?? currentMatchedName}
                                      </span>
                                      <span className={`text-[10px] font-mono ${t.textMuted2}`}>{pickerHex}</span>
                                    </div>

                                    <div className="flex items-center gap-1.5 shrink-0">
                                      <button
                                        type="button"
                                        onClick={() => addColorToInlineNewGood(previewSwatchName ?? currentMatchedName)}
                                        className={`tpd-click-press rounded-xl border ${t.btnSecondary} px-2.5 py-1 text-[11px] font-semibold`}
                                      >
                                        + {previewSwatchName ?? currentMatchedName}
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => addColorToInlineNewGood(pickerHex)}
                                        className={`tpd-click-press rounded-xl border ${t.btnPrimary} px-2.5 py-1 text-[11px] font-semibold`}
                                      >
                                        + {pickerHex}
                                      </button>
                                    </div>
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>

                          <div className="flex justify-end gap-2 pt-1">
                            <button
                              type="button"
                              onClick={() => {
                                setInlineNewGoodOpen(false);
                                setInlineNewGoodCustomColorOpen(false);
                              }}
                              className={`tpd-click-press rounded-2xl border ${t.border} ${t.btnSecondary} px-3.5 py-1.5 text-xs font-semibold`}
                            >
                              Cancel
                            </button>
                            <button
                              type="button"
                              onClick={addInlineNewItemToDocument}
                              disabled={!inlineNewGood.name.trim()}
                              className={`tpd-click-press rounded-2xl border ${t.btnPrimary} px-4 py-1.5 text-xs font-bold disabled:opacity-40`}
                            >
                              Create item
                            </button>
                          </div>
                        </div>
                      )}

                      <input
                        value={addGoodCatalogQuery}
                        onChange={(e) => setAddGoodCatalogQuery(e.target.value)}
                        placeholder="Filter items..."
                        className={`w-full rounded-xl border ${t.border} ${t.inputBg} px-3 py-2 text-base sm:text-xs outline-none ${t.text}`}
                      />
                      <div className="max-h-36 overflow-y-auto space-y-1">
                        {catalogSearchResults.length === 0 ? (
                          <div className="py-3 text-center space-y-2">
                            <p className={`text-xs ${t.textMuted}`}>No matching items.</p>
                            {docKind === 'INCOMING' && (
                              <button
                                type="button"
                                onClick={() => {
                                  setInlineNewGood((prev) => ({
                                    ...prev,
                                    name: addGoodCatalogQuery.trim(),
                                  }));
                                  setInlineNewGoodOpen(true);
                                }}
                                className={`tpd-click-press inline-flex items-center gap-1 rounded-xl border ${t.btnPrimary} px-3 py-1.5 text-xs font-bold`}
                              >
                                <Plus size={12} />
                                <span>Create &ldquo;{addGoodCatalogQuery.trim() || 'Item'}&rdquo;</span>
                              </button>
                            )}
                          </div>
                        ) : (
                          catalogSearchResults.map((invItem) => (
                            <button
                              key={invItem.id}
                              type="button"
                              onClick={() => addCatalogItemToDocument(invItem, 1)}
                              className={`flex w-full items-center justify-between rounded-xl border ${t.border} ${t.cardBgHover} px-3 py-1.5 text-left text-xs`}
                            >
                              <span className="font-semibold truncate">
                                {invItem.name} <span className={t.textMuted2}>({invItem.size} • {invItem.stock})</span>
                              </span>
                              <span className={`rounded-lg border ${t.btnPrimary} px-2 py-0.5 text-[10px] font-bold shrink-0`}>
                                + Add
                              </span>
                            </button>
                          ))
                        )}
                      </div>
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-2.5 pt-2">
                    <button
                      type="button"
                      onClick={() => setAddGoodPickerOpen((prev) => !prev)}
                      className={`rounded-2xl border ${t.btnPrimary} px-4 py-3 text-xs sm:text-sm font-bold`}
                    >
                      Add item
                    </button>
                    <button
                      type="button"
                      onClick={() => openScannerModal(true)}
                      className={`rounded-2xl border ${t.btnSecondary} px-4 py-3 text-xs sm:text-sm font-bold`}
                    >
                      Scan item
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {isSettingsOpen && (
        <div className={`tpd-fade-in fixed inset-0 z-50 flex items-center justify-center ${t.overlay} p-3 sm:p-4 overflow-y-auto`}>
          <div className={`tpd-modal-enter my-auto max-h-[90dvh] overflow-y-auto w-full max-w-md rounded-3xl border ${t.modalBg} p-4 sm:p-6 shadow-2xl`}>
            <div className="flex items-center justify-between">
              <div>
                <p className={`text-xs uppercase tracking-[0.3em] ${t.textMuted}`}>PREFERENCES</p>
                <h3 className="text-xl sm:text-2xl font-black">Settings</h3>
              </div>
              <button
                type="button"
                onClick={closeSettingsModal}
                className={`tpd-click-press rounded-full border ${t.border} ${t.btnSecondary} px-3 py-1 text-xs`}
              >
                Close
              </button>
            </div>

            <div className="mt-5 space-y-4">
              <div className={`rounded-2xl border ${t.border} ${t.cardBg3} p-3.5`}>
                <p className="text-sm font-bold">Export Inventory</p>
                <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
                  <button
                    type="button"
                    onClick={() => exportInventory('csv')}
                    className={`rounded-xl border ${t.btnSecondary} px-3 py-2 text-xs font-semibold flex items-center justify-center gap-1.5`}
                  >
                    <Download size={13} />
                    <span>CSV</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleExportPdfChoice('all')}
                    className={`rounded-xl border ${t.btnSecondary} px-3 py-2 text-xs font-semibold flex items-center justify-center gap-1.5`}
                  >
                    <FileText size={13} />
                    <span>PDF (All)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleExportPdfChoice('filtered')}
                    className={`rounded-xl border ${t.btnSecondary} px-3 py-2 text-xs font-semibold flex items-center justify-center gap-1.5`}
                  >
                    <FileText size={13} />
                    <span>PDF (Filtered)</span>
                  </button>
                </div>
              </div>

              <div className={`flex items-center justify-between gap-3 rounded-2xl border ${t.border} ${t.cardBg3} p-3.5`}>
                <div>
                  <p className="text-sm font-bold">Dark Mode</p>
                  <p className={`text-xs ${t.textMuted}`}>Toggle dark or light theme</p>
                </div>
                <button
                  type="button"
                  onClick={() => setDarkMode((prev) => !prev)}
                  className={`rounded-xl border px-3 py-1.5 text-xs font-semibold ${darkMode ? t.tabActive : t.tabInactive}`}
                >
                  {darkMode ? 'On' : 'Off'}
                </button>
              </div>

              <div className={`flex items-center justify-between gap-3 rounded-2xl border ${t.border} ${t.cardBg3} p-3.5`}>
                <div>
                  <p className="text-sm font-bold">Stock Alert Pop-Up</p>
                  <p className={`text-xs ${t.textMuted}`}>Top alert on low or empty stock</p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowLowStockPopUp((prev) => !prev)}
                  className={`rounded-xl border px-3 py-1.5 text-xs font-semibold ${showLowStockPopUp ? t.tabActive : t.tabInactive}`}
                >
                  {showLowStockPopUp ? 'On' : 'Off'}
                </button>
              </div>

              <div className={`rounded-2xl border ${t.border} ${t.cardBg3} p-3.5`}>
                <p className="text-sm font-bold">Barcode Label</p>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  {(['compact', 'full'] as BarcodeLabelFormat[]).map((fmt) => (
                    <button
                      key={fmt}
                      type="button"
                      onClick={() => setLabelFormat(fmt)}
                      className={`rounded-xl border px-2.5 py-1.5 text-xs font-semibold capitalize ${
                        labelFormat === fmt ? t.tabActive : t.tabInactive
                      }`}
                    >
                      {fmt === 'compact' ? 'Compact' : 'Full'}
                    </button>
                  ))}
                </div>
              </div>

              <div className={`rounded-2xl border ${t.border} ${t.cardBg3} p-3.5`}>
                <p className="text-sm font-bold">Scanner Action</p>
                <div className="mt-3 grid grid-cols-3 gap-2">
                  {(['search', 'add', 'deduct'] as ScanActionMode[]).map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => setScanMode(mode)}
                      className={`rounded-xl border px-2.5 py-1.5 text-xs font-semibold capitalize ${
                        scanMode === mode ? t.tabActive : t.tabInactive
                      }`}
                    >
                      {mode === 'search' ? 'Find' : mode === 'add' ? 'Add' : 'Deduct'}
                    </button>
                  ))}
                </div>
              </div>

              <div className={`rounded-2xl border ${t.needsRestockBorder} ${t.needsRestockBg} p-3.5`}>
                <p className={`text-sm font-bold ${t.dangerText}`}>Delete Account</p>
                <p className={`text-xs ${t.textMuted} mt-0.5`}>Sign out and log deletion request</p>
                {!confirmDeleteAccount ? (
                  <button
                    type="button"
                    onClick={() => setConfirmDeleteAccount(true)}
                    className={`mt-3 rounded-xl border ${t.btnDangerSubtle} px-3 py-1.5 text-xs font-bold`}
                  >
                    Delete Account
                  </button>
                ) : (
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={handleDeleteAccount}
                      disabled={isDeletingAccount}
                      className="tpd-click-press rounded-xl border border-red-700 bg-red-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-red-700 disabled:opacity-60"
                    >
                      {isDeletingAccount ? 'Deleting...' : 'Confirm Delete'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmDeleteAccount(false)}
                      className={`tpd-click-press rounded-xl border ${t.btnSecondary} px-3 py-1.5 text-xs font-semibold`}
                    >
                      Cancel
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {isScannerOpen && (
        <div className={`tpd-fade-in fixed inset-0 z-50 flex items-center justify-center ${t.overlay} p-3 sm:p-4 overflow-y-auto`}>
          <div className={`tpd-modal-enter my-auto max-h-[90dvh] overflow-y-auto w-full max-w-lg rounded-3xl border ${t.modalBg} p-4 sm:p-6 shadow-2xl`}>
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className={`text-xs uppercase tracking-[0.3em] ${t.textMuted}`}>BARCODE SCANNER</p>
                <h3 className="text-xl sm:text-2xl font-black">
                  {docModalOpen ? `Scan into ${docNo}` : 'Scan Barcode'}
                </h3>
              </div>
              <button
                type="button"
                onClick={closeScannerModal}
                className={`tpd-click-press rounded-full border ${t.border} ${t.btnSecondary} px-3 py-1 text-xs`}
              >
                Close
              </button>
            </div>

            {!docModalOpen && (
              <div className="mt-4 space-y-3">
                <div className="grid grid-cols-3 gap-2">
                  {(
                    [
                      { id: 'search', label: 'Find SKU' },
                      { id: 'add', label: 'Add Stock' },
                      { id: 'deduct', label: 'Deduct Stock' },
                    ] as const
                  ).map((option) => (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() => setScanMode(option.id)}
                      className={`rounded-2xl border px-3 py-2 text-xs font-semibold ${
                        scanMode === option.id ? t.tabActive : t.tabInactive
                      }`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>

                {scanMode !== 'search' && (
                  <div className="flex items-center justify-between gap-3">
                    <span className={`text-xs font-medium ${t.textMuted}`}>Quantity per scan:</span>
                    <input
                      type="number"
                      min={1}
                      value={scanQuantity}
                      onChange={(event) => setScanQuantity(Math.max(1, Number(event.target.value) || 1))}
                      className={`w-24 rounded-2xl border ${t.border} ${t.inputBg} px-3 py-1.5 text-base sm:text-sm font-bold tabular-nums outline-none ${t.text}`}
                    />
                  </div>
                )}
              </div>
            )}

            <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setContinuousScan((prev) => !prev)}
                  className={`tpd-click-press inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold ${
                    continuousScan ? t.tabActive : t.tabInactive
                  }`}
                >
                  <Repeat size={12} />
                  <span>Continuous: {continuousScan ? 'On' : 'Off'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setScanSoundEnabled((prev) => !prev)}
                  className={`tpd-click-press inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold ${
                    scanSoundEnabled ? t.tabActive : t.tabInactive
                  }`}
                >
                  {scanSoundEnabled ? <Volume2 size={12} /> : <VolumeX size={12} />}
                  <span>Sound: {scanSoundEnabled ? 'On' : 'Off'}</span>
                </button>
              </div>

              <button
                type="button"
                onClick={() => setCameraRestartNonce((prev) => prev + 1)}
                className={`tpd-click-press inline-flex items-center gap-1 rounded-full border ${t.border} ${t.btnSecondary} px-3 py-1 text-xs font-semibold`}
              >
                <RefreshCw size={12} />
                <span>Retry</span>
              </button>
            </div>

            {scanSuccessBanner && (
              <div
                className={`tpd-slide-down mt-3 flex items-center justify-between gap-2 rounded-2xl border ${t.needsRestockBorder} ${t.needsRestockBg} px-3.5 py-2 text-xs font-bold`}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className="h-2.5 w-2.5 rounded-full bg-emerald-500 shrink-0" />
                  <span className="truncate">{scanSuccessBanner}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setScanSuccessBanner(null)}
                  aria-label="Dismiss scan alert"
                  className={`tpd-click-press rounded-lg p-1 ${t.textMuted} shrink-0`}
                >
                  <X size={12} />
                </button>
              </div>
            )}

            <div className={`tpd-scanner-frame mt-4 overflow-hidden rounded-2xl border ${t.border} bg-black`}>
              <div id="barcode-camera-reader" className="min-h-[240px] w-full" />
            </div>

            {scannerError && (
              <div className={`mt-3 rounded-2xl border ${t.lowBg} px-3.5 py-2.5 text-xs font-medium flex items-center justify-between gap-2`}>
                <span>{scannerError}</span>
                <button
                  type="button"
                  onClick={() => setCameraRestartNonce((prev) => prev + 1)}
                  className={`tpd-click-press shrink-0 rounded-xl border ${t.btnPrimary} px-2.5 py-1 text-[11px] font-bold`}
                >
                  Retry
                </button>
              </div>
            )}

            {scanFeedback && (
              <div className={`mt-3 rounded-2xl border ${t.border} ${t.cardBg3} px-3.5 py-2.5 text-xs font-medium`}>
                {scanFeedback}
              </div>
            )}
          </div>
        </div>
      )}

      {isModalOpen && (
        <div className={`tpd-fade-in fixed inset-0 z-50 flex items-center justify-center ${t.overlay} p-3 sm:p-4 overflow-y-auto`}>
          <div className={`tpd-modal-enter my-auto max-h-[90dvh] overflow-y-auto w-full max-w-lg rounded-3xl border ${t.modalBg} p-4 sm:p-6 shadow-2xl`}>
            <div className="flex items-center justify-between">
              <div>
                <p className={`text-xs uppercase tracking-[0.3em] ${t.textMuted}`}>{editingId ? 'EDIT' : 'CREATE'}</p>
                <h3 className="text-xl sm:text-2xl font-black">{editingId ? 'Edit item' : 'New item'}</h3>
              </div>
              <button onClick={closeItemModal} className={`tpd-click-press rounded-full border ${t.border} ${t.btnSecondary} px-3 py-1 text-xs`}>Close</button>
            </div>
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className={`mb-1 block text-xs ${t.textMuted}`}>Item Name</label>
                <input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="Item Name" className={`w-full rounded-2xl border ${t.border} ${t.inputBg} px-3.5 py-2.5 text-base sm:text-sm outline-none ${t.text}`} />
              </div>
              <div>
                <label className={`mb-1 block text-xs ${t.textMuted}`}>SKU / Barcode</label>
                <div className="flex items-center gap-2">
                  <input value={form.sku} onChange={(event) => setForm({ ...form, sku: event.target.value })} placeholder="Scan or type SKU" className={`w-full rounded-2xl border ${t.border} ${t.inputBg} px-3.5 py-2.5 text-base sm:text-sm outline-none ${t.text}`} />
                  <button
                    type="button"
                    onClick={generateCustomSku}
                    className={`tpd-click-press shrink-0 rounded-2xl border ${t.btnSecondary} px-3 py-2.5 text-xs font-semibold`}
                  >
                    Auto
                  </button>
                </div>
              </div>
              <div>
                <label className={`mb-1 block text-xs ${t.textMuted}`}>Category</label>
                <CascadeSelect
                  value={form.category}
                  onChange={(nextCategory) => setForm({ ...form, category: nextCategory })}
                  options={modalCategoryOptions}
                  darkMode={darkMode}
                  fullWidth
                />
              </div>
              <div>
                <label className={`mb-1 block text-xs ${t.textMuted}`}>Size / Type</label>
                <input value={form.size} onChange={(event) => setForm({ ...form, size: event.target.value })} placeholder="M" className={`w-full rounded-2xl border ${t.border} ${t.inputBg} px-3.5 py-2.5 text-base sm:text-sm outline-none ${t.text}`} />
              </div>
              <div>
                <label className={`mb-1 block text-xs ${t.textMuted}`}>Stock</label>
                <input type="number" value={form.stock} onChange={(event) => setForm({ ...form, stock: event.target.value })} className={`w-full rounded-2xl border ${t.border} ${t.inputBg} px-3.5 py-2.5 text-base sm:text-sm tabular-nums outline-none ${t.text}`} />
              </div>
              <div className="sm:col-span-2">
                <label className={`mb-1 block text-xs ${t.textMuted}`}>Min Stock</label>
                <input type="number" value={form.min} onChange={(event) => setForm({ ...form, min: event.target.value })} className={`w-full rounded-2xl border ${t.border} ${t.inputBg} px-3.5 py-2.5 text-base sm:text-sm tabular-nums outline-none ${t.text}`} />
              </div>
              <div className="sm:col-span-2">
                <div className="mb-1.5 flex items-center justify-between gap-2">
                  <label className={`text-xs ${t.textMuted}`}>Colors</label>
                  <button
                    type="button"
                    onClick={togglePicker}
                    className={`tpd-click-press inline-flex items-center gap-1.5 rounded-full border ${t.btnSecondary} px-3 py-1 text-xs font-semibold`}
                  >
                    <Palette size={13} />
                    <span>{isPickerOpen ? 'Hide Custom Color' : 'Custom Color'}</span>
                  </button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {allSelectableColors.map((color) => {
                    const active = form.colors.includes(color);
                    return (
                      <button
                        key={color}
                        type="button"
                        onClick={() => toggleColor(color)}
                        className={`group flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium ${active ? t.tabActive : t.tabInactive}`}
                      >
                        <ColorCircle color={color} size="sm" />
                        <span>{color}</span>
                      </button>
                    );
                  })}
                </div>

                {isPickerOpen && (
                  <div
                    ref={customColorPanelRef}
                    className={`tpd-slide-down mt-3 rounded-2xl border ${t.border} ${t.cardBg3} p-3.5 space-y-3`}
                  >
                    <div className="flex flex-wrap gap-1.5">
                      {FEATURED_SWATCHES.map((swatchName) => {
                        const swatchHex = getColorFill(swatchName);
                        const isCurrent =
                          previewSwatchName === swatchName ||
                          pickerHex.toLowerCase() === swatchHex.toLowerCase();
                        return (
                          <button
                            key={swatchName}
                            type="button"
                            onClick={() => handleQuickSwatchSelect(swatchName)}
                            title={swatchName}
                            aria-label={swatchName}
                            className={`tpd-click-press h-6 w-6 rounded-full border transition-transform duration-100 hover:scale-110 ${
                              isCurrent
                                ? 'ring-2 ring-sky-400 scale-110 border-white'
                                : 'border-zinc-500/50'
                            }`}
                            style={{ backgroundColor: swatchHex }}
                          />
                        );
                      })}
                    </div>

                    <div
                      role="slider"
                      tabIndex={0}
                      aria-label="Color saturation and brightness"
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={Math.round(sat * 100)}
                      onPointerDown={(e) => {
                        e.currentTarget.setPointerCapture(e.pointerId);
                        updateSvFromPointer(e.clientX, e.clientY, e.currentTarget.getBoundingClientRect());
                      }}
                      onPointerMove={(e) => {
                        if (e.buttons === 1 || e.pointerType === 'touch') {
                          updateSvFromPointer(e.clientX, e.clientY, e.currentTarget.getBoundingClientRect());
                        }
                      }}
                      className="relative h-32 w-full cursor-crosshair touch-none select-none rounded-xl border border-zinc-500/40 overflow-hidden"
                      style={{ backgroundColor: currentHueHex }}
                    >
                      <div
                        className="absolute inset-0"
                        style={{
                          background: 'linear-gradient(to right, #ffffff, rgba(255,255,255,0))',
                        }}
                      />
                      <div
                        className="absolute inset-0"
                        style={{
                          background: 'linear-gradient(to top, #000000, rgba(0,0,0,0))',
                        }}
                      />
                      <div
                        className="pointer-events-none absolute h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-[0_0_0_1.5px_rgba(0,0,0,0.75)]"
                        style={{
                          left: `${sat * 100}%`,
                          top: `${(1 - val) * 100}%`,
                          backgroundColor: pickerHex,
                        }}
                      />
                    </div>

                    <input
                      type="range"
                      min={0}
                      max={360}
                      value={Math.round(hue)}
                      onChange={(e) => updateHueFromValue(Number(e.target.value))}
                      aria-label="Hue slider"
                      className="tpd-hue-slider w-full cursor-pointer"
                    />

                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <span
                          className="h-6 w-6 shrink-0 rounded-full border border-zinc-500/50"
                          style={{ backgroundColor: pickerHex }}
                        />
                        <span className="text-xs font-bold truncate">
                          {previewSwatchName ?? currentMatchedName}
                        </span>
                        <span className={`text-[11px] font-mono ${t.textMuted2}`}>{pickerHex}</span>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => addColorToForm(previewSwatchName ?? currentMatchedName)}
                          className={`tpd-click-press rounded-xl border ${t.btnSecondary} px-2.5 py-1 text-xs font-semibold`}
                        >
                          + {previewSwatchName ?? currentMatchedName}
                        </button>
                        <button
                          type="button"
                          onClick={() => addColorToForm(pickerHex)}
                          className={`tpd-click-press rounded-xl border ${t.btnPrimary} px-2.5 py-1 text-xs font-semibold`}
                        >
                          + {pickerHex}
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={closeItemModal}
                disabled={isSavingItem}
                className={`rounded-2xl border ${t.border} ${t.btnSecondary} px-4 py-2 text-sm disabled:opacity-50`}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={submitItem}
                disabled={isSavingItem}
                className={`inline-flex items-center justify-center gap-2 rounded-2xl border ${t.btnPrimary} px-5 py-2 text-sm font-semibold disabled:opacity-70`}
              >
                {saveSuccess ? (
                  <>
                    <Check size={16} strokeWidth={3} className={t.successText} />
                    <span>Saved</span>
                  </>
                ) : isSavingItem ? (
                  <>
                    <img src="/icon.png" alt="" className="h-4 w-4 animate-spin object-contain" />
                    <span>Saving...</span>
                  </>
                ) : (
                  <span>Save</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      <style jsx global>{`
        .tpd-click-press {
          transition: transform 110ms cubic-bezier(0.22, 1, 0.36, 1), background-color 140ms ease, border-color 140ms ease, box-shadow 140ms ease;
          will-change: transform;
        }
        .tpd-click-press:active {
          transform: scale(0.965);
        }

        @keyframes tpdSlideInTop {
          from {
            opacity: 0;
            transform: translate3d(0, -14px, 0) scale(0.98);
          }
          to {
            opacity: 1;
            transform: translate3d(0, 0, 0) scale(1);
          }
        }
        @keyframes tpdSlideOutTop {
          from {
            opacity: 1;
            transform: translate3d(0, 0, 0) scale(1);
          }
          to {
            opacity: 0;
            transform: translate3d(0, -14px, 0) scale(0.98);
          }
        }
        .tpd-slide-in-top {
          animation: tpdSlideInTop 190ms cubic-bezier(0.22, 1, 0.36, 1) both;
          will-change: transform, opacity;
        }
        .tpd-slide-out-top {
          animation: tpdSlideOutTop 160ms cubic-bezier(0.4, 0, 1, 1) both;
          will-change: transform, opacity;
        }

        @keyframes tpdSlideInRight {
          from {
            opacity: 0;
            transform: translate3d(16px, 0, 0) scale(0.98);
          }
          to {
            opacity: 1;
            transform: translate3d(0, 0, 0) scale(1);
          }
        }
        .tpd-slide-in-right {
          animation: tpdSlideInRight 190ms cubic-bezier(0.22, 1, 0.36, 1) both;
          will-change: transform, opacity;
        }

        @keyframes tpdSlideDown {
          from {
            opacity: 0;
            transform: translate3d(0, -6px, 0);
          }
          to {
            opacity: 1;
            transform: translate3d(0, 0, 0);
          }
        }
        .tpd-slide-down {
          animation: tpdSlideDown 150ms cubic-bezier(0.22, 1, 0.36, 1) both;
          will-change: transform, opacity;
        }

        @keyframes tpdFadeIn {
          from {
            opacity: 0;
          }
          to {
            opacity: 1;
          }
        }
        @keyframes tpdModalEnter {
          from {
            opacity: 0;
            transform: translate3d(0, 10px, 0) scale(0.985);
          }
          to {
            opacity: 1;
            transform: translate3d(0, 0, 0) scale(1);
          }
        }
        .tpd-fade-in {
          animation: tpdFadeIn 130ms ease-out both;
        }
        .tpd-modal-enter {
          animation: tpdModalEnter 170ms cubic-bezier(0.22, 1, 0.36, 1) both;
          will-change: transform, opacity;
        }

        .tpd-hue-slider {
          -webkit-appearance: none;
          appearance: none;
          height: 12px;
          border-radius: 9999px;
          background: linear-gradient(
            to right,
            #ff0000 0%,
            #ffff00 17%,
            #00ff00 33%,
            #00ffff 50%,
            #0000ff 67%,
            #ff00ff 83%,
            #ff0000 100%
          );
          border: 1px solid rgba(113, 113, 122, 0.45);
        }
        .tpd-hue-slider::-webkit-slider-thumb {
          -webkit-appearance: none;
          appearance: none;
          width: 16px;
          height: 16px;
          border-radius: 9999px;
          background: #ffffff;
          border: 2px solid #09090b;
          box-shadow: 0 1px 4px rgba(0, 0, 0, 0.45);
          cursor: pointer;
        }
        .tpd-hue-slider::-moz-range-thumb {
          width: 16px;
          height: 16px;
          border-radius: 9999px;
          background: #ffffff;
          border: 2px solid #09090b;
          box-shadow: 0 1px 4px rgba(0, 0, 0, 0.45);
          cursor: pointer;
        }

        @media (prefers-reduced-motion: reduce) {
          .tpd-click-press,
          .tpd-slide-in-top,
          .tpd-slide-out-top,
          .tpd-slide-in-right,
          .tpd-slide-down,
          .tpd-fade-in,
          .tpd-modal-enter {
            animation: none !important;
            transition: none !important;
          }
        }
      `}</style>
    </main>
  );
}

function CopyIcon({ size = 14 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}