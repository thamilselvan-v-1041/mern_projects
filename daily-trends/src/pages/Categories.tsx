import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { categories } from '../data/mockData'
import { getSelectedCategories, saveSelectedCategories } from '../utils/session'

export default function Categories() {
  const navigate = useNavigate()
  const [selectedIds, setSelectedIds] = useState<string[]>(getSelectedCategories())

  const toggleCategory = (categoryId: string) => {
    setSelectedIds((prev) =>
      prev.includes(categoryId)
        ? prev.filter((id) => id !== categoryId)
        : [...prev, categoryId]
    )
  }

  const onContinue = () => {
    if (selectedIds.length === 0) return
    saveSelectedCategories(selectedIds)
    navigate('/home')
  }

  return (
    <div className="page categories-page">
      <header className="header">
        <div className="header-row">
          <h1>Daily Trends</h1>
          <button
            type="button"
            className="header-continue-button"
            disabled={selectedIds.length === 0}
            onClick={onContinue}
          >
            Continue
          </button>
        </div>
        <p className="subtitle">Choose your interests (multiple selections)</p>
      </header>
      <main className="main">
        <ul className="category-list">
          {categories.map((cat) => (
            <li key={cat.id}>
              <button
                type="button"
                className={`category-card category-button ${selectedIds.includes(cat.id) ? 'selected' : ''}`}
                onClick={() => toggleCategory(cat.id)}
              >
                <span className="category-icon">{cat.icon}</span>
                <span className="category-name">{cat.name}</span>
              </button>
            </li>
          ))}
        </ul>
      </main>
    </div>
  )
}
