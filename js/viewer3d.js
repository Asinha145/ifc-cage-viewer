/**
 * IFC Cage 3D Viewer — viewer3d.js
 *
 * BS 8666 shape rendering. All directions from IFC BRep vertex analysis.
 *
 * ═══════════════════════════════════════════════════════════════════════
 * SHAPE DIRECTION FINDINGS (BRep-proven, two IFC files)
 * ═══════════════════════════════════════════════════════════════════════
 *
 * Shape 11 (L-bar): long leg in -Bend, short leg in +Dir from corner.
 *   BRep #7578, 2HD70730AC1.
 *
 * Shape 13 (straight + hook): body in +Dir, hook in -Bend at far end.
 *   PDF: L = A + (C). Body=A, hook=C.
 *
 * Shape 21 (asymmetric U): THREE variants. No universal sign rule.
 *
 *   Variant 1 — legs in Dir, cross in +Bend  (LK 21DHD stirrups, P7019)
 *     BRep proven: Dir=[0,-1,0], Bend=[0,0,+1]
 *     Y span=A=1380mm (legs in Dir), Z span≈B=160mm (cross in +Bend)
 *     Triggered when: B < 0.4*A  AND  by >= -0.5
 *     Path: P0 → -A·Dir → +B·Bend → +C·Dir
 *
 *   Variant 3 — legs in Dir, cross in -Bend  (LB S1-U, 2HD70730AC1)
 *     BRep proven: Dir=[1,0,0], Bend=[0,-1,0]
 *     X span=A (legs in Dir), Y span≈B=350mm (cross in -Bend = +Y)
 *     Triggered when: B < 0.4*A  AND  by < -0.5
 *     Path: P0 → -A·Dir → -B·Bend → +C·Dir
 *
 *   Variant 2 — legs in Bend, cross in +Dir  (LB 21LGMB couplers, P7019)
 *     BRep proven: Dir=[0,-1,0], Bend=[+1,0,0]
 *     X span=A=1779mm (legs in -Bend), Y span≈B=957mm (cross in +Dir)
 *     Triggered when: B >= 0.4*A
 *     Path: P0 → -A·Bend → +B·Dir → +C·Bend
 *
 * Shape 36 (rectangular stirrup): BRep #343 + image ref proven.
 *   NOT a Z-profile. 3 closed sides + E hook, one open corner.
 *   Path: -E·Dir → -B·Bend → +C·Dir → +B·Bend
 */

'use strict';

const Viewer3D = (() => {
  const PALETTE=[0x38bdf8,0x34d399,0xa78bfa,0xfb923c,0x22d3ee,0x4ade80,0xe879f9,0xf87171,0xfacc15,0x818cf8,0xfbbf24,0x60a5fa];
  const TYPE_COL={'Strut Bar':0x4ade80,'Loose Bar':0xfbbf24,'Link Bar':0xfbbf24,'Preload Bar':0xf472b6,'Site Bar':0xfb923c,'Unknown':0xf87171,'Other':0x94a3b8};

  function groupKey(b){return b.Bar_Type==='Mesh'?'Mesh_'+(b.Avonmouth_Layer_Set||b.Effective_Mesh_Layer||'?'):(b.Bar_Type||'Unknown');}

  function bs8666Segments(bar,cx,cy,cz){
    const sx=bar.Start_X-cx,sy=bar.Start_Y-cy,sz=bar.Start_Z-cz;
    const ex=bar.End_X-cx,ey=bar.End_Y-cy,ez=bar.End_Z-cz;
    const dx=bar.Dir_X||0,dy=bar.Dir_Y||0,dz=bar.Dir_Z||0;
    const bx=bar.Bend_X||0,by=bar.Bend_Y||0,bz=bar.Bend_Z||0;
    const code=parseInt(bar.Shape_Code_Base,10);
    const A=bar.Dim_A||bar.Length||0,B=bar.Dim_B||0,C=bar.Dim_C||0;
    const D=bar.Dim_D||0,E=bar.Dim_E||0;
    const d=bar.Size||bar.NominalDiameter_mm||20;
    const segs=[];
    const seg=(ax,ay,az,b2x,b2y,b2z)=>segs.push(ax,ay,az,b2x,b2y,b2z);

    if(code===11){
      // L-bar: long leg in -Bend, short leg in +Dir from corner. BRep #7578.
      const cD=Math.max(A-4.5*d,A*0.75);
      const pCx=sx-A*bx,pCy=sy-A*by,pCz=sz-A*bz;
      const pKx=sx-cD*bx,pKy=sy-cD*by,pKz=sz-cD*bz;
      const pSx=pKx+B*dx,pSy=pKy+B*dy,pSz=pKz+B*dz;
      seg(sx,sy,sz,pCx,pCy,pCz);
      seg(pKx,pKy,pKz,pSx,pSy,pSz);

    }else if(code===13){
      // Straight body A in +Dir, hook C (or D/B as fallback) in -Bend at far end.
      const Cv=C>0?C:(D>0?D:B);
      const p1x=sx+A*dx,p1y=sy+A*dy,p1z=sz+A*dz;
      const p2x=p1x-Cv*bx,p2y=p1y-Cv*by,p2z=p1z-Cv*bz;
      seg(sx,sy,sz,p1x,p1y,p1z);
      seg(p1x,p1y,p1z,p2x,p2y,p2z);

    }else if(code===21){
      const Cv=C>0?C:A;
      if(B>0&&B<0.4*A){
        // Variants 1 & 3: legs in Dir direction; thin cross B in ±Bend
        // +Bend if by>=-0.5 (LK DHD), -Bend if by<-0.5 (S1-U loose bars)
        const cs=(by<-0.5)?-1:1;
        const p1x=sx-A*dx,p1y=sy-A*dy,p1z=sz-A*dz;
        const p2x=p1x+cs*B*bx,p2y=p1y+cs*B*by,p2z=p1z+cs*B*bz;
        const p3x=p2x+Cv*dx,p3y=p2y+Cv*dy,p3z=p2z+Cv*dz;
        seg(sx,sy,sz,p1x,p1y,p1z);
        seg(p1x,p1y,p1z,p2x,p2y,p2z);
        seg(p2x,p2y,p2z,p3x,p3y,p3z);
      }else{
        // Variant 2: legs in Bend direction, cross in +Dir. BRep N1-CPLR-U.
        const p1x=sx-A*bx,p1y=sy-A*by,p1z=sz-A*bz;
        const p2x=p1x+B*dx,p2y=p1y+B*dy,p2z=p1z+B*dz;
        const p3x=p2x+Cv*bx,p3y=p2y+Cv*by,p3z=p2z+Cv*bz;
        seg(sx,sy,sz,p1x,p1y,p1z);
        seg(p1x,p1y,p1z,p2x,p2y,p2z);
        seg(p2x,p2y,p2z,p3x,p3y,p3z);
      }

    }else if(code===36){
      // Rectangular stirrup. BRep #343 + image ref proven.
      // 4 segs: -E·Dir → -B·Bend → +C·Dir → +B·Bend  (open corner: P4 back to P0)
      const p1x=sx-E*dx,p1y=sy-E*dy,p1z=sz-E*dz;
      const p2x=p1x-B*bx,p2y=p1y-B*by,p2z=p1z-B*bz;
      const p3x=p2x+C*dx,p3y=p2y+C*dy,p3z=p2z+C*dz;
      const p4x=p3x+B*bx,p4y=p3y+B*by,p4z=p3z+B*bz;
      seg(sx,sy,sz,p1x,p1y,p1z);
      seg(p1x,p1y,p1z,p2x,p2y,p2z);
      seg(p2x,p2y,p2z,p3x,p3y,p3z);
      seg(p3x,p3y,p3z,p4x,p4y,p4z);

    }else{
      seg(sx,sy,sz,ex,ey,ez);
    }
    return segs;
  }

  let _renderer=null,_scene=null,_camera=null;
  let _sph={r:14000,theta:0.65,phi:1.0},_pan=null,_objects={},_animId=null,_resizeObs=null;

  function _updateCamera(){
    const{r,theta,phi}=_sph;
    _camera.position.set(_pan.x+r*Math.sin(phi)*Math.sin(theta),_pan.y+r*Math.cos(phi),_pan.z+r*Math.sin(phi)*Math.cos(theta));
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
    _resizeObs=new ResizeObserver(()=>{const w=containerEl.clientWidth,h=containerEl.clientHeight;if(w&&h){_renderer.setSize(w,h);_camera.aspect=w/h;_camera.updateProjectionMatrix();}});
    _resizeObs.observe(containerEl);
    _bindControls(_renderer.domElement);
    (function loop(){_animId=requestAnimationFrame(loop);_renderer.render(_scene,_camera);})();
  }

  function loadBars(bars){
    Object.values(_objects).forEach(o=>_scene.remove(o.mesh));
    _objects={};
    if(!bars||!bars.length)return null;
    let cx=0,cy=0,cz=0,n=0;
    bars.forEach(b=>{if(b.Start_X==null)return;cx+=b.Start_X+b.End_X;cy+=b.Start_Y+b.End_Y;cz+=b.Start_Z+b.End_Z;n+=2;});
    if(n>0){cx/=n;cy/=n;cz/=n;}
    const gmap={};
    bars.forEach(b=>{if(b.Start_X==null)return;const k=groupKey(b);if(!gmap[k])gmap[k]={bt:b.Bar_Type,bars:[]};gmap[k].bars.push(b);});
    const keys=Object.keys(gmap).sort((a,b)=>(a.startsWith('Mesh_')?0:1)-(b.startsWith('Mesh_')?0:1)||a.localeCompare(b));
    let pIdx=0,maxR=0;const colMap={};
    keys.forEach(k=>{colMap[k]=k.startsWith('Mesh_')?PALETTE[pIdx++%PALETTE.length]:(TYPE_COL[gmap[k].bt]||0x94a3b8);});
    keys.forEach(k=>{
      const g=gmap[k];const pts=[];
      g.bars.forEach(b=>{pts.push(...bs8666Segments(b,cx,cy,cz));const r=Math.sqrt((b.Start_X-cx)**2+(b.Start_Y-cy)**2+(b.Start_Z-cz)**2);if(r>maxR)maxR=r;});
      const geo=new THREE.BufferGeometry();
      geo.setAttribute('position',new THREE.Float32BufferAttribute(pts,3));
      const ls=new THREE.LineSegments(geo,new THREE.LineBasicMaterial({color:colMap[k]}));
      _scene.add(ls);
      _objects[k]={mesh:ls,color:colMap[k],bt:gmap[k].bt,count:g.bars.length};
    });
    _sph={r:Math.max(maxR*2.6,5000),theta:0.65,phi:1.0};_pan.set(0,0,0);_updateCamera();
    return _objects;
  }

  function setVisible(key,visible){if(_objects[key])_objects[key].mesh.visible=visible;}
  function setAllVisible(v){Object.values(_objects).forEach(o=>{o.mesh.visible=v;});}

  const VIEWS={front:{t:0,p:Math.PI/2},back:{t:Math.PI,p:Math.PI/2},left:{t:-Math.PI/2,p:Math.PI/2},right:{t:Math.PI/2,p:Math.PI/2},top:{t:0,p:.01},bottom:{t:0,p:Math.PI-.01},iso:{t:.65,p:.9},side:{t:Math.PI/2,p:.8}};
  function snapView(name){const v=VIEWS[name];if(!v)return;_sph.theta=v.t;_sph.phi=v.p;_pan.set(0,0,0);_updateCamera();}

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
      if(!drag)return;const ddx=e.clientX-prev.x,ddy=e.clientY-prev.y;prev={x:e.clientX,y:e.clientY};
      if(rDrag){const spd=_sph.r*.0007;const right=new THREE.Vector3().crossVectors(_camera.getWorldDirection(new THREE.Vector3()),_camera.up).normalize();_pan.addScaledVector(right,-ddx*spd);_pan.addScaledVector(new THREE.Vector3(0,1,0),ddy*spd);}
      else{_sph.theta-=ddx*.005;_sph.phi=Math.max(.04,Math.min(Math.PI-.04,_sph.phi+ddy*.005));}
      _updateCamera();
    });
    canvas.addEventListener('wheel',e=>{e.preventDefault();_sph.r=Math.max(200,_sph.r*(1+e.deltaY*.001));_updateCamera();},{passive:false});
    let touches=[];
    canvas.addEventListener('touchstart',e=>{touches=[...e.touches];drag=true;if(touches.length===1)prev={x:touches[0].clientX,y:touches[0].clientY};},{passive:true});
    canvas.addEventListener('touchend',()=>{drag=false;touches=[];},{passive:true});
    canvas.addEventListener('touchmove',e=>{
      if(e.touches.length===1&&drag){const ddx=e.touches[0].clientX-prev.x,ddy=e.touches[0].clientY-prev.y;prev={x:e.touches[0].clientX,y:e.touches[0].clientY};_sph.theta-=ddx*.005;_sph.phi=Math.max(.04,Math.min(Math.PI-.04,_sph.phi+ddy*.005));_updateCamera();}
      else if(e.touches.length===2&&touches.length===2){const a=Math.hypot(e.touches[0].clientX-e.touches[1].clientX,e.touches[0].clientY-e.touches[1].clientY),b=Math.hypot(touches[0].clientX-touches[1].clientX,touches[0].clientY-touches[1].clientY);if(b>0)_sph.r=Math.max(200,_sph.r*(b/a));touches=[...e.touches];_updateCamera();}
    },{passive:true});
  }

  return{init,loadBars,setVisible,setAllVisible,snapView,destroy};
})();

window.Viewer3D=Viewer3D;
