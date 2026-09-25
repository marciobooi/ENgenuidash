import { ArrowUpRight } from 'lucide-react'
import type { ReactNode } from 'react'
import { StarsMark } from '../Icons'
import type { Strings } from '../i18n'

/** The first screen: a welcome, the message box and example questions. */
export function WelcomePage({
  t,
  composer,
  ideas,
  disabled,
  onIdea,
}: {
  t: Strings
  composer: ReactNode
  ideas: { icon: ReactNode; text: string }[]
  disabled: boolean
  onIdea: (text: string) => void
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
      <section className="ideas" aria-labelledby="ideas-title">
        <h3 className="ideas__title" id="ideas-title">
          {t.ideas}
        </h3>
        <ul>
          {ideas.map((idea) => (
            <li key={idea.text}>
              <button type="button" className="idea" disabled={disabled} onClick={() => onIdea(idea.text)}>
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
