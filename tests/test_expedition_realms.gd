extends SceneTree
## Actual player routes, saved underwater coordinates, and authored-region streaming joins.

const WORLD := preload("res://scripts/expedition_world.gd")
const REALMS := preload("res://scripts/expedition_realms.gd")
const PLAYER := preload("res://scripts/player.gd")
var world: Node3D
var player: CharacterBody3D
var checks := 0
var failures := 0


func _initialize() -> void:
	call_deferred("run")


func check(condition: bool, label: String) -> void:
	checks += 1
	if condition:
		print("PASS: " + label)
	else:
		failures += 1
		push_error("FAIL: " + label)


func wait_frames(count: int) -> void:
	for index in range(count):
		await physics_frame


func walk_to(key: Vector2i, point: Vector3, frames: int = 800) -> void:
	Input.action_press("move_forward")
	for index in range(frames):
		var target := (
			point
			+ Vector3(
				(key.x - world.origin_sector.x) * 128.0, 0, (key.y - world.origin_sector.y) * 128.0
			)
		)
		var delta := target - player.position
		delta.y = 0
		if delta.length() < 0.18:
			break
		player.yaw = atan2(-delta.x, -delta.z)
		await physics_frame
	Input.action_release("move_forward")
	await wait_frames(10)


func run() -> void:
	for action in [
		"move_forward", "move_backward", "move_left", "move_right", "jump", "toggle_view"
	]:
		if not InputMap.has_action(action):
			InputMap.add_action(action)
	var scene := Node3D.new()
	root.add_child(scene)
	player = PLAYER.new()
	scene.add_child(player)
	world = WORLD.new()
	scene.add_child(world)
	world.setup(player)
	world.travel_to(REALMS.PASS_SECTOR)
	await wait_frames(80)
	check(world.biome_name() == "Dragonwall Pass", "atlas mountain sector has its authored name")
	check(
		player.is_on_floor() and absf(player.position.y) < 0.06, "pass arrival is dry and grounded"
	)
	check(world.active_sector_count() == 9, "custom destination retains nine-region limit")
	check(
		not world.get_node("Sector_64_0").has_node("WalkableSanctuary"),
		"pass replaces the repeated standard sanctuary"
	)
	check(
		world.height_at(0, 12) == world.ground_height(REALMS.PASS_SECTOR, Vector3(0, 0, 12)),
		"height compatibility wrapper uses active integer sector"
	)
	await walk_to(REALMS.PASS_SECTOR, Vector3(0, 8, -16))
	check(
		player.is_on_floor() and absf(player.position.y - 8) < 0.08 and player.position.z < -14,
		"actual player climbs mountain pass stairs to rampart: %s" % player.position
	)
	for x in [8.0, 16.0, 24.0, 32.0, 40.0, 48.0, 56.0, 68.0]:
		await walk_to(REALMS.PASS_SECTOR, Vector3(x, REALMS.wall_height(x), REALMS.wall_z(x)), 200)
		check(
			player.is_on_floor() and player.position.y > 7,
			"rampart and covered gate passage remain walkable at x%s: %s" % [x, player.position]
		)
	check(world.origin_sector == Vector2i(65, 0), "player crosses actual fortified sector boundary")
	check(world.active_sector_count() == 9, "fortification boundary unloads outside regions")
	for key in [Vector2i(64, 0), Vector2i(65, 0), Vector2i(128, 0), Vector2i(260, 0)]:
		for z in [-48.0, -16.0, 12.0, 48.0]:
			check(
				is_equal_approx(
					world.ground_height(key, Vector3(64, 0, z)),
					world.ground_height(key + Vector2i.RIGHT, Vector3(-64, 0, z))
				),
				"custom terrain collision joins exactly at %s z%s" % [key, z]
			)
	world.travel_to(REALMS.IMPERIAL_SECTOR)
	await wait_frames(80)
	check(
		world.biome_name() == "Imperial Terrace" and player.is_on_floor(),
		"imperial arrival is playable"
	)
	await walk_to(REALMS.IMPERIAL_SECTOR, Vector3(0, 4, -17))
	check(
		player.is_on_floor() and absf(player.position.y - 4) < 0.08 and player.position.z < -16,
		"actual player climbs imperial stairs and passes ceremonial gate: %s" % player.position
	)
	await walk_to(REALMS.IMPERIAL_SECTOR, Vector3(0, 4, -26))
	check(
		player.is_on_floor() and absf(player.position.y - 4) < 0.08 and player.position.z < -24,
		"imperial hall interior opens from courtyard: %s" % player.position
	)
	await walk_to(REALMS.IMPERIAL_SECTOR, Vector3(0, 4, -15.5))
	await walk_to(REALMS.IMPERIAL_SECTOR, Vector3(23, 4, -15))
	await walk_to(REALMS.IMPERIAL_SECTOR, Vector3(31, 6, -15))
	check(
		player.is_on_floor() and absf(player.position.y - 6) < 0.08 and player.position.x > 29.5,
		"imperial court side stairs reach walkable outer rampart: %s" % player.position
	)
	player.set_physics_process(false)
	world.travel_to(Vector2i(256, 0), Vector3(0, -10, 12))
	check(
		player.position.y == -10 and world.biome_name() == "Azure Sea",
		"sea travel preserves dive depth"
	)
	var dive: Dictionary = world.world_coordinates()
	world.travel_to(Vector2i.ZERO)
	check(
		world.restore_coordinates(dive) and world.world_coordinates() == dive,
		"underwater saved coordinates survive a land trip"
	)
	check(
		not world.get_node("Sector_256_0").has_node("WalkableSanctuary"),
		"sea has no submerged default hall"
	)
	check(world.height_at(0, 12) < -15, "sea uses actual deep terrain collision")
	check(world.active_sector_count() == 9, "sea streaming keeps nine-region cap")
	print("EXPEDITION REALMS: %d checks, %d failures" % [checks, failures])
	scene.queue_free()
	await process_frame
	quit(1 if failures else 0)
