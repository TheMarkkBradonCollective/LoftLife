# LoftLife Transportation Network

LoftLife's city is connected by a server-authoritative transit network: five scheduled
LoftLine routes, three autonomous taxis, an intercity rail terminal and an airport with
destination loading. There are no driver, operator or conductor NPCs — every vehicle is
driven by the server clock, and every rider pose, seat and journey is owned by the server.

## Fleet

### Buses (`kind: 'bus'`, 6 seats, 9 m/s, 4.5 s dwell)

| Route | Stops |
| --- | --- |
| 15th Street Bus (`loftline-15`) | 15th & L, M, N, O, P |
| M Street Bus (`loftline-m`) | M St & 12th, 14th, 15th, 16th, 18th |
| Downtown Loop Bus (`loftline-loop`) | Loft Plaza, Library, Market Hall, Cinema, The Med Deck |

The original 15th/M Street stop coordinates are unchanged.

### Light rail (`kind: 'rail'`, 8 seats, 16 m/s, 5.5 s dwell)

| Line | Stops |
| --- | --- |
| Green Line · Airport Express (`rail-green`) | M St & 16th, O St, T St, W St, Grand Hotel, Airport |
| Blue Line · Downtown Loop (`rail-blue`) | 12th St, 15th St, 16th St, Cinema, O St |

Stations, platform markers and route signage are rendered from the same server line data.
Riders sit in paired rows inside the rail car; other players see the shared car and its
occupants move together.

### Autonomous taxis (`kind: 'taxi'`, 3 seats, 12 m/s)

Three taxis patrol the city road grid. A taxi slows and waits near a player, then accepts a
hail within 9 m. The rider picks one of six rated destinations:

`LoftLife Plaza`, `Grand Hotel`, `TheCity Airport`, `LoftLife Threads`, `Public Library`,
`The Med Deck`.

The server builds the route along the street grid (`ROAD_U` / `ROAD_Z`) and ends on a short
driveway to the destination's arrival point. Taxi movement, waiting, passenger seats and
drop-off all live in server state; a client cannot place a taxi or a rider.

### Intercity rail

LoftLife Central Station (`central-station`, at `x 26.56, z 10.5`) opens the journey UI.
The server checks the player is within 18 m of the hub and validates the destination before
starting a journey. City destinations: Plaza, Grand Hotel, Airport, LoftLife Threads. On the
Node deployment, eligible player worlds are also listed through `travelWorlds(viewerId)`
and re-checked with `canEnterWorld` when the journey starts.

### Airport

At `TheCity Airport`, the flight board offers the same destination catalogue. Boarding,
departure and arrival are server events; the client plays the cutscene and only then loads
the arrival location. A flight cannot be started from anywhere except the airport, and the
shared destination validation prevents teleporting into an unavailable world.

## Authority model

All movement is derived from timestamps stored in the server socket attachment:

- **Scheduled fleet** — a vehicle's position is a pure function of `Date.now()`, its line,
  start stop and boarding time. Every client computes the same pose from the same snapshot;
  no client ever broadcasts a vehicle transform.
- **Taxis** — the server stores the hired taxi's path, start time, duration and arrival
  point. Rider positions are derived from that path. Taxi status (`roam`, `waiting`,
  `driving`, `arrived`) is server state.
- **Journeys** — `startJourney` creates a `boarding → enroute → arrived` record with
  server-owned `departAt` / `arriveAt`. The player's own pose messages advance the clock;
  arrival is applied by the server, which then sends the `travel` event and snapshot.
- **Seats** — the server allocates the lowest free seat, rejects full vehicles, and derives
  every rider's world pose from the vehicle pose plus the seat offset.
- **Reconnect** — socket attachments are serialized on every transition, so a reconnect
  restores the rider, taxi or journey. Stale sockets are swept; disconnected riders are
  released rather than left occupying a seat.
- **Validation** — destinations come from the server catalogue (or eligible worlds with
  `canEnterWorld`), not from client coordinates. Boarding distance, vehicle capacity and
  mode/location are checked before any state changes.

The Node server and the Cloudflare Durable Object implement the same contract. The edge
supports scheduled buses, both rail lines, autonomous taxis, city journeys and eligible
D1 player worlds. The Node server is the full reference implementation and also owns
private-world travel through the worlds service.

## Transition sequences

The client plays a short transition for taxis, buses, trains, elevators and airplanes.
Each transition covers the load: taxi and bus rides fade from boarding to the vehicle, rail
and flight boarding run a departure board and cabin sequence, and arrival fades into the
destination before the world socket switch. Journeys and vehicle state remain server-owned
throughout; the transition is presentation only.

## Controls

- Walk to a bus stop or rail platform and press the platform prompt to board.
- Press the taxi prompt near a waiting taxi, choose a destination, then ride.
- At Central Station or the airport, open the travel board and choose a destination.
- Press exit on the transit HUD to step off a bus, train or taxi.

## Endpoints

| Endpoint | Purpose |
| --- | --- |
| `GET /api/transit` | Lines, stops, stations, taxis and hubs |
| `GET /api/travel/destinations` | City destinations plus eligible player worlds |
| `WS transit` | `board`, `exit`, `hailTaxi`, `taxiDestination` |
| `WS travel` | `start`, `cancel`; server emits `boarding`, `departed`, `arrived`, `cancelled` |

## Tests and performance

```bash
npm test
npm run check:transit
npm run check:city
npm run check:hotel
npm run build
```

`server/test/transit-network.test.mjs` covers line/seat invariants, shared vehicle snapshots,
taxi hailing and dispatch, invalid destinations, intercity gateway checks and eligibility of
private worlds. `server/test/worker-city.test.mjs` exercises the shipping Worker and Durable
Object: transit API, travel destination API, taxi hail and dispatch, and intercity boarding.
`scripts/check-transit-network.mjs` runs 900 fleet ticks and prints the measured cost; the
current run is about 3 ms for 900 ticks (roughly 0.003 ms per fleet tick), so the network
adds no meaningful per-frame cost.

## Known limits

- Intercity trains and flights are scheduled journey events with client cutscenes, not
  physically simulated long-distance vehicles inside the city world.
- The Cloudflare edge validates player worlds against D1 and `permission`; the Node server
  additionally exposes the private-world travel helper used by its worlds service.
- Taxis follow the city road grid and a final driveway; they do not perform free-form
  obstacle avoidance.
