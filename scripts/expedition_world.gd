extends Node3D
## Split integer sectors preserve local physics precision across a 200,000 km domain.
## Subtract rebased's offset from external entities; region children move automatically.

signal rebased(offset: Vector3)

const SECTOR_SIZE := 128.0
const MAX_SECTOR := 781250
const HALF_WORLD_METERS := 100000000.0
const GRID := 16
const CELL := 8.0
const MAX_SCENE_COLLISIONS := 16
const HALL_POSITION := Vector3(0, -0.944, -20)
const HALL_SCALE := 1.6
const PALETTE := preload("res://scripts/architectural_palette.gd")
const NATURE := preload("res://scripts/nature.gd")
const SANCTUARY := preload("res://assets/models/celestial/sanctuary.glb")
const PAGODA := preload("res://assets/models/celestial/pagoda.glb")
const GATE := preload("res://assets/models/gate.glb")
const PLANTER := preload("res://assets/models/celestial/planter.glb")
const DESK := preload("res://assets/models/verdant/scholar_desk.glb")
const SHELF := preload("res://assets/models/verdant/scroll_shelf.glb")
const LANTERN := preload("res://assets/models/lantern.glb")
const ORIGIN_SANCTUARY := preload("res://scripts/expedition_sanctuary.gd")
const ORIGIN_GARDEN := preload("res://scripts/expedition_garden.gd")
const BIOMES := ["Jade Highlands", "Amber Pilgrim Road", "Rosewood Sanctuary", "Mistpine Frontier"]
const GROUND_COLORS := [Color("778b67"), Color("a9996b"), Color("8b8d77"), Color("667e76")]
const LEAF_COLORS := [Color("89a575"), Color("d2a458"), Color("c996aa"), Color("69988a")]
const GROUND_SHADER := """
shader_type spatial;
uniform vec3 biome_tint : source_color = vec3(0.7, 0.9, 0.7);
varying vec3 ground_point;
varying vec3 slope_normal;
float hash21(vec2 p) { return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
float noise21(vec2 p) {
 vec2 i=floor(p); vec2 f=fract(p); f=f*f*(3.0-2.0*f);
 return mix(mix(hash21(i),hash21(i+vec2(1,0)),f.x),
 mix(hash21(i+vec2(0,1)),hash21(i+vec2(1,1)),f.x),f.y);
}
void vertex() { ground_point=VERTEX; slope_normal=NORMAL; }
void fragment() {
 vec2 p=ground_point.xz;
 float broad=noise21(p*0.13);
 float detail=noise21(p*1.8);
 float grain=noise21(p*19.0);
 vec3 meadow=mix(vec3(0.19,0.29,0.11),vec3(0.37,0.45,0.21),broad);
 meadow*=biome_tint*(0.86+detail*0.22+grain*0.1);
 float soil=smoothstep(0.68,0.88,noise21(p*0.37+18.0));
 meadow=mix(meadow,vec3(0.31,0.27,0.17),soil*0.65);
 float slope=smoothstep(0.14,0.4,1.0-slope_normal.y);
 vec3 rock=mix(vec3(0.28,0.31,0.22),vec3(0.43,0.44,0.32),detail);
 ALBEDO=mix(meadow,rock,slope*0.75); ROUGHNESS=0.96;
}
"""
const ROAD_SHADER := """
shader_type spatial;
varying vec3 road_point;
float stonehash(vec2 p) { return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
void vertex() { road_point=(MODEL_MATRIX*vec4(VERTEX,1.0)).xyz; }
void fragment() {
 vec2 p=road_point.xz*vec2(0.5,1.0);
 p.x+=mod(floor(p.y),2.0)*0.5;
 vec2 cell=floor(p); vec2 f=fract(p);
 float edge=min(min(f.x,1.0-f.x),min(f.y,1.0-f.y));
 float joint=1.0-smoothstep(0.008,0.035,edge);
 float grain=stonehash(floor(road_point.xz*45.0));
 vec3 stone=mix(vec3(0.40,0.43,0.37),vec3(0.60,0.61,0.50),stonehash(cell));
 ALBEDO=mix(stone*(0.95+grain*0.08),vec3(0.22,0.27,0.16),joint*0.65);
 ROUGHNESS=0.9;
}
"""

# Immutable authored resources survive leaving and reentering the expedition.
# Keep this independent of region keys: distant travel must never grow a terrain cache.
static var _scene_collision_cache: Dictionary = {}
static var _shared_ground_materials: Array[ShaderMaterial] = []
static var _shared_road_material: ShaderMaterial
static var _shared_rock_mesh: ArrayMesh
static var _shared_rock_collision: ConcavePolygonShape3D

var origin_sector := Vector2i.ZERO
var _player: CharacterBody3D
var _regions: Dictionary = {}
var _decoration_queue: Array[Vector2i] = []
var _hall_collision: ConcavePolygonShape3D
var _tower_collision: ConcavePolygonShape3D
var _gate_collision: ConcavePolygonShape3D
var _rock_mesh: ArrayMesh
var _rock_collision: ConcavePolygonShape3D
var _furniture_shapes: Dictionary = {}
var _quality := "balanced"
var _ground_materials: Array[ShaderMaterial] = []
var _road_material: ShaderMaterial
var _nature := NATURE.new()
var _initialized := false


func setup(player: CharacterBody3D) -> void:
	_player = player
	if not _initialized:
		_initialize_resources()
		_initialized = true
	travel_to(Vector2i.ZERO)


func travel_to(sector: Vector2i, local_position: Vector3 = Vector3(0, 3, 12)) -> void:
	if not is_instance_valid(_player) or not local_position.is_finite():
		return
	var target := Vector2i(
		clampi(sector.x, -MAX_SECTOR, MAX_SECTOR), clampi(sector.y, -MAX_SECTOR, MAX_SECTOR)
	)
	# Atlas travel replaces the small coordinate frame. Never construct a huge float origin.
	for region: Node3D in _regions.values():
		remove_child(region)
		region.queue_free()
	_regions.clear()
	_decoration_queue.clear()
	origin_sector = target
	_player.position = Vector3(
		clampf(local_position.x, -64, 63.999),
		clampf(local_position.y, 0.05, 500),
		clampf(local_position.z, -64, 63.999)
	)
	_clamp_domain()
	_player.position.y = maxf(_player.position.y, ground_height(target, _player.position) + 0.05)
	_player.velocity = Vector3.ZERO
	_sync_regions()
	# Arrival's silhouette is ready immediately; the eight neighbors are frame-budgeted.
	if not _decoration_queue.is_empty():
		_decorate(_decoration_queue.pop_front())


func world_coordinates() -> Dictionary:
	if not is_instance_valid(_player):
		return {"sector": [origin_sector.x, origin_sector.y], "local": [0.0, 3.0, 12.0]}
	var point := _player.position
	var step := Vector2i(floori((point.x + 64) / SECTOR_SIZE), floori((point.z + 64) / SECTOR_SIZE))
	var sector := origin_sector + step
	point -= Vector3(step.x * SECTOR_SIZE, 0, step.y * SECTOR_SIZE)
	# Saving may run after player movement but before this node's next physics callback.
	if (
		absi(sector.x) > MAX_SECTOR
		or (absi(sector.x) == MAX_SECTOR and point.x * signi(sector.x) > 0)
	):
		sector.x = clampi(sector.x, -MAX_SECTOR, MAX_SECTOR)
		point.x = 0
	if (
		absi(sector.y) > MAX_SECTOR
		or (absi(sector.y) == MAX_SECTOR and point.z * signi(sector.y) > 0)
	):
		sector.y = clampi(sector.y, -MAX_SECTOR, MAX_SECTOR)
		point.z = 0
	return {"sector": [sector.x, sector.y], "local": [point.x, point.y, point.z]}


func restore_coordinates(data: Dictionary) -> bool:
	var sector: Variant = data.get("sector")
	var local: Variant = data.get("local")
	if not sector is Array or not local is Array or sector.size() != 2 or local.size() != 3:
		return false
	for value: Variant in sector:
		if (
			not _number(value)
			or not is_finite(float(value))
			or float(value) != floorf(float(value))
			or absf(float(value)) > MAX_SECTOR
		):
			return false
	for value: Variant in local:
		if not _number(value) or not is_finite(float(value)):
			return false
	var point := Vector3(local[0], local[1], local[2])
	if (
		point.x < -64
		or point.x >= 64
		or point.z < -64
		or point.z >= 64
		or point.y < -1
		or point.y > 500
	):
		return false
	var key := Vector2i(int(sector[0]), int(sector[1]))
	if (
		absi(key.x) == MAX_SECTOR and point.x * signi(key.x) > 0
		or absi(key.y) == MAX_SECTOR and point.z * signi(key.y) > 0
	):
		return false
	travel_to(key, point)
	# Preserve grounded saved feet exactly; arrival safety only raises genuinely buried saves.
	_player.position.y = maxf(point.y, ground_height(key, point))
	return true


func biome_name() -> String:
	if origin_sector == Vector2i.ZERO:
		return "Lotus Cliff Sanctuary"
	return BIOMES[_biome(origin_sector)]


func active_sector_count() -> int:
	return _regions.size()


func apply_quality(preset: String) -> void:
	_quality = preset if preset in ["performance", "balanced", "high"] else "balanced"
	for region: Node3D in _regions.values():
		_region_quality(region)


func _region_quality(region: Node3D) -> void:
	var distance := 95.0
	if _quality == "performance":
		distance = 75.0
	elif _quality == "high":
		distance = 145.0
	for item: GeometryInstance3D in region.find_children("*", "GeometryInstance3D", true, false):
		var kind: String = item.get_meta("expedition_kind", "")
		if kind != "":
			item.visibility_range_end = distance + (20 if kind == "tower" else 0)
			item.cast_shadow = (
				GeometryInstance3D.SHADOW_CASTING_SETTING_ON
				if _quality != "performance"
				else GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
			)
		elif item is MultiMeshInstance3D:
			item.visibility_range_end = distance + 35
			if item.get_meta("density_scaled", false):
				item.multimesh.visible_instance_count = int(
					item.multimesh.instance_count * (0.55 if _quality == "performance" else 1.0)
				)


func ground_height(sector: Vector2i, local: Vector3) -> float:
	# Piecewise triangles match the actual collision grid, including at sector joins.
	var x := floori(local.x / CELL)
	var z := floori(local.z / CELL)
	var u := local.x / CELL - x
	var v := local.z / CELL - z
	var a := _vertex_height(sector, x, z)
	var b := _vertex_height(sector, x + 1, z)
	var c := _vertex_height(sector, x, z + 1)
	var d := _vertex_height(sector, x + 1, z + 1)
	if u + v <= 1.0:
		return a + (b - a) * u + (c - a) * v
	return d + (c - d) * (1.0 - u) + (b - d) * (1.0 - v)


func _physics_process(_delta: float) -> void:
	if not is_instance_valid(_player) or not _initialized:
		return
	_clamp_domain()
	var step := Vector2i(
		floori((_player.position.x + 64) / SECTOR_SIZE),
		floori((_player.position.z + 64) / SECTOR_SIZE)
	)
	if step == Vector2i.ZERO:
		return
	var next := origin_sector + step
	next.x = clampi(next.x, -MAX_SECTOR, MAX_SECTOR)
	next.y = clampi(next.y, -MAX_SECTOR, MAX_SECTOR)
	step = next - origin_sector
	var offset := Vector3(step.x * SECTOR_SIZE, 0, step.y * SECTOR_SIZE)
	origin_sector = next
	_player.position -= offset
	for region: Node3D in _regions.values():
		region.position -= offset
	rebased.emit(offset)
	_sync_regions()


func _process(_delta: float) -> void:
	if not _decoration_queue.is_empty():
		_decorate(_decoration_queue.pop_front())


func _clamp_domain() -> void:
	if absi(origin_sector.x) == MAX_SECTOR and _player.position.x * signi(origin_sector.x) > 0:
		_player.position.x = 0
		_player.velocity.x = 0
	if absi(origin_sector.y) == MAX_SECTOR and _player.position.z * signi(origin_sector.y) > 0:
		_player.position.z = 0
		_player.velocity.z = 0


func _sync_regions() -> void:
	for key: Vector2i in _regions.keys():
		if absi(key.x - origin_sector.x) > 1 or absi(key.y - origin_sector.y) > 1:
			var old: Node3D = _regions[key]
			remove_child(old)
			old.queue_free()
			_regions.erase(key)
			_decoration_queue.erase(key)
	# Center first, so a teleport immediately has its hall and vegetation.
	var wanted: Array[Vector2i] = [origin_sector]
	for z in range(-1, 2):
		for x in range(-1, 2):
			if x != 0 or z != 0:
				wanted.append(origin_sector + Vector2i(x, z))
	for key in wanted:
		if _regions.has(key) or absi(key.x) > MAX_SECTOR or absi(key.y) > MAX_SECTOR:
			continue
		var region := Node3D.new()
		region.name = "Sector_%d_%d" % [key.x, key.y]
		region.position = Vector3(
			(key.x - origin_sector.x) * SECTOR_SIZE, 0, (key.y - origin_sector.y) * SECTOR_SIZE
		)
		add_child(region)
		_regions[key] = region
		_build_terrain(region, key)
		_structure(region, "WalkableSanctuary", _hall_collision, HALL_POSITION, HALL_SCALE)
		for side in [-1, 1]:
			if key != Vector2i.ZERO or side == 1:
				_structure(
					region, "WalkableTower", _tower_collision, Vector3(side * 28, -0.59, -36)
				)
		var gate := _structure(region, "WalkableGate", _gate_collision, Vector3(0, 0, 32), 1.1)
		gate.rotation.y = PI
		for side in [-1, 1]:
			_structure(region, "ScholarDesk", _furniture_shapes[DESK], Vector3(side * 3, 0, -20))
			_structure(region, "ScrollShelf", _furniture_shapes[SHELF], Vector3(side * 3, 0, -24))
			_structure(
				region, "HallLantern", _furniture_shapes[LANTERN], Vector3(side * 3, 3.3, -17)
			)
		_domain_walls(region, key)
		if key != Vector2i.ZERO:
			_build_rocks(region, key)
		_decoration_queue.append(key)


func _structure(
	parent: Node3D, label: String, shape: Shape3D, point: Vector3, size: float = 1.0
) -> StaticBody3D:
	var body := StaticBody3D.new()
	body.name = label
	body.position = point
	body.scale = Vector3.ONE * size
	var collision := CollisionShape3D.new()
	collision.shape = shape
	body.add_child(collision)
	parent.add_child(body)
	return body


func _domain_walls(parent: Node3D, key: Vector2i) -> void:
	# Solid boundary avoids a one-frame excursion regardless of player process ordering.
	for axis in range(2):
		var component := key.x if axis == 0 else key.y
		if absi(component) != MAX_SECTOR:
			continue
		var shape := BoxShape3D.new()
		shape.size = Vector3(1, 1000, 128) if axis == 0 else Vector3(128, 1000, 1)
		var point := (
			Vector3(signi(component) * 0.85, 450, 0)
			if axis == 0
			else Vector3(0, 450, signi(component) * 0.85)
		)
		_structure(parent, "WorldBoundary", shape, point)


func _number(value: Variant) -> bool:
	return value is int or value is float


func _seed(key: Vector2i) -> int:
	return ((key.x * 73856093) ^ (key.y * 19349663) ^ 73109) & 0x7fffffff


func _biome(key: Vector2i) -> int:
	return _seed(Vector2i(floori(key.x / 7.0), floori(key.y / 7.0))) % BIOMES.size()


func _vertex_height(key: Vector2i, x: int, z: int) -> float:
	if (
		key == Vector2i.ZERO
		and x * CELL >= -48
		and x * CELL <= -8
		and z * CELL >= -56
		and z * CELL <= 32
	):
		return 0.0
	# Integer sample keys, never large Vector3 floats, are the source of randomness.
	var global_x := key.x * GRID + x
	var global_z := key.y * GRID + z
	var cell := Vector2i(floori(global_x / 8.0), floori(global_z / 8.0))
	var u := smoothstep(0, 1, posmod(global_x, 8) / 8.0)
	var v := smoothstep(0, 1, posmod(global_z, 8) / 8.0)
	var h00 := float(_seed(cell) % 1000) / 1000.0
	var h10 := float(_seed(cell + Vector2i.RIGHT) % 1000) / 1000.0
	var h01 := float(_seed(cell + Vector2i.DOWN) % 1000) / 1000.0
	var h11 := float(_seed(cell + Vector2i.ONE) % 1000) / 1000.0
	var noise := lerpf(lerpf(h00, h10, u), lerpf(h01, h11, u), v)
	var lx := float(posmod(x + GRID / 2, GRID) - GRID / 2) * CELL
	var lz := float(posmod(z + GRID / 2, GRID) - GRID / 2) * CELL
	var plaza := smoothstep(0, 14, maxf(absf(lx) - 34, absf(lz) - 40))
	var roads := smoothstep(8, 18, absf(lx)) * smoothstep(8, 18, absf(lz - 12))
	return noise * 17.0 * plaza * roads


func _initialize_resources() -> void:
	if _shared_road_material == null:
		var ground_shader := Shader.new()
		ground_shader.code = GROUND_SHADER
		for color in GROUND_COLORS:
			var material := ShaderMaterial.new()
			material.shader = ground_shader
			material.set_shader_parameter("biome_tint", color.lightened(0.45))
			_shared_ground_materials.append(material)
		var road_shader := Shader.new()
		road_shader.code = ROAD_SHADER
		_shared_road_material = ShaderMaterial.new()
		_shared_road_material.shader = road_shader
	_ground_materials = _shared_ground_materials
	_road_material = _shared_road_material
	_hall_collision = _scene_collision(SANCTUARY)
	_tower_collision = _scene_collision(PAGODA)
	_gate_collision = _scene_collision(GATE)
	for packed in [DESK, SHELF, LANTERN]:
		_furniture_shapes[packed] = _scene_collision(packed)
	if _shared_rock_mesh == null:
		_shared_rock_mesh = _make_rock_mesh()
		_shared_rock_collision = _shared_rock_mesh.create_trimesh_shape()
	_rock_mesh = _shared_rock_mesh
	_rock_collision = _shared_rock_collision


func _scene_collision(packed: PackedScene) -> ConcavePolygonShape3D:
	if _scene_collision_cache.has(packed):
		return _scene_collision_cache[packed]
	var model: Node3D = packed.instantiate()
	var faces := PackedVector3Array()
	_collect_faces(model, Transform3D.IDENTITY, faces)
	var shape := ConcavePolygonShape3D.new()
	shape.set_faces(faces)
	shape.backface_collision = true
	model.free()
	if _scene_collision_cache.size() < MAX_SCENE_COLLISIONS:
		_scene_collision_cache[packed] = shape
	return shape


func _collect_faces(node: Node3D, parent_transform: Transform3D, faces: PackedVector3Array) -> void:
	var transform := parent_transform * node.transform
	if node is MeshInstance3D:
		for point in node.mesh.get_faces():
			faces.append(transform * point)
	for child in node.get_children():
		if child is Node3D:
			_collect_faces(child, transform, faces)


func _build_terrain(region: Node3D, key: Vector2i) -> void:
	# Adjacent triangles share grid points. Sample each point once, preserving
	# exactly the original vertex order and float conversion in the final mesh.
	var vertices := PackedVector3Array()
	for z in range(-8, 9):
		for x in range(-8, 9):
			vertices.append(Vector3(x * CELL, _vertex_height(key, x, z), z * CELL))
	var surface := SurfaceTool.new()
	surface.begin(Mesh.PRIMITIVE_TRIANGLES)
	for z in range(-8, 8):
		for x in range(-8, 8):
			var index := (z + 8) * (GRID + 1) + x + 8
			var a := vertices[index]
			var b := vertices[index + 1]
			var c := vertices[index + GRID + 1]
			var d := vertices[index + GRID + 2]
			for vertex in [a, b, c, b, d, c]:
				surface.set_uv(Vector2(vertex.x, vertex.z) / SECTOR_SIZE)
				surface.add_vertex(vertex)
	surface.generate_normals()
	var mesh := surface.commit()
	var item := MeshInstance3D.new()
	item.name = "WalkableTerrain"
	item.mesh = mesh
	item.material_override = _ground_materials[_biome(key)]
	region.add_child(item)
	item.create_trimesh_collision()
	if key == Vector2i.ZERO:
		_add_road(region, Vector3(27, 0.018, 12), Vector3(74, 0.025, 7.5))
	else:
		_add_road(region, Vector3(0, 0.018, 12), Vector3(128, 0.025, 7.5))
	_add_road(region, Vector3(0, 0.019, 0), Vector3(7.5, 0.025, 128))
	_add_road(region, Vector3(0, 0.014, -18), Vector3(24 if key == Vector2i.ZERO else 30, 0.02, 24))


func _add_road(parent: Node3D, point: Vector3, size: Vector3) -> void:
	var item := MeshInstance3D.new()
	var mesh := BoxMesh.new()
	mesh.size = size
	item.mesh = mesh
	item.material_override = _road_material
	item.position = point
	parent.add_child(item)


func _place(parent: Node3D, packed: PackedScene, point: Vector3, size: float = 1.0) -> Node3D:
	var model: Node3D = packed.instantiate()
	model.position = point
	model.scale = Vector3.ONE * size
	if packed != GATE and packed != LANTERN:
		PALETTE.apply(model)
	parent.add_child(model)
	for item: MeshInstance3D in model.find_children("*", "MeshInstance3D", true, false):
		item.set_meta("expedition_kind", "tower" if packed == PAGODA else "architecture")
	return model


func _decorate(key: Vector2i) -> void:
	if not _regions.has(key):
		return
	var region: Node3D = _regions[key]
	_place(region, SANCTUARY, HALL_POSITION, HALL_SCALE)
	# The side towers establish a distinct skyline without obstructing the road or arena.
	for side in [-1, 1]:
		if key != Vector2i.ZERO or side == 1:
			_place(region, PAGODA, Vector3(side * 28, -0.59, -36))
		_place(region, PLANTER, Vector3(side * 9, 0, -9), 1.3)
		_place(region, DESK, Vector3(side * 3, 0, -20))
		_place(region, SHELF, Vector3(side * 3, 0, -24))
		_place(region, LANTERN, Vector3(side * 3, 3.3, -17))
	var gate := _place(region, GATE, Vector3(0, 0, 32), 1.1)
	gate.rotation.y = PI
	if key == Vector2i.ZERO:
		var sanctuary := ORIGIN_SANCTUARY.new()
		region.add_child(sanctuary)
		sanctuary.build(self)
		ORIGIN_GARDEN.new().build(region)
	else:
		_build_grove(region, key)
		_build_gardens(region, key)
	_region_quality(region)
	region.set_meta("decorated", true)


func _make_rock_mesh() -> ArrayMesh:
	var surface := SurfaceTool.new()
	surface.begin(Mesh.PRIMITIVE_TRIANGLES)
	for tier in range(7):
		for side in range(12):
			var corners: Array[Vector3] = []
			for pair: Vector2i in [
				Vector2i(side, tier),
				Vector2i(side + 1, tier),
				Vector2i(side, tier + 1),
				Vector2i(side + 1, tier + 1)
			]:
				var angle: float = pair.x * TAU / 12
				var height := pair.y / 7.0
				var radius := (
					(1.0 - pow(height, 4) * 0.83) * (0.82 + sin(angle * 3 + height * 8) * 0.15)
				)
				corners.append(
					Vector3(cos(angle) * radius + height * 0.16, height, sin(angle) * radius)
				)
			for index in [0, 1, 2, 1, 3, 2]:
				var vertex := corners[index]
				surface.set_uv(Vector2(atan2(vertex.z, vertex.x) / TAU, vertex.y * 3))
				surface.add_vertex(vertex)
	for side in range(12):
		var cap: Array[Vector3] = [Vector3(0.16, 1, 0)]
		for index in [side, side + 1]:
			var angle: float = index * TAU / 12
			var radius := 0.17 * (0.82 + sin(angle * 3 + 8) * 0.15)
			cap.append(Vector3(cos(angle) * radius + 0.16, 1, sin(angle) * radius))
		for vertex in cap:
			surface.set_uv(Vector2(vertex.x, vertex.z))
			surface.add_vertex(vertex)
	surface.generate_normals()
	var material := StandardMaterial3D.new()
	material.albedo_texture = preload("res://assets/materials/karst_rock_original.png")
	material.normal_enabled = true
	material.normal_texture = preload("res://assets/materials/karst_rock_original_normal.png")
	material.roughness = 0.94
	surface.set_material(material)
	return surface.commit()


func _build_rocks(parent: Node3D, key: Vector2i) -> void:
	var transforms: Array[Transform3D] = []
	var colors: Array[Color] = []
	for side in [-1, 1]:
		for depth in [-1, 1]:
			var point := Vector3(side * 53, 0, depth * 51)
			point.y = ground_height(key, point) - 2
			var height := 21.0 + float(_seed(key + Vector2i(side, depth)) % 16)
			var basis := Basis.IDENTITY.scaled(Vector3(7, height, 8))
			transforms.append(Transform3D(basis, point))
			colors.append(Color.WHITE)
			var body := _structure(parent, "KarstCollision", _rock_collision, point)
			body.basis = basis
	_nature.batch_group(parent, "KarstSpiredRidges", _rock_mesh, transforms, colors, false)


func _build_grove(region: Node3D, key: Vector2i) -> void:
	var rng := RandomNumberGenerator.new()
	rng.seed = _seed(key)
	var branches: Array[Transform3D] = []
	var bark: Array[Color] = []
	var leaves: Array[Transform3D] = []
	var colors: Array[Color] = []
	var foliage: Color = LEAF_COLORS[_biome(key)]
	var points: Array[Vector3] = [
		Vector3(-17, 0, -8),
		Vector3(17, 0, -8),
		Vector3(-17, 0, 24),
		Vector3(17, 0, 26),
		Vector3(-25, 0, -20),
		Vector3(25, 0, -10)
	]
	for index in range(44):
		var point := Vector3(rng.randf_range(-60, 60), 0, rng.randf_range(-60, 60))
		if (
			absf(point.x) < 37 and absf(point.z) < 43
			or absf(point.x) < 12
			or absf(point.z - 12) < 12
		):
			continue
		points.append(point)
	for point in points:
		point.y = ground_height(key, point)
		var height := rng.randf_range(5.5, 10.0)
		var crown := point + Vector3(rng.randf_range(-1, 1), height, 0)
		branches.append(_nature.branch_transform(point, crown, height * 0.034))
		bark.append(Color("87775e"))
		for arm in range(5):
			var angle := arm * TAU / 5 + rng.randf()
			var end := crown + Vector3(cos(angle) * 2.7, rng.randf_range(-1, 1.6), sin(angle) * 2.7)
			branches.append(_nature.branch_transform(crown - Vector3.UP * 2.1, end, 0.12))
			bark.append(Color("9a8b70"))
			for cluster in range(9):
				var center := (
					end
					+ Vector3(
						rng.randf_range(-1.5, 1.5),
						rng.randf_range(-0.5, 1.1),
						rng.randf_range(-1.5, 1.5)
					)
				)
				var basis := Basis.from_euler(Vector3(0.12, rng.randf() * TAU, 0.1))
				leaves.append(Transform3D(basis.scaled(Vector3(2.6, 1.8, 2.6)), center))
				colors.append(foliage.lerp(Color("d2d9a9"), rng.randf() * 0.3))
	if not branches.is_empty():
		_nature.batch_group(region, "ExpeditionBoughs", _nature._bark_mesh(), branches, bark, false)
		_nature.batch_group(
			region, "ExpeditionCanopies", _nature._atlas_mesh(0), leaves, colors, true
		)


func _build_gardens(region: Node3D, key: Vector2i) -> void:
	var rng := RandomNumberGenerator.new()
	rng.seed = _seed(key) + 192
	var leaves: Array[Transform3D] = []
	var greens: Array[Color] = []
	var blooms: Array[Transform3D] = []
	var colors: Array[Color] = []
	for index in range(320):
		var side := -1 if index % 2 == 0 else 1
		var point := Vector3(side * rng.randf_range(4.8, 7.7), 0, rng.randf_range(-10, 28))
		if point.z > 7.2 and point.z < 18.0:
			continue
		point.y = ground_height(key, point)
		var size := rng.randf_range(0.55, 1.15)
		var basis := Basis.from_euler(Vector3(0, rng.randf() * TAU, 0)).scaled(
			Vector3(size, size, size)
		)
		leaves.append(Transform3D(basis, point + Vector3.UP * size * 0.35))
		greens.append(Color("59834d").lerp(Color("aec37e"), rng.randf() * 0.6))
		if index % 3 == 0:
			blooms.append(
				Transform3D(basis.scaled(Vector3(0.7, 0.9, 0.7)), point + Vector3.UP * 0.55)
			)
			colors.append(Color("e5bad2").lerp(Color("eee1b0"), rng.randf()))
	_nature.batch_group(
		region, "PilgrimGardenFerns", _nature._atlas_mesh(2, 2), leaves, greens, true
	)
	_nature.batch_group(
		region, "PilgrimGardenFlowers", _nature._atlas_mesh(1, 2), blooms, colors, true
	)
