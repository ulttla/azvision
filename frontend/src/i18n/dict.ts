/**
 * Lightweight en/ko translation dictionary.
 * Keys are dot-delimited; every key must exist in both languages.
 */
export type Locale = 'en' | 'ko'

export type DictKey = keyof typeof dict.en

export const dict = {
  en: {
    // ── App Shell ──────────────────────────────────────────
    'shell.eyebrow': 'AzVision Workspace',
    'shell.title': 'Azure topology and architecture workspace',
    'shell.subtext':
      'Switch between topology exploration, presentation architecture, cost triage, and simulation planning.',
    'shell.loading': 'Loading AzVision workspace…',

    // ── Connectivity status row ───────────────────────────
    'status.backend': 'Backend',
    'status.auth': 'Auth',
    'status.topology': 'Topology',
    'status.online': 'online',
    'status.offline': 'offline',
    'status.checking': 'checking',
    'status.ready': 'ready',
    'status.notConfigured': 'not configured',
    'status.fresh': 'fresh',
    'status.stale': 'stale',
    'status.noData': 'no data',
    'status.refresh': 'Refresh status',
    'status.refreshing': 'Refreshing…',
    'status.refreshed': 'Status refreshed',
    'common.yes': 'yes',
    'common.no': 'no',
    'common.nodes': 'nodes',
    'aria.viewMode': 'AzVision view mode',
    'aria.toggleLanguage': 'Toggle language',

    // ── View toggle ───────────────────────────────────────
    'view.topology': 'Topology View',
    'view.architecture': 'Architecture View',
    'view.cost': 'Cost Insights',
    'view.simulation': 'Simulation',

    // ── Cost Page hero ────────────────────────────────────
    'cost.eyebrow': 'AzVision • Cost Intelligence',
    'cost.title': 'Rule-based cost analyst first pass',
    'cost.subtext':
      'This view turns the current Azure inventory into cost triage prompts. It does not claim actual spend yet; dollar mapping comes after Azure Cost Management ingestion.',
    'cost.refreshInsights': 'Refresh cost insights',
    'cost.refreshingInsights': 'Refreshing…',
    'cost.downloadReport': 'Download markdown report',
    'cost.preparingReport': 'Preparing report…',
    'cost.inventoryMode': 'Inventory mode',
    'cost.costIngestion': 'Cost ingestion',

    // ── Cost summary labels ───────────────────────────────
    'cost.label.costStatus': 'Cost status',
    'cost.label.resourcesAnalyzed': 'Resources analyzed',
    'cost.label.recommendations': 'Recommendations',
    'cost.label.severityMix': 'Severity mix',
    'cost.label.costDrivers': 'Cost drivers',
    'cost.label.tagGaps': 'Tag gaps',

    // ── Copilot panel ─────────────────────────────────────
    'copilot.heading': 'Read-only LLM copilot',
    'copilot.readOnly': 'read-only',
    'copilot.description':
      'Choose Ollama, OpenRouter, or the local rule-based fallback. Provider keys stay backend-only; this panel sends summarized current-view context.',
    'copilot.provider': 'Provider',
    'copilot.notConfigured': 'not configured',
    'copilot.attachContext': 'Attach current view context',
    'copilot.fallbackNote': 'not configured; rule-based fallback will answer',
    'copilot.thinking': 'Thinking…',
    'copilot.ask': 'Ask',
    'copilot.answer': 'answer',
    'copilot.providerLabel': 'Provider',
    'copilot.llmStatus': 'LLM',
    'copilot.model': 'Model',
    'copilot.suggestedChecks': 'Suggested next checks',

    // ── Cost recommendations ──────────────────────────────
    'cost.topRecommendations': 'Top recommendations',
    'cost.noRecommendations': 'No recommendations for this scope.',
    'cost.resourcesMostPrompts': 'Resources with most prompts',
    'cost.prompts': 'prompts',
    'cost.configured': 'configured',
    'cost.confidence': 'confidence',
    'cost.evidence': 'Evidence',
    'cost.drivers': 'Drivers',

    // ── Language toggle ───────────────────────────────────
    'lang.toggle': 'KO',

    // ── Error boundary ───────────────────────────────────
    'error.eyebrow': 'AzVision safety fallback',
    'error.title': 'Something went wrong',
    'error.subtext': 'The current view hit a render error. Reload the page to recover the local review session.',
    'error.reload': 'Reload page',
    'error.devDetails': 'Developer details',
  },

  ko: {
    // ── App Shell ──────────────────────────────────────────
    'shell.eyebrow': 'AzVision 워크스페이스',
    'shell.title': 'Azure 토폴로지 및 아키텍처 워크스페이스',
    'shell.subtext':
      '토폴로지 탐색, 프레젠테이션 아키텍처, 비용 분석, 시뮬레이션 계획을 전환하세요.',
    'shell.loading': 'AzVision 워크스페이스 로딩 중…',

    // ── Connectivity status row ───────────────────────────
    'status.backend': '백엔드',
    'status.auth': '인증',
    'status.topology': '토폴로지',
    'status.online': '온라인',
    'status.offline': '오프라인',
    'status.checking': '확인 중',
    'status.ready': '설정됨',
    'status.notConfigured': '미설정',
    'status.fresh': '최신',
    'status.stale': '오래됨',
    'status.noData': '데이터 없음',
    'status.refresh': '상태 새로고침',
    'status.refreshing': '새로고침 중…',
    'status.refreshed': '상태 갱신 완료',
    'common.yes': '예',
    'common.no': '아니오',
    'common.nodes': '개 노드',
    'aria.viewMode': 'AzVision 뷰 모드',
    'aria.toggleLanguage': '언어 전환',

    // ── View toggle ───────────────────────────────────────
    'view.topology': '토폴로지 뷰',
    'view.architecture': '아키텍처 뷰',
    'view.cost': '비용 인사이트',
    'view.simulation': '시뮬레이션',

    // ── Cost Page hero ────────────────────────────────────
    'cost.eyebrow': 'AzVision • 비용 인텔리전스',
    'cost.title': '규칙 기반 비용 분석 1차 패스',
    'cost.subtext':
      '현재 Azure 인벤토리를 비용 분석 프롬프트로 변환합니다. 아직 실제 지출을 표시하지 않으며, 비용 매핑은 Azure Cost Management 수집 후 제공됩니다.',
    'cost.refreshInsights': '비용 인사이트 새로고침',
    'cost.refreshingInsights': '새로고침 중…',
    'cost.downloadReport': '마크다운 리포트 다운로드',
    'cost.preparingReport': '리포트 준비 중…',
    'cost.inventoryMode': '인벤토리 모드',
    'cost.costIngestion': '비용 수집',

    // ── Cost summary labels ───────────────────────────────
    'cost.label.costStatus': '비용 상태',
    'cost.label.resourcesAnalyzed': '분석된 리소스',
    'cost.label.recommendations': '추천 항목',
    'cost.label.severityMix': '심각도 분포',
    'cost.label.costDrivers': '비용 동인',
    'cost.label.tagGaps': '태그 누락',

    // ── Copilot panel ─────────────────────────────────────
    'copilot.heading': '읽기 전용 LLM 코파일럿',
    'copilot.readOnly': '읽기 전용',
    'copilot.description':
      'Ollama, OpenRouter, 또는 로컬 규칙 기반 폴백을 선택하세요. 제공자 키는 백엔드 전용이며, 현재 뷰의 요약 컨텍스트가 전송됩니다.',
    'copilot.provider': '제공자',
    'copilot.notConfigured': '미설정',
    'copilot.attachContext': '현재 뷰 컨텍스트 첨부',
    'copilot.fallbackNote': '미설정; 규칙 기반 폴백으로 응답합니다',
    'copilot.thinking': '생각 중…',
    'copilot.ask': '질문',
    'copilot.answer': '응답',
    'copilot.providerLabel': '제공자',
    'copilot.llmStatus': 'LLM',
    'copilot.model': '모델',
    'copilot.suggestedChecks': '추천 후속 확인',

    // ── Cost recommendations ──────────────────────────────
    'cost.topRecommendations': '주요 추천 항목',
    'cost.noRecommendations': '이 범위에 대한 추천이 없습니다.',
    'cost.resourcesMostPrompts': '가장 많은 프롬프트가 있는 리소스',
    'cost.prompts': '프롬프트',
    'cost.configured': '설정 여부',
    'cost.confidence': '신뢰도',
    'cost.evidence': '근거',
    'cost.drivers': '동인',

    // ── Language toggle ───────────────────────────────────
    'lang.toggle': 'EN',

    // ── Error boundary ───────────────────────────────────
    'error.eyebrow': 'AzVision 안전 폴백',
    'error.title': '문제가 발생했습니다',
    'error.subtext': '현재 뷰에서 렌더링 오류가 발생했습니다. 로컬 검토 세션을 복구하려면 페이지를 새로고침하세요.',
    'error.reload': '페이지 새로고침',
    'error.devDetails': '개발자 세부 정보',
  },
} as const satisfies Record<Locale, Record<string, string>>
