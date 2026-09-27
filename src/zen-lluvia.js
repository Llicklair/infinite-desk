// La lluvia de la zona zen: rayas que caen alrededor de la cámara (bajo el tejado de la cabaña, no).
import * as THREE from "three";

/**
 * @param {THREE.Group} grupo
 * @param {{x0: number, x1: number, z0: number, z1: number, y1: number}} cubierta el tejado de la cabaña
 * @returns los uniformes: `uTiempo`, `uIntensidad` (0-1) y `uCentro` (la cámara, en la zona)
 */
export function crearLluvia(grupo, cubierta) {
  const NL = 2600;
  const lPosL = new Float32Array(NL * 6), lExt = new Float32Array(NL * 2);
  for (let i = 0; i < NL; i++) {
    const x = (Math.random() - 0.5) * 60, y = Math.random() * 26, z = (Math.random() - 0.5) * 60;
    lPosL.set([x, y, z, x, y, z], i * 6);
    lExt[i * 2 + 1] = 1;
  }
  const geoLluvia = new THREE.BufferGeometry();
  geoLluvia.setAttribute("position", new THREE.BufferAttribute(lPosL, 3));
  geoLluvia.setAttribute("aExtremo", new THREE.BufferAttribute(lExt, 1));
  const uLluvia = {
    uTiempo: { value: 0 }, uIntensidad: { value: 0 }, uCentro: { value: new THREE.Vector2() },
    uTecho: { value: new THREE.Vector4(cubierta.x0, cubierta.x1, cubierta.z0, cubierta.z1) },
    uAltoTecho: { value: cubierta.y1 },
  };
  const rayasLluvia = new THREE.LineSegments(geoLluvia, new THREE.ShaderMaterial({
    uniforms: uLluvia, transparent: true, depthWrite: false,
    vertexShader: /* glsl */ `
      attribute float aExtremo;
      uniform float uTiempo, uIntensidad, uAltoTecho;
      uniform vec2 uCentro;
      uniform vec4 uTecho;
      varying float vA;
      void main() {
        vec3 p = position;
        p.x = uCentro.x + mod(p.x - uCentro.x + 30.0, 60.0) - 30.0;
        p.z = uCentro.y + mod(p.z - uCentro.y + 30.0, 60.0) - 30.0;
        p.y = mod(p.y - uTiempo * 16.0, 26.0) - 1.0 + aExtremo * 0.55;
        p.x += aExtremo * 0.07;
        vA = 0.32 * uIntensidad;
        bool bajoTecho = p.x > uTecho.x && p.x < uTecho.y && p.z > uTecho.z && p.z < uTecho.w && p.y < uAltoTecho;
        if (bajoTecho || uIntensidad <= 0.0) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
      }`,
    fragmentShader: /* glsl */ `varying float vA; void main() { gl_FragColor = vec4(0.78, 0.84, 0.92, vA); }`,
  }));
  rayasLluvia.frustumCulled = false;
  grupo.add(rayasLluvia);
  return uLluvia;
}
