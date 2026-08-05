// Three.js scene manager for Beluga's 3D room viewer (spec §9, §10, §12, §13, §15, §19, §45)
// Apple Design: light mode, clean materials, direct manipulation (drag to move, click to select)

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

  // Scene groups
  roomGroup: THREE.Group;
  speakerGroup: THREE.Group;
  listenerGroup: THREE.Group;

  // Objects
  speakerMeshes: THREE.Mesh[] = [];
  speakerLabels: THREE.Sprite[] = [];
  listenerMesh: THREE.Mesh | null = null;
  listenerArrow: THREE.ArrowHelper | null = null;
  sourceMesh: THREE.Mesh | null = null;
  roomWireframe: THREE.LineSegments | null = null;

  // State
  project: BelugaProject;
  selectedObjectId: string | null = null;
  currentView: CameraView = "orbit";
  isDragging = false;
  draggedObjectId: string | null = null;
  dragPlane: THREE.Plane;
  dragOffset = new THREE.Vector3();

  // Callbacks
  onSelectionChange: ((id: string | null) => void) | null = null;
  onSpeakerMove: ((id: string, position: BVector3) => void) | null = null;
  onListenerMove: ((position: BVector3) => void) | null = null;
  onSourceMove: ((azimuth: number, distance: number) => void) | null = null;
  onSceneUpdate: ((update: SceneUpdate) => void) | null = null;
  onPlacementRequest: ((position: BVector3) => void) | null = null;

  // Raycaster
  raycaster = new THREE.Raycaster();
  mouse = new THREE.Vector2();
  pointerDownPos = new THREE.Vector2();
  pointerDownTime = 0;

  placementMode: "none" | "speaker" = "none";

  private animationId: number | null = null;
  private resizeObserver: ResizeObserver | null = null;

  constructor(container: HTMLElement, project: BelugaProject) {
    this.container = container;
    this.project = project;
    this.dragPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

    // Renderer — light mode
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.setClearColor(0xf5f5f7, 1); // Apple light gray
    container.appendChild(this.renderer.domElement);

    // Scene
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0xf5f5f7);

    // Lighting — soft, Apple-style
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.7));
    const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
    dirLight.position.set(5, 10, 8);
    this.scene.add(dirLight);
    const fillLight = new THREE.DirectionalLight(0xccddff, 0.3);
    fillLight.position.set(-5, 5, -5);
    this.scene.add(fillLight);

    // Grid — subtle
    const grid = new THREE.GridHelper(20, 40, 0xd0d0d8, 0xe8e8ec);
    (grid.material as THREE.Material).transparent = true;
    (grid.material as THREE.Material).opacity = 0.4;
    grid.position.y = 0.001; // just above floor to avoid z-fighting
    this.scene.add(grid);

    // Solid floor — prevent seeing anything below
    const floorGeo = new THREE.PlaneGeometry(20, 20);
    const floorMat = new THREE.MeshLambertMaterial({ color: 0xececf0, side: THREE.FrontSide });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = 0;
    this.scene.add(floor);

    // Camera
    this.camera = new THREE.PerspectiveCamera(55, container.clientWidth / container.clientHeight, 0.1, 1000);
    this.camera.position.set(6, 5, 7);
    this.camera.lookAt(0, 1, 0);

    // Orbit controls
    this.orbitControls = new OrbitControls(this.camera, this.renderer.domElement);
    this.orbitControls.enableDamping = true;
    this.orbitControls.dampingFactor = 0.1;
    this.orbitControls.target.set(0, 1, 0);
    this.orbitControls.minDistance = 2;
    this.orbitControls.maxDistance = 30;
    // Prevent camera from going below the floor
    this.orbitControls.maxPolarAngle = Math.PI / 2 - 0.05; // ~89.7°, can't look from below
    this.orbitControls.minPolarAngle = 0.1; // can't look from directly above either

    // Transform gizmo (Blender/Unity-style RGB axis handles + rotation rings)
    this.transformControls = new TransformControls(this.camera, this.renderer.domElement);
    this.transformControls.setMode("translate");
    this.transformControls.setSize(0.9);
    this.transformControls.addEventListener("dragging-changed", (event: any) => {
      this.orbitControls.enabled = !event.value;
      this.isDragging = event.value;
      this.draggedObjectId = this.transformControls.object
        ? (this.transformControls.object.userData?.id ?? null)
        : null;
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

    // Events — use pointer events for drag
    this.renderer.domElement.addEventListener("pointerdown", this.onPointerDown);
    this.renderer.domElement.addEventListener("pointermove", this.onPointerMove);
    this.renderer.domElement.addEventListener("pointerup", this.onPointerUp);

    // Keyboard shortcuts (Blender-style): W=move, E=rotate, R=scale, Esc=deselect
    window.addEventListener("keydown", this.onKeyDown);

    // Resize
    this.resizeObserver = new ResizeObserver(() => this.onResize());
    this.resizeObserver.observe(container);

    this.animate();
  }

  // --- Coordinate conversion: Three.js (X right, Y up, Z toward viewer) → Beluga (X right, Y forward, Z up) ---
  // Beluga X → Three X, Beluga Y → Three -Z (forward is -Z in Three), Beluga Z → Three Y
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

    // Wireframe only — no reflective floor
    const geo = new THREE.BoxGeometry(width, length, height);
    const edges = new THREE.EdgesGeometry(geo);
    const lineMat = new THREE.LineBasicMaterial({ color: 0x88aacc, transparent: true, opacity: 0.6 });
    this.roomWireframe = new THREE.LineSegments(edges, lineMat);
    this.roomWireframe.position.set(0, height / 2, 0); // box bottom at y=0, top at y=height
    this.roomGroup.add(this.roomWireframe);

    // Grid floor (already in scene but could add room-specific)
    // No floor mesh — keep it clean
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
      const targetMax = Math.max(this.project.room.width, this.project.room.length, this.project.room.height);
      const scale = maxDim > 0 ? targetMax / maxDim : 1;

      model.scale.setScalar(scale);
      const box2 = new THREE.Box3().setFromObject(model);
      const center2 = box2.getCenter(new THREE.Vector3());
      model.position.sub(center2);
      const box3 = new THREE.Box3().setFromObject(model);
      model.position.y -= box3.min.y;

      // Apply a semi-transparent material for the mesh
      model.traverse((child) => {
        if ((child as THREE.Mesh).isMesh) {
          const mesh = child as THREE.Mesh;
          const mat = new THREE.MeshLambertMaterial({
            color: 0xcccccc,
            transparent: true,
            opacity: 0.4,
            side: THREE.DoubleSide,
            wireframe: false,
          });
          mesh.material = mat;
        }
      });

      this.roomGroup.add(model);

      // Add wireframe edges on top
      const boxGeo = new THREE.Box3().setFromObject(model);
      const edgeSize = boxGeo.getSize(new THREE.Vector3());
      const edgeGeo = new THREE.BoxGeometry(edgeSize.x, edgeSize.y, edgeSize.z);
      const edges = new THREE.EdgesGeometry(edgeGeo);
      const edgeMat = new THREE.LineBasicMaterial({ color: 0x88aacc, transparent: true, opacity: 0.3 });
      const edgeLines = new THREE.LineSegments(edges, edgeMat);
      this.roomGroup.add(edgeLines);
    });
  }

  // --- Speakers ---

  rebuildSpeakers() {
    while (this.speakerGroup.children.length > 0) {
      this.speakerGroup.remove(this.speakerGroup.children[0]);
    }
    this.speakerMeshes = [];
    this.speakerLabels = [];

    for (const speaker of this.project.speakers) {
      const mesh = this.createSpeakerMesh(speaker);
      this.speakerGroup.add(mesh);
      this.speakerMeshes.push(mesh);
    }
  }

  createSpeakerMesh(speaker: Speaker): THREE.Mesh {
    const geo = new THREE.SphereGeometry(0.18, 24, 18);
    const mat = new THREE.MeshPhongMaterial({
      color: 0x007aff, // Apple blue
      transparent: true,
      opacity: 0.9,
    });
    const mesh = new THREE.Mesh(geo, mat);
    const tp = this.belugaToThree(speaker.position);
    mesh.position.copy(tp);
    mesh.userData = { type: "speaker", id: speaker.id, name: speaker.name };
    mesh.castShadow = true;

    return mesh;
  }

  addSpeaker(speaker: Speaker) {
    // Only add to project.speakers and create mesh — React handles state separately
    const mesh = this.createSpeakerMesh(speaker);
    this.speakerGroup.add(mesh);
    this.speakerMeshes.push(mesh);
    this.updateGainVisualization();
  }

  updateSpeakerPosition(id: string, pos: BVector3) {
    const mesh = this.speakerMeshes.find((m) => m.userData.id === id);
    if (mesh) {
      mesh.position.copy(this.belugaToThree(pos));
    }
    this.updateGainVisualization();
  }

  removeSpeaker(id: string) {
    const idx = this.speakerMeshes.findIndex((m) => m.userData.id === id);
    if (idx >= 0) {
      this.speakerGroup.remove(this.speakerMeshes[idx]);
      this.speakerMeshes.splice(idx, 1);
    }
    // Also remove selection ring if present
    const ringIdx = this.speakerGroup.children.findIndex(
      (c) => c.userData?.type === "selection-ring" && c.userData?.speakerId === id
    );
    if (ringIdx >= 0) {
      this.speakerGroup.remove(this.speakerGroup.children[ringIdx]);
    }
    this.project.speakers = this.project.speakers.filter((s) => s.id !== id);
    if (this.selectedObjectId === id) {
      this.selectedObjectId = null;
      this.transformControls.detach();
    }
    this.rebuildSelectionVisuals();
    this.updateGainVisualization();
  }

  // --- Listener ---

  buildListener() {
    while (this.listenerGroup.children.length > 0) {
      this.listenerGroup.remove(this.listenerGroup.children[0]);
    }

    const listener = this.project.listeners[0];
    if (!listener) return;

    // Head
    const headGeo = new THREE.SphereGeometry(0.2, 24, 18);
    const headMat = new THREE.MeshPhongMaterial({
      color: 0xff9500, // Apple orange
      transparent: true,
      opacity: 0.9,
    });
    const head = new THREE.Mesh(headGeo, headMat);
    const tp = this.belugaToThree(listener.position);
    head.position.copy(tp);
    head.userData = { type: "listener" };

    // Direction arrow (listener forward)
    const yawRad = (listener.orientation.yaw * Math.PI) / 180;
    // In Three.js: forward (-Z) rotated by yaw
    const arrowDir = new THREE.Vector3(Math.sin(yawRad), 0, -Math.cos(yawRad)).normalize();
    this.listenerArrow = new THREE.ArrowHelper(arrowDir, tp, 0.9, 0xff9500, 0.18, 0.12);

    this.listenerMesh = head;
    this.listenerGroup.add(head);
    this.listenerGroup.add(this.listenerArrow);
  }

  // --- Listener update methods ---

  updateListenerPosition(pos: BVector3) {
    const listener = this.project.listeners[0];
    if (listener) {
      listener.position = pos;
    }
    this.buildListener();
    this.buildSource(); // source position depends on listener
    this.updateGainVisualization();
  }

  updateListenerOrientation(orient: Orientation) {
    const listener = this.project.listeners[0];
    if (listener) {
      listener.orientation = orient;
    }
    this.buildListener();
    this.buildSource();
    this.updateGainVisualization();
  }

  // --- Virtual source ---

  buildSource() {
    if (this.sourceMesh) {
      this.scene.remove(this.sourceMesh);
      this.sourceMesh = null;
    }

    const geo = new THREE.SphereGeometry(0.14, 20, 16);
    const mat = new THREE.MeshPhongMaterial({
      color: 0xaf52ce, // Apple purple
      emissive: 0x442266,
      transparent: true,
      opacity: 0.85,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.userData = { type: "source" };

    const listener = this.project.listeners[0];
    if (listener) {
      const src = this.project.virtualSource;
      const azRad = (src.azimuth * Math.PI) / 180;
      // In Beluga coords: x = listener.x + d*sin(az), y = listener.y + d*cos(az), z = listener.z
      const belugaPos = {
        x: listener.position.x + src.distance * Math.sin(azRad),
        y: listener.position.y + src.distance * Math.cos(azRad),
        z: listener.position.z,
      };
      mesh.position.copy(this.belugaToThree(belugaPos));
    }

    this.scene.add(mesh);
    this.sourceMesh = mesh;
  }

  updateSource(azimuth: number, distance: number) {
    this.project.virtualSource.azimuth = azimuth;
    this.project.virtualSource.distance = distance;
    this.buildSource();
    this.updateGainVisualization();
  }

  // --- Selection ---

  selectObject(id: string | null) {
    this.selectedObjectId = id;
    this.rebuildSelectionVisuals();

    // Attach/detach the 3D axis gizmo
    if (id === null) {
      this.transformControls.detach();
    } else {
      const target = this.findMeshById(id);
      if (target) {
        this.transformControls.attach(target);
      } else {
        this.transformControls.detach();
      }
    }

    if (this.onSelectionChange) this.onSelectionChange(id);
  }

  findMeshById(id: string): THREE.Object3D | null {
    if (id === "listener") return this.listenerMesh;
    if (id === "source") return this.sourceMesh;
    return this.speakerMeshes.find((m) => m.userData.id === id) ?? null;
  }

  setTransformMode(mode: "translate" | "rotate" | "scale") {
    this.transformControls.setMode(mode);
  }

  handleTransformChange() {
    if (!this.selectedObjectId) return;
    const obj = this.transformControls.object;
    if (!obj) return;

    const id = obj.userData?.id ?? this.selectedObjectId;
    const belugaPos = this.threeToBeluga(obj.position);

    if (id === "listener") {
      // Update existing meshes in place — do NOT rebuild (breaks gizmo attachment)
      const listener = this.project.listeners[0];
      if (listener) {
        listener.position = belugaPos;
      }
      if (this.listenerMesh) this.listenerMesh.position.copy(obj.position);
      if (this.listenerArrow) this.listenerArrow.position.copy(obj.position);
      if (this.onListenerMove) this.onListenerMove(belugaPos);
    } else if (id === "source") {
      // Convert position back to azimuth/distance relative to listener
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
      // Speaker (UUID id)
      if (this.onSpeakerMove) this.onSpeakerMove(id, belugaPos);
    }

    // Keep the flat selection ring under the moved object
    const ring = this.speakerGroup.children.find((c) => c.userData?.type === "selection-ring");
    if (ring) {
      ring.position.set(obj.position.x, 0.002, obj.position.z);
    }

    this.updateGainVisualization();
  }

  rebuildSelectionVisuals() {
    // Remove old selection rings from speaker group
    const oldRings = this.speakerGroup.children.filter((c) => c.userData?.type === "selection-ring");
    for (const r of oldRings) this.speakerGroup.remove(r);
    // Remove old selection rings from listener group
    const listenerRings = this.listenerGroup.children.filter((c) => c.userData?.type === "selection-ring");
    for (const r of listenerRings) this.listenerGroup.remove(r);
    // Remove old selection rings from scene (source ring)
    const sceneRings = this.scene.children.filter((c) => c.userData?.type === "selection-ring");
    for (const r of sceneRings) this.scene.remove(r);

    // Add selection ring for selected speaker (without rebuilding all meshes)
    if (this.selectedObjectId && this.selectedObjectId !== "listener" && this.selectedObjectId !== "source") {
      const mesh = this.speakerMeshes.find((m) => m.userData.id === this.selectedObjectId);
      if (mesh) {
        const ringGeo = new THREE.RingGeometry(0.24, 0.30, 32);
        const ringMat = new THREE.MeshBasicMaterial({ color: 0x007aff, side: THREE.DoubleSide, transparent: true, opacity: 0.4 });
        const ring = new THREE.Mesh(ringGeo, ringMat);
        ring.rotation.x = -Math.PI / 2;
        ring.position.copy(mesh.position);
        ring.position.y = 0.002; // flat on floor, not on the object
        ring.userData = { type: "selection-ring" };
        this.speakerGroup.add(ring);
      }
      // Update speaker material to show selection
      for (const m of this.speakerMeshes) {
        (m.material as THREE.MeshPhongMaterial).emissive.setHex(m.userData.id === this.selectedObjectId ? 0x002244 : 0x000000);
      }
    } else {
      // Clear emissive on all speakers
      for (const m of this.speakerMeshes) {
        (m.material as THREE.MeshPhongMaterial).emissive.setHex(0x000000);
      }
    }

    // Rebuild listener and source to update their selection rings (lightweight, only 2 objects)
    this.buildListener();
    this.buildSource();
  }

  // --- Dragging ---

  onPointerDown = (event: PointerEvent) => {
    // Ignore clicks on the gizmo itself — TransformControls handles those
    if ((event.target as HTMLElement)?.classList?.contains("transform-controls")) return;

    this.pointerDownPos.set(event.clientX, event.clientY);
    this.pointerDownTime = Date.now();

    if (this.placementMode === "speaker") {
      // Placement mode: click to place new speaker
      this.updateMouseFromEvent(event);
      this.raycaster.setFromCamera(this.mouse, this.camera);

      // Raycast against floor grid plane (y=0)
      const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
      const point = new THREE.Vector3();
      this.raycaster.ray.intersectPlane(groundPlane, point);
      if (point) {
        const belugaPos = this.threeToBeluga(point);
        // Clamp to room bounds
        const r = this.project.room;
        belugaPos.x = Math.max(-r.width / 2, Math.min(r.width / 2, belugaPos.x));
        belugaPos.y = Math.max(-r.length / 2, Math.min(r.length / 2, belugaPos.y));
        belugaPos.z = Math.max(0, Math.min(r.height, belugaPos.z));
        if (this.onPlacementRequest) this.onPlacementRequest(belugaPos);
      }
      this.placementMode = "none";
      return;
    }

    // Check for object selection / drag
    this.updateMouseFromEvent(event);
    this.raycaster.setFromCamera(this.mouse, this.camera);

    // Check speakers
    const speakerHits = this.raycaster.intersectObjects(this.speakerMeshes, false);
    // Check listener
    const listenerHits = this.listenerMesh ? this.raycaster.intersectObject(this.listenerMesh, false) : [];
    // Check source
    const sourceHits = this.sourceMesh ? this.raycaster.intersectObject(this.sourceMesh, false) : [];

    let hitObjectId: string | null = null;
    let hitMesh: THREE.Object3D | null = null;

    // Find closest hit
    const allHits: { dist: number; id: string; mesh: THREE.Object3D }[] = [];
    if (speakerHits.length > 0) {
      allHits.push({ dist: speakerHits[0].distance, id: speakerHits[0].object.userData.id, mesh: speakerHits[0].object });
    }
    if (listenerHits.length > 0) {
      allHits.push({ dist: listenerHits[0].distance, id: "listener", mesh: listenerHits[0].object });
    }
    if (sourceHits.length > 0) {
      allHits.push({ dist: sourceHits[0].distance, id: "source", mesh: sourceHits[0].object });
    }

    if (allHits.length > 0) {
      allHits.sort((a, b) => a.dist - b.dist);
      hitObjectId = allHits[0].id;
      hitMesh = allHits[0].mesh;
    }

    if (hitObjectId) {
      this.orbitControls.enabled = false;
      this.isDragging = true;
      this.draggedObjectId = hitObjectId;
      this.selectObject(hitObjectId);

      // Set up drag plane at the object's height
      const objHeight = (hitMesh as THREE.Object3D).position.y;
      this.dragPlane.set(new THREE.Vector3(0, 1, 0), -objHeight);

      // Calculate offset
      const intersect = new THREE.Vector3();
      this.raycaster.ray.intersectPlane(this.dragPlane, intersect);
      if (intersect) {
        this.dragOffset.subVectors((hitMesh as THREE.Object3D).position, intersect);
      }
    }
  };

  onPointerMove = (event: PointerEvent) => {
    if (!this.isDragging || !this.draggedObjectId) return;

    this.updateMouseFromEvent(event);
    this.raycaster.setFromCamera(this.mouse, this.camera);

    const intersect = new THREE.Vector3();
    this.raycaster.ray.intersectPlane(this.dragPlane, intersect);
    if (!intersect) return;

    // Apply offset
    intersect.add(this.dragOffset);

    // Clamp to room bounds
    const r = this.project.room;
    intersect.x = Math.max(-r.width / 2, Math.min(r.width / 2, intersect.x));
    intersect.z = Math.max(-r.length / 2, Math.min(r.length / 2, intersect.z));
    // Clamp height too
    let yMin = 0;
    let yMax = r.height;
    if (this.draggedObjectId === "source") {
      yMin = 0;
      yMax = r.height;
    }
    intersect.y = Math.max(yMin, Math.min(yMax, intersect.y));

    const belugaPos = this.threeToBeluga(intersect);

    if (this.draggedObjectId === "listener") {
      // Move listener mesh
      if (this.listenerMesh) this.listenerMesh.position.copy(intersect);
      if (this.listenerArrow) this.listenerArrow.position.copy(intersect);
      if (this.onListenerMove) this.onListenerMove(belugaPos);
    } else if (this.draggedObjectId === "source") {
      // Move source mesh
      if (this.sourceMesh) this.sourceMesh.position.copy(intersect);

      // Compute new azimuth/distance relative to listener
      const listener = this.project.listeners[0];
      if (listener) {
        // Beluga coords difference
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
      this.updateGainVisualization();
    } else if (this.draggedObjectId !== null && this.draggedObjectId !== "listener" && this.draggedObjectId !== "source") {
      // It's a speaker ID (UUID)
      const mesh = this.speakerMeshes.find((m) => m.userData.id === this.draggedObjectId);
      if (mesh) mesh.position.copy(intersect);
      if (this.onSpeakerMove) this.onSpeakerMove(this.draggedObjectId, belugaPos);
    }
  };

  onPointerUp = (event: PointerEvent) => {
    if (this.isDragging) {
      this.isDragging = false;
      this.draggedObjectId = null;
      this.orbitControls.enabled = true;
    } else if (this.placementMode === "none") {
      // Check if this was just a click (not a drag) on empty space → deselect
      const moved = Math.abs(event.clientX - this.pointerDownPos.x) + Math.abs(event.clientY - this.pointerDownPos.y);
      const elapsed = Date.now() - this.pointerDownTime;
      if (moved < 5 && elapsed < 300) {
        // Quick click without drag
        this.updateMouseFromEvent(event);
        this.raycaster.setFromCamera(this.mouse, this.camera);
        const allHits = [
          ...this.raycaster.intersectObjects(this.speakerMeshes, false),
          ...(this.listenerMesh ? this.raycaster.intersectObject(this.listenerMesh, false) : []),
          ...(this.sourceMesh ? this.raycaster.intersectObject(this.sourceMesh, false) : []),
        ];
        if (allHits.length === 0) {
          // Clicked empty space — deselect
          this.selectObject(null);
        }
      }
    }
  };

  onKeyDown = (event: KeyboardEvent) => {
    if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
    const k = event.key.toLowerCase();
    if (k === "w") { this.transformControls.setMode("translate"); }
    else if (k === "e") { this.transformControls.setMode("rotate"); }
    else if (k === "r") { this.transformControls.setMode("scale"); }
    else if (event.key === "Escape") { this.selectObject(null); }
    else if (event.key === "Delete" || event.key === "Backspace") {
      if (this.selectedObjectId && this.selectedObjectId !== "listener" && this.selectedObjectId !== "source") {
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
          // Forward in Three.js: sin(yaw) in X, -cos(yaw) in Z
          const forward = new THREE.Vector3(Math.sin(yawRad), 0, -Math.cos(yawRad));
          this.camera.position.copy(tp);
          this.orbitControls.target.copy(tp).add(forward.multiplyScalar(2));
        }
        break;
      }
    }
    this.orbitControls.update();
  }

  // --- Placement mode ---

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

    // Update speaker visual: color intensity + scale based on gain
    for (let i = 0; i < this.speakerMeshes.length; i++) {
      const mesh = this.speakerMeshes[i];
      const gain = result.gains[i] || 0;
      // Apple blue (0x007aff) to bright cyan (0x32d4ff) gradient
      const r = 0x00 + (0x32 - 0x00) * gain;
      const g = 0x7a + (0xd4 - 0x7a) * gain;
      const b = 0xff;
      (mesh.material as THREE.MeshPhongMaterial).color.setRGB(r / 255, g / 255, b / 255);
      // Scale: bigger when more gain
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
    this.renderer.domElement.removeEventListener("pointermove", this.onPointerMove);
    this.renderer.domElement.removeEventListener("pointerup", this.onPointerUp);
    window.removeEventListener("keydown", this.onKeyDown);
    this.orbitControls.dispose();
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
    this.updateGainVisualization();
  }
}