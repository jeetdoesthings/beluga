"""Tests for beluga.speaker — data model serialization and round-trip."""

import json
import tempfile
from pathlib import Path

import pytest

from beluga.geometry import Orientation, Vector3
from beluga.speaker import BelugaProject, Listener, Room, Speaker


class TestSpeaker:
    def test_defaults(self):
        s = Speaker()
        assert s.name == "Speaker"
        assert s.category == "Generic"
        assert s.enabled is True

    def test_to_from_dict(self):
        s = Speaker(
            name="FL",
            category="Bookshelf",
            position=Vector3(1.0, 2.0, 1.1),
            orientation=Orientation(yaw=-30.0),
        )
        d = s.to_dict()
        s2 = Speaker.from_dict(d)
        assert s2.name == s.name
        assert s2.category == s.category
        assert s2.position == s.position
        assert s2.orientation == s.orientation
        assert s2.enabled == s.enabled

    def test_position_tuple(self):
        d = {"position": [1, 2, 3]}
        s = Speaker.from_dict(d)
        assert s.position == Vector3(1, 2, 3)


class TestListener:
    def test_defaults(self):
        l = Listener()
        assert l.ear_height == 1.10

    def test_to_from_dict(self):
        l = Listener(
            name="Main",
            position=Vector3(0, 0, 1.2),
            orientation=Orientation(yaw=45.0, pitch=-5.0),
            ear_height=1.15,
        )
        d = l.to_dict()
        l2 = Listener.from_dict(d)
        assert l2.name == l.name
        assert l2.position == l.position
        assert l2.orientation == l.orientation
        assert l2.ear_height == l.ear_height


class TestRoom:
    def test_defaults(self):
        r = Room()
        assert r.length == 5.0
        assert r.width == 4.0
        assert r.height == 2.8

    def test_to_from_dict(self):
        r = Room(name="Studio", length=6.0, width=5.0, height=3.0)
        r2 = Room.from_dict(r.to_dict())
        assert r2.name == r.name
        assert r2.length == r.length


class TestBelugaProject:
    def test_active_listener(self):
        l = Listener(name="L1")
        p = BelugaProject(name="P", listeners=[l], active_listener_id=l.id)
        assert p.active_listener().id == l.id

    def test_active_listener_fallback(self):
        l = Listener(name="L1")
        p = BelugaProject(name="P", listeners=[l])
        # No active_listener_id set → returns first
        assert p.active_listener().id == l.id

    def test_no_listener(self):
        p = BelugaProject(name="P")
        assert p.active_listener() is None

    def test_serialization_roundtrip(self):
        l = Listener(
            name="Main",
            position=Vector3(0, 0, 1.1),
            orientation=Orientation(yaw=0),
            ear_height=1.1,
        )
        s1 = Speaker(
            name="FL",
            position=Vector3(-1.5, 2.0, 1.1),
            orientation=Orientation(yaw=-30),
        )
        s2 = Speaker(
            name="FR",
            position=Vector3(1.5, 2.0, 1.1),
            orientation=Orientation(yaw=30),
        )
        p = BelugaProject(
            name="Test Project",
            room=Room(name="Room", length=5, width=4, height=2.8),
            speakers=[s1, s2],
            listeners=[l],
            active_listener_id=l.id,
        )

        d = p.to_dict()
        p2 = BelugaProject.from_dict(d)
        assert p2.name == p.name
        assert len(p2.speakers) == 2
        assert p2.speakers[0].name == "FL"
        assert p2.speakers[0].position == s1.position
        assert len(p2.listeners) == 1
        assert p2.listeners[0].name == "Main"
        assert p2.active_listener_id == l.id

    def test_save_load_json(self):
        l = Listener(name="Main", position=Vector3(0, 0, 1.1))
        s = Speaker(name="S1", position=Vector3(2, 0, 1.1))
        p = BelugaProject(name="JSON test", speakers=[s], listeners=[l])

        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "project.json"
            p.save(path)
            p2 = BelugaProject.load(path)
            assert p2.name == "JSON test"
            assert len(p2.speakers) == 1
            assert p2.speakers[0].name == "S1"
            assert len(p2.listeners) == 1