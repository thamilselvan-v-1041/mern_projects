export interface Category {
  id: string
  name: string
  slug: string
  icon: string
}

export interface Feed {
  id: string
  categoryId: string
  title: string
  excerpt: string
  content: string
  imageUrl?: string
  publishedAt: string
  source: string
  link?: string
}
