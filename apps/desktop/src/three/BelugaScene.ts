// Three.js scene manager for Beluga's 3D room viewer
// Interaction: click to select, Blender-style transform gizmo to move/rotate.
// One drag system only (TransformControls) — no manual pointer-drag fighting it.

import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { TransformControls } from "three/examples/jsm/controls/TransformControls.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import type {
  BelugaProject,
  Speaker,
  Vector3 as BVector3,
  Orientation,
} from "../types/project";
import { computeSpeakerGains } from "../vbap";

export type CameraView = "orbit" | "top" | "front" | "listener";
export type TransformMode = "translate" | "rotate" | "scale";

export interface SceneUpdate {
  speakerGains: number[];
  speakerAzimuths: number[];
  speakerDistances: number[];
}

export class BelugaScene {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  orbitControls: OrbitControls;
  transformControls: TransformControls;
  container: HTMLElement;

  roomGroup: THREE.Group;
  speakerGroup: THREE.Group;
  listenerGroup: THREE.Group;

  speakerMeshes: THREE.Mesh[] = [];
  listenerGroupObj: THREE.Group | null = null;
  sourceMesh: THREE.Mesh | null = null;

  project: BelugaProject;
  selectedObjectId: string | null = null;
  currentView: CameraView = "orbit";
  transformMode: TransformMode = "translate";

  // Callbacks
  onSelectionChange: ((id: string | null) => void) | null = null;
  onSpeakerMove: ((id: string, position: BVector3) => void) | null = null;
  onListenerMove: ((position: BVector3) => void) | null = null;
  onSourceMove: ((azimuth: number, distance: number) => void) | null = null;
  onSceneUpdate: ((update: SceneUpdate) => void) | null = null;
  onPlacementRequest: ((position: BVector3) => void) | null = null;

  raycaster = new THREE.Raycaster();
  mouse = new THREE.Vector2();
  placementMode: "none" | "speaker" = "none";

  private animationId: number | null = null;
  private resizeObserver: ResizeObserver | null = null;

  constructor(container: HTMLElement, project: BelugaProject) {
    this.container = container;
    this.project = project;

    // Renderer — light mode
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.setClearColor(0xf5f5f7, 1);
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0xf5f5f7);

    // Lighting
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.8));
    const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
    dirLight.position.set(5, 10, 8);
    this.scene.add(dirLight);
    const fillLight = new THREE.DirectionalLight(0xccddff, 0.3);
    fillLight.position.set(-5, 5, -5);
    this.scene.add(fillLight);

    // Solid floor — the room sits on this, camera never goes below
    const floorGeo = new THREE.PlaneGeometry(20, 20);
    const floorMat = new THREE.MeshLambertMaterial({ color: 0xe9e9ee, side: THREE.DoubleSide });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = 0;
    this.scene.add(floor);

    // Subtle grid on the floor
    const grid = new THREE.GridHelper(20, 40, 0xccccd4, 0xddddd2);
    const gridMat = grid.material as THREE.Material;
    gridMat.transparent = true;
    gridMat.opacity = 0.4;
    grid.position.y = 0.001;
    this.scene.add(grid);

    // Camera
    this.camera = new THREE.PerspectiveCamera(55, container.clientWidth / container.clientHeight, 0.1, 1000);
    this.camera.position.set(6, 5, 7);
    this.camera.lookAt(0, 1, 0);

    // Orbit controls
    this.orbitControls = new OrbitControls(this.camera, this.renderer.domElement);
    this.orbitControls.enableDamping = true;
    this.orbitControls.dampingFactor = 0.12;
    this.orbitControls.target.set(0, 1, 0);
    this.orbitControls.minDistance = 1.5;
    this.orbitControls.maxDistance = 30;
    this.orbitControls.maxPolarAngle = Math.PI / 2 - 0.02; // never below floor
    this.orbitControls.minPolarAngle = 0.05;

    // Transform gizmo — THE drag system
    this.transformControls = new TransformControls(this.camera, this.renderer.domElement);
    this.transformControls.setMode("translate");
    this.transformControls.setSize(1.0);
    this.transformControls.addEventListener("dragging-changed", (e: any) => {
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
    this.listenerGroup = new THREE.Group();
    this.scene.add(this.listenerGroup);

    // Build scene
    this.buildRoom();
    this.rebuildSpeakers();
    this.buildListener();
    this.buildSource();

    // Click = select only (gizmo handles dragging)
    this.renderer.domElement.addEventListener("pointerdown", this.onPointerDown);

    // Keyboard: W/E/R modes, Esc deselect, Delete remove speaker
    window.addEventListener("keydown", this.onKeyDown);

    this.resizeObserver = new ResizeObserver(() => this.onResize());
    this.resizeObserver.observe(container);

    this.animate();
  }

  // --- Coordinate conversion: Beluga (X right, Y forward, Z up) <-> Three (X right, Y up, Z toward viewer) ---
  threeToBeluga(p: THREE.Vector3): BVector3 {
    return { x: p.x, y: -p.z, z: p.y };
  }
  belugaToThree(p: BVector3): THREE.Vector3 {
    return new THREE.Vector3(p.x, p.z, -p.y);
  }

  // --- Room ---
  buildRoom() {
    while (this.roomGroup.children.length > 0) {
      this.roomGroup.remove(this.roomGroup.children[0]);
    }
    const { length, width, height } = this.project.room;

    const geo = new THREE.BoxGeometry(width, length, height);
    const edges = new THREE.EdgesGeometry(geo);
    const lineMat = new THREE.LineBasicMaterial({ color: 0x7fa8c9, transparent: true, opacity: 0.7 });
    const wire = new THREE.LineSegments(edges, lineMat);
    wire.position.y = height / 2; // bottom sits on floor
    this.roomGroup.add(wire);
  }

  loadGLB(data: ArrayBuffer) {
    while (this.roomGroup.children.length > 0) {
      this.roomGroup.remove(this.roomGroup.children[0]);
    }
    const loader = new GLTFLoader();
    loader.parse(data, "", (gltf) => {
      const model = gltf.scene;
      const box = new THREE.Box3().setFromObject(model);
      const size = box.getSize(new THREE.Vector3());
      const maxDim = Math.max(size.x, size.y, size.z);
      const targetMax = Math.max(
        this.project.room.width,
        this.project.room.length,
        this.project.room.height
      );
      const scale = maxDim > 0 ? targetMax / maxDim : 1;
      model.scale.setScalar(scale);

      const box2 = new THREE.Box3().setFromObject(model);
      const center2 = box2.getCenter(new THREE.Vector3());
      model.position.sub(center2);
      const box3 = new THREE.Box3().setFromObject(model);
      model.position.y -= box3.min.y; // sit on floor

      model.traverse((child) => {
        if ((child as THREE.Mesh).isMesh) {
          const mesh = child as THREE.Mesh;
          mesh.material = new THREE.MeshLambertMaterial({
            color: 0xcccccc,
            transparent: true,
            opacity: 0.35,
            side: THREE.DoubleSide,
          });
        }
      });
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
    const geo = new THREE.SphereGeometry(0.18, 24, 18);
    const mat = new THREE.MeshPhongMaterial({
      color: 0x007aff,
      transparent: true,
      opacity: 0.95,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.copy(this.belugaToThree(speaker.position));
    mesh.userData = { type: "speaker", id: speaker.id, name: speaker.name };
    return mesh;
  }

  addSpeaker(speaker: Speaker) {
    const mesh = this.createSpeakerMesh(speaker);
    this.speakerGroup.add(mesh);
    this.speakerMeshes.push(mesh);
    this.updateGainVisualization();
  }

  updateSpeakerPosition(id: string, pos: BVector3) {
    const speaker = this.project.speakers.find((s) => s.id === id);
    if (speaker) speaker.position = pos;
    const mesh = this.speakerMeshes.find((m) => m.userData.id === id);
    if (mesh) mesh.position.copy(this.belugaToThree(pos));
    this.updateGainVisualization();
  }

  removeSpeaker(id: string) {
    const idx = this.speakerMeshes.findIndex((m) => m.userData.id === id);
    if (idx >= 0) {
      this.speakerGroup.remove(this.speakerMeshes[idx]);
      this.speakerMeshes.splice(idx, 1);
    }
    this.project.speakers = this.project.speakers.filter((s) => s.id !== id);
    if (this.selectedObjectId === id) {
      this.selectedObjectId = null;
      this.transformControls.detach();
    }
    this.updateGainVisualization();
  }

  // --- Listener ---
  buildListener() {
    while (this.listenerGroup.children.length > 0) {
      this.listenerGroup.remove(this.listenerGroup.children[0]);
    }
    const listener = this.project.listeners[0];
    if (!listener) return;

    const group = new THREE.Group();
    const pos = this.belugaToThree(listener.position);
    group.position.copy(pos);

    const headGeo = new THREE.SphereGeometry(0.2, 24, 18);
    const headMat = new THREE.MeshPhongMaterial({ color: 0xff9500, transparent: true, opacity: 0.95 });
    const head = new THREE.Mesh(headGeo, headMat);
    group.add(head);

    // Direction arrow (listener forward), parented to the group so rotation works.
    // Local direction is -Z; the group's rotation.y carries the yaw.
    const arrow = new THREE.ArrowHelper(
      new THREE.Vector3(0, 0, -1),
      new THREE.Vector3(0, 0, 0),
      0.9,
      0xff9500,
      0.18,
      0.12
    );
    group.add(arrow);
    group.rotation.y = -(listener.orientation.yaw * Math.PI) / 180;

    group.userData = { type: "listener" };
    this.listenerGroup.add(group);
    this.listenerGroupObj = group;
  }

  updateListenerPosition(pos: BVector3) {
    const listener = this.project.listeners[0];
    if (listener) listener.position = pos;
    if (this.listenerGroupObj) this.listenerGroupObj.position.copy(this.belugaToThree(pos));
    this.buildSource(); // source is relative to listener
    this.updateGainVisualization();
  }

  updateListenerOrientation(orient: Orientation) {
    const listener = this.project.listeners[0];
    if (listener) listener.orientation = orient;
    // rebuild arrow direction without breaking gizmo attach: rebuild children in place
    this.refreshListenerArrow();
    this.updateGainVisualization();
  }

  private refreshListenerArrow() {
    if (!this.listenerGroupObj) return;
    const listener = this.project.listeners[0];
    if (!listener) return;
    // Arrow is a child of the group with local -Z direction;
    // yaw is simply the group rotation around Y.
    this.listenerGroupObj.rotation.y = -(listener.orientation.yaw * Math.PI) / 180;
  }

  // --- Virtual source ---
  buildSource() {
    if (this.sourceMesh) {
      this.scene.remove(this.sourceMesh);
      this.sourceMesh = null;
    }
    const geo = new THREE.SphereGeometry(0.14, 20, 16);
    const mat = new THREE.MeshPhongMaterial({
      color: 0xaf52ce,
      emissive: 0x442266,
      transparent: true,
      opacity: 0.9,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.userData = { type: "source" };

    const listener = this.project.listeners[0];
    if (listener) {
      const src = this.project.virtualSource;
      const azRad = (src.azimuth * Math.PI) / 180;
      const pos = {
        x: listener.position.x + src.distance * Math.sin(azRad),
        y: listener.position.y + src.distance * Math.cos(azRad),
        z: listener.position.z,
      };
      mesh.position.copy(this.belugaToThree(pos));
    }
    this.scene.add(mesh);
    this.sourceMesh = mesh;
  }

  updateSource(azimuth: number, distance: number) {
    this.project.virtualSource.azimuth = azimuth;
    this.project.virtualSource.distance = distance;
    this.buildSource();
    this.reattachGizmo();
    this.updateGainVisualization();
  }

  // --- Selection ---
  selectObject(id: string | null) {
    this.selectedObjectId = id;
    this.rebuildSelectionVisuals();
    if (this.onSelectionChange) this.onSelectionChange(id);
  }

  findMeshById(id: string): THREE.Object3D | null {
    if (id === "listener") return this.listenerGroupObj;
    if (id === "source") return this.sourceMesh;
    return this.speakerMeshes.find((m) => m.userData.id === id) ?? null;
  }

  setTransformMode(mode: TransformMode) {
    this.transformMode = mode;
    this.transformControls.setMode(mode);
  }

  rebuildSelectionVisuals() {
    // Emissive highlight on the selected speaker only
    for (const m of this.speakerMeshes) {
      const sel = m.userData.id === this.selectedObjectId;
      (m.material as THREE.MeshPhongMaterial).emissive.setHex(sel ? 0x003a7a : 0x000000);
    }
    this.reattachGizmo();
  }

  /** Attach the gizmo to the selected object's CURRENT mesh (safe after rebuilds). */
  private reattachGizmo() {
    if (this.selectedObjectId === null) {
      this.transformControls.detach();
      return;
    }
    const target = this.findMeshById(this.selectedObjectId);
    if (target) {
      this.transformControls.attach(target);
    } else {
      this.transformControls.detach();
    }
  }

  handleTransformChange() {
    if (!this.selectedObjectId) return;
    const obj = this.transformControls.object;
    if (!obj) return;

    const id = obj.userData?.id ?? this.selectedObjectId;
    const belugaPos = this.threeToBeluga(obj.position);

    if (id === "listener") {
      const listener = this.project.listeners[0];
      if (listener) {
        listener.position = belugaPos;
        // rotation.y (Three, around vertical) == -Beluga yaw (sign convention)
        listener.orientation = {
          ...listener.orientation,
          yaw: ((-obj.rotation.y * 180) / Math.PI + 360) % 360,
        };
        this.refreshListenerArrow();
      }
      if (this.onListenerMove) this.onListenerMove(belugaPos);
    } else if (id === "source") {
      const listener = this.project.listeners[0];
      if (listener) {
        const dx = belugaPos.x - listener.position.x;
        const dy = belugaPos.y - listener.position.y;
        const dz = belugaPos.z - listener.position.z;
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
        let az = (Math.atan2(dx, dy) * 180) / Math.PI;
        while (az > 180) az -= 360;
        while (az <= -180) az += 360;
        this.project.virtualSource.azimuth = az;
        this.project.virtualSource.distance = dist;
        if (this.onSourceMove) this.onSourceMove(az, dist);
      }
    } else {
      // Speaker
      const speaker = this.project.speakers.find((s) => s.id === id);
      if (speaker) {
        speaker.position = belugaPos;
        speaker.orientation = {
          ...speaker.orientation,
          yaw: ((-obj.rotation.y * 180) / Math.PI + 360) % 360,
        };
      }
      if (this.onSpeakerMove) this.onSpeakerMove(id, belugaPos);
    }

    this.updateGainVisualization();
  }

  // --- Click = select only (gizmo does all dragging) ---
  onPointerDown = (event: PointerEvent) => {
    // Only respond to clicks on the 3D canvas, not on the gizmo overlay
    if (event.target !== this.renderer.domElement) return;

    // Never interfere while the transform gizmo is dragging
    if (this.transformControls.dragging) return;

    if (this.placementMode === "speaker") {
      this.updateMouseFromEvent(event);
      this.raycaster.setFromCamera(this.mouse, this.camera);
      const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
      const point = new THREE.Vector3();
      this.raycaster.ray.intersectPlane(groundPlane, point);
      if (point) {
        const pos = this.threeToBeluga(point);
        const r = this.project.room;
        pos.x = Math.max(-r.width / 2, Math.min(r.width / 2, pos.x));
        pos.y = Math.max(-r.length / 2, Math.min(r.length / 2, pos.y));
        pos.z = Math.max(0, Math.min(r.height, pos.z));
        if (this.onPlacementRequest) this.onPlacementRequest(pos);
      }
      this.placementMode = "none";
      return;
    }

    this.updateMouseFromEvent(event);
    this.raycaster.setFromCamera(this.mouse, this.camera);

    const speakerHits = this.raycaster.intersectObjects(this.speakerMeshes, false);
    const listenerHits = this.listenerGroupObj
      ? this.raycaster.intersectObjects(this.listenerGroupObj.children, false)
      : [];
    const sourceHits = this.sourceMesh ? this.raycaster.intersectObject(this.sourceMesh, false) : [];

    let hitId: string | null = null;
    let bestDist = Infinity;
    if (speakerHits.length > 0 && speakerHits[0].distance < bestDist) {
      hitId = speakerHits[0].object.userData.id;
      bestDist = speakerHits[0].distance;
    }
    if (listenerHits.length > 0 && listenerHits[0].distance < bestDist) {
      hitId = "listener";
      bestDist = listenerHits[0].distance;
    }
    if (sourceHits.length > 0 && sourceHits[0].distance < bestDist) {
      hitId = "source";
    }

    this.selectObject(hitId);
  };

  onKeyDown = (event: KeyboardEvent) => {
    if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
    const k = event.key.toLowerCase();
    if (k === "w") this.setTransformMode("translate");
    else if (k === "e") this.setTransformMode("rotate");
    else if (k === "r") this.setTransformMode("scale");
    else if (event.key === "Escape") this.selectObject(null);
    else if ((event.key === "Delete" || event.key === "Backspace") && this.selectedObjectId) {
      if (this.selectedObjectId !== "listener" && this.selectedObjectId !== "source") {
        this.removeSpeaker(this.selectedObjectId);
      }
    }
  };

  private updateMouseFromEvent(event: PointerEvent) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  }

  // --- Camera views ---
  setView(view: CameraView) {
    this.currentView = view;
    switch (view) {
      case "orbit":
        this.camera.position.set(6, 5, 7);
        this.orbitControls.target.set(0, 1, 0);
        break;
      case "top":
        this.camera.position.set(0, 15, 0.01);
        this.orbitControls.target.set(0, 0, 0);
        break;
      case "front":
        this.camera.position.set(0, 2, -8);
        this.orbitControls.target.set(0, 1.2, 0);
        break;
      case "listener": {
        const listener = this.project.listeners[0];
        if (listener) {
          const tp = this.belugaToThree(listener.position);
          const yawRad = (listener.orientation.yaw * Math.PI) / 180;
          const forward = new THREE.Vector3(Math.sin(yawRad), 0, -Math.cos(yawRad));
          this.camera.position.copy(tp);
          this.orbitControls.target.copy(tp).add(forward.multiplyScalar(2));
        }
        break;
      }
    }
    this.orbitControls.update();
  }

  setPlacementMode(mode: "none" | "speaker") {
    this.placementMode = mode;
  }

  // --- Gain visualization ---
  updateGainVisualization() {
    if (!this.onSceneUpdate) return;
    const listener = this.project.listeners[0];
    if (!listener || this.project.speakers.length === 0) {
      this.onSceneUpdate({ speakerGains: [], speakerAzimuths: [], speakerDistances: [] });
      return;
    }

    const positions = this.project.speakers.map((s) => s.position);
    const result = computeSpeakerGains(
      positions,
      listener.position,
      listener.orientation,
      this.project.virtualSource.azimuth
    );

    for (let i = 0; i < this.speakerMeshes.length; i++) {
      const mesh = this.speakerMeshes[i];
      const gain = result.gains[i] || 0;
      const r = 0x00 + (0x32 - 0x00) * gain;
      const g = 0x7a + (0xd4 - 0x7a) * gain;
      const b = 0xff;
      (mesh.material as THREE.MeshPhongMaterial).color.setRGB(r / 255, g / 255, b / 255);
      const scale = 0.18 + 0.12 * gain;
      mesh.scale.setScalar(scale);
    }

    this.onSceneUpdate({
      speakerGains: result.gains,
      speakerAzimuths: result.azimuths,
      speakerDistances: result.distances,
    });
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
    this.renderer.domElement.removeEventListener("pointerdown", this.onPointerDown);
    window.removeEventListener("keydown", this.onKeyDown);
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
    this.rebuildSelectionVisuals();
    this.updateGainVisualization();
  }
}
