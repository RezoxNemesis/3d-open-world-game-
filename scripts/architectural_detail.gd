extends Node3D
## Original near-field ceramic and timber construction, instanced over real module roofs.
## Base imported modules remain the distant LOD. Full-detail counts inspect real index buffers.

const PALETTE := preload("res://scripts/architectural_palette.gd")
const CELL_SIZE := 4.0
const TILE_WIDTH := 0.24
const TILE_LENGTH := 0.36

var _built := false
var _records: Dictionary = {}
var _meshes: Dictionary = {}
var _sources: Array[Node3D] = []
var _roof_checks: Array[Dictionary] = []
var _batches: Array[MultiMeshInstance3D] = []
var _highest_meshes: Dictionary = {}
var _coarse_tile: ArrayMesh


func build(world: Node3D) -> void:
	if _built:
		return
	_built = true
	name = "ArchitecturalDetail"
	_make_meshes()
	# Discover instantiated modules, preserving the actual placed rotation, scale,
	# plinth offset and parent transform rather than copying a second world layout.
	for candidate: Node3D in world.find_children("*", "Node3D", true, false):
		var kind := candidate.scene_file_path.get_file().get_basename()
		var profiles := _profiles(kind)
		if profiles.is_empty() and kind != "covered_bridge":
			continue
		_sources.append(candidate)
		if kind == "covered_bridge":
			_bridge(candidate)
		else:
			for profile: PackedFloat32Array in profiles:
				_roof(candidate, profile)
	_flush()
	apply_quality("balanced")


func apply_quality(preset: String) -> void:
	var range_end := 14.0
	if preset == "high":
		range_end = 30.0
	for batch in _batches:
		batch.visible = preset != "performance"
		batch.visibility_range_end = range_end
		var multi := batch.multimesh
		multi.mesh = _highest_meshes[multi.get_instance_id()]
		if preset != "high" and batch.get_meta("detail_kind", "") == "Tile":
			multi.mesh = _coarse_tile


func full_detail_triangles() -> int:
	var total := 0
	for batch in _batches:
		var multi := batch.multimesh
		if multi == null or multi.mesh == null:
			continue
		# Inspect the retained highest-LOD mesh resource once per real batch.
		# The active Balanced mesh is an alternative, never added to this total.
		var mesh: Mesh = _highest_meshes[multi.get_instance_id()]
		for surface in range(mesh.get_surface_count()):
			var arrays := mesh.surface_get_arrays(surface)
			var indices: PackedInt32Array = arrays[Mesh.ARRAY_INDEX]
			var vertices: PackedVector3Array = arrays[Mesh.ARRAY_VERTEX]
			var corners := indices.size() if not indices.is_empty() else vertices.size()
			total += int(corners / 3) * multi.instance_count
	return total


func _profiles(kind: String) -> Array:
	# Width/depth/ridge/drop are the exact original generator profiles. The last
	# three dimensions are real post/beam footprints for attached timber corbels.
	var profiles: Array = []
	match kind:
		"sanctuary":
			profiles = [
				PackedFloat32Array([13.4, 8.8, 5.52, 1.35, 9.0, 6.10, 3.91]),
				PackedFloat32Array([9.5, 6.6, 8.73, 1.10, 6.6, 4.25, 7.62]),
				PackedFloat32Array([6.25, 4.7, 11.17, 0.87, 3.8, 2.8, 10.27])
			]
		"pavilion", "pavilion_far":
			profiles = [
				PackedFloat32Array([12, 9, 5.4, 1.32, 9.0, 6.1, 3.80]),
				PackedFloat32Array([5.5, 3.1, 6.36, 0.7, 3.3, 1.5, 5.85])
			]
		"gate":
			profiles = [
				PackedFloat32Array([9.2, 3.65, 5.35, 1.02, 6.8, 0.0, 4.05]),
				PackedFloat32Array([4.0, 2.3, 6.17, 0.55, 2.5, 0.85, 5.70])
			]
		"shrine", "fox_shrine":
			profiles = [
				(
					PackedFloat32Array([9, 7, 5.34, 1.16, 8.3, 5.8, 3.92])
					if kind == "fox_shrine"
					else PackedFloat32Array([2.45, 1.82, 2.85, 0.55, 1.44, 0.50, 2.2])
				)
			]
		"residence_near":
			profiles = [
				PackedFloat32Array([12.8, 10.8, 5.15, 1.22, 12.08, 10.6, 3.54]),
				PackedFloat32Array([7.15, 4.20, 6.12, 0.73, 5.45, 2.25, 5.425])
			]
		"pagoda":
			var levels: Array[PackedFloat32Array] = []
			for level in range(5):
				var top := 2.59 + level * 2.67
				var size_value := 4.55 - level * 0.49
				levels.append(
					PackedFloat32Array(
						[
							7.8 - level * 0.68,
							6.9 - level * 0.61,
							top + 0.91,
							0.9 - level * 0.075,
							size_value,
							size_value,
							top
						]
					)
				)
			profiles = levels
	return profiles


func _roof_point(profile: PackedFloat32Array, u: float, t: float, hip: bool, end: float) -> Vector3:
	var half_width := profile[0] * 0.5
	var half_depth := profile[1] * 0.5
	var ridge_half := maxf(half_width - half_depth * 0.72, profile[0] * 0.16)
	var x: float
	var z: float
	if hip:
		x = end * (ridge_half + (half_width - ridge_half) * t)
		z = -half_depth * u * t
	else:
		x = u * (ridge_half + (half_width - ridge_half) * t)
		z = -end * half_depth * t
	var height := profile[2] - profile[3] * (1.68 * t - 0.68 * t * t)
	height += 0.52 * pow(absf(x) / half_width, 5.0) * pow(absf(z) / half_depth, 3.0)
	return Vector3(x, height, z)


func _roof(module: Node3D, profile: PackedFloat32Array) -> void:
	var scale_value := module.global_basis.get_scale().x
	var local_frame := global_transform.affine_inverse() * module.global_transform
	var half_width := profile[0] * 0.5
	var ridge_half := maxf(half_width - profile[1] * 0.36, profile[0] * 0.16)
	for hip in [false, true]:
		var run := half_width - ridge_half if hip else profile[1] * 0.5
		var rows := maxi(2, ceili(Vector2(run, profile[3]).length() * scale_value / 0.32))
		for end in [-1.0, 1.0]:
			for row in range(rows):
				var t := (row + 0.5) / rows
				var span := (
					profile[1] * t if hip else 2.0 * (ridge_half + (half_width - ridge_half) * t)
				)
				var columns := maxi(1, ceili(span * scale_value / 0.26))
				var spacing := span / columns
				if spacing * scale_value < 0.18:
					continue
				for column in range(columns):
					var u := -1.0 + (column + 0.5) * 2.0 / columns
					var point := _roof_point(profile, u, t, hip, end)
					var cross_axis := (
						(_roof_point(profile, u + 0.001, t, hip, end) - point).normalized()
					)
					var along := _roof_point(profile, u, t + 0.001, hip, end) - point
					var along_axis := along.normalized()
					var normal := along_axis.cross(cross_axis).normalized()
					if normal.y < 0.0:
						normal = -normal
					cross_axis = normal.cross(along_axis).normalized()
					# Traditional lapped courses overlap generously. The allowance also
					# covers the changing column count across each trapezoidal slope.
					var tile_length := along.length() * 1300.0 / rows + 0.032 / scale_value
					var basis := Basis(
						cross_axis * (spacing * 1.075 / TILE_WIDTH),
						normal / scale_value,
						along_axis * (tile_length / TILE_LENGTH)
					)
					var placement := (
						local_frame * Transform3D(basis, point + normal * (0.055 / scale_value))
					)
					_queue("Tile", placement, 0.94 + float((column + row * 7) % 7) * 0.013)
					if row == rows / 2 and column == columns / 2:
						_roof_checks.append({"module": module, "point": point, "normal": normal})
			if not hip:
				_rafters(module, local_frame, profile, end, scale_value)
	_joinery(local_frame, profile, scale_value)


func _rafters(
	_module: Node3D, frame: Transform3D, profile: PackedFloat32Array, end: float, scale_value: float
) -> void:
	var count := maxi(2, floori(profile[0] * scale_value / 0.55))
	for column in range(1, count):
		var u := -1.0 + 2.0 * column / count
		for segment in range(4):
			var start := _roof_point(profile, u, 0.48 + segment * 0.13, false, end)
			var finish := _roof_point(profile, u, 0.48 + (segment + 1) * 0.13, false, end)
			start.y -= 0.15 / scale_value
			finish.y -= 0.15 / scale_value
			_segment("Rafter", frame, start, finish, 1.0 / scale_value)


func _joinery(frame: Transform3D, profile: PackedFloat32Array, scale_value: float) -> void:
	for end in [-1.0, 1.0]:
		var z: float = end * profile[5] * 0.5
		for column in [-1.0, 0.0, 1.0]:
			if column == 0.0 and profile[4] < 3.0:
				continue
			var x: float = column * profile[4] * 0.5
			var point := Vector3(x, profile[6] - 0.27 / scale_value, z)
			for layer in range(2):
				var basis := Basis(Vector3.UP, PI if end < 0 else 0.0)
				basis = basis.scaled(Vector3.ONE / scale_value)
				_queue(
					"Corbel",
					frame * Transform3D(basis, point + Vector3(0, layer * 0.13 / scale_value, 0))
				)
			var cap := point + Vector3(0, -0.11 / scale_value, end * 0.18 / scale_value)
			_queue(
				"Fixing", frame * Transform3D(Basis.IDENTITY.scaled(Vector3.ONE / scale_value), cap)
			)


func _bridge(module: Node3D) -> void:
	var frame := global_transform.affine_inverse() * module.global_transform
	var scale_value := module.global_basis.get_scale().x
	var columns := ceili(7.84 * scale_value / 0.25)
	var rows := ceili(2.70 * scale_value / 0.32)
	for end in [-1.0, 1.0]:
		for row in range(rows):
			var t := (row + 0.5) / rows
			var point := Vector3(end * 2.52 * t, 4.0 - 1.15 * t + 0.31 * pow(t, 4.0), 0)
			var along := Vector3(end * 2.52, -1.15 + 1.24 * pow(t, 3.0), 0).normalized()
			var normal := along.cross(Vector3.BACK).normalized()
			if normal.y < 0.0:
				normal = -normal
			var cross_axis := normal.cross(along).normalized()
			for column in range(columns):
				point.z = -3.92 + (column + 0.5) * 7.84 / columns
				var basis := Basis(
					cross_axis * (7.84 / columns / TILE_WIDTH),
					normal / scale_value,
					along * (2.7 / rows / TILE_LENGTH)
				)
				_queue("Tile", frame * Transform3D(basis, point + normal * 0.055 / scale_value))
				if row == rows / 2 and column == columns / 2:
					_roof_checks.append({"module": module, "point": point, "normal": normal})
	for z in [-3.8, 0.0, 3.8]:
		for end in [-1.0, 1.0]:
			for part in range(4):
				var a := float(part) / 4.0
				var b := float(part + 1) / 4.0
				_segment(
					"Rafter",
					frame,
					Vector3(end * 2.52 * a, 3.85 - 1.15 * a + 0.31 * pow(a, 4.0), z),
					Vector3(end * 2.52 * b, 3.85 - 1.15 * b + 0.31 * pow(b, 4.0), z),
					1.0 / scale_value
				)
	_joinery(frame, PackedFloat32Array([5.04, 7.84, 4, 1, 4.8, 7.6, 2.94]), scale_value)


func _segment(
	kind: String, frame: Transform3D, start: Vector3, finish: Vector3, scale_value: float
) -> void:
	var along := finish - start
	var z := along.normalized()
	var x := Vector3.UP.cross(z).normalized()
	var y := z.cross(x).normalized()
	var basis := Basis(x * scale_value, y * scale_value, z * along.length())
	_queue(kind, frame * Transform3D(basis, (start + finish) * 0.5))


func _queue(kind: String, placement: Transform3D, tint: float = 1.0) -> void:
	var point := placement.origin
	var cell := Vector3i(
		floori(point.x / CELL_SIZE), floori(point.y / CELL_SIZE), floori(point.z / CELL_SIZE)
	)
	var key := "%s_%d_%d_%d" % [kind, cell.x, cell.y, cell.z]
	if not _records.has(key):
		_records[key] = {"kind": kind, "cell": cell, "transforms": [], "colors": []}
	_records[key]["transforms"].append(placement)
	_records[key]["colors"].append(Color(tint, tint, tint))


func _flush() -> void:
	for key: String in _records:
		var record: Dictionary = _records[key]
		var offset := Vector3(record["cell"]) * CELL_SIZE + Vector3.ONE * CELL_SIZE * 0.5
		var multi := MultiMesh.new()
		multi.transform_format = MultiMesh.TRANSFORM_3D
		multi.use_colors = true
		multi.mesh = _meshes[record["kind"]]
		_highest_meshes[multi.get_instance_id()] = multi.mesh
		multi.instance_count = record["transforms"].size()
		var placements: Array[Transform3D] = []
		var bounds := AABB()
		for index in range(multi.instance_count):
			var placement: Transform3D = record["transforms"][index]
			placement.origin -= offset
			placements.append(placement)
			multi.set_instance_transform(index, placement)
			multi.set_instance_color(index, record["colors"][index])
			var transformed := placement * multi.mesh.get_aabb()
			bounds = transformed if index == 0 else bounds.merge(transformed)
		multi.custom_aabb = bounds
		var batch := MultiMeshInstance3D.new()
		batch.name = "Detail" + key
		batch.position = offset
		batch.multimesh = multi
		batch.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
		batch.set_meta("detail_kind", record["kind"])
		batch.set_meta("instance_transforms", placements)
		add_child(batch)
		_batches.append(batch)
	_records.clear()


func _make_meshes() -> void:
	var roof := PALETTE.material_for("Roof").duplicate() as StandardMaterial3D
	roof.resource_name = "OriginalArchitecturalCeramic"
	roof.vertex_color_use_as_albedo = true
	var timber := PALETTE.material_for("Timber").duplicate() as StandardMaterial3D
	timber.vertex_color_use_as_albedo = true
	var gold := PALETTE.material_for("Gold").duplicate() as StandardMaterial3D
	gold.vertex_color_use_as_albedo = true
	_meshes["Tile"] = _tile_mesh(roof)
	_coarse_tile = _tile_mesh(roof, 4, 1)
	_meshes["Rafter"] = _rafter_mesh(timber)
	_meshes["Corbel"] = _corbel_mesh(timber)
	_meshes["Fixing"] = _fixing_mesh(gold)


func _triangle(builder: SurfaceTool, a: Vector3, b: Vector3, c: Vector3) -> void:
	var normal := (b - a).cross(c - a).normalized()
	for point in [a, b, c]:
		builder.set_normal(normal)
		if absf(normal.y) >= maxf(absf(normal.x), absf(normal.z)):
			builder.set_uv(Vector2(point.x, point.z) * 3.0)
		elif absf(normal.x) > absf(normal.z):
			builder.set_uv(Vector2(point.z, point.y) * 3.0)
		else:
			builder.set_uv(Vector2(point.x, point.y) * 3.0)
		builder.add_vertex(point)


func _quad(builder: SurfaceTool, a: Vector3, b: Vector3, c: Vector3, d: Vector3) -> void:
	_triangle(builder, a, b, c)
	_triangle(builder, a, c, d)


func _finish_mesh(builder: SurfaceTool, material: Material) -> ArrayMesh:
	builder.set_material(material)
	builder.index()
	builder.generate_tangents()
	return builder.commit()


func _tile_point(column: int, row: int, inner: bool, sections: int, rings: int) -> Vector3:
	var across := float(column) / sections
	var along := float(row) / rings
	return Vector3(
		(across - 0.5) * TILE_WIDTH,
		sin(across * PI) * 0.068 + sin(along * PI) * 0.006 - (0.013 if inner else 0.0),
		(along - 0.5) * TILE_LENGTH
	)


func _tile_mesh(material: Material, sections: int = 8, rings: int = 2) -> ArrayMesh:
	var builder := SurfaceTool.new()
	builder.begin(Mesh.PRIMITIVE_TRIANGLES)
	# Eight curved cross-section intervals and three longitudinal stations model
	# a real thick ceramic shell, rolled mouth and lap. No arbitrary subdivision.
	for inner in [false, true]:
		for row in range(rings):
			for column in range(sections):
				var a := _tile_point(column, row, inner, sections, rings)
				var b := _tile_point(column + 1, row, inner, sections, rings)
				var c := _tile_point(column + 1, row + 1, inner, sections, rings)
				var d := _tile_point(column, row + 1, inner, sections, rings)
				if inner:
					_quad(builder, a, b, c, d)
				else:
					_quad(builder, d, c, b, a)
	for column in range(sections):
		for row in [0, rings]:
			var a := _tile_point(column, row, false, sections, rings)
			var b := _tile_point(column + 1, row, false, sections, rings)
			var c := _tile_point(column + 1, row, true, sections, rings)
			var d := _tile_point(column, row, true, sections, rings)
			if row == 0:
				_quad(builder, a, b, c, d)
			else:
				_quad(builder, d, c, b, a)
	for column in [0, sections]:
		for row in range(rings):
			var a := _tile_point(column, row, false, sections, rings)
			var b := _tile_point(column, row + 1, false, sections, rings)
			var c := _tile_point(column, row + 1, true, sections, rings)
			var d := _tile_point(column, row, true, sections, rings)
			if column == sections:
				_quad(builder, a, b, c, d)
			else:
				_quad(builder, d, c, b, a)
	return _finish_mesh(builder, material)


func _rafter_mesh(material: Material) -> ArrayMesh:
	var builder := SurfaceTool.new()
	builder.begin(Mesh.PRIMITIVE_TRIANGLES)
	var profile := PackedVector2Array(
		[
			Vector2(-0.04, -0.05),
			Vector2(0.04, -0.05),
			Vector2(0.055, -0.035),
			Vector2(0.055, 0.035),
			Vector2(0.04, 0.05),
			Vector2(-0.04, 0.05),
			Vector2(-0.055, 0.035),
			Vector2(-0.055, -0.035)
		]
	)
	_extrude(builder, profile, 1.0)
	return _finish_mesh(builder, material)


func _corbel_mesh(material: Material) -> ArrayMesh:
	var builder := SurfaceTool.new()
	builder.begin(Mesh.PRIMITIVE_TRIANGLES)
	# Scalloped cloud-arm profile has a stepped mortise and rounded carved ends.
	var profile := PackedVector2Array(
		[
			Vector2(-0.44, 0.17),
			Vector2(-0.36, 0.24),
			Vector2(0.36, 0.24),
			Vector2(0.44, 0.17),
			Vector2(0.40, 0.09),
			Vector2(0.29, 0.05),
			Vector2(0.20, 0.09),
			Vector2(0.11, -0.03),
			Vector2(-0.11, -0.03),
			Vector2(-0.20, 0.09),
			Vector2(-0.29, 0.05),
			Vector2(-0.40, 0.09)
		]
	)
	_extrude(builder, profile, 0.15)
	return _finish_mesh(builder, material)


func _extrude(builder: SurfaceTool, profile: PackedVector2Array, depth: float) -> void:
	if Geometry2D.is_polygon_clockwise(profile):
		profile.reverse()
	var indices := Geometry2D.triangulate_polygon(profile)
	for index in range(0, indices.size(), 3):
		var a := profile[indices[index]]
		var b := profile[indices[index + 1]]
		var c := profile[indices[index + 2]]
		_triangle(
			builder,
			Vector3(a.x, a.y, depth / 2),
			Vector3(b.x, b.y, depth / 2),
			Vector3(c.x, c.y, depth / 2)
		)
		_triangle(
			builder,
			Vector3(c.x, c.y, -depth / 2),
			Vector3(b.x, b.y, -depth / 2),
			Vector3(a.x, a.y, -depth / 2)
		)
	for index in range(profile.size()):
		var a := profile[index]
		var b := profile[(index + 1) % profile.size()]
		_quad(
			builder,
			Vector3(a.x, a.y, -depth / 2),
			Vector3(b.x, b.y, -depth / 2),
			Vector3(b.x, b.y, depth / 2),
			Vector3(a.x, a.y, depth / 2)
		)


func _fixing_mesh(material: Material) -> ArrayMesh:
	var builder := SurfaceTool.new()
	builder.begin(Mesh.PRIMITIVE_TRIANGLES)
	# Small eight-petal raised rosette, with a true chamfered central fastening.
	for petal in range(8):
		var angle := petal * TAU / 8.0
		var a := Vector3(cos(angle - 0.21), sin(angle - 0.21), 0) * 0.075
		var b := Vector3(cos(angle), sin(angle), 0) * 0.12
		var c := Vector3(cos(angle + 0.21), sin(angle + 0.21), 0) * 0.075
		var raised := Vector3(cos(angle) * 0.055, sin(angle) * 0.055, 0.027)
		_triangle(builder, a, b, raised)
		_triangle(builder, b, c, raised)
		_triangle(builder, c, a, raised)
	return _finish_mesh(builder, material)
