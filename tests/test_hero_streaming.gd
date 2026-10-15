extends SceneTree
## A predicted boundary cannot fight the periodic actual-position poll.

var checks := 0
var failures := 0


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
	var world := Node3D.new()
	root.add_child(world)
	var player := CharacterBody3D.new()
	world.add_child(player)
	player.position = Vector3(50, 0, 0)
	player.velocity = Vector3(120, 0, 0)
	var terrain = load("res://scripts/world.gd").new()
	terrain.terrain_noise.seed = 73109
	var metrics := {"loads": 0, "unloads": 0}
	var regions = load("res://scripts/region_streamer.gd").new()
	regions.name = "Regions"
	regions.factory = func(key: Vector2i):
		metrics.loads += 1
		return terrain.build_region(key)
	regions.region_unloaded.connect(func(_key: Vector2i): metrics.unloads += 1)
	regions.target = player
	world.add_child(regions)
	regions.set_process(false)
	var powers = load("res://scripts/hero_powers.gd").new()
	world.add_child(powers)
	powers._world = world
	powers._player = player
	powers.fast = true
	regions.update_regions(player.position)
	powers.prepare_streaming(1.0 / 60)
	var warm_loads: int = metrics.loads
	var warm_unloads: int = metrics.unloads
	var prepared_center: Vector2i = regions.last_center
	for index in range(6):
		regions._process(0.51)
		powers.prepare_streaming(1.0 / 60)
	check(
		metrics.loads == warm_loads and metrics.unloads == warm_unloads,
		"periodic polling never rebuilds real terrain against an unchanged motion prediction"
	)
	check(
		regions.last_center == prepared_center and prepared_center == Vector2i(1, 0),
		"one consistent predicted center owns both fast and periodic streaming paths"
	)
	check(
		regions.active.size() == 9, "motion prediction retains exactly nine bounded actual regions"
	)
	var sample: Node3D = regions.active[Vector2i(1, 0)]
	check(
		(
			not sample.find_children("*", "CollisionShape3D", true, false).is_empty()
			and not sample.find_children("*", "MeshInstance3D", true, false).is_empty()
		),
		"regression uses actual generated terrain mesh and physical ground"
	)
	regions.update_regions(Vector3.ZERO)
	regions._process(0.51)
	check(
		regions.last_center == Vector2i.ZERO,
		"explicit load or travel clears stale motion prediction"
	)
	powers.fast = false
	powers.prepare_streaming(1.0 / 60)
	player.position = Vector3(200, 0, 0)
	regions._process(0.51)
	check(
		regions.last_center == Vector2i(2, 0),
		"ordinary movement retains the existing periodic region behavior"
	)
	terrain.free()
	world.queue_free()
	await process_frame
	print("HERO_STREAMING_RESULT: %d checks, %d failures" % [checks, failures])
	quit(1 if failures else 0)
