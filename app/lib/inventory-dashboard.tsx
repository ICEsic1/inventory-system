'use client';

import { supabase } from './supabase';
import type { User } from '@supabase/supabase-js';
import { useEffect, useMemo, useRef, useState } from 'react';
import Barcode from 'react-barcode';
import {
  AlertTriangle,
  Bell,
  Box,
  Check,
  CheckCheck,
  ChevronDown,
  ChevronUp,
  Copy,
  Download,
  Edit3,
  Lock,
  LogOut,
  Mail,
  Maximize2,
  Minimize2,
  Moon,
  Package2,
  Palette,
  Plus,
  Printer,
  Repeat,
  RotateCcw,
  Search,
  Settings,
  Sparkles,
  Sun,
  Trash2,
  TrendingUp,
  Volume2,
  VolumeX,
  Warehouse,
  X,
} from 'lucide-react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import Papa from 'papaparse';

type InventoryItem = {
  id: string;
  name: string;
  sku: string;
  category: string;
  size: string;
  stock: number;
  min: number;
  status: 'LOW' | 'OK';
  colors: string[];
};

type AuditEntry = {
  id: string;
  action: string;
  item: string;
  detail: string;
  user: string;
  time: string;
};

type Category = {
  id: string;
  name: string;
};

type ScanActionMode = 'search' | 'add' | 'deduct';
type BarcodeLabelFormat = 'compact' | 'full';

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

function formatBarcodeItemSizeLabel(name?: string, size?: string): string {
  const cleanName = (name || 'ITEM')
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

const FEATURED_SWATCHES = ['Black', 'White', 'Red', 'Orange', 'Yellow', 'Lime', 'Green', 'Cyan', 'Blue', 'Purple', 'Pink', 'Navy'];

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

function playScanFeedbackChime(success = true, doubleBeep = false) {
  if (typeof window === 'undefined') return;
  try {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (AudioCtx) {
      const ctx = new AudioCtx();
      if (ctx.state === 'suspended') {
        void ctx.resume();
      }

      const now = ctx.currentTime;

      if (!success) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(310, now);
        gain.gain.setValueAtTime(0.45, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.26);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 0.26);
        setTimeout(() => ctx.close().catch(() => {}), 340);
      } else if (doubleBeep) {
        const beepDuration = 0.11;
        const gap = 0.08;
        [0, beepDuration + gap].forEach((offset) => {
          const startAt = now + offset;
          const oscPrimary = ctx.createOscillator();
          const oscHarmonic = ctx.createOscillator();
          const gain = ctx.createGain();

          oscPrimary.type = 'square';
          oscHarmonic.type = 'square';
          oscPrimary.frequency.setValueAtTime(1567.98, startAt);
          oscHarmonic.frequency.setValueAtTime(3135.96, startAt);

          gain.gain.setValueAtTime(0.85, startAt);
          gain.gain.exponentialRampToValueAtTime(0.01, startAt + beepDuration);

          oscPrimary.connect(gain);
          oscHarmonic.connect(gain);
          gain.connect(ctx.destination);

          oscPrimary.start(startAt);
          oscHarmonic.start(startAt);
          oscPrimary.stop(startAt + beepDuration);
          oscHarmonic.stop(startAt + beepDuration);
        });
        setTimeout(() => ctx.close().catch(() => {}), 460);
      } else {
        const duration = 0.18;
        const oscPrimary = ctx.createOscillator();
        const oscHarmonic = ctx.createOscillator();
        const gain = ctx.createGain();

        oscPrimary.type = 'square';
        oscHarmonic.type = 'square';
        oscPrimary.frequency.setValueAtTime(1567.98, now);
        oscHarmonic.frequency.setValueAtTime(3135.96, now);

        gain.gain.setValueAtTime(0.85, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + duration);

        oscPrimary.connect(gain);
        oscHarmonic.connect(gain);
        gain.connect(ctx.destination);

        oscPrimary.start(now);
        oscHarmonic.start(now);
        oscPrimary.stop(now + duration);
        oscHarmonic.stop(now + duration);
        setTimeout(() => ctx.close().catch(() => {}), 300);
      }
    }

    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      if (!success) {
        navigator.vibrate([50, 40, 50]);
      } else if (doubleBeep) {
        navigator.vibrate([90, 70, 90]);
      } else {
        navigator.vibrate(140);
      }
    }
  } catch {
    // Ignore audio/vibration errors on restricted browsers
  }
}

function ColorCircle({ color, size = 'sm' }: { color: string; size?: 'sm' | 'md' | 'lg' }) {
  const fill = getColorFill(color);
  const sizeClass =
    size === 'lg' ? 'h-6 w-6' : size === 'md' ? 'h-5 w-5' : 'h-4 w-4';
  const minPx = size === 'lg' ? '24px' : size === 'md' ? '20px' : '16px';

  return (
    <span
      className={`inline-block rounded-full border border-zinc-400/60 shrink-0 transition-transform duration-300 ease-out motion-reduce:transition-none group-hover:scale-110 ${sizeClass}`}
      style={{ backgroundColor: fill, minWidth: minPx, minHeight: minPx }}
      aria-hidden="true"
    />
  );
}

function PrintingDepotLogo({ darkMode, size = 'md' }: { darkMode: boolean; size?: 'sm' | 'md' }) {
  const boxSize = size === 'sm' ? 'h-10 w-10 rounded-2xl' : 'h-12 w-12 rounded-2xl';
  const imgSize = size === 'sm' ? 'h-6 w-6' : 'h-7 w-7';

  return (
    <div
      className={`tpd-logo-mark tpd-click-press relative flex ${boxSize} shrink-0 items-center justify-center overflow-hidden border transition-transform duration-300 ease-out motion-reduce:transition-none hover:scale-105 ${
        darkMode
          ? 'border-zinc-700/80 bg-zinc-900 text-white shadow-md'
          : 'border-zinc-300 bg-zinc-100 text-black shadow-sm'
      }`}
    >
      <img
        src="/icon.png"
        alt="The Printing Depot logo"
        className={`${imgSize} object-contain`}
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
  const [closing, setClosing] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const selectedOption = options.find((opt) => opt.value === value) || options[0];

  const closeMenu = () => {
    if (!open || closing) return;
    setClosing(true);
    setTimeout(() => {
      setOpen(false);
      setClosing(false);
    }, 240);
  };

  const toggleMenu = () => {
    if (open) {
      closeMenu();
    } else {
      setClosing(false);
      setOpen(true);
    }
  };

  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        closeMenu();
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closeMenu();
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [open, closing]);

  const triggerStyle = darkMode
    ? 'border-zinc-800 bg-black/50 text-white hover:border-zinc-600 hover:bg-zinc-900/80'
    : 'border-zinc-300 bg-zinc-100 text-black hover:border-zinc-400 hover:bg-zinc-200/80';

  const menuStyle = darkMode
    ? 'border-zinc-800 bg-zinc-950/95 text-white shadow-2xl'
    : 'border-zinc-300 bg-white/95 text-black shadow-2xl';

  return (
    <div ref={containerRef} className={`relative ${fullWidth ? 'w-full' : 'inline-block'}`}>
      <button
        type="button"
        onClick={toggleMenu}
        aria-expanded={open}
        className={`tpd-click-press flex ${fullWidth ? 'w-full justify-between' : minWidthClass + ' justify-between'} items-center gap-2.5 rounded-2xl border ${triggerStyle} px-3.5 py-2 text-base sm:text-sm font-medium transition-all duration-300 ease-out motion-reduce:transition-none`}
      >
        <span className="truncate">{selectedOption?.label ?? value}</span>
        <ChevronDown
          size={15}
          className={`shrink-0 transition-transform duration-300 ease-out motion-reduce:transition-none ${
            open && !closing ? 'rotate-180' : ''
          }`}
        />
      </button>

      {open && (
        <div
          className={`${closing ? 'tpd-cascade-panel-exit' : 'tpd-cascade-panel-enter'} absolute left-0 top-full mt-2 z-40 ${
            fullWidth ? 'w-full' : 'min-w-[205px]'
          } rounded-3xl border ${menuStyle} p-2 backdrop-blur-md transition-all duration-300 ease-out motion-reduce:transition-none`}
        >
          <div className="max-h-64 overflow-y-auto overflow-x-visible space-y-1 p-0.5">
            {options.map((opt, idx) => {
              const isSelected = opt.value === value;
              const staggerMs = Math.min(idx * 42, 320);

              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => {
                    onChange(opt.value);
                    closeMenu();
                  }}
                  style={{
                    animationDelay: closing
                      ? `${Math.max(0, (options.length - 1 - idx) * 25)}ms`
                      : `${staggerMs}ms`,
                  }}
                  className={`${
                    closing ? 'tpd-cascade-item-exit' : 'tpd-cascade-item-enter'
                  } tpd-cascade-option flex w-full items-center justify-between gap-2 rounded-2xl border px-3.5 py-2 text-left text-sm font-medium ${
                    isSelected
                      ? darkMode
                        ? 'border-zinc-500 bg-white text-black font-semibold shadow-md'
                        : 'border-zinc-700 bg-black text-white font-semibold shadow-md'
                      : darkMode
                        ? 'border-transparent text-zinc-200 hover:border-zinc-600 hover:bg-zinc-900 hover:text-white'
                        : 'border-transparent text-zinc-800 hover:border-zinc-400 hover:bg-zinc-100 hover:text-black'
                  }`}
                >
                  <span className="truncate">{opt.label}</span>
                  {isSelected && <Check size={14} className="shrink-0" />}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

export default function InventoryDashboard() {
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authMode, setAuthMode] = useState<'login' | 'signup'>('login');
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authSubmitting, setAuthSubmitting] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [authMessage, setAuthMessage] = useState<string | null>(null);

  const [items, setItems] = useState<InventoryItem[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [auditLog, setAuditLog] = useState<AuditEntry[]>([]);

  // Audit select & clear all state
  const [auditSelectMode, setAuditSelectMode] = useState(false);
  const [selectedAuditIds, setSelectedAuditIds] = useState<Set<string>>(new Set());
  const [confirmClearAllAudit, setConfirmClearAllAudit] = useState(false);
  const [isClearingAudit, setIsClearingAudit] = useState(false);

  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [topLowStockBanner, setTopLowStockBanner] = useState<(AppNotification & { closing?: boolean }) | null>(null);
  const topBannerTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [isNotifOpen, setIsNotifOpen] = useState(false);
  const [isNotifClosing, setIsNotifClosing] = useState(false);
  const seenAuditIdsRef = useRef<Set<string>>(new Set());
  const seenLowStockKeysRef = useRef<Set<string>>(new Set());
  const initialAuditLoadedRef = useRef(false);
  const lowStockChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  // Maximize & single shared minimize state for Stock by category & Recent audit activity
  const [isChartMaximized, setIsChartMaximized] = useState(false);
  const [isAuditMaximized, setIsAuditMaximized] = useState(false);
  const [isSectionMinimized, setIsSectionMinimized] = useState(false);

  // Save button checkmark state
  const [isSavingItem, setIsSavingItem] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Add category checkmark state
  const [isAddingCategory, setIsAddingCategory] = useState(false);
  const [categoryAddSuccess, setCategoryAddSuccess] = useState(false);

  // Scan success & continuous scan state
  const [scanSuccessBanner, setScanSuccessBanner] = useState<string | null>(null);
  const [continuousScan, setContinuousScan] = useState(true);
  const [scanSoundEnabled, setScanSoundEnabled] = useState(true);
  const [lastScannedSummary, setLastScannedSummary] = useState<string | null>(null);
  const [manualWedgeSku, setManualWedgeSku] = useState('');
  const [customCardQty, setCustomCardQty] = useState<Record<string, number>>({});
  const [copiedRestockList, setCopiedRestockList] = useState(false);

  // Barcode label customization state: format (compact vs full) & batch copies count
  const [labelFormat, setLabelFormat] = useState<BarcodeLabelFormat>('compact');
  const [printCopiesByItem, setPrintCopiesByItem] = useState<Record<string, number>>({});

  const continuousScanRef = useRef(true);
  const scanSoundEnabledRef = useRef(true);

  useEffect(() => {
    continuousScanRef.current = continuousScan;
  }, [continuousScan]);

  useEffect(() => {
    scanSoundEnabledRef.current = scanSoundEnabled;
  }, [scanSoundEnabled]);

  // App Settings state
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isSettingsClosing, setIsSettingsClosing] = useState(false);
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
  const [activeTab, setActiveTab] = useState<'inventory' | 'audit'>('inventory');

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isModalClosing, setIsModalClosing] = useState(false);
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
  const [isScannerClosing, setIsScannerClosing] = useState(false);
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
  const [isPickerClosing, setIsPickerClosing] = useState(false);
  const [hue, setHue] = useState(217);
  const [sat, setSat] = useState(0.8);
  const [val, setVal] = useState(0.96);
  const [pickerHex, setPickerHex] = useState('#3B82F6');
  const [previewSwatchName, setPreviewSwatchName] = useState<string | null>(null);

  const [darkMode, setDarkMode] = useState(true);

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

  const closePickerAnimated = (afterClose?: () => void) => {
    if (!isPickerOpen || isPickerClosing) {
      afterClose?.();
      return;
    }
    setIsPickerClosing(true);
    setTimeout(() => {
      setIsPickerOpen(false);
      setIsPickerClosing(false);
      afterClose?.();
    }, 200);
  };

  const togglePickerAnimated = () => {
    if (isPickerOpen) {
      closePickerAnimated();
    } else {
      setIsPickerClosing(false);
      setIsPickerOpen(true);
      setTimeout(() => {
        customColorPanelRef.current?.scrollIntoView({
          behavior: 'smooth',
          block: 'nearest',
        });
      }, 60);
    }
  };

  const openNotifAnimated = () => {
    setIsNotifClosing(false);
    setIsNotifOpen(true);
  };

  const closeNotifAnimated = () => {
    if (!isNotifOpen || isNotifClosing) return;
    setIsNotifClosing(true);
    setTimeout(() => {
      setIsNotifOpen(false);
      setIsNotifClosing(false);
    }, 200);
  };

  const toggleNotifAnimated = () => {
    if (isNotifOpen) {
      closeNotifAnimated();
    } else {
      openNotifAnimated();
    }
  };

  const openSettingsAnimated = () => {
    setConfirmDeleteAccount(false);
    setIsSettingsClosing(false);
    setIsSettingsOpen(true);
  };

  const closeSettingsAnimated = () => {
    if (!isSettingsOpen || isSettingsClosing) return;
    setIsSettingsClosing(true);
    setTimeout(() => {
      setIsSettingsOpen(false);
      setIsSettingsClosing(false);
      setConfirmDeleteAccount(false);
    }, 200);
  };

  const openScannerAnimated = () => {
    setScanSuccessBanner(null);
    setManualWedgeSku('');
    setIsScannerClosing(false);
    setIsScannerOpen(true);
  };

  const closeScannerAnimated = () => {
    if (!isScannerOpen || isScannerClosing) return;
    setIsScannerClosing(true);
    setTimeout(() => {
      setIsScannerOpen(false);
      setIsScannerClosing(false);
      setScanSuccessBanner(null);
    }, 200);
  };

  const closeModalAnimated = () => {
    if (!isModalOpen || isModalClosing) return;
    setIsModalClosing(true);
    setTimeout(() => {
      setIsPickerOpen(false);
      setIsPickerClosing(false);
      setIsModalOpen(false);
      setIsModalClosing(false);
      setSaveSuccess(false);
      setIsSavingItem(false);
    }, 200);
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
    }, 600);
  };

  const dismissTopLowStockBanner = () => {
    if (topBannerTimeoutRef.current) {
      clearTimeout(topBannerTimeoutRef.current);
      topBannerTimeoutRef.current = null;
    }
    setTopLowStockBanner((prev) => (prev ? { ...prev, closing: true } : null));
    setTimeout(() => {
      setTopLowStockBanner(null);
    }, 220);
  };

  const triggerTopLowStockPop = (entry: AppNotification) => {
    if (!showLowStockPopUpRef.current) return;
    if (topBannerTimeoutRef.current) {
      clearTimeout(topBannerTimeoutRef.current);
    }
    setTopLowStockBanner({ ...entry, closing: false });
    topBannerTimeoutRef.current = setTimeout(() => {
      dismissTopLowStockBanner();
    }, 5500);
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
    const message = `${itemName} (${sku || 'No SKU'}) is at ${stockCount} stock (Min: ${minCount}).`;

    pushNotification('Low Stock Alert', message, 'low_stock');

    if (lowStockChannelRef.current) {
      await lowStockChannelRef.current.send({
        type: 'broadcast',
        event: 'low_stock_alert',
        payload: {
          alertKey,
          title: 'Low Stock Alert',
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
        if (isPickerOpen) closePickerAnimated();
        else if (isModalOpen) closeModalAnimated();
        else if (isScannerOpen) closeScannerAnimated();
        else if (isSettingsOpen) closeSettingsAnimated();
        else if (isNotifOpen) closeNotifAnimated();
        else if (isChartMaximized) setIsChartMaximized(false);
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
    isScannerOpen,
    isSettingsOpen,
    isNotifOpen,
    isChartMaximized,
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
    bg: darkMode ? 'bg-black' : 'bg-white',
    text: darkMode ? 'text-white' : 'text-black',
    textMuted: darkMode ? 'text-zinc-400' : 'text-zinc-500',
    textMuted2: darkMode ? 'text-zinc-500' : 'text-zinc-400',
    border: darkMode ? 'border-zinc-800' : 'border-zinc-300',
    cardBg: darkMode ? 'bg-zinc-950/80' : 'bg-zinc-50',
    cardBg2: darkMode ? 'bg-zinc-950' : 'bg-white',
    cardBg3: darkMode ? 'bg-black/40' : 'bg-zinc-100/60',
    cardBgHover: darkMode ? 'bg-zinc-900/70' : 'bg-zinc-100',
    inputBg: darkMode ? 'bg-black/40' : 'bg-zinc-100',
    optionBg: darkMode ? 'bg-zinc-900 text-white' : 'bg-white text-black',
    btnPrimary: darkMode
      ? 'tpd-click-press bg-white text-black border-zinc-700 hover:bg-zinc-100 hover:-translate-y-0.5 hover:shadow-lg'
      : 'tpd-click-press bg-black text-white border-zinc-400 hover:bg-zinc-800 hover:-translate-y-0.5 hover:shadow-lg',
    btnSecondary: darkMode
      ? 'tpd-click-press bg-zinc-900 text-white border-zinc-700 hover:bg-zinc-800 hover:-translate-y-0.5 hover:shadow-md'
      : 'tpd-click-press bg-zinc-200 text-black border-zinc-300 hover:bg-zinc-300 hover:-translate-y-0.5 hover:shadow-md',
    tabActive: darkMode ? 'tpd-click-press bg-white text-black shadow-sm' : 'tpd-click-press bg-black text-white shadow-sm',
    tabInactive: darkMode
      ? 'tpd-click-press bg-zinc-900 text-zinc-300 hover:bg-zinc-800 hover:text-white'
      : 'tpd-click-press bg-zinc-200 text-zinc-600 hover:bg-zinc-300 hover:text-black',
    lowBg: darkMode ? 'bg-red-600/20 text-red-400 border-red-900/50' : 'bg-red-100 text-red-700 border-red-300',
    okBg: darkMode ? 'bg-emerald-600/20 text-emerald-400' : 'bg-emerald-100 text-emerald-700',
    progressBg: darkMode ? 'bg-zinc-800' : 'bg-zinc-300',
    progressFill: darkMode ? 'bg-white' : 'bg-black',
    chartStroke: darkMode ? '#27272a' : '#d4d4d8',
    chartAxis: darkMode ? '#a1a1aa' : '#52525b',
    overlay: darkMode ? 'bg-black/75 backdrop-blur-xs' : 'bg-white/75 backdrop-blur-xs',
    modalBg: darkMode ? 'bg-zinc-950 border-zinc-800' : 'bg-white border-zinc-300',
    badgeBg: darkMode ? 'border-zinc-700 text-zinc-300' : 'border-zinc-400 text-zinc-600',
    needsRestockBg: darkMode ? 'bg-red-950/40' : 'bg-red-50',
    needsRestockBorder: darkMode ? 'border-red-900/50' : 'border-red-300',
  };

  const iconClass = darkMode ? 'text-zinc-500' : 'text-zinc-400';

  const handleManualAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    setAuthMessage(null);
    setAuthSubmitting(true);

    try {
      if (authMode === 'signup') {
        const { data, error } = await supabase.auth.signUp({ email: authEmail, password: authPassword });
        if (error) throw error;
        if (data.session) setUser(data.session.user);
        else {
          setAuthMessage('Account created! Check your email to confirm your account.');
          setAuthMode('login');
        }
      } else {
        const { data, error } = await supabase.auth.signInWithPassword({ email: authEmail, password: authPassword });
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
            `${(item.category || 'ITEM').toUpperCase()} • SIZE ${item.size || '-'}`,
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
    const container = document.getElementById(`barcode-label-${item.id}`);
    if (!container) return;

    const copies = Math.max(1, Math.min(100, copiesOverride ?? getItemPrintCopies(item.id)));
    const itemSizeLabel = formatBarcodeItemSizeLabel(item.name, item.size);
    const colors = item.colors || [];
    const isFull = labelFormat === 'full';

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
            ? `<div class="top-meta"><span>${escapeHtml(item.category || 'Item')}</span> &bull; <span>Size: ${escapeHtml(
                item.size || '-'
              )}</span></div>`
            : ''
        }
        <div class="item-row">
          <span class="item-mark">${escapeHtml(itemSizeLabel)}</span>
          ${colorCirclesHtml ? `<span class="color-dots">${colorCirclesHtml}</span>` : ''}
        </div>
        <div class="barcode-box">${container.innerHTML}</div>
        ${
          isFull && colors.length > 0
            ? `<div class="color-names">Colors: ${escapeHtml(colors.join(', '))}</div>`
            : ''
        }
      </div>
    `;

    const printWin = window.open('', '_blank', 'width=520,height=420');
    if (!printWin) return;

    printWin.document.write(`
      <html>
        <head>
          <title>THE PRINTING DEPOT - ${escapeHtml(item.sku)} (${copies}x)</title>
          <style>
            body {
              font-family: Arial, sans-serif;
              margin: 0;
              padding: 12px;
              background: #ffffff;
              color: #000000;
            }
            .sheet {
              display: flex;
              flex-wrap: wrap;
              gap: 10px;
              align-items: flex-start;
              justify-content: flex-start;
            }
            .label-card {
              border: 1px solid #d4d4d8;
              border-radius: 8px;
              padding: 8px 10px;
              background: #ffffff;
              display: inline-flex;
              flex-direction: column;
              align-items: center;
              box-sizing: border-box;
              break-inside: avoid;
            }
            .label-compact {
              min-width: 170px;
            }
            .label-full {
              min-width: 230px;
              padding: 10px 12px;
            }
            .top-meta {
              font-size: 10px;
              color: #3f3f46;
              margin-bottom: 4px;
              text-align: center;
            }
            .item-row {
              display: inline-flex;
              align-items: center;
              justify-content: center;
              gap: 6px;
              margin-bottom: 4px;
            }
            .item-mark {
              font-size: 12px;
              font-weight: 800;
              letter-spacing: 0.06em;
              color: #000000;
            }
            .color-dots {
              display: inline-flex;
              align-items: center;
              gap: 4px;
            }
            .color-dot {
              display: inline-block;
              width: 11px;
              height: 11px;
              border-radius: 9999px;
              border: 1px solid #27272a;
            }
            .barcode-box {
              display: flex;
              justify-content: center;
            }
            .color-names {
              margin-top: 4px;
              font-size: 10px;
              color: #27272a;
              text-align: center;
            }
          </style>
        </head>
        <body>
          <div class="sheet">${singleCardHtml.repeat(copies)}</div>
          <script>
            window.onload = function () {
              window.print();
              window.close();
            };
          </script>
        </body>
      </html>
    `);
    printWin.document.close();
  };

  const fetchData = async () => {
    const { data: itemData } = await supabase.from('items').select('*').order('created_at', { ascending: false });
    if (itemData) {
      const mapped = itemData.map((row: any) => ({
        id: String(row.id),
        name: row.name || '',
        sku: row.sku || '',
        category: row.category || '',
        size: row.size || 'M',
        stock: Number(row.stock ?? 0),
        min: Number(row.min ?? 5),
        status: row.status || (Number(row.stock ?? 0) <= Number(row.min ?? 5) ? 'LOW' : 'OK'),
        colors: Array.isArray(row.colors) ? row.colors : [],
      }));
      itemsRef.current = mapped;
      setItems(mapped);
    }

    const { data: catData } = await supabase.from('categories').select('*').order('created_at', { ascending: true });
    if (catData) {
      setCategories(catData.map((row: any) => ({ id: String(row.id), name: row.name })));
    }

    const { data: auditData } = await supabase.from('audit_logs').select('*').order('created_at', { ascending: false });
    if (auditData) {
      const mappedAudit: AuditEntry[] = auditData.map((row: any) => ({
        id: String(row.id),
        action: row.action,
        item: row.item,
        detail: row.detail,
        user: row.user,
        time: row.time,
      }));
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
    fetchData();

    const itemChannel = supabase
      .channel('public:items')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'items' }, (payload: any) => {
        const nextRow = payload?.new;
        if (nextRow) {
          const stockNum = Number(nextRow.stock ?? 0);
          const minNum = Number(nextRow.min ?? 5);
          const isLow = nextRow.status === 'LOW' || stockNum <= minNum;
          if (isLow) {
            const alertKey = `${nextRow.id ?? nextRow.name}::${stockNum}::${minNum}`;
            if (!seenLowStockKeysRef.current.has(alertKey)) {
              seenLowStockKeysRef.current.add(alertKey);
              pushNotification(
                'Low Stock Alert',
                `${nextRow.name || 'Item'} (${nextRow.sku || 'No SKU'}) is at ${stockNum} stock (Min: ${minNum}).`,
                'low_stock'
              );
            }
          }
        }
        fetchData();
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

    const catChannel = supabase.channel('public:categories').on('postgres_changes', { event: '*', schema: 'public', table: 'categories' }, fetchData).subscribe();
    const auditChannel = supabase.channel('public:audit_logs').on('postgres_changes', { event: '*', schema: 'public', table: 'audit_logs' }, fetchData).subscribe();

    return () => {
      lowStockChannelRef.current = null;
      supabase.removeChannel(itemChannel);
      supabase.removeChannel(alertBroadcastChannel);
      supabase.removeChannel(catChannel);
      supabase.removeChannel(auditChannel);
    };
  }, [user]);

  const logAudit = async (action: string, item: string, detail: string) => {
    const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const optimisticEntry: AuditEntry = {
      id: `opt-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      action,
      item,
      detail,
      user: actorName,
      time: timestamp,
    };
    seenAuditIdsRef.current.add(optimisticEntry.id);
    setAuditLog((prev) => [optimisticEntry, ...prev]);

    const { data, error } = await supabase
      .from('audit_logs')
      .insert([
        {
          action,
          item,
          detail,
          user: actorName,
          time: timestamp,
        },
      ])
      .select('id')
      .single();

    if (!error && data?.id) {
      const realId = String(data.id);
      seenAuditIdsRef.current.add(realId);
      setAuditLog((prev) => prev.map((entry) => (entry.id === optimisticEntry.id ? { ...entry, id: realId } : entry)));
    }
  };

  const deleteAuditLog = async (auditId: string) => {
    const prevLog = auditLog;
    setAuditLog((prev) => prev.filter((entry) => entry.id !== auditId));
    setSelectedAuditIds((prev) => {
      const next = new Set(prev);
      next.delete(auditId);
      return next;
    });
    const { error } = await supabase.from('audit_logs').delete().eq('id', auditId);
    if (error) {
      setAuditLog(prevLog);
      alert('Error deleting audit log: ' + error.message);
    }
  };

  const toggleAuditSelection = (auditId: string) => {
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

    const dbIds = idsToDelete.filter((id) => !id.startsWith('opt-'));
    if (dbIds.length > 0) {
      const { error } = await supabase.from('audit_logs').delete().in('id', dbIds);
      if (error) {
        setAuditLog(prevLog);
        alert('Error deleting selected audit logs: ' + error.message);
      }
    }
    setIsClearingAudit(false);
  };

  const clearAllAuditLogs = async () => {
    if (auditLog.length === 0 || isClearingAudit) return;
    setIsClearingAudit(true);
    const prevLog = auditLog;

    setAuditLog([]);
    setSelectedAuditIds(new Set());
    setAuditSelectMode(false);
    setConfirmClearAllAudit(false);

    const { error } = await supabase.from('audit_logs').delete().not('id', 'is', null);
    if (error) {
      setAuditLog(prevLog);
      alert('Error clearing audit logs: ' + error.message);
    }
    setIsClearingAudit(false);
  };

  const adjustStock = async (itemId: string, delta: number, source: 'button' | 'scan' = 'button') => {
    if (!delta) return;
    const currentItems = itemsRef.current.length > 0 ? itemsRef.current : items;
    const item = currentItems.find((entry) => entry.id === itemId);
    if (!item) return;

    const nextStock = Math.max(0, item.stock + delta);
    const actualDelta = nextStock - item.stock;
    const nextStatus = nextStock <= item.min ? 'LOW' : 'OK';

    const updatedList = currentItems.map((entry) =>
      entry.id === itemId ? { ...entry, stock: nextStock, status: nextStatus as 'LOW' | 'OK' } : entry
    );
    itemsRef.current = updatedList;
    setItems(updatedList);
    triggerStockPulse(itemId);

    void supabase.from('items').update({ stock: nextStock, status: nextStatus }).eq('id', itemId).then(({ error }) => {
      if (error) {
        void fetchData();
      }
    });

    void logAudit(
      actualDelta >= 0 ? 'ADD STOCK' : 'REMOVE STOCK',
      item.name,
      `${actualDelta >= 0 ? '+' : ''}${actualDelta} units (Now: ${nextStock}) by ${actorName}`
    );

    if (nextStatus === 'LOW') {
      seenLowStockKeysRef.current.add(`${item.id}::${nextStock}::${item.min}`);
      void notifyAllUsersLowStock(item.name, item.sku, nextStock, item.min);
    } else if (source === 'scan') {
      pushNotification(
        actualDelta >= 0 ? 'Scan Added Stock' : 'Scan Deducted Stock',
        `${item.name}: ${actualDelta >= 0 ? `+${actualDelta}` : actualDelta} unit(s) • Now ${nextStock} in stock.`,
        'scan'
      );
    }

    return { item, nextStock, actualDelta };
  };

  const processScannedCode = async (
    rawCode: string,
    stopCameraFn?: () => Promise<void>,
    allowCloseModal = true
  ) => {
    const cleaned = rawCode.trim();
    if (!cleaned) return;

    setScannerError(null);
    setScanFeedback(null);
    setQuery(cleaned);
    setStatusFilter('ALL');
    setCategoryFilter('ALL');
    setActiveTab('inventory');

    const currentMode = scanModeRef.current;
    const keepOpen = continuousScanRef.current;
    const playChime = scanSoundEnabledRef.current;
    const unlockDelay = keepOpen ? 500 : 850;

    if (currentMode === 'search') {
      const match = itemsRef.current.find(
        (entry) => entry.sku.trim().toLowerCase() === cleaned.toLowerCase()
      );
      if (playChime) playScanFeedbackChime(true, keepOpen);
      const summary = match ? `${match.name} (${match.stock} in stock)` : `Filter: "${cleaned}"`;
      setLastScannedSummary(summary);
      setScanSuccessBanner(`Scanned "${cleaned}" — ${summary}`);
      pushNotification('Barcode Scanned', `Filtered inventory by "${cleaned}".`, 'scan');

      if (!keepOpen) {
        if (stopCameraFn) await stopCameraFn();
        if (allowCloseModal) {
          setTimeout(() => closeScannerAnimated(), unlockDelay);
        }
      } else {
        setTimeout(() => {
          scanLockedRef.current = false;
        }, unlockDelay);
      }
      return;
    }

    const matchedItem = itemsRef.current.find(
      (entry) => entry.sku.trim().toLowerCase() === cleaned.toLowerCase()
    );

    if (!matchedItem) {
      if (playChime) playScanFeedbackChime(false, false);
      setScanFeedback(`No item found with SKU "${cleaned}". Search filter applied.`);
      pushNotification('SKU Not Found', `No exact SKU match for "${cleaned}".`, 'low_stock');

      if (!keepOpen) {
        if (stopCameraFn) await stopCameraFn();
        if (allowCloseModal) {
          setTimeout(() => closeScannerAnimated(), 1100);
        }
      } else {
        setTimeout(() => {
          scanLockedRef.current = false;
        }, 1100);
      }
      return;
    }

    const qty = Math.max(1, Number(scanQuantityRef.current) || 1);
    const delta = currentMode === 'add' ? qty : -qty;
    const result = await adjustStock(matchedItem.id, delta, 'scan');
    const resultingStock = result?.nextStock ?? Math.max(0, matchedItem.stock + delta);
    const actualDelta = result?.actualDelta ?? delta;

    if (playChime) playScanFeedbackChime(true, keepOpen);
    const label = `${matchedItem.name} (${actualDelta >= 0 ? `+${actualDelta}` : actualDelta} → ${resultingStock})`;
    setLastScannedSummary(label);
    setScanSuccessBanner(`Scanned ${label}`);

    if (!keepOpen) {
      if (stopCameraFn) await stopCameraFn();
      if (allowCloseModal) {
        setTimeout(() => closeScannerAnimated(), unlockDelay);
      }
    } else {
      setTimeout(() => {
        scanLockedRef.current = false;
      }, unlockDelay);
    }
  };

  useEffect(() => {
    let active = true;

    const stopScanner = async () => {
      const instance = scannerInstanceRef.current;
      if (instance && scannerRunningRef.current) {
        scannerRunningRef.current = false;
        try {
          await instance.stop();
        } catch {
          // Ignore stop errors if already stopped
        }
        try {
          instance.clear();
        } catch {
          // Ignore clear errors
        }
      }
    };

    const startScanner = async () => {
      if (!isScannerOpen || isScannerClosing) {
        await stopScanner();
        return;
      }

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
            formatsToSupport: [Html5QrcodeSupportedFormats.CODE_128],
            verbose: false,
          });
        scannerInstanceRef.current = scanner;

        await scanner.start(
          {
            facingMode: { ideal: 'environment' },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
          {
            fps: 18,
            aspectRatio: 1.777,
            qrbox: (viewfinderWidth: number, viewfinderHeight: number) => {
              const width = Math.min(340, Math.max(220, Math.floor(viewfinderWidth * 0.85)));
              const height = Math.min(130, Math.max(85, Math.floor(viewfinderHeight * 0.42)));
              return { width, height };
            },
          },
          async (decodedText: string) => {
            if (!active || scanLockedRef.current) return;
            const cleaned = decodedText.trim();
            if (!cleaned) return;

            scanLockedRef.current = true;
            await processScannedCode(cleaned, stopScanner, true);
          },
          () => {
            // Frame scan miss; continue scanning
          }
        );

        scannerRunningRef.current = true;
      } catch {
        if (active) {
          setScannerError('Camera access failed. You can still type or scan with a USB/Bluetooth scanner below.');
        }
      }
    };

    startScanner();

    return () => {
      active = false;
      stopScanner();
    };
  }, [isScannerOpen, isScannerClosing]);

  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      const matchesQuery = `${item.name} ${item.sku} ${(item.colors || []).join(' ')}`.toLowerCase().includes(query.toLowerCase());
      const matchesStatus = statusFilter === 'ALL' || item.status === statusFilter;
      const matchesCategory = categoryFilter === 'ALL' || item.category === categoryFilter;
      return matchesQuery && matchesStatus && matchesCategory;
    });
  }, [items, query, statusFilter, categoryFilter]);

  const hasActiveFilters = query.trim() !== '' || statusFilter !== 'ALL' || categoryFilter !== 'ALL';

  const resetFilters = () => {
    setQuery('');
    setStatusFilter('ALL');
    setCategoryFilter('ALL');
  };

  const chartData = useMemo(() => {
    const categoryTotals: Record<string, number> = {};
    items.forEach((item) => {
      categoryTotals[item.category] = (categoryTotals[item.category] || 0) + item.stock;
    });
    return Object.keys(categoryTotals).map((cat) => ({ category: cat, stock: categoryTotals[cat] }));
  }, [items]);

  const totalValue = items.reduce((sum, item) => sum + item.stock * UNIT_ESTIMATED_PRICE, 0);
  const lowStockItems = useMemo(() => items.filter((item) => item.status === 'LOW'), [items]);
  const lowStockCount = lowStockItems.length;

  const copyRestockOrder = async () => {
    if (lowStockItems.length === 0) return;
    const lines = lowStockItems.map((item) => {
      const colorPart = item.colors.length ? ` [${item.colors.join(', ')}]` : '';
      return `- ${item.name} (${item.sku || 'No SKU'}) • Size: ${item.size}${colorPart} • Stock: ${item.stock}/${item.min} → Needed Stock`;
    });
    const text = `THE PRINTING DEPOT — RESTOCK LIST\n${lines.join('\n')}`;
    try {
      await navigator.clipboard.writeText(text);
      setCopiedRestockList(true);
      pushNotification('Restock List Copied', `${lowStockItems.length} low-stock item(s) copied to clipboard.`, 'info');
      setTimeout(() => setCopiedRestockList(false), 1800);
    } catch {
      alert(text);
    }
  };

  const openCreateModal = () => {
    setEditingId(null);
    setForm({ name: '', sku: '', category: categories[0]?.name || 'Shirts', size: 'M', stock: '0', min: '5', colors: [] });
    setPreviewSwatchName(null);
    setSaveSuccess(false);
    setIsSavingItem(false);
    setIsPickerOpen(false);
    setIsPickerClosing(false);
    setIsModalClosing(false);
    setIsModalOpen(true);
  };

  const openDuplicateModal = (item: InventoryItem) => {
    setEditingId(null);
    setForm({
      name: item.name,
      sku: buildSkuForCategory(item.category),
      category: item.category || categories[0]?.name || 'Shirts',
      size: item.size || 'M',
      stock: '0',
      min: String(item.min ?? 5),
      colors: item.colors ? [...item.colors] : [],
    });
    setPreviewSwatchName(null);
    setSaveSuccess(false);
    setIsSavingItem(false);
    setIsPickerOpen(false);
    setIsPickerClosing(false);
    setIsModalClosing(false);
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
    setIsPickerClosing(false);
    setIsModalClosing(false);
    setIsModalOpen(true);
  };

  const submitItem = () => {
    if (isSavingItem || saveSuccess) return;
    setIsSavingItem(true);

    const stockVal = Number(form.stock) || 0;
    const minVal = Number(form.min) || 0;
    const calculatedStatus: 'LOW' | 'OK' = stockVal <= minVal ? 'LOW' : 'OK';

    const payload = {
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
      const updatedList = previousItems.map((entry) =>
        entry.id === editingId ? { ...entry, ...payload } : entry
      );
      itemsRef.current = updatedList;
      setItems(updatedList);
      triggerStockPulse(editingId);

      setIsSavingItem(false);
      setSaveSuccess(true);
      setTimeout(() => {
        closeModalAnimated();
      }, 280);

      void supabase.from('items').update(payload).eq('id', editingId).then(({ error }) => {
        if (error) {
          itemsRef.current = previousItems;
          setItems(previousItems);
          alert('Error updating: ' + error.message);
          return;
        }
        void logAudit('EDIT ITEM', form.name, `Edited item details by ${actorName}`);
        if (calculatedStatus === 'LOW') {
          seenLowStockKeysRef.current.add(`${editingId}::${stockVal}::${minVal}`);
          void notifyAllUsersLowStock(form.name, form.sku, stockVal, minVal);
        }
      });
    } else {
      const tempId = `temp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      const optimisticItem: InventoryItem = { id: tempId, ...payload };
      const updatedList = [optimisticItem, ...previousItems];
      itemsRef.current = updatedList;
      setItems(updatedList);

      setIsSavingItem(false);
      setSaveSuccess(true);
      setTimeout(() => {
        closeModalAnimated();
      }, 280);

      void supabase
        .from('items')
        .insert([payload])
        .select('id')
        .single()
        .then(({ data, error }) => {
          if (error) {
            itemsRef.current = previousItems;
            setItems(previousItems);
            alert('Error creating: ' + error.message);
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
          void logAudit('NEW ITEM', form.name, `Created new item by ${actorName}`);
          if (calculatedStatus === 'LOW') {
            seenLowStockKeysRef.current.add(`${form.name}::${stockVal}::${minVal}`);
            void notifyAllUsersLowStock(form.name, form.sku, stockVal, minVal);
          }
        });
    }
  };

  const deleteItem = (itemId: string) => {
    const previousItems = itemsRef.current;
    const item = previousItems.find((entry) => entry.id === itemId);
    const filtered = previousItems.filter((entry) => entry.id !== itemId);
    itemsRef.current = filtered;
    setItems(filtered);

    void supabase.from('items').delete().eq('id', itemId).then(({ error }) => {
      if (error) {
        itemsRef.current = previousItems;
        setItems(previousItems);
        return;
      }
      if (item) {
        void logAudit('REMOVE ITEM', item.name, `Removed item by ${actorName}`);
      }
    });
  };

  const addCategory = () => {
    const cleanName = newCategory.trim();
    if (!cleanName || isAddingCategory || categoryAddSuccess) return;

    if (categories.some((cat) => cat.name.toLowerCase() === cleanName.toLowerCase())) {
      alert('This category already exists.');
      return;
    }

    const tempId = `temp-cat-${Date.now()}`;
    const prevCategories = categories;
    setCategories((prev) => [...prev, { id: tempId, name: cleanName }]);
    setNewCategory('');
    setIsAddingCategory(false);
    setCategoryAddSuccess(true);
    setTimeout(() => {
      setCategoryAddSuccess(false);
    }, 500);

    void supabase
      .from('categories')
      .insert([{ name: cleanName }])
      .select('id')
      .single()
      .then(({ data, error }) => {
        if (error) {
          setCategories(prevCategories);
          alert('Error adding category: ' + error.message);
          return;
        }
        if (data?.id) {
          setCategories((prev) =>
            prev.map((cat) => (cat.id === tempId ? { ...cat, id: String(data.id) } : cat))
          );
        }
        void logAudit('ADD CATEGORY', cleanName, `Added category by ${actorName}`);
      });
  };

  const deleteCategory = (categoryId: string, categoryName: string) => {
    const hasItems = itemsRef.current.some((item) => item.category === categoryName);
    if (hasItems) {
      alert(`Cannot remove "${categoryName}" while inventory items are assigned to it.`);
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
        alert('Error deleting category: ' + error.message);
        return;
      }
      void logAudit('REMOVE CATEGORY', categoryName, `Removed category by ${actorName}`);
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

  if (authLoading) {
    return (
      <main className={`flex min-h-screen items-center justify-center ${t.bg} ${t.text}`}>
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin motion-reduce:animate-none rounded-full border-2 border-zinc-600 border-t-white" />
          <p className={`text-sm ${t.textMuted}`}>Loading The Printing Depot...</p>
        </div>
      </main>
    );
  }

  if (!user) {
    return (
      <main className={`flex min-h-screen items-center justify-center px-4 py-10 ${t.bg} ${t.text} overflow-x-hidden`}>
        <div className={`tpd-modal-enter w-full max-w-md rounded-3xl border ${t.border} ${t.cardBg2} p-6 sm:p-8 shadow-2xl transition-all duration-300 ease-out motion-reduce:transition-none`}>
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
              className={`tpd-click-press shrink-0 rounded-2xl border ${t.border} ${t.cardBg} p-2.5 transition-all duration-300 ease-out motion-reduce:transition-none hover:scale-105`}
            >
              {darkMode ? <Sun size={18} className="text-yellow-300 transition-transform duration-500 ease-out motion-reduce:transition-none hover:rotate-45" /> : <Moon size={18} className="text-zinc-700 transition-transform duration-500 ease-out motion-reduce:transition-none hover:-rotate-12" />}
            </button>
          </div>

          <button
            type="button"
            onClick={handleGoogleLogin}
            className={`mt-6 flex w-full items-center justify-center gap-3 rounded-2xl border ${t.btnSecondary} px-4 py-3 text-sm font-semibold transition-all duration-300 ease-out motion-reduce:transition-none`}
          >
            Continue with Google
          </button>

          <div className="my-5 flex items-center gap-3">
            <div className={`h-px flex-1 border-t ${t.border}`} />
            <span className={`text-xs uppercase ${t.textMuted2}`}>or with email</span>
            <div className={`h-px flex-1 border-t ${t.border}`} />
          </div>

          {authError && <div className="tpd-pop-enter mb-4 rounded-2xl border border-red-900/50 bg-red-950/40 px-4 py-3 text-xs text-red-300">{authError}</div>}
          {authMessage && <div className="tpd-pop-enter mb-4 rounded-2xl border border-emerald-900/50 bg-emerald-950/40 px-4 py-3 text-xs text-emerald-300">{authMessage}</div>}

          <form onSubmit={handleManualAuth} className="space-y-4">
            <div>
              <label className={`mb-1.5 block text-xs font-medium ${t.textMuted}`}>Email Address</label>
              <div className={`flex items-center gap-2.5 rounded-2xl border ${t.border} ${t.inputBg} px-3.5 py-2.5 transition-colors duration-300 ease-out focus-within:border-zinc-500`}>
                <Mail size={16} className={iconClass} />
                <input type="email" required value={authEmail} onChange={(e) => setAuthEmail(e.target.value)} placeholder="name@printingdepot.ph" className={`w-full bg-transparent text-base sm:text-sm outline-none ${t.text}`} />
              </div>
            </div>

            <div>
              <label className={`mb-1.5 block text-xs font-medium ${t.textMuted}`}>Password</label>
              <div className={`flex items-center gap-2.5 rounded-2xl border ${t.border} ${t.inputBg} px-3.5 py-2.5 transition-colors duration-300 ease-out focus-within:border-zinc-500`}>
                <Lock size={16} className={iconClass} />
                <input type="password" required minLength={6} value={authPassword} onChange={(e) => setAuthPassword(e.target.value)} placeholder="••••••••" className={`w-full bg-transparent text-base sm:text-sm outline-none ${t.text}`} />
              </div>
            </div>

            <button type="submit" disabled={authSubmitting} className={`w-full rounded-2xl border ${t.btnPrimary} px-4 py-3 text-sm font-semibold transition-all duration-300 ease-out motion-reduce:transition-none disabled:opacity-50`}>
              {authSubmitting ? 'Please wait...' : authMode === 'login' ? 'Log In' : 'Create Account'}
            </button>
          </form>

          <div className="mt-6 text-center text-sm">
            {authMode === 'login' ? (
              <p className={t.textMuted}>
                Don&apos;t have an account?{' '}
                <button type="button" onClick={() => setAuthMode('signup')} className="tpd-click-press font-semibold underline underline-offset-4 transition-opacity duration-200 hover:opacity-80">Create account</button>
              </p>
            ) : (
              <p className={t.textMuted}>
                Already have an account?{' '}
                <button type="button" onClick={() => setAuthMode('login')} className="tpd-click-press font-semibold underline underline-offset-4 transition-opacity duration-200 hover:opacity-80">Log in</button>
              </p>
            )}
          </div>
        </div>

        <style jsx>{`
          .tpd-click-press {
            transition: transform 200ms cubic-bezier(0.22, 1, 0.36, 1), background-color 180ms ease, box-shadow 180ms ease, border-color 180ms ease, opacity 160ms ease;
          }
          .tpd-click-press:active {
            transform: scale(0.94);
            transition-duration: 110ms;
          }
          .tpd-modal-enter {
            animation: tpdModalIn 260ms cubic-bezier(0.22, 1, 0.36, 1) both;
          }
          .tpd-pop-enter {
            animation: tpdPopIn 220ms cubic-bezier(0.22, 1, 0.36, 1) both;
          }
          .tpd-logo-mark {
            animation: tpdLogoFloat 3.6s ease-in-out infinite;
          }
          @keyframes tpdModalIn {
            from {
              opacity: 0;
              transform: translateY(12px) scale(0.97);
            }
            to {
              opacity: 1;
              transform: translateY(0) scale(1);
            }
          }
          @keyframes tpdPopIn {
            from {
              opacity: 0;
              transform: translateY(-6px) scale(0.97);
            }
            to {
              opacity: 1;
              transform: translateY(0) scale(1);
            }
          }
          @keyframes tpdLogoFloat {
            0%, 100% {
              transform: translateY(0);
            }
            50% {
              transform: translateY(-2px);
            }
          }
          @media (prefers-reduced-motion: reduce) {
            .tpd-click-press,
            .tpd-click-press:active,
            .tpd-modal-enter,
            .tpd-pop-enter,
            .tpd-logo-mark {
              animation: none !important;
              transform: none !important;
            }
          }
        `}</style>
      </main>
    );
  }

  const allSelectableColors = Array.from(new Set([...colorOptions, ...form.colors]));
  const currentHueHex = hsvToHex(hue, 1, 1);
  const currentMatchedName = hexToColorName(pickerHex);

  const statusOptions: CascadeSelectOption[] = [
    { value: 'ALL', label: 'All status' },
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

  return (
    <main className={`min-h-screen ${t.bg} ${t.text} transition-colors duration-200 motion-reduce:transition-none overflow-x-hidden`}>
      {/* Messenger-style Top Pop-Up Notification for Low Stock */}
      {topLowStockBanner && showLowStockPopUp && (
        <div className="fixed top-4 left-1/2 z-50 w-full max-w-md -translate-x-1/2 px-3 pointer-events-none">
          <div
            className={`${
              topLowStockBanner.closing ? 'tpd-msg-top-exit' : 'tpd-msg-top-enter'
            } pointer-events-auto flex items-center justify-between gap-3 rounded-full border border-red-500/50 ${t.cardBg2} px-4 py-2.5 shadow-2xl backdrop-blur-md`}
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-red-500/20 text-red-400">
                <AlertTriangle size={18} />
                <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-zinc-950 bg-red-500" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] font-extrabold uppercase tracking-wider text-red-400">
                    Low Stock Alert
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
              aria-label="Dismiss low stock alert"
              className={`tpd-click-press rounded-full p-1.5 ${t.textMuted} hover:bg-zinc-800 hover:text-white shrink-0`}
            >
              <X size={14} />
            </button>
          </div>
        </div>
      )}

      <div className="mx-auto flex max-w-7xl flex-col gap-6 px-3 sm:px-6 lg:px-8 py-4 sm:py-6">
        <header className={`relative flex flex-col gap-4 rounded-3xl border ${t.border} ${t.cardBg} p-4 sm:p-5 shadow-2xl transition-colors duration-200 motion-reduce:transition-none lg:flex-row lg:items-center lg:justify-between`}>
          <div className="flex items-center justify-between lg:justify-start lg:gap-4">
            <div className="flex items-center gap-3 min-w-0 flex-1">
              <PrintingDepotLogo darkMode={darkMode} size="sm" />
              <div className="min-w-0 flex-1">
                <p className={`text-[10px] sm:text-xs uppercase tracking-[0.3em] ${t.textMuted}`}>INVENTORY MANAGEMENT SYSTEM</p>
                <h1 className="mt-0.5 text-lg sm:text-2xl font-black tracking-tight lg:text-3xl truncate">THE PRINTING DEPOT</h1>
                <p className={`mt-0.5 text-xs ${t.textMuted} truncate`}>Signed in as <span className="font-semibold">{actorName}</span></p>
              </div>
            </div>
            <div className="flex items-center gap-2 lg:hidden shrink-0">
              <button
                type="button"
                onClick={toggleNotifAnimated}
                aria-label="Notifications"
                className={`tpd-click-press relative rounded-2xl border ${t.border} ${t.cardBg2} p-2.5 transition-all duration-200 ease-out motion-reduce:transition-none hover:scale-105`}
              >
                <Bell size={18} />
                {unreadCount > 0 && (
                  <span className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white tabular-nums">
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                )}
              </button>
              <button
                type="button"
                onClick={openSettingsAnimated}
                aria-label="Settings"
                className={`tpd-click-press rounded-2xl border ${t.border} ${t.cardBg2} p-2.5 transition-all duration-200 ease-out motion-reduce:transition-none hover:scale-105`}
              >
                <Settings size={18} />
              </button>
              <button onClick={() => setDarkMode(!darkMode)} className={`tpd-click-press rounded-2xl border ${t.border} ${t.cardBg2} p-2.5 transition-all duration-200 ease-out motion-reduce:transition-none hover:scale-105`}>
                {darkMode ? <Sun size={18} className="text-yellow-300 transition-transform duration-300 ease-out motion-reduce:transition-none hover:rotate-45" /> : <Moon size={18} className="text-zinc-700 transition-transform duration-300 ease-out motion-reduce:transition-none hover:-rotate-12" />}
              </button>
              <button
                type="button"
                onClick={handleLogout}
                title="Sign Out"
                aria-label="Sign Out"
                className={`tpd-click-press rounded-2xl border ${t.border} ${t.cardBg2} p-2.5 text-red-400 transition-all duration-200 ease-out motion-reduce:transition-none hover:scale-105 hover:border-red-500/50`}
              >
                <LogOut size={18} />
              </button>
            </div>
          </div>

          <div
            ref={headerActionsRef}
            className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center sm:gap-3"
          >
            <button
              type="button"
              onClick={toggleNotifAnimated}
              aria-label="Notifications"
              title="Notifications"
              className={`tpd-click-press relative hidden lg:flex rounded-2xl border ${t.border} ${t.cardBg2} p-2.5 transition-all duration-200 ease-out motion-reduce:transition-none hover:scale-105`}
            >
              <Bell size={18} />
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white tabular-nums">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </button>
            <button
              type="button"
              onClick={openSettingsAnimated}
              aria-label="Settings"
              title="Settings"
              className={`group hidden lg:flex rounded-2xl border ${t.border} ${t.cardBg2} p-2.5 transition-all duration-200 ease-out motion-reduce:transition-none hover:scale-105`}
            >
              <Settings size={18} className="transition-transform duration-300 ease-out motion-reduce:transition-none group-hover:rotate-45" />
            </button>
            <button
              type="button"
              onClick={() => setDarkMode(!darkMode)}
              title={darkMode ? 'Light Mode' : 'Dark Mode'}
              aria-label={darkMode ? 'Light Mode' : 'Dark Mode'}
              className={`tpd-click-press hidden rounded-2xl border ${t.border} ${t.cardBg2} p-2.5 transition-all duration-200 ease-out motion-reduce:transition-none hover:scale-105 lg:block`}
            >
              {darkMode ? <Sun size={18} className="text-yellow-300 transition-transform duration-300 ease-out motion-reduce:transition-none hover:rotate-45" /> : <Moon size={18} className="text-zinc-700 transition-transform duration-300 ease-out motion-reduce:transition-none hover:-rotate-12" />}
            </button>
            <button
              type="button"
              onClick={openScannerAnimated}
              title="Scan Barcode"
              aria-label="Scan Barcode"
              className={`group rounded-2xl border ${t.btnSecondary} px-3.5 py-3 sm:py-2.5 text-xs sm:text-sm font-semibold transition-all duration-200 ease-out motion-reduce:transition-none flex items-center justify-center gap-2`}
            >
              <BarcodeScanIcon className="h-4 w-4 transition-transform duration-200 ease-out motion-reduce:transition-none group-hover:scale-110" />
              <span>Scan</span>
            </button>
            <button onClick={openCreateModal} className={`group rounded-2xl border ${t.btnPrimary} px-4 py-3 sm:py-2.5 text-sm font-semibold transition-all duration-200 ease-out motion-reduce:transition-none flex items-center justify-center gap-2`}>
              <Plus size={16} className="transition-transform duration-200 ease-out motion-reduce:transition-none group-hover:rotate-90" /> New Item
            </button>
            <button onClick={() => exportInventory('csv')} className={`group rounded-2xl border ${t.btnSecondary} px-3 sm:px-4 py-3 sm:py-2.5 text-xs sm:text-sm font-semibold transition-all duration-200 ease-out motion-reduce:transition-none flex items-center justify-center gap-1.5 sm:gap-2`}>
              <Download size={15} className="transition-transform duration-200 ease-out motion-reduce:transition-none group-hover:translate-y-0.5" /> Export CSV
            </button>
            <button
              type="button"
              onClick={handleLogout}
              title="Sign Out"
              aria-label="Sign Out"
              className={`group hidden lg:flex rounded-2xl border ${t.btnSecondary} ${
                isActionsCramped ? 'p-2.5' : 'px-4 py-2.5'
              } text-sm font-semibold text-red-400 transition-all duration-200 ease-out motion-reduce:transition-none items-center justify-center gap-2`}
            >
              <LogOut size={16} className="shrink-0 transition-transform duration-200 ease-out motion-reduce:transition-none group-hover:translate-x-0.5" />
              {!isActionsCramped && <span>Sign Out</span>}
            </button>
          </div>

          {/* Notification Inbox Popover */}
          {isNotifOpen && (
            <div className={`${isNotifClosing ? 'tpd-pop-exit' : 'tpd-pop-enter'} absolute right-3 top-full mt-2 z-40 w-full max-w-sm rounded-3xl border ${t.border} ${t.cardBg2} p-4 shadow-2xl transition-all duration-200 ease-out motion-reduce:transition-none`}>
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
                        className={`tpd-click-press inline-flex items-center gap-1 rounded-xl border ${t.border} ${t.inputBg} px-2 py-1 text-[11px] font-medium ${t.textMuted} hover:text-white`}
                      >
                        <CheckCheck size={12} />
                        <span>Read</span>
                      </button>
                      <button
                        type="button"
                        onClick={clearNotifications}
                        title="Clear notifications"
                        className={`tpd-click-press rounded-xl border ${t.border} ${t.inputBg} px-2 py-1 text-[11px] font-medium text-red-400 hover:bg-red-950/50`}
                      >
                        Clear
                      </button>
                    </>
                  )}
                  <button
                    type="button"
                    onClick={closeNotifAnimated}
                    className={`tpd-click-press rounded-xl border ${t.border} ${t.inputBg} p-1 ${t.textMuted}`}
                  >
                    <X size={13} />
                  </button>
                </div>
              </div>

              <div className="mt-3 max-h-72 space-y-2 overflow-y-auto pr-1">
                {notifications.length === 0 ? (
                  <p className={`py-6 text-center text-xs ${t.textMuted}`}>
                    No notifications yet. Low stock, scans, and staff updates will appear here.
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
                      className={`tpd-click-press cursor-pointer rounded-2xl border p-3 transition-colors duration-150 ${
                        entry.type === 'low_stock' ? t.needsRestockBorder : t.border
                      } ${!entry.read ? t.cardBgHover : t.cardBg3}`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-xs font-bold truncate">
                          {!entry.read && <span className="mr-1.5 inline-block h-2 w-2 rounded-full bg-emerald-400" />}
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

        <section className="grid grid-cols-2 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[
            { label: 'Total Items', value: items.length, icon: Package2 },
            { label: 'Inventory Value', value: `₱${totalValue.toLocaleString()}`, icon: TrendingUp },
            { label: 'Low Stock', value: lowStockCount, icon: Box },
            { label: 'Categories', value: categories.length, icon: Warehouse },
          ].map((card) => (
            <div key={card.label} className={`group rounded-3xl border ${t.border} ${t.cardBg2} p-4 sm:p-5 transition-all duration-200 ease-out motion-reduce:transition-none hover:-translate-y-0.5 hover:shadow-xl`}>
              <div className="flex items-center justify-between">
                <p className={`text-xs sm:text-sm ${t.textMuted}`}>{card.label}</p>
                <card.icon className={`h-4 w-4 sm:h-5 sm:w-5 ${iconClass} transition-transform duration-200 ease-out motion-reduce:transition-none group-hover:scale-110`} />
              </div>
              <p className="mt-3 sm:mt-4 text-xl sm:text-3xl font-black tabular-nums truncate">{card.value}</p>
            </div>
          ))}
        </section>

        {/* Stock by category & Recent audit activity */}
        <section
          className={
            isChartMaximized || isAuditMaximized
              ? 'grid gap-6 grid-cols-1'
              : 'grid gap-6 xl:grid-cols-[1.15fr_0.85fr]'
          }
        >
          {!isAuditMaximized && (
            <div
              className={`${
                isChartMaximized
                  ? 'fixed inset-4 z-40 overflow-y-auto shadow-2xl'
                  : 'overflow-hidden'
              } rounded-3xl border ${t.border} ${t.cardBg2} p-4 sm:p-5 transition-all duration-200 ease-out motion-reduce:transition-none hover:shadow-xl`}
            >
              <div className={`flex items-center justify-between gap-2 ${isSectionMinimized ? '' : 'mb-4'}`}>
                <div>
                  <h2 className="text-lg sm:text-xl font-bold">Stock by category</h2>
                  <p className={`text-xs sm:text-sm ${t.textMuted}`}>Visual snapshot of inventory depth</p>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => {
                      if (isChartMaximized) {
                        setIsChartMaximized(false);
                        setIsSectionMinimized(false);
                      } else {
                        setIsSectionMinimized((prev) => !prev);
                      }
                    }}
                    title={isSectionMinimized ? 'Restore both sections' : 'Minimize both sections'}
                    aria-label={isSectionMinimized ? 'Restore both sections' : 'Minimize both sections'}
                    className={`tpd-click-press rounded-xl border ${t.border} ${t.cardBg3} p-2 ${t.textMuted} hover:text-white shrink-0`}
                  >
                    <Minimize2 size={14} />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setIsSectionMinimized(false);
                      setIsChartMaximized((prev) => !prev);
                    }}
                    title={isChartMaximized ? 'Exit fullscreen Stock by category' : 'Maximize Stock by category'}
                    aria-label={isChartMaximized ? 'Exit fullscreen Stock by category' : 'Maximize Stock by category'}
                    className={`tpd-click-press rounded-xl border ${t.border} ${t.cardBg3} p-2 ${t.textMuted} hover:text-white shrink-0`}
                  >
                    <Maximize2 size={14} />
                  </button>
                </div>
              </div>

              {!isSectionMinimized && (
                <div className={`${isChartMaximized ? 'h-[65vh]' : 'h-64 sm:h-72'} w-full min-w-0`}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData} margin={{ top: 10, right: 10, left: -25, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke={t.chartStroke} vertical={false} />
                      <XAxis dataKey="category" stroke={t.chartAxis} fontSize={11} tickLine={false} />
                      <YAxis stroke={t.chartAxis} fontSize={11} tickLine={false} />
                      <Tooltip
                        contentStyle={{ backgroundColor: darkMode ? '#18181b' : '#ffffff', border: `1px solid ${darkMode ? '#27272a' : '#d4d4d8'}`, color: darkMode ? '#ffffff' : '#000000', borderRadius: '12px' }}
                      />
                      <Bar dataKey="stock" fill={darkMode ? '#ffffff' : '#000000'} radius={[8, 8, 0, 0]} maxBarSize={48} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
          )}

          {!isChartMaximized && (
            <div
              className={`${
                isAuditMaximized
                  ? 'fixed inset-4 z-40 overflow-y-auto shadow-2xl'
                  : ''
              } rounded-3xl border ${t.border} ${t.cardBg2} p-4 sm:p-5 transition-all duration-200 ease-out motion-reduce:transition-none hover:shadow-xl`}
            >
              <div className={`flex items-center justify-between gap-2 ${isSectionMinimized ? '' : 'mb-4'}`}>
                <div>
                  <h2 className="text-lg sm:text-xl font-bold">Recent audit activity</h2>
                  <p className={`text-xs sm:text-sm ${t.textMuted}`}>Latest inventory events</p>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <div className={`rounded-full border ${t.border} px-3 py-1 text-xs sm:text-sm tabular-nums ${t.textMuted}`}>{auditLog.length} updates</div>
                  <button
                    type="button"
                    onClick={() => {
                      setIsSectionMinimized(false);
                      setIsAuditMaximized((prev) => !prev);
                    }}
                    title={isAuditMaximized ? 'Exit fullscreen Recent audit activity' : 'Maximize Recent audit activity'}
                    aria-label={isAuditMaximized ? 'Exit fullscreen Recent audit activity' : 'Maximize Recent audit activity'}
                    className={`tpd-click-press rounded-xl border ${t.border} ${t.cardBg3} p-2 ${t.textMuted} hover:text-white`}
                  >
                    <Maximize2 size={14} />
                  </button>
                </div>
              </div>

              {!isSectionMinimized && (
                <div className={`space-y-3 ${isAuditMaximized ? 'max-h-[70vh]' : 'max-h-72'} overflow-y-auto pr-1`}>
                  {auditLog.length === 0 ? (
                    <p className={`text-sm ${t.textMuted} py-6 text-center`}>No audit events recorded yet.</p>
                  ) : (
                    auditLog.map((entry) => (
                      <div key={entry.id} className={`flex items-center justify-between gap-3 rounded-2xl border ${t.border} ${t.cardBg3} p-3 transition-all duration-200 ease-out motion-reduce:transition-none hover:translate-x-0.5`}>
                        <div className="min-w-0 flex-1">
                          <p className="font-semibold text-xs sm:text-sm truncate">{entry.item}</p>
                          <p className={`text-[11px] sm:text-xs ${t.textMuted} truncate`}>{entry.detail}</p>
                          {entry.user && <p className="mt-0.5 text-[10px] font-medium text-emerald-400 truncate">By: {entry.user}</p>}
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <div className={`text-right text-[11px] sm:text-xs ${t.textMuted2}`}>
                            <p className="font-semibold">{entry.action}</p>
                            <p className="tabular-nums">{entry.time}</p>
                          </div>
                          <button
                            type="button"
                            onClick={() => deleteAuditLog(entry.id)}
                            title="Delete audit log"
                            aria-label="Delete audit log"
                            className={`tpd-click-press rounded-xl border ${t.border} p-1.5 text-red-400 transition-all duration-150 hover:scale-110 hover:bg-red-950/60`}
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          )}
        </section>

        <section className="grid gap-6 xl:grid-cols-[1.4fr_0.6fr]">
          <div className={`rounded-3xl border ${t.border} ${t.cardBg2} p-4 sm:p-5`}>
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h2 className="text-xl sm:text-2xl font-black">Inventory overview</h2>
                <p className={`text-sm ${t.textMuted}`}>Responsive table with database sync &bull; Press <kbd className="rounded border border-zinc-700 px-1.5 py-0.5 text-[11px]">/</kbd> to search or <kbd className="rounded border border-zinc-700 px-1.5 py-0.5 text-[11px]">Enter</kbd> for quick match</p>
              </div>
              <div className="flex flex-col gap-2.5 sm:flex-row sm:flex-wrap sm:items-center">
                <label className={`flex items-center gap-2 rounded-2xl border ${t.border} ${t.cardBg3} px-3 py-2 transition-colors duration-200 ease-out focus-within:border-zinc-500`}>
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
                    placeholder="Search or scan SKU + Enter"
                    className={`w-full bg-transparent text-base sm:text-sm outline-none sm:w-48 ${t.text}`}
                  />
                </label>
                <button
                  type="button"
                  onClick={openScannerAnimated}
                  title="Scan Barcode"
                  className={`group inline-flex items-center justify-center gap-2 rounded-2xl border ${t.btnSecondary} px-3.5 py-2 text-sm font-semibold transition-all duration-200 ease-out motion-reduce:transition-none`}
                >
                  <BarcodeScanIcon className="h-4 w-4 transition-transform duration-200 ease-out motion-reduce:transition-none group-hover:scale-110" />
                  <span>Scan</span>
                </button>
                <CascadeSelect
                  value={statusFilter}
                  onChange={setStatusFilter}
                  options={statusOptions}
                  darkMode={darkMode}
                  minWidthClass="min-w-[140px]"
                />
                <CascadeSelect
                  value={categoryFilter}
                  onChange={setCategoryFilter}
                  options={categoryFilterOptions}
                  darkMode={darkMode}
                  minWidthClass="min-w-[175px]"
                />
                {hasActiveFilters && (
                  <button
                    type="button"
                    onClick={resetFilters}
                    className={`tpd-click-press inline-flex items-center justify-center gap-1.5 rounded-2xl border ${t.border} ${t.cardBg3} px-3 py-2 text-xs font-semibold ${t.textMuted} transition-colors duration-150 hover:text-white`}
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
                  <span className="h-2 w-2 rounded-full bg-emerald-400 shrink-0" />
                  <span className={t.textMuted}>Last scan:</span>
                  <strong className="truncate">{lastScannedSummary}</strong>
                </div>
                <button
                  type="button"
                  onClick={() => setLastScannedSummary(null)}
                  className={`text-[11px] ${t.textMuted2} hover:text-white`}
                >
                  Dismiss
                </button>
              </div>
            )}

            <div className={`mt-6 flex flex-wrap items-center justify-between gap-3 border-b ${t.border} pb-3 text-sm`}>
              <div className="flex gap-2">
                <button onClick={() => setActiveTab('inventory')} className={`rounded-full px-4 py-1.5 font-medium transition-all duration-200 ease-out motion-reduce:transition-none ${activeTab === 'inventory' ? t.tabActive : t.tabInactive}`}>Inventory</button>
                <button onClick={() => setActiveTab('audit')} className={`rounded-full px-4 py-1.5 font-medium transition-all duration-200 ease-out motion-reduce:transition-none ${activeTab === 'audit' ? t.tabActive : t.tabInactive}`}>Audit Log ({auditLog.length})</button>
              </div>

              {activeTab === 'inventory' && (
                <div className={`inline-flex items-center gap-1 rounded-full border p-0.5 text-xs ${t.border} ${t.cardBg3}`}>
                  <button
                    type="button"
                    onClick={() => setLabelFormat('compact')}
                    className={`rounded-full px-3 py-1 font-semibold transition-all duration-150 ${
                      labelFormat === 'compact' ? t.tabActive : `${t.textMuted} hover:text-white`
                    }`}
                  >
                    Compact Label
                  </button>
                  <button
                    type="button"
                    onClick={() => setLabelFormat('full')}
                    className={`rounded-full px-3 py-1 font-semibold transition-all duration-150 ${
                      labelFormat === 'full' ? t.tabActive : `${t.textMuted} hover:text-white`
                    }`}
                  >
                    Full Label
                  </button>
                </div>
              )}
            </div>

            {activeTab === 'inventory' ? (
              <div className="mt-5 space-y-3">
                {filteredItems.length === 0 ? (
                  <div className={`rounded-2xl border border-dashed ${t.border} ${t.cardBg3} py-10 px-4 text-center`}>
                    <p className="text-sm font-bold">No items found</p>
                    <p className={`mt-1 text-xs ${t.textMuted}`}>
                      {hasActiveFilters ? 'Try clearing or resetting your active filters.' : 'Add a new item to start tracking stock.'}
                    </p>
                    {hasActiveFilters && (
                      <button
                        type="button"
                        onClick={resetFilters}
                        className={`mt-3 inline-flex items-center gap-1.5 rounded-2xl border ${t.btnPrimary} px-3.5 py-1.5 text-xs font-semibold`}
                      >
                        <RotateCcw size={12} />
                        <span>Reset Filters</span>
                      </button>
                    )}
                  </div>
                ) : (
                  filteredItems.map((item) => {
                    const isExpanded = Boolean(expandedBarcodes[item.id]);
                    const isPulsed = Boolean(pulsedItemIds[item.id]);
                    const customQty = Math.max(1, Number(customCardQty[item.id]) || 5);
                    const copiesCount = getItemPrintCopies(item.id);
                    const barcodeItemSizeLabel = formatBarcodeItemSizeLabel(item.name, item.size);

                    return (
                      <div
                        key={item.id}
                        className={`rounded-2xl border p-3.5 sm:p-4 transition-all duration-200 ease-out motion-reduce:transition-none hover:-translate-y-0.5 hover:shadow-lg ${
                          isPulsed ? 'border-emerald-500/70 ring-2 ring-emerald-500/20' : t.border
                        } ${t.cardBgHover}`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <p className="font-semibold text-sm sm:text-base truncate">{item.name}</p>
                            <p className={`text-xs ${t.textMuted2} truncate`}>{item.sku} &bull; {item.size}</p>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <span className={`rounded-full border ${t.badgeBg} px-2 py-0.5 text-[11px]`}>{item.category}</span>
                            <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold transition-transform duration-200 ease-out motion-reduce:transition-none hover:scale-105 ${item.status === 'LOW' ? t.lowBg : t.okBg}`}>{item.status}</span>
                          </div>
                        </div>

                        <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                          <div className="flex-1">
                            <div className="flex justify-between text-xs mb-1 tabular-nums">
                              <span className={t.textMuted}>
                                Stock:{' '}
                                <strong className={`inline-block transition-transform duration-200 ease-out motion-reduce:transition-none ${isPulsed ? 'scale-110 text-emerald-400' : t.text}`}>
                                  {item.stock}
                                </strong>
                              </span>
                              <span className={t.textMuted}>Min: {item.min}</span>
                            </div>
                            <div className={`h-2 w-full rounded-full overflow-hidden ${t.progressBg}`}>
                              <div className={`h-2 rounded-full transition-all duration-300 ease-out motion-reduce:transition-none ${t.progressFill}`} style={{ width: `${Math.min(100, (item.stock / Math.max(item.min, 1)) * 100)}%` }} />
                            </div>
                          </div>

                          <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                            <button onClick={() => adjustStock(item.id, -5, 'button')} title="Deduct 5" className={`tpd-click-press rounded-full border ${t.border} px-2 py-1 text-[11px] font-semibold transition-all duration-150 hover:scale-105 hover:bg-zinc-800 hover:text-white tabular-nums`}>-5</button>
                            <button onClick={() => adjustStock(item.id, -1, 'button')} title="Deduct 1" className={`tpd-click-press rounded-full border ${t.border} px-2.5 py-1 text-xs font-semibold transition-all duration-150 hover:scale-110 hover:bg-zinc-800 hover:text-white`}>-</button>
                            <button onClick={() => adjustStock(item.id, 1, 'button')} title="Add 1" className={`tpd-click-press rounded-full border ${t.border} px-2.5 py-1 text-xs font-semibold transition-all duration-150 hover:scale-110 hover:bg-zinc-800 hover:text-white`}>+</button>
                            <button onClick={() => adjustStock(item.id, 5, 'button')} title="Add 5" className={`tpd-click-press rounded-full border ${t.border} px-2 py-1 text-[11px] font-semibold transition-all duration-150 hover:scale-105 hover:bg-zinc-800 hover:text-white tabular-nums`}>+5</button>
                            <button onClick={() => adjustStock(item.id, 10, 'button')} title="Add 10" className={`tpd-click-press rounded-full border ${t.border} px-2 py-1 text-[11px] font-semibold transition-all duration-150 hover:scale-105 hover:bg-zinc-800 hover:text-white tabular-nums`}>+10</button>

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
                                className={`w-10 bg-transparent text-center text-[11px] font-bold tabular-nums outline-none ${t.text}`}
                              />
                              <button
                                type="button"
                                onClick={() => adjustStock(item.id, customQty, 'button')}
                                title={`Add ${customQty} units`}
                                className={`tpd-click-press rounded-full border ${t.btnPrimary} px-2 py-0.5 text-[10px] font-bold tabular-nums`}
                              >
                                +{customQty}
                              </button>
                            </div>

                            <button
                              type="button"
                              onClick={() => openDuplicateModal(item)}
                              title="Duplicate item for variant"
                              aria-label="Duplicate item"
                              className={`tpd-click-press rounded-full border ${t.border} p-1.5 transition-all duration-150 hover:scale-110 hover:bg-zinc-800 hover:text-white`}
                            >
                              <Copy size={13} />
                            </button>
                            <button onClick={() => openEditModal(item)} title="Edit item" aria-label="Edit item" className={`tpd-click-press rounded-full border ${t.border} p-1.5 transition-all duration-150 hover:scale-110 hover:bg-zinc-800 hover:text-white`}><Edit3 size={13} /></button>
                            <button onClick={() => deleteItem(item.id)} title="Delete item" aria-label="Delete item" className={`tpd-click-press rounded-full border ${t.border} p-1.5 text-red-400 transition-all duration-150 hover:scale-110 hover:bg-red-950/60`}><Trash2 size={13} /></button>
                          </div>
                        </div>

                        {(item.colors || []).length > 0 && (
                          <div className="mt-3 flex flex-wrap gap-1.5 pt-2 border-t border-zinc-800/40">
                            {(item.colors || []).map((color) => (
                              <span key={color} className={`group flex items-center gap-2 rounded-full border ${t.badgeBg} px-2.5 py-0.5 text-[11px] transition-transform duration-150 ease-out motion-reduce:transition-none hover:scale-105`}>
                                <ColorCircle color={color} size="sm" />
                                <span>{color}</span>
                              </span>
                            ))}
                          </div>
                        )}

                        {item.sku && (
                          <div className="mt-3 pt-2 border-t border-zinc-800/40">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <button
                                type="button"
                                onClick={() => toggleBarcodeExpand(item.id)}
                                className={`tpd-click-press inline-flex items-center gap-1.5 rounded-xl border ${t.border} ${t.cardBg3} px-2.5 py-1 text-[11px] font-medium ${t.textMuted} transition-all duration-150 ease-out motion-reduce:transition-none hover:scale-105`}
                              >
                                {isExpanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                                <span>{isExpanded ? 'Minimize Barcode' : 'Show Barcode'}</span>
                              </button>

                              <div className="flex flex-wrap items-center gap-1.5">
                                <div className={`inline-flex items-center gap-1 rounded-xl border ${t.border} ${t.cardBg3} px-2 py-0.5 text-[11px]`}>
                                  <span className={t.textMuted}>Copies</span>
                                  <input
                                    type="number"
                                    min={1}
                                    max={100}
                                    value={copiesCount}
                                    onChange={(e) => setItemPrintCopies(item.id, parseInt(e.target.value, 10))}
                                    aria-label={`Print copies for ${item.name}`}
                                    className={`w-10 bg-transparent text-center font-bold tabular-nums outline-none ${t.text}`}
                                  />
                                  {[1, 5, 10].map((preset) => (
                                    <button
                                      key={preset}
                                      type="button"
                                      onClick={() => setItemPrintCopies(item.id, preset)}
                                      className={`rounded-md px-1 py-0.5 text-[10px] font-semibold tabular-nums transition-colors ${
                                        copiesCount === preset ? t.tabActive : `${t.textMuted} hover:text-white`
                                      }`}
                                    >
                                      {preset}
                                    </button>
                                  ))}
                                </div>
                                <button
                                  type="button"
                                  onClick={() => downloadBarcodePng(item)}
                                  className={`inline-flex items-center gap-1.5 rounded-xl border ${t.btnSecondary} px-2.5 py-1 text-[11px] font-semibold transition-all duration-200 ease-out motion-reduce:transition-none`}
                                >
                                  <Download size={12} />
                                  <span>Download</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => printBarcodeLabel(item, copiesCount)}
                                  className={`inline-flex items-center gap-1.5 rounded-xl border ${t.btnSecondary} px-2.5 py-1 text-[11px] font-semibold transition-all duration-200 ease-out motion-reduce:transition-none tabular-nums`}
                                >
                                  <Printer size={12} />
                                  <span>Print ({copiesCount})</span>
                                </button>
                              </div>
                            </div>

                            <div className={isExpanded ? 'tpd-pop-enter mt-2.5 block' : 'hidden'}>
                              <div
                                className={`inline-flex flex-col items-center rounded-xl border border-zinc-300 bg-white text-black shadow-sm ${
                                  labelFormat === 'full' ? 'px-4 py-3 min-w-[220px]' : 'px-3 py-2'
                                }`}
                              >
                                {labelFormat === 'full' && (
                                  <span className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-zinc-600">
                                    {item.category || 'Item'} &bull; Size {item.size || '-'}
                                  </span>
                                )}
                                <div className="mb-1 flex items-center justify-center gap-1.5">
                                  <span className="text-[11px] font-extrabold tracking-wider text-black">
                                    {barcodeItemSizeLabel}
                                  </span>
                                  {renderLabelColorDots(item.colors)}
                                </div>
                                <div id={`barcode-label-${item.id}`}>
                                  <Barcode
                                    value={item.sku}
                                    format="CODE128"
                                    height={labelFormat === 'full' ? 36 : 32}
                                    width={1.3}
                                    fontSize={11}
                                    margin={2}
                                  />
                                </div>
                                {labelFormat === 'full' && (item.colors || []).length > 0 && (
                                  <span className="mt-1 text-[10px] font-medium text-zinc-700">
                                    Colors: {(item.colors || []).join(', ')}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
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
                            if (prev) setSelectedAuditIds(new Set());
                            return !prev;
                          });
                        }}
                        className={`tpd-click-press inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-semibold ${
                          auditSelectMode ? t.tabActive : `${t.border} ${t.inputBg} ${t.textMuted} hover:text-white`
                        }`}
                      >
                        <Check size={13} />
                        <span>{auditSelectMode ? 'Cancel Select' : 'Select'}</span>
                      </button>

                      {auditSelectMode && (
                        <>
                          <button
                            type="button"
                            onClick={toggleSelectAllAudit}
                            className={`tpd-click-press rounded-xl border ${t.border} ${t.inputBg} px-3 py-1.5 text-xs font-semibold ${t.textMuted} hover:text-white`}
                          >
                            {selectedAuditIds.size === auditLog.length ? 'Deselect All' : 'Select All'}
                          </button>
                          <button
                            type="button"
                            onClick={deleteSelectedAuditLogs}
                            disabled={selectedAuditIds.size === 0 || isClearingAudit}
                            className="tpd-click-press inline-flex items-center gap-1.5 rounded-xl border border-red-500/50 bg-red-600/20 px-3 py-1.5 text-xs font-bold text-red-300 transition-all hover:bg-red-600/30 disabled:opacity-40 tabular-nums"
                          >
                            <Trash2 size={13} />
                            <span>Delete Selected ({selectedAuditIds.size})</span>
                          </button>
                        </>
                      )}
                    </div>

                    {!confirmClearAllAudit ? (
                      <button
                        type="button"
                        onClick={() => setConfirmClearAllAudit(true)}
                        disabled={isClearingAudit}
                        className="tpd-click-press inline-flex items-center gap-1.5 rounded-xl border border-red-500/50 bg-red-600/20 px-3 py-1.5 text-xs font-bold text-red-300 transition-all hover:bg-red-600/30 disabled:opacity-40"
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
                          className="tpd-click-press rounded-xl border border-red-500 bg-red-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-red-700 disabled:opacity-60"
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
                  <p className={`py-8 text-center text-sm ${t.textMuted}`}>No audit events recorded yet.</p>
                ) : (
                  auditLog.map((entry) => {
                    const isChecked = selectedAuditIds.has(entry.id);
                    return (
                      <div
                        key={entry.id}
                        onClick={() => {
                          if (auditSelectMode) toggleAuditSelection(entry.id);
                        }}
                        className={`flex items-center justify-between gap-3 rounded-2xl border p-3 transition-all duration-200 ease-out motion-reduce:transition-none hover:translate-x-0.5 ${
                          auditSelectMode ? 'cursor-pointer' : ''
                        } ${
                          isChecked
                            ? 'border-red-500/60 bg-red-950/20'
                            : `${t.border} ${t.cardBgHover}`
                        }`}
                      >
                        <div className="flex items-center gap-3 min-w-0 flex-1">
                          {auditSelectMode && (
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => toggleAuditSelection(entry.id)}
                              onClick={(e) => e.stopPropagation()}
                              aria-label={`Select audit log for ${entry.item}`}
                              className="h-4 w-4 rounded border-zinc-600 accent-red-500 cursor-pointer shrink-0"
                            />
                          )}
                          <div className="min-w-0 flex-1">
                            <p className="font-semibold text-sm truncate">{entry.item}</p>
                            <p className={`text-xs ${t.textMuted} truncate`}>{entry.detail}</p>
                            {entry.user && <p className="mt-0.5 text-[11px] font-medium text-emerald-400 truncate">Handled by: {entry.user}</p>}
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
                              deleteAuditLog(entry.id);
                            }}
                            title="Delete audit log"
                            aria-label="Delete audit log"
                            className={`tpd-click-press rounded-xl border ${t.border} p-1.5 text-red-400 transition-all duration-150 hover:scale-110 hover:bg-red-950/60`}
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
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
              <p className={`mt-1 text-sm ${t.textMuted}`}>Keep the assortment neatly organized.</p>
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
                  className={`flex-1 rounded-2xl border ${t.border} ${t.inputBg} px-3 py-2 text-base sm:text-sm outline-none transition-colors duration-200 ease-out focus:border-zinc-500 ${t.text}`}
                />
                <button
                  type="button"
                  onClick={addCategory}
                  disabled={isAddingCategory}
                  className={`inline-flex items-center justify-center gap-1.5 rounded-2xl border ${t.btnPrimary} px-3.5 py-2 text-sm font-semibold transition-all duration-200 ease-out motion-reduce:transition-none disabled:opacity-70 shrink-0`}
                >
                  {categoryAddSuccess ? (
                    <>
                      <Check size={15} strokeWidth={3} className="tpd-check-pop text-emerald-500" />
                      <span>Added</span>
                    </>
                  ) : (
                    <span>{isAddingCategory ? 'Adding...' : 'Add'}</span>
                  )}
                </button>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                {categories.map((category) => (
                  <span key={category.id} className={`inline-flex items-center gap-1.5 rounded-full border ${t.badgeBg} py-1 pr-2 pl-3 text-sm transition-transform duration-150 ease-out motion-reduce:transition-none hover:scale-105`}>
                    <span>{category.name}</span>
                    <button type="button" onClick={() => deleteCategory(category.id, category.name)} title={`Remove ${category.name}`} className="tpd-click-press rounded-full p-0.5 transition-all duration-150 hover:scale-125 hover:text-red-400">
                      <X size={13} />
                    </button>
                  </span>
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
                    {copiedRestockList ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
                    <span>{copiedRestockList ? 'Copied' : 'Copy Order'}</span>
                  </button>
                )}
              </div>
              <div className="mt-4 space-y-2.5">
                {lowStockItems.map((item) => (
                  <div key={item.id} className={`flex items-center justify-between gap-2 rounded-2xl border ${t.needsRestockBorder} ${t.needsRestockBg} p-3 text-sm transition-all duration-200 ease-out motion-reduce:transition-none hover:-translate-y-0.5`}>
                    <div className="min-w-0">
                      <p className="font-semibold truncate">{item.name}</p>
                      <p className={`text-xs ${t.textMuted} tabular-nums`}>{item.sku || 'No SKU'} &bull; {item.stock}/{item.min} stock</p>
                    </div>
                    <span className="shrink-0 rounded-xl border border-red-400 bg-red-600 px-2.5 py-1 text-xs font-extrabold text-white shadow-sm">
                      Needed Stock
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>
      </div>

      {/* App Settings Modal */}
      {isSettingsOpen && (
        <div className={`${isSettingsClosing ? 'tpd-fade-exit' : 'tpd-fade-enter'} fixed inset-0 z-50 flex items-center justify-center ${t.overlay} p-3 sm:p-4 overflow-y-auto transition-opacity duration-200 ease-out motion-reduce:transition-none`}>
          <div className={`${isSettingsClosing ? 'tpd-modal-exit' : 'tpd-modal-enter'} my-auto w-full max-w-md rounded-3xl border ${t.modalBg} p-4 sm:p-6 shadow-2xl transition-all duration-200 ease-out motion-reduce:transition-none`}>
            <div className="flex items-center justify-between">
              <div>
                <p className={`text-xs uppercase tracking-[0.3em] ${t.textMuted}`}>PREFERENCES</p>
                <h3 className="text-xl sm:text-2xl font-black">App Settings</h3>
              </div>
              <button
                type="button"
                onClick={closeSettingsAnimated}
                className={`tpd-click-press rounded-full border ${t.border} px-3 py-1 text-xs transition-all duration-150 hover:scale-105`}
              >
                Close
              </button>
            </div>

            <div className="mt-5 space-y-4">
              <div className={`flex items-center justify-between gap-3 rounded-2xl border ${t.border} ${t.cardBg3} p-3.5`}>
                <div>
                  <p className="text-sm font-bold">Dark Mode</p>
                  <p className={`text-xs ${t.textMuted}`}>Switch between dark and light interface</p>
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
                  <p className="text-sm font-bold">Top Low-Stock Pop-Up</p>
                  <p className={`text-xs ${t.textMuted}`}>Show Messenger-style alert at top on low stock</p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowLowStockPopUp((prev) => !prev)}
                  className={`rounded-xl border px-3 py-1.5 text-xs font-semibold ${showLowStockPopUp ? t.tabActive : t.tabInactive}`}
                >
                  {showLowStockPopUp ? 'Enabled' : 'Muted'}
                </button>
              </div>

              <div className={`rounded-2xl border ${t.border} ${t.cardBg3} p-3.5`}>
                <p className="text-sm font-bold">Barcode Label Size</p>
                <p className={`text-xs ${t.textMuted} mt-0.5`}>Compact sticker or full hangtag/shelf label</p>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  {(['compact', 'full'] as BarcodeLabelFormat[]).map((fmt) => (
                    <button
                      key={fmt}
                      type="button"
                      onClick={() => setLabelFormat(fmt)}
                      className={`rounded-xl border px-2.5 py-1.5 text-xs font-semibold capitalize ${
                        labelFormat === fmt ? t.tabActive : `${t.border} ${t.inputBg} ${t.textMuted}`
                      }`}
                    >
                      {fmt === 'compact' ? 'Compact Sticker' : 'Full Hangtag'}
                    </button>
                  ))}
                </div>
              </div>

              <div className={`rounded-2xl border ${t.border} ${t.cardBg3} p-3.5`}>
                <p className="text-sm font-bold">Default Scanner Action</p>
                <p className={`text-xs ${t.textMuted} mt-0.5`}>Choose what happens when a barcode is scanned</p>
                <div className="mt-3 grid grid-cols-3 gap-2">
                  {(['search', 'add', 'deduct'] as ScanActionMode[]).map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => setScanMode(mode)}
                      className={`rounded-xl border px-2.5 py-1.5 text-xs font-semibold capitalize ${
                        scanMode === mode ? t.tabActive : `${t.border} ${t.inputBg} ${t.textMuted}`
                      }`}
                    >
                      {mode === 'search' ? 'Find Item' : mode === 'add' ? 'Add Stock' : 'Deduct'}
                    </button>
                  ))}
                </div>
              </div>

              <div className={`rounded-2xl border ${t.needsRestockBorder} ${t.needsRestockBg} p-3.5`}>
                <p className="text-sm font-bold text-red-400">Delete Account</p>
                <p className={`text-xs ${t.textMuted} mt-0.5`}>
                  Sign out and remove access for <span className="font-semibold">{user.email || actorName}</span>.
                </p>

                {!confirmDeleteAccount ? (
                  <button
                    type="button"
                    onClick={() => setConfirmDeleteAccount(true)}
                    className="tpd-click-press mt-3 inline-flex items-center gap-1.5 rounded-xl border border-red-500/50 bg-red-600/20 px-3.5 py-2 text-xs font-bold text-red-300 transition-all duration-150 hover:bg-red-600/30"
                  >
                    <Trash2 size={13} />
                    <span>Delete Account</span>
                  </button>
                ) : (
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={handleDeleteAccount}
                      disabled={isDeletingAccount}
                      className="tpd-click-press inline-flex items-center gap-1.5 rounded-xl border border-red-500 bg-red-600 px-3.5 py-2 text-xs font-bold text-white transition-all duration-150 hover:bg-red-700 disabled:opacity-60"
                    >
                      <span>{isDeletingAccount ? 'Deleting...' : 'Confirm Delete'}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmDeleteAccount(false)}
                      className={`tpd-click-press rounded-xl border ${t.btnSecondary} px-3 py-2 text-xs font-semibold`}
                    >
                      Cancel
                    </button>
                  </div>
                )}
              </div>
            </div>

            <div className="mt-6 flex justify-end">
              <button
                type="button"
                onClick={closeSettingsAnimated}
                className={`rounded-2xl border ${t.btnPrimary} px-5 py-2 text-sm font-semibold`}
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {isScannerOpen && (
        <div className={`${isScannerClosing ? 'tpd-fade-exit' : 'tpd-fade-enter'} fixed inset-0 z-50 flex items-center justify-center ${t.overlay} p-3 sm:p-4 overflow-y-auto transition-opacity duration-200 ease-out motion-reduce:transition-none`}>
          <div className={`${isScannerClosing ? 'tpd-modal-exit' : 'tpd-modal-enter'} my-auto max-h-[92vh] overflow-y-auto w-full max-w-md rounded-3xl border ${t.modalBg} p-4 sm:p-6 shadow-2xl transition-all duration-200 ease-out motion-reduce:transition-none`}>
            <div className="flex items-center justify-between">
              <div>
                <p className={`text-xs uppercase tracking-[0.3em] ${t.textMuted}`}>CAMERA &amp; WEDGE SCANNER</p>
                <h3 className="text-xl font-black">Scan item barcode</h3>
              </div>
              <button
                type="button"
                onClick={closeScannerAnimated}
                className={`tpd-click-press rounded-full border ${t.border} px-3 py-1 text-xs transition-all duration-150 hover:scale-105`}
              >
                Close
              </button>
            </div>

            {/* Continuous Scan & Beep Toggles */}
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => setContinuousScan((prev) => !prev)}
                className={`tpd-click-press inline-flex items-center gap-1.5 rounded-2xl border px-3 py-1.5 text-xs font-semibold ${
                  continuousScan ? t.tabActive : `${t.border} ${t.inputBg} ${t.textMuted}`
                }`}
              >
                <Repeat size={13} />
                <span>Continuous: {continuousScan ? 'On' : 'Off'}</span>
              </button>

              <button
                type="button"
                onClick={() => setScanSoundEnabled((prev) => !prev)}
                className={`tpd-click-press inline-flex items-center gap-1.5 rounded-2xl border px-3 py-1.5 text-xs font-semibold ${
                  scanSoundEnabled ? t.tabActive : `${t.border} ${t.inputBg} ${t.textMuted}`
                }`}
              >
                {scanSoundEnabled ? <Volume2 size={13} /> : <VolumeX size={13} />}
                <span>Beep: {scanSoundEnabled ? 'On' : 'Off'}</span>
              </button>
            </div>

            {scanSuccessBanner && (
              <div className="tpd-scan-success mt-3 flex items-center gap-2.5 rounded-2xl border border-emerald-500/60 bg-emerald-950/50 px-4 py-3 text-xs font-bold text-emerald-300 shadow-lg">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-black">
                  <Check size={14} strokeWidth={3} />
                </span>
                <span className="truncate">{scanSuccessBanner}</span>
              </div>
            )}

            <div className="mt-4 grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => {
                  setScanMode('search');
                  setScanFeedback(null);
                }}
                className={`rounded-2xl border px-3 py-2 text-xs font-semibold transition-all duration-150 ${
                  scanMode === 'search' ? t.tabActive : `${t.border} ${t.inputBg} ${t.textMuted}`
                }`}
              >
                Find Item
              </button>
              <button
                type="button"
                onClick={() => {
                  setScanMode('add');
                  setScanFeedback(null);
                }}
                className={`rounded-2xl border px-3 py-2 text-xs font-semibold transition-all duration-150 ${
                  scanMode === 'add' ? t.tabActive : `${t.border} ${t.inputBg} ${t.textMuted}`
                }`}
              >
                Add Stock
              </button>
              <button
                type="button"
                onClick={() => {
                  setScanMode('deduct');
                  setScanFeedback(null);
                }}
                className={`rounded-2xl border px-3 py-2 text-xs font-semibold transition-all duration-150 ${
                  scanMode === 'deduct' ? t.tabActive : `${t.border} ${t.inputBg} ${t.textMuted}`
                }`}
              >
                Deduct Stock
              </button>
            </div>

            {scanMode !== 'search' && (
              <div className={`tpd-pop-enter mt-3 flex items-center justify-between gap-3 rounded-2xl border ${t.border} ${t.cardBg3} px-3.5 py-2.5`}>
                <span className={`text-xs font-semibold ${t.textMuted}`}>
                  {scanMode === 'add' ? 'Quantity to add per scan' : 'Quantity to deduct per scan'}
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setScanQuantity((q) => Math.max(1, (Number(q) || 1) - 1))}
                    className={`rounded-xl border ${t.border} ${t.btnSecondary} px-2.5 py-1 text-xs font-bold`}
                  >
                    -
                  </button>
                  <input
                    type="number"
                    min={1}
                    value={scanQuantity}
                    onChange={(e) => {
                      const valNum = parseInt(e.target.value, 10);
                      setScanQuantity(Number.isNaN(valNum) ? 1 : Math.max(1, valNum));
                    }}
                    aria-label="Scan quantity"
                    className={`w-16 rounded-xl border ${t.border} ${t.inputBg} px-2 py-1 text-center text-base sm:text-xs font-bold tabular-nums outline-none ${t.text}`}
                  />
                  <button
                    type="button"
                    onClick={() => setScanQuantity((q) => Math.max(1, (Number(q) || 1) + 1))}
                    className={`rounded-xl border ${t.border} ${t.btnSecondary} px-2.5 py-1 text-xs font-bold`}
                  >
                    +
                  </button>
                </div>
              </div>
            )}

            {/* USB / Handheld Barcode Wedge Input */}
            <div className="mt-3 flex gap-2">
              <input
                value={manualWedgeSku}
                onChange={(e) => setManualWedgeSku(e.target.value)}
                onKeyDown={async (e) => {
                  if (e.key === 'Enter' && manualWedgeSku.trim()) {
                    e.preventDefault();
                    const codeToProcess = manualWedgeSku.trim();
                    setManualWedgeSku('');
                    await processScannedCode(codeToProcess, undefined, true);
                  }
                }}
                placeholder="Type or USB-scan SKU + Enter"
                className={`flex-1 rounded-2xl border ${t.border} ${t.inputBg} px-3 py-2 text-sm outline-none ${t.text}`}
              />
              <button
                type="button"
                onClick={async () => {
                  if (!manualWedgeSku.trim()) return;
                  const codeToProcess = manualWedgeSku.trim();
                  setManualWedgeSku('');
                  await processScannedCode(codeToProcess, undefined, true);
                }}
                className={`rounded-2xl border ${t.btnPrimary} px-3.5 py-2 text-xs font-semibold shrink-0`}
              >
                Apply
              </button>
            </div>

            {scannerError && (
              <div className="mt-3 rounded-2xl border border-red-900/50 bg-red-950/40 px-4 py-3 text-xs text-red-300">
                {scannerError}
              </div>
            )}

            {scanFeedback && (
              <div className="mt-3 rounded-2xl border border-amber-900/50 bg-amber-950/40 px-4 py-3 text-xs text-amber-200">
                {scanFeedback}
              </div>
            )}

            <div className={`mt-4 overflow-hidden rounded-2xl border ${t.border} bg-black`}>
              <div id="barcode-camera-reader" className="min-h-56 w-full" />
            </div>

            <p className={`mt-3 text-xs ${t.textMuted}`}>
              {continuousScan
                ? 'Continuous scan is active (double beep): scan multiple items in a row without reopening the camera.'
                : 'Single-scan mode (single beep): closes automatically after a successful scan.'}
            </p>
          </div>
        </div>
      )}

      {isModalOpen && (
        <div className={`${isModalClosing ? 'tpd-fade-exit' : 'tpd-fade-enter'} fixed inset-0 z-50 flex items-center justify-center ${t.overlay} p-3 sm:p-4 overflow-y-auto transition-opacity duration-200 ease-out motion-reduce:transition-none`}>
          <div className={`${isModalClosing ? 'tpd-modal-exit' : 'tpd-modal-enter'} my-auto max-h-[90vh] w-full max-w-xl overflow-y-auto scroll-smooth rounded-3xl border ${t.modalBg} p-4 sm:p-6 shadow-2xl transition-all duration-200 ease-out motion-reduce:transition-none`}>
            <div className="flex items-center justify-between">
              <div>
                <p className={`text-xs uppercase tracking-[0.3em] ${t.textMuted}`}>{editingId ? 'Edit item' : 'New item'}</p>
                <h3 className="text-xl sm:text-2xl font-black">Item details</h3>
              </div>
              <button onClick={closeModalAnimated} className={`tpd-click-press rounded-full border ${t.border} px-3 py-1 text-xs transition-all duration-150 hover:scale-105`}>Close</button>
            </div>

            <div className="mt-5 grid gap-3 sm:gap-4 sm:grid-cols-2">
              <label className="text-sm">
                <span className={`mb-1.5 block ${t.textMuted}`}>Item Name</span>
                <input value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} className={`w-full rounded-2xl border ${t.border} ${t.inputBg} px-3 py-2 text-base sm:text-sm outline-none transition-colors duration-200 ease-out focus:border-zinc-500 ${t.text}`} />
              </label>
              <div className="text-sm">
                <div className="mb-1.5 flex items-center justify-between gap-2">
                  <span className={t.textMuted}>SKU / Barcode</span>
                  <button
                    type="button"
                    onClick={generateCustomSku}
                    className={`tpd-click-press inline-flex items-center gap-1 rounded-xl border ${t.border} ${t.cardBg3} px-2 py-0.5 text-[11px] font-semibold transition-all duration-150 hover:scale-105`}
                  >
                    <Sparkles size={11} />
                    <span>Auto SKU</span>
                  </button>
                </div>
                <input
                  value={form.sku}
                  onChange={(event) => setForm((current) => ({ ...current, sku: event.target.value }))}
                  placeholder="e.g. CAP-593218"
                  className={`w-full rounded-2xl border ${t.border} ${t.inputBg} px-3 py-2 text-base sm:text-sm outline-none transition-colors duration-200 ease-out focus:border-zinc-500 ${t.text}`}
                />
              </div>
              <div className="text-sm">
                <span className={`mb-1.5 block ${t.textMuted}`}>Category</span>
                <CascadeSelect
                  value={form.category}
                  onChange={(nextCategory) => setForm((current) => ({ ...current, category: nextCategory }))}
                  options={modalCategoryOptions}
                  darkMode={darkMode}
                  fullWidth
                />
              </div>
              <label className="text-sm">
                <span className={`mb-1.5 block ${t.textMuted}`}>Size</span>
                <input value={form.size} onChange={(event) => setForm((current) => ({ ...current, size: event.target.value }))} className={`w-full rounded-2xl border ${t.border} ${t.inputBg} px-3 py-2 text-base sm:text-sm outline-none transition-colors duration-200 ease-out focus:border-zinc-500 ${t.text}`} />
              </label>
              <label className="text-sm">
                <span className={`mb-1.5 block ${t.textMuted}`}>Current Stock</span>
                <input type="number" value={form.stock} onChange={(event) => setForm((current) => ({ ...current, stock: event.target.value }))} className={`w-full rounded-2xl border ${t.border} ${t.inputBg} px-3 py-2 text-base sm:text-sm tabular-nums outline-none transition-colors duration-200 ease-out focus:border-zinc-500 ${t.text}`} />
              </label>
              <label className="text-sm">
                <span className={`mb-1.5 block ${t.textMuted}`}>Low Stock Threshold</span>
                <input type="number" value={form.min} onChange={(event) => setForm((current) => ({ ...current, min: event.target.value }))} className={`w-full rounded-2xl border ${t.border} ${t.inputBg} px-3 py-2 text-base sm:text-sm tabular-nums outline-none transition-colors duration-200 ease-out focus:border-zinc-500 ${t.text}`} />
              </label>
            </div>

            {form.sku.trim() && (
              <div className="mt-4">
                <div className="mb-1.5 flex items-center justify-between gap-2">
                  <span className={`text-xs ${t.textMuted}`}>Custom Barcode Preview</span>
                  <div className="inline-flex items-center gap-1 rounded-full border border-zinc-700/60 p-0.5 text-[11px]">
                    <button
                      type="button"
                      onClick={() => setLabelFormat('compact')}
                      className={`rounded-full px-2.5 py-0.5 font-semibold ${
                        labelFormat === 'compact' ? t.tabActive : `${t.textMuted} hover:text-white`
                      }`}
                    >
                      Compact
                    </button>
                    <button
                      type="button"
                      onClick={() => setLabelFormat('full')}
                      className={`rounded-full px-2.5 py-0.5 font-semibold ${
                        labelFormat === 'full' ? t.tabActive : `${t.textMuted} hover:text-white`
                      }`}
                    >
                      Full
                    </button>
                  </div>
                </div>
                <div
                  className={`inline-flex flex-col items-center rounded-2xl bg-white text-black shadow-sm ${
                    labelFormat === 'full' ? 'px-4 py-3 min-w-[230px]' : 'px-3 py-2'
                  }`}
                >
                  {labelFormat === 'full' && (
                    <span className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-zinc-600">
                      {form.category || 'Item'} &bull; Size {form.size || '-'}
                    </span>
                  )}
                  <div className="mb-1 flex items-center justify-center gap-1.5">
                    <span className="text-xs font-extrabold tracking-wider text-black">
                      {formatBarcodeItemSizeLabel(form.name, form.size)}
                    </span>
                    {renderLabelColorDots(form.colors)}
                  </div>
                  <Barcode
                    value={form.sku.trim()}
                    format="CODE128"
                    height={labelFormat === 'full' ? 38 : 36}
                    width={1.4}
                    fontSize={12}
                    margin={2}
                  />
                  {labelFormat === 'full' && form.colors.length > 0 && (
                    <span className="mt-1 text-[10px] font-medium text-zinc-700">
                      Colors: {form.colors.join(', ')}
                    </span>
                  )}
                </div>
              </div>
            )}

            <div className="mt-4">
              <label className={`mb-2 block text-sm ${t.textMuted}`}>Colors</label>
              <div className="flex flex-wrap items-center gap-2">
                {allSelectableColors.map((color) => {
                  const isSelected = form.colors.includes(color);
                  return (
                    <button
                      key={color}
                      type="button"
                      onClick={() => toggleColor(color)}
                      className={`tpd-click-press group flex items-center gap-2 rounded-full border px-3 sm:px-4 py-1.5 text-xs sm:text-sm transition-all duration-150 ease-out motion-reduce:transition-none hover:scale-105 ${
                        isSelected
                          ? `${t.tabActive} ${t.border} font-medium shadow-sm`
                          : `${t.border} bg-transparent ${t.text} ${t.cardBgHover}`
                      }`}
                    >
                      <ColorCircle color={color} size="sm" />
                      <span>{color}</span>
                    </button>
                  );
                })}
              </div>

              <div className="mt-3">
                <button
                  type="button"
                  onClick={togglePickerAnimated}
                  className={`tpd-click-press group inline-flex items-center gap-2 rounded-2xl border ${t.border} ${isPickerOpen ? t.cardBgHover : t.inputBg} px-3.5 py-2 text-xs sm:text-sm font-medium ${t.text} transition-all duration-150 ease-out motion-reduce:transition-none hover:scale-105`}
                >
                  <Palette size={15} className={`${iconClass} transition-transform duration-200 ease-out motion-reduce:transition-none group-hover:rotate-12`} />
                  <span>Custom Color</span>
                </button>

                {isPickerOpen && (
                  <div
                    ref={customColorPanelRef}
                    className={`${isPickerClosing ? 'tpd-pop-exit' : 'tpd-pop-enter'} mt-2.5 w-full max-w-xs rounded-3xl border ${t.border} ${t.cardBg} p-4 shadow-2xl transition-all duration-200 ease-out motion-reduce:transition-none`}
                  >
                    <div className={`flex items-center justify-between gap-2 pb-3 border-b ${t.border}`}>
                      <div className="flex items-center gap-2.5 min-w-0">
                        <ColorCircle color={pickerHex} size="lg" />
                        <div className="min-w-0">
                          <p className="text-sm font-bold truncate">{currentMatchedName}</p>
                          <p className={`text-[11px] font-mono ${t.textMuted}`}>{pickerHex}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => {
                            addColorToForm(currentMatchedName);
                            closePickerAnimated();
                          }}
                          title={`Add ${currentMatchedName}`}
                          className={`tpd-click-press rounded-xl border ${t.btnPrimary} p-1.5 transition-all duration-150 hover:scale-110`}
                        >
                          <Check size={14} />
                        </button>
                        <button
                          type="button"
                          onClick={() => closePickerAnimated()}
                          title="Close picker"
                          className={`tpd-click-press rounded-xl border ${t.border} ${t.inputBg} p-1.5 ${t.textMuted} transition-all duration-150 hover:scale-110`}
                        >
                          <X size={14} />
                        </button>
                      </div>
                    </div>

                    <div
                      onPointerDown={(e) => {
                        e.currentTarget.setPointerCapture(e.pointerId);
                        updateSvFromPointer(e.clientX, e.clientY, e.currentTarget.getBoundingClientRect());
                      }}
                      onPointerMove={(e) => {
                        if (e.buttons !== 1 && e.pressure === 0) return;
                        updateSvFromPointer(e.clientX, e.clientY, e.currentTarget.getBoundingClientRect());
                      }}
                      className={`mt-3.5 relative h-36 w-full cursor-crosshair rounded-2xl border ${t.border} select-none touch-none`}
                      style={{
                        backgroundColor: currentHueHex,
                        backgroundImage:
                          'linear-gradient(to top, #000000, transparent), linear-gradient(to right, #ffffff, transparent)',
                      }}
                    >
                      <span
                        className="pointer-events-none absolute h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-lg transition-transform duration-100"
                        style={{
                          left: `${sat * 100}%`,
                          top: `${(1 - val) * 100}%`,
                          backgroundColor: pickerHex,
                        }}
                      />
                    </div>

                    <div className="mt-3">
                      <input
                        type="range"
                        min={0}
                        max={360}
                        value={hue}
                        onChange={(e) => updateHueFromValue(Number(e.target.value))}
                        aria-label="Hue"
                        className={`h-3 w-full cursor-pointer appearance-none rounded-full border ${t.border} transition-opacity duration-150 hover:opacity-95`}
                        style={{
                          background:
                            'linear-gradient(to right, #ff0000 0%, #ffff00 17%, #00ff00 33%, #00ffff 50%, #0000ff 67%, #ff00ff 83%, #ff0000 100%)',
                        }}
                      />
                    </div>

                    <div className="mt-3.5">
                      <p className={`mb-2 text-[11px] font-medium ${t.textMuted}`}>Quick Color Swatches (Click to preview, then tap &#10003; to add)</p>
                      <div className="grid grid-cols-6 gap-2">
                        {FEATURED_SWATCHES.map((swatchName) => {
                          const isPreviewed = previewSwatchName === swatchName;
                          return (
                            <button
                              key={swatchName}
                              type="button"
                              onClick={() => handleQuickSwatchSelect(swatchName)}
                              title={`Preview ${swatchName}`}
                              className={`tpd-click-press flex h-8 w-8 items-center justify-center rounded-full border transition-all duration-150 ease-out motion-reduce:transition-none hover:scale-110 ${
                                isPreviewed ? 'ring-2 ring-white border-white scale-110' : `${t.border}`
                              }`}
                              style={{ backgroundColor: getColorFill(swatchName) }}
                            >
                              {isPreviewed && (
                                <span
                                  className={`h-2 w-2 rounded-full ${
                                    ['White', 'Cream', 'Yellow', 'Lime', 'Cyan', 'Sky Blue', 'Silver'].includes(swatchName)
                                      ? 'bg-black'
                                      : 'bg-white'
                                  }`}
                                />
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button onClick={closeModalAnimated} className={`rounded-2xl border ${t.btnSecondary} px-4 py-2 text-sm transition-all duration-200 ease-out motion-reduce:transition-none`}>Cancel</button>
              <button
                type="button"
                onClick={submitItem}
                disabled={isSavingItem}
                className={`inline-flex items-center gap-1.5 rounded-2xl border ${t.btnPrimary} px-4 py-2 text-sm font-semibold transition-all duration-200 ease-out motion-reduce:transition-none disabled:opacity-70`}
              >
                {saveSuccess ? (
                  <>
                    <Check size={15} strokeWidth={3} className="tpd-check-pop text-emerald-500" />
                    <span>Saved</span>
                  </>
                ) : (
                  <span>{isSavingItem ? 'Saving...' : 'Save'}</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      <style jsx>{`
        .tpd-click-press {
          transition: transform 200ms cubic-bezier(0.22, 1, 0.36, 1), background-color 180ms ease, box-shadow 180ms ease, border-color 180ms ease, opacity 160ms ease;
        }
        .tpd-click-press:active {
          transform: scale(0.94);
          transition-duration: 110ms;
        }
        .tpd-cascade-panel-enter {
          animation: tpdCascadePanelIn 200ms cubic-bezier(0.22, 1, 0.36, 1) both;
          transform-origin: top center;
        }
        .tpd-cascade-panel-exit {
          animation: tpdCascadePanelOut 180ms cubic-bezier(0.22, 1, 0.36, 1) both;
          transform-origin: top center;
        }
        .tpd-cascade-item-enter {
          animation: tpdCascadeItemIn 220ms cubic-bezier(0.22, 1, 0.36, 1) both;
        }
        .tpd-cascade-item-exit {
          animation: tpdCascadeItemOut 160ms cubic-bezier(0.22, 1, 0.36, 1) both;
        }
        .tpd-cascade-option {
          position: relative;
          z-index: 1;
          transition: transform 200ms cubic-bezier(0.22, 1, 0.36, 1), background-color 180ms ease, border-color 180ms ease, box-shadow 180ms ease, color 160ms ease;
        }
        .tpd-cascade-option:hover {
          z-index: 10;
          transform: scale(1.045);
          box-shadow: 0 10px 22px -8px rgba(0, 0, 0, 0.55);
        }
        .tpd-cascade-option:active {
          transform: scale(0.97);
          transition-duration: 100ms;
        }
        .tpd-fade-enter {
          animation: tpdFadeIn 200ms cubic-bezier(0.22, 1, 0.36, 1) both;
        }
        .tpd-fade-exit {
          animation: tpdFadeOut 180ms cubic-bezier(0.22, 1, 0.36, 1) both;
        }
        .tpd-modal-enter {
          animation: tpdModalIn 250ms cubic-bezier(0.22, 1, 0.36, 1) both;
        }
        .tpd-modal-exit {
          animation: tpdModalOut 180ms cubic-bezier(0.22, 1, 0.36, 1) both;
        }
        .tpd-pop-enter {
          animation: tpdPopIn 220ms cubic-bezier(0.22, 1, 0.36, 1) both;
        }
        .tpd-pop-exit {
          animation: tpdPopOut 180ms cubic-bezier(0.22, 1, 0.36, 1) both;
        }
        .tpd-msg-top-enter {
          animation: tpdMsgTopIn 260ms cubic-bezier(0.22, 1, 0.36, 1) both;
        }
        .tpd-msg-top-exit {
          animation: tpdMsgTopOut 180ms cubic-bezier(0.22, 1, 0.36, 1) both;
        }
        .tpd-check-pop {
          animation: tpdCheckPop 240ms cubic-bezier(0.22, 1, 0.36, 1) both;
        }
        .tpd-scan-success {
          animation: tpdScanSuccess 280ms cubic-bezier(0.22, 1, 0.36, 1) both;
        }
        @keyframes tpdCascadePanelIn {
          from {
            opacity: 0;
            transform: translateY(-6px) scaleY(0.95);
          }
          to {
            opacity: 1;
            transform: translateY(0) scaleY(1);
          }
        }
        @keyframes tpdCascadePanelOut {
          from {
            opacity: 1;
            transform: translateY(0) scaleY(1);
          }
          to {
            opacity: 0;
            transform: translateY(-5px) scaleY(0.96);
          }
        }
        @keyframes tpdCascadeItemIn {
          from {
            opacity: 0;
            transform: translateY(-6px) scale(0.96);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }
        @keyframes tpdCascadeItemOut {
          from {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
          to {
            opacity: 0;
            transform: translateY(-5px) scale(0.96);
          }
        }
        @keyframes tpdFadeIn {
          from {
            opacity: 0;
          }
          to {
            opacity: 1;
          }
        }
        @keyframes tpdFadeOut {
          from {
            opacity: 1;
          }
          to {
            opacity: 0;
          }
        }
        @keyframes tpdModalIn {
          from {
            opacity: 0;
            transform: translateY(12px) scale(0.97);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }
        @keyframes tpdModalOut {
          from {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
          to {
            opacity: 0;
            transform: translateY(10px) scale(0.97);
          }
        }
        @keyframes tpdPopIn {
          from {
            opacity: 0;
            transform: translateY(-6px) scale(0.97);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }
        @keyframes tpdPopOut {
          from {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
          to {
            opacity: 0;
            transform: translateY(-6px) scale(0.97);
          }
        }
        @keyframes tpdMsgTopIn {
          from {
            opacity: 0;
            transform: translateY(-20px) scale(0.95);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }
        @keyframes tpdMsgTopOut {
          from {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
          to {
            opacity: 0;
            transform: translateY(-16px) scale(0.96);
          }
        }
        @keyframes tpdCheckPop {
          0% {
            transform: scale(0.3) rotate(-25deg);
            opacity: 0;
          }
          70% {
            transform: scale(1.25) rotate(4deg);
            opacity: 1;
          }
          100% {
            transform: scale(1) rotate(0deg);
            opacity: 1;
          }
        }
        @keyframes tpdScanSuccess {
          0% {
            opacity: 0;
            transform: scale(0.94) translateY(-4px);
          }
          65% {
            opacity: 1;
            transform: scale(1.02) translateY(0);
          }
          100% {
            opacity: 1;
            transform: scale(1) translateY(0);
          }
        }
        @media (prefers-reduced-motion: reduce) {
          .tpd-click-press,
          .tpd-click-press:active,
          .tpd-cascade-panel-enter,
          .tpd-cascade-panel-exit,
          .tpd-cascade-item-enter,
          .tpd-cascade-item-exit,
          .tpd-cascade-option,
          .tpd-cascade-option:hover,
          .tpd-fade-enter,
          .tpd-fade-exit,
          .tpd-modal-enter,
          .tpd-modal-exit,
          .tpd-pop-enter,
          .tpd-pop-exit,
          .tpd-msg-top-enter,
          .tpd-msg-top-exit,
          .tpd-check-pop,
          .tpd-scan-success {
            animation: none !important;
            transform: none !important;
          }
        }
      `}</style>
    </main>
  );
}