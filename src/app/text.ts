/** Fills {placeholders} in a translated template. */
export const fill = (template: string, values: Record<string, string>) => template.replace(/\{(\w+)\}/g, (_, k: string) => values[k] ?? '')
