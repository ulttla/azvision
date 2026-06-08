import { useI18n } from '../i18n/context'

type PublicBetaOnboardingProps = {
  isFirstRun: boolean
  connectivityRefreshing: boolean
  onOpenDemoPath: () => void | Promise<void>
  onRefreshConnectivity: () => void | Promise<void>
}

export function PublicBetaOnboarding({
  isFirstRun,
  connectivityRefreshing,
  onOpenDemoPath,
  onRefreshConnectivity,
}: PublicBetaOnboardingProps) {
  const { t } = useI18n()

  return (
    <section
      className={`public-beta-onboarding ${isFirstRun ? 'first-run' : 'readiness-reminder'}`}
      aria-label={t('publicBeta.aria')}
      data-testid="public-beta-onboarding"
      data-first-run={isFirstRun ? 'true' : 'false'}
    >
      <div>
        <p className="public-beta-kicker">{isFirstRun ? t('publicBeta.firstRun.kicker') : t('publicBeta.kicker')}</p>
        <h2>{isFirstRun ? t('publicBeta.firstRun.title') : t('publicBeta.title')}</h2>
        <p>{isFirstRun ? t('publicBeta.firstRun.subtext') : t('publicBeta.subtext')}</p>
      </div>
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
    </section>
  )
}
