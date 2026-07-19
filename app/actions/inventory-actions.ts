'use server';

import { revalidatePath } from 'next/cache';
import { supabase } from '@/library/supabaseClient';

export async function createItem(formData: FormData) {
  const name = formData.get('name')?.toString() || '';
  const sku = formData.get('sku')?.toString() || '';
  const category = formData.get('category')?.toString() || '';
  const size = formData.get('size')?.toString() || '';
  const stock = Number(formData.get('stock') || 0);
  const min = Number(formData.get('min') || 5);
  const colors = formData.get('colors')?.toString().split(',').filter(Boolean) || [];
  const status = stock <= min ? 'LOW' : 'OK';

  const { error } = await supabase.from('inventory').insert({
    name,
    sku,
    category,
    size,
    stock,
    min,
    status,
    colors,
  });

  if (error) throw error;
  revalidatePath('/');
}

export async function adjustStock(itemId: string, delta: number) {
  const { data, error } = await supabase.from('inventory').select('stock, min').eq('id', itemId).single();

  if (error || !data) throw error || new Error('Item not found');

  const nextStock = Math.max(0, data.stock + delta);
  const status = nextStock <= data.min ? 'LOW' : 'OK';

  const { error: updateError } = await supabase
    .from('inventory')
    .update({ stock: nextStock, status })
    .eq('id', itemId);

  if (updateError) throw updateError;

  revalidatePath('/');
}

export async function exportInventory(format: 'csv' | 'xlsx') {
  const { data, error } = await supabase.from('inventory').select('name, sku, stock, min, size, colors, category, status');
  if (error) throw error;

  if (format === 'csv') {
    return data.map((item) => `${item.name},${item.sku},${item.stock}`).join('\n');
  }

  return JSON.stringify(data);
}