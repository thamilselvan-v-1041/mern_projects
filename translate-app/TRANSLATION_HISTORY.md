# Translation History Feature

## Overview

The translation history feature displays all your past translations at the bottom of the UI, along with an estimated cost calculation.

## Features

### 1. History Display
- Shows the last 20 translations
- Displays source and translated text
- Shows language pairs (source → target)
- Shows timestamp for each translation
- Expandable/collapsible view

### 2. Cost Calculation
- **Estimated Cost Display**: Shows total estimated cost based on characters translated
- **Cost Formula**: $0.0001 per character
  - Example: 1000 characters = $0.10
- **Real-time Updates**: Cost updates automatically as new translations are added

### 3. History Management
- **Delete Individual Items**: Click the ✕ button to remove a translation
- **Auto-refresh**: History automatically refreshes when new translations are saved
- **Empty State**: Shows helpful message when no history exists

## Cost Calculation Details

### Current Pricing Model
- **Rate**: $0.0001 per character
- **Calculation**: `total_characters × 0.0001`
- **Display**: Shows cost in USD format (e.g., $0.0123)

### Example Costs
- 100 characters = $0.01
- 1,000 characters = $0.10
- 10,000 characters = $1.00
- 100,000 characters = $10.00

### Note on Pricing
The cost calculation is an **estimate** based on a standard pricing model. Actual costs may vary based on:
- Your API provider's pricing (Sarvam.ai)
- Volume discounts
- Different rates for different language pairs
- Additional features (TTS, etc.)

## UI Components

### History Header
- **Title**: "📜 Translation History"
- **Count**: Shows number of items in history
- **Cost Display**: Shows estimated total cost
- **Toggle Button**: Expand/collapse history

### History Items
Each item shows:
- Language badges (source → target)
- Timestamp
- Source text
- Translated text
- Detected language (if auto-detected)
- Delete button

## Technical Implementation

### Component Location
`src/components/TranslationHistory.tsx`

### Data Source
- Supabase table: `translation_history`
- Fetches last 20 translations
- Auto-refreshes on new translations

### State Management
- Uses `refreshTrigger` prop to refresh when new translations are saved
- Local state for loading, error, and expanded state

## Future Enhancements

Potential improvements:
- [ ] Filter by language pair
- [ ] Search functionality
- [ ] Export history (CSV, JSON)
- [ ] Pagination for large histories
- [ ] Clear all history button
- [ ] User-specific history (with authentication)
- [ ] Cost breakdown by language pair
- [ ] Monthly/weekly cost tracking

## Usage

The history component is automatically included at the bottom of the translate app. No additional configuration needed - it works automatically once Supabase is set up!
