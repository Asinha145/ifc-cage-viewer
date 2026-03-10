# IFC Rebar Cage Viewer

**Live site:** `https://Asinha145.github.io/ifc-cage-viewer/`

A browser-based tool for parsing, validating and visualising IFC2X3 rebar cage files from the Avonmouth Dock Wall project (Laing O'Rourke / Bylor JV). Runs entirely in the browser — no server, no install.

---

## Features

| Feature | Detail |
|---------|--------|
| **IFC parsing** | IFCREINFORCINGBAR, IFCLOCALPLACEMENT, IFCMAPPEDITEM chain |
| **3D solid rendering** | Three.js r128 — solid 8-sided tube meshes with Phong shading and 3-light rig |
| **Griptech couplers** | Shape-aware coupler head geometry (GF, GM, GMB, GFB, GMP, dual-end variants) |
| **C01 validation** | Unknown bars, missing Avonmouth layer, duplicate GlobalIds, missing ATK weight |
| **Cage statistics** | Horizontal bar counts, cage height, weight by layer, UDL factor |
| **Step detection** | Auto-runs on analyse; flags vertical bar top-Z mismatches |
| **Export** | CSV with coordinates, cage axis, stagger cluster IDs |

---

## BS 8666 Shape Rendering

All shape directions are **IFC BRep-verified** (vertices extracted from IFCFACETEDBREP and transformed to global space):

| Code | Shape | Formula | Verified via |
|------|-------|---------|--------------|
| `00` | Straight | Start → End | — |
| `11` | L-bar | `−A·Bend → corner → +B·Dir` | BRep #7578 (36 vertices) |
| `21` | U-bar | `−A·Dir → −B·Bend → +A·Dir` | BRep F1-POB + S1-U |
| `36` | Stirrup | `−E·Dir → −B·Bend → +C·Dir → +B·Bend` | BRep #343 (78 vertices) |

**Key finding:** IFC `BendDir` (local Z / `Axis` field) always points **away** from the interior of the bend. All "into cage" movements use `−BendDir`. This is a single consistent IFC convention.

---

## Griptech Coupler Rendering

Coupler head geometry is added as a wider-diameter cylinder at the correct end of each bar, determined by shape code:

| Shape | Coupler End | Reason |
|-------|-------------|--------|
| `00` (Straight) | Far end (End) | Free exposed tip |
| `11` (L-bar) | Start (free straight end) | Short leg is embedded; long leg free end takes the sleeve |
| Dual-end (`GFGF`, `GMGM`, `GMBGF`, `GFBGM`) | Both ends | Both ends receive sleeves |

Supported suffixes: `GF`, `GM`, `GMB`, `GFB`, `GMP`, `GFGF`, `GMGM`, `GMBGF`, `GFBGM`.

---

## File Structure

```
ifc-cage-viewer/
├── index.html          ← Entry point (open in browser or host on GitHub Pages)
├── preview.html        ← Quick 3D-only preview (auto-loads example IFC)
├── css/
│   └── style.css       ← All styles
├── js/
│   ├── ifc-parser.js   ← IFCParser class — all parsing logic
│   ├── viewer3d.js     ← Viewer3D module — solid tube rendering, coupler heads
│   └── main.js         ← UI, stats, export, step detection
└── examples/
    └── 2HD70730AC1.ifc ← Sample cage file for testing
```

---

## Deploying to GitHub Pages

### First time

```bash
# 1. Create a new repo on GitHub named "ifc-cage-viewer"

# 2. Clone it locally
git clone https://github.com/<your-username>/ifc-cage-viewer.git
cd ifc-cage-viewer

# 3. Copy all files from the zip into this directory
# (or drag the unzipped folder contents in)

# 4. Push
git add -A
git commit -m "Initial deploy"
git push origin main

# 5. Enable GitHub Pages
# GitHub repo → Settings → Pages → Source: Deploy from branch → main → / (root) → Save
```

### Updating

```bash
git add -A
git commit -m "Update: describe what changed"
git push origin main
```

Hard-refresh after deploy: **Ctrl+Shift+R** (Windows) / **Cmd+Shift+R** (Mac)

Local testing:
```bash
python3 -m http.server 8000
# Open: http://localhost:8000
```

---

## Layer Classification

| Avonmouth `Layer/Set` regex | Bar_Type | Examples |
|---|---|---|
| `/^[FN]\d+A$/i` | Mesh | F1A, F3A, N1A |
| `/^LB\d*$/i` | Loose Bar | LB1 |
| `/^LK\d*$/i` | Link Bar | LK1 |
| `/^[VH]S\d*$/i` | Strut Bar | VS1, HS2 |
| `/^PR[LC]\d*$/i` | Preload Bar | PRL, PRC |
| `/^S\d*$/i` | Site Bar | S1 |
| null | Unknown → **C01 REJECTED** | — |

---

## C01 Rejection Conditions

A cage is **C01 Rejected** if any of these are true:

1. **Unknown bars** — `Bar_Type === 'Unknown'` (no Avonmouth `Layer/Set`)
2. **Missing Avonmouth layer** — `Avonmouth_Layer_Set === null` for any bar
3. **Duplicate GlobalIds** — same IFC GUID appearing more than once
4. **Missing ATK/ICOS weight** — no `Weight` value in ATK Rebar or ICOS Rebar pset

---

## Tested Cage Files

| File | Bars | Result | Notes |
|------|------|--------|-------|
| `2HD70730AC1.ifc` | 332 | ✅ Accepted | LK1 shape 36, VS1 shape 11+21 |
| `P165_C2.txt` | 409 | ✅ Accepted | Standard upright cage |
| `P7019_C1.ifc` | ~600 | ✅ Accepted | Complex stagger clustering |
| `P7019_C2.ifc` | 835 | 🚫 Rejected | 12 unknown U-bars |
| `P7349_C1.ifc` | 1195 | 🚫 Rejected | 43 unknown bars |
| `P1346_C1.ifc` | 941 | 🚫 Rejected | 17 unknown U-bars |

---

## Tech Stack

- Pure HTML + CSS + Vanilla JavaScript
- [Three.js r128](https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js) (CDN)
- No npm, no build step — works with `python3 -m http.server`

---

*Client: Laing O'Rourke / Bylor JV · Project: Avonmouth Dock Wall*
