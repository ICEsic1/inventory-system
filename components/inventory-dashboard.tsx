'use client';

import { useMemo, useState } from 'react';
import { BarChart3, Box, Circle, Download, Edit3, Package2, Plus, Search, Trash2, TrendingUp, Warehouse } from 'lucide-react';
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

const initialItems: InventoryItem[] = [
  { id: '1', name: 'Premium Tee', sku: 'PT-001', category: 'Shirts', size: 'M', stock: 8, min: 10, status: 'LOW', colors: ['Black', 'White'] },
  { id: '2', name: 'Classic Shirt', sku: 'CS-200', category: 'Shirts', size: 'L', stock: 24, min: 8, status: 'OK', colors: ['Navy', 'Cream'] },
  { id: '3', name: 'Tailored Jacket', sku: 'TJ-310', category: 'Jackets', size: 'XL', stock: 3, min: 6, status: 'LOW', colors: ['Olive', 'Black'] },
];

const initialCategories: Category[] = [
  { id: 'cat-1', name: 'Shirts' },
  { id: 'cat-2', name: 'Jackets' },
  { id: 'cat-3', name: 'Accessories' },
];

const colorOptions = ['Black', 'White', 'Navy', 'Olive', 'Cream', 'Red', 'Khaki'];

const chartData = [
  { category: 'Shirts', stock: 32 },
  { category: 'Jackets', stock: 12 },
  { category: 'Accessories', stock: 18 },
  { category: 'Footwear', stock: 9 },
];

export default function InventoryDashboard() {
  const [items, setItems] = useState<InventoryItem[]>(initialItems);
  const [categories, setCategories] = useState<Category[]>(initialCategories);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [categoryFilter, setCategoryFilter] = useState('ALL');
  const [activeTab, setActiveTab] = useState<'inventory' | 'audit'>('inventory');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: '', sku: '', category: 'Shirts', size: 'M', stock: '0', min: '5', colors: [] as string[] });
  const [auditLog, setAuditLog] = useState<AuditEntry[]>([
    { id: 'a1', action: 'STOCK_ADJUST', item: 'Premium Tee', detail: '+1 to 9', time: '8 min ago' },
    { id: 'a2', action: 'CREATE', item: 'Tailored Jacket', detail: 'New item added', time: '30 min ago' },
    { id: 'a3', action: 'UPDATE', item: 'Classic Shirt', detail: 'Threshold updated', time: '1 hr ago' },
  ]);
  const [newCategory, setNewCategory] = useState('');

  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      const matchesQuery = `${item.name} ${item.sku} ${item.colors.join(' ')}`.toLowerCase().includes(query.toLowerCase());
      const matchesStatus = statusFilter === 'ALL' || item.status === statusFilter;
      const matchesCategory = categoryFilter === 'ALL' || item.category === categoryFilter;
      return matchesQuery && matchesStatus && matchesCategory;
    });
  }, [items, query, statusFilter, categoryFilter]);

  const totalValue = items.reduce((sum, item) => sum + item.stock * 80, 0);
  const lowStockCount = items.filter((item) => item.status === 'LOW').length;

  const openCreateModal = () => {
    setEditingId(null);
    setForm({ name: '', sku: '', category: categories[0]?.name || 'Shirts', size: 'M', stock: '0', min: '5', colors: [] });
    setIsModalOpen(true);
  };

  const openEditModal = (item: InventoryItem) => {
    setEditingId(item.id);
    setForm({ name: item.name, sku: item.sku, category: item.category, size: item.size, stock: String(item.stock), min: String(item.min), colors: item.colors });
    setIsModalOpen(true);
  };

  const submitItem = () => {
    const payload = {
      ...form,
      stock: Number(form.stock),
      min: Number(form.min),
      status: Number(form.stock) <= Number(form.min) ? 'LOW' as const : 'OK' as const,
    };

    if (editingId) {
      setItems((current) => current.map((item) => item.id === editingId ? { ...item, ...payload, id: item.id } : item));
      setAuditLog((current) => [{ id: crypto.randomUUID(), action: 'UPDATE', item: payload.name, detail: 'Item updated', time: 'Just now' }, ...current]);
    } else {
      const newItem: InventoryItem = {
        id: crypto.randomUUID(),
        name: payload.name,
        sku: payload.sku,
        category: payload.category,
        size: payload.size,
        stock: payload.stock,
        min: payload.min,
        status: payload.status,
        colors: payload.colors,
      };
      setItems((current) => [newItem, ...current]);
      setAuditLog((current) => [{ id: crypto.randomUUID(), action: 'CREATE', item: payload.name, detail: 'New item added', time: 'Just now' }, ...current]);
    }

    setIsModalOpen(false);
  };

  const adjustStock = (itemId: string, delta: number) => {
    setItems((current) => current.map((item) => {
      if (item.id !== itemId) return item;
      const nextStock = item.stock + delta;
      const nextStatus = nextStock <= item.min ? 'LOW' : 'OK';
      return { ...item, stock: nextStock, status: nextStatus };
    }));

    const item = items.find((entry) => entry.id === itemId);
    if (item) {
      setAuditLog((current) => [{ id: crypto.randomUUID(), action: 'STOCK_ADJUST', item: item.name, detail: `${delta > 0 ? '+' : ''}${delta} to ${item.stock + delta}`, time: 'Just now' }, ...current]);
    }
  };

  const deleteItem = (itemId: string) => {
    const item = items.find((entry) => entry.id === itemId);
    setItems((current) => current.filter((entry) => entry.id !== itemId));
    if (item) {
      setAuditLog((current) => [{ id: crypto.randomUUID(), action: 'DELETE', item: item.name, detail: 'Item removed', time: 'Just now' }, ...current]);
    }
  };

  const addCategory = () => {
    const cleanName = newCategory.trim();
    if (!cleanName) return;
    setCategories((current) => [...current, { id: crypto.randomUUID(), name: cleanName }]);
    setNewCategory('');
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
    <main className="min-h-screen bg-black text-white">
      <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
        <header className="flex flex-col gap-4 rounded-3xl border border-zinc-800 bg-zinc-950/80 p-5 shadow-2xl shadow-black/40 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm uppercase tracking-[0.35em] text-zinc-400">THE PRINTING DEPOT</p>
            <h1 className="mt-2 text-3xl font-black sm:text-4xl">Inventory command center</h1>
          </div>
          <div className="flex flex-wrap gap-3">
            <button onClick={openCreateModal} className="rounded-2xl border border-zinc-700 bg-white px-4 py-2 text-sm font-semibold text-black transition hover:bg-zinc-100">
              <span className="flex items-center gap-2"> <Plus size={16} /> New Item </span>
            </button>
            <button onClick={() => exportInventory('csv')} className="rounded-2xl border border-zinc-700 bg-zinc-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-zinc-800">
              <span className="flex items-center gap-2"> <Download size={16} /> Export CSV </span>
            </button>
            <button onClick={() => exportInventory('xlsx')} className="rounded-2xl border border-zinc-700 bg-zinc-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-zinc-800">
              <span className="flex items-center gap-2"> <BarChart3 size={16} /> Export XLSX </span>
            </button>
          </div>
        </header>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {[
            { label: 'Total Items', value: items.length, icon: Package2 },
            { label: 'Inventory Value', value: `$${totalValue.toLocaleString()}`, icon: TrendingUp },
            { label: 'Low Stock', value: lowStockCount, icon: Box },
            { label: 'Categories', value: categories.length, icon: Warehouse },
          ].map((card) => (
            <div key={card.label} className="rounded-3xl border border-zinc-800 bg-zinc-950 p-5">
              <div className="flex items-center justify-between">
                <p className="text-sm text-zinc-400">{card.label}</p>
                <card.icon className="h-5 w-5 text-zinc-500" />
              </div>
              <p className="mt-4 text-3xl font-black">{card.value}</p>
            </div>
          ))}
        </section>

        <section className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
          <div className="rounded-3xl border border-zinc-800 bg-zinc-950 p-5">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold">Stock by category</h2>
                <p className="text-sm text-zinc-400">Visual snapshot of inventory depth</p>
              </div>
              <div className="rounded-full border border-zinc-700 px-3 py-1 text-sm text-zinc-300">Live</div>
            </div>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                  <XAxis dataKey="category" stroke="#a1a1aa" />
                  <YAxis stroke="#a1a1aa" />
                  <Tooltip />
                  <Bar dataKey="stock" fill="#ffffff" radius={[8, 8, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="rounded-3xl border border-zinc-800 bg-zinc-950 p-5">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold">Recent audit activity</h2>
                <p className="text-sm text-zinc-400">Latest inventory events</p>
              </div>
              <div className="rounded-full border border-zinc-700 px-3 py-1 text-sm text-zinc-300">{auditLog.length} updates</div>
            </div>
            <div className="space-y-3">
              {auditLog.slice(0, 4).map((entry) => (
                <div key={entry.id} className="flex items-center justify-between rounded-2xl border border-zinc-800 bg-black/40 p-3">
                  <div>
                    <p className="font-semibold">{entry.item}</p>
                    <p className="text-sm text-zinc-400">{entry.detail}</p>
                  </div>
                  <div className="text-right text-sm text-zinc-500">
                    <p>{entry.action}</p>
                    <p>{entry.time}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="grid gap-6 xl:grid-cols-[1.4fr_0.6fr]">
          <div className="rounded-3xl border border-zinc-800 bg-zinc-950 p-5">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h2 className="text-2xl font-black">Inventory overview</h2>
                <p className="text-sm text-zinc-400">Responsive table with streamlined controls</p>
              </div>
              <div className="flex flex-col gap-3 md:flex-row">
                <label className="flex items-center gap-2 rounded-2xl border border-zinc-800 bg-black/40 px-3 py-2">
                  <Search size={16} className="text-zinc-500" />
                  <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search item, SKU or color" className="w-full bg-transparent text-sm outline-none sm:w-56" />
                </label>
                <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="rounded-2xl border border-zinc-800 bg-black/40 px-3 py-2 text-sm">
                  <option value="ALL">All status</option>
                  <option value="LOW">Low</option>
                  <option value="OK">Ok</option>
                </select>
                <select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)} className="rounded-2xl border border-zinc-800 bg-black/40 px-3 py-2 text-sm">
                  <option value="ALL">All categories</option>
                  {categories.map((category) => <option key={category.id} value={category.name}>{category.name}</option>)}
                </select>
              </div>
            </div>

            <div className="mt-6 flex gap-2 border-b border-zinc-800 pb-3 text-sm">
              <button onClick={() => setActiveTab('inventory')} className={`rounded-full px-3 py-1.5 ${activeTab === 'inventory' ? 'bg-white text-black' : 'bg-zinc-900 text-zinc-300'}`}>Inventory</button>
              <button onClick={() => setActiveTab('audit')} className={`rounded-full px-3 py-1.5 ${activeTab === 'audit' ? 'bg-white text-black' : 'bg-zinc-900 text-zinc-300'}`}>Audit Log</button>
            </div>

            {activeTab === 'inventory' ? (
              <div className="mt-5 overflow-x-auto">
                <div className="min-w-[760px] space-y-4">
                  <div className="grid grid-cols-[1.4fr_0.9fr_0.9fr_0.6fr_0.7fr_0.7fr_0.7fr] gap-2 rounded-2xl border border-zinc-800 bg-black/40 px-4 py-3 text-sm uppercase tracking-[0.2em] text-zinc-500">
                    <div>Item</div>
                    <div>Category</div>
                    <div>Stock</div>
                    <div>Min</div>
                    <div>Status</div>
                    <div>Adjust</div>
                    <div>Actions</div>
                  </div>

                  {filteredItems.map((item) => (
                    <div key={item.id} className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-4">
                      <div className="grid grid-cols-[1.4fr_0.9fr_0.9fr_0.6fr_0.7fr_0.7fr_0.7fr] items-center gap-2">
                        <div>
                          <p className="font-semibold">{item.name}</p>
                          <p className="text-sm text-zinc-500">{item.sku}</p>
                        </div>
                        <div>
                          <span className="rounded-full border border-zinc-700 px-2.5 py-1 text-xs text-zinc-300">{item.category}</span>
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <div className="h-2 w-full rounded-full bg-zinc-800">
                              <div className="h-2 rounded-full bg-white" style={{ width: `${Math.min(100, (item.stock / Math.max(item.min, 1)) * 100)}%` }} />
                            </div>
                            <span className="text-sm font-semibold">{item.stock}</span>
                          </div>
                        </div>
                        <div className="text-sm text-zinc-400">{item.min}</div>
                        <div>
                          <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${item.status === 'LOW' ? 'bg-red-600/20 text-red-400' : 'bg-emerald-600/20 text-emerald-400'}`}>{item.status}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <button onClick={() => adjustStock(item.id, -1)} className="rounded-full border border-zinc-700 px-2 py-1 text-sm">-</button>
                          <button onClick={() => adjustStock(item.id, 1)} className="rounded-full border border-zinc-700 px-2 py-1 text-sm">+</button>
                        </div>
                        <div className="flex items-center gap-2">
                          <button onClick={() => openEditModal(item)} className="rounded-full border border-zinc-700 p-2"><Edit3 size={14} /></button>
                          <button onClick={() => deleteItem(item.id)} className="rounded-full border border-zinc-700 p-2"><Trash2 size={14} /></button>
                        </div>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {item.colors.map((color) => (
                          <span key={color} className="flex items-center gap-2 rounded-full border border-zinc-700 px-2.5 py-1 text-xs text-zinc-300">
                            <Circle size={10} fill="currentColor" /> {color}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="mt-5 space-y-3 rounded-2xl border border-zinc-800 bg-black/40 p-4">
                {auditLog.map((entry) => (
                  <div key={entry.id} className="flex items-center justify-between rounded-2xl border border-zinc-800 bg-zinc-900/70 p-3">
                    <div>
                      <p className="font-semibold">{entry.item}</p>
                      <p className="text-sm text-zinc-400">{entry.detail}</p>
                    </div>
                    <div className="text-right text-sm text-zinc-500">
                      <p>{entry.action}</p>
                      <p>{entry.time}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-6">
            <div className="rounded-3xl border border-zinc-800 bg-zinc-950 p-5">
              <h3 className="text-lg font-bold">Category manager</h3>
              <p className="mt-1 text-sm text-zinc-400">Keep the assortment neatly organized.</p>
              <div className="mt-4 flex gap-2">
                <input value={newCategory} onChange={(event) => setNewCategory(event.target.value)} placeholder="New category" className="flex-1 rounded-2xl border border-zinc-800 bg-black/40 px-3 py-2 text-sm outline-none" />
                <button onClick={addCategory} className="rounded-2xl border border-zinc-700 bg-white px-3 py-2 text-sm font-semibold text-black">Add</button>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                {categories.map((category) => (
                  <span key={category.id} className="rounded-full border border-zinc-700 px-3 py-1 text-sm text-zinc-300">{category.name}</span>
                ))}
              </div>
            </div>

            <div className="rounded-3xl border border-zinc-800 bg-zinc-950 p-5">
              <h3 className="text-lg font-bold">Needs restocking</h3>
              <div className="mt-4 space-y-2">
                {items.filter((item) => item.status === 'LOW').map((item) => (
                  <div key={item.id} className="rounded-2xl border border-red-900/50 bg-red-950/40 p-3 text-sm">
                    <p className="font-semibold">{item.name}</p>
                    <p className="text-zinc-400">{item.sku} • {item.stock} in stock</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>
      </div>

      {isModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
          <div className="w-full max-w-xl rounded-3xl border border-zinc-800 bg-zinc-950 p-6 shadow-2xl">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm uppercase tracking-[0.3em] text-zinc-400">{editingId ? 'Edit item' : 'New item'}</p>
                <h3 className="text-2xl font-black">Item details</h3>
              </div>
              <button onClick={() => setIsModalOpen(false)} className="rounded-full border border-zinc-700 px-3 py-1 text-sm">Close</button>
            </div>

            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              <label className="text-sm">
                <span className="mb-2 block text-zinc-400">Item Name</span>
                <input value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} className="w-full rounded-2xl border border-zinc-800 bg-black/40 px-3 py-2 outline-none" />
              </label>
              <label className="text-sm">
                <span className="mb-2 block text-zinc-400">SKU</span>
                <input value={form.sku} onChange={(event) => setForm((current) => ({ ...current, sku: event.target.value }))} className="w-full rounded-2xl border border-zinc-800 bg-black/40 px-3 py-2 outline-none" />
              </label>
              <label className="text-sm">
                <span className="mb-2 block text-zinc-400">Category</span>
                <select value={form.category} onChange={(event) => setForm((current) => ({ ...current, category: event.target.value }))} className="w-full rounded-2xl border border-zinc-800 bg-black/40 px-3 py-2 outline-none">
                  {categories.map((category) => <option key={category.id} value={category.name}>{category.name}</option>)}
                </select>
              </label>
              <label className="text-sm">
                <span className="mb-2 block text-zinc-400">Size</span>
                <input value={form.size} onChange={(event) => setForm((current) => ({ ...current, size: event.target.value }))} className="w-full rounded-2xl border border-zinc-800 bg-black/40 px-3 py-2 outline-none" />
              </label>
              <label className="text-sm">
                <span className="mb-2 block text-zinc-400">Current Stock</span>
                <input type="number" value={form.stock} onChange={(event) => setForm((current) => ({ ...current, stock: event.target.value }))} className="w-full rounded-2xl border border-zinc-800 bg-black/40 px-3 py-2 outline-none" />
              </label>
              <label className="text-sm">
                <span className="mb-2 block text-zinc-400">Low Stock Threshold</span>
                <input type="number" value={form.min} onChange={(event) => setForm((current) => ({ ...current, min: event.target.value }))} className="w-full rounded-2xl border border-zinc-800 bg-black/40 px-3 py-2 outline-none" />
              </label>
            </div>

            <div className="mt-4">
              <p className="mb-2 text-sm text-zinc-400">Colors</p>
              <div className="flex flex-wrap gap-2">
                {colorOptions.map((color) => {
                  const active = form.colors.includes(color);
                  return (
                    <button key={color} onClick={() => setForm((current) => ({ ...current, colors: active ? current.colors.filter((entry) => entry !== color) : [...current.colors, color] }))} className={`rounded-full border px-3 py-1 text-sm ${active ? 'border-white bg-white text-black' : 'border-zinc-700 bg-zinc-900 text-zinc-300'}`}>
                      {color}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button onClick={() => setIsModalOpen(false)} className="rounded-2xl border border-zinc-700 bg-zinc-900 px-4 py-2 text-sm">Cancel</button>
              <button onClick={submitItem} className="rounded-2xl border border-zinc-700 bg-white px-4 py-2 text-sm font-semibold text-black">Save</button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
