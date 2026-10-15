extends SceneTree

const SCENE_FIXTURE := preload("res://tests/scene_fixture.gd")

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
		# Start inside each clear interior now that its roof has real collision.
		player.position = destination + Vector3(0, 0.4, 0)
		player.velocity = Vector3.ZERO
		for i in range(120):
			await physics_frame
		check(
			player.is_on_floor() and absf(player.position.y - destination.y) < 0.35,
			(
				"landmark landing has a walkable floor: %s (actual %s, grounded %s)"
				% [destination, player.position, player.is_on_floor()]
			)
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
	var eastern_gate := world.find_child("Gate", false, false) as Node3D
	var timber_retained := false
	if eastern_gate != null:
		for item in eastern_gate.find_children("*", "MeshInstance3D", true, false):
			for surface_index in range(item.mesh.get_surface_count()):
				var active: Material = item.get_active_material(surface_index)
				if active != null and active.resource_name == "Temple_Red_Timber":
					timber_retained = true
	check(timber_retained, "legacy eastern gate keeps its original red timber material")
	check(world.modules.has("sanctuary"), "the three-tier celestial sanctuary is loaded")
	check(world.modules.has("pagoda"), "the upper celestial pagoda is loaded")
	var pagoda := world.find_child("Pagoda", false, false) as Node3D
	check(pagoda != null, "reachable terrace has its authored pagoda model")
	if pagoda != null:
		check(
			absf(visible_floor_at(pagoda, Vector3(46, 10, -42)) - 10.0) < 0.08,
			"upper pagoda visible plinth matches the actual ten-meter landing"
		)
	check(world.has_node("SkyRoute/WalkableSkyStairs"), "sky stairs use explicit capsule collision")
	var details: Node3D = world.get_node_or_null("ArchitecturalDetail")
	check(
		details != null and details.full_detail_triangles() >= 1000000,
		"actual placed architecture contains at least one million real near-detail triangles"
	)
	if details != null:
		print("WORLD_ARCHITECTURAL_TRIANGLES: %d" % details.full_detail_triangles())
		world.apply_quality("performance")
		var culled := true
		for batch in details.find_children("*", "MultiMeshInstance3D", true, false):
			culled = culled and not batch.visible
		check(culled, "world performance quality culls the actual architectural detail layer")
		world.apply_quality("high")
		var restored := true
		for batch in details.find_children("*", "MultiMeshInstance3D", true, false):
			restored = (
				restored and batch.visible and is_equal_approx(batch.visibility_range_end, 30)
			)
		check(restored, "world high quality restores bounded near architectural detail")
		world.apply_quality("balanced")
	var living_dragon: Node3D = world.get_node_or_null("CelestialDragon")
	check(
		living_dragon != null and living_dragon.get_child_count() == 1,
		"accepted living dragon is built in the actual game world"
	)
	if living_dragon != null:
		world.apply_quality("performance")
		check(
			not living_dragon._flight_root.visible,
			"world quality forwarding culls the living dragon in performance"
		)
		world.apply_quality("balanced")
		check(
			living_dragon._lods[1].visible and not living_dragon._lods[0].visible,
			"world quality restores the lower cost animated dragon LOD"
		)
	var cascade: MeshInstance3D = world.get_node("DragonMouthCascade")
	var water_arrays: Array = cascade.mesh.surface_get_arrays(0)
	var water_vertices: PackedVector3Array = water_arrays[Mesh.ARRAY_VERTEX]
	var faces_pond := true
	for normal in water_arrays[Mesh.ARRAY_NORMAL]:
		faces_pond = faces_pond and normal.dot(Vector3.BACK) > 0.9
	check(
		faces_pond,
		"cascade normals face the pond rather than shading the visible sheet from behind"
	)
	var tangents = water_arrays[Mesh.ARRAY_TANGENT]
	check(
		tangents is PackedFloat32Array and tangents.size() == water_vertices.size() * 4,
		"flowing normal-map water has actual mesh tangent data"
	)
	var mouth_min := Vector3(INF, INF, INF)
	var mouth_max := Vector3(-INF, -INF, -INF)
	var top_points := 0
	for point in water_vertices:
		if point.y > 17.99:
			var top_point: Vector3 = cascade.global_transform * point
			mouth_min = mouth_min.min(top_point)
			mouth_max = mouth_max.max(top_point)
			top_points += 1
	var mouth_center := (mouth_min + mouth_max) * 0.5
	var spout: Node3D = world.get_node("CarvedDragonSpout")
	check(
		(
			top_points > 0
			and mouth_center.distance_to(spout.global_transform * Vector3(0, 1.01, 0.93)) < 0.02
		),
		"carved dragon mouth outlet remains anchored to the falling water"
	)
	check(world.has_method("terrain_height"), "world exposes continuous terrain height")
	check(
		world.cliff_surface.vertex_color_use_as_albedo,
		"natural cliff material uses its authored vertex-color variation"
	)
	check(
		absf(world.terrain_height(54, 32) - world.terrain_height(60, 32)) > 0.04,
		"wild ground has real relief inside the former flat seventy-five-meter square"
	)
	var continuous := true
	for edge in [
		Vector2(-43, -42),
		Vector2(-21, -42),
		Vector2(-32, -52),
		Vector2(-32, -33),
		Vector2(24, 0),
		Vector2(59, -4)
	]:
		continuous = (
			continuous
			and (
				absf(
					(
						world.terrain_height(edge.x - 0.001, edge.y)
						- world.terrain_height(edge.x + 0.001, edge.y)
					)
				)
				< 0.01
			)
		)
		continuous = (
			continuous
			and (
				absf(
					(
						world.terrain_height(edge.x, edge.y - 0.001)
						- world.terrain_height(edge.x, edge.y + 0.001)
					)
				)
				< 0.01
			)
		)
	check(continuous, "new hill and clearing boundaries have continuous physical terrain heights")
	var authored_floors := true
	for point in [
		Vector2(0, 12), Vector2(0, -18), Vector2(-30, 1), Vector2(30, -4), Vector2(50, -4)
	]:
		authored_floors = authored_floors and world.terrain_height(point.x, point.y) < -0.10
	check(authored_floors, "terrain relief stays below every retained authored route floor")
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
	var canopy: StaticBody3D = world.get_node("GardenNature").find_child(
		"CanopyCameraBlocker", true, false
	)
	var canopy_ray := PhysicsRayQueryParameters3D.create(
		canopy.global_position + Vector3.FORWARD * 5, canopy.global_position, 2
	)
	var camera_hit: Dictionary = world.get_world_3d().direct_space_state.intersect_ray(canopy_ray)
	check(not camera_hit.is_empty(), "camera collision detects the visible flowering canopy")
	canopy_ray.collision_mask = 1
	var walking_hit: Dictionary = world.get_world_3d().direct_space_state.intersect_ray(canopy_ray)
	check(
		walking_hit.is_empty() or walking_hit.collider != canopy,
		"flowering canopy does not become an invisible avatar barrier"
	)
	var routes_clear := true
	for item in world.get_node("GardenNature").get_children():
		if item is MultiMeshInstance3D and item.get_meta("near_cover", false):
			var origins: PackedVector3Array = item.get_meta("instance_origins")
			for point in origins:
				var central := absf(point.x) < 8 and point.z > -25 and point.z < 23
				var eastern := absf(point.z + 4) < 5 and point.x > 16 and point.x < 48
				var western := absf(point.z - 1) < 5 and point.x < -17 and point.x > -47
				routes_clear = routes_clear and not (central or eastern or western)
	check(routes_clear, "ground-plant placement preserves all three authored walking routes")
	var branch_start := Vector3(1.0, 2.0, 3.0)
	var branch_end := Vector3(3.4, 5.8, 1.3)
	var branch: Transform3D = NATURE.new().branch_transform(branch_start, branch_end, 0.15)
	check(
		(
			(branch * Vector3(0, -0.5, 0)).distance_to(branch_start) < 0.0001
			and (branch * Vector3(0, 0.5, 0)).distance_to(branch_end) < 0.0001
		),
		"rendered angled branch cylinder endpoints match the authored fork"
	)
	var replica := Node3D.new()
	NATURE.new().populate(replica, world.SEED, world.terrain_height)
	var original_batches: Array = []
	var replica_batches: Array = []
	for item in world.get_node("GardenNature").get_children():
		if item is MultiMeshInstance3D:
			original_batches.append(item.get_meta("instance_origins"))
	for item in replica.get_children():
		if item is MultiMeshInstance3D:
			replica_batches.append(item.get_meta("instance_origins"))
	check(
		original_batches == replica_batches,
		"same seed recreates identical bounded garden placement"
	)
	replica.free()
	check(world.has_method("apply_quality"), "quality presets can be switched during gameplay")
	if world.has_method("apply_quality"):
		var floor_before: float = player.position.y
		var sun: DirectionalLight3D = world.get_node("AfternoonSun")
		var cover: MultiMeshInstance3D = world.get_node("GardenNature").find_child(
			"MeadowGrass", true, false
		)
		world.apply_quality("high")
		var detailed_count := cover.multimesh.visible_instance_count
		world.apply_quality("performance")
		check(
			not sun.shadow_enabled and cover.multimesh.visible_instance_count < detailed_count,
			"performance preset reduces actual foliage and shadow work"
		)
		for i in range(60):
			await physics_frame
		check(
			player.is_on_floor() and absf(player.position.y - floor_before) < 0.01,
			"quality changes preserve the loaded walkable floor"
		)
		world.apply_quality("high")
		check(
			sun.shadow_enabled and cover.multimesh.visible_instance_count == detailed_count,
			"higher quality restores foliage without regenerating or accumulating instances"
		)
		world.apply_quality("balanced")
	print("WORLD_RESULT: %d checks, %d failures" % [checks, failures])
	await SCENE_FIXTURE.dispose_scene(self, scene)
	quit(1 if failures else 0)
