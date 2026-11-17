'use client';

import { supabase } from './supabase';
import { useEffect, useMemo, useState } from 'react';
import { BarChart3, Box, Circle, Download, Edit3, Moon, Package2, Plus, Search, Sun, Trash2, TrendingUp, Warehouse, X } from 'lucide-react';
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
  time: string;
};

type Category = {
  id: string;
  name: string;
};

const initialCategories: Category[] = [
  { id: 'cat-1', name: 'Shirts' },
  { id: 'cat-2', name: 'Jackets' },
  { id: 'cat-3', name: 'Accessories' },
];

const colorOptions = ['Black', 'White', 'Navy', 'Olive', 'Cream', 'Red', 'Khaki'];

export default function InventoryDashboard() {
  const [customColor, setCustomColor] = useState('#3b82f6');
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [categories, setCategories] = useState<Category[]>(initialCategories);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [categoryFilter, setCategoryFilter] = useState('ALL');
  const [activeTab, setActiveTab] = useState<'inventory' | 'audit'>('inventory');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: '', sku: '', category: 'Shirts', size: 'M', stock: '0', min: '5', colors: [] as string[] });
  const [auditLog, setAuditLog] = useState<AuditEntry[]>([]);
  const [newCategory, setNewCategory] = useState('');
  const [darkMode, setDarkMode] = useState(true);

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
    chipActive: darkMode ? 'border-white bg-white text-black' : 'border-black bg-black text-white',
    chipInactive: darkMode ? 'border-zinc-700 bg-zinc-900 text-zinc-300' : 'border-zinc-400 bg-zinc-100 text-zinc-600',
    needsRestockBg: darkMode ? 'bg-red-950/40' : 'bg-red-50',
    needsRestockBorder: darkMode ? 'border-red-900/50' : 'border-red-300',
  };

  const iconClass = darkMode ? 'text-zinc-500' : 'text-zinc-400';

  const toggleColor = (color: string) => {
    setForm((current) => ({
      ...current,
      colors: current.colors.includes(color)
        ? current.colors.filter((entry) => entry !== color)
        : [...current.colors, color],
    }));
  };

  const handleAddCustomColor = (hex: string) => {
    if (!form.colors.includes(hex)) {
      setForm((current) => ({
        ...current,
        colors: [...current.colors, hex],
      }));
    }
  };

  const fetchInventory = async () => {
    const { data, error } = await supabase.from('items').select('*').order('created_at', { ascending: false });
    if (error) {
      console.error('RAW SUPABASE ERROR:', error);
      console.error('STRINGIFIED:', JSON.stringify(error));
    } else if (data) {
      const formattedItems: InventoryItem[] = data.map((row: any) => ({
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
      setItems(formattedItems);
    }
  };

  useEffect(() => {
    fetchInventory();

    const channel = supabase
      .channel('inventory_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'items' }, () => {
        fetchInventory();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

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
    return Object.keys(categoryTotals).map((cat) => ({
      category: cat,
      stock: categoryTotals[cat],
    }));
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
      } else {
        setAuditLog((current) => [{ id: crypto.randomUUID(), action: 'UPDATE', item: form.name, detail: 'Item updated in database', time: 'Just now' }, ...current]);
      }
    } else {
      const { error } = await supabase.from('items').insert([payload]);
      if (error) {
        alert('Error creating: ' + error.message);
        return;
      } else {
        setAuditLog((current) => [{ id: crypto.randomUUID(), action: 'CREATE', item: form.name, detail: 'New item added to database', time: 'Just now' }, ...current]);
      }
    }

    await fetchInventory();
    setIsModalOpen(false);
  };

  const adjustStock = async (itemId: string, delta: number) => {
    const item = items.find((entry) => entry.id === itemId);
    if (!item) return;

    const nextStock = Math.max(0, item.stock + delta);
    const nextStatus = nextStock <= item.min ? 'LOW' : 'OK';

    const { error } = await supabase
      .from('items')
      .update({ stock: nextStock, status: nextStatus })
      .eq('id', itemId);

    if (error) return;

    setAuditLog((current) => [{ id: crypto.randomUUID(), action: 'STOCK_ADJUST', item: item.name, detail: `${delta > 0 ? '+' : ''}${delta} to ${nextStock}`, time: 'Just now' }, ...current]);
    await fetchInventory();
  };

  const deleteItem = async (itemId: string) => {
    const item = items.find((entry) => entry.id === itemId);
    const { error } = await supabase.from('items').delete().eq('id', itemId);

    if (error) return;

    if (item) {
      setAuditLog((current) => [{ id: crypto.randomUUID(), action: 'DELETE', item: item.name, detail: 'Item removed from database', time: 'Just now' }, ...current]);
    }
    await fetchInventory();
  };

  const addCategory = () => {
    const cleanName = newCategory.trim();
    if (!cleanName) return;
    setCategories((current) => [...current, { id: crypto.randomUUID(), name: cleanName }]);
    setNewCategory('');
  };

  const deleteCategory = (categoryId: string, categoryName: string) => {
    const hasItems = items.some((item) => item.category === categoryName);
    if (hasItems) {
      alert(`Cannot remove "${categoryName}" while inventory items are still assigned to it.`);
      return;
    }

    setCategories((current) => current.filter((cat) => cat.id !== categoryId));

    if (categoryFilter === categoryName) {
      setCategoryFilter('ALL');
    }

    setAuditLog((current) => [
      {
        id: crypto.randomUUID(),
        action: 'CATEGORY_DELETE',
        item: categoryName,
        detail: 'Category removed from manager',
        time: 'Just now',
      },
      ...current,
    ]);
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

  return (
    <main className={`min-h-screen ${t.bg} ${t.text} transition-colors duration-300`}>
      <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
        {/* Header */}
        <header className={`flex flex-col gap-4 rounded-3xl border ${t.border} ${t.cardBg} p-5 shadow-2xl shadow-black/40 lg:flex-row lg:items-center lg:justify-between`}>
          <div className="flex items-center justify-between lg:justify-start lg:gap-4">
            <div>
              <p className={`text-xs uppercase tracking-[0.35em] ${t.textMuted}`}>INVENTORY MANAGEMENT SYSTEM</p>
              <h1 className="mt-1 text-2xl font-black sm:text-3xl">THE PRINTING DEPOT</h1>
            </div>
            <button
              onClick={() => setDarkMode(!darkMode)}
              className={`rounded-2xl border ${t.border} ${t.cardBg2} p-2.5 transition hover:scale-105 lg:hidden`}
              title={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}
            >
              {darkMode ? <Sun size={18} className="text-yellow-300" /> : <Moon size={18} className="text-zinc-700" />}
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 sm:gap-3">
            <button
              onClick={() => setDarkMode(!darkMode)}
              className={`hidden rounded-2xl border ${t.border} ${t.cardBg2} p-2.5 transition hover:scale-105 lg:block`}
              title={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}
            >
              {darkMode ? <Sun size={18} className="text-yellow-300" /> : <Moon size={18} className="text-zinc-700" />}
            </button>
            <button onClick={openCreateModal} className={`flex-1 rounded-2xl border ${t.btnPrimary} px-4 py-2.5 text-sm font-semibold transition sm:flex-none`}>
              <span className="flex items-center justify-center gap-2"> <Plus size={16} /> New Item </span>
            </button>
            <button onClick={() => exportInventory('csv')} className={`flex-1 rounded-2xl border ${t.btnSecondary} px-4 py-2.5 text-sm font-semibold transition sm:flex-none`}>
              <span className="flex items-center justify-center gap-2"> <Download size={16} /> Export CSV </span>
            </button>
            <button onClick={() => exportInventory('xlsx')} className={`flex-1 rounded-2xl border ${t.btnSecondary} px-4 py-2.5 text-sm font-semibold transition sm:flex-none`}>
              <span className="flex items-center justify-center gap-2"> <BarChart3 size={16} /> Export XLSX </span>
            </button>
          </div>
        </header>

        {/* Stats Grid */}
        <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[
            { label: 'Total Items', value: items.length, icon: Package2 },
            { label: 'Inventory Value', value: `$${totalValue.toLocaleString()}`, icon: TrendingUp },
            { label: 'Low Stock', value: lowStockCount, icon: Box },
            { label: 'Categories', value: categories.length, icon: Warehouse },
          ].map((card) => (
            <div key={card.label} className={`rounded-3xl border ${t.border} ${t.cardBg2} p-5`}>
              <div className="flex items-center justify-between">
                <p className={`text-sm ${t.textMuted}`}>{card.label}</p>
                <card.icon className={`h-5 w-5 ${iconClass}`} />
              </div>
              <p className="mt-4 text-3xl font-black">{card.value}</p>
            </div>
          ))}
        </section>

        {/* Charts & Audit Section */}
        <section className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
          <div className={`rounded-3xl border ${t.border} ${t.cardBg2} p-5`}>
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold">Stock by category</h2>
                <p className={`text-sm ${t.textMuted}`}>Visual snapshot of inventory depth</p>
              </div>
              <div className={`rounded-full border ${t.border} px-3 py-1 text-sm ${t.textMuted}`}>{darkMode ? 'Dark' : 'Light'}</div>
            </div>
            <div className="h-72 w-full min-w-0">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={t.chartStroke} vertical={false} />
                  <XAxis dataKey="category" stroke={t.chartAxis} fontSize={12} tickLine={false} />
                  <YAxis stroke={t.chartAxis} fontSize={12} tickLine={false} />
                  <Tooltip
                    cursor={{ fill: 'rgba(255, 255, 255, 0.05)' }}
                    contentStyle={{
                      backgroundColor: darkMode ? '#18181b' : '#ffffff',
                      border: `1px solid ${darkMode ? '#27272a' : '#d4d4d8'}`,
                      color: darkMode ? '#ffffff' : '#000000',
                      borderRadius: '12px',
                    }}
                  />
                  <Bar dataKey="stock" fill={darkMode ? '#ffffff' : '#000000'} radius={[8, 8, 0, 0]} maxBarSize={48} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className={`rounded-3xl border ${t.border} ${t.cardBg2} p-5`}>
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold">Recent audit activity</h2>
                <p className={`text-sm ${t.textMuted}`}>Latest inventory events</p>
              </div>
              <div className={`rounded-full border ${t.border} px-3 py-1 text-sm ${t.textMuted}`}>{auditLog.length} updates</div>
            </div>
            <div className="space-y-3">
              {auditLog.slice(0, 4).map((entry) => (
                <div key={entry.id} className={`flex items-center justify-between rounded-2xl border ${t.border} ${t.cardBg3} p-3`}>
                  <div>
                    <p className="font-semibold">{entry.item}</p>
                    <p className={`text-sm ${t.textMuted}`}>{entry.detail}</p>
                  </div>
                  <div className={`text-right text-sm ${t.textMuted2}`}>
                    <p>{entry.action}</p>
                    <p>{entry.time}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Main Table & Sidebar Section */}
        <section className="grid gap-6 xl:grid-cols-[1.4fr_0.6fr]">
          <div className={`rounded-3xl border ${t.border} ${t.cardBg2} p-5`}>
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h2 className="text-2xl font-black">Inventory overview</h2>
                <p className={`text-sm ${t.textMuted}`}>Responsive table with database sync</p>
              </div>
              <div className="flex flex-col gap-3 sm:flex-row">
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
                  {categories.map((category) => <option key={category.id} value={category.name}>{category.name}</option>)}
                </select>
              </div>
            </div>

            <div className={`mt-6 flex gap-2 border-b ${t.border} pb-3 text-sm`}>
              <button onClick={() => setActiveTab('inventory')} className={`rounded-full px-3 py-1.5 transition ${activeTab === 'inventory' ? t.tabActive : t.tabInactive}`}>Inventory</button>
              <button onClick={() => setActiveTab('audit')} className={`rounded-full px-3 py-1.5 transition ${activeTab === 'audit' ? t.tabActive : t.tabInactive}`}>Audit Log</button>
            </div>

            {activeTab === 'inventory' ? (
              <div className="mt-5 overflow-x-auto">
                <div className="min-w-[760px] space-y-4">
                  <div className={`grid grid-cols-[1.4fr_0.9fr_0.9fr_0.6fr_0.7fr_0.7fr_0.7fr] gap-2 rounded-2xl border ${t.border} ${t.cardBg3} px-4 py-3 text-sm uppercase tracking-[0.2em] ${t.textMuted}`}>
                    <div>Item</div>
                    <div>Category</div>
                    <div>Stock</div>
                    <div>Min</div>
                    <div>Status</div>
                    <div>Adjust</div>
                    <div>Actions</div>
                  </div>

                  {filteredItems.map((item) => (
                    <div key={item.id} className={`rounded-2xl border ${t.border} ${t.cardBgHover} p-4`}>
                      <div className="grid grid-cols-[1.4fr_0.9fr_0.9fr_0.6fr_0.7fr_0.7fr_0.7fr] items-center gap-2">
                        <div>
                          <p className="font-semibold">{item.name}</p>
                          <p className={`text-sm ${t.textMuted2}`}>{item.sku}</p>
                        </div>
                        <div>
                          <span className={`rounded-full border ${t.badgeBg} px-2.5 py-1 text-xs`}>{item.category}</span>
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <div className={`h-2 w-full rounded-full ${t.progressBg}`}>
                              <div className={`h-2 rounded-full ${t.progressFill}`} style={{ width: `${Math.min(100, (item.stock / Math.max(item.min, 1)) * 100)}%` }} />
                            </div>
                            <span className="text-sm font-semibold">{item.stock}</span>
                          </div>
                        </div>
                        <div className={`text-sm ${t.textMuted}`}>{item.min}</div>
                        <div>
                          <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${item.status === 'LOW' ? t.lowBg : t.okBg}`}>{item.status}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <button onClick={() => adjustStock(item.id, -1)} className={`rounded-full border ${t.border} px-2 py-1 text-sm transition hover:${darkMode ? 'bg-zinc-800' : 'bg-zinc-200'}`}>-</button>
                          <button onClick={() => adjustStock(item.id, 1)} className={`rounded-full border ${t.border} px-2 py-1 text-sm transition hover:${darkMode ? 'bg-zinc-800' : 'bg-zinc-200'}`}>+</button>
                        </div>
                        <div className="flex items-center gap-2">
                          <button onClick={() => openEditModal(item)} className={`rounded-full border ${t.border} p-2 transition hover:${darkMode ? 'bg-zinc-800' : 'bg-zinc-200'}`}><Edit3 size={14} /></button>
                          <button onClick={() => deleteItem(item.id)} className={`rounded-full border ${t.border} p-2 transition hover:${darkMode ? 'bg-zinc-800' : 'bg-zinc-200'}`}><Trash2 size={14} /></button>
                        </div>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {(item.colors || []).map((color) => (
                          <span key={color} className={`flex items-center gap-2 rounded-full border ${t.badgeBg} px-2.5 py-1 text-xs`}>
                            {color.startsWith('#') ? (
                              <span className="w-2.5 h-2.5 rounded-full border border-black/20" style={{ backgroundColor: color }} />
                            ) : (
                              <Circle size={10} fill="currentColor" />
                            )}
                            {color}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className={`mt-5 space-y-3 rounded-2xl border ${t.border} ${t.cardBg3} p-4`}>
                {auditLog.map((entry) => (
                  <div key={entry.id} className={`flex items-center justify-between rounded-2xl border ${t.border} ${t.cardBgHover} p-3`}>
                    <div>
                      <p className="font-semibold">{entry.item}</p>
                      <p className={`text-sm ${t.textMuted}`}>{entry.detail}</p>
                    </div>
                    <div className={`text-right text-sm ${t.textMuted2}`}>
                      <p>{entry.action}</p>
                      <p>{entry.time}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-6">
            <div className={`rounded-3xl border ${t.border} ${t.cardBg2} p-5`}>
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
                    <button
                      type="button"
                      onClick={() => deleteCategory(category.id, category.name)}
                      title={`Remove ${category.name}`}
                      className={`rounded-full p-0.5 transition ${
                        darkMode ? 'hover:bg-zinc-800 hover:text-red-400' : 'hover:bg-zinc-200 hover:text-red-600'
                      }`}
                    >
                      <X size={13} />
                    </button>
                  </span>
                ))}
              </div>
            </div>

            <div className={`rounded-3xl border ${t.border} ${t.cardBg2} p-5`}>
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

      {/* Modal with responsive max-height and scrolling */}
      {isModalOpen ? (
        <div className={`fixed inset-0 z-50 flex items-center justify-center ${t.overlay} p-4`}>
          <div className={`max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-3xl border ${t.modalBg} p-6 shadow-2xl`}>
            <div className="flex items-center justify-between">
              <div>
                <p className={`text-sm uppercase tracking-[0.3em] ${t.textMuted}`}>{editingId ? 'Edit item' : 'New item'}</p>
                <h3 className="text-2xl font-black">Item details</h3>
              </div>
              <button onClick={() => setIsModalOpen(false)} className={`rounded-full border ${t.border} px-3 py-1 text-sm`}>Close</button>
            </div>

            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              <label className="text-sm">
                <span className={`mb-2 block ${t.textMuted}`}>Item Name</span>
                <input value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} className={`w-full rounded-2xl border ${t.border} ${t.inputBg} px-3 py-2 outline-none ${t.text}`} />
              </label>
              <label className="text-sm">
                <span className={`mb-2 block ${t.textMuted}`}>SKU</span>
                <input value={form.sku} onChange={(event) => setForm((current) => ({ ...current, sku: event.target.value }))} className={`w-full rounded-2xl border ${t.border} ${t.inputBg} px-3 py-2 outline-none ${t.text}`} />
              </label>
              <label className="text-sm">
                <span className={`mb-2 block ${t.textMuted}`}>Category</span>
                <select value={form.category} onChange={(event) => setForm((current) => ({ ...current, category: event.target.value }))} className={`w-full rounded-2xl border ${t.border} ${t.inputBg} px-3 py-2 outline-none ${t.text}`}>
                  {categories.map((category) => <option key={category.id} value={category.name}>{category.name}</option>)}
                </select>
              </label>
              <label className="text-sm">
                <span className={`mb-2 block ${t.textMuted}`}>Size</span>
                <input value={form.size} onChange={(event) => setForm((current) => ({ ...current, size: event.target.value }))} className={`w-full rounded-2xl border ${t.border} ${t.inputBg} px-3 py-2 outline-none ${t.text}`} />
              </label>
              <label className="text-sm">
                <span className={`mb-2 block ${t.textMuted}`}>Current Stock</span>
                <input type="number" value={form.stock} onChange={(event) => setForm((current) => ({ ...current, stock: event.target.value }))} className={`w-full rounded-2xl border ${t.border} ${t.inputBg} px-3 py-2 outline-none ${t.text}`} />
              </label>
              <label className="text-sm">
                <span className={`mb-2 block ${t.textMuted}`}>Low Stock Threshold</span>
                <input type="number" value={form.min} onChange={(event) => setForm((current) => ({ ...current, min: event.target.value }))} className={`w-full rounded-2xl border ${t.border} ${t.inputBg} px-3 py-2 outline-none ${t.text}`} />
              </label>
            </div>

            <div className="mt-4">
              <label className="block text-sm text-neutral-400 mb-2">Colors</label>
              <div className="flex flex-wrap items-center gap-2">
                {colorOptions.map((color) => {
                  const isSelected = form.colors.includes(color);
                  return (
                    <button
                      key={color}
                      type="button"
                      onClick={() => toggleColor(color)}
                      className={`px-4 py-1.5 rounded-full text-sm border transition ${
                        isSelected
                          ? 'bg-white text-black border-white font-medium'
                          : 'bg-transparent text-neutral-200 border-neutral-700 hover:border-neutral-500'
                      }`}
                    >
                      {color}
                    </button>
                  );
                })}

                {form.colors
                  .filter((c) => c.startsWith('#'))
                  .map((hex) => (
                    <button
                      key={hex}
                      type="button"
                      onClick={() => toggleColor(hex)}
                      className="flex items-center gap-2 px-3 py-1.5 rounded-full text-sm bg-white text-black border border-white font-medium"
                    >
                      <span
                        className="w-3 h-3 rounded-full border border-black/20"
                        style={{ backgroundColor: hex }}
                      />
                      {hex}
                    </button>
                  ))}

                <label className="flex items-center gap-2 px-4 py-1.5 rounded-full text-sm border border-dashed border-neutral-600 text-neutral-300 hover:border-neutral-400 cursor-pointer transition">
                  <input
                    type="color"
                    value={customColor}
                    onChange={(e) => setCustomColor(e.target.value)}
                    onBlur={(e) => handleAddCustomColor(e.target.value)}
                    className="w-4 h-4 bg-transparent border-0 cursor-pointer p-0"
                  />
                  <span>+ Custom</span>
                </label>
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button onClick={() => setIsModalOpen(false)} className={`rounded-2xl border ${t.btnSecondary} px-4 py-2 text-sm transition`}>Cancel</button>
              <button onClick={submitItem} className={`rounded-2xl border ${t.btnPrimary} px-4 py-2 text-sm font-semibold transition`}>Save</button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}