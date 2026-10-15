extends SceneTree

const FIXTURE := preload("res://tests/scene_fixture.gd")
const PATH := "user://world_activities_test.json"
var checks := 0
var failures := 0


func check(condition: bool, label: String) -> void:
	checks += 1
	if not condition:
		failures += 1
		push_error("FAIL: " + label)
	else:
		print("PASS: " + label)


func _initialize() -> void:
	call_deferred("run")


func run() -> void:
	var store = load("res://scripts/save_store.gd").new()
	var legacy := {
		"version": 3, "position": [1, 2, 3], "discovered": ["sky_temple"], "quest_stage": 3
	}
	write_fixture(legacy)
	var migrated: Dictionary = store.load_state(PATH)
	check(
		migrated.get("activity_state", null) == {"records": [], "blessed": false},
		"v3 journey migrates to empty shrine activity"
	)
	for invalid in [
		{"records": ["hall", "hall"], "blessed": false},
		{"records": ["unknown"], "blessed": false},
		{"records": [], "blessed": true},
		{"records": [], "blessed": 1},
		{"records": "hall", "blessed": false},
		{"records": [], "blessed": false, "unexpected": true}
	]:
		var payload := legacy.duplicate(true)
		payload.version = 4
		payload.activity_state = invalid
		write_fixture(payload)
		check(not store.load_state(PATH).valid, "malformed activity cannot grant shrine progress")
	check(
		ResourceLoader.exists("res://scripts/world_activities.gd"),
		"real exploration activities exist"
	)
	if not ResourceLoader.exists("res://scripts/world_activities.gd"):
		DirAccess.remove_absolute(PATH)
		finish()
		return
	var scene = load("res://scenes/main.tscn").instantiate()
	scene.settings_path = "user://activity_settings_test.json"
	root.add_child(scene)
	await process_frame
	var player = scene.get_node("Player")
	player.set_physics_process(false)
	var activity = scene.activities
	check(
		activity.records.is_empty() and not activity.blessed,
		"new exploration starts without earned lore or reward"
	)
	check(not activity.reward.visible, "unearned shrine seal is hidden")
	player.position = Vector3(0, 0, 12)
	check(not activity.read_record("hall"), "record cannot be read remotely")
	check(not activity.ring_bell(), "shrine cannot be activated remotely")
	player.position = activity.BELL_POSITION
	check(not activity.ring_bell(), "bell requires completed lantern errand and all lore")
	for id in ["hall", "bridge", "shrine"]:
		player.position = activity.RECORDS[id].position
		check(activity.read_record(id), "nearby original lore becomes earned: " + id)
		check(not activity.read_record(id), "lore progression cannot be duplicated: " + id)
	check(activity.records.size() == 3, "all three unique lore entries earned")
	player.position = activity.BELL_POSITION - Vector3(0, 6, 0)
	scene.quest.restore_stage(3)
	check(not activity.ring_bell(), "standing below terrace cannot reach bell")
	player.position = activity.BELL_POSITION
	check(activity.ring_bell(), "earned nearby bell grants a real shrine blessing")
	check(activity.reward.visible and activity.blessed, "blessing has a visible earned seal")
	check(not activity.ring_bell(), "ringing again never duplicates a reward")
	scene.exploration.restore_discovered(["sky_temple", "fox_shrine"])
	scene.save_game(PATH)
	var state: Dictionary = store.load_state(PATH)
	check(state.valid and state.activity_state.blessed, "new journey persists shrine reward")
	activity.restore_state({"records": [], "blessed": false})
	scene.load_game(PATH)
	check(activity.blessed and activity.reward.visible, "load restores earned seal visibility")
	check(activity.records.size() == 3, "load restores earned journal entries")
	player.position = activity.RECORDS.hall.position
	check(scene.quest_ui.open_record("hall"), "earned lore opens an actual readable overlay")
	check(not player.is_physics_processing(), "journal overlay pauses character")
	scene.toggle_map()
	check(
		scene.map_overlay.visible and not scene.quest_ui.dialog_open,
		"map replaces lore dialogue safely"
	)
	scene.toggle_map()
	check(player.is_physics_processing(), "closing overlays restores control")
	write_fixture(
		{
			"version": 4,
			"position": [1, 2, 3],
			"discovered": [],
			"quest_stage": 0,
			"activity_state": {"records": ["hall", "bridge", "shrine"], "blessed": true}
		}
	)
	scene.load_game(PATH)
	check(activity.blessed, "inconsistent bad load preserves earned current state")
	DirAccess.remove_absolute(PATH)
	await FIXTURE.dispose_scene(self, scene)
	finish()


func write_fixture(payload: Dictionary) -> void:
	var file := FileAccess.open(PATH, FileAccess.WRITE)
	file.store_string(JSON.stringify(payload))
	file.close()


func finish() -> void:
	print("ACTIVITIES_RESULT: %d checks, %d failures" % [checks, failures])
	quit(1 if failures else 0)
