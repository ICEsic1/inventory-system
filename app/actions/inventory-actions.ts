'use server';

import { revalidatePath } from 'next/cache';
import { supabase } from '@/app/lib/supabase';

export async function createItem(formData: FormData) {
  const name = formData.get('name')?.toString() || '';
  const sku = formData.get('sku')?.toString() || '';
  const categoryId = formData.get('categoryId')?.toString() || null;
  const size = formData.get('size')?.toString() || '';
  const currentStock = Number(formData.get('currentStock') || 0);
  const threshold = Number(formData.get('lowStockThreshold') || 5);
  const colors = formData.get('colors')?.toString().split(',').filter(Boolean) || [];

  const { error } = await supabase.from('items').insert({
    name,
    sku,
    category_id: categoryId,
    size,
    current_stock: currentStock,
    low_stock_threshold: threshold,
    colors,
  });

  if (error) throw error;
  revalidatePath('/');
}

export async function adjustStock(itemId: string, delta: number) {
  const { data, error } = await supabase.from('items').select('current_stock').eq('id', itemId).single();

  if (error || !data) throw error || new Error('Item not found');

  const nextStock = data.current_stock + delta;
  const { error: updateError } = await supabase.from('items').update({ current_stock: nextStock, updated_at: new Date().toISOString() }).eq('id', itemId);

  if (updateError) throw updateError;

  await supabase.from('audit_logs').insert({
    item_id: itemId,
    action: 'STOCK_ADJUST',
    previous_stock: data.current_stock,
    new_stock: nextStock,
    timestamp: new Date().toISOString(),
  });

  revalidatePath('/');
}

export async function exportInventory(format: 'csv' | 'xlsx') {
  const { data, error } = await supabase.from('items').select('name, sku, current_stock, low_stock_threshold, size, colors, category_id');
  if (error) throw error;

  if (format === 'csv') {
    const csv = data.map((item) => `${item.name},${item.sku},${item.current_stock}`).join('\n');
    return csv;
  }

  return JSON.stringify(data);
}
