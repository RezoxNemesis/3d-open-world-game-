extends SceneTree
## Real module transforms, independent index-buffer accounting and roof attachment.

const DETAIL := preload("res://scripts/architectural_detail.gd")

var checks := 0
var failures := 0
var _source_triangles: Dictionary = {}


func check(condition: bool, label: String) -> void:
	checks += 1
	if condition:
		print("PASS: " + label)
	else:
		failures += 1
		push_error("FAIL: " + label)


func _initialize() -> void:
	call_deferred("run")


func run() -> void:
	var world := Node3D.new()
	root.add_child(world)
	_fixture_modules(world)
	var detail := DETAIL.new()
	world.add_child(detail)
	detail.build(world)
	detail.apply_quality("high")
	await process_frame
	var batches := detail.find_children("*", "MultiMeshInstance3D", true, false)
	check(
		detail._sources.size() == 18,
		"all eighteen near district modules receive attached construction"
	)
	check(
		batches.size() > 60 and batches.size() < 900,
		"spatial instancing avoids a scene node for every tile"
	)
	var total := 0
	var kinds: Dictionary = {}
	var instances := 0
	var surfaces := 0
	var valid_attributes := true
	var bounded_cells := true
	var correct_widths := true
	var shadowless := true
	var submitted_matches := true
	var geometry_unique: Dictionary = {}
	for batch: MultiMeshInstance3D in batches:
		var multi := batch.multimesh
		var mesh := multi.mesh
		var kind: String = batch.get_meta("detail_kind", "")
		kinds[kind] = true
		instances += multi.instance_count
		surfaces += mesh.get_surface_count()
		shadowless = (
			shadowless and batch.cast_shadow == GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
		)
		var triangles := 0
		for surface in range(mesh.get_surface_count()):
			var arrays := mesh.surface_get_arrays(surface)
			var vertices: PackedVector3Array = arrays[Mesh.ARRAY_VERTEX]
			var indices: PackedInt32Array = arrays[Mesh.ARRAY_INDEX]
			triangles += (indices.size() if not indices.is_empty() else vertices.size()) / 3
			if geometry_unique.has(mesh.get_instance_id()):
				continue
			var normals: PackedVector3Array = arrays[Mesh.ARRAY_NORMAL]
			var uv: PackedVector2Array = arrays[Mesh.ARRAY_TEX_UV]
			var tangents: PackedFloat32Array = arrays[Mesh.ARRAY_TANGENT]
			valid_attributes = valid_attributes and normals.size() == vertices.size()
			valid_attributes = (
				valid_attributes
				and uv.size() == vertices.size()
				and tangents.size() == vertices.size() * 4
			)
			for index in range(vertices.size()):
				valid_attributes = (
					valid_attributes and vertices[index].is_finite() and normals[index].is_finite()
				)
				valid_attributes = (
					valid_attributes
					and uv[index].is_finite()
					and absf(normals[index].length() - 1.0) < 0.02
				)
			for offset in range(0, indices.size(), 3):
				var a := vertices[indices[offset]]
				var b := vertices[indices[offset + 1]]
				var c := vertices[indices[offset + 2]]
				valid_attributes = valid_attributes and (b - a).cross(c - a).length() > 0.000000001
		geometry_unique[mesh.get_instance_id()] = true
		total += triangles * multi.instance_count
		var placements: Array = batch.get_meta("instance_transforms", [])
		submitted_matches = submitted_matches and placements.size() == multi.instance_count
		for placement: Transform3D in placements:
			var bounds: AABB = placement * mesh.get_aabb()
			bounded_cells = bounded_cells and multi.custom_aabb.grow(0.001).encloses(bounds)
			bounded_cells = bounded_cells and absf(placement.origin.x) <= 2.001
			bounded_cells = (
				bounded_cells
				and absf(placement.origin.y) <= 2.001
				and absf(placement.origin.z) <= 2.001
			)
			if kind == "Tile":
				var width := placement.basis.x.length() * mesh.get_aabb().size.x
				correct_widths = correct_widths and width >= 0.175 and width <= 0.28
	check(
		total >= 1000000,
		"actual index buffers times submitted instances exceed one million architecture triangles"
	)
	check(submitted_matches, "all CPU placement records match the actual submitted instance counts")
	check(
		total == detail.full_detail_triangles(),
		"public triangle report matches independent live geometry accounting"
	)
	check(geometry_unique.size() == 4, "four shared original meshes serve the entire district")
	check(
		kinds.has("Tile") and kinds.has("Rafter") and kinds.has("Corbel") and kinds.has("Fixing"),
		"ceramic shells, curved rafters, carved brackets and relief fixings are real geometry"
	)
	check(
		valid_attributes,
		"detail geometry has positive-area faces, finite unit normals, UVs and tangents"
	)
	check(
		correct_widths,
		"all roof tiles have physically plausible eighteen to twenty-eight centimeter widths"
	)
	check(
		bounded_cells and shadowless, "small spatial cells enclose every shadowless detail instance"
	)
	check(
		_roof_alignment(detail._roof_checks),
		"sampled detail anchors touch actual imported roof triangles across all modules"
	)
	var tile: ArrayMesh = detail._meshes["Tile"]
	check(
		tile.get_aabb().size.y > 0.08,
		"tile shells have actual thickness and transverse barrel curvature"
	)
	check(_closed_shell(tile), "ceramic shells are closed with consistently oriented rims")
	check(_closed_shell(detail._coarse_tile), "balanced ceramic LOD remains a closed curved shell")
	var initial_count := detail.get_child_count()
	detail.build(world)
	check(initial_count == detail.get_child_count(), "repeated build is idempotent")
	detail.apply_quality("performance")
	var culled := true
	for batch: MultiMeshInstance3D in batches:
		culled = culled and not batch.visible
	check(culled, "performance removes the extra detail submissions")
	detail.apply_quality("high")
	var restored := true
	for batch: MultiMeshInstance3D in batches:
		restored = restored and batch.visible and is_equal_approx(batch.visibility_range_end, 30.0)
	check(restored, "high restores all detail resources with a thirty meter near range")
	detail.apply_quality("balanced")
	for batch: MultiMeshInstance3D in batches:
		restored = restored and batch.visible and is_equal_approx(batch.visibility_range_end, 14.0)
	check(restored, "balanced restores fourteen meter detail culling after a preset roundtrip")
	check(
		_submitted_triangles(detail) < total * 0.45,
		"balanced submits less than forty-five percent of the highest-detail triangles"
	)
	check(
		detail.full_detail_triangles() == total,
		"quality switching preserves highest-detail geometry without counting a second LOD"
	)
	if ResourceLoader.exists("res://scripts/world.gd"):
		await _actual_world()
	else:
		print(
			"ARCHITECTURAL_DETAIL_SCOPE: isolated module review; actual World check runs in repository"
		)
	print(
		(
			"ARCHITECTURAL_DETAIL_METRICS: %d triangles, %d instances, %d spatial batches, %d surfaces"
			% [total, instances, batches.size(), surfaces]
		)
	)
	print("ARCHITECTURAL_DETAIL_RESULT: %d checks, %d failures" % [checks, failures])
	world.free()
	await process_frame
	quit(1 if failures else 0)


func _closed_shell(mesh: Mesh) -> bool:
	var edges: Dictionary = {}
	var arrays := mesh.surface_get_arrays(0)
	var vertices: PackedVector3Array = arrays[Mesh.ARRAY_VERTEX]
	var indices: PackedInt32Array = arrays[Mesh.ARRAY_INDEX]
	for offset in range(0, indices.size(), 3):
		for side in range(3):
			var a := str(vertices[indices[offset + side]])
			var b := str(vertices[indices[offset + (side + 1) % 3]])
			var key := a + "/" + b if a < b else b + "/" + a
			if not edges.has(key):
				edges[key] = Vector2i.ZERO
			var value: Vector2i = edges[key]
			value.x += 1
			value.y += 1 if a < b else -1
			edges[key] = value
	for value: Vector2i in edges.values():
		if value.x != 2 or value.y != 0:
			return false
	return not edges.is_empty()


func _actual_world() -> void:
	var actual_game: Node3D = load("res://scenes/main.tscn").instantiate()
	root.add_child(actual_game)
	await process_frame
	var actual_world := actual_game.get_node("World") as Node3D
	actual_world.apply_quality("high")
	var layer := actual_world.get_node_or_null("ArchitecturalDetail")
	check(layer != null, "the actual instantiated World builds its architectural detail layer")
	if layer != null:
		var total := _submitted_triangles(layer)
		check(
			total >= 1000000 and total == layer.full_detail_triangles(),
			"the actual World independently exceeds one million highest-detail architectural triangles"
		)
		var residence_near := false
		var residence_far := false
		for source: Node3D in layer._sources:
			residence_near = (
				residence_near or source.scene_file_path.ends_with("residence_near.glb")
			)
			residence_far = residence_far or source.scene_file_path.ends_with("residence_far.glb")
		check(
			residence_near and not residence_far,
			"the real residence contributes detail through only its near module"
		)
		print("ARCHITECTURAL_DETAIL_ACTUAL_WORLD: %d extra triangles" % total)
	await load("res://tests/scene_fixture.gd").dispose_scene(self, actual_game)


func _submitted_triangles(layer: Node) -> int:
	var total := 0
	for batch: MultiMeshInstance3D in layer.find_children("*", "MultiMeshInstance3D", true, false):
		for surface in range(batch.multimesh.mesh.get_surface_count()):
			var arrays := batch.multimesh.mesh.surface_get_arrays(surface)
			var indices: PackedInt32Array = arrays[Mesh.ARRAY_INDEX]
			var vertices: PackedVector3Array = arrays[Mesh.ARRAY_VERTEX]
			total += (
				int((indices.size() if not indices.is_empty() else vertices.size()) / 3)
				* batch.multimesh.instance_count
			)
	return total


func _fixture_modules(world: Node3D) -> void:
	_place(world, "celestial/sanctuary", Vector3(0, 1.17, -18))
	_place(world, "celestial/pagoda", Vector3(46, 9.41, -42))
	_place(world, "residence/residence_near", Vector3(20, 0.6, 31))
	_place(world, "residence/residence_far", Vector3(20, 0.6, 31))
	for x in [-16.0, 16.0]:
		_place(world, "pavilion", Vector3(x, 0.1 - 0.59 * 0.68, -10), 0.68)
	_place(world, "pavilion", Vector3(-34, -0.59 * 0.65, -17), 0.65)
	_place(world, "pavilion", Vector3(42, -0.59 * 0.55, -11), 0.55)
	for point in [
		Vector3(30, 10, -44),
		Vector3(-62, 23, -61),
		Vector3(67, 33, -83),
		Vector3(3, 42, -125),
		Vector3(-104, 46, -123)
	]:
		_place(world, "pavilion_far", point - Vector3(0, 0.59 * 0.8, 0), 0.8)
	_place(world, "gate", Vector3(30, 0, -4), 1.0, PI / 2)
	_place(world, "shrine", Vector3(0, 1.76, -18.8), 0.62)
	_place(world, "shrine", Vector3(-47, 20, -32), 0.85)
	_place(world, "verdant/fox_shrine", Vector3(-32, 6, -43))
	for z in [-24.5, -32.5]:
		_place(world, "verdant/covered_bridge", Vector3(-30, 6, z))


func _place(
	world: Node3D, key: String, point: Vector3, scale_value: float = 1.0, yaw: float = 0.0
) -> void:
	var scene: PackedScene = load("res://assets/models/%s.glb" % key)
	var module := scene.instantiate() as Node3D
	world.add_child(module)
	module.position = point
	module.scale = Vector3.ONE * scale_value
	module.rotation.y = yaw
	module.visible = not key.ends_with("residence_far")


func _roof_alignment(samples: Array[Dictionary]) -> bool:
	if samples.size() < 50:
		return false
	var aligned := true
	for sample in samples:
		var module: Node3D = sample["module"]
		var point: Vector3 = sample["point"]
		var key := module.scene_file_path
		if not _source_triangles.has(key):
			var triangles := PackedVector3Array()
			for mesh_node: MeshInstance3D in module.find_children(
				"*", "MeshInstance3D", true, false
			):
				var transform := (
					module.global_transform.affine_inverse() * mesh_node.global_transform
				)
				for surface in range(mesh_node.mesh.get_surface_count()):
					var arrays := mesh_node.mesh.surface_get_arrays(surface)
					var vertices: PackedVector3Array = arrays[Mesh.ARRAY_VERTEX]
					for index: int in arrays[Mesh.ARRAY_INDEX]:
						triangles.append(transform * vertices[index])
			_source_triangles[key] = triangles
		var triangles: PackedVector3Array = _source_triangles[key]
		var closest := INF
		for offset in range(0, triangles.size(), 3):
			var hit = Geometry3D.segment_intersects_triangle(
				point + Vector3.UP * 0.3,
				point - Vector3.UP * 0.3,
				triangles[offset],
				triangles[offset + 1],
				triangles[offset + 2]
			)
			if hit is Vector3:
				closest = minf(closest, point.distance_to(hit) * module.global_basis.get_scale().x)
		if closest > 0.16:
			print("ROOF_ALIGNMENT_FAILURE: %s anchor %s closest %s" % [key, point, closest])
			aligned = false
	return aligned
