"""
beluga.speaker — data models for speakers, listeners, and Beluga projects.

Spec references: §11 (Speaker), §15 (Listener), §60 (BelugaProject), §61 (config storage).
"""

from __future__ import annotations

import json
import uuid
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from .geometry import Orientation, Vector3

# Default speaker categories (spec §14)
SPEAKER_CATEGORIES = (
    "Generic",
    "Active",
    "Passive",
    "Bookshelf",
    "Floorstanding",
    "Ceiling",
    "Subwoofer",
    "Laptop",
    "Custom",
)


def _new_id() -> str:
    return str(uuid.uuid4())


@dataclass
class Room:
    """Rectangular room model (spec §6, §60).

    For 0.1 we support manual rectangular rooms only;
    imported mesh support arrives in 0.2.
    """

    name: str = ""
    length: float = 5.0  # meters, along Y
    width: float = 4.0   # meters, along X
    height: float = 2.8  # meters, along Z

    def to_dict(self) -> dict:
        return {
            "name": self.name,
            "length": self.length,
            "width": self.width,
            "height": self.height,
        }

    @staticmethod
    def from_dict(d: dict) -> "Room":
        return Room(
            name=d.get("name", ""),
            length=d.get("length", 5.0),
            width=d.get("width", 4.0),
            height=d.get("height", 2.8),
        )


@dataclass
class Speaker:
    """A single independently controllable loudspeaker (spec §11)."""

    id: str = field(default_factory=_new_id)
    name: str = "Speaker"
    category: str = "Generic"
    position: Vector3 = field(default_factory=lambda: Vector3(0.0, 0.0, 0.0))
    orientation: Orientation = field(default_factory=Orientation)
    enabled: bool = True

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "name": self.name,
            "category": self.category,
            "position": self.position.to_list(),
            "orientation": self.orientation.to_dict(),
            "enabled": self.enabled,
        }

    @staticmethod
    def from_dict(d: dict) -> "Speaker":
        pos = d.get("position", [0.0, 0.0, 0.0])
        return Speaker(
            id=d.get("id", _new_id()),
            name=d.get("name", "Speaker"),
            category=d.get("category", "Generic"),
            position=Vector3(pos[0], pos[1], pos[2]),
            orientation=Orientation.from_dict(d.get("orientation", {})),
            enabled=d.get("enabled", True),
        )


@dataclass
class Listener:
    """A listener position and orientation (spec §15-§17).

    The acoustic origin is approximately the center point between the ears,
    placed at `position + (0, 0, ear_height)` above `position` if the
    `position` tag designates a chair/couch seat level. For 0.1 simplicity,
    `position` already denotes the ear-center position in room coordinates.
    `ear_height` is stored for future refinement and UX.
    """

    id: str = field(default_factory=_new_id)
    name: str = "Listener"
    position: Vector3 = field(default_factory=lambda: Vector3(0.0, 0.0, 1.1))
    orientation: Orientation = field(default_factory=Orientation)
    ear_height: float = 1.10  # meters

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "name": self.name,
            "position": self.position.to_list(),
            "orientation": self.orientation.to_dict(),
            "ear_height": self.ear_height,
        }

    @staticmethod
    def from_dict(d: dict) -> "Listener":
        pos = d.get("position", [0.0, 0.0, 1.1])
        return Listener(
            id=d.get("id", _new_id()),
            name=d.get("name", "Listener"),
            position=Vector3(pos[0], pos[1], pos[2]),
            orientation=Orientation.from_dict(d.get("orientation", {})),
            ear_height=d.get("ear_height", 1.10),
        )


@dataclass
class BelugaProject:
    """A Beluga project bundle (spec §60-§62).

    Stores room, speakers, listener, and (future) calibration/playback settings.
    Can be saved/loaded as JSON for round-trip persistence.
    """

    name: str = "Untitled"
    room: Room = field(default_factory=Room)
    speakers: list[Speaker] = field(default_factory=list)
    listeners: list[Listener] = field(default_factory=list)
    active_listener_id: str | None = None

    def active_listener(self) -> Listener | None:
        if not self.listeners:
            return None
        if self.active_listener_id:
            for l in self.listeners:
                if l.id == self.active_listener_id:
                    return l
        return self.listeners[0]

    def to_dict(self) -> dict:
        return {
            "name": self.name,
            "room": self.room.to_dict(),
            "speakers": [s.to_dict() for s in self.speakers],
            "listeners": [l.to_dict() for l in self.listeners],
            "active_listener_id": self.active_listener_id,
        }

    @staticmethod
    def from_dict(d: dict) -> "BelugaProject":
        return BelugaProject(
            name=d.get("name", "Untitled"),
            room=Room.from_dict(d.get("room", {})),
            speakers=[Speaker.from_dict(s) for s in d.get("speakers", [])],
            listeners=[Listener.from_dict(l) for l in d.get("listeners", [])],
            active_listener_id=d.get("active_listener_id"),
        )

    def save(self, path: str | Path) -> None:
        Path(path).write_text(json.dumps(self.to_dict(), indent=2), encoding="utf-8")

    @staticmethod
    def load(path: str | Path) -> "BelugaProject":
        return BelugaProject.from_dict(json.loads(Path(path).read_text(encoding="utf-8")))