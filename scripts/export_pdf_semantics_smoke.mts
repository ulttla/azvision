/**
 * Browserless FE semantics smoke — PDF export contracts.
 * Validates that TopologyPage and ArchitecturePage keep PNG -> PDF export
 * wiring explicit and that the API/backend route still accepts pdf exports.
 *
 * Run: node --experimental-strip-types scripts/export_pdf_semantics_smoke.mts
 */

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'

const repoRoot = path.resolve(import.meta.dirname, '..')
const architecturePage = readFileSync(path.join(repoRoot, 'frontend/src/pages/ArchitecturePage.tsx'), 'utf8')
const topologyPage = readFileSync(path.join(repoRoot, 'frontend/src/pages/TopologyPage.tsx'), 'utf8')
const apiCode = readFileSync(path.join(repoRoot, 'frontend/src/lib/api.ts'), 'utf8')
const exportsRoute = readFileSync(path.join(repoRoot, 'backend/app/api/routes/exports.py'), 'utf8')
const packageJson = readFileSync(path.join(repoRoot, 'frontend/package.json'), 'utf8')

function assertPdfExportContract(pageName: string, code: string, handlerPattern: RegExp) {
  assert.match(code, handlerPattern, `${pageName} should define a PDF export handler/path`)
  assert.match(code, /await import\('jspdf'\)/, `${pageName} should lazy-load jspdf for PDF export`)
  assert.match(code, /new jsPDF\(\{[^}]*orientation[^}]*unit:\s*'px'[^}]*format:\s*\[/s, `${pageName} should size the PDF from raster dimensions`)
  assert.match(code, /\.addImage\([^)]*'PNG'[^)]*\)/s, `${pageName} should embed the rasterized PNG into the PDF`)
  assert.match(code, /\.output\('datauristring'\)/, `${pageName} should export a data URI string for the backend`)
  assert.match(code, /createExport\([^)]*'pdf'[^)]*\)/s, `${pageName} should persist PDF output via createExport(..., 'pdf', ...)`)
  assert.match(code, /Export PDF|PDF export|format === 'pdf'|handleExportPdf/, `${pageName} should expose an explicit PDF action or branch`)
}

// ============================================================
// Section 1: Architecture View PDF export path
// ============================================================
assertPdfExportContract('ArchitecturePage', architecturePage, /async function handleExport\(format:\s*'png' \| 'pdf'\)/)
assert.match(architecturePage, /rasterizeSvg\(svgDiagram\.svg, svgDiagram\.width, svgDiagram\.height\)/, 'ArchitecturePage should rasterize SVG before PNG/PDF export')
assert.match(architecturePage, /image\.onerror = \(\) => reject\(new Error\('Failed to prepare architecture image for PDF export'\)\)/, 'ArchitecturePage should surface image preparation failures')

// ============================================================
// Section 2: Topology View PDF export path
// ============================================================
assertPdfExportContract('TopologyPage', topologyPage, /async function handleExportPdf\(\)/)
assert.match(topologyPage, /cy\.png\(/, 'TopologyPage should rasterize the Cytoscape canvas before PDF export')
assert.match(topologyPage, /Export PDF/, 'TopologyPage should render an Export PDF control')

// ============================================================
// Section 3: Frontend API type and backend route support
// ============================================================
assert.match(apiCode, /format:\s*'png' \| 'pdf'/, 'createExport should type PDF as a supported format')
assert.match(apiCode, /image_data_url:\s*imageDataUrl/, 'createExport should send image_data_url to the backend')
assert.match(exportsRoute, /SUPPORTED_EXPORT_FORMATS\s*=\s*\{[^}]*"png"[^}]*"pdf"[^}]*\}/s, 'backend export route should allow pdf')
assert.match(exportsRoute, /SUPPORTED_EXPORT_MIME_TYPES\s*=\s*\{[^}]*"image\/png"[^}]*"application\/pdf"[^}]*\}/s, 'backend export route should allow PDF data URLs')
assert.match(exportsRoute, /if mime_type not in SUPPORTED_EXPORT_MIME_TYPES:/, 'backend export route should validate export MIME types before writing')

// ============================================================
// Section 4: Smoke chain registration
// ============================================================
assert.match(packageJson, /export_pdf_semantics_smoke\.mts/, 'frontend smoke:semantics should include this PDF export smoke')

console.log('✅ export_pdf_semantics_smoke.mts: all assertions passed')
