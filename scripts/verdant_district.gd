extends Node3D
## Original solid interiors and courtyard structures, batched in small spatial cells.

const PALETTE := preload("res://scripts/architectural_palette.gd")
const CELL_SIZE := 16.0
# Center cells on the hall and shrine rather than splitting their interiors at x=0.
const CELL_OFFSET := Vector2(8.0, 15.0)

var _records: Dictionary = {}
var _modules: Dictionary = {}
var _meshes: Dictionary = {}
var _solid_counts: Dictionary = {}
var _built := false


func build(_world: Node3D) -> void:
	if _built:
		return
	_built = true
	name = "VerdantDistrict"
	_make_meshes()
	_scholar_hall()
	_courtyard_pergolas()
	_fox_shrine_interior()
	_flush()
	apply_quality("balanced")


func apply_quality(preset: String) -> void:
	var distance := 125.0
	if preset == "performance":
		distance = 72.0
	elif preset == "high":
		distance = 190.0
	for item in get_children():
		if item is MultiMeshInstance3D:
			item.visibility_range_end = distance
			if item.get_meta("optional_detail", false):
				item.visibility_range_end = 110.0 if preset == "high" else 30.0
				if preset == "performance":
					item.visibility_range_end = 32.0
				item.visibility_range_end_margin = 2.0
			item.visible = preset != "performance" or not item.get_meta("optional_detail", false)
		elif item is OmniLight3D:
			item.visible = preset != "performance"


func _make_meshes() -> void:
	for label in ["Stone", "Timber", "Gold", "Jade", "Paper", "Cloth"]:
		var box := BoxMesh.new()
		box.size = Vector3.ONE
		box.material = PALETTE.material_for(label)
		_meshes["box_" + label] = box
		var cylinder := CylinderMesh.new()
		cylinder.top_radius = 1.0
		cylinder.bottom_radius = 1.0
		cylinder.height = 1.0
		cylinder.radial_segments = 10
		cylinder.rings = 1
		cylinder.material = PALETTE.material_for(label)
		_meshes["rod_" + label] = cylinder
	var lantern := SphereMesh.new()
	lantern.radius = 0.5
	lantern.height = 1.0
	lantern.radial_segments = 12
	lantern.rings = 6
	lantern.material = PALETTE.material_for("Paper")
	_meshes["lantern"] = lantern
	var bowl := CylinderMesh.new()
	bowl.top_radius = 1.0
	bowl.bottom_radius = 0.65
	bowl.height = 1.0
	bowl.radial_segments = 12
	bowl.rings = 1
	bowl.material = PALETTE.material_for("Jade")
	_meshes["bowl"] = bowl


func _scholar_hall() -> void:
	# This is the existing enterable sanctuary, whose walkable floor is at 1.76m.
	# Furniture sits beside a 1.6m clear center lane through the original entry.
	var floor_y := 1.8
	_place("scholar_desk", Vector3(-2.2, floor_y, -16))
	_solid("ScholarDesk", Vector3(-2.2, floor_y + 0.5, -16), Vector3(2.3, 1.0, 1.1))
	for side in [-1.0, 1.0]:
		for z in [-16.9, -19.25]:
			var point := Vector3(side * 3.85, floor_y, z)
			var yaw: float = -side * PI / 2
			_place("scroll_shelf", point, yaw)
			_solid("ScrollShelfHall", point + Vector3.UP * 1.225, Vector3(2.1, 2.45, 0.7), yaw)
		var screen := Vector3(side * 2.55, floor_y, -20.95)
		_place("lattice_screen", screen)
		_solid("HallScreen", screen + Vector3.UP * 1.225, Vector3(3.0, 2.45, 0.16))
		_hanging_lamp(Vector3(side * 2.7, 4.5, -17.9), 0.85)
		# Raised carved bases support the two ceremonial vases at the rear.
		_vase(Vector3(side * 3.25, floor_y, -20.35), 0.68)
	# A side reading bench and a low stool leave the lore desk's front accessible.
	_bench(Vector3(2.3, floor_y, -16.2), 0.0, "ScholarBench")
	_stool(Vector3(-3.75, floor_y, -15.25))
	# The tabletop composition is geometry: cup, inkstone, brush and scroll ends.
	_cup(Vector3(-1.38, 2.8, -16.2))
	_box(Vector3(-2.5, 2.825, -15.78), Vector3(0.42, 0.05, 0.23), "Jade", true)
	for x in [-2.74, -2.26]:
		_segment("Paper", Vector3(x, 2.88, -15.91), Vector3(x, 2.88, -15.64), 0.045, true)
	_box(Vector3(2.3, floor_y + 0.02, -16.3), Vector3(2.4, 0.035, 3.1), "Cloth")
	for x in [1.13, 3.47]:
		_box(Vector3(x, floor_y + 0.043, -16.3), Vector3(0.035, 0.012, 3.0), "Gold", true)
	_warm_light("ScholarWarmth", Vector3(-2.7, 4.15, -17.9), 3.8, 0.6)


func _courtyard_pergolas() -> void:
	# The existing planted beds support the pergolas. Their posts stand on actual
	# stone shoes; the foliage owner dresses the 4.12m canopy with living wisteria.
	for side in [-1.0, 1.0]:
		var origin := Vector3(side * 13.5, 0.32, 8.0)
		_place("pergola", origin)
		for x in [-2.5, 2.5]:
			for z in [-3.65, 0.0, 3.65]:
				var point := origin + Vector3(x, 0, z)
				_box(point - Vector3.UP * 0.06, Vector3(0.56, 0.12, 0.56), "Stone")
				_solid("PergolaPost", point + Vector3.UP * 1.75, Vector3(0.28, 3.5, 0.28))
		# Long benches occupy the outer garden edge, leaving a generous inner walk.
		_bench(origin + Vector3(side * 1.75, 0, 0), PI / 2, "PergolaBench")
		for z in [-2.4, 2.4]:
			_hanging_lamp(origin + Vector3(0.0, 3.2, z), 0.7)
		# Beds and the porch are off the central axis and the lotus/gate corridors.
		for z in [4.5, 11.5]:
			_planter(Vector3(side * 10.15, 0.0, z), 0.72, "GardenPlanter")


func _fox_shrine_interior() -> void:
	# The route owner supplies the supported 6m terrace and the shrine shell.
	# No decoration crosses its bridge, the offset entry, lore alcove or bell.
	for x in [-37.8, -26.2]:
		var point := Vector3(x, 6, -39.2)
		_place("fox_guardian", point)
		_solid("FoxGuardian", point + Vector3(0.108, 1.07, -0.024), Vector3(1.4, 2.14, 1.54))
	for side in [-1.0, 1.0]:
		var shelf := Vector3(-32 + side * 3.6, 6, -44.0)
		var yaw: float = -side * PI / 2
		_place("scroll_shelf", shelf, yaw)
		_solid("ScrollShelfShrine", shelf + Vector3.UP * 1.225, Vector3(2.1, 2.45, 0.7), yaw)
		var screen := Vector3(-32 + side * 2.55, 6, -46.5)
		_place("lattice_screen", screen)
		_solid("ShrineScreen", screen + Vector3.UP * 1.225, Vector3(3.0, 2.45, 0.16))
		_hanging_lamp(Vector3(-32 + side * 2.75, 9.0, -42.0), 0.85)
		_vase(Vector3(-32 + side * 3.6, 6, -41.5), 0.82)
		_bench(Vector3(-32 + side * 3.55, 6, -45.7), 0.0, "ShrineBench", 0.72)
	# Outer terrace furnishings sit on visible stone pedestals, inside the guards.
	for x in [-39.5, -24.5]:
		for z in [-41.5, -46.7]:
			_planter(Vector3(x, 6, z), 0.9, "TerracePlanter")
		# Supported carved rail accents supplement the route owner's edge guards.
		for z in [-42.8, -45.2]:
			_box(Vector3(x, 6.58, z), Vector3(0.14, 0.12, 1.1), "Timber")
			for offset in [-0.4, 0.0, 0.4]:
				_box(Vector3(x, 6.3, z + offset), Vector3(0.13, 0.6, 0.13), "Timber")
			_box(Vector3(x, 6.66, z), Vector3(0.16, 0.035, 1.15), "Gold", true)
			_solid("TerraceGardenRail", Vector3(x, 6.33, z), Vector3(0.18, 0.66, 1.15))
	_warm_light("ShrineWarmth", Vector3(-32, 9, -43.5), 4.0, 0.55)


func _bench(point: Vector3, yaw: float, label: String, size_value := 1.0) -> void:
	var frame := Transform3D(Basis(Vector3.UP, yaw).scaled(Vector3.ONE * size_value), point)
	_box_frame(frame, Vector3(0, 0.52, 0), Vector3(1.9, 0.14, 0.58), "Timber")
	_box_frame(frame, Vector3(0, 0.60, 0), Vector3(1.7, 0.035, 0.46), "Cloth")
	for x in [-0.7, 0.7]:
		for z in [-0.18, 0.18]:
			_box_frame(frame, Vector3(x, 0.25, z), Vector3(0.13, 0.5, 0.13), "Timber")
		_box_frame(frame, Vector3(x, 0.41, 0), Vector3(0.18, 0.08, 0.65), "Gold", true)
	_solid(label, point + Vector3.UP * 0.30 * size_value, Vector3(1.9, 0.6, 0.58) * size_value, yaw)


func _stool(point: Vector3) -> void:
	_segment("Timber", point + Vector3.UP * 0.12, point + Vector3.UP * 0.48, 0.24)
	_segment("Cloth", point + Vector3.UP * 0.48, point + Vector3.UP * 0.58, 0.31)
	_segment("Gold", point + Vector3.UP * 0.46, point + Vector3.UP * 0.49, 0.3, true)
	_solid("ScholarStool", point + Vector3.UP * 0.29, Vector3(0.62, 0.58, 0.62))


func _hanging_lamp(point: Vector3, size_value: float) -> void:
	_queue(
		"lantern", Transform3D(Basis.IDENTITY.scaled(Vector3(0.42, 0.58, 0.42) * size_value), point)
	)
	for height in [-0.32, 0.32]:
		_segment(
			"Gold",
			point + Vector3.UP * (height - 0.025) * size_value,
			point + Vector3.UP * (height + 0.025) * size_value,
			0.17 * size_value
		)
	_segment(
		"Timber",
		point + Vector3.UP * 0.35 * size_value,
		point + Vector3.UP * 0.72 * size_value,
		0.018 * size_value
	)
	_segment(
		"Cloth",
		point - Vector3.UP * 0.34 * size_value,
		point - Vector3.UP * 0.62 * size_value,
		0.028 * size_value,
		true
	)


func _vase(point: Vector3, size_value: float) -> void:
	_box(point + Vector3.UP * 0.08 * size_value, Vector3(0.65, 0.16, 0.65) * size_value, "Stone")
	_queue(
		"bowl",
		Transform3D(
			Basis.IDENTITY.scaled(Vector3(0.31, 0.72, 0.31) * size_value),
			point + Vector3.UP * 0.50 * size_value
		)
	)
	_segment(
		"Gold",
		point + Vector3.UP * 0.83 * size_value,
		point + Vector3.UP * 0.88 * size_value,
		0.32 * size_value,
		true
	)
	for index in range(4):
		var angle := index * 2.399963
		var stem := point + Vector3.UP * 0.85 * size_value
		var tip := stem + Vector3(sin(angle) * 0.25, 0.45, cos(angle) * 0.25) * size_value
		_segment("Timber", stem, tip, 0.015 * size_value, true)
		_box(tip, Vector3(0.08, 0.12, 0.08) * size_value, "Gold", true)
	_solid(
		"CeremonialVase",
		point + Vector3.UP * 0.4 * size_value,
		Vector3(0.65, 0.8, 0.65) * size_value
	)


func _planter(point: Vector3, size_value: float, label: String) -> void:
	_box(point + Vector3.UP * 0.1 * size_value, Vector3(1.05, 0.2, 1.05) * size_value, "Stone")
	_box(point + Vector3.UP * 0.43 * size_value, Vector3(0.85, 0.5, 0.85) * size_value, "Jade")
	_box(point + Vector3.UP * 0.7 * size_value, Vector3(1.02, 0.09, 1.02) * size_value, "Stone")
	_box(point + Vector3.UP * 0.755 * size_value, Vector3(0.76, 0.03, 0.76) * size_value, "Timber")
	# Compact, solid jade leaves supply a persistent planted silhouette. Detailed
	# botanical growth belongs to nature.gd and may be culled independently.
	for index in range(7):
		var angle := index * 2.399963
		var center := point + Vector3(sin(angle) * 0.18, 0.9, cos(angle) * 0.18) * size_value
		var basis := Basis(Vector3.UP, angle).rotated(Vector3.FORWARD, 0.35)
		_queue(
			"bowl", Transform3D(basis.scaled(Vector3(0.09, 0.42, 0.09) * size_value), center), true
		)
	_solid(label, point + Vector3.UP * 0.37 * size_value, Vector3(1.05, 0.74, 1.05) * size_value)


func _cup(point: Vector3) -> void:
	_queue(
		"bowl",
		Transform3D(Basis.IDENTITY.scaled(Vector3(0.09, 0.18, 0.09)), point + Vector3.UP * 0.09),
		true
	)
	for offset in [-0.045, 0.025]:
		_segment(
			"Timber",
			point + Vector3(offset, 0.04, 0),
			point + Vector3(offset + 0.04, 0.42, 0.04),
			0.012,
			true
		)


func _warm_light(label: String, point: Vector3, radius: float, strength: float) -> void:
	var light := OmniLight3D.new()
	light.name = label
	light.position = point
	light.light_color = Color("ffd5a0")
	light.light_energy = strength
	light.omni_range = radius
	light.shadow_enabled = false
	light.distance_fade_enabled = true
	light.distance_fade_begin = 24.0
	light.distance_fade_length = 8.0
	add_child(light)


func _solid(label: String, point: Vector3, size_value: Vector3, yaw := 0.0) -> void:
	var body := StaticBody3D.new()
	var count: int = _solid_counts.get(label, 0)
	body.name = label if count == 0 else label + str(count)
	_solid_counts[label] = count + 1
	body.position = point
	body.rotation.y = yaw
	var shape := CollisionShape3D.new()
	var box := BoxShape3D.new()
	box.size = size_value
	shape.shape = box
	body.add_child(shape)
	add_child(body)


func _box(point: Vector3, size_value: Vector3, surface: String, optional := false) -> void:
	_queue("box_" + surface, Transform3D(Basis.IDENTITY.scaled(size_value), point), optional)


func _box_frame(
	frame: Transform3D, point: Vector3, size_value: Vector3, surface: String, optional := false
) -> void:
	_queue(
		"box_" + surface, frame * Transform3D(Basis.IDENTITY.scaled(size_value), point), optional
	)


func _segment(
	surface: String, start: Vector3, finish: Vector3, radius: float, optional := false
) -> void:
	var direction := (finish - start).normalized()
	var right := Vector3.RIGHT
	if absf(direction.dot(Vector3.UP)) < 0.98:
		right = Vector3.UP.cross(direction).normalized()
	var basis := Basis(
		right * radius, direction * start.distance_to(finish), right.cross(direction) * radius
	)
	_queue("rod_" + surface, Transform3D(basis, (start + finish) * 0.5), optional)


func _place(label: String, point: Vector3, yaw := 0.0) -> void:
	if not _modules.has(label):
		var path := "res://assets/models/verdant/%s.glb" % label
		if not ResourceLoader.exists(path):
			push_error("Missing original Verdant furnishing: " + path)
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
	var frame := Transform3D(Basis(Vector3.UP, yaw), point)
	for index in range(_modules[label].size()):
		var key := label + str(index)
		_meshes[key] = _modules[label][index].mesh
		_queue(key, frame * _modules[label][index].local, false, label)


func _queue(key: String, placement: Transform3D, optional := false, asset := "") -> void:
	var cell := Vector2i(
		floori((placement.origin.x + CELL_OFFSET.x) / CELL_SIZE),
		floori((placement.origin.z + CELL_OFFSET.y) / CELL_SIZE)
	)
	var group := "%s_%d_%d_%s" % [key, cell.x, cell.y, str(optional)]
	if not _records.has(group):
		_records[group] = {
			"mesh": _meshes[key], "transforms": [], "optional": optional, "asset": asset
		}
	_records[group].transforms.append(placement)


func _flush() -> void:
	for key in _records:
		var record: Dictionary = _records[key]
		var multi := MultiMesh.new()
		multi.transform_format = MultiMesh.TRANSFORM_3D
		multi.mesh = record.mesh
		multi.instance_count = record.transforms.size()
		var bounds: AABB = record.transforms[0] * multi.mesh.get_aabb()
		for index in range(multi.instance_count):
			bounds = bounds.merge(record.transforms[index] * multi.mesh.get_aabb())
		var center := bounds.get_center()
		var to_local := Transform3D(Basis.IDENTITY, -center)
		var local_placements: Array[Transform3D] = []
		for index in range(multi.instance_count):
			var placement: Transform3D = to_local * record.transforms[index]
			multi.set_instance_transform(index, placement)
			local_placements.append(placement)
		multi.custom_aabb = AABB(bounds.position - center, bounds.size)
		var item := MultiMeshInstance3D.new()
		item.name = "Verdant_" + key
		item.position = center
		item.multimesh = multi
		item.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
		item.visibility_range_end_margin = 8.0
		item.set_meta("asset_key", record.asset)
		item.set_meta("optional_detail", record.optional)
		# Preserve world-space placement metadata for existing route inspection.
		# The exact submitted local transforms reconstruct it through item.transform.
		item.set_meta("instance_transforms", record.transforms)
		item.set_meta("local_instance_transforms", local_placements)
		add_child(item)
	_records.clear()
