extends SceneTree

const NATURE := preload("res://scripts/nature.gd")
var checks := 0
var failures := 0


func check(condition: bool, label: String) -> void:
	checks += 1
	if condition:
		print("PASS: " + label)
	else:
		failures += 1
		push_error("FAIL: " + label)


func _initialize() -> void:
	call_deferred("run")


func triangles(mesh: Mesh) -> int:
	var count := 0
	for surface_index in range(mesh.get_surface_count()):
		var arrays := mesh.surface_get_arrays(surface_index)
		var indices: PackedInt32Array = (
			arrays[Mesh.ARRAY_INDEX] if arrays[Mesh.ARRAY_INDEX] != null else PackedInt32Array()
		)
		var vertices: PackedVector3Array = arrays[Mesh.ARRAY_VERTEX]
		count += (indices.size() if not indices.is_empty() else vertices.size()) / 3
	return count


func run() -> void:
	var nature := NATURE.new()
	check(nature.route_or_water(Vector3(50, 0, -20)), "new upper stair corridor excludes plants")
	check(nature.route_or_water(Vector3(46, 10, -42)), "new upper terrace excludes plants")
	for direction in [Vector3.UP, Vector3.FORWARD, Vector3(1.3, 3.1, -2.0)]:
		var start := Vector3(3, 2, -5)
		var end: Vector3 = start + direction
		var branch: Transform3D = nature.branch_transform(start, end, 0.2)
		check(
			(
				(branch * Vector3(0, -0.5, 0)).distance_to(start) < 0.0001
				and (branch * Vector3(0, 0.5, 0)).distance_to(end) < 0.0001
				and absf(branch.basis.determinant()) > 0.0001
			),
			"branch endpoints remain exact for direction %s" % direction
		)
	var garden := Node3D.new()
	var replica := Node3D.new()
	nature.populate(garden, 73109)
	NATURE.new().populate(replica, 73109)
	var original_origins: Array = []
	var replica_origins: Array = []
	var content_triangles := 0
	var cover_clear := true
	var atlas_canopies := true
	var camera_only := true
	var batches := 0
	for item in garden.get_children():
		if item is MultiMeshInstance3D:
			batches += 1
			var origins: PackedVector3Array = item.get_meta("instance_origins")
			original_origins.append(origins)
			content_triangles += triangles(item.multimesh.mesh) * item.multimesh.instance_count
			if item.get_meta("near_cover", false):
				for point in origins:
					cover_clear = cover_clear and not nature.route_or_water(point)
			if item.name.begins_with("PineCanopies") or item.name.begins_with("FloweringCanopies"):
				var material = item.multimesh.mesh.surface_get_material(0)
				atlas_canopies = (
					atlas_canopies
					and material is ShaderMaterial
					and material.get_shader_parameter("use_atlas") == true
					and material.get_shader_parameter("foliage_atlas") is Texture2D
					and item.get_meta("density_scaled", false)
				)
		elif item is StaticBody3D:
			camera_only = camera_only and item.collision_layer == 2 and item.collision_mask == 0
	for item in replica.get_children():
		if item is MultiMeshInstance3D:
			replica_origins.append(item.get_meta("instance_origins"))
	check(original_origins == replica_origins, "botanical placement recreates exactly from seed")
	check(cover_clear, "all meadow cover respects authored paths, pools, stairs and terrace")
	check(
		atlas_canopies, "pine and flower clusters use original textured cards and quality scaling"
	)
	check(camera_only, "flower-canopy blockers affect camera layer only")
	check(content_triangles < 200000, "bounded garden content stays below200k triangles")
	print("FOLIAGE_BUDGET: %d batches, %d content triangles" % [batches, content_triangles])
	var ledge := Node3D.new()
	check(
		nature.has_method("populate_ledge"), "cliff ledges share the batched botanical pine builder"
	)
	if nature.has_method("populate_ledge"):
		var points: Array[Vector3] = [Vector3(-32, 6, -36), Vector3(67, 33, -83)]
		nature.populate_ledge(ledge, 73110, points)
		var respects_elevation := true
		for item in ledge.get_children():
			if item is MultiMeshInstance3D:
				for point in item.get_meta("instance_origins"):
					respects_elevation = respects_elevation and point.y > 6
		check(respects_elevation, "ledge pines preserve authored cliff elevation")
	garden.free()
	replica.free()
	ledge.free()
	print("FOLIAGE_RESULT: %d checks, %d failures" % [checks, failures])
	quit(1 if failures else 0)
