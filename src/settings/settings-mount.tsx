/**
 * Settings page mount point.
 * Bridges the existing initSettingsPage() call in main.ts to
 * React rendering of the new SettingsApp component.
 */

import { createRoot } from 'react-dom/client'
import { createElement } from 'react'
import { SettingsApp } from './SettingsApp'

export function initSettingsPage(): void {
  const app = document.getElementById('app')
  if (!app) return

  const root = createRoot(app)
  root.render(createElement(SettingsApp))
}