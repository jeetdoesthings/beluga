// Three.js scene manager for Beluga's 3D room viewer
// Clean, zero-crash implementation: safe TransformControls raycasting, robust Group halo, and GPU memory disposal.

import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { TransformControls } from "three/examples/jsm/controls/TransformControls.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import type {
  BelugaProject,
  Room,
  Speaker,
  Vector3 as BVector3,
  Orientation,
} from "../types/project";
import { computeSpeakerGains, toListenerRelative } from "../vbap";

export type CameraView = "orbit" | "top" | "front" | "listener";
export type TransformMode = "translate" | "rotate" | "scale";

export interface SceneUpdate {
  speakerGains: number[];
  speakerAzimuths: number[];
  speakerDistances: number[];
  speakerElevations: number[];
}

/** GPU Memory Disposal Helper (Prevents memory leaks and crashes) */
function disposeObject3D(obj: THREE.Object3D) {
  obj.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (mesh.geometry) {
      mesh.geometry.dispose();
    }
    if (mesh.material) {
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      mats.forEach((m) => {
        if (m && typeof m.dispose === "function") {
          m.dispose();
        }
      });
    }
  });
}

export class BelugaScene {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  orbitControls: OrbitControls;
  transformControls: TransformControls;
  gizmoHelper: THREE.Object3D;
  container: HTMLElement;

  roomGroup: THREE.Group;
  speakerGroup: THREE.Group;
  listenerGroup: THREE.Group;

  speakerMeshes: THREE.Group[] = [];
  listenerGroupObj: THREE.Group | null = null;
  sourceGroup: THREE.Group | null = null;
  sourcePulseRing: THREE.Mesh | null = null;
  selectionHaloGroup: THREE.Group | null = null;
  ghostSpeakerMesh: THREE.Group | null = null;

  project: BelugaProject;
  selectedObjectId: string | null = null;
  currentView: CameraView = "orbit";
  transformMode: TransformMode = "translate";

  cameraTween: {
    active: boolean;
    startPos: THREE.Vector3;
    targetPos: THREE.Vector3;
    startLookAt: THREE.Vector3;
    targetLookAt: THREE.Vector3;
    startTime: number;
    duration: number;
  } | null = null;

  // Callbacks
  onSelectionChange: ((id: string | null) => void) | null = null;
  onTransformModeChange: ((mode: TransformMode) => void) | null = null;
  onSpeakerMove: ((id: string, position: BVector3, orientation: Orientation) => void) | null = null;
  onListenerMove: ((position: BVector3, orientation: Orientation) => void) | null = null;
  onSourceMove: ((azimuth: number, elevation: number, distance: number) => void) | null = null;
  onRoomBoundsChange: ((room: Room) => void) | null = null;
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

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setClearColor(0xf5f5f7, 1);
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0xf5f5f7);

    // Lighting
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.75));
    const dirLight = new THREE.DirectionalLight(0xffffff, 0.85);
    dirLight.position.set(8, 12, 6);
    this.scene.add(dirLight);

    const fillLight = new THREE.DirectionalLight(0x007aff, 0.25);
    fillLight.position.set(-6, 6, -6);
    this.scene.add(fillLight);

    // Solid floor
    const floorGeo = new THREE.PlaneGeometry(30, 30);
    const floorMat = new THREE.MeshLambertMaterial({ color: 0xeeeeee, side: THREE.DoubleSide });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = 0;
    this.scene.add(floor);

    // Floor grid
    const grid = new THREE.GridHelper(30, 60, 0xb8c4d0, 0xdddddf);
    const gridMat = grid.material as THREE.Material;
    gridMat.transparent = true;
    gridMat.opacity = 0.45;
    grid.position.y = 0.001;
    this.scene.add(grid);

    // Selection Halo Group (Blender-style Object Origin & Pivot indicator flat on floor plane)
    const haloGroup = new THREE.Group();

    // Outer white ring
    const outerRingGeo = new THREE.RingGeometry(0.38, 0.42, 32);
    const outerRingMat = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide, transparent: true, opacity: 0.85 });
    haloGroup.add(new THREE.Mesh(outerRingGeo, outerRingMat));

    // Inner orange ring
    const innerRingGeo = new THREE.RingGeometry(0.26, 0.30, 32);
    const innerRingMat = new THREE.MeshBasicMaterial({ color: 0xff9500, side: THREE.DoubleSide, transparent: true, opacity: 0.9 });
    haloGroup.add(new THREE.Mesh(innerRingGeo, innerRingMat));

    // Center crosshair lines
    const crossMat = new THREE.LineBasicMaterial({ color: 0x1c1c1e, linewidth: 2 });
    const crossGeo1 = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-0.48, 0, 0), new THREE.Vector3(0.48, 0, 0)]);
    const crossGeo2 = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, -0.48), new THREE.Vector3(0, 0, 0.48)]);
    haloGroup.add(new THREE.LineSegments(crossGeo1, crossMat));
    haloGroup.add(new THREE.LineSegments(crossGeo2, crossMat));

    haloGroup.rotation.x = -Math.PI / 2;
    haloGroup.position.y = 0.005;
    haloGroup.visible = false;
    this.selectionHaloGroup = haloGroup;
    this.scene.add(haloGroup);

    // Ghost Speaker placement preview mesh
    this.ghostSpeakerMesh = this.createSpeakerMeshPreview();
    this.ghostSpeakerMesh.visible = false;
    this.scene.add(this.ghostSpeakerMesh);

    // Camera
    this.camera = new THREE.PerspectiveCamera(55, container.clientWidth / container.clientHeight, 0.1, 1000);
    this.camera.position.set(6, 5, 7);
    this.camera.lookAt(0, 1, 0);

    // Orbit controls
    this.orbitControls = new OrbitControls(this.camera, this.renderer.domElement);
    this.orbitControls.enableDamping = true;
    this.orbitControls.dampingFactor = 0.05;
    this.orbitControls.target.set(0, 1, 0);
    this.orbitControls.minDistance = 0.5;
    this.orbitControls.maxDistance = 25;
    this.orbitControls.maxPolarAngle = Math.PI / 2 - 0.01;
    this.orbitControls.minPolarAngle = 0.02;

    // Transform gizmo
    this.transformControls = new TransformControls(this.camera, this.renderer.domElement);
    this.transformControls.setMode("translate");
    this.transformControls.setSize(0.55);
    this.transformControls.addEventListener("dragging-changed", (e: any) => {
      this.orbitControls.enabled = !e.value && this.currentView !== "listener";
    });
    this.transformControls.addEventListener("objectChange", () => {
      this.handleTransformChange();
    });
    // In Three.js 0.160+, TransformControls no longer extends Object3D.
    // The visual gizmo arrows are returned by getHelper() and must be added to the scene separately.
    this.gizmoHelper = this.transformControls.getHelper();
    this.scene.add(this.gizmoHelper);

    // Groups
    this.roomGroup = new THREE.Group();
    this.scene.add(this.roomGroup);
    this.speakerGroup = new THREE.Group();
    this.scene.add(this.speakerGroup);
    this.listenerGroup = new THREE.Group();
    this.scene.add(this.listenerGroup);

    // Build initial scene components
    this.buildRoom();
    this.rebuildSpeakers();
    this.buildListener();
    this.buildSource();

    // Event listeners
    this.renderer.domElement.addEventListener("pointerdown", this.onPointerDown);
    this.renderer.domElement.addEventListener("pointermove", this.onPointerMove);
    window.addEventListener("pointerup", this.onPointerUp);
    window.addEventListener("keydown", this.onKeyDown);

    this.resizeObserver = new ResizeObserver(() => this.onResize());
    this.resizeObserver.observe(container);

    this.animate();
  }

  threeToBeluga(p: THREE.Vector3): BVector3 {
    return { x: p.x, y: -p.z, z: p.y };
  }
  belugaToThree(p: BVector3): THREE.Vector3 {
    return new THREE.Vector3(p.x, p.z, -p.y);
  }

  buildRoom() {
    while (this.roomGroup.children.length > 0) {
      const child = this.roomGroup.children[0];
      disposeObject3D(child);
      this.roomGroup.remove(child);
    }
    const { length, width, height } = this.project.room;

    const geo = new THREE.BoxGeometry(width, height, length);
    const edges = new THREE.EdgesGeometry(geo);
    const lineMat = new THREE.LineBasicMaterial({ color: 0x007aff, transparent: true, opacity: 0.5, linewidth: 2 });
    const wire = new THREE.LineSegments(edges, lineMat);
    wire.position.y = height / 2;
    this.roomGroup.add(wire);

    const wallMat = new THREE.MeshPhongMaterial({
      color: 0xe0edff,
      transparent: true,
      opacity: 0.08,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const wallMesh = new THREE.Mesh(geo, wallMat);
    wallMesh.position.y = height / 2;
    this.roomGroup.add(wallMesh);
  }

  loadGLB(data: ArrayBuffer) {
    while (this.roomGroup.children.length > 0) {
      const child = this.roomGroup.children[0];
      disposeObject3D(child);
      this.roomGroup.remove(child);
    }
    const loader = new GLTFLoader();
    loader.parse(data, "", (gltf) => {
      const model = gltf.scene;

      const box = new THREE.Box3().setFromObject(model);
      const size = box.getSize(new THREE.Vector3());

      const center = box.getCenter(new THREE.Vector3());
      model.position.sub(center);
      const box2 = new THREE.Box3().setFromObject(model);
      model.position.y -= box2.min.y;

      model.traverse((child) => {
        if ((child as THREE.Mesh).isMesh) {
          const mesh = child as THREE.Mesh;
          mesh.material = new THREE.MeshLambertMaterial({
            color: 0xd6e4f0,
            transparent: true,
            opacity: 0.4,
            side: THREE.DoubleSide,
          });
        }
      });
      this.roomGroup.add(model);

      const updatedRoom: Room = {
        ...this.project.room,
        width: Math.max(1, parseFloat(size.x.toFixed(2))),
        length: Math.max(1, parseFloat(size.z.toFixed(2))),
        height: Math.max(1, parseFloat(size.y.toFixed(2))),
      };
      this.project.room = updatedRoom;
      if (this.onRoomBoundsChange) this.onRoomBoundsChange(updatedRoom);
    });
  }

  rebuildSpeakers() {
    while (this.speakerGroup.children.length > 0) {
      const child = this.speakerGroup.children[0];
      disposeObject3D(child);
      this.speakerGroup.remove(child);
    }
    this.speakerMeshes = [];
    for (const speaker of this.project.speakers) {
      const meshGroup = this.createSpeakerMesh(speaker);
      this.speakerGroup.add(meshGroup);
      this.speakerMeshes.push(meshGroup);
    }
  }

  createSpeakerMeshPreview(): THREE.Group {
    const group = new THREE.Group();
    const cabGeo = new THREE.BoxGeometry(0.24, 0.36, 0.22);
    const cabMat = new THREE.MeshBasicMaterial({ color: 0x007aff, transparent: true, opacity: 0.4, wireframe: true });
    group.add(new THREE.Mesh(cabGeo, cabMat));
    return group;
  }

  createSpeakerMesh(speaker: Speaker): THREE.Group {
    const group = new THREE.Group();
    group.position.copy(this.belugaToThree(speaker.position));
    group.rotation.y = -(speaker.orientation.yaw * Math.PI) / 180;
    group.userData = { type: "speaker", id: speaker.id, name: speaker.name };

    const cat = speaker.category || "Generic";

    // Dark metallic cabinet material with sleek Apple dark finish
    const cabMat = new THREE.MeshStandardMaterial({
      color: 0x1c1c1e,
      roughness: 0.3,
      metalness: 0.6,
    });

    const coneMat = new THREE.MeshPhongMaterial({
      color: 0x007aff,
      emissive: 0x001133,
      shininess: 80,
    });

    if (cat === "Floorstanding") {
      // Tall Tower Speaker
      const cabGeo = new THREE.BoxGeometry(0.3, 0.85, 0.3);
      const cabMesh = new THREE.Mesh(cabGeo, cabMat);
      cabMesh.name = "cabinet";
      group.add(cabMesh);

      // Plinth base
      const baseGeo = new THREE.BoxGeometry(0.36, 0.04, 0.36);
      const baseMat = new THREE.MeshStandardMaterial({ color: 0x2c2c2e, roughness: 0.2 });
      const baseMesh = new THREE.Mesh(baseGeo, baseMat);
      baseMesh.position.y = -0.44;
      group.add(baseMesh);

      // Dual Woofers
      const w1 = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.07, 0.03, 24), coneMat.clone());
      w1.rotation.x = Math.PI / 2;
      w1.position.set(0, 0.15, -0.15);
      w1.name = "driverCone";
      group.add(w1);

      const w2 = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.07, 0.03, 24), coneMat.clone());
      w2.rotation.x = Math.PI / 2;
      w2.position.set(0, -0.12, -0.15);
      w2.name = "driverCone2";
      group.add(w2);

      // Dome Tweeter
      const tweet = new THREE.Mesh(new THREE.SphereGeometry(0.035, 16, 16), new THREE.MeshPhongMaterial({ color: 0xe5e5ea, shininess: 100 }));
      tweet.position.set(0, 0.32, -0.15);
      group.add(tweet);

    } else if (cat === "Ceiling") {
      // In-Ceiling Circular Speaker
      const discGeo = new THREE.CylinderGeometry(0.26, 0.26, 0.08, 32);
      const discMat = new THREE.MeshStandardMaterial({ color: 0xf2f2f7, roughness: 0.5 });
      const discMesh = new THREE.Mesh(discGeo, discMat);
      discMesh.name = "cabinet";
      group.add(discMesh);

      // Bezel Ring
      const ringGeo = new THREE.TorusGeometry(0.25, 0.015, 16, 32);
      const ringMat = new THREE.MeshBasicMaterial({ color: 0xd1d1d6 });
      const ringMesh = new THREE.Mesh(ringGeo, ringMat);
      ringMesh.rotation.x = Math.PI / 2;
      group.add(ringMesh);

      // Recessed Driver Cone
      const coneMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.08, 0.04, 24), coneMat);
      coneMesh.position.set(0, -0.02, 0);
      coneMesh.name = "driverCone";
      group.add(coneMesh);

    } else if (cat === "Subwoofer") {
      // Heavy Cubic Subwoofer
      const subGeo = new THREE.BoxGeometry(0.48, 0.48, 0.48);
      const subMesh = new THREE.Mesh(subGeo, cabMat);
      subMesh.name = "cabinet";
      group.add(subMesh);

      // Massive 12" Sub Driver Cone
      const subCone = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.14, 0.05, 32), coneMat);
      subCone.rotation.x = Math.PI / 2;
      subCone.position.set(0, 0.02, -0.24);
      subCone.name = "driverCone";
      group.add(subCone);

      // Bass Reflex Port Tube
      const portGeo = new THREE.CylinderGeometry(0.04, 0.04, 0.08, 16);
      const portMat = new THREE.MeshBasicMaterial({ color: 0x000000 });
      const portMesh = new THREE.Mesh(portGeo, portMat);
      portMesh.rotation.x = Math.PI / 2;
      portMesh.position.set(0.12, -0.14, -0.24);
      group.add(portMesh);

    } else if (cat === "Laptop") {
      // Ultra-thin Laptop Bar
      const lapGeo = new THREE.BoxGeometry(0.38, 0.04, 0.26);
      const lapMat = new THREE.MeshStandardMaterial({ color: 0x8e8e93, roughness: 0.1, metalness: 0.9 });
      const lapMesh = new THREE.Mesh(lapGeo, lapMat);
      lapMesh.name = "cabinet";
      group.add(lapMesh);

      // Micro Speaker Grilles
      const grillGeo = new THREE.BoxGeometry(0.08, 0.01, 0.18);
      const grillMat = new THREE.MeshBasicMaterial({ color: 0x3a3a3c });
      const leftGrill = new THREE.Mesh(grillGeo, grillMat);
      leftGrill.position.set(-0.13, 0.02, 0);
      group.add(leftGrill);

      const rightGrill = leftGrill.clone();
      rightGrill.position.set(0.13, 0.02, 0);
      group.add(rightGrill);

      const coneMesh = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.01, 0.06), coneMat);
      coneMesh.position.set(0, 0.02, 0);
      coneMesh.name = "driverCone";
      group.add(coneMesh);

    } else if (cat === "Monitor") {
      // Studio Monitor — compact angled cabinet
      const cabGeo = new THREE.BoxGeometry(0.2, 0.32, 0.24);
      const cabMesh = new THREE.Mesh(cabGeo, cabMat);
      cabMesh.name = "cabinet";
      group.add(cabMesh);

      // Woofer
      const wooferGeo = new THREE.CylinderGeometry(0.07, 0.06, 0.03, 24);
      const wooferMesh = new THREE.Mesh(wooferGeo, coneMat);
      wooferMesh.rotation.x = Math.PI / 2;
      wooferMesh.position.set(0, -0.05, -0.12);
      wooferMesh.name = "driverCone";
      group.add(wooferMesh);

      // Tweeter
      const tweetGeo = new THREE.SphereGeometry(0.025, 16, 16);
      const tweetMat = new THREE.MeshPhongMaterial({ color: 0xe5e5ea, shininess: 100 });
      const tweetMesh = new THREE.Mesh(tweetGeo, tweetMat);
      tweetMesh.position.set(0, 0.1, -0.12);
      group.add(tweetMesh);

      // Front bass reflex port
      const portGeo = new THREE.CylinderGeometry(0.02, 0.02, 0.04, 16);
      const portMat = new THREE.MeshBasicMaterial({ color: 0x000000 });
      const portMesh = new THREE.Mesh(portGeo, portMat);
      portMesh.rotation.x = Math.PI / 2;
      portMesh.position.set(0, -0.13, -0.12);
      group.add(portMesh);

    } else {
      // Bookshelf / Generic / Active / Passive Studio Monitor
      const cabGeo = new THREE.BoxGeometry(0.24, 0.38, 0.22);
      const cabMesh = new THREE.Mesh(cabGeo, cabMat);
      cabMesh.name = "cabinet";
      group.add(cabMesh);

      const coneGeo = new THREE.CylinderGeometry(0.08, 0.06, 0.03, 24);
      const coneMesh = new THREE.Mesh(coneGeo, coneMat);
      coneMesh.rotation.x = Math.PI / 2;
      coneMesh.position.set(0, -0.04, -0.11);
      coneMesh.name = "driverCone";
      group.add(coneMesh);

      const tweetGeo = new THREE.SphereGeometry(0.03, 16, 16);
      const tweetMat = new THREE.MeshPhongMaterial({ color: 0xe5e5ea, shininess: 100 });
      const tweetMesh = new THREE.Mesh(tweetGeo, tweetMat);
      tweetMesh.position.set(0, 0.11, -0.11);
      group.add(tweetMesh);
    }

    // Facing Direction Arrow Helper
    const arrow = new THREE.ArrowHelper(
      new THREE.Vector3(0, 0, -1),
      new THREE.Vector3(0, 0, 0),
      0.5,
      0x007aff,
      0.1,
      0.08
    );
    group.add(arrow);

    return group;
  }

  addSpeaker(speaker: Speaker) {
    const group = this.createSpeakerMesh(speaker);
    this.speakerGroup.add(group);
    this.speakerMeshes.push(group);
    this.updateGainVisualization();
  }

  updateSpeakerPosition(id: string, pos: BVector3) {
    const speaker = this.project.speakers.find((s) => s.id === id);
    if (speaker) speaker.position = pos;
    const mesh = this.speakerMeshes.find((m) => m.userData.id === id);
    if (mesh) mesh.position.copy(this.belugaToThree(pos));
    this.updateSelectionHalo();
    this.reattachGizmo();
    this.updateGainVisualization();
  }

  updateSpeakerOrientation(id: string, orient: Orientation) {
    const speaker = this.project.speakers.find((s) => s.id === id);
    if (speaker) speaker.orientation = orient;
    const mesh = this.speakerMeshes.find((m) => m.userData.id === id);
    if (mesh) mesh.rotation.y = -(orient.yaw * Math.PI) / 180;
    this.updateGainVisualization();
  }

  removeSpeaker(id: string) {
    const idx = this.speakerMeshes.findIndex((m) => m.userData.id === id);
    if (idx >= 0) {
      disposeObject3D(this.speakerMeshes[idx]);
      this.speakerGroup.remove(this.speakerMeshes[idx]);
      this.speakerMeshes.splice(idx, 1);
    }
    this.project.speakers = this.project.speakers.filter((s) => s.id !== id);
    if (this.selectedObjectId === id) {
      this.selectObject(null);
    }
    this.updateGainVisualization();
  }

  buildListener() {
    while (this.listenerGroup.children.length > 0) {
      const child = this.listenerGroup.children[0];
      disposeObject3D(child);
      this.listenerGroup.remove(child);
    }
    const listener = this.project.listeners[0];
    if (!listener) return;

    const group = new THREE.Group();
    group.position.copy(this.belugaToThree(listener.position));
    group.rotation.y = -(listener.orientation.yaw * Math.PI) / 180;

    const headGeo = new THREE.SphereGeometry(0.2, 24, 20);
    const headMat = new THREE.MeshPhongMaterial({
      color: 0xff9500,
      emissive: 0x442200,
      shininess: 40,
    });
    const head = new THREE.Mesh(headGeo, headMat);
    group.add(head);

    const visorGeo = new THREE.BoxGeometry(0.22, 0.06, 0.12);
    const visorMat = new THREE.MeshStandardMaterial({ color: 0x1c1c1e, roughness: 0.1, metalness: 0.9 });
    const visor = new THREE.Mesh(visorGeo, visorMat);
    visor.position.set(0, 0.04, -0.12);
    group.add(visor);

    const earGeo = new THREE.CylinderGeometry(0.05, 0.05, 0.04, 16);
    const earMat = new THREE.MeshPhongMaterial({ color: 0x3a3a3c });
    const leftEar = new THREE.Mesh(earGeo, earMat);
    leftEar.rotation.z = Math.PI / 2;
    leftEar.position.set(-0.21, 0, 0);
    group.add(leftEar);

    const rightEar = leftEar.clone();
    rightEar.position.set(0.21, 0, 0);
    group.add(rightEar);

    const arrow = new THREE.ArrowHelper(
      new THREE.Vector3(0, 0, -1),
      new THREE.Vector3(0, 0, 0),
      0.9,
      0xff9500,
      0.18,
      0.12
    );
    group.add(arrow);

    group.userData = { type: "listener", id: "listener" };
    this.listenerGroup.add(group);
    this.listenerGroupObj = group;
  }

  updateListenerPosition(pos: BVector3) {
    const listener = this.project.listeners[0];
    if (listener) {
      listener.position = pos;
      listener.earHeight = pos.z;
    }
    if (this.listenerGroupObj) this.listenerGroupObj.position.copy(this.belugaToThree(pos));
    this.buildSource();
    this.updateSelectionHalo();
    this.reattachGizmo();
    this.updateGainVisualization();
  }

  updateListenerOrientation(orient: Orientation) {
    const listener = this.project.listeners[0];
    if (listener) listener.orientation = orient;
    if (this.listenerGroupObj) {
      this.listenerGroupObj.rotation.y = -(orient.yaw * Math.PI) / 180;
    }
    this.buildSource();
    this.reattachGizmo();
    this.updateGainVisualization();
  }

  buildSource() {
    if (this.sourceGroup) {
      disposeObject3D(this.sourceGroup);
      this.scene.remove(this.sourceGroup);
      this.sourceGroup = null;
    }

    const group = new THREE.Group();
    group.userData = { type: "source", id: "source" };

    const geo = new THREE.SphereGeometry(0.15, 24, 20);
    const mat = new THREE.MeshPhongMaterial({
      color: 0xaf52ce,
      emissive: 0x8800cc,
      shininess: 100,
      side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(geo, mat);
    group.add(mesh);

    const ringGeo = new THREE.RingGeometry(0.2, 0.28, 32);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0xd870ff,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.8,
      depthWrite: false,
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = Math.PI / 2;
    group.add(ring);
    this.sourcePulseRing = ring;

    const listener = this.project.listeners[0];
    if (listener) {
      const src = this.project.virtualSource;
      const azRad = (src.azimuth * Math.PI) / 180;
      const elRad = ((src.elevation || 0) * Math.PI) / 180;
      const yawRad = (listener.orientation.yaw * Math.PI) / 180;

      const relX = src.distance * Math.cos(elRad) * Math.sin(azRad);
      const relY = src.distance * Math.cos(elRad) * Math.cos(azRad);
      const relZ = src.distance * Math.sin(elRad);

      const worldDx = relX * Math.cos(yawRad) + relY * Math.sin(yawRad);
      const worldDy = -relX * Math.sin(yawRad) + relY * Math.cos(yawRad);

      const pos: BVector3 = {
        x: listener.position.x + worldDx,
        y: listener.position.y + worldDy,
        z: listener.position.z + relZ,
      };

      group.position.copy(this.belugaToThree(pos));
    }

    this.scene.add(group);
    this.sourceGroup = group;
  }

  updateSource(azimuth: number, elevation: number, distance: number) {
    this.project.virtualSource.azimuth = azimuth;
    this.project.virtualSource.elevation = elevation;
    this.project.virtualSource.distance = distance;
    this.buildSource();
    this.reattachGizmo();
    this.updateSelectionHalo();
    this.updateGainVisualization();
  }

  selectObject(id: string | null) {
    this.selectedObjectId = id;
    this.rebuildSelectionVisuals();
    this.updateSelectionHalo();
    if (this.onSelectionChange) this.onSelectionChange(id);
  }

  findMeshById(id: string): THREE.Object3D | null {
    if (id === "listener") return this.listenerGroupObj;
    if (id === "source") return this.sourceGroup;
    return this.speakerMeshes.find((m) => m.userData.id === id) ?? null;
  }

  setTransformMode(mode: TransformMode) {
    this.transformMode = mode;
    this.transformControls.setMode(mode);

    if (mode === "rotate") {
      this.transformControls.showX = false;
      this.transformControls.showZ = false;
      this.transformControls.showY = true;
    } else {
      this.transformControls.showX = true;
      this.transformControls.showY = true;
      this.transformControls.showZ = true;
    }

    if (this.onTransformModeChange) this.onTransformModeChange(mode);
  }

  animateCameraTo(targetPos: THREE.Vector3, targetLookAt: THREE.Vector3, durationMs = 450) {
    this.cameraTween = {
      active: true,
      startPos: this.camera.position.clone(),
      targetPos: targetPos.clone(),
      startLookAt: this.orbitControls.target.clone(),
      targetLookAt: targetLookAt.clone(),
      startTime: performance.now(),
      duration: durationMs,
    };
  }

  focusSelectedObject() {
    if (!this.selectedObjectId) return;
    const target = this.findMeshById(this.selectedObjectId);
    if (!target) return;

    const pos = target.position.clone();
    const targetPos = new THREE.Vector3(pos.x + 2.5, pos.y + 2.2, pos.z + 2.5);
    this.animateCameraTo(targetPos, pos, 400);
  }

  rebuildSelectionVisuals() {
    for (const m of this.speakerMeshes) {
      const sel = m.userData.id === this.selectedObjectId;
      const cab = m.getObjectByName("cabinet") as THREE.Mesh | undefined;
      if (cab && cab.material) {
        (cab.material as THREE.MeshStandardMaterial).emissive.setHex(sel ? 0x003366 : 0x000000);
      }
    }
    this.reattachGizmo();
  }

  private updateSelectionHalo() {
    if (!this.selectionHaloGroup) return;
    if (!this.selectedObjectId) {
      this.selectionHaloGroup.visible = false;
      return;
    }
    const target = this.findMeshById(this.selectedObjectId);
    if (target) {
      this.selectionHaloGroup.position.set(target.position.x, 0.005, target.position.z);
      this.selectionHaloGroup.visible = true;
    } else {
      this.selectionHaloGroup.visible = false;
    }
  }

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

    // Clamp object position to room bounds (not for virtual source — it can go outside)
    const rHeight = this.project.room.height || 2.8;
    const rWidth = this.project.room.width || 5.0;
    const rLength = this.project.room.length || 6.0;

    if (id !== "source") {
      obj.position.x = Math.max(-rWidth / 2, Math.min(rWidth / 2, obj.position.x));
      obj.position.z = Math.max(-rLength / 2, Math.min(rLength / 2, obj.position.z));
    }
    obj.position.y = Math.max(0, Math.min(rHeight, obj.position.y));

    const belugaPos = this.threeToBeluga(obj.position);

    if (id === "listener") {
      const listener = this.project.listeners[0];
      if (listener) {
        let yaw = (-obj.rotation.y * 180) / Math.PI;
        while (yaw > 180) yaw -= 360;
        while (yaw <= -180) yaw += 360;
        const orient = { ...listener.orientation, yaw };

        listener.position = belugaPos;
        listener.earHeight = belugaPos.z;
        listener.orientation = orient;

        // Rebuild source so it maintains listener-relative position in world space
        this.buildSource();
        this.reattachGizmo();

        if (this.onListenerMove) this.onListenerMove(belugaPos, orient);
      }
    } else if (id === "source") {
      const listener = this.project.listeners[0];
      if (listener) {
        const rel = toListenerRelative(belugaPos, listener.position, listener.orientation);
        this.project.virtualSource.azimuth = rel.azimuth;
        this.project.virtualSource.elevation = rel.elevation;
        this.project.virtualSource.distance = rel.distance;

        if (this.onSourceMove) {
          this.onSourceMove(rel.azimuth, rel.elevation, rel.distance);
        }
      }
    } else {
      const speaker = this.project.speakers.find((s) => s.id === id);
      if (speaker) {
        let yaw = (-obj.rotation.y * 180) / Math.PI;
        while (yaw > 180) yaw -= 360;
        while (yaw <= -180) yaw += 360;
        const orient = { ...speaker.orientation, yaw };

        speaker.position = belugaPos;
        speaker.orientation = orient;

        if (this.onSpeakerMove) this.onSpeakerMove(id, belugaPos, orient);
      }
    }

    this.updateSelectionHalo();
    this.updateGainVisualization();
  }

  isDraggingObject = false;
  draggedMesh: THREE.Object3D | null = null;
  dragPlane = new THREE.Plane();
  dragOffset = new THREE.Vector3();
  pointerDownScreenPos = { x: 0, y: 0 };
  isPointerDownOnEmpty = false;

  onPointerMove = (event: PointerEvent) => {
    if (this.transformControls.dragging) return;

    this.updateMouseFromEvent(event);
    this.raycaster.setFromCamera(this.mouse, this.camera);

    if (this.isDraggingObject && this.draggedMesh) {
      const intersection = new THREE.Vector3();
      if (this.raycaster.ray.intersectPlane(this.dragPlane, intersection)) {
        const newPos = intersection.add(this.dragOffset);

        const rHeight = this.project.room.height || 2.8;
        const rWidth = this.project.room.width || 5.0;
        const rLength = this.project.room.length || 6.0;

        newPos.y = Math.max(0, Math.min(rHeight, newPos.y));
        newPos.x = Math.max(-rWidth / 2, Math.min(rWidth / 2, newPos.x));
        newPos.z = Math.max(-rLength / 2, Math.min(rLength / 2, newPos.z));

        this.draggedMesh.position.copy(newPos);
        this.handleTransformChange();
      }
      return;
    }

    if (this.placementMode === "speaker" && this.ghostSpeakerMesh) {
      const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
      const point = new THREE.Vector3();
      this.raycaster.ray.intersectPlane(groundPlane, point);
      if (point) {
        this.ghostSpeakerMesh.position.copy(point);
        this.ghostSpeakerMesh.visible = true;
      }
      return;
    }

    const checkObjects: THREE.Object3D[] = [
      ...this.speakerMeshes,
      ...(this.listenerGroupObj ? [this.listenerGroupObj] : []),
      ...(this.sourceGroup ? [this.sourceGroup] : []),
    ];
    const hits = this.raycaster.intersectObjects(checkObjects, true);
    this.container.style.cursor = hits.length > 0 ? "pointer" : "default";
  };

  onPointerDown = (event: PointerEvent) => {
    if (event.target !== this.renderer.domElement) return;
    if (this.transformControls.dragging) return;

    this.pointerDownScreenPos = { x: event.clientX, y: event.clientY };
    this.isPointerDownOnEmpty = false;

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
      if (this.ghostSpeakerMesh) this.ghostSpeakerMesh.visible = false;
      return;
    }

    this.updateMouseFromEvent(event);
    this.raycaster.setFromCamera(this.mouse, this.camera);

    // 1. Check if user clicked on a 3D Gizmo Arrow handle while an object is selected
    if (this.selectedObjectId && this.gizmoHelper) {
      try {
        const gizmoHits = this.raycaster.intersectObject(this.gizmoHelper, true);
        if (gizmoHits.length > 0) {
          return;
        }
      } catch (_) { /* fallback */ }
    }

    // 2. Check if user clicked directly on an interactive scene object (speaker, listener, source)
    const checkObjects: THREE.Object3D[] = [
      ...this.speakerMeshes,
      ...(this.listenerGroupObj ? [this.listenerGroupObj] : []),
      ...(this.sourceGroup ? [this.sourceGroup] : []),
    ];
    const hits = this.raycaster.intersectObjects(checkObjects, true);

    let hitId: string | null = null;
    if (hits.length > 0) {
      let parent: THREE.Object3D | null = hits[0].object;
      while (parent && !parent.userData?.id) parent = parent.parent;
      if (parent?.userData?.id) {
        hitId = parent.userData.id;
      }
    }

    if (hitId) {
      this.selectObject(hitId);
      const targetObj = this.findMeshById(hitId);
      if (targetObj) {
        this.isDraggingObject = true;
        this.draggedMesh = targetObj;

        const camDir = new THREE.Vector3();
        this.camera.getWorldDirection(camDir);

        const planeNormal = Math.abs(camDir.y) > 0.75
          ? new THREE.Vector3(0, 1, 0)
          : new THREE.Vector3(-camDir.x, 0, -camDir.z).normalize();

        this.dragPlane.setFromNormalAndCoplanarPoint(planeNormal, targetObj.position);
        const intersection = new THREE.Vector3();
        if (this.raycaster.ray.intersectPlane(this.dragPlane, intersection)) {
          this.dragOffset.subVectors(targetObj.position, intersection);
        } else {
          this.dragOffset.set(0, 0, 0);
        }
        this.orbitControls.enabled = false;
      }
    } else {
      this.isPointerDownOnEmpty = true;
    }
  };

  onPointerUp = (event: PointerEvent) => {
    if (this.isDraggingObject) {
      this.isDraggingObject = false;
      this.draggedMesh = null;
      // Only re-enable orbit if not in listener view (which disables orbit)
      this.orbitControls.enabled = this.currentView !== "listener";
    }

    if (this.isPointerDownOnEmpty) {
      const dist = Math.hypot(event.clientX - this.pointerDownScreenPos.x, event.clientY - this.pointerDownScreenPos.y);
      if (dist < 6) {
        this.selectObject(null);
      }
      this.isPointerDownOnEmpty = false;
    }
  };

  onKeyDown = (event: KeyboardEvent) => {
    const isInput = event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement;
    if (event.key === "Escape") {
      if (isInput) (document.activeElement as HTMLElement)?.blur();
      this.selectObject(null);
      if (this.placementMode === "speaker") {
        this.placementMode = "none";
        if (this.ghostSpeakerMesh) this.ghostSpeakerMesh.visible = false;
      }
      return;
    }

    if (isInput) return;

    const k = event.key.toLowerCase();
    if (k === "w" || k === "g") this.setTransformMode("translate");
    else if (k === "e") this.setTransformMode("rotate");
    else if (k === "r") this.setTransformMode("scale");
    else if (k === "f") this.focusSelectedObject();
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

  setView(view: CameraView) {
    this.currentView = view;
    let targetPos = new THREE.Vector3();
    let targetLookAt = new THREE.Vector3();

    switch (view) {
      case "orbit":
        targetPos.set(6, 5, 7);
        targetLookAt.set(0, 1, 0);
        this.orbitControls.enabled = true;
        break;
      case "top":
        targetPos.set(0, 15, 0.01);
        targetLookAt.set(0, 0, 0);
        this.orbitControls.enabled = true;
        break;
      case "front":
        targetPos.set(0, 2, -8);
        targetLookAt.set(0, 1.2, 0);
        this.orbitControls.enabled = true;
        break;
      case "listener": {
        const listener = this.project.listeners[0];
        if (listener) {
          const earH = listener.earHeight || listener.position.z || 1.1;
          const eyePos = { ...listener.position, z: earH };
          const tp = this.belugaToThree(eyePos);
          const yawRad = (listener.orientation.yaw * Math.PI) / 180;
          const forward = new THREE.Vector3(Math.sin(yawRad), 0, -Math.cos(yawRad));
          targetPos.copy(tp);
          targetLookAt.copy(tp).add(forward.multiplyScalar(2));
          this.orbitControls.enabled = false;
        }
        break;
      }
    }
    this.animateCameraTo(targetPos, targetLookAt, 500);
  }

  setPlacementMode(mode: "none" | "speaker") {
    this.placementMode = mode;
    if (mode === "none" && this.ghostSpeakerMesh) {
      this.ghostSpeakerMesh.visible = false;
    }
  }

  updateGainVisualization() {
    if (!this.onSceneUpdate) return;
    const listener = this.project.listeners[0];
    if (!listener || this.project.speakers.length === 0) {
      this.onSceneUpdate({ speakerGains: [], speakerAzimuths: [], speakerDistances: [], speakerElevations: [] });
      return;
    }

    const positions = this.project.speakers.map((s) => s.position);
    const result = computeSpeakerGains(
      positions,
      listener.position,
      listener.orientation,
      this.project.virtualSource.azimuth,
      this.project.virtualSource.elevation || 0
    );

    for (let i = 0; i < this.speakerMeshes.length; i++) {
      const group = this.speakerMeshes[i];
      const gain = result.gains[i] || 0;

      // Update all driver cones found on this speaker mesh
      const coneNames = ["driverCone", "driverCone2"];
      for (const coneName of coneNames) {
        const cone = group.getObjectByName(coneName) as THREE.Mesh | undefined;
        if (cone && cone.material) {
          const mat = cone.material as THREE.MeshPhongMaterial;
          if (gain > 0.001) {
            const normGain = Math.pow(gain, 0.8);
            mat.color.setHex(0x00e5ff);
            mat.emissive.setRGB(0, 0.3 * normGain, 0.7 * normGain);
          } else {
            mat.color.setHex(0x007aff);
            mat.emissive.setHex(0x001133);
          }
        }
      }
    }

    this.onSceneUpdate({
      speakerGains: result.gains,
      speakerAzimuths: result.azimuths,
      speakerDistances: result.distances,
      speakerElevations: result.elevations,
    });
  }

  private animate = () => {
    this.animationId = requestAnimationFrame(this.animate);
    const now = performance.now();

    if (this.cameraTween && this.cameraTween.active) {
      const elapsed = now - this.cameraTween.startTime;
      const progress = Math.min(1, elapsed / this.cameraTween.duration);
      const ease = 1 - Math.pow(1 - progress, 3);

      this.camera.position.lerpVectors(this.cameraTween.startPos, this.cameraTween.targetPos, ease);
      this.orbitControls.target.lerpVectors(this.cameraTween.startLookAt, this.cameraTween.targetLookAt, ease);
      this.orbitControls.update();

      if (progress >= 1) {
        this.cameraTween.active = false;
      }
    } else if (this.currentView === "listener") {
      const listener = this.project.listeners[0];
      if (listener) {
        const earH = listener.earHeight || listener.position.z || 1.1;
        const eyePos = { ...listener.position, z: earH };
        const tp = this.belugaToThree(eyePos);
        this.camera.position.lerp(tp, 0.1);

        // Continuously update lookAt direction to match listener facing
        const yawRad = (listener.orientation.yaw * Math.PI) / 180;
        const forward = new THREE.Vector3(Math.sin(yawRad), 0, -Math.cos(yawRad));
        const lookTarget = tp.clone().add(forward.multiplyScalar(2));
        this.camera.lookAt(lookTarget);
      }
    } else {
      this.orbitControls.update();
    }

    const time = now * 0.003;
    if (this.sourcePulseRing) {
      const scale = 1 + 0.25 * Math.sin(time);
      this.sourcePulseRing.scale.setScalar(scale);
      (this.sourcePulseRing.material as THREE.MeshBasicMaterial).opacity = 0.4 + 0.2 * Math.cos(time);
    }

    if (this.selectionHaloGroup && this.selectionHaloGroup.visible) {
      // Static halo — no rotation
    }

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
    window.removeEventListener("pointerup", this.onPointerUp);
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
    this.updateSelectionHalo();
    this.updateGainVisualization();
  }
}
