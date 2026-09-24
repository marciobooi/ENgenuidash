import { Globe, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import ribbon from './assets/banner-graphical-element.svg'
import estatLogo from './assets/estat-logo-horizontal.svg'
import { Tooltip } from './components/tooltip'
import { APP_ABBR, LANGUAGES, type Lang, type Strings } from './i18n'
import './Header.css'

export function Header({ lang, t, onLangChange }: { lang: Lang; t: Strings; onLangChange: (l: Lang) => void }) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const current = LANGUAGES.find((l) => l.code === lang)!

  const close = () => {
    setOpen(false)
    buttonRef.current?.focus()
  }

  useEffect(() => {
    if (!open) return
    // Move focus into the panel so keyboard and screen-reader users land on the choices.
    listRef.current?.querySelector<HTMLButtonElement>('[aria-current="true"]')?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
    }
    const onClick = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onClick)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('mousedown', onClick)
    }
  }, [open])

  return (
    <header className="es-header">
      <div className="es-header__inner">
        <h1 className="es-header__title">
          <span className="es-header__title-full">{t.title}</span>
          <abbr className="es-header__title-abbr" title={t.title}>
            {APP_ABBR}
          </abbr>
        </h1>

        <div className="es-header__lang" ref={rootRef}>
          <Tooltip content={t.selectLanguage} placement="bottom">
            <button
              ref={buttonRef}
              type="button"
              className="ecl-button ecl-button--secondary es-header__lang-btn"
              aria-expanded={open}
              aria-controls="es-language-list"
              aria-label={`${t.changeLanguage} ${current.label}`}
              onClick={() => setOpen((o) => !o)}
            >
              <Globe className="es-header__globe" size={20} aria-hidden="true" focusable="false" />
              <span className="es-header__lang-text">{current.label}</span>
            </button>
          </Tooltip>

          {open && (
            <div
              ref={listRef}
              className="es-header__lang-list"
              id="es-language-list"
              role="dialog"
              aria-label={t.selectLanguage}
            >
              <div className="es-header__lang-head">
                <span className="es-header__lang-title">{t.selectLanguage}</span>
                <Tooltip content={t.close} placement="bottom">
                  <button type="button" className="es-header__lang-close" aria-label={t.close} onClick={close}>
                    <X size={22} aria-hidden="true" focusable="false" />
                  </button>
                </Tooltip>
              </div>
              <div className="es-header__lang-category">{t.officialLanguages}</div>
              <ul>
                {LANGUAGES.map((l) => (
                  <li key={l.code}>
                    <button
                      type="button"
                      lang={l.code}
                      className={`es-header__lang-item${l.code === lang ? ' es-header__lang-item--active' : ''}`}
                      aria-current={l.code === lang}
                      onClick={() => {
                        onLangChange(l.code)
                        close()
                      }}
                    >
                      <span className="es-header__lang-code">{l.code}</span>
                      {l.label}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div className="es-header__ribbon">
          <img alt="" src={ribbon} />
        </div>

        <a className="es-header__logo" href="https://ec.europa.eu/eurostat/" target="_blank" rel="noreferrer">
          <img alt={t.home} src={estatLogo} />
        </a>
      </div>
    </header>
  )
}
