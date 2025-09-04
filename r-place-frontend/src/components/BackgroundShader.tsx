import { useEffect, useRef } from 'react'

// Fullscreen WebGL background shader adapted from https://www.shadertoy.com/view/WdGSzz
// Uses uniforms u_time (seconds) and u_resolution (pixels)

const VERT = `
attribute vec2 a_position;
void main() {
  gl_Position = vec4(a_position, 0.0, 1.0);
}
`

const FRAG = `
precision mediump float;

uniform vec2 u_resolution;
uniform float u_time;

#define iters 70
#define minDst 0.001
#define lineWidth 0.2
#define lineCountX 35.0
#define lineCountY (50.0/3.0)
#define speed 6.0
#define gridColor vec3(0.2, 0.05, 1.0)

float noise(vec2 seed) {
  return fract(sin(dot(seed, vec2(12.9898,4.1414)))*43758.5453);
}

float getHeight(vec2 uv) {
  float t = u_time;
  uv += 0.5;
  uv.y -= t * speed;
  float y1 = floor(uv.y);
  float y2 = floor(uv.y + 1.0);
  float x1 = floor(uv.x);
  float x2 = floor(uv.x + 1.0);
  float iX1 = mix(noise(vec2(x1, y1)), noise(vec2(x2, y1)), fract(uv.x));
  float iX2 = mix(noise(vec2(x1, y2)), noise(vec2(x2, y2)), fract(uv.x));
  return mix(iX1, iX2, fract(uv.y));
}

float getDistance(vec3 p) {
  return p.z - (1.0 - cos(p.x * 15.0)) * 0.03 * getHeight(vec2(p.x * lineCountX, p.y * lineCountY));
}

float getGridColor(vec2 uv) {
  float t = u_time;
  float zoom = 1.0; float col = 0.0;
  vec3 cam = vec3(0.0, 1.0, 0.1);
  vec3 lookat = vec3(0.0);
  vec3 fwd = normalize(lookat - cam);
  vec3 u = normalize(cross(fwd, vec3(1.0, 0.0, 0.0)));
  vec3 r = cross(u, fwd);
  vec3 c = cam + fwd * zoom;
  vec3 i = c + r * uv.x + u * uv.y;
  vec3 ray = normalize(i - cam);
  float distSur, distOrigin = 0.0;
  vec3 p = cam;
  for (int k = 0; k < iters; k++) {
    distSur = getDistance(p);
    if (distOrigin > 2.0) break;
    if (distSur < minDst) {
      float lineW = lineWidth * distOrigin;
      float xLines = smoothstep(lineW, 0.0, abs(fract(p.x * lineCountX) - 0.5));
      float yLines = smoothstep(lineW * 2.0, 0.0, abs(fract(p.y * lineCountY - t * speed) - 0.5));
      col += max(xLines, yLines);
      break;
    }
    p += ray * distSur;
    distOrigin += distSur;
  }
  return max(0.0, col - (distOrigin * 0.8));
}

void main() {
  vec2 fragCoord = gl_FragCoord.xy;
  vec2 R = u_resolution.xy;
  vec2 uv = (fragCoord - 0.5 * R) / R.y + 0.5;

  float t = u_time;
  float sunHeight = sin(t * 0.1) * 0.1 + 0.1;
  uv.y -= sunHeight;

  float dist = 2.5 * length(uv - vec2(0.5, 0.5));
  float divisions = 50.0;
  float pattern = (sin(uv.y * divisions * 10.0 - t * 2.0) * 1.2 + uv.y * 8.3) * uv.y - 1.5 +
                  sin(uv.x * 20.0 + t * 5.0) * 0.01;
  float sunOutline = smoothstep(0.0, -0.0315, max(dist - 0.315, -pattern));
  vec3 c = sunOutline * mix(vec3(4.0, 0.0, 0.2), vec3(1.0, 1.1, 0.0), uv.y);

  float glow = max(0.0, 1.0 - dist * 1.25);
  glow = min(glow * glow * glow, 0.325);
  c += glow * vec3(1.5, 0.3, 1.2) * 1.1;

  uv -= 0.5;
  uv.y += sunHeight;
  uv.y += 0.18;
  if (uv.y < 0.1) {
    c += getGridColor(uv) * 4.0 * gridColor;
  }

  float scanline = smoothstep(1.0 - 0.2/1400.0, 1.0, sin(t * 30.0 * 0.1 + uv.y * 4.0));
  vec3 color = c * (scanline * 0.2 + 1.0);
  gl_FragColor = vec4(color, 1.0);
}
`

export default function BackgroundShader() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const rafRef = useRef<number | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const gl = (canvas.getContext('webgl', { premultipliedAlpha: false }) ||
               (canvas.getContext('experimental-webgl', { premultipliedAlpha: false }) as WebGLRenderingContext | null))
    if (!gl) {
      // No WebGL; leave a subtle gradient fallback
      canvas.style.background = 'radial-gradient(ellipse at 50% 20%, rgba(255,60,247,0.2), rgba(0,0,0,0) 60%), linear-gradient(180deg, rgba(0,247,255,0.12), rgba(0,0,0,0))'
      return
    }

    const g = gl as WebGLRenderingContext
    const c = canvas as HTMLCanvasElement

    function createShader(type: number, source: string) {
      const sh = g.createShader(type)!
      g.shaderSource(sh, source)
      g.compileShader(sh)
      if (!g.getShaderParameter(sh, g.COMPILE_STATUS)) {
        console.error('Shader compile error:', g.getShaderInfoLog(sh))
        g.deleteShader(sh)
        return null
      }
      return sh
    }
    function createProgram(vsSrc: string, fsSrc: string) {
      const vs = createShader(g.VERTEX_SHADER, vsSrc)
      const fs = createShader(g.FRAGMENT_SHADER, fsSrc)
      if (!vs || !fs) return null
      const prog = g.createProgram()!
      g.attachShader(prog, vs)
      g.attachShader(prog, fs)
      g.linkProgram(prog)
      if (!g.getProgramParameter(prog, g.LINK_STATUS)) {
        console.error('Program link error:', g.getProgramInfoLog(prog))
        g.deleteProgram(prog)
        return null
      }
      return prog
    }

    const program = createProgram(VERT, FRAG)
    if (!program) return
    g.useProgram(program)

    // Fullscreen triangle strip
    const buffer = g.createBuffer()!
    g.bindBuffer(g.ARRAY_BUFFER, buffer)
    const verts = new Float32Array([
      -1, -1,  1, -1,  -1, 1,
       1, -1,  1,  1,  -1, 1,
    ])
    g.bufferData(g.ARRAY_BUFFER, verts, g.STATIC_DRAW)
    const loc = g.getAttribLocation(program, 'a_position')
    g.enableVertexAttribArray(loc)
    g.vertexAttribPointer(loc, 2, g.FLOAT, false, 0, 0)

    const uTime = g.getUniformLocation(program, 'u_time')
    const uRes = g.getUniformLocation(program, 'u_resolution')

    const dpr = Math.max(1, Math.min(2, Math.floor(window.devicePixelRatio || 1)))

    function resize() {
      const w = Math.floor(window.innerWidth * dpr)
      const h = Math.floor(window.innerHeight * dpr)
      if (c.width !== w || c.height !== h) {
        c.width = w
        c.height = h
      }
      c.style.width = '100%'
      c.style.height = '100%'
      g.viewport(0, 0, c.width, c.height)
    }
    resize()

    const start = performance.now()
    function frame() {
      const now = performance.now()
      const t = (now - start) / 1000
      resize()
      g.useProgram(program)
      if (uTime) g.uniform1f(uTime, t)
      if (uRes) g.uniform2f(uRes, c.width, c.height)
      g.drawArrays(g.TRIANGLES, 0, 6)
      rafRef.current = requestAnimationFrame(frame)
    }
    rafRef.current = requestAnimationFrame(frame)

    const onResize = () => resize()
    window.addEventListener('resize', onResize)
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      window.removeEventListener('resize', onResize)
    }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 0,
        pointerEvents: 'none',
      }}
    />
  )
}
