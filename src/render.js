import * as THREE from 'three';
import { Pass, FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js';

// ---------- Height fog ----------
// Every built-in material gets drifting, height-based fog by swapping three's fog shader chunks.
// We ride on THREE.Fog's two uniforms: fogNear carries the density and fogFar carries time.
export class HeightFog extends THREE.Fog {
  constructor(color, density) { super(color, density, 0); }
  get density() { return this.near; }
  set density(v) { this.near = v; }
  get time() { return this.far; }
  set time(v) { this.far = v; }
}

const FOG_NOISE = /* glsl */`
  float fogHash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
  float fogNoise(vec3 x) {
    vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(fogHash(i), fogHash(i + vec3(1,0,0)), f.x), mix(fogHash(i + vec3(0,1,0)), fogHash(i + vec3(1,1,0)), f.x), f.y),
               mix(mix(fogHash(i + vec3(0,0,1)), fogHash(i + vec3(1,0,1)), f.x), mix(fogHash(i + vec3(0,1,1)), fogHash(i + vec3(1,1,1)), f.x), f.y), f.z);
  }
  // Optical depth of exponential height fog along camera->p, plus a thin uniform haze so far
  // geometry always melts into the background colour. Drifting noise breaks it into banks.
  float fogAmount(vec3 cam, vec3 p, float dens, float t) {
    vec3 r = p - cam; float dist = length(r);
    const float fall = 0.10;
    float dy = r.y;
    float k = abs(dy) > 0.05 ? (1.0 - exp(-fall * dy)) / (fall * dy) : 1.0;
    float h = exp(-fall * max(cam.y, -1.0)) * k;
    vec3 np = p * 0.04 + vec3(t * 0.05, -t * 0.012, t * 0.03);
    float n = fogNoise(np) * 0.6 + fogNoise(np * 2.7 + 3.1) * 0.4;
    return dens * dist * (0.5 + 1.9 * h * mix(0.35, 1.6, n));
  }
`;

let fogPatched = false;
export function patchFogShaders() {
  if (fogPatched) return;
  fogPatched = true;
  const C = THREE.ShaderChunk;
  C.fog_pars_vertex = '#ifdef USE_FOG\n varying float vFogDepth; varying vec3 vFogWorld;\n#endif';
  // world position from the view-space position (works for meshes, instances, sprites, points)
  C.fog_vertex = '#ifdef USE_FOG\n vFogDepth = - mvPosition.z; vFogWorld = cameraPosition + mvPosition.xyz * mat3( viewMatrix );\n#endif';
  C.fog_pars_fragment = `#ifdef USE_FOG
    uniform vec3 fogColor; uniform float fogNear; uniform float fogFar;
    varying float vFogDepth; varying vec3 vFogWorld;
    ${FOG_NOISE}
  #endif`;
  C.fog_fragment = `#ifdef USE_FOG
    float fogFactor = 1.0 - exp( - fogAmount( cameraPosition, vFogWorld, fogNear, fogFar ) );
    gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor, fogFactor );
  #endif`;
}

// ---------- Sky dome ----------
// Fog-coloured at the horizon, slightly different overhead, with a hazy sun glow.
export function makeSky() {
  const mat = new THREE.ShaderMaterial({
    uniforms: { horizon: { value: new THREE.Color() }, zenith: { value: new THREE.Color() }, sunColor: { value: new THREE.Color() }, sunDir: { value: new THREE.Vector3(0, 1, 0) }, glow: { value: 1 } },
    vertexShader: 'varying vec3 vDir; void main(){ vDir = normalize(position); vec4 p = projectionMatrix * modelViewMatrix * vec4(position,1.0); gl_Position = p.xyww; }',
    fragmentShader: `uniform vec3 horizon, zenith, sunColor, sunDir; uniform float glow; varying vec3 vDir;
      void main(){
        float up = clamp(vDir.y, 0.0, 1.0);
        vec3 c = mix(horizon, zenith, smoothstep(0.0, 0.7, up));
        float s = max(dot(normalize(vDir), sunDir), 0.0);
        c += sunColor * (pow(s, 6.0) * 0.25 + pow(s, 64.0) * 0.6) * glow;
        gl_FragColor = vec4(c, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
    side: THREE.BackSide, depthWrite: false, fog: false,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(700, 24, 12), mat);
  sky.renderOrder = -10;
  sky.frustumCulled = false;
  sky.userData.isSky = true;
  return sky;
}

// ---------- Atmosphere pass ----------
// 1) At half resolution, raymarch the sun's shadow map through the height fog to get light
//    shafts (rgb = in-scattered light, a = how much of the fog along the ray is in shadow).
// 2) At full resolution, composite AO (faded out with fog) and the upsampled shafts.
const COMMON = /* glsl */`
  uniform sampler2D tDepth;
  uniform mat4 projInv, camWorld;
  uniform float density, time;
  varying vec2 vUv;
  ${FOG_NOISE}
  void viewRay(vec2 uv, out vec3 ro, out vec3 rd, out float dist) {
    float d = texture2D(tDepth, uv).x;
    vec4 vp = projInv * vec4(uv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0); vp /= vp.w;
    ro = camWorld[3].xyz;
    rd = normalize((camWorld * vec4(vp.xyz, 1.0)).xyz - ro);
    dist = d >= 0.99999 ? 1000.0 : length(vp.xyz);
  }
`;
const VERT = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }';

const ShaftShader = {
  uniforms: {
    tDepth: { value: null }, tShadow: { value: null }, shadowMatrix: { value: new THREE.Matrix4() }, hasShadow: { value: 0 },
    projInv: { value: new THREE.Matrix4() }, camWorld: { value: new THREE.Matrix4() },
    sunDir: { value: new THREE.Vector3(0, 1, 0) }, sunColor: { value: new THREE.Color() }, density: { value: 0.01 }, time: { value: 0 },
    torch: { value: 0 }, torchColor: { value: new THREE.Color(1, 0.94, 0.82) },
  },
  vertexShader: VERT,
  fragmentShader: /* glsl */`
    #include <packing>
    uniform sampler2D tShadow;
    uniform mat4 shadowMatrix;
    uniform vec3 sunDir, sunColor;
    uniform float hasShadow, torch;
    uniform vec3 torchColor;
    ${COMMON}
    float ign(vec2 p) { return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))); }
    void main() {
      vec3 ro, rd; float dist;
      viewRay(vUv, ro, rd, dist);
      float marchLen = min(dist, 75.0);
      const int N = 24;
      float stepLen = marchLen / float(N);
      float j = ign(gl_FragCoord.xy + fract(time * 7.13) * 61.0);
      float lit = 0.0, shadowed = 0.0, torchLit = 0.0;
      // flashlight: a cone along the camera's forward axis lights up the fog right in front of you
      vec3 fwd = -normalize(camWorld[2].xyz);
      float inBeam = smoothstep(0.84, 0.99, dot(rd, fwd));
      for (int i = 0; i < N; i++) {
        float t = stepLen * (float(i) + j);
        vec3 p = ro + rd * t;
        if (torch > 0.0) torchLit += inBeam / (1.0 + t * t * 0.05) * smoothstep(0.5, 3.0, t);
        float sh = 1.0;
        if (hasShadow > 0.5) {
          vec4 sc = shadowMatrix * vec4(p, 1.0);
          if (sc.x > 0.0 && sc.x < 1.0 && sc.y > 0.0 && sc.y < 1.0 && sc.z < 1.0)
            sh = step(sc.z - 0.003, unpackRGBAToDepth(texture2D(tShadow, sc.xy)));
        }
        vec3 np = p * 0.06 + vec3(time * 0.07, -time * 0.02, time * 0.04);
        float h = exp(-0.10 * max(p.y, 0.0)) * (0.35 + 1.3 * fogNoise(np));
        lit += sh * h; shadowed += (1.0 - sh) * h;
      }
      float mu = dot(rd, sunDir);
      const float g = 0.6;
      float hg = (1.0 - g * g) / pow(1.0 + g * g - 2.0 * g * mu, 1.5) / 12.566;
      float k = stepLen * density * 0.75;
      vec3 torchIn = torchColor * torchLit * stepLen * density * torch;
      gl_FragColor = vec4(sunColor * lit * k * (0.25 + hg * 7.0) + torchIn, clamp(shadowed * k, 0.0, 1.0));
    }`,
};

const CompositeShader = {
  uniforms: {
    tDiffuse: { value: null }, tDepth: { value: null }, tAO: { value: null }, tShafts: { value: null },
    projInv: { value: new THREE.Matrix4() }, camWorld: { value: new THREE.Matrix4() },
    density: { value: 0.01 }, time: { value: 0 }, aoStrength: { value: 1 }, shafts: { value: 1 }, hasAO: { value: 0 },
  },
  vertexShader: VERT,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse, tAO, tShafts;
    uniform float aoStrength, shafts, hasAO;
    ${COMMON}
    void main() {
      vec4 base = texture2D(tDiffuse, vUv);
      vec3 col = base.rgb;
      vec3 ro, rd; float dist;
      viewRay(vUv, ro, rd, dist);
      if (hasAO > 0.5) {
        float ao = texture2D(tAO, vUv).r;
        float vis = exp(-fogAmount(ro, ro + rd * min(dist, 400.0), density, time));
        col *= mix(1.0, ao, aoStrength * vis * step(1.0, dist)); // step(): keep AO off the viewmodel
      }
      if (shafts > 0.001) {
        vec4 s = texture2D(tShafts, vUv);
        col += s.rgb * shafts;
        // fog sitting in shadow reads darker, which is what makes the shafts pop
        col = mix(col, col * 0.75, clamp(s.a * shafts * 1.2, 0.0, 0.4));
      }
      gl_FragColor = vec4(col, base.a);
    }`,
};

export class AtmospherePass extends Pass {
  constructor(camera, sun) {
    super();
    this.camera = camera; this.sun = sun;
    const mk = (sh) => new THREE.ShaderMaterial({ ...sh, uniforms: THREE.UniformsUtils.clone(sh.uniforms), depthTest: false, depthWrite: false });
    this.shaftMat = mk(ShaftShader);
    this.material = mk(CompositeShader); // public: per-atmosphere uniforms live here
    this.shaftRT = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType });
    this.quad = new FullScreenQuad(null);
    this.aoPass = null;
  }

  setSize(w, h) { this.shaftRT.setSize(Math.ceil(w / 2), Math.ceil(h / 2)); }

  render(renderer, writeBuffer, readBuffer) {
    const u = this.material.uniforms, su = this.shaftMat.uniforms, cam = this.camera, sun = this.sun;
    for (const x of [u, su]) {
      x.tDepth.value = readBuffer.depthTexture;
      x.projInv.value.copy(cam.projectionMatrixInverse);
      x.camWorld.value.copy(cam.matrixWorld);
      x.density.value = u.density.value; x.time.value = u.time.value;
    }
    if (u.shafts.value > 0.001 || su.torch.value > 0) {
      const map = sun.shadow.map;
      su.hasShadow.value = map ? 1 : 0;
      if (map) { su.tShadow.value = map.texture; su.shadowMatrix.value.copy(sun.shadow.matrix); }
      su.sunDir.value.copy(sun.position).sub(sun.target.position).normalize();
      su.sunColor.value.copy(this.sunColor || su.sunColor.value);
      renderer.setRenderTarget(this.shaftRT);
      this.quad.material = this.shaftMat; this.quad.render(renderer);
    }
    u.tShafts.value = this.shaftRT.texture;
    u.tDiffuse.value = readBuffer.texture;
    u.hasAO.value = this.aoPass && this.aoPass.enabled ? 1 : 0;
    if (this.aoPass) u.tAO.value = this.aoPass.gtaoMap;
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    this.quad.material = this.material; this.quad.render(renderer);
  }

  dispose() { this.material.dispose(); this.shaftMat.dispose(); this.shaftRT.dispose(); this.quad.dispose(); }
}

// Keep the shadow camera locked to whole texels as it follows the player, so shadow edges
// don't crawl/shimmer when you move.
const _m = new THREE.Matrix4(), _p = new THREE.Vector3();
export function placeSun(sun, center, offset) {
  const cam = sun.shadow.camera;
  const texel = (cam.right - cam.left) / sun.shadow.mapSize.x;
  _m.lookAt(offset, new THREE.Vector3(), new THREE.Vector3(0, 1, 0));
  _p.copy(center).applyMatrix4(_m.clone().invert());
  _p.x = Math.round(_p.x / texel) * texel; _p.y = Math.round(_p.y / texel) * texel;
  _p.applyMatrix4(_m);
  sun.target.position.copy(_p);
  sun.position.copy(_p).add(offset);
}

// ---------- Environment lighting ----------
// Metals need something to reflect. A tiny gradient "sky" scene in the current atmosphere's colours
// is prefiltered into an environment map whenever the atmosphere changes.
export class AtmosEnvironment {
  constructor(renderer) {
    this.pmrem = new THREE.PMREMGenerator(renderer);
    this.uniforms = { top: { value: new THREE.Color() }, horizon: { value: new THREE.Color() }, bottom: { value: new THREE.Color() } };
    this.scene = new THREE.Scene();
    this.scene.add(new THREE.Mesh(new THREE.SphereGeometry(10, 32, 16), new THREE.ShaderMaterial({
      uniforms: this.uniforms, side: THREE.BackSide, depthWrite: false,
      vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: `uniform vec3 top, horizon, bottom; varying vec3 vP;
        void main(){ float y = normalize(vP).y;
          vec3 c = y > 0.0 ? mix(horizon, top, smoothstep(0.0, 0.6, y)) : mix(horizon, bottom, smoothstep(0.0, 0.25, -y));
          gl_FragColor = vec4(c, 1.0); }`,
    })));
    this.target = null;
  }

  update(top, horizon, bottom, brightness = 1) {
    this.uniforms.top.value.set(top).multiplyScalar(brightness);
    this.uniforms.horizon.value.set(horizon).multiplyScalar(brightness);
    this.uniforms.bottom.value.set(bottom).multiplyScalar(brightness);
    const old = this.target;
    this.target = this.pmrem.fromScene(this.scene, 0.03);
    old?.dispose();
    return this.target.texture;
  }
}

// ---------- Fake volumetric light cones ----------
// An additive cone that's brightest at its apex and along its axis: a lamp or flashlight beam
// cutting through the fog. `intensity` is a uniform so atmospheres can fade them in and out.
export function makeLightCone(length, radius, color) {
  const geo = new THREE.ConeGeometry(radius, length, 32, 1, true);
  geo.translate(0, -length / 2, 0); // apex at the origin, opening along -y
  const mat = new THREE.ShaderMaterial({
    uniforms: { color: { value: new THREE.Color(color) }, intensity: { value: 1 }, len: { value: length } },
    vertexShader: `varying float vAlong; varying vec3 vN; varying vec3 vV;
      uniform float len;
      void main(){
        vAlong = -position.y / len;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `uniform vec3 color; uniform float intensity; varying float vAlong; varying vec3 vN; varying vec3 vV;
      void main(){
        float edge = pow(abs(dot(normalize(vN), normalize(vV))), 1.6); // soft at the silhouette
        float fall = pow(1.0 - clamp(vAlong, 0.0, 1.0), 1.7) * smoothstep(0.0, 0.08, vAlong);
        gl_FragColor = vec4(color * edge * fall * intensity, 1.0); }`,
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false, toneMapped: false,
  });
  const m = new THREE.Mesh(geo, mat);
  m.renderOrder = 4;
  return m;
}
