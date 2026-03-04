/**
 * IFC Cage 3D Viewer
 * BS 8666 shape rendering — all directions IFC BRep verified.
 *
 * ROOT CAUSE OF ALL DIRECTION ISSUES (documented):
 *   IFC BendDir (lZ axis) consistently points AWAY from the interior of the bend.
 *   All "into cage" movements require -BendDir, not +BendDir.
 *   This is a single consistent IFC convention, not a per-shape quirk.
 *
 * Shape formulae:
 *   Shape 11: long leg -A·Bend → corner → +B·Dir  (L-bar, BRep #7578 verified)
 *   Shape 21: -A·Dir → -B·Bend → +A·Dir           (U-bar, uniform -Bend rule)
 *   Shape 36: -E·Dir → -B·Bend → +C·Dir → +B·Bend (Stirrup, BRep #343 verified)
 *   Shape 00: Start → End                           (Straight)
 */

'use strict';

const Viewer3D = (() => {

  // ── Colour palette ──────────────────────────────────────────────────
  const PALETTE = [
    0x38bdf8, 0x34d399, 0xa78bfa, 0xfb923c,
    0x22d3ee, 0x4ade80, 0xe879f9, 0xf87171,
    0xfacc15, 0x818cf8, 0xfbbf24, 0x60a5fa,
  ];
  const TYPE_COL = {
    'Strut Bar'  : 0x4ade80,
    'Loose Bar'  : 0xfbbf24,
    'Link Bar'   : 0xfbbf24,
    'Preload Bar': 0xf472b6,
    'Site Bar'   : 0xfb923c,
    'Unknown'    : 0xf87171,
    'Other'      : 0x94a3b8,
  };

  // ── Group key ────────────────────────────────────────────────────────
  function groupKey(bar) {
    return bar.Bar_Type === 'Mesh'
      ? 'Mesh_' + (bar.Avonmouth_Layer_Set || bar.Effective_Mesh_Layer || '?')
      : (bar.Bar_Type || 'Unknown');
  }

  // ── BS 8666 shape builder ─────────────────────────────────────────────
  /**
   * Returns a flat Float32 array of segment pairs [x0,y0,z0, x1,y1,z1, ...]
   * for the bar's BS 8666 bent shape geometry.
   *
   * Coordinate convention: centroid-relative (cx/cy/cz subtracted).
   *
   * @param {object} bar   - parsed bar object from IFCParser
   * @param {number} cx,cy,cz - scene centroid to subtract
   */
  function bs8666Segments(bar, cx, cy, cz) {
    const sx = bar.Start_X - cx, sy = bar.Start_Y - cy, sz = bar.Start_Z - cz;
    const ex = bar.End_X   - cx, ey = bar.End_Y   - cy, ez = bar.End_Z   - cz;
    const dx = bar.Dir_X  || 0, dy = bar.Dir_Y  || 0, dz = bar.Dir_Z  || 0;
    const bx = bar.Bend_X || 0, by = bar.Bend_Y || 0, bz = bar.Bend_Z || 0;

    const code = parseInt(bar.Shape_Code_Base, 10);
    const A = bar.Dim_A || bar.Length || 0;
    const B = bar.Dim_B || 0;
    const C = bar.Dim_C || 0;
    const D = bar.Dim_D || 0;
    const E = bar.Dim_E || 0;
    const d = bar.Size  || bar.NominalDiameter_mm || 20;

    const segs = [];
    const seg = (ax, ay, az, bx2, by2, bz2) =>
      segs.push(ax, ay, az, bx2, by2, bz2);

    if (code === 11) {
      // ── L-bar: IFC BRep #7578 proven ──────────────────────────────
      // start = top of long leg; long leg in -Bend; short leg in +Dir
      const cDist = Math.max(A - 4.5 * d, A * 0.75);
      const pCx = sx - A  * bx, pCy = sy - A  * by, pCz = sz - A  * bz; // coupler end
      const pKx = sx - cDist*bx, pKy = sy - cDist*by, pKz = sz - cDist*bz; // corner
      const pSx = pKx + B*dx, pSy = pKy + B*dy, pSz = pKz + B*dz; // short tip
      seg(sx, sy, sz,  pCx, pCy, pCz);       // full long leg
      seg(pKx, pKy, pKz,  pSx, pSy, pSz);    // short leg from corner

    } else if (code === 21) {
      // ── U-bar: uniform -Bend rule, BRep verified F1-POB + S1-U ───
      // IFC start = bottom of one leg; legs in -Dir; cross in -Bend
      const Cv = C > 0 ? C : A;
      const p1x = sx - A*dx,  p1y = sy - A*dy,  p1z = sz - A*dz;   // top of leg 1
      const p2x = p1x - B*bx, p2y = p1y - B*by, p2z = p1z - B*bz; // cross in -Bend
      const p3x = p2x + Cv*dx,p3y = p2y + Cv*dy,p3z = p2z + Cv*dz; // bottom of leg 2
      seg(sx,sy,sz,   p1x,p1y,p1z);
      seg(p1x,p1y,p1z, p2x,p2y,p2z);
      seg(p2x,p2y,p2z, p3x,p3y,p3z);

    } else if (code === 36) {
      // ── Rectangular stirrup: BRep #343 verified ───────────────────
      // Image reference confirmed: 3 full sides + E hook, open top-right
      // -E·Dir → -B·Bend → +C·Dir → +B·Bend
      const p1x = sx  - E*dx, p1y = sy  - E*dy, p1z = sz  - E*dz; // E hook
      const p2x = p1x - B*bx, p2y = p1y - B*by, p2z = p1z - B*bz; // tall left side
      const p3x = p2x + C*dx, p3y = p2y + C*dy, p3z = p2z + C*dz; // long bottom
      const p4x = p3x + B*bx, p4y = p3y + B*by, p4z = p3z + B*bz; // tall right side
      seg(sx,sy,sz,   p1x,p1y,p1z);   // E hook
      seg(p1x,p1y,p1z, p2x,p2y,p2z); // tall left
      seg(p2x,p2y,p2z, p3x,p3y,p3z); // long bottom
      seg(p3x,p3y,p3z, p4x,p4y,p4z); // tall right (open gap back to start = open corner)

    } else {
      // ── Straight (shape 00 + fallback) ────────────────────────────
      seg(sx, sy, sz, ex, ey, ez);
    }

    return segs;
  }

  // ── Scene state ──────────────────────────────────────────────────────
  let _renderer = null;
  let _scene    = null;
  let _camera   = null;
  let _sph      = { r: 14000, theta: 0.65, phi: 1.0 };
  let _pan      = null;
  let _objects  = {};   // groupKey → { mesh, color, count }
  let _animId   = null;
  let _resizeObs = null;

  function _updateCamera() {
    const { r, theta, phi } = _sph;
    _camera.position.set(
      _pan.x + r * Math.sin(phi) * Math.sin(theta),
      _pan.y + r * Math.cos(phi),
      _pan.z + r * Math.sin(phi) * Math.cos(theta)
    );
    _camera.lookAt(_pan);
  }

  // ── Public: init ─────────────────────────────────────────────────────
  function init(containerEl) {
    if (_renderer) { destroy(); }

    const W = containerEl.clientWidth  || 800;
    const H = containerEl.clientHeight || 480;

    _scene  = new THREE.Scene();
    _scene.background = new THREE.Color(0x07090f);

    _camera = new THREE.PerspectiveCamera(42, W / H, 10, 300000);
    _pan    = new THREE.Vector3(0, 0, 0);

    _renderer = new THREE.WebGLRenderer({ antialias: true });
    _renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    _renderer.setSize(W, H);
    containerEl.appendChild(_renderer.domElement);

    // Resize observer
    _resizeObs = new ResizeObserver(() => {
      const w = containerEl.clientWidth, h = containerEl.clientHeight;
      if (w && h) {
        _renderer.setSize(w, h);
        _camera.aspect = w / h;
        _camera.updateProjectionMatrix();
      }
    });
    _resizeObs.observe(containerEl);

    // Orbit controls
    _bindControls(_renderer.domElement);

    // Render loop
    (function loop() {
      _animId = requestAnimationFrame(loop);
      _renderer.render(_scene, _camera);
    })();
  }

  // ── Public: load bars ────────────────────────────────────────────────
  function loadBars(bars) {
    // Clear previous geometry
    Object.values(_objects).forEach(o => _scene.remove(o.mesh));
    _objects = {};

    if (!bars || !bars.length) return;

    // Compute centroid from all start/end points
    let cx = 0, cy = 0, cz = 0, n = 0;
    bars.forEach(b => {
      if (b.Start_X == null) return;
      cx += b.Start_X + b.End_X;
      cy += b.Start_Y + b.End_Y;
      cz += b.Start_Z + b.End_Z;
      n += 2;
    });
    if (n > 0) { cx /= n; cy /= n; cz /= n; }

    // Build group map
    const gmap = {};
    bars.forEach(b => {
      if (b.Start_X == null) return;
      const k = groupKey(b);
      if (!gmap[k]) gmap[k] = { bt: b.Bar_Type, bars: [] };
      gmap[k].bars.push(b);
    });

    // Assign colours
    const keys = Object.keys(gmap).sort((a, b) =>
      (a.startsWith('Mesh_') ? 0 : 1) - (b.startsWith('Mesh_') ? 0 : 1) ||
      a.localeCompare(b)
    );
    let pIdx = 0;
    const colMap = {};
    keys.forEach(k => {
      colMap[k] = k.startsWith('Mesh_')
        ? PALETTE[pIdx++ % PALETTE.length]
        : (TYPE_COL[gmap[k].bt] || 0x94a3b8);
    });

    // Build LineSegments per group
    let maxR = 0;
    keys.forEach(k => {
      const g = gmap[k];
      const pts = [];
      g.bars.forEach(b => {
        const segs = bs8666Segments(b, cx, cy, cz);
        pts.push(...segs);
        const r = Math.sqrt(
          (b.Start_X-cx)**2 + (b.Start_Y-cy)**2 + (b.Start_Z-cz)**2
        );
        if (r > maxR) maxR = r;
      });
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
      const mat = new THREE.LineBasicMaterial({ color: colMap[k] });
      const ls  = new THREE.LineSegments(geo, mat);
      _scene.add(ls);
      _objects[k] = { mesh: ls, color: colMap[k], bt: gmap[k].bt, count: g.bars.length };
    });

    // Reset camera to fit
    _sph = { r: Math.max(maxR * 2.6, 5000), theta: 0.65, phi: 1.0 };
    _pan.set(0, 0, 0);
    _updateCamera();

    return _objects;
  }

  // ── Public: set visibility ───────────────────────────────────────────
  function setVisible(key, visible) {
    if (_objects[key]) _objects[key].mesh.visible = visible;
  }

  function setAllVisible(visible) {
    Object.values(_objects).forEach(o => { o.mesh.visible = visible; });
  }

  // ── Public: snap view ────────────────────────────────────────────────
  const VIEWS = {
    front : { t: 0,           p: Math.PI / 2    },
    back  : { t: Math.PI,     p: Math.PI / 2    },
    left  : { t: -Math.PI/2,  p: Math.PI / 2    },
    right : { t: Math.PI / 2, p: Math.PI / 2    },
    top   : { t: 0,           p: 0.01            },
    bottom: { t: 0,           p: Math.PI - 0.01  },
    iso   : { t: 0.65,        p: 0.9             },
    side  : { t: Math.PI / 2, p: 0.8             },
  };

  function snapView(name) {
    const v = VIEWS[name];
    if (!v) return;
    _sph.theta = v.t;
    _sph.phi   = v.p;
    _pan.set(0, 0, 0);
    _updateCamera();
  }

  // ── Public: destroy ──────────────────────────────────────────────────
  function destroy() {
    if (_animId) cancelAnimationFrame(_animId);
    if (_resizeObs) _resizeObs.disconnect();
    if (_renderer) {
      _renderer.dispose();
      _renderer.domElement.remove();
      _renderer = null;
    }
    _objects = {};
  }

  // ── Private: orbit / pan / zoom controls ────────────────────────────
  function _bindControls(canvas) {
    let drag = false, rDrag = false, prev = { x: 0, y: 0 };

    canvas.addEventListener('mousedown', e => {
      drag = true; rDrag = e.button === 2;
      prev = { x: e.clientX, y: e.clientY };
    });
    window.addEventListener('mouseup', () => { drag = false; });
    canvas.addEventListener('contextmenu', e => e.preventDefault());

    canvas.addEventListener('mousemove', e => {
      if (!drag) return;
      const ddx = e.clientX - prev.x, ddy = e.clientY - prev.y;
      prev = { x: e.clientX, y: e.clientY };
      if (rDrag) {
        const spd = _sph.r * 0.0007;
        const right = new THREE.Vector3()
          .crossVectors(_camera.getWorldDirection(new THREE.Vector3()), _camera.up)
          .normalize();
        _pan.addScaledVector(right, -ddx * spd);
        _pan.addScaledVector(new THREE.Vector3(0, 1, 0), ddy * spd);
      } else {
        _sph.theta -= ddx * 0.005;
        _sph.phi = Math.max(0.04, Math.min(Math.PI - 0.04, _sph.phi + ddy * 0.005));
      }
      _updateCamera();
    });

    canvas.addEventListener('wheel', e => {
      e.preventDefault();
      _sph.r = Math.max(200, _sph.r * (1 + e.deltaY * 0.001));
      _updateCamera();
    }, { passive: false });

    // Touch
    let touches = [];
    canvas.addEventListener('touchstart', e => {
      touches = [...e.touches];
      drag = true; rDrag = false;
      if (touches.length === 1) prev = { x: touches[0].clientX, y: touches[0].clientY };
    }, { passive: true });
    canvas.addEventListener('touchend', () => { drag = false; touches = []; }, { passive: true });
    canvas.addEventListener('touchmove', e => {
      if (e.touches.length === 1 && drag) {
        const ddx = e.touches[0].clientX - prev.x;
        const ddy = e.touches[0].clientY - prev.y;
        prev = { x: e.touches[0].clientX, y: e.touches[0].clientY };
        _sph.theta -= ddx * 0.005;
        _sph.phi = Math.max(0.04, Math.min(Math.PI - 0.04, _sph.phi + ddy * 0.005));
        _updateCamera();
      } else if (e.touches.length === 2 && touches.length === 2) {
        const a = Math.hypot(e.touches[0].clientX - e.touches[1].clientX,
                             e.touches[0].clientY - e.touches[1].clientY);
        const b = Math.hypot(touches[0].clientX - touches[1].clientX,
                             touches[0].clientY - touches[1].clientY);
        if (b > 0) _sph.r = Math.max(200, _sph.r * (b / a));
        touches = [...e.touches];
        _updateCamera();
      }
    }, { passive: true });
  }

  return { init, loadBars, setVisible, setAllVisible, snapView, destroy };
})();

window.Viewer3D = Viewer3D;
