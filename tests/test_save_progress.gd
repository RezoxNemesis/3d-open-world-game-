extends SceneTree

const SCENE_FIXTURE := preload("res://tests/scene_fixture.gd")

const PATH := "user://progress_upgrade_test.json"

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


func write_fixture(payload: String) -> void:
	var file := FileAccess.open(PATH, FileAccess.WRITE)
	file.store_string(payload)
	file.close()


func run() -> void:
	var storage = load("res://scripts/save_store.gd").new()
	var exploration = load("res://scripts/exploration.gd").new()
	check(storage.has_method("save_state"), "storage supports exploration saves")
	check(exploration.has_method("restore_discovered"), "discovery can be restored safely")
	if failures:
		exploration.free()
		finish()
		return
	var position := Vector3(-30, 0.12, 1)
	check(storage.save_state(position, ["sanctuary", "lotus"], PATH), "v2 exploration save writes")
	var state: Dictionary = storage.load_state(PATH)
	check(state.valid, "new exploration save is valid")
	check(state.position.is_equal_approx(position), "exploration save restores position")
	check(state.discovered == ["sanctuary", "lotus"], "exploration save restores earned IDs")
	exploration.restore_discovered(state.discovered)
	check(
		exploration.current_objective() == "Discover Eastern Gate",
		"restored quest resumes correctly"
	)
	check(not exploration.discovered.has("gate"), "restore does not unlock unearned landmarks")
	exploration.restore_discovered(["lotus", "unknown", 7, "lotus"])
	check(exploration.discovered.size() == 1, "discovery accepts only unique known IDs")
	check(exploration.discovered.has("lotus"), "known restored landmark remains earned")
	check(storage.save_position(position, PATH), "legacy position writer remains compatible")
	state = storage.load_state(PATH)
	check(state.valid and state.discovered.is_empty(), "legacy v1 save loads with empty discovery")
	check(state.position.is_equal_approx(position), "legacy v1 position remains exact")
	for payload in [
		'{"version":2,"position":[1,2,3]}',
		'{"version":2,"position":[1,2,3],"discovered":["unknown"]}',
		'{"version":2,"position":[1,2,3],"discovered":["gate","gate"]}',
		'{"version":2,"position":[1,2,3],"discovered":{"gate":true}}',
		'{"version":2,"position":[10001,2,3],"discovered":[]}',
		'{"version":3,"position":[1,2,3],"discovered":[]}',
		'{"version":"2","position":[1,2,3],"discovered":[]}',
		'{"version":true,"position":[1,2,3],"discovered":[]}',
		'{"version":[],"position":[1,2,3],"discovered":[]}',
		'{"position":[1,2,3],"discovered":[]}',
		"invalid json"
	]:
		write_fixture(payload)
		state = storage.load_state(PATH, position)
		check(
			not state.valid and state.position.is_equal_approx(position),
			"invalid progress safely falls back"
		)
	check(storage.save_state(position, ["gate"], PATH), "valid save fixture restored")
	check(
		not storage.save_state(Vector3(INF, 0, 0), [], PATH),
		"invalid position cannot overwrite save"
	)
	check(
		not storage.save_state(position, ["unknown"], PATH),
		"invalid discovery cannot overwrite save"
	)
	state = storage.load_state(PATH)
	check(state.valid and state.discovered == ["gate"], "failed writes preserve previous save")
	write_fixture(" ".repeat(5000))
	check(not storage.load_state(PATH).valid, "oversized exploration save rejected")
	DirAccess.remove_absolute(PATH)
	check(not storage.load_state(PATH).valid, "missing progress save rejected")
	exploration.free()
	await check_main_roundtrip()
	finish()


func check_main_roundtrip() -> void:
	var scene = load("res://scenes/main.tscn").instantiate()
	scene.settings_path = "user://progress_settings_isolated.json"
	root.add_child(scene)
	await process_frame
	var player = scene.get_node("Player")
	player.set_physics_process(false)
	var earned := ["sanctuary", "lotus"]
	scene.exploration.restore_discovered(earned)
	var saved := Vector3(-30, 0.12, 1)
	player.position = saved
	scene.save_game(PATH)
	check(scene.storage.load_state(PATH).valid, "main save creates a complete journey")
	player.position = Vector3(0, 2, 12)
	player.velocity = Vector3(5, -10, 2)
	scene.exploration.restore_discovered([])
	scene.load_game(PATH)
	check(player.position.is_equal_approx(saved), "main journey load restores location")
	check(player.velocity.is_zero_approx(), "main journey load clears old velocity")
	check(scene.exploration.discovered.size() == 2, "main journey load restores exploration")
	check(scene.objective.text == "Discover Eastern Gate", "loaded HUD shows remaining objective")
	scene.update_map()
	check(not scene.map_buttons["lotus"].disabled, "earned map travel restores from save")
	check(scene.map_buttons["gate"].disabled, "unearned travel stays locked after load")
	write_fixture("broken save")
	scene.load_game(PATH)
	check(player.position.is_equal_approx(saved), "bad main save does not move current player")
	check(scene.exploration.discovered.size() == 2, "bad main save preserves current discovery")
	DirAccess.remove_absolute(PATH)
	await SCENE_FIXTURE.dispose_scene(self, scene)


func finish() -> void:
	print("SAVE_PROGRESS_RESULT: %d checks, %d failures" % [checks, failures])
	quit(1 if failures else 0)
