extends SceneTree

var checks := 0
var failures := 0


func _initialize() -> void:
	call_deferred("run")


func check(value: bool, label: String) -> void:
	checks += 1
	if not value:
		failures += 1
		push_error(label)


func write_snapshot(scene: Node, data: Variant) -> void:
	var file := FileAccess.open(scene.save_path, FileAccess.WRITE)
	file.store_string(JSON.stringify(data))
	file.close()


func run() -> void:
	var journal = preload("res://scripts/expedition_journal.gd").new()
	journal.calm(Vector2i.ZERO)
	journal.calm(Vector2i.ZERO)
	check(journal.visited.size() == 1 and journal.pacified.size() == 1, "Defeat is idempotent")
	for x in range(1, 129):
		journal.visit(Vector2i(x, 0))
	check(journal.visited.size() == 128, "Journal storage is bounded")
	check(journal.pacified.is_empty(), "Evicted region releases its calm record")
	var snapshot: Dictionary = journal.snapshot()
	for invalid in [
		null,
		{},
		{"regions": "wrong"},
		{"regions": [[true, 0, false]]},
		{"regions": [[0.5, 0, false]]},
		{"regions": [[781251, 0, false]]},
		{"regions": [[0, 0, 1]]},
		{"regions": [[0, 0, false], [0, 0, true]]},
		{"regions": [[INF, 0, false]]}
	]:
		check(not journal.restore(invalid), "Malformed journal rejected")
		check(journal.snapshot() == snapshot, "Rejection is atomic")
	var scene = load("res://scenes/expedition.tscn").instantiate()
	scene.restore_on_start = false
	scene.save_path = "user://test-expedition-journal.json"
	root.add_child(scene)
	for frame in range(30):
		await physics_frame
	var coordinates: Dictionary = scene.world.world_coordinates()
	for version in [true, false, "1", null, [], {}, -1, 0, 1.5, 3]:
		write_snapshot(scene, {"version": version, "sector": [21, 7], "local": [0, 2, 12]})
		check(not scene.restore_expedition(), "Invalid save version rejected without script error")
		check(
			scene.world.world_coordinates() == coordinates,
			"Invalid version preserves live position"
		)
	var file := FileAccess.open(scene.save_path, FileAccess.WRITE)
	file.store_string("{broken")
	file.close()
	check(not scene.restore_expedition(), "Malformed JSON quietly refused")
	write_snapshot(scene, {"version": 1, "sector": [640, 0], "local": [0, 2, 12]})
	check(scene.restore_expedition(), "Legacy coordinate-only save migrates")
	check(scene.journal.visited == [Vector2i(640, 0)], "Migration records restored region")
	# Exercise actual combat, signal wiring and disk persistence rather than call the handler.
	scene.player.position = scene.encounter.guardian.position + Vector3(0, 0, 3)
	scene.player.model.rotation.y = 0
	await physics_frame
	for strike in range(5):
		scene.encounter.melee_cooldown = 0
		scene.encounter.attack()
	check(scene.encounter.guardian_health == 0, "Five actual hits calm sentinel")
	check(Vector2i(640, 0) in scene.journal.pacified, "Victory signal records guardian sector")
	check(scene.save_expedition(), "Progress saves atomically")
	scene.journal.pacified.clear()
	scene.encounter.restart_encounter()
	check(scene.restore_expedition(), "Saved progress restores")
	check(scene.encounter.state == "defeated", "Saved guardian stays peaceful")
	scene.travel(Vector2i.ZERO)
	scene.travel(Vector2i(640, 0))
	check(scene.encounter.state == "defeated", "Atlas return preserves pacification")
	var good: Dictionary = scene.journal.snapshot()
	coordinates = scene.world.world_coordinates()
	write_snapshot(
		scene,
		{
			"version": 2,
			"sector": [22, 0],
			"local": [0, 2, 12],
			"journal": {"regions": [[true, 0, false]]}
		}
	)
	check(not scene.restore_expedition(), "Bad journal rejects entire snapshot")
	check(
		scene.world.world_coordinates() == coordinates and scene.journal.snapshot() == good,
		"Bad journal preserves world and progress"
	)
	write_snapshot(
		scene,
		{"version": 2, "sector": [781251, 0], "local": [0, 2, 12], "journal": {"regions": []}}
	)
	check(not scene.restore_expedition(), "Bad coordinates reject snapshot")
	check(scene.journal.snapshot() == good, "Bad coordinates preserve journal")
	# Real touch ownership must be released even on direct scene replacement.
	var touch := InputEventScreenTouch.new()
	touch.index = 8
	touch.pressed = true
	touch.position = scene.mobile.joystick_center()
	root.push_input(touch, true)
	await physics_frame
	var drag := InputEventScreenDrag.new()
	drag.index = 8
	drag.position = touch.position + Vector2(60, 0)
	drag.relative = Vector2(60, 0)
	root.push_input(drag, true)
	await physics_frame
	check(Input.get_action_strength("move_right") > 0.5, "Actual joystick held before removal")
	DirAccess.remove_absolute(scene.save_path)
	await preload("res://tests/scene_fixture.gd").dispose_scene(self, scene)
	check(not Input.is_action_pressed("move_right"), "Scene removal releases analog movement")
	print("EXPEDITION_JOURNAL_RESULT: %d checks, %d failures" % [checks, failures])
	quit(1 if failures else 0)
