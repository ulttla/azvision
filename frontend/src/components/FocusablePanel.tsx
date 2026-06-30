import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'

import { useI18n } from '../i18n/context'

type FocusablePanelProps = {
  /** Stable id for the focusable section; used for aria-controls and tests. */
  panelId: string
  /** Optional test id; falls back to `focusable-panel-${panelId}`. */
  testId?: string
  /** Heading text for the focus button aria-label and overlay title. */
  title: string
  /** Optional subtitle shown in the overlay header. */
  subtitle?: string
  /** Body class applied to the inner panel; useful for grid/canvas styling hooks. */
  bodyClassName?: string
  /** Container class applied to the focused overlay surface. */
  overlayClassName?: string
  /** Optional class added to the trigger button. */
  triggerClassName?: string
  /**
   * Custom class set applied to the wrapper. We pass `focused` / `collapsed`
   * automatically based on the focus state, plus `focusable-panel` always.
   */
  className?: string
  children: ReactNode
  /**
   * Notify the host when the focus state changes; used to coordinate global view focus mode.
   */
  onFocusChange?: (focused: boolean) => void
  /**
   * Disable the panel-level focus toggle (for example, when the host view is in view-focus mode).
   * When disabled, the trigger is hidden and ESC/external focus is suppressed.
   */
  disabled?: boolean
}

/**
 * FocusablePanel — wraps an existing panel element with a focus toggle.
 * - Adds an inline 🔍 button in the panel header
 * - On focus, the panel is promoted to a fixed-position overlay filling the viewport.
 *   The same DOM node is reused (no double-mount) so ref-based children like Cytoscape
 *   continue to work — we just re-style the wrapper.
 * - Press ESC or click the close button to exit
 * - Manages body scroll lock and notifies parents via onFocusChange
 */
export function FocusablePanel({
  panelId,
  testId,
  title,
  subtitle,
  bodyClassName,
  overlayClassName,
  triggerClassName,
  className,
  children,
  onFocusChange,
  disabled = false,
}: FocusablePanelProps) {
  const { t } = useI18n()
  const [focused, setFocused] = useState(false)
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const previousFocusRef = useRef<HTMLElement | null>(null)
  const bodyClass = 'focusable-panel-body-lock'
  const reactId = useId()
  const bodyId = `focusable-panel-body-${panelId}-${reactId}`

  const setFocusedSafe = useCallback(
    (next: boolean) => {
      setFocused(next)
      onFocusChange?.(next)
    },
    [onFocusChange],
  )

  useEffect(() => {
    if (!focused) {
      return
    }
    document.body.classList.add(bodyClass)
    previousFocusRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null
    const focusTimer = window.setTimeout(() => {
      triggerRef.current?.focus({ preventScroll: true })
    }, 0)
    return () => {
      window.clearTimeout(focusTimer)
      document.body.classList.remove(bodyClass)
      previousFocusRef.current?.focus({ preventScroll: true })
      previousFocusRef.current = null
    }
  }, [focused, bodyClass])

  useEffect(() => {
    if (!focused) {
      return
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Escape') {
        return
      }
      const target = event.target as HTMLElement | null
      const isEditableTarget =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        Boolean(target?.isContentEditable)
      if (isEditableTarget) {
        return
      }
      setFocusedSafe(false)
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [focused, setFocusedSafe])

  useEffect(() => {
    if (disabled && focused) {
      setFocusedSafe(false)
    }
  }, [disabled, focused, setFocusedSafe])

  const wrapperClassName = useMemo(() => {
    const base = `focusable-panel ${focused ? 'focused' : 'collapsed'}`
    if (className) {
      return `${base} ${className}`
    }
    return base
  }, [focused, className])

  const triggerLabel = focused ? t('focusMode.exitFocus') : t('focusMode.focusMode')

  return (
    <div
      className={wrapperClassName}
      data-testid={testId ?? `focusable-panel-${panelId}`}
      data-panel-id={panelId}
      data-focused={focused ? 'true' : 'false'}
    >
      <header className="focusable-panel-header" data-testid={`focusable-panel-header-${panelId}`}>
        <div className="focusable-panel-header-text">
          <span className="focusable-panel-title">{title}</span>
          {subtitle ? <span className="focusable-panel-subtitle">{subtitle}</span> : null}
        </div>
        {disabled ? null : (
          <button
            ref={triggerRef}
            type="button"
            className={`focusable-panel-trigger ${triggerClassName ?? ''}`}
            onClick={() => setFocusedSafe(!focused)}
            aria-pressed={focused}
            aria-controls={bodyId}
            data-testid={`focusable-panel-trigger-${panelId}`}
            aria-label={triggerLabel}
            title={triggerLabel}
          >
            {focused ? t('focusMode.exitIcon') : t('focusMode.enterIcon')}
            <span className="focusable-panel-trigger-label">{triggerLabel}</span>
          </button>
        )}
      </header>
      <div
        id={bodyId}
        className={`focusable-panel-body ${bodyClassName ?? ''} ${overlayClassName ?? ''}`}
        data-testid={`focusable-panel-body-${panelId}`}
      >
        {children}
      </div>
      {focused ? (
        <div
          className="focusable-panel-overlay-actions"
          role="presentation"
          data-testid={`focusable-panel-overlay-actions-${panelId}`}
        >
          <span className="focusable-panel-overlay-title" aria-hidden="true">
            {title}
          </span>
          <button
            type="button"
            className="focusable-panel-trigger focusable-panel-trigger-overlay"
            onClick={() => setFocusedSafe(false)}
            aria-label={t('focusMode.exitFocus')}
            title={t('focusMode.exitFocus')}
            data-testid={`focusable-panel-overlay-close-${panelId}`}
          >
            {t('focusMode.exitFocus')}
          </button>
        </div>
      ) : null}
    </div>
  )
}
