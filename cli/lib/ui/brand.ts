/**
 * @fileoverview The ONLY repo-specific file of `cli/lib/ui/`.
 *
 * Every other file in this directory is byte-identical in agentic-qa-boilerplate
 * and agentic-dev-boilerplate (owner answer Q8). What differs between the two
 * products (name, accent, extra glossary terms) lives here and nowhere else.
 */

import type { GlossaryEntry } from './strings.ts';

export interface Brand {
  /** Product name in the title bar and the document title. */
  name: string
  /** Accent override for light and dark themes (CSS colours). null = the approved mockup amber. */
  accent: { light: string, dark: string } | null
  /** Glossary terms only this product needs, per language. */
  glossary: { es: Record<string, GlossaryEntry>, en: Record<string, GlossaryEntry> }
  /** The upstream `bun sync` syncs from when `UPEX_TEMPLATE_REPO` is unset. */
  templateRepo: string
  /** What `bun setup` downloads in its Install phase: the preflight proves those hosts answer (owner answer Q2). */
  setupDownloads: ('chromium' | 'skills')[]
}

export const BRAND: Brand = {
  name: 'Agentic Dev',
  accent: null,
  glossary: { es: {}, en: {} },
  templateRepo: 'upex-galaxy/agentic-dev-boilerplate',
  setupDownloads: ['skills'],
};
