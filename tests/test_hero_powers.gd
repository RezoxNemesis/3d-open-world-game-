extends SceneTree
## Actual capsule movement, leap arcs and destruction physics.

var checks := 0
var failures := 0


class TestWorld:
	extends Node3D

	func terrain_height(_x: float, _z: float) -> float:
		return 0.0


func check(value: bool, label: String) -> void:
	checks += 1
	if value:
		print("PASS: " + label)
	else:
		failures += 1
		push_error("FAIL: " + label)


func _initialize() -> void:
	call_deferred("run")


func run() -> void:
	check(ResourceLoader.exists("res://scripts/hero_powers.gd"), "real hero controller exists")
	if failures:
		finish()
		return
	await exercise()
	finish()


func exercise() -> void:
	for action in [
		"move_left", "move_right", "move_forward", "move_backward", "jump", "toggle_view", "sprint"
	]:
		if not InputMap.has_action(action):
			InputMap.add_action(action)
	var world := TestWorld.new()
	root.add_child(world)
	var regions = load("res://scripts/region_streamer.gd").new()
	regions.name = "Regions"
	regions.factory = func(key: Vector2i):
		var chunk := Node3D.new()
		obstacle(chunk, Vector3(128, 2, 128), Vector3(key.x * 128, -1, key.y * 128))
		return chunk
	world.add_child(regions)
	regions.update_regions(Vector3.ZERO)
	var player = load("res://scripts/player.gd").new()
	player.position = Vector3(0, 2, 0)
	world.add_child(player)
	var powers = load("res://scripts/hero_powers.gd").new()
	world.add_child(powers)
	powers.setup(player, world)
	regions.target = player
	await frames(60)
	check(player.is_on_floor(), "real capsule settles on actual streamed terrain")
	check(player.powers == powers, "powers attach to the existing single capsule owner")
	powers.toggle_flight()
	Input.action_press("jump")
	await frames(30)
	Input.action_release("jump")
	check(player.position.y > 8.5, "flight ascends through actual capsule movement")
	var hover: float = player.position.y
	await frames(45)
	check(absf(player.position.y - hover) < 0.03, "flight hovers without gravity drift")
	var ceiling := obstacle(world, Vector3(15, 0.1, 15), Vector3(0, 14, 0))
	Input.action_press("jump")
	await frames(30)
	Input.action_release("jump")
	check(
		player.position.y <= 12.3 and player.position.y > 11.8,
		"flying capsule stops beneath a thin overhead ceiling"
	)
	Input.action_press("power_descend")
	await frames(60)
	Input.action_release("power_descend")
	print("HERO_DESCENT: position=%s velocity=%s" % [player.position, player.velocity])
	check(
		player.position.y >= -0.02 and player.position.y < 0.05,
		"flight descent collides with the floor instead of clipping below it"
	)
	ceiling.queue_free()
	player.position = Vector3(20, 5, 20)
	player.pitch = 0.55
	Input.action_press("move_forward")
	await frames(30)
	Input.action_release("move_forward")
	check(
		player.position.y > 13 and player.position.z < 7,
		"camera pitch guides actual three-dimensional forward flight"
	)
	player.position = Vector3(20, 159, 20)
	Input.action_press("jump")
	await frames(30)
	Input.action_release("jump")
	check(
		player.position.y <= 160.01 and player.position.y > 159.9,
		"flight ascent respects the actual 160 metre altitude ceiling"
	)
	check(
		player.arms[0].rotation.x > 1.2 and player.model.rotation.x < -0.2,
		"flying traveler holds an intentional extended-arm body pose"
	)
	check(player.is_checkpoint_safe(), "an actually flying airborne capsule is safe to checkpoint")
	player.position = Vector3(0, 8, 20)
	powers.toggle_flight()
	await frames(90)
	check(
		player.is_on_floor() and player.position.y < 0.05,
		"turning flight off restores gravity and lands on actual terrain"
	)
	check(
		player.pitch <= player.MAX_PITCH, "turning flight off restores the legacy ground look clamp"
	)
	var short_apex := await leap_arc(player, powers, 0)
	var charged_apex := await leap_arc(player, powers, 66)
	check(short_apex > 7 and short_apex < 12, "uncharged leap reaches a measured 18m/s arc")
	check(charged_apex > short_apex + 45, "fully charged leap has a substantially higher real apex")
	await settle(player, Vector3(0, 0.1, 20))
	powers.begin_leap()
	await frames(30)
	powers.cancel_actions()
	check(not powers.release_leap(), "canceled charge cannot launch on involuntary release")
	await frames(30)
	check(player.position.y < 0.05, "canceled leap leaves the real body grounded")
	var wall := obstacle(world, Vector3(0.06, 5, 24), Vector3(0, 2.5, 20))
	await settle(player, Vector3(-150, 0.1, 20))
	powers.toggle_speed()
	Input.action_press("move_right")
	Input.action_press("sprint")
	var greatest_speed := 0.0
	for index in range(150):
		await physics_frame
		greatest_speed = maxf(greatest_speed, absf(player.velocity.x))
	Input.action_release("move_right")
	Input.action_release("sprint")
	check(greatest_speed > 115, "held RUN reaches genuine 120m/s ground travel")
	check(
		player.position.x < -0.36 and player.position.x > -1.0,
		"120m/s swept capsule stops at a six-centimetre wall without tunneling"
	)
	wall.queue_free()
	await settle(player, Vector3(0, 0.1, 120))
	Input.action_press("move_right")
	await frames(210)
	Input.action_release("move_right")
	check(
		player.position.x > 210 and player.is_on_floor(),
		"speed mode travels more than 210m across real streamed-region floors"
	)
	check(
		regions.last_center.x >= 2 and regions.active.has(Vector2i(2, 0)),
		"fast movement prepares actual terrain regions before crossing their boundary"
	)
	check(player.camera.fov > 84, "real speed movement smoothly broadens camera FOV")
	player.first_person = true
	player.update_camera()
	powers.toggle_speed()
	await frames(90)
	check(
		absf(player.camera.fov - 66) < 0.2 and not player.model.visible,
		"normal FOV returns correctly through first-person view transitions"
	)
	player.camera.fov = 72.0
	powers.toggle_speed()
	Input.action_press("move_left")
	await frames(60)
	Input.action_release("move_left")
	powers.toggle_speed()
	await frames(90)
	check(
		absf(player.camera.fov - 72.0) < 0.2,
		"speed restores the current configured normal FOV rather than a hard-coded default"
	)
	await destruction(world, player, powers)
	for action in ["move_right", "jump", "power_descend", "sprint", "power_leap"]:
		Input.action_release(action)
	world.queue_free()
	await process_frame


func destruction(world: Node3D, player: CharacterBody3D, powers: Node) -> void:
	var mountains = powers.mountains
	check(mountains.targets.size() == 3, "three substantial marked mountain formations exist")
	var target: Node3D = mountains.targets.crag_east
	var bounds := AABB()
	var first := true
	for mesh: MeshInstance3D in target.find_children("*", "MeshInstance3D", true, false):
		var part := mesh.global_transform * mesh.mesh.get_aabb()
		bounds = part if first else bounds.merge(part)
		first = false
	check(
		bounds.size.y >= 17 and bounds.size.x >= 15,
		"breakable mountain is substantial real geometry rather than a pickup stone"
	)
	player.position = Vector3(100, 0.05, 60)
	player.yaw = 0.0
	player.velocity = Vector3.ZERO
	await frames(3)
	var query := PhysicsRayQueryParameters3D.create(Vector3(100, 5, 60), Vector3(100, 5, 20))
	query.collision_mask = 1
	check(
		not world.get_world_3d().direct_space_state.intersect_ray(query).is_empty(),
		"unbroken mountain has actual ray-blocking collision"
	)
	check(powers.smash(), "forward mountain strike destroys a nearby marked formation")
	await frames(2)
	check(
		not mountains.targets.has("crag_east") and mountains.destroyed_ids() == ["crag_east"],
		"strike removes actual mountain geometry from the scene"
	)
	check(
		world.get_world_3d().direct_space_state.intersect_ray(query).is_empty(),
		"destroyed mountain collision is removed from the real physics space"
	)
	check(not powers.smash(), "three-second cooldown blocks repeated immediate strikes")
	check(
		mountains.debris.size() == 8 and mountains.shockwaves.size() == 1,
		"actual strike spawns physical debris and an expanding geometry shockwave"
	)
	var ring: MeshInstance3D = mountains.shockwaves[0]
	await frames(10)
	check(ring.scale.x > 3, "shockwave expands visibly over actual frames")
	for id in ["crag_north", "crag_ridge"]:
		var point: Vector3 = mountains.targets[id].global_position
		check(
			mountains.strike(point + Vector3(0, 0, 25), Vector3.FORWARD, 30, 15),
			"independent marked formation can be physically destroyed: " + id
		)
	check(
		mountains.debris.size() <= 24, "repeated strikes retain at most 24 physical debris objects"
	)
	await frames(240)
	check(
		mountains.debris.is_empty() and mountains.shockwaves.is_empty(),
		"all debris and shockwaves expire within four seconds"
	)
	mountains.restore_destroyed([])
	await frames(2)
	check(
		(
			mountains.targets.size() == 3
			and not world.get_world_3d().direct_space_state.intersect_ray(query).is_empty()
		),
		"loading an intact earlier state restores actual geometry and collision"
	)
	powers.restore_state({"flying": true, "fast": true, "destroyed": ["crag_east"]})
	await frames(2)
	check(
		powers.flying and powers.fast and not mountains.targets.has("crag_east"),
		"restoring powers applies flight and removes the persisted mountain body"
	)
	check(
		powers.snapshot() == {"flying": true, "fast": true, "destroyed": ["crag_east"]},
		"snapshot preserves modes and stable destroyed IDs without transient actions"
	)


func obstacle(parent: Node3D, dimensions: Vector3, point: Vector3) -> StaticBody3D:
	var body := StaticBody3D.new()
	var collision := CollisionShape3D.new()
	var shape := BoxShape3D.new()
	shape.size = dimensions
	collision.shape = shape
	body.position = point
	body.add_child(collision)
	parent.add_child(body)
	return body


func frames(count: int) -> void:
	for index in range(count):
		await physics_frame


func settle(player: CharacterBody3D, point: Vector3) -> void:
	player.position = point
	player.velocity = Vector3.ZERO
	await frames(40)


func leap_arc(player: CharacterBody3D, powers: Node, charge_frames: int) -> float:
	await settle(player, Vector3(0, 0.1, 20))
	powers.begin_leap()
	await frames(charge_frames)
	check(powers.release_leap(), "a deliberate grounded release launches a real charged leap")
	var apex := 0.0
	for index in range(210):
		await physics_frame
		apex = maxf(apex, player.position.y)
	return apex


func finish() -> void:
	print("HERO_POWERS_RESULT: %d checks, %d failures" % [checks, failures])
	quit(1 if failures else 0)
