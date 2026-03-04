/**
 * Main Application Logic
 *
 * Rejection logic:
 *   After parsing, if parser.isRejected === true:
 *     - Show a prominent red "C01 Rejected" banner explaining why.
 *     - Still render all stats so the engineer can diagnose.
 *   Reasons:
 *     1. unknownCount  > 0  — bars with no Avonmouth Layer/Set
 *     2. duplicateCount > 0 — duplicate GlobalIds
 *
 * Mesh stats use bar.Effective_Mesh_Layer (set by parser), which:
 *   - Prefers Avonmouth_Layer_Set when it is a mesh layer.
 *   - Falls back to ATK Layer Name inference ONLY when Avonmouth is null.
 */

let allData      = [];
let filteredData = [];
let cageAxis     = [0, 0, 1];
let cageAxisName = 'Z';

document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('ifc-file').addEventListener('change', e => {
        const f = e.target.files[0];
        document.getElementById('ifc-filename').textContent = f ? f.name : 'No file selected';
        document.getElementById('process-btn').disabled = !f;
    });
    document.getElementById('process-btn').addEventListener('click', processFile);

    // Drag-and-drop on the upload box
    const dropZone = document.getElementById('upload-drop-zone');
    if (dropZone) {
        dropZone.addEventListener('dragover', e => {
            e.preventDefault();
            dropZone.classList.add('drag-active');
        });
        dropZone.addEventListener('dragleave', e => {
            if (!dropZone.contains(e.relatedTarget)) dropZone.classList.remove('drag-active');
        });
        dropZone.addEventListener('drop', e => {
            e.preventDefault();
            dropZone.classList.remove('drag-active');
            const f = e.dataTransfer.files[0];
            if (!f) return;
            try {
                const dt = new DataTransfer();
                dt.items.add(f);
                document.getElementById('ifc-file').files = dt.files;
            } catch (_) { /* Safari: DataTransfer not supported */ }
            window._droppedFile = f;  // fallback reference for processFile
            document.getElementById('ifc-filename').textContent = f.name;
            document.getElementById('process-btn').disabled = false;
        });
    }

    document.getElementById('search-input').addEventListener('input', applyFilters);
    document.getElementById('bartype-filter').addEventListener('change', applyFilters);
    document.getElementById('export-excel-btn').addEventListener('click', () => exportCSV('rebar_analysis.csv'));
    document.getElementById('export-csv-btn').addEventListener('click',   () => exportCSV('rebar_analysis.csv'));

    // Pagination
    document.getElementById('page-prev').addEventListener('click', () => {
        if (currentPage > 1) { currentPage--; renderTable(); }
    });
    document.getElementById('page-next').addEventListener('click', () => {
        const totalPages = Math.ceil(filteredData.length / PAGE_SIZE);
        if (currentPage < totalPages) { currentPage++; renderTable(); }
    });

    // Sample files ZIP download
    const dlAllBtn = document.getElementById('download-all-samples-btn');
    if (dlAllBtn) dlAllBtn.addEventListener('click', downloadAllSamples);

    // Step detection (on demand — re-run option)
    const stepBtn = document.getElementById('run-step-btn');
    if (stepBtn) stepBtn.addEventListener('click', runStepDetection);
});

// ── Step reset on new file ─────────────────────────────────────────────
function _resetClashStep() {
    const res = document.getElementById('step-results');
    if (res) { res.classList.add('hidden'); }
    const tbody = document.getElementById('step-tbody');
    if (tbody) tbody.innerHTML = '';
    const wrap = document.getElementById('step-table-wrap');
    if (wrap) wrap.style.display = 'none';
    const btn = document.getElementById('run-step-btn');
    if (btn) { btn.textContent = '▶ Re-run Step Check'; btn.disabled = false; }
    // Reset Box 5
    _setBox5Step(false);
}

// ── Process ────────────────────────────────────────────────────────────

async function processFile() {
    // Use dropped file as fallback when DataTransfer sync fails (Safari)
    const file = document.getElementById('ifc-file').files[0] || window._droppedFile || null;
    window._droppedFile = null;
    if (!file) { alert('Please select an IFC file.'); return; }
    showProgress(); allData = [];
    _resetClashStep();
    try {
        if (typeof IFCParser === 'undefined') throw new Error('IFCParser not loaded.');
        updateProgress(20, 'Reading file…');
        const content = await readFile(file);
        if (!content.includes('IFCREINFORCINGBAR'))
            throw new Error('No reinforcing bars found in this file.');
        updateProgress(50, 'Analysing cage structure…');
        const parser = new IFCParser();
        allData = await parser.parseFile(content);
        if (!allData.length) throw new Error('No bars extracted.');
        cageAxis     = parser.cageAxis;
        cageAxisName = parser.cageAxisName;
        updateProgress(100, 'Complete!');
        setTimeout(() => {
            hideProgress();
            displayResults(parser);
            // Auto-run step detection to populate Box 5 (step indicator)
            _doStepDetection();
        }, 400);
    } catch (err) {
        console.error(err);
        alert(`Error: ${err.message}`);
        hideProgress();
    }
}

function readFile(file) {
    return new Promise((res, rej) => {
        const r = new FileReader();
        r.onload  = e => res(e.target.result);
        r.onerror = e => rej(e);
        r.readAsText(file);
    });
}

function showProgress()  { document.getElementById('progress-container').classList.remove('hidden'); }
function hideProgress()  { document.getElementById('progress-container').classList.add('hidden'); }
function updateProgress(pct, txt) {
    document.getElementById('progress-fill').style.width = pct + '%';
    document.getElementById('progress-text').textContent = txt;
}

// ── Top-level display ──────────────────────────────────────────────────

function displayResults(parser) {
    // ── Rejection banner ──────────────────────────────────────────────
    const banner = document.getElementById('rejection-banner');
    if (parser.isRejected) {
        const reasons = [];
        if (parser.unknownCount > 0)
            reasons.push(`${parser.unknownCount} bar${parser.unknownCount > 1 ? 's' : ''} with unknown Bar_Type (no ATK layer)`);
        if (parser.missingLayerCount > 0)
            reasons.push(`${parser.missingLayerCount} bar${parser.missingLayerCount > 1 ? 's' : ''} missing Avonmouth Layer/Set`);
        if (parser.duplicateCount > 0)
            reasons.push(`${parser.duplicateCount} duplicate GlobalId${parser.duplicateCount > 1 ? 's' : ''} detected`);
        if (parser.missingWeightCount > 0)
            reasons.push(`${parser.missingWeightCount} bar${parser.missingWeightCount > 1 ? 's' : ''} missing ATK/ICOS Weight (formula-only)`);
        document.getElementById('rejection-reasons').innerHTML = reasons
            .map(r => `<li>${r}</li>`).join('');
        banner.classList.remove('hidden');
    } else {
        banner.classList.add('hidden');
    }

    // ── Cage axis badge ───────────────────────────────────────────────
    const axisEl = document.getElementById('cage-axis-info');
    if (axisEl) axisEl.textContent = `${cageAxisName}-axis`;

    // ── Top stat cards ────────────────────────────────────────────────
    const meshBars    = allData.filter(b => b.Bar_Type === 'Mesh');
    const nonMeshBars = allData.filter(b => b.Bar_Type !== 'Mesh' && b.Bar_Type !== 'Unknown');
    // Use ATK/ICOS Weight (bar.Weight) for cage weight totals — authoritative per-bar pset value
    const w        = b => b.Weight || 0;
    const meshW    = meshBars.reduce((s, b)    => s + w(b), 0);
    const nonMeshW = nonMeshBars.reduce((s, b) => s + w(b), 0);
    // UDL uses Formula_Weight (π×r²×L×7777) — geometry-based, independent of ATK schedule rounding
    const fw        = b => b.Formula_Weight || 0;
    const meshFW    = meshBars.reduce((s, b)    => s + fw(b), 0);
    const nonMeshFW = nonMeshBars.reduce((s, b) => s + fw(b), 0);
    const udl       = meshFW > 0 ? nonMeshFW / meshFW : (meshW > 0 ? nonMeshW / meshW : 0);

    const guidCounts = new Map();
    allData.forEach(b => guidCounts.set(b.GlobalId, (guidCounts.get(b.GlobalId) || 0) + 1));
    const dupEntities = [...guidCounts.values()].reduce((s, c) => s + (c > 1 ? c : 0), 0);

    document.getElementById('total-count').textContent     = allData.length;
    document.getElementById('mesh-count').textContent      = meshBars.length;
    document.getElementById('unknown-count').textContent   = parser.unknownCount;
    document.getElementById('duplicate-count').textContent = dupEntities;
    document.getElementById('missing-weight-count').textContent = parser.missingWeightCount;
    document.getElementById('udl-value').textContent       = udl.toFixed(4);

    displayCageDimensionBoxes();
    displayBarTypeDistribution();
    displayMeshHorizontalStats();
    displayMeshHeightStats();
    displayLayerWeightStats();
    document.getElementById('results-section').classList.remove('hidden');
    applyFilters();

    // ── C01 detail cards ─────────────────────────────────────────────
    buildC01Cards(parser);

    // ── 3D viewer ─────────────────────────────────────────────────────
    init3DViewer(allData);
}

// ── Cage dimension + coupler boxes ─────────────────────────────────────
/**
 * Computes the bounding box of all bar start/end points in global X/Y/Z.
 * Box1=Width(X), Box2=Length(Y), Box3=Height(Z), Box4=Couplered Bars, Box5=TBD
 */
function displayCageDimensionBoxes() {
    // ── Avonmouth-confirmed mesh bars only (Bar_Type=Mesh, not ATK-inferred) ──
    // Dimension boxes use ONLY properly Avonmouth-pset bars to avoid contamination
    // from non-mesh bars or bars with missing IFC data.
    const meshBars = allData.filter(b =>
        b.Bar_Type === 'Mesh' &&
        b.Mesh_Source !== 'ATK-inferred' &&
        b.Start_X !== null
    );
    const barsForDims = meshBars;  // no fallback — show '—' if no confirmed mesh bars

    // ── Height: Z-span of vertical mesh bars (centreline-to-centreline) ─────────────────
    const vertBars = barsForDims.filter(b => b.Orientation === 'Vertical');
    const barsForHL = vertBars.length ? vertBars : barsForDims;  // fallback if no vert bars

    let minZ=Infinity, maxZ=-Infinity;
    barsForHL.forEach(b => {
        minZ = Math.min(minZ, b.Start_Z, b.End_Z);
        maxZ = Math.max(maxZ, b.Start_Z, b.End_Z);
    });
    const heightVal = isFinite(minZ) ? maxZ - minZ : null;

    // ── Width & Length: horizontal extents of ALL mesh bars + half-dia outer-face ────────
    // For any cage orientation, the two horizontal axes are X and Y.
    // Length = the LARGER horizontal span (cage long plan dimension)
    // Width  = the SMALLER horizontal span (cage thickness)
    // Each span adds half-diameter of the outermost bar on each side (outer-face to outer-face).
    let minXspan=Infinity,maxXspan=-Infinity,minYspan=Infinity,maxYspan=-Infinity;
    let minXbar=null, maxXbar=null, minYbar=null, maxYbar=null;
    barsForDims.forEach(b => {
        const dia = b.Size || b.NominalDiameter_mm || 0;
        const sx = b.Start_X, ex = b.End_X;
        const sy = b.Start_Y, ey = b.End_Y;
        [sx,ex].forEach(x => {
            if (x < minXspan) { minXspan = x; minXbar = dia; }
            if (x > maxXspan) { maxXspan = x; maxXbar = dia; }
        });
        [sy,ey].forEach(y => {
            if (y < minYspan) { minYspan = y; minYbar = dia; }
            if (y > maxYspan) { maxYspan = y; maxYbar = dia; }
        });
    });
    const spanX = isFinite(minXspan) ? (maxXspan - minXspan) + (maxXbar/2) + (minXbar/2) : null;
    const spanY = isFinite(minYspan) ? (maxYspan - minYspan) + (maxYbar/2) + (minYbar/2) : null;
    // Length = larger of X/Y spans; Width = smaller
    let widthVal = null, lengthVal = null;
    if (spanX !== null && spanY !== null) {
        lengthVal = Math.max(spanX, spanY);
        widthVal  = Math.min(spanX, spanY);
    } else {
        lengthVal = spanX ?? spanY;
        widthVal  = null;
    }

    const fmt = v => v !== null && isFinite(v) ? Math.round(v).toLocaleString() + ' mm' : '—';
    document.getElementById('dim-width').textContent  = fmt(widthVal);
    document.getElementById('dim-length').textContent = fmt(lengthVal);
    document.getElementById('dim-height').textContent = fmt(heightVal);

    // Box4: Couplered Bars — VS/HS/LB Avonmouth layer AND 'CPLR' in ATK name
    const hasCoupler = allData.some(b => {
        const av  = (b.Avonmouth_Layer_Set || '').toUpperCase();
        const atk = (b.ATK_Layer_Name || '').toUpperCase();
        return /^(VS|HS|LB)\d*$/.test(av) && atk.includes('CPLR');
    });
    const couplerEl = document.getElementById('dim-coupler');
    couplerEl.textContent = hasCoupler ? 'Yes' : 'No';
    couplerEl.className   = 'dim-value ' + (hasCoupler ? 'dim-yes' : 'dim-no');
}

// ── Helpers ────────────────────────────────────────────────────────────

function dotCage(b) {
    return Math.abs(b.Dir_X * cageAxis[0] + b.Dir_Y * cageAxis[1] + b.Dir_Z * cageAxis[2]);
}
function isHoriz(b) { return b.Dir_X !== null && dotCage(b) < 0.5; }

/**
 * Count unique horizontal bar POSITIONS for the given bars.
 *
 * The parser's tagStaggerClusters() has already done the 2-D average-linkage
 * work (dX ≥ 20 mm guard + dZ ≤ 100 mm average-linkage), stamping each bar with
 * a Stagger_Cluster_ID like "F1A_H03".  Here we just count distinct IDs.
 *
 * Falls back to counting bars directly if Stagger_Cluster_ID is not set
 * (e.g. non-mesh bars shown in diagnostic mode).
 */
function countUniqueHorizPositions(hBars) {
    if (!hBars.length) return { count: 0 };

    // Fast path: parser already assigned cluster IDs — just count distinct ones
    const tagged = hBars.filter(b => b.Stagger_Cluster_ID);
    if (tagged.length > 0) {
        const ids = new Set(tagged.map(b => b.Stagger_Cluster_ID));
        return { count: ids.size };
    }

    // Fallback: no cluster IDs (shouldn't happen for mesh bars) — count raw bars
    return { count: hBars.length };
}

/**
 * Height extent of a set of bars in global Z.
 * Horizontal bars (|dz|<0.5) have their structural position captured by Z,
 * so using global Z (not cage-axis projection) gives the correct height range
 * for both upright cages (cage axis=Z) and sideways cages (cage axis=X).
 */
function heightAlongAxis(bars) {
    if (!bars.length) return null;
    let mn = Infinity, mx = -Infinity;
    bars.forEach(b => {
        if (b.Start_Z === null) return;
        mn = Math.min(mn, b.Start_Z, b.End_Z);
        mx = Math.max(mx, b.Start_Z, b.End_Z);
    });
    return isFinite(mn) ? { min: mn, max: mx, height: mx - mn } : null;
}

// ── Bar type distribution ──────────────────────────────────────────────

function displayBarTypeDistribution() {
    const grid = document.getElementById('bar-types-grid');
    grid.innerHTML = '';
    const counts = {};
    allData.forEach(b => { const t = b.Bar_Type||'Unknown'; counts[t]=(counts[t]||0)+1; });
    Object.entries(counts).sort((a,b)=>b[1]-a[1]).forEach(([type,count]) => {
        const card = document.createElement('div');
        card.className = 'bar-type-card' + (type === 'Unknown' && count > 0 ? ' danger' : '');
        card.innerHTML = `<div class="type-name">${type}</div><div class="type-count">${count}</div>`;
        grid.appendChild(card);
    });
}

// ── BLOCK 1: Horizontal bars per mesh layer ────────────────────────────
/**
 * Uses bar.Effective_Mesh_Layer (set by parser).
 * For bars inferred via ATK fallback (av_layer was null), they are included
 * so the stats display correctly — but the cage is still marked rejected.
 *
 * Counts UNIQUE POSITIONS (collapses split-segment bars).
 */
function displayMeshHorizontalStats() {
    const container = document.getElementById('mesh-horizontal-grid');
    container.innerHTML = '';
    const layerMap = {};
    // AVONMOUTH-CONFIRMED ONLY: only bars where Avonmouth_Layer_Set explicitly matches
    // a mesh pattern (/^[FN]\d+A$/i). ATK-inferred unknowns are deliberately excluded
    // so the counts reflect only properly described cage bars.
    allData.forEach(bar => {
        const av = bar.Avonmouth_Layer_Set;
        if (!av || !/^[FN]\d+A$/i.test(av)) return;  // must have Avonmouth mesh layer
        const layer = bar.Effective_Mesh_Layer;
        if (!layer) return;
        if (!layerMap[layer]) layerMap[layer] = [];
        layerMap[layer].push(bar);
    });

    const sortedLayers = Object.keys(layerMap).sort();
    sortedLayers.forEach(layer => {
        const bars  = layerMap[layer];
        const hBars = bars.filter(b => b.Orientation === 'Horizontal');
        const { count: hCount } = countUniqueHorizPositions(hBars);
        const sizes  = hBars.map(b => b.Size).filter(s => s > 0);
        const minDia = sizes.length ? Math.min(...sizes) : null;
        const maxDia = sizes.length ? Math.max(...sizes) : null;
        const diaStr = minDia === null ? '—'
            : minDia === maxDia ? `⌀${minDia}`
            : `⌀${minDia} – ⌀${maxDia}`;

        const card = document.createElement('div');
        card.className = 'mesh-stat-card';
        card.innerHTML = `
            <div class="mesh-layer-name">${layer}</div>
            <div class="mesh-stat-value">${hCount}</div>
            <div class="mesh-stat-label">horizontal bars</div>
            <div class="mesh-stat-dia">${diaStr} mm</div>`;
        container.appendChild(card);
    });

    if (!sortedLayers.length)
        container.innerHTML = '<p class="no-data">No mesh layers found.</p>';
}

// ── BLOCK 2: Cage height per mesh layer ───────────────────────────────

function displayMeshHeightStats() {
    const container = document.getElementById('mesh-height-grid');
    container.innerHTML = '';
    const layerMap = {};
    // AVONMOUTH-CONFIRMED ONLY: same scope as horizontal bar count stats.
    // ATK-inferred bars are excluded from the layer map entirely.
    allData.forEach(bar => {
        const av = bar.Avonmouth_Layer_Set;
        if (!av || !/^[FN]\d+A$/i.test(av)) return;
        const layer = bar.Effective_Mesh_Layer;
        if (!layer) return;
        if (!layerMap[layer]) layerMap[layer] = [];
        layerMap[layer].push(bar);
    });

    const sortedLayers = Object.keys(layerMap).sort();
    sortedLayers.forEach(layer => {
        const bars  = layerMap[layer];
        const hBars = bars.filter(b => b.Orientation === 'Horizontal');
        const vBars = bars.filter(b => b.Orientation === 'Vertical');

        // All bars in this layerMap are Avonmouth-confirmed (av filter above),
        // so no need to further exclude ATK-inferred bars here.
        const h = heightAlongAxis(bars);

        const hSizes = hBars.map(b => b.Size).filter(s => s > 0);
        const hMin   = hSizes.length ? Math.min(...hSizes) : null;
        const hMax   = hSizes.length ? Math.max(...hSizes) : null;
        const hDia   = hMin === null ? '—'
            : hMin === hMax ? `⌀${hMin}` : `⌀${hMin}–⌀${hMax}`;

        const vSizes = vBars.map(b => b.Size).filter(s => s > 0);
        const vMin   = vSizes.length ? Math.min(...vSizes) : null;
        const vMax   = vSizes.length ? Math.max(...vSizes) : null;
        const vDia   = vMin === null ? '—'
            : vMin === vMax ? `⌀${vMin}` : `⌀${vMin}–⌀${vMax}`;

        const card = document.createElement('div');
        card.className = 'mesh-stat-card height-card';
        card.innerHTML = `
            <div class="mesh-layer-name">${layer}</div>
            <div class="mesh-stat-value">${h ? Math.round(h.height).toLocaleString() : '—'}</div>
            <div class="mesh-stat-label">mm cage height</div>
            <div class="mesh-stat-sub">
                ↓ ${h ? Math.round(h.min).toLocaleString() : '—'} &nbsp;|&nbsp; ↑ ${h ? Math.round(h.max).toLocaleString() : '—'}
            </div>
            <div class="mesh-dia-row">
                <span class="mesh-stat-dia dia-horiz" title="Horizontal bars">↔ ${hDia}</span>
                <span class="mesh-stat-dia dia-vert"  title="Vertical bars">↕ ${vDia}</span>
            </div>`;
        container.appendChild(card);
    });

    if (!sortedLayers.length)
        container.innerHTML = '<p class="no-data">No mesh layers found.</p>';
}

// ── BLOCK 3: Weight per layer ──────────────────────────────────────────

function displayLayerWeightStats() {
    const container = document.getElementById('layer-weight-tbody');
    container.innerHTML = '';
    const layerMap = {};
    allData.forEach(bar => {
        // ATK-inferred mesh bars (Bar_Type=Mesh, Avonmouth_Layer_Set=null) are grouped by their
        // inferred layer name with a ⚑ marker, so they don't land in the generic 'Unknown' row.
        const layer = bar.Avonmouth_Layer_Set
            || (bar.Bar_Type === 'Mesh' && bar.Effective_Mesh_Layer
                ? bar.Effective_Mesh_Layer + ' \u2691'
                : null)
            || 'Unknown';
        const isInferred = !bar.Avonmouth_Layer_Set && bar.Bar_Type === 'Mesh';
        if (!layerMap[layer]) layerMap[layer] = { count: 0, weight: 0, type: bar.Bar_Type || 'Unknown', inferred: isInferred };
        layerMap[layer].count++;
        // Use ATK/ICOS Weight (bar.Weight) — authoritative per-bar value from pset
        layerMap[layer].weight += bar.Weight || 0;
    });

    const rows        = Object.entries(layerMap).sort((a, b) => a[0].localeCompare(b[0]));
    const totalWeight = rows.reduce((s, [, v]) => s + v.weight, 0);
    rows.forEach(([layer, data]) => {
        const pct       = totalWeight > 0 ? (data.weight / totalWeight * 100) : 0;
        const isUnknown  = layer === 'Unknown';
        const isInferred = !!data.inferred;
        const tr         = document.createElement('tr');
        if (isUnknown) tr.className = 'danger-row';
        else if (isInferred) tr.className = 'inferred-row';
        const displayLayer = isInferred
            ? layer.replace(' \u2691', '') + ' <span class="inferred-badge" title="ATK-inferred layer — no Avonmouth pset in IFC">\u2691 ATK-inferred</span>'
            : layer;
        tr.innerHTML = `
            <td><strong>${isInferred ? displayLayer : layer}</strong>${isUnknown ? ' ⚠' : ''}</td>
            <td><span class="bar-type-badge ${(data.type || '').toLowerCase().replace(/\s+/g, '-')}">${data.type}</span></td>
            <td>${data.count.toLocaleString()}</td>
            <td>${data.weight.toFixed(1)}</td>
            <td>
                <div class="weight-bar-wrap">
                    <div class="weight-bar-fill" style="width:${pct.toFixed(1)}%"></div>
                    <span class="weight-bar-pct">${pct.toFixed(1)}%</span>
                </div>
            </td>`;
        container.appendChild(tr);
    });
    const totalRow = document.createElement('tr');
    totalRow.className = 'total-row';
    totalRow.innerHTML = `
        <td colspan="2"><strong>TOTAL</strong></td>
        <td><strong>${allData.length.toLocaleString()}</strong></td>
        <td><strong>${totalWeight.toFixed(1)}</strong></td>
        <td></td>`;
    container.appendChild(totalRow);
}

// ── Filterable table ───────────────────────────────────────────────────

const PAGE_SIZE = 100;
let currentPage = 1;

function applyFilters() {
    const search  = document.getElementById('search-input').value.toLowerCase().trim();
    const barType = document.getElementById('bartype-filter').value;
    filteredData = allData.filter(bar => {
        if (barType !== 'all' && bar.Bar_Type !== barType) return false;
        if (search) {
            const txt = [
                bar.Shape_Code, bar.Shape_Code_Base, bar.Coupler_Suffix, bar.Coupler_Type,
                bar.Avonmouth_Layer_Set, bar.Bar_Type, bar.Size, bar.Length,
                bar.Rebar_Mark, bar.Full_Rebar_Mark, bar.Bar_Shape, bar.Orientation,
                bar.ATK_Layer_Name, bar.GlobalId, bar.Avonmouth_ID,
            ].map(v => v == null ? '' : String(v)).join(' ').toLowerCase();
            if (!txt.includes(search)) return false;
        }
        return true;
    });
    currentPage = 1;
    renderTable();
}

function renderTable() {
    const tbody = document.getElementById('results-tbody');
    tbody.innerHTML = '';

    const totalPages = Math.max(1, Math.ceil(filteredData.length / PAGE_SIZE));
    if (currentPage > totalPages) currentPage = totalPages;
    const start = (currentPage - 1) * PAGE_SIZE;
    const slice = filteredData.slice(start, start + PAGE_SIZE);

    slice.forEach(bar => {
        const isUnknown = bar.Bar_Type === 'Unknown';
        const tr = document.createElement('tr');
        if (isUnknown) tr.className = 'danger-row';

        const baseCode     = bar.Shape_Code_Base || bar.Shape_Code || '—';
        const couplerBadge = bar.Coupler_Suffix
            ? `<span class="coupler-badge" title="${bar.Coupler_Type || bar.Coupler_Suffix}">${bar.Coupler_Suffix}</span>`
            : '';

        tr.innerHTML = `
            <td class="col-shape">${baseCode}${couplerBadge}</td>
            <td>${bar.Avonmouth_Layer_Set || '—'}</td>
            <td><span class="bar-type-badge ${(bar.Bar_Type || '').toLowerCase().replace(/\s+/g, '-')}">${bar.Bar_Type || 'Unknown'}</span></td>
            <td>${bar.Size ? bar.Size + ' mm' : '—'}</td>
            <td>${bar.Length ? Number(bar.Length).toLocaleString() + ' mm' : '—'}</td>
            <td>${bar.Rebar_Mark || '—'}</td>
            <td>${bar.Bar_Shape || '—'}</td>`;
        tbody.appendChild(tr);
    });

    // Update count badge
    const countEl = document.getElementById('result-count');
    if (countEl) countEl.textContent = `${filteredData.length} bars`;

    // Pagination controls
    const pager = document.getElementById('table-pagination');
    if (!pager) return;
    if (totalPages <= 1) {
        pager.classList.add('hidden');
        return;
    }
    pager.classList.remove('hidden');
    document.getElementById('page-info').textContent =
        `Page ${currentPage} of ${totalPages}  (${filteredData.length} bars)`;
    document.getElementById('page-prev').disabled = currentPage <= 1;
    document.getElementById('page-next').disabled = currentPage >= totalPages;
}

// ── Export ─────────────────────────────────────────────────────────────

function exportCSV(filename) {
    if (!allData.length) { alert('No data to export.'); return; }
    const headers = ['GlobalId','Name','Avonmouth_Layer','ATK_Layer_Name','Effective_Mesh_Layer',
                     'Bar_Type','Orientation','Shape_Code','Shape_Code_Base','Coupler_Suffix','Coupler_Type',
                     'Bar_Shape','Size_mm','Weight_kg','Length_mm','Rebar_Mark','Full_Rebar_Mark',
                     'Avonmouth_ID','Start_X','Start_Y','Start_Z','End_X','End_Y','End_Z',
                     'Dir_X','Dir_Y','Dir_Z','Stagger_Cluster_ID','Cage_Axis'];
    let csv = headers.join(',') + '\n';
    allData.forEach(b => {
        const row = [
            b.GlobalId||'', b.Name||'',
            b.Avonmouth_Layer_Set||'', b.ATK_Layer_Name||'', b.Effective_Mesh_Layer||'',
            b.Bar_Type||'', b.Orientation||'',
            b.Shape_Code||'', b.Shape_Code_Base||'', b.Coupler_Suffix||'', b.Coupler_Type||'',
            b.Bar_Shape||'',
            b.Size||'', b.Weight||b.Calculated_Weight||'', b.Length||'',
            b.Rebar_Mark||'', b.Full_Rebar_Mark||'',
            b.Avonmouth_ID||'',
            b.Start_X!==null?b.Start_X.toFixed(1):'', b.Start_Y!==null?b.Start_Y.toFixed(1):'', b.Start_Z!==null?b.Start_Z.toFixed(1):'',
            b.End_X  !==null?b.End_X.toFixed(1):'',   b.End_Y  !==null?b.End_Y.toFixed(1):'',   b.End_Z  !==null?b.End_Z.toFixed(1):'',
            b.Dir_X  !==null?b.Dir_X.toFixed(4):'',   b.Dir_Y  !==null?b.Dir_Y.toFixed(4):'',   b.Dir_Z  !==null?b.Dir_Z.toFixed(4):'',
            b.Stagger_Cluster_ID||'',
            cageAxisName
        ].map(v => { const s = String(v); return s.includes(',') ? `"${s}"` : s; });
        csv += row.join(',') + '\n';
    });
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = filename; a.click();
}

// ══════════════════════════════════════════════════════════════════════════
// C01 DETAIL CARDS — build popup-table URLs and show/hide cards
// ══════════════════════════════════════════════════════════════════════════

/**
 * Builds a self-contained HTML page (as a data: URL) showing a table of
 * the given bars with: GlobalId, Rebar Mark, Length, Shape Code, Size.
 * Returns the URL string.
 */
function buildDetailPageURL(title, bars) {
    const rows = bars.map(b => `
        <tr>
            <td>${b.GlobalId || '—'}</td>
            <td>${b.Rebar_Mark || b.Full_Rebar_Mark || '—'}</td>
            <td>${b.Length ? Number(b.Length).toLocaleString() + ' mm' : '—'}</td>
            <td>${b.Shape_Code_Base || b.Shape_Code || '—'}${b.Coupler_Suffix ? ' <span class="badge">' + b.Coupler_Suffix + '</span>' : ''}</td>
            <td>${b.Size ? b.Size + ' mm' : '—'}</td>
            <td>${b.Avonmouth_Layer_Set || '—'}</td>
            <td>${b.ATK_Layer_Name || '—'}</td>
        </tr>`).join('');

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>${title}</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:system-ui,sans-serif;background:#f7f7fb;color:#222;padding:24px}
  h1{font-size:1.2rem;margin-bottom:4px;color:#c53030}
  .sub{font-size:.8rem;color:#666;margin-bottom:20px}
  table{width:100%;border-collapse:collapse;background:white;border-radius:10px;overflow:hidden;
        box-shadow:0 2px 12px rgba(0,0,0,.08)}
  th{background:#2d3748;color:white;padding:10px 12px;font-size:.78rem;text-align:left;
     text-transform:uppercase;letter-spacing:.05em}
  td{padding:8px 12px;font-size:.82rem;border-bottom:1px solid #eee}
  tr:last-child td{border-bottom:none}
  tr:nth-child(even){background:#fafafa}
  .badge{display:inline-block;background:#f56565;color:white;border-radius:8px;
         padding:1px 6px;font-size:.68rem;font-weight:700;margin-left:4px}
  .count{font-weight:700;color:#c53030;font-size:1rem;margin-bottom:16px}
</style>
</head>
<body>
<h1>C01 Rejection Detail — ${title}</h1>
<p class="sub">Generated by IFC Rebar Analyzer | ${new Date().toLocaleString()}</p>
<p class="count">${bars.length} bar${bars.length !== 1 ? 's' : ''}</p>
<table>
  <thead>
    <tr><th>GlobalId</th><th>Rebar Mark</th><th>Length</th><th>Shape Code</th><th>Size</th><th>Layer</th><th>ATK Layer</th></tr>
  </thead>
  <tbody>${rows}</tbody>
</table>
</body></html>`;

    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    return URL.createObjectURL(blob);
}

function buildC01Cards(parser) {
    const row = document.getElementById('c01-cards-row');

    // Unknown bars card (Bar_Type === 'Unknown' — no ATK layer match)
    const unknownCard = document.getElementById('c01-unknown-card');
    if (parser.unknownCount > 0) {
        document.getElementById('c01-unknown-count').textContent = parser.unknownCount;
        const url = buildDetailPageURL('Unknown Bars', parser.unknownBars || allData.filter(b => b.Bar_Type === 'Unknown'));
        document.getElementById('c01-unknown-link').href = url;
        unknownCard.classList.remove('hidden');
    } else {
        unknownCard.classList.add('hidden');
    }

    // Missing Avonmouth layer card (Avonmouth_Layer_Set === null, any Bar_Type)
    const missingLayerCard = document.getElementById('c01-missing-layer-card');
    if (missingLayerCard) {
        if (parser.missingLayerCount > 0) {
            document.getElementById('c01-missing-layer-count').textContent = parser.missingLayerCount;
            const url = buildDetailPageURL('Missing Avonmouth Layer', parser.missingLayerBars || allData.filter(b => !b.Avonmouth_Layer_Set));
            document.getElementById('c01-missing-layer-link').href = url;
            missingLayerCard.classList.remove('hidden');
        } else {
            missingLayerCard.classList.add('hidden');
        }
    }

    // Duplicate bars card
    const dupCard = document.getElementById('c01-dup-card');
    if (parser.duplicateCount > 0) {
        document.getElementById('c01-dup-count').textContent = parser.duplicateCount;
        const dupBars = parser.duplicateBars || allData.filter(b => {
            const guidCounts = new Map();
            allData.forEach(x => guidCounts.set(x.GlobalId, (guidCounts.get(x.GlobalId) || 0) + 1));
            return (guidCounts.get(b.GlobalId) || 0) > 1;
        });
        const url = buildDetailPageURL('Duplicate GlobalIds', dupBars);
        document.getElementById('c01-dup-link').href = url;
        dupCard.classList.remove('hidden');
    } else {
        dupCard.classList.add('hidden');
    }

    // Missing ATK/ICOS Weight card (formula-only bars)
    const weightCard = document.getElementById('c01-weight-card');
    if (parser.missingWeightCount > 0) {
        document.getElementById('c01-weight-count').textContent = parser.missingWeightCount;
        const url = buildDetailPageURL('Missing ATK Weight', parser.missingWeightBars || allData.filter(b => !b.Weight || b.Calculated_Weight > 0));
        document.getElementById('c01-weight-link').href = url;
        weightCard.classList.remove('hidden');
    } else {
        weightCard.classList.add('hidden');
    }

    // Show or hide the whole row
    const anyVisible = parser.unknownCount      > 0 ||
                       parser.missingLayerCount  > 0 ||
                       parser.duplicateCount     > 0 ||
                       parser.missingWeightCount > 0;
    row.classList.toggle('hidden', !anyVisible);
}

// ══════════════════════════════════════════════════════════════════════════
// THREE.JS 3D CAGE VIEWER
// Shows ALL bar types (Mesh, Strut, Loose, Link, Preload, Unknown).
// Filterable by layer/type via checkboxes. ViewCube for snapped views.
// ══════════════════════════════════════════════════════════════════════════

/** Colour per bar group key (Effective_Mesh_Layer for mesh, Bar_Type for others) */

// ══════════════════════════════════════════════════════════════════════════
// 3D VIEWER — delegates to js/viewer3d.js (Viewer3D module)
// All BS 8666 shape directions are BRep-proven in viewer3d.js.
// ══════════════════════════════════════════════════════════════════════════

const LAYER_PALETTE = [
    0x60a5fa, 0x34d399, 0xfbbf24, 0xa78bfa, 0xf472b6,
    0xfb923c, 0x22d3ee, 0x4ade80, 0xe879f9, 0xf87171,
    0xfacc15, 0x818cf8,
];
const TYPE_COLORS = {
    'Strut Bar'  : 0x34d399,
    'Loose Bar'  : 0xfbbf24,
    'Link Bar'   : 0xfbbf24,
    'Preload Bar': 0xf472b6,
    'Site Bar'   : 0xfb923c,
    'Unknown'    : 0xf87171,
    'Other'      : 0x94a3b8,
};

let _checkedLayers = new Set();
let _viewerObjects = {};

function init3DViewer(bars) {
    const viewerCol = document.getElementById('viewer-col');
    const container = document.getElementById('threejs-container');
    if (!viewerCol || !container) return;

    viewerCol.classList.remove('hidden');

    // Init or re-init viewer
    if (!container.querySelector('canvas')) {
        Viewer3D.init(container);
    }

    const objects = Viewer3D.loadBars(bars);
    if (!objects) return;
    _viewerObjects = objects;

    // Build layer controls
    _buildCheckboxPanel(objects);

    // Wire up filter toggle
    const toggleBtn = document.getElementById('viewer-filter-toggle');
    const panel     = document.getElementById('viewer-filter-panel');
    if (toggleBtn && panel) {
        toggleBtn.onclick = () => panel.classList.toggle('hidden');
    }

    // ViewCube
    document.querySelectorAll('.viewcube-btn').forEach(btn => {
        btn.onclick = () => Viewer3D.snapView(btn.dataset.view);
    });

    updateViewerLegend();
}

function _buildCheckboxPanel(objects) {
    const box = document.getElementById('viewer-checkboxes');
    if (!box) return;
    box.innerHTML = '';
    _checkedLayers = new Set(Object.keys(objects));

    Object.entries(objects).forEach(([key, obj]) => {
        const hex   = obj.color.toString(16).padStart(6, '0');
        const label = document.createElement('label');
        label.className = 'viewer-cb-label';
        label.innerHTML = `
            <input type="checkbox" class="viewer-cb" data-key="${key}" checked>
            <span class="viewer-cb-dot" style="background:#${hex}"></span>
            <span>${key} <em>(${obj.count})</em></span>`;
        box.appendChild(label);
        label.querySelector('input').addEventListener('change', _onCheckboxChange);
    });

    const allBtn  = document.getElementById('viewer-check-all');
    const noneBtn = document.getElementById('viewer-check-none');
    if (allBtn)  allBtn.onclick  = () => { box.querySelectorAll('.viewer-cb').forEach(c => { c.checked = true;  }); _onCheckboxChange(); };
    if (noneBtn) noneBtn.onclick = () => { box.querySelectorAll('.viewer-cb').forEach(c => { c.checked = false; }); _onCheckboxChange(); };
}

function _onCheckboxChange() {
    _checkedLayers = new Set(
        [...document.querySelectorAll('.viewer-cb:checked')].map(cb => cb.dataset.key)
    );
    Object.keys(_viewerObjects).forEach(key => {
        Viewer3D.setVisible(key, _checkedLayers.has(key));
    });
    updateViewerLegend();
}

function updateViewerLegend() {
    const legend = document.getElementById('viewer-legend');
    if (!legend) return;
    legend.innerHTML = '';
    Object.entries(_viewerObjects).forEach(([key, obj]) => {
        if (!_checkedLayers.has(key)) return;
        const hex  = obj.color.toString(16).padStart(6, '0');
        const item = document.createElement('div');
        item.className = 'legend-item';
        item.innerHTML = `<span class="legend-dot" style="background:#${hex}"></span>${key} (${obj.count})`;
        legend.appendChild(item);
    });
}


// ── Sample files: Download All as ZIP ──────────────────────────────────────
/**
 * Downloads all sample IFC files as a single ZIP.
 * Uses fetch() to grab each file from the examples/ folder, then builds
 * a ZIP manually (stored, no compression) and triggers a download.
 * Pure vanilla JS — no external zip library needed.
 */
async function downloadAllSamples() {
    const btn = document.getElementById('download-all-samples-btn');
    const origText = btn.textContent;
    btn.textContent = '⏳ Building ZIP…';
    btn.disabled = true;

    const FILES = [
        'examples/P165_C2.txt',
        'examples/P7019_C2.ifc',
        'examples/P7349_C1.ifc',
        'examples/P1346_C1.ifc',
        'examples/P15_C1.ifc',
    ];

    try {
        // Minimal ZIP builder (stored, no compression) ──────────────────
        const encoder  = new TextEncoder();
        const parts    = [];   // { name, data: Uint8Array }

        for (const path of FILES) {
            const res  = await fetch(path);
            if (!res.ok) throw new Error(`Failed to fetch ${path}: ${res.status}`);
            const buf  = await res.arrayBuffer();
            parts.push({ name: path.split('/').pop(), data: new Uint8Array(buf) });
        }

        // Build ZIP binary
        const crc32Table = (() => {
            const t = new Uint32Array(256);
            for (let i = 0; i < 256; i++) {
                let c = i;
                for (let j = 0; j < 8; j++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
                t[i] = c;
            }
            return t;
        })();
        const crc32 = (data) => {
            let crc = 0xFFFFFFFF;
            for (let i = 0; i < data.length; i++) crc = crc32Table[(crc ^ data[i]) & 0xFF] ^ (crc >>> 8);
            return (crc ^ 0xFFFFFFFF) >>> 0;
        };
        const le16 = v => [v & 0xFF, (v >> 8) & 0xFF];
        const le32 = v => [v & 0xFF, (v >> 8) & 0xFF, (v >> 16) & 0xFF, (v >> 24) & 0xFF];

        const localOffsets = [];
        const localHeaders = [];
        const now = new Date();
        const dosDate = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
        const dosTime = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1);

        parts.forEach(({ name, data }) => {
            const nameBytes = encoder.encode(name);
            const crc = crc32(data);
            localOffsets.push(localHeaders.reduce((s, h) => s + h.length, 0));
            const lh = [
                0x50,0x4B,0x03,0x04,  // signature
                20,0,                  // version needed
                0,0,                   // flags
                0,0,                   // compression (stored)
                ...le16(dosTime), ...le16(dosDate),
                ...le32(crc),
                ...le32(data.length), ...le32(data.length),
                ...le16(nameBytes.length), 0,0,
                ...nameBytes,
                ...data,
            ];
            localHeaders.push(new Uint8Array(lh));
        });

        // Central directory
        const cdEntries = [];
        parts.forEach(({ name, data }, i) => {
            const nameBytes = encoder.encode(name);
            const crc = crc32(data);
            const cd = [
                0x50,0x4B,0x01,0x02,   // signature
                20,0,20,0,0,0,0,0,
                ...le16(dosTime), ...le16(dosDate),
                ...le32(crc),
                ...le32(data.length), ...le32(data.length),
                ...le16(nameBytes.length), 0,0,0,0,0,0,0,0,0,0,0,0,
                ...le32(localOffsets[i]),
                ...nameBytes,
            ];
            cdEntries.push(new Uint8Array(cd));
        });

        const cdOffset = localHeaders.reduce((s, h) => s + h.length, 0);
        const cdSize   = cdEntries.reduce((s, e) => s + e.length, 0);
        const eocd = new Uint8Array([
            0x50,0x4B,0x05,0x06, 0,0,0,0,
            ...le16(parts.length), ...le16(parts.length),
            ...le32(cdSize), ...le32(cdOffset),
            0,0,
        ]);

        const total = [...localHeaders, ...cdEntries, eocd].reduce((s, a) => s + a.length, 0);
        const zip   = new Uint8Array(total);
        let offset  = 0;
        [...localHeaders, ...cdEntries, eocd].forEach(arr => { zip.set(arr, offset); offset += arr.length; });

        const blob = new Blob([zip], { type: 'application/zip' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'avonmouth-sample-ifc-files.zip';
        a.click();
    } catch (err) {
        console.error('ZIP download failed:', err);
        alert('Download failed: ' + err.message + '\nTry downloading files individually instead.');
    } finally {
        btn.textContent = origText;
        btn.disabled = false;
    }
}

// ══════════════════════════════════════════════════════════════════════════
// DUPLICATE BAR DETECTION  (kept — clash detection removed)
// ══════════════════════════════════════════════════════════════════════════
/**
 * Minimum distance between two finite 3D line segments — used by duplicate detection.
 */
function segSegDist(ax, ay, az, bx, by, bz, cx, cy, cz, dx, dy, dz) {
    const SMALL = 1e-10;
    const ux = bx - ax, uy = by - ay, uz = bz - az;
    const vx = dx - cx, vy = dy - cy, vz = dz - cz;
    const wx = ax - cx, wy = ay - cy, wz = az - cz;
    const a = ux*ux + uy*uy + uz*uz;
    const b = ux*vx + uy*vy + uz*vz;
    const c = vx*vx + vy*vy + vz*vz;
    const d = ux*wx + uy*wy + uz*wz;
    const e = vx*wx + vy*wy + vz*wz;
    const D = a*c - b*b;
    let sc, tc;
    if (D < SMALL) {
        sc = 0; tc = b > c ? d/b : e/c;
    } else {
        sc = (b*e - c*d) / D;
        tc = (a*e - b*d) / D;
    }
    sc = Math.max(0, Math.min(1, sc));
    tc = Math.max(0, Math.min(1, tc));
    const px = wx + sc*ux - tc*vx;
    const py = wy + sc*uy - tc*vy;
    const pz = wz + sc*uz - tc*vz;
    return Math.sqrt(px*px + py*py + pz*pz);
}

// ══════════════════════════════════════════════════════════════════════════
// STEP DETECTION  — vertical bars at same XY position with different tops
// ══════════════════════════════════════════════════════════════════════════

function runStepDetection() {
    const btn = document.getElementById('run-step-btn');
    btn.textContent = '⏳ Running…';
    btn.disabled = true;
    setTimeout(() => {
        try {
            _doStepDetection();
        } finally {
            btn.textContent = '▶ Re-run Step Check';
            btn.disabled = false;
        }
    }, 20);
}

function _doStepDetection() {
    const GRID      = 50;   // mm — XY snap tolerance for grouping bars at same position
    const STEP_THR  = 15;   // mm — minimum height diff to count as a step (reduced from 20)
    const STEP_MAX  = 300;  // mm — steps larger than this are ignored (deliberate level changes)

    // Mesh vertical bars only — step detection only applies to the cage mesh,
    // not struts, links, or other non-mesh bar types.
    const vertBars = allData.filter(b =>
        b.Bar_Type === 'Mesh' &&
        b.Start_Z !== null &&
        b.Dir_Z   !== null &&
        Math.abs(b.Dir_Z) >= 0.5
    );

    if (!vertBars.length) {
        _renderStepResults([], 'No vertical bars found in this cage.');
        _setBox5Step(false);
        return;
    }

    // Group by snapped XY grid cell
    const cells = new Map();
    vertBars.forEach(b => {
        const gx = Math.round(b.Start_X / GRID) * GRID;
        const gy = Math.round(b.Start_Y / GRID) * GRID;
        const key = `${gx}|${gy}`;
        if (!cells.has(key)) cells.set(key, { gx, gy, bars: [] });
        cells.get(key).bars.push(b);
    });

    // For each cell, find top-Z of each bar and check spread
    const steps = [];
    cells.forEach(({ gx, gy, bars }) => {
        if (bars.length < 2) return;
        const tops   = bars.map(b => ({ top: Math.max(b.Start_Z, b.End_Z), bar: b }));
        const minTop = Math.min(...tops.map(t => t.top));
        const maxTop = Math.max(...tops.map(t => t.top));
        const stepH  = maxTop - minTop;
        if (stepH < STEP_THR) return;   // below threshold — not a step
        if (stepH > STEP_MAX) return;   // too large — deliberate level change, ignore

        // Collect which Avonmouth layers are involved
        const layers = [...new Set(bars.map(b => b.Avonmouth_Layer_Set || b.ATK_Layer_Name || '?'))].sort().join(', ');
        steps.push({ gx, gy, barCount: bars.length, minTop, maxTop, stepH, layers });
    });

    steps.sort((a, b) => b.stepH - a.stepH);
    _renderStepResults(steps, null);
    _setBox5Step(steps.length > 0);
}

function _setBox5Step(hasStep) {
    const el = document.getElementById('dim-step');
    if (!el) return;
    el.textContent  = hasStep ? 'Yes' : 'No';
    el.className    = 'dim-value ' + (hasStep ? 'dim-yes' : 'dim-no');
}

function _renderStepResults(steps, errMsg) {
    const resultsDiv = document.getElementById('step-results');
    const summaryDiv = document.getElementById('step-summary');
    const tableWrap  = document.getElementById('step-table-wrap');
    const tbody      = document.getElementById('step-tbody');
    resultsDiv.classList.remove('hidden');

    if (errMsg) {
        summaryDiv.innerHTML = `<div class="clash-ok">ℹ️ ${errMsg}</div>`;
        tableWrap.style.display = 'none';
        return;
    }

    if (steps.length === 0) {
        summaryDiv.innerHTML = '<div class="clash-ok">✅ No steps detected — all vertical bars at the same XY position have tops within 15 mm of each other (or differ by more than 300 mm, treated as deliberate level changes).</div>';
        tableWrap.style.display = 'none';
        return;
    }

    summaryDiv.innerHTML = `<div class="clash-fail">📐 ${steps.length} step location${steps.length>1?'s':''} detected (vertical bar tops differ by 15–300 mm)</div>`;

    tbody.innerHTML = '';
    steps.forEach((s, idx) => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${idx + 1}</td>
            <td>${Math.round(s.gx).toLocaleString()}</td>
            <td>${Math.round(s.gy).toLocaleString()}</td>
            <td>${s.barCount}</td>
            <td>${s.layers || '—'}</td>
            <td>${Math.round(s.minTop).toLocaleString()}</td>
            <td>${Math.round(s.maxTop).toLocaleString()}</td>
            <td class="${s.stepH > 100 ? 'clash-severe' : ''}">${Math.round(s.stepH).toLocaleString()}</td>`;
        tbody.appendChild(tr);
    });
    tableWrap.style.display = '';
}
