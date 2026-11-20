import type { GeoProjection } from 'd3-geo';

type SphereMesh = {
  lonLat: Float32Array;
  uv: Float32Array;
  indices: Uint16Array;
};

export type GlobeEarthGlParams = {
  width: number;
  height: number;
  projection: GeoProjection;
};

function buildSphereMesh(lonSteps = 120, latSteps = 60): SphereMesh {
  const lonLat: number[] = [];
  const uv: number[] = [];
  const indices: number[] = [];

  for (let j = 0; j <= latSteps; j += 1) {
    const lat = 90 - (180 * j) / latSteps;
    for (let i = 0; i <= lonSteps; i += 1) {
      const lon = -180 + (360 * i) / lonSteps;
      lonLat.push(lon, lat);
      uv.push((lon + 180) / 360, (90 - lat) / 180);
    }
  }

  const row = lonSteps + 1;
  for (let j = 0; j < latSteps; j += 1) {
    for (let i = 0; i < lonSteps; i += 1) {
      const a = j * row + i;
      const b = a + 1;
      const c = a + row;
      const d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  }

  return {
    lonLat: new Float32Array(lonLat),
    uv: new Float32Array(uv),
    indices: new Uint16Array(indices),
  };
}

function compileShader(
  gl: WebGLRenderingContext,
  type: number,
  source: string,
): WebGLShader {
  const shader = gl.createShader(type);
  if (!shader) throw new Error('Failed to create shader.');
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader) ?? 'Unknown shader error';
    gl.deleteShader(shader);
    throw new Error(log);
  }
  return shader;
}

function createProgram(
  gl: WebGLRenderingContext,
  vertexSource: string,
  fragmentSource: string,
): WebGLProgram {
  const vertexShader = compileShader(gl, gl.VERTEX_SHADER, vertexSource);
  const fragmentShader = compileShader(gl, gl.FRAGMENT_SHADER, fragmentSource);
  const program = gl.createProgram();
  if (!program) throw new Error('Failed to create program.');
  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);
  gl.deleteShader(vertexShader);
  gl.deleteShader(fragmentShader);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(program) ?? 'Unknown link error';
    gl.deleteProgram(program);
    throw new Error(log);
  }
  return program;
}

const VERTEX_SHADER = `
attribute vec2 aPosition;
attribute vec2 aUv;
uniform vec2 uViewport;
varying vec2 vUv;
void main() {
  vUv = aUv;
  gl_Position = vec4(
    (aPosition.x / uViewport.x) * 2.0 - 1.0,
    1.0 - (aPosition.y / uViewport.y) * 2.0,
    0.0,
    1.0
  );
}
`;

const FRAGMENT_SHADER = `
precision mediump float;
uniform sampler2D uTexture;
varying vec2 vUv;
void main() {
  gl_FragColor = texture2D(uTexture, vUv);
}
`;

/** GPU earth disk aligned with d3 orthographic projection (no 3D terrain). */
export class GlobeEarthRenderer {
  private gl: WebGLRenderingContext;
  private program: WebGLProgram;
  private mesh: SphereMesh;
  private positionBuffer: WebGLBuffer;
  private uvBuffer: WebGLBuffer;
  private dynamicIndexBuffer: WebGLBuffer;
  private texture: WebGLTexture | null = null;
  private projectedPositions: Float32Array;
  private dynamicIndices: Uint16Array;
  private readonly canvas: HTMLCanvasElement;
  private readonly positionLoc: GLint;
  private readonly uvLoc: GLint;
  private readonly viewportLoc: WebGLUniformLocation | null;
  private readonly textureLoc: WebGLUniformLocation | null;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const context =
      canvas.getContext('webgl', {
        alpha: true,
        antialias: true,
        premultipliedAlpha: false,
      }) ??
      canvas.getContext('experimental-webgl', {
        alpha: true,
        antialias: true,
        premultipliedAlpha: false,
      });
    if (!context) throw new Error('WebGL is not available.');
    const gl = context as WebGLRenderingContext;
    this.gl = gl;

    this.mesh = buildSphereMesh();
    this.projectedPositions = new Float32Array(this.mesh.lonLat.length);
    this.dynamicIndices = new Uint16Array(this.mesh.indices.length);

    this.program = createProgram(gl, VERTEX_SHADER, FRAGMENT_SHADER);
    this.positionLoc = gl.getAttribLocation(this.program, 'aPosition');
    this.uvLoc = gl.getAttribLocation(this.program, 'aUv');
    this.viewportLoc = gl.getUniformLocation(this.program, 'uViewport');
    this.textureLoc = gl.getUniformLocation(this.program, 'uTexture');

    this.positionBuffer = gl.createBuffer()!;
    this.uvBuffer = gl.createBuffer()!;
    this.dynamicIndexBuffer = gl.createBuffer()!;

    gl.bindBuffer(gl.ARRAY_BUFFER, this.uvBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, this.mesh.uv, gl.STATIC_DRAW);
  }

  async setTexture(image: HTMLImageElement): Promise<void> {
    const { gl } = this;
    if (!this.texture) {
      this.texture = gl.createTexture();
    }
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
  }

  render({ width, height, projection }: GlobeEarthGlParams): void {
    if (!this.texture || width <= 0 || height <= 0) return;

    const { gl, mesh } = this;
    const dpr = window.devicePixelRatio || 1;
    const targetW = Math.floor(width * dpr);
    const targetH = Math.floor(height * dpr);
    if (this.canvas.width !== targetW || this.canvas.height !== targetH) {
      this.canvas.width = targetW;
      this.canvas.height = targetH;
      this.canvas.style.width = `${width}px`;
      this.canvas.style.height = `${height}px`;
    }

    gl.viewport(0, 0, targetW, targetH);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    const vertexCount = mesh.lonLat.length / 2;
    for (let i = 0; i < vertexCount; i += 1) {
      const lon = mesh.lonLat[i * 2];
      const lat = mesh.lonLat[i * 2 + 1];
      const projected = projection([lon, lat]);
      if (projected) {
        this.projectedPositions[i * 2] = projected[0];
        this.projectedPositions[i * 2 + 1] = projected[1];
      } else {
        this.projectedPositions[i * 2] = Number.NaN;
        this.projectedPositions[i * 2 + 1] = Number.NaN;
      }
    }

    let dynamicCount = 0;
    for (let i = 0; i < mesh.indices.length; i += 3) {
      const a = mesh.indices[i];
      const b = mesh.indices[i + 1];
      const c = mesh.indices[i + 2];
      if (
        Number.isFinite(this.projectedPositions[a * 2]) &&
        Number.isFinite(this.projectedPositions[b * 2]) &&
        Number.isFinite(this.projectedPositions[c * 2])
      ) {
        this.dynamicIndices[dynamicCount++] = a;
        this.dynamicIndices[dynamicCount++] = b;
        this.dynamicIndices[dynamicCount++] = c;
      }
    }

    if (dynamicCount === 0) return;

    gl.useProgram(this.program);
    gl.uniform2f(this.viewportLoc, width, height);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.uniform1i(this.textureLoc, 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, this.projectedPositions, gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(this.positionLoc);
    gl.vertexAttribPointer(this.positionLoc, 2, gl.FLOAT, false, 0, 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.uvBuffer);
    gl.enableVertexAttribArray(this.uvLoc);
    gl.vertexAttribPointer(this.uvLoc, 2, gl.FLOAT, false, 0, 0);

    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.dynamicIndexBuffer);
    gl.bufferData(
      gl.ELEMENT_ARRAY_BUFFER,
      this.dynamicIndices.subarray(0, dynamicCount),
      gl.DYNAMIC_DRAW,
    );
    gl.drawElements(gl.TRIANGLES, dynamicCount, gl.UNSIGNED_SHORT, 0);
  }

  dispose(): void {
    const { gl } = this;
    if (this.texture) gl.deleteTexture(this.texture);
    gl.deleteBuffer(this.positionBuffer);
    gl.deleteBuffer(this.uvBuffer);
    gl.deleteBuffer(this.dynamicIndexBuffer);
    gl.deleteProgram(this.program);
    this.texture = null;
  }
}
