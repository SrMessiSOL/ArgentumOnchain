CREATE TABLE IF NOT EXISTS dropped_floor_items (
 drop_id UUID PRIMARY KEY, map_id INTEGER NOT NULL CHECK(map_id>0), x INTEGER NOT NULL CHECK(x>=0), y INTEGER NOT NULL CHECK(y>=0),
 item_id INTEGER NOT NULL CHECK(item_id>0), amount INTEGER NOT NULL CHECK(amount>0), UNIQUE(map_id,x,y)
);
