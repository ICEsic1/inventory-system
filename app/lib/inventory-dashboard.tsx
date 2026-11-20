'use client';

import { supabase } from './supabase';
import type { User } from '@supabase/supabase-js';
import { useEffect, useMemo, useRef, useState } from 'react';
import Barcode from 'react-barcode';
import {
  BarChart3,
  Box,
  Check,
  ChevronDown,
  ChevronUp,
  Download,
  Edit3,
  Lock,
  LogOut,
  Mail,
  Moon,
  Package2,
  Palette,
  Plus,
  Printer,
  Search,
  Sparkles,
  Sun,
  Trash2,
  TrendingUp,
  Warehouse,
  X,
} from 'lucide-react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';

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

const colorOptions = ['Black', 'White', 'Navy', 'Olive', 'Cream', 'Red', 'Khaki'];

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

function ColorCircle({ color, size = 'sm' }: { color: string; size?: 'sm' | 'md' | 'lg' }) {
  const fill = getColorFill(color);
  const sizeClass =
    size === 'lg' ? 'h-6 w-6' : size === 'md' ? 'h-5 w-5' : 'h-4 w-4';
  const minPx = size === 'lg' ? '24px' : size === 'md' ? '20px' : '16px';

  return (
    <span
      className={`inline-block rounded-full border border-zinc-400/60 shrink-0 transition-transform duration-200 group-hover:scale-110 ${sizeClass}`}
      style={{ backgroundColor: fill, minWidth: minPx, minHeight: minPx }}
      aria-hidden="true"
    />
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

  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [categoryFilter, setCategoryFilter] = useState('ALL');
  const [activeTab, setActiveTab] = useState<'inventory' | 'audit'>('inventory');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: '', sku: '', category: 'Shirts', size: 'M', stock: '0', min: '5', colors: [] as string[] });
  const [newCategory, setNewCategory] = useState('');

  const [expandedBarcodes, setExpandedBarcodes] = useState<Record<string, boolean>>({});

  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [scannerError, setScannerError] = useState<string | null>(null);
  const scannerInstanceRef = useRef<any>(null);
  const scannerRunningRef = useRef(false);

  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [hue, setHue] = useState(217);
  const [sat, setSat] = useState(0.8);
  const [val, setVal] = useState(0.96);
  const [pickerHex, setPickerHex] = useState('#3B82F6');

  const [darkMode, setDarkMode] = useState(true);

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

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      setAuthLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      setAuthLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

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
      if (!isScannerOpen) {
        await stopScanner();
        return;
      }

      setScannerError(null);

      try {
        const mod = await import('html5-qrcode');
        if (!active) return;

        const Html5Qrcode = mod.Html5Qrcode;
        const scanner = scannerInstanceRef.current || new Html5Qrcode('barcode-camera-reader');
        scannerInstanceRef.current = scanner;

        await scanner.start(
          { facingMode: 'environment' },
          { fps: 10, qrbox: { width: 240, height: 140 } },
          (decodedText: string) => {
            if (!active) return;
            const cleaned = decodedText.trim();
            setQuery(cleaned);
            setStatusFilter('ALL');
            setCategoryFilter('ALL');
            setActiveTab('inventory');
            setIsScannerOpen(false);
          },
          () => {
            // Frame scan miss; continue scanning
          }
        );

        scannerRunningRef.current = true;
      } catch {
        if (active) {
          setScannerError('Camera access failed. Check browser camera permission or use HTTPS / localhost.');
        }
      }
    };

    startScanner();

    return () => {
      active = false;
      stopScanner();
    };
  }, [isScannerOpen]);

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
    btnPrimary: darkMode
      ? 'bg-white text-black border-zinc-700 hover:bg-zinc-100 hover:-translate-y-0.5 hover:shadow-lg active:scale-95 active:translate-y-0'
      : 'bg-black text-white border-zinc-400 hover:bg-zinc-800 hover:-translate-y-0.5 hover:shadow-lg active:scale-95 active:translate-y-0',
    btnSecondary: darkMode
      ? 'bg-zinc-900 text-white border-zinc-700 hover:bg-zinc-800 hover:-translate-y-0.5 hover:shadow-md active:scale-95 active:translate-y-0'
      : 'bg-zinc-200 text-black border-zinc-300 hover:bg-zinc-300 hover:-translate-y-0.5 hover:shadow-md active:scale-95 active:translate-y-0',
    tabActive: darkMode ? 'bg-white text-black shadow-sm' : 'bg-black text-white shadow-sm',
    tabInactive: darkMode
      ? 'bg-zinc-900 text-zinc-300 hover:bg-zinc-800 hover:text-white'
      : 'bg-zinc-200 text-zinc-600 hover:bg-zinc-300 hover:text-black',
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

  const toggleColor = (color: string) => {
    setForm((current) => ({
      ...current,
      colors: current.colors.includes(color)
        ? current.colors.filter((entry) => entry !== color)
        : [...current.colors, color],
    }));
  };

  const ensureColorSelected = (colorName: string) => {
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
    const rgb = hexToRgb(hex);
    if (rgb) {
      const hsv = rgbToHsv(rgb.r, rgb.g, rgb.b);
      setHue(hsv.h);
      setSat(hsv.s);
      setVal(hsv.v);
    }
    ensureColorSelected(colorName);
  };

  const updateSvFromPointer = (clientX: number, clientY: number, rect: DOMRect) => {
    const nextSat = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    const nextVal = Math.max(0, Math.min(1, 1 - (clientY - rect.top) / rect.height));
    const nextHex = hsvToHex(hue, nextSat, nextVal);
    setSat(nextSat);
    setVal(nextVal);
    setPickerHex(nextHex);
    ensureColorSelected(hexToColorName(nextHex));
  };

  const updateHueFromValue = (nextHue: number) => {
    const nextHex = hsvToHex(nextHue, sat, val);
    setHue(nextHue);
    setPickerHex(nextHex);
    ensureColorSelected(hexToColorName(nextHex));
  };

  const generateCustomSku = () => {
    const prefix =
      (form.category || 'TPD')
        .replace(/[^a-zA-Z0-9]/g, '')
        .slice(0, 3)
        .toUpperCase() || 'TPD';
    const randomCode = Math.floor(100000 + Math.random() * 900000);
    setForm((current) => ({ ...current, sku: `${prefix}-${randomCode}` }));
  };

  const toggleBarcodeExpand = (itemId: string) => {
    setExpandedBarcodes((current) => ({
      ...current,
      [itemId]: !current[itemId],
    }));
  };

  const downloadBarcodePng = (item: InventoryItem) => {
    if (!item.sku) return;
    const container = document.getElementById(`barcode-label-${item.id}`);
    const svg = container?.querySelector('svg');
    if (!svg) return;

    const svgData = new XMLSerializer().serializeToString(svg);
    const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(svgBlob);

    const img = new Image();
    img.onload = () => {
      const padding = 20;
      const canvas = document.createElement('canvas');
      canvas.width = img.width + padding * 2;
      canvas.height = img.height + padding * 2;

      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, padding, padding);

        const pngUrl = canvas.toDataURL('image/png');
        const link = document.createElement('a');
        const safeSku = item.sku.replace(/[^a-zA-Z0-9_-]/g, '_');
        link.href = pngUrl;
        link.download = `barcode-${safeSku}.png`;
        link.click();
      }
      URL.revokeObjectURL(url);
    };
    img.src = url;
  };

  const printBarcodeLabel = (item: InventoryItem) => {
    if (!item.sku) return;
    const container = document.getElementById(`barcode-label-${item.id}`);
    if (!container) return;

    const printWin = window.open('', '_blank', 'width=420,height=320');
    if (!printWin) return;

    printWin.document.write(`
      <html>
        <head>
          <title>Barcode - ${item.sku}</title>
          <style>
            body {
              font-family: Arial, sans-serif;
              display: flex;
              flex-direction: column;
              align-items: center;
              justify-content: center;
              min-height: 100vh;
              margin: 0;
              background: #ffffff;
              color: #000000;
            }
            .name { font-size: 13px; font-weight: 700; margin-bottom: 4px; text-align: center; }
            .meta { font-size: 11px; color: #444; margin-bottom: 8px; }
          </style>
        </head>
        <body>
          <div class="name">${item.name}</div>
          <div class="meta">${item.category} &bull; Size: ${item.size}</div>
          ${container.innerHTML}
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
      setItems(
        itemData.map((row: any) => ({
          id: String(row.id),
          name: row.name || '',
          sku: row.sku || '',
          category: row.category || '',
          size: row.size || 'M',
          stock: Number(row.stock ?? 0),
          min: Number(row.min ?? 5),
          status: row.status || (Number(row.stock ?? 0) <= Number(row.min ?? 5) ? 'LOW' : 'OK'),
          colors: Array.isArray(row.colors) ? row.colors : [],
        }))
      );
    }

    const { data: catData } = await supabase.from('categories').select('*').order('created_at', { ascending: true });
    if (catData) {
      setCategories(catData.map((row: any) => ({ id: String(row.id), name: row.name })));
    }

    const { data: auditData } = await supabase.from('audit_logs').select('*').order('created_at', { ascending: false });
    if (auditData) {
      setAuditLog(
        auditData.map((row: any) => ({
          id: String(row.id),
          action: row.action,
          item: row.item,
          detail: row.detail,
          user: row.user,
          time: row.time,
        }))
      );
    }
  };

  useEffect(() => {
    if (!user) return;
    fetchData();

    const itemChannel = supabase.channel('public:items').on('postgres_changes', { event: '*', schema: 'public', table: 'items' }, fetchData).subscribe();
    const catChannel = supabase.channel('public:categories').on('postgres_changes', { event: '*', schema: 'public', table: 'categories' }, fetchData).subscribe();
    const auditChannel = supabase.channel('public:audit_logs').on('postgres_changes', { event: '*', schema: 'public', table: 'audit_logs' }, fetchData).subscribe();

    return () => {
      supabase.removeChannel(itemChannel);
      supabase.removeChannel(catChannel);
      supabase.removeChannel(auditChannel);
    };
  }, [user]);

  const logAudit = async (action: string, item: string, detail: string) => {
    const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    await supabase.from('audit_logs').insert([
      {
        action,
        item,
        detail,
        user: actorName,
        time: timestamp,
      },
    ]);
  };

  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      const matchesQuery = `${item.name} ${item.sku} ${(item.colors || []).join(' ')}`.toLowerCase().includes(query.toLowerCase());
      const matchesStatus = statusFilter === 'ALL' || item.status === statusFilter;
      const matchesCategory = categoryFilter === 'ALL' || item.category === categoryFilter;
      return matchesQuery && matchesStatus && matchesCategory;
    });
  }, [items, query, statusFilter, categoryFilter]);

  const chartData = useMemo(() => {
    const categoryTotals: Record<string, number> = {};
    items.forEach((item) => {
      categoryTotals[item.category] = (categoryTotals[item.category] || 0) + item.stock;
    });
    return Object.keys(categoryTotals).map((cat) => ({ category: cat, stock: categoryTotals[cat] }));
  }, [items]);

  const totalValue = items.reduce((sum, item) => sum + item.stock * 80, 0);
  const lowStockCount = items.filter((item) => item.status === 'LOW').length;

  const openCreateModal = () => {
    setEditingId(null);
    setForm({ name: '', sku: '', category: categories[0]?.name || 'Shirts', size: 'M', stock: '0', min: '5', colors: [] });
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
    setIsPickerOpen(false);
    setIsModalOpen(true);
  };

  const submitItem = async () => {
    const stockVal = Number(form.stock);
    const minVal = Number(form.min);
    const calculatedStatus = stockVal <= minVal ? 'LOW' : 'OK';

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

    if (editingId) {
      const { error } = await supabase.from('items').update(payload).eq('id', editingId);
      if (error) {
        alert('Error updating: ' + error.message);
        return;
      }
      await logAudit('EDIT ITEM', form.name, `Edited item details by ${actorName}`);
    } else {
      const { error } = await supabase.from('items').insert([payload]);
      if (error) {
        alert('Error creating: ' + error.message);
        return;
      }
      await logAudit('NEW ITEM', form.name, `Created new item by ${actorName}`);
    }

    await fetchData();
    setIsPickerOpen(false);
    setIsModalOpen(false);
  };

  const adjustStock = async (itemId: string, delta: number) => {
    const item = items.find((entry) => entry.id === itemId);
    if (!item) return;

    const nextStock = Math.max(0, item.stock + delta);
    const nextStatus = nextStock <= item.min ? 'LOW' : 'OK';

    const { error } = await supabase.from('items').update({ stock: nextStock, status: nextStatus }).eq('id', itemId);
    if (error) return;

    await logAudit(
      delta > 0 ? 'ADD STOCK' : 'REMOVE STOCK',
      item.name,
      `${delta > 0 ? '+' : ''}${delta} units (Now: ${nextStock}) by ${actorName}`
    );
    await fetchData();
  };

  const deleteItem = async (itemId: string) => {
    const item = items.find((entry) => entry.id === itemId);
    const { error } = await supabase.from('items').delete().eq('id', itemId);
    if (error) return;

    if (item) {
      await logAudit('REMOVE ITEM', item.name, `Removed item by ${actorName}`);
    }
    await fetchData();
  };

  const addCategory = async () => {
    const cleanName = newCategory.trim();
    if (!cleanName) return;

    if (categories.some((cat) => cat.name.toLowerCase() === cleanName.toLowerCase())) {
      alert('This category already exists.');
      return;
    }

    const { error } = await supabase.from('categories').insert([{ name: cleanName }]);
    if (error) {
      alert('Error adding category: ' + error.message);
      return;
    }

    await logAudit('ADD CATEGORY', cleanName, `Added category by ${actorName}`);
    setNewCategory('');
    await fetchData();
  };

  const deleteCategory = async (categoryId: string, categoryName: string) => {
    const hasItems = items.some((item) => item.category === categoryName);
    if (hasItems) {
      alert(`Cannot remove "${categoryName}" while inventory items are assigned to it.`);
      return;
    }

    const { error } = await supabase.from('categories').delete().eq('id', categoryId);
    if (error) {
      alert('Error deleting category: ' + error.message);
      return;
    }

    if (categoryFilter === categoryName) {
      setCategoryFilter('ALL');
    }

    await logAudit('REMOVE CATEGORY', categoryName, `Removed category by ${actorName}`);
    await fetchData();
  };

  const exportInventory = (format: 'csv' | 'xlsx') => {
    const rows = items.map((item) => ({ name: item.name, sku: item.sku, category: item.category, stock: item.stock, min: item.min, status: item.status }));
    if (format === 'csv') {
      const csv = Papa.unparse(rows);
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'inventory.csv';
      link.click();
      URL.revokeObjectURL(url);
      return;
    }

    const worksheet = XLSX.utils.json_to_sheet(rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Inventory');
    XLSX.writeFile(workbook, 'inventory.xlsx');
  };

  if (authLoading) {
    return (
      <main className={`flex min-h-screen items-center justify-center ${t.bg} ${t.text}`}>
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-zinc-600 border-t-white" />
          <p className={`text-sm ${t.textMuted}`}>Loading The Printing Depot...</p>
        </div>
      </main>
    );
  }

  if (!user) {
    return (
      <main className={`flex min-h-screen items-center justify-center px-4 py-10 ${t.bg} ${t.text} overflow-x-hidden`}>
        <div className={`w-full max-w-md rounded-3xl border ${t.border} ${t.cardBg2} p-6 sm:p-8 shadow-2xl transition-all duration-300`}>
          <div className="flex items-start justify-between">
            <div>
              <p className={`text-[10px] uppercase tracking-[0.35em] ${t.textMuted}`}>INVENTORY SYSTEM</p>
              <h1 className="mt-1 text-2xl font-black">THE PRINTING DEPOT</h1>
            </div>
            <button
              type="button"
              onClick={() => setDarkMode(!darkMode)}
              className={`rounded-2xl border ${t.border} ${t.cardBg} p-2.5 transition-all duration-200 hover:scale-105 active:scale-95`}
            >
              {darkMode ? <Sun size={18} className="text-yellow-300 transition-transform duration-300 hover:rotate-45" /> : <Moon size={18} className="text-zinc-700 transition-transform duration-300 hover:-rotate-12" />}
            </button>
          </div>

          <button
            type="button"
            onClick={handleGoogleLogin}
            className={`mt-6 flex w-full items-center justify-center gap-3 rounded-2xl border ${t.btnSecondary} px-4 py-3 text-sm font-semibold transition-all duration-200`}
          >
            Continue with Google
          </button>

          <div className="my-5 flex items-center gap-3">
            <div className={`h-px flex-1 border-t ${t.border}`} />
            <span className={`text-xs uppercase ${t.textMuted2}`}>or with email</span>
            <div className={`h-px flex-1 border-t ${t.border}`} />
          </div>

          {authError && <div className="mb-4 rounded-2xl border border-red-900/50 bg-red-950/40 px-4 py-3 text-xs text-red-300">{authError}</div>}
          {authMessage && <div className="mb-4 rounded-2xl border border-emerald-900/50 bg-emerald-950/40 px-4 py-3 text-xs text-emerald-300">{authMessage}</div>}

          <form onSubmit={handleManualAuth} className="space-y-4">
            <div>
              <label className={`mb-1.5 block text-xs font-medium ${t.textMuted}`}>Email Address</label>
              <div className={`flex items-center gap-2.5 rounded-2xl border ${t.border} ${t.inputBg} px-3.5 py-2.5 transition-colors duration-200 focus-within:border-zinc-500`}>
                <Mail size={16} className={iconClass} />
                <input type="email" required value={authEmail} onChange={(e) => setAuthEmail(e.target.value)} placeholder="name@printingdepot.ph" className={`w-full bg-transparent text-sm outline-none ${t.text}`} />
              </div>
            </div>

            <div>
              <label className={`mb-1.5 block text-xs font-medium ${t.textMuted}`}>Password</label>
              <div className={`flex items-center gap-2.5 rounded-2xl border ${t.border} ${t.inputBg} px-3.5 py-2.5 transition-colors duration-200 focus-within:border-zinc-500`}>
                <Lock size={16} className={iconClass} />
                <input type="password" required minLength={6} value={authPassword} onChange={(e) => setAuthPassword(e.target.value)} placeholder="••••••••" className={`w-full bg-transparent text-sm outline-none ${t.text}`} />
              </div>
            </div>

            <button type="submit" disabled={authSubmitting} className={`w-full rounded-2xl border ${t.btnPrimary} px-4 py-3 text-sm font-semibold transition-all duration-200 disabled:opacity-50`}>
              {authSubmitting ? 'Please wait...' : authMode === 'login' ? 'Log In' : 'Create Account'}
            </button>
          </form>

          <div className="mt-6 text-center text-sm">
            {authMode === 'login' ? (
              <p className={t.textMuted}>
                Don&apos;t have an account?{' '}
                <button type="button" onClick={() => setAuthMode('signup')} className="font-semibold underline underline-offset-4 transition-opacity hover:opacity-80 active:scale-95">Create account</button>
              </p>
            ) : (
              <p className={t.textMuted}>
                Already have an account?{' '}
                <button type="button" onClick={() => setAuthMode('login')} className="font-semibold underline underline-offset-4 transition-opacity hover:opacity-80 active:scale-95">Log in</button>
              </p>
            )}
          </div>
        </div>
      </main>
    );
  }

  const allSelectableColors = Array.from(new Set([...colorOptions, ...form.colors]));
  const currentHueHex = hsvToHex(hue, 1, 1);
  const currentMatchedName = hexToColorName(pickerHex);

  return (
    <main className={`min-h-screen ${t.bg} ${t.text} transition-colors duration-300 overflow-x-hidden`}>
      <div className="mx-auto flex max-w-7xl flex-col gap-6 px-3 sm:px-6 lg:px-8 py-4 sm:py-6">
        <header className={`flex flex-col gap-4 rounded-3xl border ${t.border} ${t.cardBg} p-4 sm:p-5 shadow-2xl transition-colors duration-300 lg:flex-row lg:items-center lg:justify-between`}>
          <div className="flex items-center justify-between lg:justify-start lg:gap-4">
            <div className="min-w-0 flex-1">
              <p className={`text-[10px] sm:text-xs uppercase tracking-[0.35em] ${t.textMuted}`}>INVENTORY MANAGEMENT SYSTEM</p>
              <h1 className="mt-1 text-lg sm:text-2xl font-black lg:text-3xl truncate">THE PRINTING DEPOT</h1>
              <p className={`mt-1 text-xs ${t.textMuted} truncate`}>Signed in as <span className="font-semibold">{actorName}</span></p>
            </div>
            <div className="flex items-center gap-2 lg:hidden shrink-0">
              <button onClick={() => setDarkMode(!darkMode)} className={`rounded-2xl border ${t.border} ${t.cardBg2} p-2.5 transition-all duration-200 hover:scale-105 active:scale-95`}>
                {darkMode ? <Sun size={18} className="text-yellow-300 transition-transform duration-300 hover:rotate-45" /> : <Moon size={18} className="text-zinc-700 transition-transform duration-300 hover:-rotate-12" />}
              </button>
              <button onClick={handleLogout} className={`rounded-2xl border ${t.border} ${t.cardBg2} p-2.5 text-red-400 transition-all duration-200 hover:scale-105 hover:border-red-500/50 active:scale-95`}>
                <LogOut size={18} />
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center sm:gap-3">
            <button onClick={() => setDarkMode(!darkMode)} className={`hidden rounded-2xl border ${t.border} ${t.cardBg2} p-2.5 transition-all duration-200 hover:scale-105 active:scale-95 lg:block`}>
              {darkMode ? <Sun size={18} className="text-yellow-300 transition-transform duration-300 hover:rotate-45" /> : <Moon size={18} className="text-zinc-700 transition-transform duration-300 hover:-rotate-12" />}
            </button>
            <button
              type="button"
              onClick={() => setIsScannerOpen(true)}
              title="Scan Barcode"
              className={`group rounded-2xl border ${t.btnSecondary} px-3.5 py-3 sm:py-2.5 text-xs sm:text-sm font-semibold transition-all duration-200 flex items-center justify-center gap-2`}
            >
              <BarcodeScanIcon className="h-4 w-4 transition-transform duration-200 group-hover:scale-110" />
              <span>Scan</span>
            </button>
            <button onClick={openCreateModal} className={`group rounded-2xl border ${t.btnPrimary} px-4 py-3 sm:py-2.5 text-sm font-semibold transition-all duration-200 flex items-center justify-center gap-2`}>
              <Plus size={16} className="transition-transform duration-200 group-hover:rotate-90" /> New Item
            </button>
            <button onClick={() => exportInventory('csv')} className={`group rounded-2xl border ${t.btnSecondary} px-3 sm:px-4 py-3 sm:py-2.5 text-xs sm:text-sm font-semibold transition-all duration-200 flex items-center justify-center gap-1.5 sm:gap-2`}>
              <Download size={15} className="transition-transform duration-200 group-hover:translate-y-0.5" /> Export CSV
            </button>
            <button onClick={() => exportInventory('xlsx')} className={`group rounded-2xl border ${t.btnSecondary} px-3 sm:px-4 py-3 sm:py-2.5 text-xs sm:text-sm font-semibold transition-all duration-200 flex items-center justify-center gap-1.5 sm:gap-2`}>
              <BarChart3 size={15} className="transition-transform duration-200 group-hover:scale-110" /> Export XLSX
            </button>
            <button onClick={handleLogout} className={`group hidden lg:flex rounded-2xl border ${t.btnSecondary} px-4 py-2.5 text-sm font-semibold text-red-400 transition-all duration-200 items-center justify-center gap-2`}>
              <LogOut size={15} className="transition-transform duration-200 group-hover:translate-x-0.5" /> Sign Out
            </button>
          </div>
        </header>

        <section className="grid grid-cols-2 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[
            { label: 'Total Items', value: items.length, icon: Package2 },
            { label: 'Inventory Value', value: `₱${totalValue.toLocaleString()}`, icon: TrendingUp },
            { label: 'Low Stock', value: lowStockCount, icon: Box },
            { label: 'Categories', value: categories.length, icon: Warehouse },
          ].map((card) => (
            <div key={card.label} className={`group rounded-3xl border ${t.border} ${t.cardBg2} p-4 sm:p-5 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-xl`}>
              <div className="flex items-center justify-between">
                <p className={`text-xs sm:text-sm ${t.textMuted}`}>{card.label}</p>
                <card.icon className={`h-4 w-4 sm:h-5 sm:w-5 ${iconClass} transition-transform duration-200 group-hover:scale-110`} />
              </div>
              <p className="mt-3 sm:mt-4 text-xl sm:text-3xl font-black truncate">{card.value}</p>
            </div>
          ))}
        </section>

        <section className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
          <div className={`rounded-3xl border ${t.border} ${t.cardBg2} p-4 sm:p-5 overflow-hidden transition-all duration-200 hover:shadow-xl`}>
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-lg sm:text-xl font-bold">Stock by category</h2>
                <p className={`text-xs sm:text-sm ${t.textMuted}`}>Visual snapshot of inventory depth</p>
              </div>
            </div>
            <div className="h-64 sm:h-72 w-full min-w-0">
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
          </div>

          <div className={`rounded-3xl border ${t.border} ${t.cardBg2} p-4 sm:p-5 transition-all duration-200 hover:shadow-xl`}>
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-lg sm:text-xl font-bold">Recent audit activity</h2>
                <p className={`text-xs sm:text-sm ${t.textMuted}`}>Latest inventory events</p>
              </div>
              <div className={`rounded-full border ${t.border} px-3 py-1 text-xs sm:text-sm ${t.textMuted}`}>{auditLog.length} updates</div>
            </div>
            <div className="space-y-3 max-h-72 overflow-y-auto pr-1">
              {auditLog.length === 0 ? (
                <p className={`text-sm ${t.textMuted} py-6 text-center`}>No audit events recorded yet.</p>
              ) : (
                auditLog.map((entry) => (
                  <div key={entry.id} className={`flex items-center justify-between gap-3 rounded-2xl border ${t.border} ${t.cardBg3} p-3 transition-all duration-200 hover:translate-x-0.5`}>
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-xs sm:text-sm truncate">{entry.item}</p>
                      <p className={`text-[11px] sm:text-xs ${t.textMuted} truncate`}>{entry.detail}</p>
                      {entry.user && <p className="mt-0.5 text-[10px] font-medium text-emerald-400 truncate">By: {entry.user}</p>}
                    </div>
                    <div className={`text-right text-[11px] sm:text-xs ${t.textMuted2} shrink-0`}>
                      <p className="font-semibold">{entry.action}</p>
                      <p>{entry.time}</p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </section>

        <section className="grid gap-6 xl:grid-cols-[1.4fr_0.6fr]">
          <div className={`rounded-3xl border ${t.border} ${t.cardBg2} p-4 sm:p-5`}>
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h2 className="text-xl sm:text-2xl font-black">Inventory overview</h2>
                <p className={`text-sm ${t.textMuted}`}>Responsive table with database sync</p>
              </div>
              <div className="flex flex-col gap-2.5 sm:flex-row sm:flex-wrap sm:items-center">
                <label className={`flex items-center gap-2 rounded-2xl border ${t.border} ${t.cardBg3} px-3 py-2 transition-colors duration-200 focus-within:border-zinc-500`}>
                  <Search size={16} className={iconClass} />
                  <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search item, SKU or color" className={`w-full bg-transparent text-sm outline-none sm:w-48 ${t.text}`} />
                </label>
                <button
                  type="button"
                  onClick={() => setIsScannerOpen(true)}
                  title="Scan Barcode"
                  className={`group inline-flex items-center justify-center gap-2 rounded-2xl border ${t.btnSecondary} px-3.5 py-2 text-sm font-semibold transition-all duration-150`}
                >
                  <BarcodeScanIcon className="h-4 w-4 transition-transform duration-150 group-hover:scale-110" />
                  <span>Scan</span>
                </button>
                <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className={`cursor-pointer rounded-2xl border ${t.border} ${t.inputBg} px-3 py-2 text-sm ${t.text} transition-colors duration-200 hover:border-zinc-500`}>
                  <option value="ALL">All status</option>
                  <option value="LOW">Low</option>
                  <option value="OK">Ok</option>
                </select>
                <select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)} className={`cursor-pointer rounded-2xl border ${t.border} ${t.inputBg} px-3 py-2 text-sm ${t.text} transition-colors duration-200 hover:border-zinc-500`}>
                  <option value="ALL">All categories</option>
                  {categories.map((category) => (
                    <option key={category.id} value={category.name}>{category.name}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className={`mt-6 flex gap-2 border-b ${t.border} pb-3 text-sm`}>
              <button onClick={() => setActiveTab('inventory')} className={`rounded-full px-4 py-1.5 font-medium transition-all duration-200 active:scale-95 ${activeTab === 'inventory' ? t.tabActive : t.tabInactive}`}>Inventory</button>
              <button onClick={() => setActiveTab('audit')} className={`rounded-full px-4 py-1.5 font-medium transition-all duration-200 active:scale-95 ${activeTab === 'audit' ? t.tabActive : t.tabInactive}`}>Audit Log ({auditLog.length})</button>
            </div>

            {activeTab === 'inventory' ? (
              <div className="mt-5 space-y-3">
                {filteredItems.map((item) => {
                  const isExpanded = Boolean(expandedBarcodes[item.id]);
                  return (
                    <div key={item.id} className={`rounded-2xl border ${t.border} ${t.cardBgHover} p-3.5 sm:p-4 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg`}>
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="font-semibold text-sm sm:text-base truncate">{item.name}</p>
                          <p className={`text-xs ${t.textMuted2} truncate`}>{item.sku}</p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className={`rounded-full border ${t.badgeBg} px-2 py-0.5 text-[11px]`}>{item.category}</span>
                          <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold transition-transform duration-200 hover:scale-105 ${item.status === 'LOW' ? t.lowBg : t.okBg}`}>{item.status}</span>
                        </div>
                      </div>

                      <div className="mt-3 flex items-center justify-between gap-4">
                        <div className="flex-1">
                          <div className="flex justify-between text-xs mb-1">
                            <span className={t.textMuted}>Stock: <strong className={t.text}>{item.stock}</strong></span>
                            <span className={t.textMuted}>Min: {item.min}</span>
                          </div>
                          <div className={`h-2 w-full rounded-full overflow-hidden ${t.progressBg}`}>
                            <div className={`h-2 rounded-full transition-all duration-500 ease-out ${t.progressFill}`} style={{ width: `${Math.min(100, (item.stock / Math.max(item.min, 1)) * 100)}%` }} />
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0 pt-3">
                          <button onClick={() => adjustStock(item.id, -1)} className={`rounded-full border ${t.border} px-2.5 py-1 text-xs font-semibold transition-all duration-150 hover:scale-110 hover:bg-zinc-800 hover:text-white active:scale-90`}>-</button>
                          <button onClick={() => adjustStock(item.id, 1)} className={`rounded-full border ${t.border} px-2.5 py-1 text-xs font-semibold transition-all duration-150 hover:scale-110 hover:bg-zinc-800 hover:text-white active:scale-90`}>+</button>
                          <button onClick={() => openEditModal(item)} className={`rounded-full border ${t.border} p-1.5 transition-all duration-150 hover:scale-110 hover:bg-zinc-800 hover:text-white active:scale-90`}><Edit3 size={13} /></button>
                          <button onClick={() => deleteItem(item.id)} className={`rounded-full border ${t.border} p-1.5 text-red-400 transition-all duration-150 hover:scale-110 hover:bg-red-950/60 active:scale-90`}><Trash2 size={13} /></button>
                        </div>
                      </div>

                      {(item.colors || []).length > 0 && (
                        <div className="mt-3 flex flex-wrap gap-1.5 pt-2 border-t border-zinc-800/40">
                          {(item.colors || []).map((color) => (
                            <span key={color} className={`group flex items-center gap-2 rounded-full border ${t.badgeBg} px-2.5 py-0.5 text-[11px] transition-transform duration-150 hover:scale-105`}>
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
                              className={`inline-flex items-center gap-1.5 rounded-xl border ${t.border} ${t.cardBg3} px-2.5 py-1 text-[11px] font-medium ${t.textMuted} transition-all duration-150 hover:scale-105 active:scale-95`}
                            >
                              {isExpanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                              <span>{isExpanded ? 'Minimize Barcode' : 'Show Barcode'}</span>
                            </button>

                            <div className="flex flex-wrap items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => downloadBarcodePng(item)}
                                className={`inline-flex items-center gap-1.5 rounded-xl border ${t.btnSecondary} px-2.5 py-1 text-[11px] font-semibold transition-all duration-150`}
                              >
                                <Download size={12} />
                                <span>Download</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => printBarcodeLabel(item)}
                                className={`inline-flex items-center gap-1.5 rounded-xl border ${t.btnSecondary} px-2.5 py-1 text-[11px] font-semibold transition-all duration-150`}
                              >
                                <Printer size={12} />
                                <span>Print Barcode</span>
                              </button>
                            </div>
                          </div>

                          <div className={isExpanded ? 'mt-2.5 block' : 'hidden'}>
                            <div id={`barcode-label-${item.id}`} className="inline-block rounded-xl bg-white px-2.5 py-1.5 text-black shadow-sm">
                              <Barcode
                                value={item.sku}
                                format="CODE128"
                                height={32}
                                width={1.3}
                                fontSize={11}
                                margin={2}
                              />
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className={`mt-5 space-y-3 rounded-2xl border ${t.border} ${t.cardBg3} p-4 max-h-[500px] overflow-y-auto`}>
                {auditLog.map((entry) => (
                  <div key={entry.id} className={`flex items-center justify-between gap-3 rounded-2xl border ${t.border} ${t.cardBgHover} p-3 transition-all duration-200 hover:translate-x-0.5`}>
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-sm truncate">{entry.item}</p>
                      <p className={`text-xs ${t.textMuted} truncate`}>{entry.detail}</p>
                      {entry.user && <p className="mt-0.5 text-[11px] font-medium text-emerald-400 truncate">Handled by: {entry.user}</p>}
                    </div>
                    <div className={`text-right text-xs ${t.textMuted2} shrink-0`}>
                      <p className="font-semibold">{entry.action}</p>
                      <p>{entry.time}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-6">
            <div className={`rounded-3xl border ${t.border} ${t.cardBg2} p-4 sm:p-5`}>
              <h3 className="text-lg font-bold">Category manager</h3>
              <p className={`mt-1 text-sm ${t.textMuted}`}>Keep the assortment neatly organized.</p>
              <div className="mt-4 flex gap-2">
                <input value={newCategory} onChange={(event) => setNewCategory(event.target.value)} placeholder="New category" className={`flex-1 rounded-2xl border ${t.border} ${t.inputBg} px-3 py-2 text-sm outline-none transition-colors duration-200 focus:border-zinc-500 ${t.text}`} />
                <button onClick={addCategory} className={`rounded-2xl border ${t.btnPrimary} px-3 py-2 text-sm font-semibold transition-all duration-200`}>Add</button>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                {categories.map((category) => (
                  <span key={category.id} className={`inline-flex items-center gap-1.5 rounded-full border ${t.badgeBg} py-1 pr-2 pl-3 text-sm transition-transform duration-150 hover:scale-105`}>
                    <span>{category.name}</span>
                    <button type="button" onClick={() => deleteCategory(category.id, category.name)} title={`Remove ${category.name}`} className="rounded-full p-0.5 transition-all duration-150 hover:scale-125 hover:text-red-400 active:scale-90">
                      <X size={13} />
                    </button>
                  </span>
                ))}
              </div>
            </div>

            <div className={`rounded-3xl border ${t.border} ${t.cardBg2} p-4 sm:p-5`}>
              <h3 className="text-lg font-bold">Needs restocking</h3>
              <div className="mt-4 space-y-2">
                {items.filter((item) => item.status === 'LOW').map((item) => (
                  <div key={item.id} className={`rounded-2xl border ${t.needsRestockBorder} ${t.needsRestockBg} p-3 text-sm transition-all duration-200 hover:-translate-y-0.5`}>
                    <p className="font-semibold">{item.name}</p>
                    <p className={`${t.textMuted}`}>{item.sku} &bull; {item.stock} in stock</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>
      </div>

      {isScannerOpen && (
        <div className={`fixed inset-0 z-50 flex items-center justify-center ${t.overlay} p-3 sm:p-4 overflow-y-auto transition-opacity duration-200`}>
          <div className={`my-auto w-full max-w-md rounded-3xl border ${t.modalBg} p-4 sm:p-6 shadow-2xl transition-all duration-200`}>
            <div className="flex items-center justify-between">
              <div>
                <p className={`text-xs uppercase tracking-[0.3em] ${t.textMuted}`}>CAMERA SCANNER</p>
                <h3 className="text-xl font-black">Scan item barcode</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsScannerOpen(false)}
                className={`rounded-full border ${t.border} px-3 py-1 text-xs transition-all duration-150 hover:scale-105 active:scale-95`}
              >
                Close
              </button>
            </div>

            {scannerError && (
              <div className="mt-4 rounded-2xl border border-red-900/50 bg-red-950/40 px-4 py-3 text-xs text-red-300">
                {scannerError}
              </div>
            )}

            <div className={`mt-4 overflow-hidden rounded-2xl border ${t.border} bg-black`}>
              <div id="barcode-camera-reader" className="min-h-56 w-full" />
            </div>

            <p className={`mt-3 text-xs ${t.textMuted}`}>
              Point your phone or webcam at a printed barcode or QR code. Matching SKUs fill the search filter automatically.
            </p>
          </div>
        </div>
      )}

      {isModalOpen && (
        <div className={`fixed inset-0 z-50 flex items-center justify-center ${t.overlay} p-3 sm:p-4 overflow-y-auto transition-opacity duration-200`}>
          <div className={`my-auto max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-3xl border ${t.modalBg} p-4 sm:p-6 shadow-2xl transition-all duration-200`}>
            <div className="flex items-center justify-between">
              <div>
                <p className={`text-xs uppercase tracking-[0.3em] ${t.textMuted}`}>{editingId ? 'Edit item' : 'New item'}</p>
                <h3 className="text-xl sm:text-2xl font-black">Item details</h3>
              </div>
              <button onClick={() => setIsModalOpen(false)} className={`rounded-full border ${t.border} px-3 py-1 text-xs transition-all duration-150 hover:scale-105 active:scale-95`}>Close</button>
            </div>

            <div className="mt-5 grid gap-3 sm:gap-4 sm:grid-cols-2">
              <label className="text-sm">
                <span className={`mb-1.5 block ${t.textMuted}`}>Item Name</span>
                <input value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} className={`w-full rounded-2xl border ${t.border} ${t.inputBg} px-3 py-2 outline-none transition-colors duration-200 focus:border-zinc-500 ${t.text}`} />
              </label>
              <div className="text-sm">
                <div className="mb-1.5 flex items-center justify-between gap-2">
                  <span className={t.textMuted}>SKU / Barcode</span>
                  <button
                    type="button"
                    onClick={generateCustomSku}
                    className={`inline-flex items-center gap-1 rounded-xl border ${t.border} ${t.cardBg3} px-2 py-0.5 text-[11px] font-semibold transition-all duration-150 hover:scale-105 active:scale-95`}
                  >
                    <Sparkles size={11} />
                    <span>Auto SKU</span>
                  </button>
                </div>
                <input
                  value={form.sku}
                  onChange={(event) => setForm((current) => ({ ...current, sku: event.target.value }))}
                  placeholder="e.g. SHI-104920"
                  className={`w-full rounded-2xl border ${t.border} ${t.inputBg} px-3 py-2 outline-none transition-colors duration-200 focus:border-zinc-500 ${t.text}`}
                />
              </div>
              <label className="text-sm">
                <span className={`mb-1.5 block ${t.textMuted}`}>Category</span>
                <select value={form.category} onChange={(event) => setForm((current) => ({ ...current, category: event.target.value }))} className={`w-full rounded-2xl border ${t.border} ${t.inputBg} px-3 py-2 outline-none transition-colors duration-200 focus:border-zinc-500 ${t.text}`}>
                  {categories.map((category) => (
                    <option key={category.id} value={category.name}>{category.name}</option>
                  ))}
                </select>
              </label>
              <label className="text-sm">
                <span className={`mb-1.5 block ${t.textMuted}`}>Size</span>
                <input value={form.size} onChange={(event) => setForm((current) => ({ ...current, size: event.target.value }))} className={`w-full rounded-2xl border ${t.border} ${t.inputBg} px-3 py-2 outline-none transition-colors duration-200 focus:border-zinc-500 ${t.text}`} />
              </label>
              <label className="text-sm">
                <span className={`mb-1.5 block ${t.textMuted}`}>Current Stock</span>
                <input type="number" value={form.stock} onChange={(event) => setForm((current) => ({ ...current, stock: event.target.value }))} className={`w-full rounded-2xl border ${t.border} ${t.inputBg} px-3 py-2 outline-none transition-colors duration-200 focus:border-zinc-500 ${t.text}`} />
              </label>
              <label className="text-sm">
                <span className={`mb-1.5 block ${t.textMuted}`}>Low Stock Threshold</span>
                <input type="number" value={form.min} onChange={(event) => setForm((current) => ({ ...current, min: event.target.value }))} className={`w-full rounded-2xl border ${t.border} ${t.inputBg} px-3 py-2 outline-none transition-colors duration-200 focus:border-zinc-500 ${t.text}`} />
              </label>
            </div>

            {form.sku.trim() && (
              <div className="mt-4">
                <span className={`mb-1.5 block text-xs ${t.textMuted}`}>Custom Barcode Preview</span>
                <div className="inline-block rounded-2xl bg-white px-3 py-2 text-black shadow-sm">
                  <Barcode
                    value={form.sku.trim()}
                    format="CODE128"
                    height={36}
                    width={1.4}
                    fontSize={12}
                    margin={2}
                  />
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
                      className={`group flex items-center gap-2 rounded-full border px-3 sm:px-4 py-1.5 text-xs sm:text-sm transition-all duration-150 hover:scale-105 active:scale-95 ${
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
                  onClick={() => setIsPickerOpen((open) => !open)}
                  className={`group inline-flex items-center gap-2 rounded-2xl border ${t.border} ${isPickerOpen ? t.cardBgHover : t.inputBg} px-3.5 py-2 text-xs sm:text-sm font-medium ${t.text} transition-all duration-150 hover:scale-105 active:scale-95`}
                >
                  <Palette size={15} className={`${iconClass} transition-transform duration-200 group-hover:rotate-12`} />
                  <span>Custom Color</span>
                </button>

                {isPickerOpen && (
                  <div className={`mt-2.5 w-full max-w-xs rounded-3xl border ${t.border} ${t.cardBg} p-4 shadow-2xl transition-all duration-200`}>
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
                            ensureColorSelected(currentMatchedName);
                            setIsPickerOpen(false);
                          }}
                          title={`Add ${currentMatchedName}`}
                          className={`rounded-xl border ${t.btnPrimary} p-1.5 transition-all duration-150 hover:scale-110 active:scale-90`}
                        >
                          <Check size={14} />
                        </button>
                        <button
                          type="button"
                          onClick={() => setIsPickerOpen(false)}
                          title="Close picker"
                          className={`rounded-xl border ${t.border} ${t.inputBg} p-1.5 ${t.textMuted} transition-all duration-150 hover:scale-110 active:scale-90`}
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
                        className="pointer-events-none absolute h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-lg transition-transform duration-75"
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
                        className={`h-3 w-full cursor-pointer appearance-none rounded-full border ${t.border} transition-opacity hover:opacity-95`}
                        style={{
                          background:
                            'linear-gradient(to right, #ff0000 0%, #ffff00 17%, #00ff00 33%, #00ffff 50%, #0000ff 67%, #ff00ff 83%, #ff0000 100%)',
                        }}
                      />
                    </div>

                    <div className="mt-3.5">
                      <p className={`mb-2 text-[11px] font-medium ${t.textMuted}`}>Quick Color Swatches</p>
                      <div className="grid grid-cols-6 gap-2">
                        {FEATURED_SWATCHES.map((swatchName) => {
                          const isSelected = form.colors.includes(swatchName);
                          return (
                            <button
                              key={swatchName}
                              type="button"
                              onClick={() => handleQuickSwatchSelect(swatchName)}
                              title={swatchName}
                              className={`flex h-8 w-8 items-center justify-center rounded-full border transition-all duration-150 hover:scale-110 active:scale-90 ${
                                isSelected ? 'ring-2 ring-emerald-400 border-white scale-105' : `${t.border}`
                              }`}
                              style={{ backgroundColor: getColorFill(swatchName) }}
                            >
                              {isSelected && (
                                <Check
                                  size={13}
                                  className={
                                    ['White', 'Cream', 'Yellow', 'Lime', 'Cyan', 'Sky Blue', 'Silver'].includes(swatchName)
                                      ? 'text-black'
                                      : 'text-white'
                                  }
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
              <button onClick={() => setIsModalOpen(false)} className={`rounded-2xl border ${t.btnSecondary} px-4 py-2 text-sm transition-all duration-200`}>Cancel</button>
              <button onClick={submitItem} className={`rounded-2xl border ${t.btnPrimary} px-4 py-2 text-sm font-semibold transition-all duration-200`}>Save</button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}