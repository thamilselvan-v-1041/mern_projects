-- Translation History Queries for Supabase PostgreSQL Database
-- Run these queries in Supabase SQL Editor: https://supabase.com/dashboard/project/lsnflwkkppvdokhuunbh/sql/new

-- ============================================
-- BASIC QUERIES
-- ============================================

-- 1. Select all translations (latest first)
SELECT * 
FROM translation_history 
ORDER BY created_at DESC;

-- 2. Select last 20 translations
SELECT * 
FROM translation_history 
ORDER BY created_at DESC 
LIMIT 20;

-- 3. Select all translations with formatted date
SELECT 
  id,
  source_text,
  translated_text,
  source_language_code,
  target_language_code,
  detected_language_code,
  created_at,
  TO_CHAR(created_at, 'YYYY-MM-DD HH24:MI:SS') as formatted_date
FROM translation_history 
ORDER BY created_at DESC;

-- ============================================
-- STATISTICS QUERIES
-- ============================================

-- 4. Count total translations
SELECT COUNT(*) as total_translations 
FROM translation_history;

-- 5. Count translations by language pair
SELECT 
  source_language_code,
  target_language_code,
  COUNT(*) as translation_count
FROM translation_history
GROUP BY source_language_code, target_language_code
ORDER BY translation_count DESC;

-- 6. Calculate total characters translated
SELECT 
  SUM(LENGTH(source_text)) as total_source_characters,
  SUM(LENGTH(translated_text)) as total_translated_characters,
  COUNT(*) as total_translations
FROM translation_history;

-- 7. Estimated cost calculation (based on $0.0001 per character)
SELECT 
  SUM(LENGTH(source_text)) as total_characters,
  ROUND(SUM(LENGTH(source_text)) * 0.0001, 4) as estimated_cost_usd
FROM translation_history;

-- ============================================
-- FILTERING QUERIES
-- ============================================

-- 8. Filter by source language
SELECT * 
FROM translation_history 
WHERE source_language_code = 'en-IN'
ORDER BY created_at DESC;

-- 9. Filter by target language
SELECT * 
FROM translation_history 
WHERE target_language_code = 'hi-IN'
ORDER BY created_at DESC;

-- 10. Filter by language pair
SELECT * 
FROM translation_history 
WHERE source_language_code = 'en-IN' 
  AND target_language_code = 'hi-IN'
ORDER BY created_at DESC;

-- 11. Search translations containing specific text
SELECT * 
FROM translation_history 
WHERE source_text ILIKE '%hello%' 
   OR translated_text ILIKE '%hello%'
ORDER BY created_at DESC;

-- ============================================
-- DATE RANGE QUERIES
-- ============================================

-- 12. Translations from last 24 hours
SELECT * 
FROM translation_history 
WHERE created_at >= NOW() - INTERVAL '24 hours'
ORDER BY created_at DESC;

-- 13. Translations from last 7 days
SELECT * 
FROM translation_history 
WHERE created_at >= NOW() - INTERVAL '7 days'
ORDER BY created_at DESC;

-- 14. Translations from today
SELECT * 
FROM translation_history 
WHERE DATE(created_at) = CURRENT_DATE
ORDER BY created_at DESC;

-- 15. Translations by date
SELECT 
  DATE(created_at) as translation_date,
  COUNT(*) as count
FROM translation_history
GROUP BY DATE(created_at)
ORDER BY translation_date DESC;

-- ============================================
-- ADVANCED QUERIES
-- ============================================

-- 16. Most translated language pairs (top 10)
SELECT 
  source_language_code || ' → ' || target_language_code as language_pair,
  COUNT(*) as translation_count,
  SUM(LENGTH(source_text)) as total_characters
FROM translation_history
GROUP BY source_language_code, target_language_code
ORDER BY translation_count DESC
LIMIT 10;

-- 17. Average translation length by language pair
SELECT 
  source_language_code || ' → ' || target_language_code as language_pair,
  COUNT(*) as translation_count,
  ROUND(AVG(LENGTH(source_text)), 2) as avg_source_length,
  ROUND(AVG(LENGTH(translated_text)), 2) as avg_translated_length
FROM translation_history
GROUP BY source_language_code, target_language_code
ORDER BY translation_count DESC;

-- 18. Recent translations with character counts
SELECT 
  id,
  LEFT(source_text, 50) || '...' as source_preview,
  LEFT(translated_text, 50) || '...' as translated_preview,
  source_language_code || ' → ' || target_language_code as language_pair,
  LENGTH(source_text) as source_length,
  LENGTH(translated_text) as translated_length,
  created_at
FROM translation_history
ORDER BY created_at DESC
LIMIT 20;

-- ============================================
-- MAINTENANCE QUERIES
-- ============================================

-- 19. Delete old translations (older than 30 days)
-- DELETE FROM translation_history 
-- WHERE created_at < NOW() - INTERVAL '30 days';

-- 20. Delete translations by ID
-- DELETE FROM translation_history 
-- WHERE id = 'your-uuid-here';

-- 21. Clear all translation history (USE WITH CAUTION!)
-- DELETE FROM translation_history;

-- ============================================
-- EXPORT QUERIES
-- ============================================

-- 22. Export as JSON format
SELECT json_agg(
  json_build_object(
    'id', id,
    'source_text', source_text,
    'translated_text', translated_text,
    'source_language', source_language_code,
    'target_language', target_language_code,
    'detected_language', detected_language_code,
    'created_at', created_at
  )
) as translations_json
FROM translation_history
ORDER BY created_at DESC;

-- 23. Export as CSV format (for download)
SELECT 
  id,
  source_text,
  translated_text,
  source_language_code,
  target_language_code,
  detected_language_code,
  created_at
FROM translation_history
ORDER BY created_at DESC;
