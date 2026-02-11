import type { Category, Feed } from '../types'
import { getCachedFeedById } from '../utils/feedCache'

export const categories: Category[] = [
  { id: '1', name: 'Business', slug: 'business', icon: '💼' },
  { id: '2', name: 'Social', slug: 'social', icon: '👥' },
  { id: '3', name: 'AI', slug: 'ai', icon: '🤖' },
  { id: '4', name: 'Robotics', slug: 'robotics', icon: '🦾' },
  { id: '5', name: 'Beauty', slug: 'beauty', icon: '✨' },
  { id: '6', name: 'Tech', slug: 'tech', icon: '📱' },
  { id: '7', name: 'Health', slug: 'health', icon: '🏥' },
  { id: '8', name: 'Science', slug: 'science', icon: '🔬' },
  { id: '9', name: 'Entertainment', slug: 'entertainment', icon: '🎬' },
  { id: '10', name: 'Sports', slug: 'sports', icon: '⚽' },
  { id: '11', name: 'Finance', slug: 'finance', icon: '📈' },
  { id: '12', name: 'Fashion', slug: 'fashion', icon: '👗' },
  { id: '13', name: 'Travel', slug: 'travel', icon: '✈️' },
  { id: '14', name: 'Food', slug: 'food', icon: '🍳' },
  { id: '15', name: 'Environment', slug: 'environment', icon: '🌍' },
]

const lorem =
  'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.'

function makeFeeds(categoryId: string, categoryName: string): Feed[] {
  const titles = [
    `${categoryName} sector sees record growth in Q4`,
    `Top 5 ${categoryName} trends to watch this year`,
    `Experts weigh in on ${categoryName} outlook`,
    `New regulations impact ${categoryName} industry`,
    `${categoryName} leaders gather for annual summit`,
    `Breakthrough in ${categoryName} research announced`,
    `Consumer habits shift in ${categoryName} space`,
    `${categoryName} startups raise $2B in funding`,
    `Global ${categoryName} market reaches new high`,
    `What’s next for ${categoryName} in 2025`,
  ]
  return titles.map((title, i) => ({
    id: `${categoryId}-${i + 1}`,
    categoryId,
    title,
    excerpt: title + '. ' + lorem.slice(0, 120) + '…',
    content: `<h2>${title}</h2><p>${lorem}</p><p>${lorem}</p><p>${lorem}</p>`,
    imageUrl: `https://picsum.photos/800/400?random=${categoryId}-${i}`,
    publishedAt: new Date(Date.now() - i * 3600000).toISOString(),
    source: 'Daily Trends',
  }))
}

const allFeedsByCategory = new Map<string, Feed[]>()
categories.forEach((c) => allFeedsByCategory.set(c.id, makeFeeds(c.id, c.name)))

export function getFeedsForCategory(categoryId: string): Feed[] {
  return allFeedsByCategory.get(categoryId) ?? []
}

export function getTopFeedsForCategories(categoryIds: string[], limit = 10): Feed[] {
  const merged = categoryIds.flatMap((categoryId) => getFeedsForCategory(categoryId))
  return merged
    .sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime())
    .slice(0, limit)
}

export function getFeedById(feedId: string): Feed | undefined {
  const cached = getCachedFeedById(feedId)
  if (cached) return cached

  for (const feeds of allFeedsByCategory.values()) {
    const found = feeds.find((f) => f.id === feedId)
    if (found) return found
  }
  return undefined
}
