// ECL's Select ships as plain JavaScript without type declarations.
declare module '@ecl/select' {
  export default class Select {
    constructor(element: HTMLElement, options?: Record<string, unknown>)
    /** The toggle button of the multiple select (after init). */
    input?: HTMLElement
    init(): void
    destroy(): void
    on(event: 'onToggle' | 'onSelection' | 'onSelectAll' | 'onReset' | 'onSearch', callback: (data: never) => void): void
  }
}
