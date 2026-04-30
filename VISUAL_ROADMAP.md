# AzVision 시각 품질 향상 로드맵

> Status note (2026-04-29): this is a Phase 1A historical planning artifact.
> Current visual/export work is tracked in `docs/ARCHITECTURE_VIEW_MVP_PLAN.md`,
> `docs/RAW_TOPOLOGY_DIFF_PLAN.md`, and `docs/PERSONAL_USE_READINESS_PLAN.md`.
> Do not use this file as the active implementation roadmap without first
> refreshing it against the current Architecture View, PDF export, snapshot
> compare, and raw topology diff baseline.

**작성일:** 2026-04-09  
**대상:** Phase 1A Live Topology + Cytoscape  
**작업 경로:** `/Users/gun/dev/azvision`

---

## 현재 상태 요약

### 구현 완료 항목
- ✅ Cytoscape canvas 기본 연동
- ✅ Node 타입별 스타일 (subscription, resourcegroup, resource, manual)
- ✅ Relation 타입별 스타일 (contains, manages, connects_to, secures, routes)
- ✅ Hover/Focus 상태 관리
- ✅ PNG export 기능
- ✅ Dark theme 기본 디자인 시스템

### 주요 개선 필요 영역
1. **디자인 polish** - 일관성, 여백, 타이포그래피, 시각 계층
2. **Cytoscape 스타일 체계** - node/edge 스타일 체계화, iconography
3. **Relation 색상 규칙** - 의미 기반 색상 체계 정립
4. **Iconography** - node type 별 아이콘 도입
5. **Minimap/Search/Filter/Export UX** - 탐색 및 내보내기 경험 개선

---

## 🚨 지금 수정해야 하는 것 (1 주 내 실행)

### 1. Cytoscape Node 스타일 체계 개선

#### 문제점
- 현재 모든 node 가 단색 background 만 사용
- Node type 과 resource type 을 시각적으로 구분하기 어려움
- Manual node 만 diamond shape 로 구분되나, 나머지 타입은 형태 차이가 미미

#### 수정 방안
```css
/* styles.css 또는 TopologyPage.tsx 내 Cytoscape style */
{
  selector: 'node[nodeType = "subscription"]',
  style: {
    shape: 'round-rectangle',
    width: 64,
    height: 32,
    'background-color': '#1d4ed8',
    'border-width': 2,
    'border-color': '#60a5fa',
    label: 'data(label)',
    'font-size': 11,
    'font-weight': '600',
  }
}

{
  selector: 'node[nodeType = "resourcegroup"]',
  style: {
    shape: 'round-rectangle',
    width: 48,
    height: 48,
    'background-color': '#2563eb',
    'border-width': 2,
    'border-color': '#93c5fd',
  }
}

{
  selector: 'node[nodeType = "resource"]',
  style: {
    shape: 'ellipse',
    width: 36,
    height: 36,
    'background-color': '#0ea5e9',
    'border-width': 1,
    'border-color': '#7dd3fc',
  }
}
```

#### Resource Type 별 색상 추가 (선택적)
```typescript
// TopologyPage.tsx 내 resourceTypeColor 맵 추가
const resourceTypeColors: Record<string, string> = {
  'microsoft.compute/virtualmachines': '#f59e0b',  // amber
  'microsoft.storage/storageaccounts': '#10b981',   // emerald
  'microsoft.network/virtualnetworks': '#8b5cf6',   // violet
  'microsoft.network/networksecuritygroups': '#ef4444', // red
  'microsoft.containerservice/managedclusters': '#06b6d4', // cyan
}
```

---

### 2. Relation 색상 규칙 체계화

#### 현재 상태
| Relation Type | Line Color | Style |
|--------------|------------|-------|
| contains | #64748b (slate) | solid |
| manages | #a78bfa (violet) | dashed |
| connects_to | #14b8a6 (teal) | solid |
| secures | #f59e0b (amber) | dashed |
| routes | #22c55e (green) | dotted |

#### 개선 방안
**의미 기반 색상 그룹화:**
- **계층 관계** (contains, manages): 차가운 색상계 (blue → violet)
- **네트워크 관계** (connects_to, routes): 중간 색상계 (teal → cyan)
- **보안 관계** (secures, policies): 따뜻한 색상계 (amber → red)

#### 수정 코드
```typescript
// TopologyPage.tsx style 배열 내 edge 스타일 통일
{
  selector: 'edge',
  style: {
    width: 2.5,
    'line-color': '#94a3b8',
    'target-arrow-color': '#94a3b8',
    'target-arrow-shape': 'triangle',
    'curve-style': 'bezier',
    'label': 'data(relationType)',
    'font-size': 9,
    'color': '#cbd5e1',
    'text-background-color': '#0f172a',
    'text-background-opacity': 0.9,
    'text-background-padding': 3,
    'text-rotation': 'autorotate',
  }
}
```

---

### 3. Iconography 기본 도입

#### 문제점
- Node type 을 shape 와 color 만 구분해야 함
- Resource type 을 빠르게 식별하기 어려움

#### 해결 방안
**Cytoscape + FA/SVG 아이콘 연동** (1 단계: 백그라운드 이미지)

```typescript
// TopologyPage.tsx 내 node 스타일에 background-image 추가
const nodeIcons: Record<string, string> = {
  'subscription': 'url(/icons/subscription.svg)',
  'resourcegroup': 'url(/icons/resourcegroup.svg)',
  'resource': 'url(/icons/resource.svg)',
  'manual': 'url(/icons/manual.svg)',
}

// style 배열 내
{
  selector: 'node[nodeType = "subscription"]',
  style: {
    'background-image': nodeIcons['subscription'],
    'background-fit': 'contain',
    'background-clip': 'none',
  }
}
```

#### 1 단계 대안: Emoji 기반 (즉시 적용 가능)
```typescript
// TopologyPage.tsx 내 label 포맷팅 함수 추가
function getNodeLabel(node: TopologyNode): string {
  const iconMap: Record<string, string> = {
    'subscription': '📦',
    'resourcegroup': '📁',
    'resource': '⚡',
    'manual': '✏️',
  }
  const icon = iconMap[node.node_type] ?? '◼️'
  return `${icon} ${node.display_name}`
}
```

---

### 4. Search/Filter 기본 UX 추가

#### 현재 문제
- 80 개 node 를 수동으로 찾기 어려움
- Node type 또는 resource type 으로 필터링 불가

#### 1 주 내 구현 가능한 최소 기능
```typescript
// TopologyPage.tsx 상태 추가
const [searchQuery, setSearchQuery] = useState('')
const [filterNodeType, setFilterNodeType] = useState<string>('all')

// 필터링 로직 추가
const filteredNodes = useMemo(() => {
  return (topology?.nodes ?? []).filter(node => {
    const matchesSearch = searchQuery === '' || 
      node.display_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      node.node_key.toLowerCase().includes(searchQuery.toLowerCase())
    
    const matchesType = filterNodeType === 'all' || node.node_type === filterNodeType
    
    return matchesSearch && matchesType
  })
}, [topology, searchQuery, filterNodeType])

// Cytoscape 에서 필터링된 node 만 강조
useEffect(() => {
  const cy = cyRef.current
  if (!cy) return
  
  cy.batch(() => {
    cy.nodes().forEach(node => {
      const isVisible = filteredNodes.some(n => n.node_key === node.id())
      if (isVisible) {
        node.style({ opacity: 1, display: 'element' })
      } else {
        node.style({ opacity: 0.15, display: 'element' })
      }
    })
  })
}, [filteredNodes])
```

#### UI 추가 (graph-toolbar 내)
```tsx
<div className="filter-toolbar">
  <input
    type="text"
    placeholder="Node 검색 (이름, key)..."
    value={searchQuery}
    onChange={(e) => setSearchQuery(e.target.value)}
    className="search-input"
  />
  <select
    value={filterNodeType}
    onChange={(e) => setFilterNodeType(e.target.value)}
    className="filter-select"
  >
    <option value="all">All Types</option>
    <option value="subscription">Subscription</option>
    <option value="resourcegroup">Resource Group</option>
    <option value="resource">Resource</option>
    <option value="manual">Manual</option>
  </select>
</div>
```

---

### 5. Export UX 개선

#### 현재 상태
- PNG export 만 지원
- Export 후 경로 확인이 불편함

#### 1 주 내 개선
```typescript
// Export 옵션 추가
const [exportFormat, setExportFormat] = useState<'png' | 'svg' | 'json'>('png')
const [exportScale, setExportScale] = useState(2)

async function handleExport() {
  const cy = cyRef.current
  if (!cy || !selectedWorkspaceId) return

  try {
    setExportLoading(true)
    
    let imageDataUrl: string
    if (exportFormat === 'svg') {
      imageDataUrl = cy.svg({ scale: exportScale, full: true })
    } else {
      imageDataUrl = cy.png({ scale: exportScale, full: true, bg: '#0b1220' })
    }

    const exportRecord = await createPngExport(selectedWorkspaceId, imageDataUrl)
    setLastExport(exportRecord)
    setExportMessage(`저장 완료: ${exportRecord.output_path}`)
    
    // Clipboard 복사 옵션 추가
    await navigator.clipboard.writeText(exportRecord.output_path)
  } catch (err) {
    setExportMessage(err instanceof Error ? err.message : 'Export failed')
  } finally {
    setExportLoading(false)
  }
}
```

---

## 📅 나중에 해도 되는 것 (Phase 1B+)

### 1. Minimap 구현
- Cytoscape `minimap` 확장 사용
- Large topology (100+ nodes) 에서 탐색성 개선
- **소요:** 2-3 일 (확장 라이브러리 학습 포함)

### 2. Advanced Filter Panel
- Multiple selection filter (checkbox group)
- Resource type 별 필터 (VM, Storage, Network 등)
- Location/Region 별 필터
- **소요:** 3-4 일

### 3. Node Detail Side Panel 개선
- 현재: 간단한 key-value list
- 개선: 탭 기반 구성 (Overview, Properties, Relations, Tags)
- **소요:** 2-3 일

### 4. Theme System
- Dark/Light mode 전환
- Custom color palette 설정
- **소요:** 2 일

### 5. Keyboard Shortcuts
- `F`: Fit view
- `R`: Relayout
- `S`: Toggle search
- `E`: Export
- **소요:** 1 일

### 6. Topology Comparison
- Snapshot 간 diff 시각화
- 시간 경과에 따른 변화 추적
- **소요:** 5-7 일

---

## 📋 1 주 실행 계획 (Pass Plan)

### Day 1-2: Cytoscape 스타일 체계 개선
- [ ] Node shape/size 일관성 확보
- [ ] Resource type 별 색상 맵 정의
- [ ] Edge 스타일 통일 (width, arrow, label)
- [ ] Legend 업데이트

### Day 3: Iconography 도입
- [ ] Emoji 기반 label 포맷팅 적용
- [ ] 또는 SVG icon 백그라운드 연동 테스트
- [ ] Node type 별 아이콘 매핑 정의

### Day 4: Search/Filter 기본 기능
- [ ] Search input UI 추가
- [ ] Node type filter dropdown 추가
- [ ] Cytoscape highlight 로직 연동
- [ ] Filter reset 버튼 추가

### Day 5: Export UX + Polish
- [ ] Export format 선택 (PNG/SVG)
- [ ] Scale 옵션 추가
- [ ] Export 성공 시 toast/notification
- [ ] Clipboard 복사 기능
- [ ] 전체적인 spacing/typography 검토

---

## 🎨 디자인 토큰 제안

### Color Palette
```css
:root {
  /* Background */
  --bg-primary: #0b1220;
  --bg-secondary: #0f172a;
  --bg-tertiary: #1e293b;
  
  /* Node Colors */
  --node-subscription: #1d4ed8;
  --node-resourcegroup: #2563eb;
  --node-resource: #0ea5e9;
  --node-manual: #f59e0b;
  
  /* Relation Colors */
  --edge-hierarchy: #6366f1;    /* contains, manages */
  --edge-network: #14b8a6;      /* connects_to, routes */
  --edge-security: #f59e0b;     /* secures */
  
  /* UI */
  --text-primary: #e5eefc;
  --text-secondary: #94a3b8;
  --border-color: rgba(148, 163, 184, 0.18);
}
```

### Typography
```css
:root {
  --font-family: 'Inter', system-ui, -apple-system, sans-serif;
  --font-size-xs: 11px;
  --font-size-sm: 13px;
  --font-size-base: 15px;
  --font-size-lg: 18px;
  --font-size-xl: 24px;
}
```

### Spacing
```css
:root {
  --spacing-xs: 8px;
  --spacing-sm: 12px;
  --spacing-md: 16px;
  --spacing-lg: 24px;
  --spacing-xl: 32px;
}
```

---

## ✅ 체크리스트 (1 주 완료 기준)

- [ ] Node shape/size 일관성 적용
- [ ] Resource type 색상 맵 적용 (최소 5 개 타입)
- [ ] Edge 스타일 통일
- [ ] Emoji icon 라벨 적용
- [ ] Search input 구현
- [ ] Node type filter 구현
- [ ] Export format 선택 추가
- [ ] Legend UI 업데이트
- [ ] 전체 spacing/typography 검토
- [ ] 반응형 레이아웃 확인

---

## 📝 참고 자료

- Cytoscape.js Style: https://js.cytoscape.org/#style
- Cytoscape Extensions: https://js.cytoscape.org/#extensions
- React + Cytoscape 예제: https://github.com/plotly/react-cytoscapejs
