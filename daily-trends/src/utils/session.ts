const INTERESTS_KEY = 'dailyTrends.selectedCategories'
const ENTERED_HOME_KEY = 'dailyTrends.enteredHome'

export function saveSelectedCategories(categoryIds: string[]): void {
  sessionStorage.setItem(INTERESTS_KEY, JSON.stringify(categoryIds))
  sessionStorage.setItem(ENTERED_HOME_KEY, '1')
}

export function getSelectedCategories(): string[] {
  const raw = sessionStorage.getItem(INTERESTS_KEY)
  if (!raw) return []

  try {
    const parsed = JSON.parse(raw) as unknown
    if (Array.isArray(parsed)) {
      return parsed.filter((id): id is string => typeof id === 'string')
    }
  } catch {
    return []
  }

  return []
}

export function hasEnteredHome(): boolean {
  return sessionStorage.getItem(ENTERED_HOME_KEY) === '1' && getSelectedCategories().length > 0
}
