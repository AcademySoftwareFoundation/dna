"""Tests for the ftrack UUID <-> int surrogate id map."""

import pathlib

import pytest

from dna.prodtrack_providers.ftrack_id_map import (
    InMemoryIdMap,
    SqliteIdMap,
    get_ftrack_id_map,
    surrogate_id,
)

UUID_A = "3a7c1e02-1111-4111-8111-000000000001"
UUID_B = "3a7c1e02-2222-4222-8222-000000000002"


class TestSurrogateId:
    """The derived int has to be usable by the JS frontend."""

    def test_is_deterministic(self):
        assert surrogate_id(UUID_A) == surrogate_id(UUID_A)

    def test_differs_per_uuid(self):
        assert surrogate_id(UUID_A) != surrogate_id(UUID_B)

    def test_salt_changes_the_result(self):
        assert surrogate_id(UUID_A, salt=1) != surrogate_id(UUID_A)

    def test_stays_inside_the_js_safe_range(self):
        for uuid in (UUID_A, UUID_B, "x", "0" * 36):
            value = surrogate_id(uuid)
            assert 0 < value <= 9007199254740991


class _IdMapContract:
    """Shared behaviour every backend must honour."""

    def make_map(self, tmp_path):
        raise NotImplementedError()

    def test_round_trips_a_uuid(self, tmp_path):
        id_map = self.make_map(tmp_path)
        entity_id = id_map.to_int(UUID_A, "AssetVersion")
        assert id_map.to_uuid(entity_id) == UUID_A
        assert id_map.entity_type_for(entity_id) == "AssetVersion"

    def test_is_stable_across_calls(self, tmp_path):
        id_map = self.make_map(tmp_path)
        first = id_map.to_int(UUID_A, "AssetVersion")
        second = id_map.to_int(UUID_A, "AssetVersion")
        assert first == second

    def test_matches_the_bare_hash_when_uncontended(self, tmp_path):
        id_map = self.make_map(tmp_path)
        assert id_map.to_int(UUID_A, "AssetVersion") == surrogate_id(UUID_A)

    def test_unknown_id_resolves_to_none(self, tmp_path):
        id_map = self.make_map(tmp_path)
        assert id_map.to_uuid(123456789) is None
        assert id_map.entity_type_for(123456789) is None

    def test_collision_falls_through_to_a_free_slot(self, tmp_path, monkeypatch):
        id_map = self.make_map(tmp_path)
        taken = id_map.to_int(UUID_A, "AssetVersion")

        # Force the first probe for B onto A's slot.
        import dna.prodtrack_providers.ftrack_id_map as module

        real = module.surrogate_id

        def colliding(uuid, salt=0):
            if uuid == UUID_B and salt == 0:
                return taken
            return real(uuid, salt)

        monkeypatch.setattr(module, "surrogate_id", colliding)

        other = id_map.to_int(UUID_B, "AssetVersion")
        assert other != taken
        assert id_map.to_uuid(other) == UUID_B
        assert id_map.to_uuid(taken) == UUID_A


class TestInMemoryIdMap(_IdMapContract):
    def make_map(self, tmp_path):
        return InMemoryIdMap()


class TestSqliteIdMap(_IdMapContract):
    def make_map(self, tmp_path):
        return SqliteIdMap(tmp_path / "ids.db")

    def test_survives_a_new_instance(self, tmp_path):
        path = tmp_path / "ids.db"
        entity_id = SqliteIdMap(path).to_int(UUID_A, "AssetVersion")
        assert SqliteIdMap(path).to_uuid(entity_id) == UUID_A


class TestBatching:
    """Conversion asks for hundreds of ids per playlist; they go in batches."""

    def make_map(self):
        return InMemoryIdMap()

    def make_map_sharing(self, other):
        """A second map over the same storage, with an empty cache."""
        fresh = InMemoryIdMap()
        fresh._store = other._store
        fresh._by_uuid = other._by_uuid
        return fresh

    def _counting(self, id_map):
        """Wrap the storage hooks so round trips can be counted."""
        calls = {"fetch_ints": 0, "fetch_rows": 0}
        real_ints = id_map._fetch_ints
        real_rows = id_map._fetch_rows

        def fetch_ints(uuids):
            calls["fetch_ints"] += 1
            calls.setdefault("fetched_uuids", []).append(list(uuids))
            return real_ints(uuids)

        def fetch_rows(ids):
            calls["fetch_rows"] += 1
            return real_rows(ids)

        id_map._fetch_ints = fetch_ints
        id_map._fetch_rows = fetch_rows
        return calls

    def test_to_ints_maps_a_whole_batch(self):
        id_map = self.make_map()
        items = [(f"uuid-{i}", "AssetVersion") for i in range(50)]

        result = id_map.to_ints(items)

        assert len(result) == 50
        assert len(set(result.values())) == 50
        for uuid, _ in items:
            assert id_map.to_uuid(result[uuid]) == uuid

    def test_a_warmed_batch_costs_no_further_reads(self):
        id_map = self.make_map()
        items = [(f"uuid-{i}", "AssetVersion") for i in range(20)]
        id_map.to_ints(items)

        calls = self._counting(id_map)
        for uuid, entity_type in items:
            id_map.to_int(uuid, entity_type)

        assert calls["fetch_ints"] == 0

    def test_repeats_within_one_batch_are_collapsed(self):
        """Ten mentions of one uuid must not become ten lookups."""
        id_map = self.make_map()
        calls = self._counting(id_map)

        result = id_map.to_ints([("uuid-a", "Project")] * 10)

        assert len(result) == 1
        for fetched in calls["fetched_uuids"]:
            assert fetched == ["uuid-a"]

    def test_an_unmapped_batch_reads_twice_at_most(self):
        """Once to find what exists, once to confirm what the bulk write placed."""
        id_map = self.make_map()
        calls = self._counting(id_map)

        id_map.to_ints([(f"uuid-{i}", "AssetVersion") for i in range(30)])

        assert calls["fetch_ints"] <= 2

    def test_an_already_mapped_batch_reads_once(self):
        id_map = self.make_map()
        items = [(f"uuid-{i}", "AssetVersion") for i in range(30)]
        id_map.to_ints(items)

        fresh = self.make_map_sharing(id_map)
        calls = self._counting(fresh)
        fresh.to_ints(items)

        assert calls["fetch_ints"] == 1

    def test_to_uuids_resolves_many_ids_at_once(self):
        id_map = self.make_map()
        ids = {u: id_map.to_int(u, "User") for u in ("uuid-a", "uuid-b", "uuid-c")}

        resolved = id_map.to_uuids(list(ids.values()))

        assert resolved == {v: k for k, v in ids.items()}

    def test_to_uuids_skips_ids_that_were_never_mapped(self):
        id_map = self.make_map()
        known = id_map.to_int(UUID_A, "AssetVersion")

        resolved = id_map.to_uuids([known, 12345])

        assert resolved == {known: UUID_A}

    def test_reverse_lookups_are_cached(self):
        id_map = self.make_map()
        entity_id = id_map.to_int(UUID_A, "AssetVersion")
        calls = self._counting(id_map)

        for _ in range(5):
            assert id_map.to_uuid(entity_id) == UUID_A

        assert calls["fetch_rows"] == 0

    def test_a_full_cache_is_dropped_rather_than_growing(self):
        id_map = InMemoryIdMap(cache_size=4)
        ids = {u: id_map.to_int(u, "User") for u in (f"uuid-{i}" for i in range(10))}

        # Evicted entries must still resolve, just from the store.
        for uuid, entity_id in ids.items():
            assert id_map.to_uuid(entity_id) == uuid

    def test_batching_survives_a_collision(self, monkeypatch):
        """Two uuids hashing alike must still both come back from one batch."""
        import dna.prodtrack_providers.ftrack_id_map as module

        real = module.surrogate_id

        def colliding(uuid, salt=0):
            if salt == 0 and uuid in (UUID_A, UUID_B):
                return 4242
            return real(uuid, salt)

        monkeypatch.setattr(module, "surrogate_id", colliding)
        id_map = self.make_map()

        result = id_map.to_ints([(UUID_A, "AssetVersion"), (UUID_B, "AssetVersion")])

        assert len(set(result.values())) == 2
        assert id_map.to_uuid(result[UUID_A]) == UUID_A
        assert id_map.to_uuid(result[UUID_B]) == UUID_B


class TestSqliteBatching(TestBatching):
    """The persistent backend must batch identically."""

    def make_map(self, tmp_path=None):
        import tempfile

        return SqliteIdMap(pathlib.Path(tempfile.mkdtemp()) / "ids.db")

    def make_map_sharing(self, other):
        return SqliteIdMap(other._db_path)


class TestFactory:
    def test_selects_backend_from_env(self, monkeypatch, tmp_path):
        monkeypatch.setenv("FTRACK_ID_MAP", "memory")
        assert isinstance(get_ftrack_id_map(), InMemoryIdMap)

        monkeypatch.setenv("FTRACK_ID_MAP", "sqlite")
        monkeypatch.setenv("FTRACK_ID_MAP_PATH", str(tmp_path / "ids.db"))
        assert isinstance(get_ftrack_id_map(), SqliteIdMap)

    def test_rejects_unknown_backend(self, monkeypatch):
        monkeypatch.setenv("FTRACK_ID_MAP", "postgres")
        with pytest.raises(ValueError, match="Unknown ftrack id map backend"):
            get_ftrack_id_map()
