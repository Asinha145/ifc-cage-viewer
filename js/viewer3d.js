/**
 * IFC Cage 3D Viewer — viewer3d.js
 * BS 8666 shape rendering. All directions from IFC BRep vertex analysis.
 *
 * v2 — Solid tube geometry + scene lighting
 *   Each bar segment is now rendered as a true 3D cylinder (tube) mesh with
 *   proper normals, lit by ambient + two directional lights, using
 *   MeshPhongMaterial. This replaces the old LineSegments / LineBasicMaterial
 *   approach which had no volume or shading.
 *
 * ═══════════════════════════════════════════════════════════════════════
 * SHAPE 21 VARIANT DETECTION (BRep-proven, tested across P7019 + 2HD70730)
 * ═══════════════════════════════════════════════════════════════════════
 *
 * Shape 21 = A leg + B cross + C leg  (PDF: L = A + B + (C) – r – 2d)
 * C may differ from A (asymmetric). Three variants depending on IFC orientation:
 *
 *  V1 +Bend  Legs in Dir,   cross in +Bend  LK 21DHD stirrups  (Bend in Z, bend_z>0.5)
 *  V1 −Bend  Legs in Dir,   cross in −Bend  S1-U loose bars    (by < −0.5, dir/bend horizontal)
 *  V2        Legs in Bend,  cross in +Dir   CPLR-U horizontals (B >= 0.5*A, both horizontal)
 *
 * Detection rule (no BRep needed, 100% pass rate on 8 BRep-verified cases):
 *
 *   if (|Dir_Z| > 0.5 OR |Bend_Z| > 0.5):
 *     // One axis is vertical → legs run in the vertical axis
 *     // Cross sign: −Bend if Bend_Y < −0.5, else +Bend
 *     → Variant 1 (legs in Dir)
 *
 *   else (both Dir and Bend are horizontal):
 *     if B >= 0.5 * A:
 *       → Variant 2 (legs in Bend, cross in +Dir)
 *     elif Bend_Y < −0.5:
 *       → Variant 1, cross in −Bend
 *     else:
 *       → Variant 1, cross in +Bend
 *
 * Note: Some coupler bars (F4-CPLR-U, N1-CPLR-L) genuinely extend beyond the
 * cage faces. This is physically correct — they are lapping bars designed to
 * connect to external reinforcement. Rendering them with the correct variant
 * places them in the correct direction even if they protrude beyond the cage.
 *
 * Shape 00: ALWAYS straight (Start → End). No variant logic.
 * Shape 11: Long leg in −Bend; corner at A−4.5d; short leg in +Dir. BRep #7578.
 * Shape 13: Body A in +Dir; hook C in −Bend at far end. PDF: L = A + (C).
 * Shape 36: Stirrup 4-seg. −E·Dir → −B·Bend → +C·Dir → +B·Bend. BRep #343.
 */

'use strict';

const Viewer3D = (() => {
  const PALETTE=[0x38bdf8,0x34d399,0xa78bfa,0xfb923c,0x22d3ee,0x4ade80,0xe879f9,0xf87171,0xfacc15,0x818cf8,0xfbbf24,0x60a5fa];
  const TYPE_COL={'Strut Bar':0x4ade80,'Loose Bar':0xfbbf24,'Link Bar':0xfbbf24,'Preload Bar':0xf472b6,'Site Bar':0xfb923c,'Unknown':0xf87171,'Other':0x94a3b8};

  function groupKey(b){
    return b.Bar_Type==='Mesh'
      ?'Mesh_'+(b.Avonmouth_Layer_Set||b.Effective_Mesh_Layer||'?')
      :(b.Bar_Type||'Unknown');
  }

  function bs8666Segments(bar,cx,cy,cz){
    const sx=bar.Start_X-cx, sy=bar.Start_Y-cy, sz=bar.Start_Z-cz;
    const ex=bar.End_X-cx,   ey=bar.End_Y-cy,   ez=bar.End_Z-cz;
    const dx=bar.Dir_X||0,   dy=bar.Dir_Y||0,   dz=bar.Dir_Z||0;
    const bx=bar.Bend_X||0,  by=bar.Bend_Y||0,  bz=bar.Bend_Z||0;
    const code=parseInt(bar.Shape_Code_Base,10);
    const A=bar.Dim_A||bar.Length||0;
    const B=bar.Dim_B||0;
    const C=bar.Dim_C||0;
    const D=bar.Dim_D||0;
    const E=bar.Dim_E||0;
    const d=bar.Size||bar.NominalDiameter_mm||20;
    const segs=[];
    const seg=(ax,ay,az,b2x,b2y,b2z)=>segs.push(ax,ay,az,b2x,b2y,b2z);

    // ── Shape 00: always straight ──────────────────────────────────────
    if(code===0||!B){
      seg(sx,sy,sz,ex,ey,ez);
      return segs;
    }

    // ── Shape 11: L-bar (BRep #7578 proven) ───────────────────────────
    if(code===11){
      const cD=Math.max(A-4.5*d,A*0.75);
      seg(sx,sy,sz, sx-A*bx,sy-A*by,sz-A*bz);
      const kx=sx-cD*bx,ky=sy-cD*by,kz=sz-cD*bz;
      seg(kx,ky,kz, kx+B*dx,ky+B*dy,kz+B*dz);
      return segs;
    }

    // ── Shape 13: straight body + one end hook ─────────────────────────
    if(code===13){
      const Cv=C>0?C:(D>0?D:B);
      const p1x=sx+A*dx,p1y=sy+A*dy,p1z=sz+A*dz;
      seg(sx,sy,sz,p1x,p1y,p1z);
      seg(p1x,p1y,p1z, p1x-Cv*bx,p1y-Cv*by,p1z-Cv*bz);
      return segs;
    }

    // ── Shape 21: asymmetric U — 3 variants ───────────────────────────
    if(code===21){
      const Cv=C>0?C:A;
      const dirZ=Math.abs(dz), bendZ=Math.abs(bz);

      if(dirZ>0.5||bendZ>0.5){
        // One axis is vertical (Z). Legs run in the vertical direction (Dir).
        // Cross sign: −Bend if by < −0.5, otherwise +Bend
        const cs=(by<-0.5)?-1:1;
        const p1x=sx-A*dx,  p1y=sy-A*dy,  p1z=sz-A*dz;
        const p2x=p1x+cs*B*bx,p2y=p1y+cs*B*by,p2z=p1z+cs*B*bz;
        seg(sx,sy,sz,p1x,p1y,p1z);
        seg(p1x,p1y,p1z,p2x,p2y,p2z);
        seg(p2x,p2y,p2z,p2x+Cv*dx,p2y+Cv*dy,p2z+Cv*dz);
      } else if(B>=0.5*A){
        // Both horizontal, B is large → legs in Bend, cross in +Dir (Variant 2)
        // BRep proven: N1-CPLR-U, F1-CPLR-U, F3-CPLR-U
        const p1x=sx-A*bx,  p1y=sy-A*by,  p1z=sz-A*bz;
        const p2x=p1x+B*dx, p2y=p1y+B*dy, p2z=p1z+B*dz;
        seg(sx,sy,sz,p1x,p1y,p1z);
        seg(p1x,p1y,p1z,p2x,p2y,p2z);
        seg(p2x,p2y,p2z,p2x+Cv*bx,p2y+Cv*by,p2z+Cv*bz);
      } else {
        // Both horizontal, B is small → legs in Dir (Variant 1/3)
        // Cross sign: −Bend if by < −0.5 (S1-U loose bars), else +Bend
        const cs=(by<-0.5)?-1:1;
        const p1x=sx-A*dx,    p1y=sy-A*dy,    p1z=sz-A*dz;
        const p2x=p1x+cs*B*bx,p2y=p1y+cs*B*by,p2z=p1z+cs*B*bz;
        seg(sx,sy,sz,p1x,p1y,p1z);
        seg(p1x,p1y,p1z,p2x,p2y,p2z);
        seg(p2x,p2y,p2z,p2x+Cv*dx,p2y+Cv*dy,p2z+Cv*dz);
      }
      return segs;
    }

    // ── Shape 36: rectangular stirrup (BRep #343 + image ref) ─────────
    if(code===36){
      const p1x=sx-E*dx,  p1y=sy-E*dy,  p1z=sz-E*dz;
      const p2x=p1x-B*bx, p2y=p1y-B*by, p2z=p1z-B*bz;
      const p3x=p2x+C*dx, p3y=p2y+C*dy, p3z=p2z+C*dz;
      const p4x=p3x+B*bx, p4y=p3y+B*by, p4z=p3z+B*bz;
      seg(sx,sy,sz,p1x,p1y,p1z);
      seg(p1x,p1y,p1z,p2x,p2y,p2z);
      seg(p2x,p2y,p2z,p3x,p3y,p3z);
      seg(p3x,p3y,p3z,p4x,p4y,p4z);
      return segs;
    }

    // ── Fallback: straight ─────────────────────────────────────────────
    seg(sx,sy,sz,ex,ey,ez);
    return segs;
  }

  // ── Segment endpoint helpers for coupler head placement ───────────────
  // Walk pts[] backward to find the last segment that has non-zero length.
  // Returns { ex, ey, ez, ux, uy, uz } — endpoint + unit direction.
  function _lastSeg(pts) {
    for (let i = pts.length-6; i >= 0; i -= 6) {
      const dx=pts[i+3]-pts[i], dy=pts[i+4]-pts[i+1], dz=pts[i+5]-pts[i+2];
      const len=Math.sqrt(dx*dx+dy*dy+dz*dz);
      if (len > 0.01) return { ex:pts[i+3],ey:pts[i+4],ez:pts[i+5], ux:dx/len,uy:dy/len,uz:dz/len };
    }
    return null;
  }
  // Walk pts[] forward to find the first segment with non-zero length.
  // Returns { sx, sy, sz, ux, uy, uz } — start point + unit direction.
  function _firstSeg(pts) {
    for (let i = 0; i < pts.length-5; i += 6) {
      const dx=pts[i+3]-pts[i], dy=pts[i+4]-pts[i+1], dz=pts[i+5]-pts[i+2];
      const len=Math.sqrt(dx*dx+dy*dy+dz*dz);
      if (len > 0.01) return { sx:pts[i],sy:pts[i+1],sz:pts[i+2], ux:dx/len,uy:dy/len,uz:dz/len };
    }
    return null;
  }

  // ── Cylinder tube builder ─────────────────────────────────────────────
  // Appends one cylinder segment (start→end, radius r, sides-gon cross-section)
  // into flat posArr / normArr / idxArr arrays.  Returns updated vertex offset.
  function _addCylinder(posArr, normArr, idxArr, vBase, sx, sy, sz, ex, ey, ez, r, sides) {
    const dx = ex-sx, dy = ey-sy, dz = ez-sz;
    const len = Math.sqrt(dx*dx + dy*dy + dz*dz);
    if (len < 0.01) return vBase;
    // Unit direction along bar
    const ux = dx/len, uy = dy/len, uz = dz/len;
    // Find a perpendicular vector using the least-dominant axis
    let px, py, pz;
    const ax = Math.abs(ux), ay = Math.abs(uy), az = Math.abs(uz);
    if (ax <= ay && ax <= az) { px = 0;   py = -uz;  pz = uy; }
    else if (ay <= az)        { px = uz;  py = 0;    pz = -ux; }
    else                      { px = -uy; py = ux;   pz = 0; }
    const pLen = Math.sqrt(px*px + py*py + pz*pz);
    px /= pLen; py /= pLen; pz /= pLen;
    // Second perp: cross(u, p)
    const qx = uy*pz - uz*py, qy = uz*px - ux*pz, qz = ux*py - uy*px;

    // Build (sides+1) vertex pairs: one ring at start, one at end
    for (let i = 0; i <= sides; i++) {
      const a  = (i / sides) * Math.PI * 2;
      const ca = Math.cos(a), sa = Math.sin(a);
      const nx = px*ca + qx*sa, ny = py*ca + qy*sa, nz = pz*ca + qz*sa;
      posArr.push(sx + nx*r, sy + ny*r, sz + nz*r);  normArr.push(nx, ny, nz);
      posArr.push(ex + nx*r, ey + ny*r, ez + nz*r);  normArr.push(nx, ny, nz);
    }
    // Quad faces between adjacent rings
    for (let i = 0; i < sides; i++) {
      const i0 = vBase + i*2, i1 = i0+1, i2 = vBase + (i+1)*2, i3 = i2+1;
      idxArr.push(i0, i2, i1,  i1, i2, i3);
    }
    return vBase + (sides+1)*2;
  }

  // ── Scene state ───────────────────────────────────────────────────────
  let _renderer=null,_scene=null,_camera=null;
  let _sph={r:14000,theta:0.65,phi:1.0},_pan=null,_objects={},_animId=null,_resizeObs=null;

  function _updateCamera(){
    const{r,theta,phi}=_sph;
    _camera.position.set(
      _pan.x+r*Math.sin(phi)*Math.sin(theta),
      _pan.y+r*Math.cos(phi),
      _pan.z+r*Math.sin(phi)*Math.cos(theta)
    );
    _camera.lookAt(_pan);
  }

  function init(containerEl){
    if(_renderer)destroy();
    const W=containerEl.clientWidth||800,H=containerEl.clientHeight||480;
    _scene=new THREE.Scene(); _scene.background=new THREE.Color(0x07090f);
    _camera=new THREE.PerspectiveCamera(42,W/H,10,300000);
    _pan=new THREE.Vector3(0,0,0);
    _renderer=new THREE.WebGLRenderer({antialias:true});
    _renderer.setPixelRatio(Math.min(devicePixelRatio,2));
    _renderer.setSize(W,H);
    containerEl.appendChild(_renderer.domElement);

    // ── Lighting (key upgrade over v1) ────────────────────────────────
    // Ambient fills shadows so dark sides aren't pitch-black
    const ambient = new THREE.AmbientLight(0xffffff, 0.45);
    _scene.add(ambient);
    // Key light from upper-right front — main shading source
    const sun = new THREE.DirectionalLight(0xffeeff, 0.8);
    sun.position.set(1, 2, 1);
    _scene.add(sun);
    // Fill light from opposite side — softens harsh shadows
    const fill = new THREE.DirectionalLight(0xffffff, 0.5);
    fill.position.set(-1, 0.5, -1);
    _scene.add(fill);

    _resizeObs=new ResizeObserver(()=>{
      const w=containerEl.clientWidth,h=containerEl.clientHeight;
      if(w&&h){_renderer.setSize(w,h);_camera.aspect=w/h;_camera.updateProjectionMatrix();}
    });
    _resizeObs.observe(containerEl);
    _bindControls(_renderer.domElement);
    (function loop(){_animId=requestAnimationFrame(loop);_renderer.render(_scene,_camera);})();
  }

  function loadBars(bars){
    Object.values(_objects).forEach(o=>_scene.remove(o.mesh));
    _objects={};
    if(!bars||!bars.length)return null;
    let cx=0,cy=0,cz=0,n=0;
    bars.forEach(b=>{
      if(b.Start_X==null)return;
      cx+=b.Start_X+b.End_X;cy+=b.Start_Y+b.End_Y;cz+=b.Start_Z+b.End_Z;n+=2;
    });
    if(n>0){cx/=n;cy/=n;cz/=n;}
    const gmap={};
    bars.forEach(b=>{
      if(b.Start_X==null)return;
      const k=groupKey(b);
      if(!gmap[k])gmap[k]={bt:b.Bar_Type,bars:[]};
      gmap[k].bars.push(b);
    });
    const keys=Object.keys(gmap).sort((a,b)=>
      (a.startsWith('Mesh_')?0:1)-(b.startsWith('Mesh_')?0:1)||a.localeCompare(b));
    let pIdx=0,maxR=0;const colMap={};
    keys.forEach(k=>{
      colMap[k]=k.startsWith('Mesh_')?PALETTE[pIdx++%PALETTE.length]:(TYPE_COL[gmap[k].bt]||0x94a3b8);
    });
    keys.forEach(k=>{
      const g=gmap[k];
      // Build merged tube geometry for every bar segment in this group
      const posArr=[], normArr=[], idxArr=[];
      let vOffset=0;
      g.bars.forEach(b=>{
        const pts=bs8666Segments(b,cx,cy,cz);
        // Bar radius: use actual diameter from IFC, floor at 4 mm so thin bars stay visible
        const r=Math.max((b.Size||b.NominalDiameter_mm||20)/2, 4);
        for(let i=0;i<pts.length;i+=6){
          vOffset=_addCylinder(
            posArr,normArr,idxArr,vOffset,
            pts[i],pts[i+1],pts[i+2],
            pts[i+3],pts[i+4],pts[i+5],
            r, 8  // 8-sided polygon — looks round, stays fast
          );
        }

        // ── Griptech coupler head(s) ─────────────────────────────────
        // Shape-aware end selection:
        //   Shape 11 (L-bars, e.g. 11LGF): the coupler sits at the START —
        //     the free straight end before the L-bend. _lastSeg() would return
        //     the short leg tip, which is the WRONG end.
        //   All other shapes (00, 13, 21, etc.): coupler at END (last seg tip).
        //
        // engine_web-ifc sidesteps this entirely by reading the IFCFACETEDBREP
        // tessellated solid from IFC where the coupler head is already baked into
        // the mesh at the physically correct location — no shape-code inference.
        if(b.Coupler_Suffix && pts.length >= 6){
          const headR = r * 1.65;  // Griptech sleeve is ~65% wider than bar
          const hLen  = 55;        // coupler protrudes ~55 mm beyond the bar end

          const shapeNum  = parseInt(b.Shape_Code_Base, 10);
          const shapeBase = (b.Shape_Code_Base || '').toUpperCase();
          // Shape 11 (L-bars): coupler at Start — the free straight end before the bend.
          // Shape 21 S-leg (21SGF, 21SGMB etc.): 'S' = Short leg = Start of pts[] → coupler at Start.
          // Shape 21 L-leg (21LGMB etc.) and all other shapes: coupler at End (last seg tip).
          const couplerAtStart = (shapeNum === 11) ||
                                 (shapeNum === 21 && shapeBase.endsWith('S'));

          if(couplerAtStart){
            // Shape 11: protrude backward from Start (opposite to first seg direction)
            const fs = _firstSeg(pts);
            if(fs){
              vOffset=_addCylinder(posArr,normArr,idxArr,vOffset,
                fs.sx - fs.ux*hLen, fs.sy - fs.uy*hLen, fs.sz - fs.uz*hLen,
                fs.sx, fs.sy, fs.sz,
                headR, 10);
            }
          } else {
            // Default: protrude forward from the tip of the last segment
            const ls = _lastSeg(pts);
            if(ls){
              vOffset=_addCylinder(posArr,normArr,idxArr,vOffset,
                ls.ex, ls.ey, ls.ez,
                ls.ex + ls.ux*hLen, ls.ey + ls.uy*hLen, ls.ez + ls.uz*hLen,
                headR, 10);
            }
          }

          // Dual-end codes (GMBGF, GFBGM, GFGF, GMGM): also add the opposite end
          if(b.Coupler_Dual_End){
            if(couplerAtStart){
              const ls = _lastSeg(pts);
              if(ls){
                vOffset=_addCylinder(posArr,normArr,idxArr,vOffset,
                  ls.ex, ls.ey, ls.ez,
                  ls.ex + ls.ux*hLen, ls.ey + ls.uy*hLen, ls.ez + ls.uz*hLen,
                  headR, 10);
              }
            } else {
              const fs = _firstSeg(pts);
              if(fs){
                vOffset=_addCylinder(posArr,normArr,idxArr,vOffset,
                  fs.sx - fs.ux*hLen, fs.sy - fs.uy*hLen, fs.sz - fs.uz*hLen,
                  fs.sx, fs.sy, fs.sz,
                  headR, 10);
              }
            }
          }
        }

        const dist=Math.sqrt((b.Start_X-cx)**2+(b.Start_Y-cy)**2+(b.Start_Z-cz)**2);
        if(dist>maxR)maxR=dist;
      });
      if(posArr.length===0)return;
      const geo=new THREE.BufferGeometry();
      geo.setAttribute('position',new THREE.Float32BufferAttribute(posArr,3));
      geo.setAttribute('normal',  new THREE.Float32BufferAttribute(normArr,3));
      geo.setIndex(idxArr);
      const mat=new THREE.MeshPhongMaterial({color:colMap[k], shininess:55, side:THREE.DoubleSide});
      const mesh=new THREE.Mesh(geo,mat);
      _scene.add(mesh);
      _objects[k]={mesh,color:colMap[k],bt:gmap[k].bt,count:g.bars.length};
    });
    _sph={r:Math.max(maxR*2.6,5000),theta:0.65,phi:1.0};
    _pan.set(0,0,0);_updateCamera();
    return _objects;
  }

  function setVisible(key,v){if(_objects[key])_objects[key].mesh.visible=v;}
  function setAllVisible(v){Object.values(_objects).forEach(o=>{o.mesh.visible=v;});}

  const VIEWS={
    front:{t:0,p:Math.PI/2},back:{t:Math.PI,p:Math.PI/2},
    left:{t:-Math.PI/2,p:Math.PI/2},right:{t:Math.PI/2,p:Math.PI/2},
    top:{t:0,p:.01},bottom:{t:0,p:Math.PI-.01},
    iso:{t:.65,p:.9},side:{t:Math.PI/2,p:.8}
  };
  function snapView(name){
    const v=VIEWS[name];if(!v)return;
    _sph.theta=v.t;_sph.phi=v.p;_pan.set(0,0,0);_updateCamera();
  }

  function destroy(){
    if(_animId)cancelAnimationFrame(_animId);
    if(_resizeObs)_resizeObs.disconnect();
    if(_renderer){_renderer.dispose();_renderer.domElement.remove();_renderer=null;}
    _objects={};
  }

  function _bindControls(canvas){
    let drag=false,rDrag=false,prev={x:0,y:0};
    canvas.addEventListener('mousedown',e=>{drag=true;rDrag=e.button===2;prev={x:e.clientX,y:e.clientY};});
    window.addEventListener('mouseup',()=>{drag=false;});
    canvas.addEventListener('contextmenu',e=>e.preventDefault());
    canvas.addEventListener('mousemove',e=>{
      if(!drag)return;
      const ddx=e.clientX-prev.x,ddy=e.clientY-prev.y;prev={x:e.clientX,y:e.clientY};
      if(rDrag){
        const spd=_sph.r*.0007;
        const right=new THREE.Vector3().crossVectors(_camera.getWorldDirection(new THREE.Vector3()),_camera.up).normalize();
        _pan.addScaledVector(right,-ddx*spd);
        _pan.addScaledVector(new THREE.Vector3(0,1,0),ddy*spd);
      }else{
        _sph.theta-=ddx*.005;
        _sph.phi=Math.max(.04,Math.min(Math.PI-.04,_sph.phi+ddy*.005));
      }
      _updateCamera();
    });
    canvas.addEventListener('wheel',e=>{
      e.preventDefault();_sph.r=Math.max(200,_sph.r*(1+e.deltaY*.001));_updateCamera();
    },{passive:false});
    let touches=[];
    canvas.addEventListener('touchstart',e=>{touches=[...e.touches];drag=true;if(touches.length===1)prev={x:touches[0].clientX,y:touches[0].clientY};},{passive:true});
    canvas.addEventListener('touchend',()=>{drag=false;touches=[];},{passive:true});
    canvas.addEventListener('touchmove',e=>{
      if(e.touches.length===1&&drag){
        const ddx=e.touches[0].clientX-prev.x,ddy=e.touches[0].clientY-prev.y;
        prev={x:e.touches[0].clientX,y:e.touches[0].clientY};
        _sph.theta-=ddx*.005;_sph.phi=Math.max(.04,Math.min(Math.PI-.04,_sph.phi+ddy*.005));
        _updateCamera();
      }else if(e.touches.length===2&&touches.length===2){
        const a=Math.hypot(e.touches[0].clientX-e.touches[1].clientX,e.touches[0].clientY-e.touches[1].clientY);
        const b=Math.hypot(touches[0].clientX-touches[1].clientX,touches[0].clientY-touches[1].clientY);
        if(b>0)_sph.r=Math.max(200,_sph.r*(b/a));
        touches=[...e.touches];_updateCamera();
      }
    },{passive:true});
  }

  return{init,loadBars,setVisible,setAllVisible,snapView,destroy};
})();

window.Viewer3D=Viewer3D;
