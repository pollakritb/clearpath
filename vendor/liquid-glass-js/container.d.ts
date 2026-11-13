export default class Container {
  static instances: Container[];
  constructor(options?: {
    type?: string;
    borderRadius?: number;
    tintOpacity?: number;
  });
  element: HTMLDivElement;
  canvas: HTMLCanvasElement;
  gl: WebGLRenderingContext | null;
  gl_refs: {
    gl?: WebGLRenderingContext;
    texture?: WebGLTexture;
    textureSizeLoc: WebGLUniformLocation | null;
    scrollYLoc: WebGLUniformLocation | null;
    containerPositionLoc: WebGLUniformLocation | null;
    resolutionLoc: WebGLUniformLocation | null;
    borderRadiusLoc: WebGLUniformLocation | null;
  };
  width: number;
  height: number;
  borderRadius: number;
  webglInitialized: boolean;
  createElement(): void;
  setupCanvas(): void;
  setupShader(image: HTMLCanvasElement): void;
  updateSizeFromDOM(): void;
  getPosition(): { x: number; y: number };
}
