'use client';

import { supabase } from './supabase';
import type { User } from '@supabase/supabase-js';
import { useEffect, useMemo, useState } from 'react';
import {
  BarChart3,
  Box,
  Circle,
  Download,
  Edit3,
  Lock,
  LogOut,
  Mail,
  Moon,
  Package2,
  Plus,
  Search,
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
    btnPrimary: darkMode ? 'bg-white text-black border-zinc-700 hover:bg-zinc-100' : 'bg-black text-white border-zinc-400 hover:bg-zinc-800',
    btnSecondary: darkMode ? 'bg-zinc-900 text-white border-zinc-700 hover:bg-zinc-800' : 'bg-zinc-200 text-black border-zinc-300 hover:bg-zinc-300',
    tabActive: darkMode ? 'bg-white text-black' : 'bg-black text-white',
    tabInactive: darkMode ? 'bg-zinc-900 text-zinc-300' : 'bg-zinc-200 text-zinc-600',
    lowBg: darkMode ? 'bg-red-600/20 text-red-400 border-red-900/50' : 'bg-red-100 text-red-700 border-red-300',
    okBg: darkMode ? 'bg-emerald-600/20 text-emerald-400' : 'bg-emerald-100 text-emerald-700',
    progressBg: darkMode ? 'bg-zinc-800' : 'bg-zinc-300',
    progressFill: darkMode ? 'bg-white' : 'bg-black',
    chartStroke: darkMode ? '#27272a' : '#d4d4d8',
    chartAxis: darkMode ? '#a1a1aa' : '#52525b',
    overlay: darkMode ? 'bg-black/70' : 'bg-white/70',
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

  // Fetch Inventory, Categories, and Audit Logs from Supabase
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
        <div className={`w-full max-w-md rounded-3xl border ${t.border} ${t.cardBg2} p-6 sm:p-8 shadow-2xl`}>
          <div className="flex items-start justify-between">
            <div>
              <p className={`text-[10px] uppercase tracking-[0.35em] ${t.textMuted}`}>INVENTORY SYSTEM</p>
              <h1 className="mt-1 text-2xl font-black">THE PRINTING DEPOT</h1>
            </div>
            <button
              type="button"
              onClick={() => setDarkMode(!darkMode)}
              className={`rounded-2xl border ${t.border} ${t.cardBg} p-2.5 transition hover:scale-105`}
            >
              {darkMode ? <Sun size={18} className="text-yellow-300" /> : <Moon size={18} className="text-zinc-700" />}
            </button>
          </div>

          <button
            type="button"
            onClick={handleGoogleLogin}
            className={`mt-6 flex w-full items-center justify-center gap-3 rounded-2xl border ${t.btnSecondary} px-4 py-3 text-sm font-semibold transition`}
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
              <div className={`flex items-center gap-2.5 rounded-2xl border ${t.border} ${t.inputBg} px-3.5 py-2.5`}>
                <Mail size={16} className={iconClass} />
                <input type="email" required value={authEmail} onChange={(e) => setAuthEmail(e.target.value)} placeholder="name@printingdepot.ph" className={`w-full bg-transparent text-sm outline-none ${t.text}`} />
              </div>
            </div>

            <div>
              <label className={`mb-1.5 block text-xs font-medium ${t.textMuted}`}>Password</label>
              <div className={`flex items-center gap-2.5 rounded-2xl border ${t.border} ${t.inputBg} px-3.5 py-2.5`}>
                <Lock size={16} className={iconClass} />
                <input type="password" required minLength={6} value={authPassword} onChange={(e) => setAuthPassword(e.target.value)} placeholder="••••••••" className={`w-full bg-transparent text-sm outline-none ${t.text}`} />
              </div>
            </div>

            <button type="submit" disabled={authSubmitting} className={`w-full rounded-2xl border ${t.btnPrimary} px-4 py-3 text-sm font-semibold transition disabled:opacity-50`}>
              {authSubmitting ? 'Please wait...' : authMode === 'login' ? 'Log In' : 'Create Account'}
            </button>
          </form>

          <div className="mt-6 text-center text-sm">
            {authMode === 'login' ? (
              <p className={t.textMuted}>
                Don&apos;t have an account?{' '}
                <button type="button" onClick={() => setAuthMode('signup')} className="font-semibold underline underline-offset-4">Create account</button>
              </p>
            ) : (
              <p className={t.textMuted}>
                Already have an account?{' '}
                <button type="button" onClick={() => setAuthMode('login')} className="font-semibold underline underline-offset-4">Log in</button>
              </p>
            )}
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className={`min-h-screen ${t.bg} ${t.text} transition-colors duration-300 overflow-x-hidden`}>
      <div className="mx-auto flex max-w-7xl flex-col gap-6 px-3 sm:px-6 lg:px-8 py-4 sm:py-6">
        <header className={`flex flex-col gap-4 rounded-3xl border ${t.border} ${t.cardBg} p-4 sm:p-5 shadow-2xl lg:flex-row lg:items-center lg:justify-between`}>
          <div className="flex items-center justify-between lg:justify-start lg:gap-4">
            <div className="min-w-0 flex-1">
              <p className={`text-[10px] sm:text-xs uppercase tracking-[0.35em] ${t.textMuted}`}>INVENTORY MANAGEMENT SYSTEM</p>
              <h1 className="mt-1 text-lg sm:text-2xl font-black lg:text-3xl truncate">THE PRINTING DEPOT</h1>
              <p className={`mt-1 text-xs ${t.textMuted} truncate`}>Signed in as <span className="font-semibold">{actorName}</span></p>
            </div>
            <div className="flex items-center gap-2 lg:hidden shrink-0">
              <button onClick={() => setDarkMode(!darkMode)} className={`rounded-2xl border ${t.border} ${t.cardBg2} p-2.5 transition hover:scale-105`}>
                {darkMode ? <Sun size={18} className="text-yellow-300" /> : <Moon size={18} className="text-zinc-700" />}
              </button>
              <button onClick={handleLogout} className={`rounded-2xl border ${t.border} ${t.cardBg2} p-2.5 text-red-400 transition hover:scale-105`}>
                <LogOut size={18} />
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center sm:gap-3">
            <button onClick={() => setDarkMode(!darkMode)} className={`hidden rounded-2xl border ${t.border} ${t.cardBg2} p-2.5 transition hover:scale-105 lg:block`}>
              {darkMode ? <Sun size={18} className="text-yellow-300" /> : <Moon size={18} className="text-zinc-700" />}
            </button>
            <button onClick={openCreateModal} className={`col-span-2 sm:col-span-1 rounded-2xl border ${t.btnPrimary} px-4 py-3 sm:py-2.5 text-sm font-semibold transition flex items-center justify-center gap-2`}>
              <Plus size={16} /> New Item
            </button>
            <button onClick={() => exportInventory('csv')} className={`rounded-2xl border ${t.btnSecondary} px-3 sm:px-4 py-3 sm:py-2.5 text-xs sm:text-sm font-semibold transition flex items-center justify-center gap-1.5 sm:gap-2`}>
              <Download size={15} /> Export CSV
            </button>
            <button onClick={() => exportInventory('xlsx')} className={`rounded-2xl border ${t.btnSecondary} px-3 sm:px-4 py-3 sm:py-2.5 text-xs sm:text-sm font-semibold transition flex items-center justify-center gap-1.5 sm:gap-2`}>
              <BarChart3 size={15} /> Export XLSX
            </button>
            <button onClick={handleLogout} className={`hidden lg:flex rounded-2xl border ${t.btnSecondary} px-4 py-2.5 text-sm font-semibold text-red-400 transition items-center justify-center gap-2`}>
              <LogOut size={15} /> Sign Out
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
            <div key={card.label} className={`rounded-3xl border ${t.border} ${t.cardBg2} p-4 sm:p-5`}>
              <div className="flex items-center justify-between">
                <p className={`text-xs sm:text-sm ${t.textMuted}`}>{card.label}</p>
                <card.icon className={`h-4 w-4 sm:h-5 sm:w-5 ${iconClass}`} />
              </div>
              <p className="mt-3 sm:mt-4 text-xl sm:text-3xl font-black truncate">{card.value}</p>
            </div>
          ))}
        </section>

        <section className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
          <div className={`rounded-3xl border ${t.border} ${t.cardBg2} p-4 sm:p-5 overflow-hidden`}>
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

          <div className={`rounded-3xl border ${t.border} ${t.cardBg2} p-4 sm:p-5`}>
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
                  <div key={entry.id} className={`flex items-center justify-between gap-3 rounded-2xl border ${t.border} ${t.cardBg3} p-3`}>
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
              <div className="flex flex-col gap-2.5 sm:flex-row">
                <label className={`flex items-center gap-2 rounded-2xl border ${t.border} ${t.cardBg3} px-3 py-2`}>
                  <Search size={16} className={iconClass} />
                  <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search item, SKU or color" className={`w-full bg-transparent text-sm outline-none sm:w-56 ${t.text}`} />
                </label>
                <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className={`rounded-2xl border ${t.border} ${t.inputBg} px-3 py-2 text-sm ${t.text}`}>
                  <option value="ALL">All status</option>
                  <option value="LOW">Low</option>
                  <option value="OK">Ok</option>
                </select>
                <select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)} className={`rounded-2xl border ${t.border} ${t.inputBg} px-3 py-2 text-sm ${t.text}`}>
                  <option value="ALL">All categories</option>
                  {categories.map((category) => (
                    <option key={category.id} value={category.name}>{category.name}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className={`mt-6 flex gap-2 border-b ${t.border} pb-3 text-sm`}>
              <button onClick={() => setActiveTab('inventory')} className={`rounded-full px-4 py-1.5 transition font-medium ${activeTab === 'inventory' ? t.tabActive : t.tabInactive}`}>Inventory</button>
              <button onClick={() => setActiveTab('audit')} className={`rounded-full px-4 py-1.5 transition font-medium ${activeTab === 'audit' ? t.tabActive : t.tabInactive}`}>Audit Log ({auditLog.length})</button>
            </div>

            {activeTab === 'inventory' ? (
              <div className="mt-5 space-y-3">
                {filteredItems.map((item) => (
                  <div key={item.id} className={`rounded-2xl border ${t.border} ${t.cardBgHover} p-3.5 sm:p-4 transition`}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold text-sm sm:text-base truncate">{item.name}</p>
                        <p className={`text-xs ${t.textMuted2} truncate`}>{item.sku}</p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className={`rounded-full border ${t.badgeBg} px-2 py-0.5 text-[11px]`}>{item.category}</span>
                        <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${item.status === 'LOW' ? t.lowBg : t.okBg}`}>{item.status}</span>
                      </div>
                    </div>

                    <div className="mt-3 flex items-center justify-between gap-4">
                      <div className="flex-1">
                        <div className="flex justify-between text-xs mb-1">
                          <span className={t.textMuted}>Stock: <strong className={t.text}>{item.stock}</strong></span>
                          <span className={t.textMuted}>Min: {item.min}</span>
                        </div>
                        <div className={`h-2 w-full rounded-full ${t.progressBg}`}>
                          <div className={`h-2 rounded-full ${t.progressFill}`} style={{ width: `${Math.min(100, (item.stock / Math.max(item.min, 1)) * 100)}%` }} />
                        </div>
                      </div>

                      <div className="flex items-center gap-1 shrink-0 pt-3">
                        <button onClick={() => adjustStock(item.id, -1)} className={`rounded-full border ${t.border} px-2.5 py-1 text-xs transition hover:bg-zinc-800`}>-</button>
                        <button onClick={() => adjustStock(item.id, 1)} className={`rounded-full border ${t.border} px-2.5 py-1 text-xs transition hover:bg-zinc-800`}>+</button>
                        <button onClick={() => openEditModal(item)} className={`rounded-full border ${t.border} p-1.5 transition hover:bg-zinc-800`}><Edit3 size={13} /></button>
                        <button onClick={() => deleteItem(item.id)} className={`rounded-full border ${t.border} p-1.5 transition text-red-400 hover:bg-zinc-800`}><Trash2 size={13} /></button>
                      </div>
                    </div>

                    {(item.colors || []).length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-1.5 pt-2 border-t border-zinc-800/40">
                        {(item.colors || []).map((color) => (
                          <span key={color} className={`flex items-center gap-1.5 rounded-full border ${t.badgeBg} px-2 py-0.5 text-[11px]`}>
                            {color.startsWith('#') ? <span className="h-2 w-2 rounded-full border border-black/20" style={{ backgroundColor: color }} /> : <Circle size={8} fill="currentColor" />}
                            {color}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className={`mt-5 space-y-3 rounded-2xl border ${t.border} ${t.cardBg3} p-4 max-h-[500px] overflow-y-auto`}>
                {auditLog.map((entry) => (
                  <div key={entry.id} className={`flex items-center justify-between gap-3 rounded-2xl border ${t.border} ${t.cardBgHover} p-3`}>
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
                <input value={newCategory} onChange={(event) => setNewCategory(event.target.value)} placeholder="New category" className={`flex-1 rounded-2xl border ${t.border} ${t.inputBg} px-3 py-2 text-sm outline-none ${t.text}`} />
                <button onClick={addCategory} className={`rounded-2xl border ${t.btnPrimary} px-3 py-2 text-sm font-semibold transition`}>Add</button>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                {categories.map((category) => (
                  <span key={category.id} className={`inline-flex items-center gap-1.5 rounded-full border ${t.badgeBg} py-1 pr-2 pl-3 text-sm`}>
                    <span>{category.name}</span>
                    <button type="button" onClick={() => deleteCategory(category.id, category.name)} title={`Remove ${category.name}`} className="rounded-full p-0.5 transition hover:text-red-400">
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
                  <div key={item.id} className={`rounded-2xl border ${t.needsRestockBorder} ${t.needsRestockBg} p-3 text-sm`}>
                    <p className="font-semibold">{item.name}</p>
                    <p className={`${t.textMuted}`}>{item.sku} &bull; {item.stock} in stock</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>
      </div>

      {isModalOpen && (
        <div className={`fixed inset-0 z-50 flex items-center justify-center ${t.overlay} p-3 sm:p-4 overflow-y-auto`}>
          <div className={`my-auto max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-3xl border ${t.modalBg} p-4 sm:p-6 shadow-2xl`}>
            <div className="flex items-center justify-between">
              <div>
                <p className={`text-xs uppercase tracking-[0.3em] ${t.textMuted}`}>{editingId ? 'Edit item' : 'New item'}</p>
                <h3 className="text-xl sm:text-2xl font-black">Item details</h3>
              </div>
              <button onClick={() => setIsModalOpen(false)} className={`rounded-full border ${t.border} px-3 py-1 text-xs`}>Close</button>
            </div>

            <div className="mt-5 grid gap-3 sm:gap-4 sm:grid-cols-2">
              <label className="text-sm">
                <span className={`mb-1.5 block ${t.textMuted}`}>Item Name</span>
                <input value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} className={`w-full rounded-2xl border ${t.border} ${t.inputBg} px-3 py-2 outline-none ${t.text}`} />
              </label>
              <label className="text-sm">
                <span className={`mb-1.5 block ${t.textMuted}`}>SKU</span>
                <input value={form.sku} onChange={(event) => setForm((current) => ({ ...current, sku: event.target.value }))} className={`w-full rounded-2xl border ${t.border} ${t.inputBg} px-3 py-2 outline-none ${t.text}`} />
              </label>
              <label className="text-sm">
                <span className={`mb-1.5 block ${t.textMuted}`}>Category</span>
                <select value={form.category} onChange={(event) => setForm((current) => ({ ...current, category: event.target.value }))} className={`w-full rounded-2xl border ${t.border} ${t.inputBg} px-3 py-2 outline-none ${t.text}`}>
                  {categories.map((category) => (
                    <option key={category.id} value={category.name}>{category.name}</option>
                  ))}
                </select>
              </label>
              <label className="text-sm">
                <span className={`mb-1.5 block ${t.textMuted}`}>Size</span>
                <input value={form.size} onChange={(event) => setForm((current) => ({ ...current, size: event.target.value }))} className={`w-full rounded-2xl border ${t.border} ${t.inputBg} px-3 py-2 outline-none ${t.text}`} />
              </label>
              <label className="text-sm">
                <span className={`mb-1.5 block ${t.textMuted}`}>Current Stock</span>
                <input type="number" value={form.stock} onChange={(event) => setForm((current) => ({ ...current, stock: event.target.value }))} className={`w-full rounded-2xl border ${t.border} ${t.inputBg} px-3 py-2 outline-none ${t.text}`} />
              </label>
              <label className="text-sm">
                <span className={`mb-1.5 block ${t.textMuted}`}>Low Stock Threshold</span>
                <input type="number" value={form.min} onChange={(event) => setForm((current) => ({ ...current, min: event.target.value }))} className={`w-full rounded-2xl border ${t.border} ${t.inputBg} px-3 py-2 outline-none ${t.text}`} />
              </label>
            </div>

            <div className="mt-4">
              <label className="mb-2 block text-sm text-neutral-400">Colors</label>
              <div className="flex flex-wrap items-center gap-2">
                {colorOptions.map((color) => {
                  const isSelected = form.colors.includes(color);
                  return (
                    <button key={color} type="button" onClick={() => toggleColor(color)} className={`rounded-full border px-3 sm:px-4 py-1.5 text-xs sm:text-sm transition ${isSelected ? 'border-white bg-white font-medium text-black' : 'border-neutral-700 bg-transparent text-neutral-200'}`}>
                      {color}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button onClick={() => setIsModalOpen(false)} className={`rounded-2xl border ${t.btnSecondary} px-4 py-2 text-sm transition`}>Cancel</button>
              <button onClick={submitItem} className={`rounded-2xl border ${t.btnPrimary} px-4 py-2 text-sm font-semibold transition`}>Save</button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}