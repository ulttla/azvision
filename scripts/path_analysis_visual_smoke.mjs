#!/usr/bin/env node
import { createRequire } from 'node:module';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

const require = createRequire(import.meta.url);

function loadPlaywright() {
  const candidates = [
    'playwright',
    '/opt/homebrew/lib/node_modules/playwright',
    '/usr/local/lib/node_modules/playwright',
  ];
  for (const candidate of candidates) {
    try {
      return require(candidate);
    } catch {
      // Try the next candidate.
    }
  }
  throw new Error('Playwright is required. Install it locally or make a global playwright package available.');
}

const { chromium } = loadPlaywright();

// Visual evidence smoke: this verifies that the Path Analysis panel renders,
// accepts filters, runs an analysis, and writes screenshots. Functional verdict
// semantics remain covered by backend tests; this script fails only when the UI
// flow cannot produce a rendered verdict/evidence panel.
const baseUrl = process.env.AZVISION_UI_URL || 'http://127.0.0.1:5173';
const outputDir = process.env.AZVISION_VISUAL_SMOKE_DIR || path.resolve('tmp/path-analysis-visual-smoke');
const protocol = process.env.AZVISION_PATH_PROTOCOL || 'Tcp';
const sourcePort = process.env.AZVISION_PATH_SOURCE_PORT || '50000';
const destinationPort = process.env.AZVISION_PATH_DESTINATION_PORT || '443';

async function cytoscapeHandle(page) {
  return page.evaluateHandle(() => {
    const container = document.querySelector('.__________cytoscape_container');
    const registry = container?._cyreg;
    return registry && (registry.cy || registry[0] || registry.instance || registry);
  });
}

async function resourceNodes(page) {
  const cyHandle = await cytoscapeHandle(page);
  return cyHandle.evaluate((cy) => {
    if (!cy?.nodes) {
      return [];
    }
    return cy.nodes()
      .map((node) => ({
        id: node.id(),
        label: node.data('label') || node.id(),
        nodeRef: node.data('nodeRef'),
        nodeType: node.data('nodeType'),
        resourceType: node.data('resourceType'),
      }))
      .filter((node) => node.nodeType === 'resource');
  });
}

async function tapNode(page, graph, nodeId) {
  await graph.scrollIntoViewIfNeeded();
  const triggered = await page.evaluate((id) => {
    const container = document.querySelector('.__________cytoscape_container');
    const registry = container?._cyreg;
    const cy = registry && (registry.cy || registry[0] || registry.instance || registry);
    const node = cy?.$id?.(id);
    if (!node || node.empty?.()) {
      return false;
    }
    node.trigger('tap');
    return true;
  }, nodeId);
  if (!triggered) {
    throw new Error(`Unable to locate rendered node ${nodeId}`);
  }
  await page.waitForTimeout(250);
}

async function main() {
  await mkdir(outputDir, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
    await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await page.waitForFunction(() => document.body.innerText.includes('Visible Summary'), null, { timeout: 30_000 });

    const graph = page.locator('.__________cytoscape_container').first();
    let nodes = await resourceNodes(page);
    if (nodes.length < 2) {
      const restoreButtons = await page.getByRole('button', { name: 'Restore' }).count();
      if (restoreButtons > 0) {
        await page.getByRole('button', { name: 'Restore' }).first().click();
      }
      await page.waitForFunction(() => {
        const container = document.querySelector('.__________cytoscape_container');
        const registry = container?._cyreg;
        const cy = registry && (registry.cy || registry[0] || registry.instance || registry);
        try {
          return cy?.nodes && cy.nodes().filter((node) => node.data('nodeType') === 'resource').length > 1;
        } catch {
          return false;
        }
      }, null, { timeout: 30_000 });
      nodes = await resourceNodes(page);
    }
    if (nodes.length < 2) {
      throw new Error(`Need at least two resource nodes, found ${nodes.length}`);
    }

    const source = nodes.find((node) => /virtualNetworks/i.test(node.resourceType || '')) || nodes[0];
    const destination = nodes.find((node) => node.id !== source.id && /networkSecurityGroups|routeTables|storageAccounts|sites|databases|networkInterfaces/i.test(node.resourceType || ''))
      || nodes.find((node) => node.id !== source.id)
      || nodes[1];

    await tapNode(page, graph, source.id);
    await page.getByRole('button', { name: 'Set as source' }).click();
    await tapNode(page, graph, destination.id);
    await page.getByRole('button', { name: 'Set as destination' }).click();
    await page.getByLabel('Path analysis protocol').fill(protocol);
    await page.getByLabel('Path analysis source port').fill(sourcePort);
    await page.getByLabel('Path analysis destination port').fill(destinationPort);
    await page.screenshot({ path: path.join(outputDir, 'before-analyze.png'), fullPage: true });

    await page.getByRole('button', { name: 'Analyze path' }).click();
    await page.waitForFunction(() => {
      const text = document.body.innerText;
      return text.includes('Verdict:') || text.includes('No network path') || text.includes('No path candidate');
    }, null, { timeout: 30_000 });

    await page.screenshot({ path: path.join(outputDir, 'result-full.png'), fullPage: true });
    await page.locator('article.detail-card').screenshot({ path: path.join(outputDir, 'result-panel.png') });

    const detailText = await page.locator('article.detail-card').innerText();
    const verdictMatch = detailText.match(/Verdict:\s*(allowed|blocked|unknown)/i);
    const summary = {
      ok: true,
      baseUrl,
      source: { label: source.label, nodeRef: source.nodeRef, resourceType: source.resourceType },
      destination: { label: destination.label, nodeRef: destination.nodeRef, resourceType: destination.resourceType },
      activeFilters: { protocol, sourcePort, destinationPort },
      verdict: verdictMatch?.[1]?.toLowerCase() || 'not-rendered',
      outputDir,
    };
    if (summary.verdict === 'not-rendered') {
      throw new Error('Path analysis verdict did not render in the detail panel');
    }
    console.log(JSON.stringify(summary, null, 2));
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error.stack || String(error));
  process.exit(1);
});
