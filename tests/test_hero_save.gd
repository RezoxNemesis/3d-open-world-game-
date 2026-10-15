extends SceneTree

const FIXTURE := preload("res://tests/scene_fixture.gd")
const PATH := "user://hero_save_test.json"
const ACTIVITY := {"records": ["hall", "bridge", "shrine"], "blessed": true}
const HERO := {"flying": true, "fast": true, "destroyed": ["crag_east"]}
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


func write_fixture(payload: Dictionary) -> void:
	var file := FileAccess.open(PATH, FileAccess.WRITE)
	file.store_string(JSON.stringify(payload))
	file.close()


func run() -> void:
	var store = load("res://scripts/save_store.gd").new()
	var payload := {
		"version": 5,
		"position": [12, 65, -7],
		"discovered": ["sanctuary", "fox_shrine"],
		"quest_stage": 3,
		"activity_state": ACTIVITY,
		"hero_state": HERO
	}
	write_fixture(payload)
	var state: Dictionary = store.load_state(PATH)
	check(state.valid, "schema5 accepts earned shrine progress and real saved hero modes")
	check(state.get("hero_state", {}) == HERO, "flight, speed and destroyed IDs load exactly")
	if failures:
		finish()
		return
	check(
		store.save_state(Vector3(12, 65, -7), ["fox_shrine"], PATH, 3, ACTIVITY, HERO),
		"six-argument writer preserves full earned journey"
	)
	state = store.load_state(PATH)
	check(state.hero_state == HERO and state.activity_state == ACTIVITY, "all progress roundtrips")
	check(state.discovered == ["fox_shrine"], "schema5 retains the fifth discovery")
	for version in range(1, 5):
		var legacy := payload.duplicate(true)
		legacy.version = version
		legacy.erase("hero_state")
		write_fixture(legacy)
		var migrated: Dictionary = store.load_state(PATH)
		check(
			(
				migrated.valid
				and migrated.hero_state == {"flying": false, "fast": false, "destroyed": []}
			),
			"legacy v%d migrates to powers off without destroyed terrain" % version
		)
		if version == 4:
			check(
				migrated.activity_state == ACTIVITY, "v4 migration retains earned shrine blessing"
			)
	for invalid in [
		null,
		{},
		{"flying": 1, "fast": false, "destroyed": []},
		{"flying": false, "fast": "true", "destroyed": []},
		{"flying": false, "fast": false, "destroyed": "crag_east"},
		{"flying": false, "fast": false, "destroyed": ["crag_east", "crag_east"]},
		{"flying": false, "fast": false, "destroyed": ["sky_temple"]},
		{"flying": false, "fast": false, "destroyed": [7]},
		{"flying": false, "fast": false, "destroyed": [], "charge": 1.1}
	]:
		var malformed := payload.duplicate(true)
		malformed.hero_state = invalid
		write_fixture(malformed)
		check(not store.load_state(PATH).valid, "malformed hero data cannot grant unsafe state")
	check(store.save_state(Vector3(0, 3, 12), [], PATH), "legacy three-argument writer still works")
	check(
		not store.save_state(Vector3.ZERO, [], PATH, 0, {}, {"flying": true}),
		"bad hero write cannot overwrite valid save"
	)
	check(store.load_state(PATH).position == Vector3(0, 3, 12), "rejected write is atomic")
	await check_live_resume()
	finish()


func check_live_resume() -> void:
	var scene = load("res://scenes/main.tscn").instantiate()
	scene.settings_path = "user://hero_save_settings_test.json"
	root.add_child(scene)
	await process_frame
	var player = scene.get_node("Player")
	player.set_physics_process(false)
	var powers: Node = scene.get("powers")
	check(is_instance_valid(powers), "main integrates the actual powers controller")
	if not is_instance_valid(powers):
		await FIXTURE.dispose_scene(self, scene)
		return
	player.position = Vector3(12, 65, -7)
	powers.restore_state(HERO)
	scene.quest.restore_stage(3)
	scene.activities.restore_state(ACTIVITY)
	scene.exploration.restore_discovered(["fox_shrine"])
	scene.save_game(PATH)
	powers.restore_state({"flying": false, "fast": false, "destroyed": []})
	player.position = Vector3(0, 2, 12)
	check(scene.load_game(PATH), "main resumes full hero journey")
	check(player.position == Vector3(12, 65, -7), "airborne resume retains actual location")
	check(powers.flying and powers.fast, "airborne resume restores flight before gravity resumes")
	check(powers.snapshot().destroyed == ["crag_east"], "destroyed formation remains destroyed")
	check(scene.activities.blessed, "hero resume retains earned shrine reward")
	check(scene.exploration.discovered.has("fox_shrine"), "hero resume retains western discovery")
	check(player.velocity.is_zero_approx(), "resume clears transient momentum")
	var file := FileAccess.open(PATH, FileAccess.WRITE)
	file.store_string("invalid")
	file.close()
	check(not scene.load_game(PATH, true), "bad resume is reported without changing live modes")
	check(powers.flying and player.position.y == 65, "bad save cannot drop airborne hero")
	var restore_button := scene.find_child("RestoreMountainCrags", true, false) as Button
	check(restore_button != null, "settings offers a real way to repeat mountain smashing")
	if restore_button != null:
		restore_button.pressed.emit()
		check(
			powers.mountains.targets.has("crag_east") and powers.snapshot().destroyed.is_empty(),
			"restore control rebuilds the actual destroyed formation"
		)
		check(
			powers.flying and powers.fast and scene.activities.blessed and scene.quest.stage == 3,
			"restoring crags preserves hero modes and earned journey rewards"
		)
		scene.save_game(PATH)
		check(
			scene.storage.load_state(PATH).hero_state.destroyed.is_empty(),
			"restored formations persist in the next complete journey"
		)
	await FIXTURE.dispose_scene(self, scene)
	DirAccess.remove_absolute("user://hero_save_settings_test.json")


func finish() -> void:
	DirAccess.remove_absolute(PATH)
	DirAccess.remove_absolute(PATH + ".tmp")
	print("HERO_SAVE_RESULT: %d checks, %d failures" % [checks, failures])
	quit(1 if failures else 0)
