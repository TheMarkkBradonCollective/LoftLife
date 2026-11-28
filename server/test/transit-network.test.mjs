import assert from 'node:assert/strict';
import test from 'node:test';
import {
  TAXI_DESTINATIONS,
  TRANSIT_HUBS,
  TRANSIT_LINES,
  ensureFleet,
  resetTransit,
  routePosition,
  stepTransit,
  taxiDestinations,
  transitHubs,
  transitLines,
  vehiclesFor,
} from '../transit.mjs';
import { CITY_TRAVEL_DESTINATIONS } from '../travel.mjs';

test('the transit network has scheduled buses, light rail, taxis and a rail hub', () => {
  const buses = TRANSIT_LINES.filter((line) => line.kind === 'bus');
  const rails = TRANSIT_LINES.filter((line) => line.kind === 'rail');
  assert.ok(buses.length >= 3, 'multiple bus routes');
  assert.ok(rails.length >= 2, 'multiple light-rail routes');
  assert.ok(rails.every((line) => line.stops.length >= 5), 'rail lines serve multiple stations');
  assert.ok(TRANSIT_LINES.every((line) => line.stops.length >= 3));

  const ids = new Set();
  for (const line of TRANSIT_LINES) {
    assert.ok(!ids.has(line.id), `duplicate line ${line.id}`);
    ids.add(line.id);
    for (const stop of line.stops) {
      assert.ok(Number.isFinite(stop.x) && Number.isFinite(stop.z));
      // The redesigned city is roughly 1.1 km across, so the map bound is 800 m.
      assert.ok(Math.abs(stop.x) <= 800 && Math.abs(stop.z) <= 800, `${stop.id} is in the city`);
    }
  }

  assert.ok(TAXI_DESTINATIONS.length >= 5, 'taxis know every supported city destination');
  assert.ok(taxiDestinations().every((entry) => entry.arrival && entry.label));
  assert.ok(transitHubs().some((hub) => hub.id === 'central-station'));
  assert.equal(transitLines().length, TRANSIT_LINES.length);
  assert.ok(CITY_TRAVEL_DESTINATIONS.some((entry) => entry.location === 'airport'));
});

test('route navigation wraps every stop without leaving the city', () => {
  for (const line of TRANSIT_LINES) {
    const duration = line.stops.length * 60_000;
    for (let i = 0; i < 40; i++) {
      const at = routePosition(line, 0, (duration / 40) * i);
      assert.ok(Number.isFinite(at.x) && Number.isFinite(at.z));
      assert.ok(at.stopIndex >= 0 && at.stopIndex < line.stops.length);
      assert.ok(Math.abs(at.x) < 900 && Math.abs(at.z) < 900, `${line.id} stays in the map`);
    }
  }
});

test('the ambient fleet contains scheduled transit only and no autonomous cars', () => {
  const instanceId = `no-taxi-${Date.now()}`;
  const fleet = ensureFleet(instanceId);
  assert.ok(fleet.size >= 2, 'scheduled buses and light rail remain available');
  assert.ok([...fleet.values()].every((vehicle) => vehicle.kind === 'bus' || vehicle.kind === 'rail'));
  assert.equal([...fleet.values()].filter((vehicle) => vehicle.kind === 'taxi').length, 0);
  const views = vehiclesFor(instanceId);
  assert.ok(views.some((vehicle) => vehicle.kind === 'bus'));
  assert.ok(views.some((vehicle) => vehicle.kind === 'rail'));
  assert.ok(views.every((vehicle) => vehicle.kind !== 'taxi'));
});
