extends Node3D
## Composed original market and ceremonial props, batched in small spatial cells.

const PALETTE := preload("res://scripts/architectural_palette.gd")
const CELL_SIZE := 24.0

var _records: Dictionary = {}
var _modules: Dictionary = {}
var _meshes: Dictionary = {}
var _built := false


func build(_world: Node3D) -> void:
	if _built:
		return
	_built = true
	name = "CelestialDistrict"
	_make_meshes()
	_market()
	_ceremonial_garden()
	_waterfront()
	_terrace()
	_flush()
	apply_quality("balanced")


func apply_quality(preset: String) -> void:
	var distance := 105.0 if preset == "performance" else 155.0
	if preset == "high":
		distance = 210.0
	for item in get_children():
		if item is MultiMeshInstance3D:
			item.visibility_range_end = distance
			item.visible = preset != "performance" or not item.get_meta("tiny_detail", false)


func _make_meshes() -> void:
	var cord := CylinderMesh.new()
	cord.top_radius = 1.0
	cord.bottom_radius = 1.0
	cord.height = 1.0
	cord.radial_segments = 6
	cord.rings = 1
	cord.material = PALETTE.material_for("Timber")
	_meshes["cord"] = cord
	var pole := cord.duplicate()
	pole.material = PALETTE.material_for("Gold")
	_meshes["gold_rod"] = pole
	var lantern := SphereMesh.new()
	lantern.radius = 0.23
	lantern.height = 0.50
	lantern.radial_segments = 12
	lantern.rings = 6
	lantern.material = PALETTE.material_for("Paper")
	_meshes["lantern"] = lantern
	var cap := CylinderMesh.new()
	cap.top_radius = 0.14
	cap.bottom_radius = 0.14
	cap.height = 0.07
	cap.radial_segments = 10
	cap.rings = 1
	cap.material = PALETTE.material_for("Gold")
	_meshes["cap"] = cap
	var fruit := SphereMesh.new()
	fruit.radius = 0.09
	fruit.height = 0.18
	fruit.radial_segments = 8
	fruit.rings = 4
	fruit.material = PALETTE.material_for("Gold")
	_meshes["fruit"] = fruit
	var leaf_material := StandardMaterial3D.new()
	leaf_material.resource_name = "OriginalPottedGreenery"
	leaf_material.albedo_color = Color("4d7956")
	leaf_material.roughness = 0.96
	leaf_material.cull_mode = BaseMaterial3D.CULL_DISABLED
	_meshes["leaf"] = _leaf_mesh(leaf_material)
	var flower_material := leaf_material.duplicate()
	flower_material.resource_name = "OriginalPottedBlossom"
	flower_material.albedo_color = Color("eaa6aa")
	_meshes["flower"] = _flower_mesh(flower_material)


func _market() -> void:
	for side in [-1.0, 1.0]:
		_stall(Vector3(side * 12.4, 0.02, -0.5), -side * PI / 2)
		_stall(Vector3(side * 17.8, 0.02, 11), -side * PI / 2)
		_stall(Vector3(side * 11.8, 0.02, 17.0), -side * PI / 2)
		_lantern_string(Vector3(side * 16.0, 4.0, 0), Vector3(side * 16.0, 4.0, 15))
		_lantern_string(Vector3(side * 9.0, 3.8, 14), Vector3(side * 14.8, 3.8, 19))


func _stall(location: Vector3, yaw: float) -> void:
	_place("market_stall", location, 1.0, yaw)
	var frame := Transform3D(Basis(Vector3.UP, yaw), location)
	for column in range(5):
		for row in range(3):
			var point := frame * Vector3(-0.95 + column * 0.19, 1.06, 0.67 + row * 0.14)
			_queue("fruit", Transform3D(Basis.IDENTITY, point), true)
	for index in range(3):
		var point := frame * Vector3(0.35 + index * 0.23, 1.08, 0.75)
		_segment("gold_rod", point, point + frame.basis * Vector3(0.07, 0, 0.26), 0.055, true)


func _ceremonial_garden() -> void:
	for side in [-1.0, 1.0]:
		_place("stone_guardian", Vector3(side * 8.9, 0.01, -8.5), 1.15)
		_place("incense_burner", Vector3(side * 9.3, 0.01, -13.1), 0.9)
		for z in [-6.0, 13.0]:
			_planter(Vector3(side * 9.5, 0.02, z))
		_planter(Vector3(side * 17.3, 0.12, -14.6), 1.1)
		_planter(Vector3(side * 18.3, 0.02, 17.6), 1.15)
		# Keep the entire central ceremonial axis open, including the sanctuary.
		for x in [side * 9.2, side * 11.2]:
			_place("balustrade", Vector3(x, 0.01, 19.6))
	_planter(Vector3(11.9, 0.02, 0.0))
	_planter(Vector3(-11.0, 0.02, -2.0))


func _waterfront() -> void:
	# No rail crosses the bridge or its westward approach.
	for z in [-15.2, 15.2]:
		for x in [-44.0, -42.0, -40.0, -38.0, -36.0, -34.0]:
			_place("balustrade", Vector3(x, 0.01, z))
		for x in [-25.2, -42.6]:
			_planter(Vector3(x, 0.02, z), 0.9)


func _terrace() -> void:
	# The world owns the stair collision and its side rails. These edge the upper deck.
	for x in [39.0, 41.0, 43.0, 45.0]:
		_place("balustrade", Vector3(x, 10.0, -29.2))
	for x in [39.0, 41.0, 43.0, 45.0, 47.0, 49.0, 51.0, 53.0]:
		_place("balustrade", Vector3(x, 10.0, -48.8))
	for z in [-31.0, -33.0, -35.0, -37.0, -39.0, -41.0, -43.0, -45.0, -47.0]:
		_place("balustrade", Vector3(38.2, 10.0, z), 1.0, PI / 2)
		_place("balustrade", Vector3(53.8, 10.0, z), 1.0, PI / 2)
	for location in [Vector3(40, 10, -32), Vector3(52, 10, -32)]:
		_planter(location)
	_place("incense_burner", Vector3(40.5, 10.0, -38.5), 0.8)


func _planter(location: Vector3, size_value: float = 1.0) -> void:
	_place("planter", location, size_value)
	for index in range(18):
		var angle := index * 2.399963
		var spread := 0.11 + 0.04 * (index % 4)
		var tip := location + Vector3(sin(angle) * spread, 0.61, cos(angle) * spread) * size_value
		var basis := Basis(Vector3.UP, angle).scaled(Vector3.ONE * size_value)
		_queue("leaf", Transform3D(basis, tip))
		if index % 3 == 0:
			var blossom := tip + basis * Vector3(0, 0.30, 0.27)
			_queue("flower", Transform3D(basis, blossom), true)


func _lantern_string(start: Vector3, finish: Vector3) -> void:
	for anchor in [start, finish]:
		_segment("cord", Vector3(anchor.x, 0, anchor.z), anchor + Vector3.UP * 0.12, 0.055)
		_queue("cap", Transform3D(Basis.IDENTITY, anchor + Vector3.UP * 0.16))
	var previous := start
	for index in range(1, 13):
		var weight := index / 12.0
		var next := start.lerp(finish, weight) - Vector3.UP * sin(weight * PI) * 0.48
		_segment("cord", previous, next, 0.014)
		if index % 2 == 1:
			_segment("gold_rod", next, next - Vector3.UP * 0.18, 0.014)
			var center := next - Vector3.UP * 0.42
			_queue("lantern", Transform3D(Basis.IDENTITY, center))
			for height in [-0.25, 0.25]:
				_queue("cap", Transform3D(Basis.IDENTITY, center + Vector3.UP * height))
			_segment("gold_rod", center - Vector3.UP * 0.29, center - Vector3.UP * 0.52, 0.022)
		previous = next


func _leaf_mesh(surface: Material) -> ArrayMesh:
	var builder := SurfaceTool.new()
	builder.begin(Mesh.PRIMITIVE_TRIANGLES)
	builder.set_material(surface)
	var centers := [Vector3.ZERO, Vector3(0, 0.23, 0.18), Vector3(0, 0.31, 0.43)]
	for index in range(2):
		var a: Vector3 = centers[index]
		var b: Vector3 = centers[index + 1]
		var width_a := 0.018 if index == 0 else 0.105
		var width_b := 0.105 if index == 0 else 0.008
		for point in [
			a - Vector3.RIGHT * width_a,
			b - Vector3.RIGHT * width_b,
			b + Vector3.RIGHT * width_b,
			a - Vector3.RIGHT * width_a,
			b + Vector3.RIGHT * width_b,
			a + Vector3.RIGHT * width_a
		]:
			builder.add_vertex(point)
	builder.generate_normals()
	return builder.commit()


func _flower_mesh(surface: Material) -> ArrayMesh:
	var builder := SurfaceTool.new()
	builder.begin(Mesh.PRIMITIVE_TRIANGLES)
	builder.set_material(surface)
	for index in range(5):
		var angle := index * TAU / 5
		var forward := Vector3(sin(angle), 0, cos(angle))
		var side := Vector3(forward.z, 0, -forward.x)
		builder.add_vertex(Vector3(0, 0.035, 0))
		builder.add_vertex(forward * 0.14 - side * 0.07)
		builder.add_vertex(forward * 0.18 + side * 0.07)
	builder.generate_normals()
	return builder.commit()


func _segment(key: String, start: Vector3, finish: Vector3, radius: float, tiny := false) -> void:
	var direction := (finish - start).normalized()
	var right := Vector3.RIGHT
	if absf(direction.dot(Vector3.UP)) < 0.98:
		right = Vector3.UP.cross(direction).normalized()
	var basis := Basis(
		right * radius, direction * start.distance_to(finish), right.cross(direction) * radius
	)
	_queue(key, Transform3D(basis, (start + finish) * 0.5), tiny)


func _place(label: String, point: Vector3, size_value := 1.0, yaw := 0.0) -> void:
	if not _modules.has(label):
		var path := "res://assets/models/celestial/%s.glb" % label
		if not ResourceLoader.exists(path):
			push_error("Missing celestial district asset: " + path)
			return
		var prototype: Node3D = load(path).instantiate()
		var surfaces: Array = []
		for source in prototype.find_children("*", "MeshInstance3D", true, false):
			var local: Transform3D = source.transform
			var ancestor := source.get_parent()
			while ancestor is Node3D:
				local = ancestor.transform * local
				ancestor = ancestor.get_parent()
			var mesh: Mesh = source.mesh.duplicate()
			for index in range(mesh.get_surface_count()):
				var original := mesh.surface_get_material(index)
				if original != null:
					mesh.surface_set_material(index, PALETTE.material_for(original.resource_name))
			surfaces.append({"mesh": mesh, "local": local})
		prototype.free()
		_modules[label] = surfaces
	var transform_value := Transform3D(
		Basis(Vector3.UP, yaw).scaled(Vector3.ONE * size_value), point
	)
	for index in range(_modules[label].size()):
		var key := label + str(index)
		_meshes[key] = _modules[label][index].mesh
		_queue(key, transform_value * _modules[label][index].local)


func _queue(key: String, transform_value: Transform3D, tiny := false) -> void:
	var cell := Vector2i(
		floori(transform_value.origin.x / CELL_SIZE), floori(transform_value.origin.z / CELL_SIZE)
	)
	var group := "%s_%d_%d_%s" % [key, cell.x, cell.y, str(tiny)]
	if not _records.has(group):
		_records[group] = {"mesh": _meshes[key], "transforms": [], "tiny": tiny}
	_records[group].transforms.append(transform_value)


func _flush() -> void:
	for key in _records:
		var record: Dictionary = _records[key]
		var multi := MultiMesh.new()
		multi.transform_format = MultiMesh.TRANSFORM_3D
		multi.mesh = record.mesh
		multi.instance_count = record.transforms.size()
		for index in range(multi.instance_count):
			multi.set_instance_transform(index, record.transforms[index])
		var item := MultiMeshInstance3D.new()
		item.name = "Dressing_" + key
		item.multimesh = multi
		item.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
		item.set_meta("tiny_detail", record.tiny)
		# Keep CPU placements available to route validation: the headless Dummy
		# rendering server cannot read back MultiMesh transforms from GPU storage.
		item.set_meta("instance_transforms", record.transforms)
		add_child(item)
	_records.clear()
