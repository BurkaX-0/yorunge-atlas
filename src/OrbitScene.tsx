import { useEffect, useRef } from 'react'
type Props = { sessions: { id: string; subject: string; minutes: number; startedAt: number }[] }

const vertexShader = `
attribute vec3 aPosition;
attribute vec2 aUv;
uniform float uRotation;
uniform float uAspect;
varying vec2 vUv;
varying vec3 vNormal;
void main() {
  float c = cos(uRotation), s = sin(uRotation);
  vec3 p = vec3(aPosition.x * c - aPosition.z * s, aPosition.y, aPosition.x * s + aPosition.z * c);
  vNormal = p;
  vUv = aUv;
  gl_Position = vec4(p.x * 0.72 / uAspect, p.y * 0.72, p.z * 0.16, 1.0);
}`

const fragmentShader = `
precision mediump float;
uniform sampler2D uTexture;
varying vec2 vUv;
varying vec3 vNormal;
void main() {
  vec3 n = normalize(vNormal);
  vec3 light = normalize(vec3(-0.46, 0.36, 0.82));
  float diffuse = max(dot(n, light), 0.0);
  float daySide = 0.16 + diffuse * 0.98;
  float rim = pow(1.0 - max(n.z, 0.0), 3.0);
  vec3 surface = texture2D(uTexture, vUv).rgb;
  vec3 color = surface * daySide + vec3(0.12, 0.35, 0.52) * rim * 0.32;
  gl_FragColor = vec4(color, 1.0);
}`

function compile(gl: WebGLRenderingContext, type: number, source: string) {
  const shader = gl.createShader(type)
  if (!shader) return null
  gl.shaderSource(shader, source); gl.compileShader(shader)
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) { gl.deleteShader(shader); return null }
  return shader
}

function createFallbackTexture() {
  const texture = document.createElement('canvas'); texture.width = 1024; texture.height = 512
  const ctx = texture.getContext('2d')!
  const base = ctx.createLinearGradient(0, 0, 1024, 512)
  base.addColorStop(0, '#bd9e8e'); base.addColorStop(.5, '#806c6e'); base.addColorStop(1, '#433d50')
  ctx.fillStyle = base; ctx.fillRect(0, 0, 1024, 512)
  let seed = 8241
  const rand = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646 }
  for (let i = 0; i < 1100; i++) {
    const x = rand() * texture.width, y = rand() * texture.height, r = 2 + rand() * 18
    const crater = ctx.createRadialGradient(x - r * .2, y - r * .2, r * .12, x, y, r)
    crater.addColorStop(0, 'rgba(226,196,177,.18)'); crater.addColorStop(.68, 'rgba(35,31,44,.24)'); crater.addColorStop(1, 'rgba(19,24,38,.04)')
    ctx.fillStyle = crater; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill()
  }
  return texture
}

function makeSphere() {
  const positions: number[] = [], uvs: number[] = [], indices: number[] = []
  const segments = 72, rings = 48
  for (let y = 0; y <= rings; y++) {
    const v = y / rings, phi = v * Math.PI
    for (let x = 0; x <= segments; x++) {
      const u = x / segments, theta = u * Math.PI * 2
      positions.push(Math.sin(phi) * Math.cos(theta), Math.cos(phi), Math.sin(phi) * Math.sin(theta))
      uvs.push(u, 1 - v)
    }
  }
  for (let y = 0; y < rings; y++) for (let x = 0; x < segments; x++) {
    const a = y * (segments + 1) + x, b = a + segments + 1
    indices.push(a, a + 1, b, b, a + 1, b + 1)
  }
  return { positions: new Float32Array(positions), uvs: new Float32Array(uvs), indices: new Uint16Array(indices) }
}

export default function OrbitScene({ sessions }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const canvas = canvasRef.current
    const gl = canvas?.getContext('webgl', { alpha: true, antialias: true, premultipliedAlpha: false })
    if (!canvas || !gl) return
    const vs = compile(gl, gl.VERTEX_SHADER, vertexShader), fs = compile(gl, gl.FRAGMENT_SHADER, fragmentShader)
    if (!vs || !fs) return
    const program = gl.createProgram()!
    gl.attachShader(program, vs); gl.attachShader(program, fs); gl.linkProgram(program)
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return
    gl.useProgram(program)

    const sphere = makeSphere()
    const buffer = (data: BufferSource, target: number = gl.ARRAY_BUFFER) => { const b = gl.createBuffer()!; gl.bindBuffer(target, b); gl.bufferData(target, data, gl.STATIC_DRAW); return b }
    buffer(sphere.positions)
    const position = gl.getAttribLocation(program, 'aPosition'); gl.enableVertexAttribArray(position); gl.vertexAttribPointer(position, 3, gl.FLOAT, false, 0, 0)
    buffer(sphere.uvs)
    const uv = gl.getAttribLocation(program, 'aUv'); gl.enableVertexAttribArray(uv); gl.vertexAttribPointer(uv, 2, gl.FLOAT, false, 0, 0)
    buffer(sphere.indices, gl.ELEMENT_ARRAY_BUFFER)

    const texture = gl.createTexture()!
    gl.bindTexture(gl.TEXTURE_2D, texture)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    const uploadTexture = (image: TexImageSource) => {
      gl.bindTexture(gl.TEXTURE_2D, texture); gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 1)
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image)
      gl.generateMipmap(gl.TEXTURE_2D)
    }
    const fallback = createFallbackTexture(); uploadTexture(fallback)

    const rotationUniform = gl.getUniformLocation(program, 'uRotation')
    const aspectUniform = gl.getUniformLocation(program, 'uAspect')
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    let frame = 0, rotation = 0, width = 0, height = 0
    const resize = () => {
      const rect = canvas.getBoundingClientRect(), ratio = Math.min(window.devicePixelRatio || 1, 1.5)
      width = Math.max(1, Math.round(rect.width * ratio)); height = Math.max(1, Math.round(rect.height * ratio))
      if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; gl.viewport(0, 0, width, height) }
    }
    const draw = () => {
      resize(); gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT)
      gl.enable(gl.DEPTH_TEST); gl.enable(gl.CULL_FACE); gl.cullFace(gl.BACK)
      gl.uniform1f(rotationUniform, rotation); gl.uniform1f(aspectUniform, width / height)
      gl.drawElements(gl.TRIANGLES, sphere.indices.length, gl.UNSIGNED_SHORT, 0)
      if (!reducedMotion) rotation += 0.0018
      frame = requestAnimationFrame(draw)
    }
    draw()
    return () => { cancelAnimationFrame(frame); gl.deleteTexture(texture); gl.deleteProgram(program); gl.deleteShader(vs); gl.deleteShader(fs) }
  }, [])

  return <div className="orbit-scene" role="img" aria-label={`Dönen üç boyutlu Ay yüzeyi ve ${sessions.length} kayıtlı seans yıldızı`}>
    <div className="orbit-scene-stars" aria-hidden="true">{Array.from({ length: Math.min(22, sessions.length + 12) }, (_, i) => <i key={i} className={i < sessions.length ? 'recorded-star' : ''} style={{ left: `${(i * 47 + 9) % 94 + 3}%`, top: `${(i * 31 + 13) % 78 + 9}%`, animationDelay: `${(i % 8) * -.7}s` }}/>)}</div>
    <div className="orbit-scene-rings" aria-hidden="true"/><canvas ref={canvasRef} className="orbit-scene-planet"/><span className="orbit-scene-caption">KİŞİSEL YÖRÜNGE <b>✦ {sessions.length}</b></span>
  </div>
}
