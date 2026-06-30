import { useI18n } from '../i18n/context'

type PublicBetaOnboardingProps = {
  isFirstRun: boolean
  connectivityRefreshing: boolean
  expanded: boolean
  onToggle: () => void
  onOpenDemoPath: () => void | Promise<void>
  onRefreshConnectivity: () => void | Promise<void>
}

export function PublicBetaOnboarding({
  isFirstRun,
  connectivityRefreshing,
  expanded,
  onToggle,
  onOpenDemoPath,
  onRefreshConnectivity,
}: PublicBetaOnboardingProps) {
  const { t } = useI18n()
  const sectionId = 'public-beta-onboarding-body'
  const buttonId = 'public-beta-onboarding-toggle'

  return (
    <section
      className={`public-beta-onboarding ${isFirstRun ? 'first-run' : 'readiness-reminder'} ${expanded ? 'expanded' : 'collapsed'}`}
      aria-label={t('publicBeta.aria')}
      data-testid="public-beta-onboarding"
      data-first-run={isFirstRun ? 'true' : 'false'}
      data-expanded={expanded ? 'true' : 'false'}
    >
      <button
        id={buttonId}
        type="button"
        className="public-beta-onboarding-summary"
        onClick={onToggle}
        aria-expanded={expanded}
        aria-controls={sectionId}
        data-testid="public-beta-onboarding-toggle"
      >
        <span className="public-beta-onboarding-summary-text">
          <span className="public-beta-kicker">{t('publicBeta.kicker')}</span>
          <span className="public-beta-onboarding-summary-title">
            {isFirstRun ? t('publicBeta.firstRun.title') : t('publicBeta.title')}
          </span>
        </span>
        <span className="public-beta-onboarding-chevron" aria-hidden="true">
          {expanded ? '▾' : '▸'}
        </span>
      </button>
      <div
        id={sectionId}
        className="public-beta-onboarding-body"
        role="region"
        aria-labelledby={buttonId}
        hidden={!expanded}
        data-testid="public-beta-onboarding-body"
      >
        <p>{isFirstRun ? t('publicBeta.firstRun.subtext') : t('publicBeta.subtext')}</p>
        <ol className="public-beta-steps">
          <li>{t('publicBeta.step.demo')}</li>
          <li>{t('publicBeta.step.privateSmoke')}</li>
          <li>{t('publicBeta.step.approval')}</li>
        </ol>
        <div className="public-beta-actions">
          <button type="button" className="toolbar-button primary" onClick={onOpenDemoPath} data-testid="public-beta-demo-cta">
            {isFirstRun ? t('publicBeta.firstRun.cta.demo') : t('publicBeta.cta.demo')}
          </button>
          <button type="button" className="toolbar-button" onClick={onRefreshConnectivity} disabled={connectivityRefreshing}>
            {t('publicBeta.cta.status')}
          </button>
        </div>
      </div>
    </section>
  )
}
