import { supabase, type TranslationHistory } from './supabase';

/**
 * Save a translation to the cloud Supabase database
 */
export async function saveTranslation(translation: Omit<TranslationHistory, 'id' | 'created_at'>): Promise<TranslationHistory | null> {
  try {
    // Check if Supabase is configured
    if (!supabase) {
      console.warn('Supabase client not initialized. Translation not saved.');
      return null;
    }

    const { data, error } = await supabase
      .from('translation_history')
      .insert([translation])
      .select()
      .single();

    if (error) {
      console.error('Error saving translation to cloud database:', error);
      return null;
    }

    console.log('✅ Translation saved to cloud Supabase database');
    return data;
  } catch (err) {
    console.error('Failed to save translation to cloud database:', err);
    return null;
  }
}

/**
 * Get translation history from cloud Supabase database (latest first)
 */
export async function getTranslationHistory(limit: number = 50): Promise<TranslationHistory[]> {
  try {
    // Check if Supabase is configured
    if (!supabase) {
      console.warn('Supabase client not initialized. Cannot fetch history.');
      return [];
    }

    const { data, error } = await supabase
      .from('translation_history')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      console.error('Error fetching translation history from cloud database:', error);
      return [];
    }

    return data || [];
  } catch (err) {
    console.error('Failed to fetch translation history from cloud database:', err);
    return [];
  }
}

/**
 * Delete a translation from cloud Supabase database
 */
export async function deleteTranslation(id: string): Promise<boolean> {
  try {
    if (!supabase) {
      console.warn('Supabase client not initialized. Cannot delete translation.');
      return false;
    }

    const { error } = await supabase
      .from('translation_history')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Error deleting translation from cloud database:', error);
      return false;
    }

    return true;
  } catch (err) {
    console.error('Failed to delete translation from cloud database:', err);
    return false;
  }
}

/**
 * Clear all translation history from cloud Supabase database
 */
export async function clearTranslationHistory(): Promise<boolean> {
  try {
    if (!supabase) {
      console.warn('Supabase client not initialized. Cannot clear history.');
      return false;
    }

    const { error } = await supabase
      .from('translation_history')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all (using a condition that matches all rows)

    if (error) {
      console.error('Error clearing translation history from cloud database:', error);
      return false;
    }

    return true;
  } catch (err) {
    console.error('Failed to clear translation history from cloud database:', err);
    return false;
  }
}
