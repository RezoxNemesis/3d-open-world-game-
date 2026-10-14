extends SceneTree

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


func visible_floor_at(pavilion: Node3D, point: Vector3) -> float:
	var highest := -INF
	var start := point + Vector3.UP
	var end := point - Vector3.UP * 2
	for item in pavilion.find_children("*", "MeshInstance3D", true, false):
		for surface_index in range(item.mesh.get_surface_count()):
			var arrays: Array = item.mesh.surface_get_arrays(surface_index)
			var vertices: PackedVector3Array = arrays[Mesh.ARRAY_VERTEX]
			var indices: PackedInt32Array = arrays[Mesh.ARRAY_INDEX]
			for triangle in range(0, indices.size(), 3):
				var a: Vector3 = item.global_transform * vertices[indices[triangle]]
				var b: Vector3 = item.global_transform * vertices[indices[triangle + 1]]
				var c: Vector3 = item.global_transform * vertices[indices[triangle + 2]]
				var hit = Geometry3D.segment_intersects_triangle(start, end, a, b, c)
				if hit is Vector3:
					highest = maxf(highest, hit.y)
	return highest


func run() -> void:
	var scene = load("res://scenes/main.tscn").instantiate()
	root.add_child(scene)
	for i in range(90):
		await physics_frame
	var player = scene.get_node("Player")
	player.position = Vector3(16, 2, -4)
	player.velocity = Vector3.ZERO
	Input.action_press("move_right")
	for i in range(170):
		await physics_frame
	Input.action_release("move_right")
	check(player.position.x > 26, "eastern route exits courtyard through an open gate")
	for destination in [Vector3(0, 1.8, -16), Vector3(-30, 0, 1), Vector3(30, 0, -4)]:
		player.position = destination + Vector3(0, 3, 0)
		player.velocity = Vector3.ZERO
		for i in range(120):
			await physics_frame
		check(
			player.is_on_floor() and absf(player.position.y - destination.y) < 0.35,
			"landmark landing has a walkable floor: %s" % destination
		)
	var world = scene.get_node("World")
	var sanctuary: Node3D
	for child in world.get_children():
		if (
			child is Node3D
			and is_equal_approx(child.position.z, -18)
			and is_zero_approx(child.position.x)
			and child.get_child_count() > 1
		):
			sanctuary = child
	check(sanctuary != null, "sanctuary architectural model exists")
	if sanctuary != null:
		player.position = Vector3(0, 3, -16)
		player.velocity = Vector3.ZERO
		for i in range(100):
			await physics_frame
		check(
			absf(visible_floor_at(sanctuary, player.position) - player.position.y) < 0.08,
			"traveler feet match the visible sanctuary floor geometry"
		)
	check(world.has_method("terrain_height"), "world exposes continuous terrain height")
	if world.has_method("terrain_height"):
		var regions = world.get_node("Regions")
		var left = regions.active[Vector2i.ZERO].get_child(0).mesh
		var right = regions.active[Vector2i(1, 0)].get_child(0).mesh
		var left_edge: Dictionary = {}
		for point in left.surface_get_arrays(0)[Mesh.ARRAY_VERTEX]:
			if is_equal_approx(point.x, 64):
				left_edge[point.z] = point.y
		var seam_matches := true
		var seam_count := 0
		for point in right.surface_get_arrays(0)[Mesh.ARRAY_VERTEX]:
			if is_equal_approx(point.x, 64) and left_edge.has(point.z):
				seam_count += 1
				seam_matches = seam_matches and is_equal_approx(point.y, left_edge[point.z])
		check(
			seam_count > 16 and seam_matches, "adjacent streamed terrain shares exact seam heights"
		)
	print("WORLD_RESULT: %d checks, %d failures" % [checks, failures])
	scene.queue_free()
	await process_frame
	await create_timer(0.15).timeout
	quit(1 if failures else 0)
