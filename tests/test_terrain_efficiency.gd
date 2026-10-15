extends SceneTree

var failures := 0
var checks := 0


func _initialize() -> void:
	call_deferred("run")


func check(value: bool, message: String) -> void:
	checks += 1
	if not value:
		failures += 1
		push_error(message)


func run() -> void:
	var world = load("res://scripts/world.gd").new()
	world.terrain_noise.seed = 73109
	var start := Time.get_ticks_usec()
	for key in [Vector2i.ZERO, Vector2i(1, 0), Vector2i(-1, -1), Vector2i(12, -8)]:
		var region: Node3D = world.build_region(key)
		var mesh: Mesh = region.get_child(0).mesh
		var arrays := mesh.surface_get_arrays(0)
		var vertices: PackedVector3Array = arrays[Mesh.ARRAY_VERTEX]
		var normals: PackedVector3Array = arrays[Mesh.ARRAY_NORMAL]
		var indices: PackedInt32Array = (
			arrays[Mesh.ARRAY_INDEX] if arrays[Mesh.ARRAY_INDEX] != null else PackedInt32Array()
		)
		check(vertices.size() == 1089, "Shared grid vertices calculated once")
		check(indices.size() == 6144, "All 2048 ground triangles retained")
		var heights_match := true
		var normals_match := true
		for index in vertices.size():
			var point := vertices[index]
			heights_match = (
				heights_match and absf(point.y - world.terrain_height(point.x, point.z)) < 0.0001
			)
			var expected := (
				Vector3(
					(
						world.terrain_height(point.x - 0.5, point.z)
						- world.terrain_height(point.x + 0.5, point.z)
					),
					1,
					(
						world.terrain_height(point.x, point.z - 0.5)
						- world.terrain_height(point.x, point.z + 0.5)
					)
				)
				. normalized()
			)
			normals_match = normals_match and normals[index].distance_to(expected) < 0.001
		check(heights_match, "Every vertex retains original terrain height")
		check(normals_match, "Every smooth normal retains seam-safe derivative")
		check(
			not region.find_children("*", "CollisionShape3D", true, false).is_empty(),
			"Collision remains present"
		)
		region.free()
	print("TERRAIN_BUILD_AND_VERIFY_US: ", Time.get_ticks_usec() - start)
	world.free()
	print("TERRAIN_EFFICIENCY_RESULT: %d checks, %d failures" % [checks, failures])
	quit(1 if failures else 0)
