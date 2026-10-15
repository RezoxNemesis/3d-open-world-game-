extends SceneTree

const WORLD := preload("res://scripts/expedition_world.gd")
var checks := 0
var failures := 0
var player: CharacterBody3D
var world: Node3D
var rebases: Array[Vector3] = []


func _initialize() -> void:
	call_deferred("run")


func check(condition: bool, label: String) -> void:
	checks += 1
	if condition:
		print("PASS: " + label)
	else:
		failures += 1
		push_error("FAIL: " + label)


func settle(frames: int, movement: Vector3 = Vector3.ZERO) -> void:
	for frame in range(frames):
		await physics_frame
		player.velocity = Vector3(movement.x, player.velocity.y - 18.0 / 60.0, movement.z)
		player.move_and_slide()


func run() -> void:
	var scene := Node3D.new()
	root.add_child(scene)
	player = CharacterBody3D.new()
	var collision := CollisionShape3D.new()
	var capsule := CapsuleShape3D.new()
	capsule.radius = 0.35
	capsule.height = 1.8
	collision.shape = capsule
	collision.position.y = 0.9
	player.add_child(collision)
	scene.add_child(player)
	world = WORLD.new()
	scene.add_child(world)
	world.rebased.connect(func(offset: Vector3): rebases.append(offset))
	world.setup(player)
	cache_contract()
	if "--cache-check" in OS.get_cmdline_user_args():
		print("EXPEDITION CACHE: %d checks, %d failures" % [checks, failures])
		scene.queue_free()
		await process_frame
		quit(1 if failures else 0)
		return
	await settle(100)
	check(player.is_on_floor(), "initial synchronous terrain supports actual capsule")
	check(world.active_sector_count() == 9, "initial streaming has exactly nine sectors")
	var rock_arrays: Array = world._rock_mesh.surface_get_arrays(0)
	check(rock_arrays[Mesh.ARRAY_NORMAL][0].x > 0, "karst surface faces outward for real rendering")
	world.apply_quality("performance")
	var meshes: Array[Node] = world.get_node("Sector_0_0").find_children(
		"*", "MeshInstance3D", true, false
	)
	var architecture: Array = meshes.filter(func(item): return item.has_meta("expedition_kind"))
	var hall_mesh: GeometryInstance3D = architecture[0]
	check(
		hall_mesh.visibility_range_end == 75, "performance bounds detailed architecture visibility"
	)
	world.apply_quality("balanced")
	check(hall_mesh.visibility_range_end == 95, "balanced restores nearby ornate architecture")
	var initial_vertices: PackedVector3Array = (
		world.get_node("Sector_0_0/WalkableTerrain").mesh.surface_get_arrays(0)[Mesh.ARRAY_VERTEX]
	)
	world.travel_to(Vector2i(39, -71))
	world.travel_to(Vector2i.ZERO)
	check(
		(
			initial_vertices
			== world.get_node("Sector_0_0/WalkableTerrain").mesh.surface_get_arrays(0)[
				Mesh.ARRAY_VERTEX
			]
		),
		"unload and regeneration reproduce actual terrain vertices"
	)
	for point in [Vector3(64, 3, 12), Vector3(-64.125, 3, 12), Vector3(0, 3, 64.125)]:
		world.travel_to(Vector2i.ZERO)
		player.position = point
		var boundary_save: Dictionary = world.world_coordinates()
		check(
			world.restore_coordinates(boundary_save),
			"save between movement and rebase restores: %s" % point
		)
		check(world.world_coordinates() == boundary_save, "normalized boundary save is exact")
	var start_height: float = world.ground_height(Vector2i(197, -91), Vector3(49, 0, 53))
	check(
		start_height == world.ground_height(Vector2i(197, -91), Vector3(49, 0, 53)),
		"integer-seeded terrain repeats exactly"
	)
	for boundary in [-64.0, 64.0]:
		var adjacent := -1 if boundary < 0 else 1
		check(
			is_equal_approx(
				world.ground_height(Vector2i(197, -91), Vector3(boundary, 0, 51)),
				world.ground_height(Vector2i(197 + adjacent, -91), Vector3(-boundary, 0, 51))
			),
			"terrain edge heights join at %s" % boundary
		)
	world.travel_to(Vector2i.ZERO, Vector3(62, 2, 12))
	await settle(60, Vector3(5, 0, 0))
	var coordinates: Dictionary = world.world_coordinates()
	check(coordinates.sector[0] == 1, "actual capsule walks across sector boundary")
	check(player.is_on_floor(), "no collision gap when walking across boundary")
	check(absf(player.position.x) < 64, "floating origin keeps player coordinates small")
	check(rebases.has(Vector3(128, 0, 0)), "rebase publishes exact external entity offset")
	for sector in [Vector2i(781250, 0), Vector2i(-781250, 0), Vector2i(712341, -412377)]:
		world.travel_to(sector, Vector3(-0.125, 2, 12.375))
		await settle(90)
		check(player.is_on_floor(), "extreme sector has live collision: %s" % sector)
		check(
			absf(player.position.z - 12.375) < 0.001,
			"extreme coordinates retain centimeter precision"
		)
		check(world.active_sector_count() <= 9, "extreme travel bounds region count")
	var saved: Dictionary = world.world_coordinates()
	world.travel_to(Vector2i(42, 23))
	check(world.restore_coordinates(saved), "valid split coordinates restore")
	check(world.world_coordinates() == saved, "save roundtrip keeps exact local values")
	for invalid in [
		{},
		{"sector": [781251, 0], "local": [0, 2, 0]},
		{"sector": [1.25, 0], "local": [0, 2, 0]},
		{"sector": [0, 0], "local": [NAN, 2, 0]},
		{"sector": [0, 0], "local": [0, 2]},
		{"sector": [0, 0], "local": [1000000000, 2, 0]}
	]:
		check(
			not world.restore_coordinates(invalid), "malformed coordinates rejected: %s" % invalid
		)
	world.travel_to(Vector2i.ZERO, Vector3(0, 2, -10))
	await settle(90)
	await settle(135, Vector3(0, 0, -4))
	check(player.position.z < -18, "actual capsule enters ornate hall through front opening")
	check(player.is_on_floor() and absf(player.position.y) < 0.06, "hall floor matches ground")
	await settle(180, Vector3(0, 0, 4))
	check(player.position.z > -12, "actual capsule exits the hall")
	world.travel_to(Vector2i.ZERO, Vector3(0, 2, -20))
	await settle(90)
	await settle(90, Vector3(-3, 0, 0))
	check(
		player.position.x > -1.8 and player.position.x < -1,
		"actual capsule is blocked by visible interior scholar desk"
	)
	for index in range(16):
		world.travel_to(Vector2i(index * 1771, -index * 289))
		await process_frame
		check(world.active_sector_count() == 9, "repeated travel unloads old regions %d" % index)
	check(world.get_child_count() <= 9, "unloaded region nodes are freed")
	world.travel_to(Vector2i(781250, 0), Vector3(0, 2, 12))
	await settle(90, Vector3(8, 0, 0))
	check(player.position.x <= 0, "east domain boundary clamps actual capsule")
	world.travel_to(Vector2i(-781250, 0), Vector3(0, 2, 12))
	await settle(90, Vector3(-8, 0, 0))
	check(player.position.x >= 0, "west domain boundary clamps actual capsule")
	await sanctuary_route(scene)
	print("EXPEDITION WORLD: %d checks, %d failures" % [checks, failures])
	scene.queue_free()
	await process_frame
	quit(1 if failures else 0)


func cache_contract() -> void:
	var original: ConcavePolygonShape3D = world._scene_collision(WORLD.SANCTUARY)
	check(
		original == world._scene_collision(WORLD.SANCTUARY),
		"repeated authored collision lookup shares immutable shape"
	)
	var rock_shape: Shape3D
	var shared_rocks := true
	for region: Node3D in world.get_children():
		for body: Node3D in region.get_children():
			if not str(body.name).begins_with("KarstCollision"):
				continue
			var shape: Shape3D = body.get_child(0).shape
			if rock_shape == null:
				rock_shape = shape
			shared_rocks = shared_rocks and shape == rock_shape
	check(
		rock_shape != null and shared_rocks,
		"all resident karst bodies share one collision resource"
	)
	check(
		world._rock_collision.get_faces() == world._rock_mesh.get_faces(),
		"shared karst collision retains the rendered triangle geometry"
	)
	var second := WORLD.new()
	second._initialize_resources()
	check(second._hall_collision == original, "reentering expedition reuses authored collision")
	check(
		second._rock_mesh == world._rock_mesh, "reentering expedition reuses immutable karst mesh"
	)
	check(
		second._ground_materials[0] == world._ground_materials[0],
		"reentering expedition reuses terrain shader material"
	)
	check(
		second._road_material == world._road_material,
		"reentering expedition reuses road shader material"
	)
	second.free()
	# Unrecognized future modules may be built, but cannot grow the resident cache forever.
	for index in range(WORLD.MAX_SCENE_COLLISIONS + 2):
		var model := MeshInstance3D.new()
		var mesh := BoxMesh.new()
		mesh.size = Vector3(1 + index * 0.1, 1, 1)
		model.mesh = mesh
		var packed := PackedScene.new()
		packed.pack(model)
		world._scene_collision(packed)
		model.free()
	check(
		WORLD._scene_collision_cache.size() == WORLD.MAX_SCENE_COLLISIONS,
		"authored collision cache remains bounded when extra modules are requested"
	)


func walk_real(action: String, frames: int) -> void:
	Input.action_press(action)
	for frame in range(frames):
		await physics_frame
	Input.action_release(action)
	for frame in range(10):
		await physics_frame


func sanctuary_route(scene: Node3D) -> void:
	player.queue_free()
	await process_frame
	for action in [
		"move_forward", "move_backward", "move_left", "move_right", "jump", "toggle_view"
	]:
		if not InputMap.has_action(action):
			InputMap.add_action(action)
	player = preload("res://scripts/player.gd").new()
	scene.add_child(player)
	world.setup(player)
	world.travel_to(Vector2i.ZERO, Vector3(-39, 2, 1.5))
	for frame in range(90):
		await physics_frame
	check(
		world.get_node("Sector_0_0").has_node("LotusCliffSanctuary"),
		"origin has authored lotus sanctuary"
	)
	check(player.is_on_floor(), "real traveler begins at dry sanctuary stair approach")
	await walk_real("move_forward", 490)
	check(
		player.position.z < -32 and absf(player.position.y - 8) < 0.09 and player.is_on_floor(),
		"real traveler climbs all forty pavilion risers: %s" % player.position
	)
	await walk_real("move_right", 36)
	await walk_real("move_forward", 62)
	check(
		player.position.z < -38 and absf(player.position.y - 8) < 0.09,
		"elevated pavilion interior is reached by actual walking: %s" % player.position
	)
	world.travel_to(Vector2i.ZERO, Vector3(-9, 2, -3))
	for frame in range(90):
		await physics_frame
	await walk_real("move_left", 310)
	check(
		player.position.x < -33 and player.position.y < 0.4 and player.is_on_floor(),
		"real traveler crosses covered bridge and exits onto west bank: %s" % player.position
	)
	world.travel_to(Vector2i(3, 4))
	check(
		not world.get_node("Sector_3_4").has_node("LotusCliffSanctuary"),
		"authored lotus sanctuary exists only at origin"
	)
