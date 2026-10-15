extends SceneTree
## Real walking, collision edges and imported zero-offset floors on the western route.

const SCENE_FIXTURE := preload("res://tests/scene_fixture.gd")
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


func walk(frames: int, action: String) -> void:
	Input.action_press(action)
	for index in range(frames):
		await physics_frame
	Input.action_release(action)
	for index in range(8):
		await physics_frame


func visible_floor(model: Node3D, point: Vector3) -> float:
	var highest := -INF
	for mesh in model.find_children("*", "MeshInstance3D", true, false):
		for surface in range(mesh.mesh.get_surface_count()):
			var arrays: Array = mesh.mesh.surface_get_arrays(surface)
			var vertices: PackedVector3Array = arrays[Mesh.ARRAY_VERTEX]
			var indices: PackedInt32Array = arrays[Mesh.ARRAY_INDEX]
			for index in range(0, indices.size(), 3):
				var hit = Geometry3D.segment_intersects_triangle(
					point + Vector3.UP,
					point - Vector3.UP,
					mesh.global_transform * vertices[indices[index]],
					mesh.global_transform * vertices[indices[index + 1]],
					mesh.global_transform * vertices[indices[index + 2]]
				)
				if hit is Vector3:
					highest = maxf(highest, hit.y)
	return highest


func run() -> void:
	var scene = load("res://scenes/main.tscn").instantiate()
	root.add_child(scene)
	var world: Node3D = scene.get_node("World")
	var player: CharacterBody3D = scene.get_node("Player")
	for index in range(50):
		await physics_frame
	var route: Node3D = world.get_node_or_null("FoxShrineRoute")
	check(route != null, "western shrine has a real route node")
	if route == null:
		print("VERDANT_ROUTE_RESULT: %d checks, %d failures" % [checks, failures])
		await SCENE_FIXTURE.dispose_scene(self, scene)
		quit(1)
		return
	check(
		(
			world.modules.has("covered_bridge")
			and world.modules.has("fox_shrine")
			and world.modules.has("dragon_spout")
		),
		"original bridge, shrine and carved spout GLBs are imported"
	)
	for placement in [
		["CoveredBridgeSouth", Vector3(-30, 6, -24.5)],
		["CoveredBridgeNorth", Vector3(-30, 6, -32.5)],
		["FoxShrine", Vector3(-32, 6, -43)]
	]:
		check(
			absf(visible_floor(route.get_node(placement[0]), placement[1]) - 6) < 0.03,
			"visible zero-offset imported floor matches physical route: " + placement[0]
		)
	var boundary_query := PhysicsRayQueryParameters3D.create(
		Vector3(-36.6, 7.4, -43), Vector3(-35.8, 7.4, -43), 1
	)
	var boundary_hit: Dictionary = world.get_world_3d().direct_space_state.intersect_ray(
		boundary_query
	)
	check(not boundary_hit.is_empty(), "visible shrine side wall has a matching physical boundary")
	var risers: MultiMeshInstance3D = route.get_node("ThirtyStoneRisers")
	check(risers.multimesh.instance_count == 30, "route has exactly thirty authored risers")
	var dimensions := true
	var physical_risers := 0
	for collider in route.get_node("WalkableFoxRoute").get_children():
		if collider is CollisionShape3D and collider.shape is BoxShape3D:
			if absf(collider.shape.size.z - 0.55) < 0.0001:
				physical_risers += 1
				var index := roundi((-3.775 - collider.position.z) / 0.55)
				dimensions = dimensions and absf(collider.shape.size.x - 3.6) < 0.0001
				dimensions = (
					dimensions
					and (
						absf(collider.position.y + collider.shape.size.y / 2 - (index + 1) * 0.2)
						< 0.0001
					)
				)
	check(
		physical_risers == 30 and dimensions,
		"all thirty physical treads are 0.55m with a 0.20m rise"
	)
	player.position = Vector3(-30, 1, 1)
	player.velocity = Vector3.ZERO
	player.yaw = 0.0
	player.set_sprint_enabled(false)
	player.update_camera()
	for index in range(75):
		await physics_frame
	check(
		player.is_on_floor() and absf(player.position.y) < 0.08,
		"lotus approach begins on the retained zero-meter floor"
	)
	var lowest := player.position.y
	var highest := player.position.y
	Input.action_press("move_forward")
	for index in range(300):
		await physics_frame
		lowest = minf(lowest, player.position.y)
		highest = maxf(highest, player.position.y)
	Input.action_release("move_forward")
	for index in range(8):
		await physics_frame
	check(
		player.position.z < -22 and player.is_on_floor() and absf(player.position.y - 6) < 0.08,
		"capsule climbs all thirty stairs onto the covered bridge"
	)
	check(
		lowest > -0.08 and highest < 6.1, "western ascent has no fall-through or teleport to height"
	)
	await walk(180, "move_forward")
	check(
		(
			player.position.z < -37
			and player.position.z > -41
			and player.is_on_floor()
			and absf(player.position.y - 6) < 0.08
		),
		"capsule crosses sixteen meters of bridge and reaches the shrine terrace"
	)
	# The actual guard must stop a walking capsule at the bridge edge.
	await walk(130, "move_backward")
	await walk(65, "move_right")
	check(
		player.position.x < -28.45 and player.is_on_floor() and absf(player.position.y - 6) < 0.08,
		"bridge guard physically prevents a capsule from walking off its side"
	)
	await walk(12, "move_left")
	await walk(130, "move_forward")
	await walk(25, "move_left")
	await walk(50, "move_forward")
	check(
		player.position.distance_to(Vector3(-32, 6, -43)) < 2.6 and player.is_on_floor(),
		"shrine interior can be entered through its clear south opening"
	)
	# Return along the same physical deck and stairs, without a test teleport.
	await walk(50, "move_backward")
	await walk(25, "move_right")
	await walk(442, "move_backward")
	check(
		player.position.z > -1.7 and player.is_on_floor() and absf(player.position.y) < 0.08,
		"capsule returns down all thirty risers to the original lotus floor"
	)
	var floor_query := PhysicsRayQueryParameters3D.create(
		Vector3(-32, 7, -43), Vector3(-32, 5, -43), 1
	)
	var floor_hit: Dictionary = world.get_world_3d().direct_space_state.intersect_ray(floor_query)
	check(
		not floor_hit.is_empty() and absf(floor_hit.position.y - 6) < 0.01,
		"physical shrine floor is exactly six meters high"
	)
	var bridge_mesh: MeshInstance3D = (
		route.get_node("CoveredBridgeSouth").find_children("*", "MeshInstance3D", true, false)[0]
	)
	world.apply_quality("performance")
	check(
		(
			is_equal_approx(bridge_mesh.visibility_range_end, 95)
			and bridge_mesh.cast_shadow == GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
		),
		"performance quality bounds new bridge visibility and shadow work"
	)
	world.apply_quality("high")
	check(
		(
			is_equal_approx(bridge_mesh.visibility_range_end, 180)
			and bridge_mesh.cast_shadow == GeometryInstance3D.SHADOW_CASTING_SETTING_ON
		),
		"high quality restores the imported bridge without rebuilding it"
	)
	check(
		route.visible and route.get_node("WalkableFoxRoute").get_child_count() > 30,
		"quality switches retain all actual route collision"
	)
	world.apply_quality("balanced")
	print("VERDANT_ROUTE_RESULT: %d checks, %d failures" % [checks, failures])
	await SCENE_FIXTURE.dispose_scene(self, scene)
	quit(1 if failures else 0)
