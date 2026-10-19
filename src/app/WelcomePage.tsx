import { ArrowUpRight, Star, X } from 'lucide-react'
import type { ReactNode } from 'react'
import { StarsMark } from '../Icons'
import type { Plan } from '../genui/types'
import type { SavedDashboard } from './savedDashboards'
import type { Strings } from '../i18n'

/** A starter question: its text, icon and the exact plan of its dashboard (genui/presets.ts). */
export interface Idea {
  icon: ReactNode
  text: string
  plan: Plan
}

/** The first screen: a welcome, the message box and example questions. */
export function WelcomePage({
  t,
  composer,
  ideas,
  disabled,
  onIdea,
  saved = [],
  onOpenSaved,
  onRemoveSaved,
}: {
  t: Strings
  composer: ReactNode
  ideas: Idea[]
  disabled: boolean
  onIdea: (idea: Idea) => void
  /** The dashboards the reader starred (kept on this device). */
  saved?: SavedDashboard[]
  onOpenSaved?: (s: SavedDashboard) => void
  onRemoveSaved?: (s: SavedDashboard) => void
}) {
  return (
    <main className="welcome" id="main" tabIndex={-1}>
      <div className="welcome__head">
        <h2 className="welcome__title">
          <StarsMark size={36} />
          {t.welcome}
        </h2>
        <p className="welcome__sub">{t.welcomeSub}</p>
      </div>
      {composer}
      {saved.length > 0 && (
        <section className="ideas ideas--saved" aria-labelledby="saved-title">
          <h3 className="ideas__title" id="saved-title">
            <Star size={16} aria-hidden="true" /> {t.savedTitle}
          </h3>
          <ul>
            {saved.map((s) => (
              <li key={s.id} className="saved">
                <button type="button" className="idea" disabled={disabled} onClick={() => onOpenSaved?.(s)}>
                  <span className="idea__text">{s.title}</span>
                  <ArrowUpRight className="idea__go" size={16} aria-hidden="true" />
                </button>
                <button type="button" className="saved__remove" aria-label={`${t.unsaveDashboard}: ${s.title}`} onClick={() => onRemoveSaved?.(s)}>
                  <X size={14} aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
      <section className="ideas" aria-labelledby="ideas-title">
        <h3 className="ideas__title" id="ideas-title">
          {t.ideas}
        </h3>
        <ul>
          {ideas.map((idea) => (
            <li key={idea.text}>
              <button type="button" className="idea" disabled={disabled} onClick={() => onIdea(idea)}>
                <span className="idea__icon">{idea.icon}</span>
                <span className="idea__text">{idea.text}</span>
                <ArrowUpRight className="idea__go" size={16} aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      </section>
    </main>
  )
}
