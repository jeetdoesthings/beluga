// Three.js scene manager for Beluga's 3D room viewer (spec §9, §10, §12, §13, §15, §19, §45)

import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { TransformControls } from "three/examples/jsm/controls/TransformControls.js";

// TransformControls extends Object3D in three.js; cast as needed

import type {
  BelugaProject,
  Speaker,
  Listener,
  Vector3 as BVector3,
  Orientation,
} from "../types/project";
import { computeSpeakerGains } from "../vbap";

export type CameraView = "orbit" | "top" | "front" | "listener";

export interface SceneUpdate {
  speakerGains: number[];
  speakerAzimuths: number[];
  speakerDistances: number[];
}

export class BelugaScene {
  // Three.js core
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  orbitControls: OrbitControls;
  transformControls: TransformControls;
  container: HTMLElement;

  // Scene objects
  roomMesh: THREE.Mesh | null = null;
  roomGroup: THREE.Group;
  speakerGroup: THREE.Group;
  speakerMeshes: THREE.Mesh[] = [];
  listenerMesh: THREE.Group | null = null;
  sourceMesh: THREE.Mesh | null = null;
  sourceArrow: THREE.ArrowHelper | null = null;
  listenerArrow: THREE.ArrowHelper | null = null;

  // State
  project: BelugaProject;
  selectedObjectId: string | null = null;
  currentView: CameraView = "orbit";

  // Callbacks
  onSelectionChange: ((id: string | null) => void) | null = null;
  onObjectMove: ((id: string, position: BVector3) => void) | null = null;
  onObjectRotate: ((id: string, orientation: Orientation) => void) | null = null;
  onSourceMove: ((azimuth: number, distance: number) => void) | null = null;
  onSceneUpdate: ((update: SceneUpdate) => void) | null = null;

  // Raycaster for click placement
  raycaster = new THREE.Raycaster();
  mouse = new THREE.Vector2();

  // Mode
  placementMode: "none" | "speaker" = "none";

  private animationId: number | null = null;
  private resizeObserver: ResizeObserver | null = null;

  constructor(container: HTMLElement, project: BelugaProject) {
    this.container = container;
    this.project = project;

    // Renderer
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.setClearColor(0x1a1a2e);
    container.appendChild(this.renderer.domElement);

    // Scene
    this.scene = new THREE.Scene();
    this.scene.add(new THREE.AmbientLight(0x404040, 2));
    const dirLight = new THREE.DirectionalLight(0xffffff, 1.5);
    dirLight.position.set(5, 10, 8);
    this.scene.add(dirLight);

    // Grid
    const grid = new THREE.GridHelper(10, 20, 0x444466, 0x333344);
    this.scene.add(grid);

    // Camera
    this.camera = new THREE.PerspectiveCamera(
      60,
      container.clientWidth / container.clientHeight,
      0.1,
      1000
    );
    this.camera.position.set(6, 6, 5);
    this.camera.lookAt(0, 0, 1);

    // Controls
    this.orbitControls = new OrbitControls(this.camera, this.renderer.domElement);
    this.orbitControls.enableDamping = true;
    this.orbitControls.target.set(0, 0, 1);

    this.transformControls = new TransformControls(this.camera, this.renderer.domElement);
    this.transformControls.addEventListener("dragging-changed", (e) => {
      this.orbitControls.enabled = !e.value;
    });
    this.transformControls.addEventListener("objectChange", () => {
      this.handleTransformChange();
    });
  this.scene.add(this.transformControls as unknown as THREE.Object3D);

    // Groups
    this.roomGroup = new THREE.Group();
    this.scene.add(this.roomGroup);
    this.speakerGroup = new THREE.Group();
    this.scene.add(this.speakerGroup);

    // Build initial scene
    this.buildRoom();
    this.rebuildSpeakers();
    this.buildListener();
    this.buildSource();

    // Event listeners
    this.renderer.domElement.addEventListener("click", this.onCanvasClick);
    this.renderer.domElement.addEventListener("pointermove", this.onPointerMove);

    // Resize observer
    this.resizeObserver = new ResizeObserver(() => this.onResize());
    this.resizeObserver.observe(container);

    // Start animation loop
    this.animate();
  }

  // --- Room ---

  buildRoom() {
    // Clear existing
    if (this.roomMesh) {
      this.roomGroup.remove(this.roomMesh);
      this.roomMesh = null;
    }
    // Clear any GLTF children
    while (this.roomGroup.children.length > 0) {
      const child = this.roomGroup.children[0];
      this.roomGroup.remove(child);
    }

    const { length, width, height } = this.project.room;

    // Room as wireframe box (meters: width=X, length=Y, height=Z)
    const geo = new THREE.BoxGeometry(width, length, height);
    const edges = new THREE.EdgesGeometry(geo);
    const lineMat = new THREE.LineBasicMaterial({ color: 0x6688aa });
    const wireframe = new THREE.LineSegments(edges, lineMat);
    wireframe.position.set(0, 0, height / 2);
    this.roomGroup.add(wireframe);

    // Semi-transparent floor
    const floorGeo = new THREE.PlaneGeometry(width, length);
    const floorMat = new THREE.MeshBasicMaterial({
      color: 0x2a2a4a,
      transparent: true,
      opacity: 0.3,
      side: THREE.DoubleSide,
    });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    this.roomGroup.add(floor);

    this.roomMesh = floor;
  }

  loadGLB(data: ArrayBuffer) {
    // Clear existing room
    while (this.roomGroup.children.length > 0) {
      const child = this.roomGroup.children[0];
      this.roomGroup.remove(child);
    }

    const loader = new GLTFLoader();
    loader.parse(data, "", (gltf) => {
      const model = gltf.scene;

      // Normalize: compute bounding box, scale to fit, center on origin
      const box = new THREE.Box3().setFromObject(model);
      const size = box.getSize(new THREE.Vector3());
      const center = box.getCenter(new THREE.Vector3());

      // Determine scale: assume the largest dimension should be reasonable room size
      // We'll scale so that the max dimension becomes the room's max dimension
      const maxDim = Math.max(size.x, size.y, size.z);
      const targetMax = Math.max(this.project.room.width, this.project.room.length, this.project.room.height);
      const scale = maxDim > 0 ? targetMax / maxDim : 1;

      model.scale.setScalar(scale);
      // Recompute center after scaling
      const box2 = new THREE.Box3().setFromObject(model);
      const center2 = box2.getCenter(new THREE.Vector3());
      model.position.sub(center2);
      // Put floor at z=0
      const box3 = new THREE.Box3().setFromObject(model);
      const minZ = box3.min.z;
      model.position.z -= minZ;

      this.roomGroup.add(model);
    });
  }

  // --- Speakers ---

  rebuildSpeakers() {
    while (this.speakerGroup.children.length > 0) {
      this.speakerGroup.remove(this.speakerGroup.children[0]);
    }
    this.speakerMeshes = [];

    for (const speaker of this.project.speakers) {
      const mesh = this.createSpeakerMesh(speaker);
      this.speakerGroup.add(mesh);
      this.speakerMeshes.push(mesh);
    }
  }

  createSpeakerMesh(speaker: Speaker): THREE.Mesh {
    const geo = new THREE.SphereGeometry(0.15, 16, 12);
    const mat = new THREE.MeshPhongMaterial({
      color: speaker.enabled ? 0x44ff88 : 0x666666,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(speaker.position.x, speaker.position.z, -speaker.position.y);
    mesh.userData = { type: "speaker", id: speaker.id, name: speaker.name };
    return mesh;
  }

  addSpeaker(speaker: Speaker) {
    this.project.speakers.push(speaker);
    const mesh = this.createSpeakerMesh(speaker);
    this.speakerGroup.add(mesh);
    this.speakerMeshes.push(mesh);
    this.updateSceneUpdate();
  }

  updateSpeakerPosition(id: string, pos: BVector3) {
    const mesh = this.speakerMeshes.find((m) => m.userData.id === id);
    if (mesh) {
      mesh.position.set(pos.x, pos.z, -pos.y);
    }
    this.updateSceneUpdate();
  }

  updateSpeakerOrientation(id: string, orient: Orientation) {
    const speaker = this.project.speakers.find((s) => s.id === id);
    if (speaker) {
      speaker.orientation = orient;
    }
    this.updateSceneUpdate();
  }

  removeSpeaker(id: string) {
    const idx = this.speakerMeshes.findIndex((m) => m.userData.id === id);
    if (idx >= 0) {
      this.speakerGroup.remove(this.speakerMeshes[idx]);
      this.speakerMeshes.splice(idx, 1);
    }
    this.project.speakers = this.project.speakers.filter((s) => s.id !== id);
    if (this.selectedObjectId === id) {
      this.transformControls.detach();
      this.selectedObjectId = null;
    }
    this.updateSceneUpdate();
  }

  // --- Listener ---

  buildListener() {
    if (this.listenerMesh) {
      this.scene.remove(this.listenerMesh);
      this.listenerMesh = null;
    }
    if (this.listenerArrow) {
      this.scene.remove(this.listenerArrow);
      this.listenerArrow = null;
    }

    const listener = this.project.listeners[0];
    if (!listener) return;

    // Head sphere
    const headGeo = new THREE.SphereGeometry(0.18, 16, 12);
    const headMat = new THREE.MeshPhongMaterial({ color: 0xffaa44 });
    const head = new THREE.Mesh(headGeo, headMat);
    head.position.set(listener.position.x, listener.position.z, -listener.position.y);
    head.userData = { type: "listener", id: listener.id, name: listener.name };

    // Forward arrow
    const yawRad = (listener.orientation.yaw * Math.PI) / 180;
    const dir = new THREE.Vector3(Math.sin(yawRad), 0, -Math.cos(yawRad));
    // In Three.js, our mapping is: world X->Three X, world Y-> Three -Z, world Z -> Three Y
    // So forward (+Y in world) maps to -Z in Three
    // Forward direction in listener frame: yaw rotates +Y
    // dir_x = sin(yaw), dir_y_world = cos(yaw) -> three_z = -cos(yaw)
    const arrowDir = new THREE.Vector3(Math.sin(yawRad), 0, -Math.cos(yawRad)).normalize();
    this.listenerArrow = new THREE.ArrowHelper(
      arrowDir,
      head.position,
      0.8,
      0xff8800,
      0.15,
      0.1
    );

    const group = new THREE.Group();
    group.add(head);
    this.scene.add(group);
    this.scene.add(this.listenerArrow);
    this.listenerMesh = group;
  }

  updateListenerPosition(pos: BVector3) {
    const listener = this.project.listeners[0];
    if (listener) {
      listener.position = pos;
    }
    this.buildListener();
    this.updateSceneUpdate();
  }

  updateListenerOrientation(orient: Orientation) {
    const listener = this.project.listeners[0];
    if (listener) {
      listener.orientation = orient;
    }
    this.buildListener();
    this.updateSceneUpdate();
  }

  // --- Virtual Source ---

  buildSource() {
    if (this.sourceMesh) {
      this.scene.remove(this.sourceMesh);
      this.sourceMesh = null;
    }

    const geo = new THREE.SphereGeometry(0.12, 16, 12);
    const mat = new THREE.MeshPhongMaterial({ color: 0x44aaff, emissive: 0x224488 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.userData = { type: "source", id: "source" };

    const listener = this.project.listeners[0];
    if (listener) {
      const src = this.project.virtualSource;
      const azRad = (src.azimuth * Math.PI) / 180;
      const x = listener.position.x + src.distance * Math.sin(azRad);
      const y = listener.position.y + src.distance * Math.cos(azRad);
      const z = listener.position.z;
      mesh.position.set(x, z, -y);
    }

    this.scene.add(mesh);
    this.sourceMesh = mesh;
  }

  updateSource(azimuth: number, distance: number) {
    this.project.virtualSource.azimuth = azimuth;
    this.project.virtualSource.distance = distance;
    this.buildSource();
    this.updateSceneUpdate();
  }

  // --- Selection & Transform ---

  selectObject(id: string | null) {
    this.selectedObjectId = id;
    if (id === null) {
      this.transformControls.detach();
    } else {
      // Find the mesh
      const mesh =
        this.speakerMeshes.find((m) => m.userData.id === id) ||
        (this.listenerMesh?.children[0] as THREE.Mesh | undefined) ||
        this.sourceMesh;
      if (mesh && mesh !== this.listenerMesh as any) {
        this.transformControls.attach(mesh);
      }
    }
    if (this.onSelectionChange) this.onSelectionChange(id);
  }

  setTransformMode(mode: "translate" | "rotate") {
    this.transformControls.setMode(mode);
  }

  handleTransformChange() {
    if (!this.selectedObjectId) return;
    const obj = this.transformControls.object;
    if (!obj) return;

    // Convert Three.js coords back to Beluga world coords (X->X, Z->Y, Y->Z)
    const belugaPos = { x: obj.position.x, y: -obj.position.z, z: obj.position.y };

    if (obj.userData.type === "speaker" && this.onObjectMove) {
      this.onObjectMove(obj.userData.id, belugaPos);
    }
    // Listener and source are handled differently
    this.updateSceneUpdate();
  }

  // --- Camera Views ---

  setView(view: CameraView) {
    this.currentView = view;
    const listener = this.project.listeners[0];
    switch (view) {
      case "orbit":
        this.camera.position.set(6, 6, 5);
        this.orbitControls.target.set(0, 0, 1);
        this.orbitControls.enabled = true;
        break;
      case "top":
        this.camera.position.set(0, 10, 0.01);
        this.orbitControls.target.set(0, 0, 0);
        this.orbitControls.enabled = true;
        break;
      case "front":
        this.camera.position.set(0, -6, 1.5);
        this.orbitControls.target.set(0, 0, 1.5);
        this.orbitControls.enabled = true;
        break;
      case "listener": {
        if (listener) {
          const yawRad = (listener.orientation.yaw * Math.PI) / 180;
          const px = listener.position.x;
          const py = listener.position.y;
          const pz = listener.position.z;
          // Camera at listener position, looking forward (yaw direction)
          const forwardX = Math.sin(yawRad);
          const forwardY = Math.cos(yawRad);
          // Three.js coords: x -> X, y -> Z (height), z -> -Y
          this.camera.position.set(px, pz, -py);
          this.camera.lookAt(
            px + forwardX * 2,
            pz,
            -(py + forwardY * 2)
          );
          this.orbitControls.target.set(
            px + forwardX * 2,
            pz,
            -(py + forwardY * 2)
          );
          this.orbitControls.enabled = true;
        }
        break;
      }
    }
    this.orbitControls.update();
  }

  // --- Placement ---

  setPlacementMode(mode: "none" | "speaker") {
    this.placementMode = mode;
  }

  onCanvasClick = (event: MouseEvent) => {
    if (this.placementMode !== "speaker") return;

    const rect = this.renderer.domElement.getBoundingClientRect();
    this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    this.raycaster.setFromCamera(this.mouse, this.camera);

    // Raycast against room floor and room walls
    const intersects = this.raycaster.intersectObjects(this.roomGroup.children, true);
    if (intersects.length > 0) {
      const point = intersects[0].point;
      // Convert Three.js coords to Beluga world coords (X->X, Z->Y, Y->Z)
      const belugaPos = { x: point.x, y: -point.z, z: point.y };
      // Signal to React that a speaker should be placed here
      if (this.onObjectMove) {
        // Use a special callback: place new speaker
        this.onObjectMove("__new_speaker__", belugaPos);
      }
    }

    this.placementMode = "none";
  };

  onPointerMove = (_event: PointerEvent) => {
    // Could add hover effects here
  };

  // --- Gain visualization ---

  updateSceneUpdate() {
    if (!this.onSceneUpdate) return;

    const listener = this.project.listeners[0];
    if (!listener || this.project.speakers.length === 0) {
      this.onSceneUpdate({ speakerGains: [], speakerAzimuths: [], speakerDistances: [] });
      return;
    }

    // Compute gains using VBAP
    const positions = this.project.speakers.map((s) => s.position);
    const result = computeSpeakerGains(
      positions,
      listener.position,
      listener.orientation,
      this.project.virtualSource.azimuth
    );

    // Update speaker colors based on gain
    for (let i = 0; i < this.speakerMeshes.length; i++) {
      const mesh = this.speakerMeshes[i];
      const gain = result.gains[i] || 0;
      // Interpolate from dim green (0x224422) to bright green (0x44ff88) based on gain
      const r = 0x22 + (0x44 - 0x22) * gain;
      const g = 0x44 + (0xff - 0x44) * gain;
      const b = 0x22 + (0x88 - 0x22) * gain;
      (mesh.material as THREE.MeshPhongMaterial).color.setRGB(r / 255, g / 255, b / 255);
      // Scale by gain
      const scale = 0.15 + 0.1 * gain;
      mesh.scale.setScalar(scale);
    }

    if (this.onSceneUpdate) {
      this.onSceneUpdate({
        speakerGains: result.gains,
        speakerAzimuths: result.azimuths,
        speakerDistances: result.distances,
      });
    }
  }

  // --- Lifecycle ---

  private animate = () => {
    this.animationId = requestAnimationFrame(this.animate);
    this.orbitControls.update();
    this.renderer.render(this.scene, this.camera);
  };

  private onResize() {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }

  dispose() {
    if (this.animationId !== null) cancelAnimationFrame(this.animationId);
    this.resizeObserver?.disconnect();
    this.renderer.domElement.removeEventListener("click", this.onCanvasClick);
    this.renderer.domElement.removeEventListener("pointermove", this.onPointerMove);
    this.orbitControls.dispose();
    this.transformControls.dispose();
    this.renderer.dispose();
    if (this.renderer.domElement.parentElement === this.container) {
      this.container.removeChild(this.renderer.domElement);
    }
  }

  updateProject(project: BelugaProject) {
    this.project = project;
    this.buildRoom();
    this.rebuildSpeakers();
    this.buildListener();
    this.buildSource();
    this.updateSceneUpdate();
  }
}