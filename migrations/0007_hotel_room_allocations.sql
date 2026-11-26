-- Allocate each account a stable, unique hotel room.
-- Residential floors begin at 5; each floor has ten doors (five per hallway side).
CREATE TABLE IF NOT EXISTS ll_hotel_room_allocations (
  room_index BIGSERIAL PRIMARY KEY,
  owner_id TEXT NOT NULL UNIQUE REFERENCES ll_accounts(id) ON DELETE CASCADE,
  created_at BIGINT NOT NULL
);

-- Existing accounts are assigned stable unique rooms in owner-id order.
INSERT INTO ll_hotel_room_allocations (owner_id, created_at)
SELECT owner_id, updated_at
FROM ll_suites
ORDER BY owner_id
ON CONFLICT (owner_id) DO NOTHING;

UPDATE ll_suites AS s
SET
  floor = 5 + ((a.room_index - 1) / 10)::INTEGER,
  number = (5 + ((a.room_index - 1) / 10))::TEXT
    || lpad((((a.room_index - 1) % 10) + 1)::TEXT, 2, '0')
FROM ll_hotel_room_allocations AS a
WHERE a.owner_id = s.owner_id;
