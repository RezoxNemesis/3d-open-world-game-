extends Node3D
## Three original, explicitly mutable mountain formations with real convex bodies.

signal changed

const LOCATIONS := {
	"crag_east": Vector2(100, 35), "crag_north": Vector2(118, 12), "crag_ridge": Vector2(95, -14)
}
const DEBRIS_LIMIT := 24
const DEBRIS_LIFETIME := 3.6
var targets: Dictionary = {}
var debris: Array[RigidBody3D] = []
var shockwaves: Array[MeshInstance3D] = []
var _destroyed: Array[String] = []
var _world: Node3D
var _stone: StandardMaterial3D
var _gold: StandardMaterial3D
var _rock_meshes: Array[ArrayMesh] = []
var _debris_mesh: ArrayMesh


func build(world: Node3D) -> void:
	_world = world
	name = "DestructibleMountains"
	_stone = StandardMaterial3D.new()
	_stone.resource_name = "OriginalBreakableKarst"
	_stone.vertex_color_use_as_albedo = true
	_stone.albedo_texture = preload("res://assets/materials/landscape_karst_original.png")
	_stone.normal_enabled = true
	_stone.normal_texture = preload("res://assets/materials/landscape_karst_original_normal.png")
	_stone.normal_scale = 0.55
	_stone.roughness = 0.95
	_stone.texture_filter = BaseMaterial3D.TEXTURE_FILTER_LINEAR_WITH_MIPMAPS_ANISOTROPIC
	_gold = preload("res://scripts/architectural_palette.gd").material_for("Gold")
	for index in range(3):
		_rock_meshes.append(_rock_mesh(index))
	_debris_mesh = _rock_mesh(4)
	for id in LOCATIONS:
		_build_formation(id)


func _build_formation(id: String) -> void:
	if targets.has(id):
		return
	var location: Vector2 = LOCATIONS[id]
	var height := 0.0
	if _world.has_method("terrain_height"):
		height = _world.terrain_height(location.x, location.y)
	var target := Node3D.new()
	target.name = id
	target.position = Vector3(location.x, height - 0.3, location.y)
	target.set_meta("formation_id", id)
	add_child(target)
	var index: int = LOCATIONS.keys().find(id)
	for part in range(3):
		var dimensions := Vector3(7.5 - part * 1.1, 18.0 + index * 2.0 - part * 2.3, 6.7 - part)
		var offset := Vector3((part - 1) * 4.3, 0, sin(part * 2.4) * 2.7)
		var mesh := MeshInstance3D.new()
		mesh.name = "RockVisual" + str(part)
		mesh.mesh = _rock_meshes[(index + part) % 3]
		mesh.scale = dimensions
		mesh.position = offset
		mesh.material_override = _stone
		mesh.visibility_range_end = 230.0
		mesh.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
		target.add_child(mesh)
		var body := StaticBody3D.new()
		body.name = "RockBody" + str(part)
		body.position = offset
		var collision := CollisionShape3D.new()
		var convex := ConvexPolygonShape3D.new()
		var points := mesh.mesh.get_faces()
		for vertex in range(points.size()):
			points[vertex] *= dimensions
		convex.points = points
		collision.shape = convex
		body.add_child(collision)
		target.add_child(body)
	# A carved gold fracture on the south face marks this specific breakable rock.
	for segment in range(3):
		var mark := MeshInstance3D.new()
		var box := BoxMesh.new()
		box.size = Vector3(0.18, 1.3, 0.18)
		mark.mesh = box
		mark.material_override = _gold
		mark.position = Vector3(-0.3 + (segment % 2) * 0.5, 3 + segment * 1.0, 6.1)
		mark.rotation.z = -0.35 if segment % 2 == 0 else 0.35
		mark.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
		mark.visibility_range_end = 120.0
		target.add_child(mark)
	targets[id] = target


func strike(origin: Vector3, forward: Vector3, reach: float, radius: float) -> bool:
	var selected := ""
	var distance := INF
	for id in targets:
		var offset: Vector3 = targets[id].global_position - origin
		if offset.length() <= reach and offset.normalized().dot(forward) > 0.0:
			if offset.length() < distance:
				distance = offset.length()
				selected = id
	if selected.is_empty():
		return false
	var impact: Vector3 = targets[selected].global_position + Vector3.UP * 4.0
	for id in targets.keys():
		if targets[id].global_position.distance_to(impact - Vector3.UP * 4.0) <= radius:
			_destroy(id, true)
	_shockwave(impact)
	changed.emit()
	return true


func _destroy(id: String, effects: bool) -> void:
	if not targets.has(id):
		return
	var target: Node3D = targets[id]
	var point := target.global_position + Vector3.UP * 4.0
	for body in target.find_children("*", "StaticBody3D", true, false):
		body.collision_layer = 0
		body.collision_mask = 0
	target.hide()
	remove_child(target)
	target.queue_free()
	targets.erase(id)
	if not _destroyed.has(id):
		_destroyed.append(id)
	if effects:
		_spawn_debris(point)


func destroyed_ids() -> Array[String]:
	var result: Array[String] = []
	for id in LOCATIONS:
		if _destroyed.has(id):
			result.append(id)
	return result


func restore_destroyed(ids: Array) -> void:
	for id in LOCATIONS:
		if ids.has(id):
			_destroy(id, false)
		elif _destroyed.has(id):
			_destroyed.erase(id)
			_build_formation(id)
	_clear_effects()


func _spawn_debris(point: Vector3) -> void:
	for index in range(8):
		if debris.size() >= DEBRIS_LIMIT:
			var oldest: RigidBody3D = debris.pop_front()
			_remove_effect(oldest)
		var chunk := RigidBody3D.new()
		chunk.name = "ShortLivedRockDebris"
		chunk.collision_layer = 4
		chunk.collision_mask = 1
		chunk.mass = 2.0
		chunk.set_meta("age", 0.0)
		var angle := index * 2.399963
		chunk.position = point + Vector3(sin(angle) * 2.2, index * 0.18, cos(angle) * 2.2)
		var mesh := MeshInstance3D.new()
		mesh.mesh = _debris_mesh
		mesh.scale = Vector3(0.65, 1.2, 0.8)
		mesh.material_override = _stone
		mesh.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
		chunk.add_child(mesh)
		var collider := CollisionShape3D.new()
		var shape := BoxShape3D.new()
		shape.size = Vector3(1.0, 1.2, 1.1)
		collider.shape = shape
		collider.position.y = 0.6
		chunk.add_child(collider)
		add_child(chunk)
		chunk.linear_velocity = Vector3(sin(angle) * 7, 8 + index * 0.6, cos(angle) * 7)
		chunk.angular_velocity = Vector3(2, index * 0.4, 1.5)
		debris.append(chunk)


func _shockwave(point: Vector3) -> void:
	var wave := MeshInstance3D.new()
	var torus := TorusMesh.new()
	torus.inner_radius = 0.88
	torus.outer_radius = 1.0
	torus.rings = 32
	torus.ring_segments = 5
	wave.mesh = torus
	wave.material_override = _gold
	wave.position = point
	wave.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	wave.set_meta("age", 0.0)
	add_child(wave)
	shockwaves.append(wave)


func _process(delta: float) -> void:
	for chunk in debris.duplicate():
		var age: float = chunk.get_meta("age") + delta
		chunk.set_meta("age", age)
		if age >= DEBRIS_LIFETIME:
			debris.erase(chunk)
			_remove_effect(chunk)
	for wave in shockwaves.duplicate():
		var age: float = wave.get_meta("age") + delta
		wave.set_meta("age", age)
		wave.scale = Vector3(1 + age * 24, 0.12, 1 + age * 24)
		if age >= 0.65:
			shockwaves.erase(wave)
			_remove_effect(wave)


func _clear_effects() -> void:
	for item in debris + shockwaves:
		_remove_effect(item)
	debris.clear()
	shockwaves.clear()


func _remove_effect(item: Node3D) -> void:
	if item is RigidBody3D:
		item.collision_layer = 0
		item.collision_mask = 0
	remove_child(item)
	item.queue_free()


func _rock_mesh(seed_value: int) -> ArrayMesh:
	var surface := SurfaceTool.new()
	surface.begin(Mesh.PRIMITIVE_TRIANGLES)
	var rings: Array[PackedVector3Array] = []
	for level in range(5):
		var ring := PackedVector3Array()
		var y: float = [0.0, 0.12, 0.43, 0.76, 1.0][level]
		var radius: float = [0.94, 1.0, 0.84, 0.58, 0.13][level]
		for side in range(10):
			var angle := side * TAU / 10
			var irregular := 1 + sin(side * 3.71 + seed_value * 2.13 + level) * 0.13
			ring.append(
				Vector3(cos(angle) * radius * irregular, y, sin(angle) * radius * irregular)
			)
		rings.append(ring)
	for level in range(4):
		for side in range(10):
			var next := (side + 1) % 10
			for vertex in [
				rings[level][side],
				rings[level + 1][side],
				rings[level + 1][next],
				rings[level][side],
				rings[level + 1][next],
				rings[level][next]
			]:
				surface.set_color(Color("859482").lightened(0.06 * sin(side + seed_value)))
				surface.set_uv(Vector2(vertex.x, vertex.y))
				surface.add_vertex(vertex)
	for side in range(10):
		for vertex in [Vector3(0, 1, 0), rings[4][(side + 1) % 10], rings[4][side]]:
			surface.set_uv(Vector2(vertex.x, vertex.z))
			surface.add_vertex(vertex)
	surface.generate_normals()
	return surface.commit()
