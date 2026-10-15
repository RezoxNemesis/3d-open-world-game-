extends SceneTree

var failures := 0
var checks := 0


func _initialize() -> void:
	call_deferred("run")


func check(value: bool, message: String) -> void:
	checks += 1
	if not value:
		failures += 1
		push_error(message)


func run() -> void:
	var district = load("res://scenes/main.tscn").instantiate()
	district.autosave_enabled = false
	district.journey_path = "user://transition-journey-test.json"
	root.add_child(district)
	current_scene = district
	for frame in range(60):
		await physics_frame
	district.exploration.restore_discovered(["sanctuary"])
	district.get_node("Player").position = Vector3(4, 0.1, 12)
	await district.begin_expedition()
	for frame in range(20):
		await process_frame
	check(current_scene.name == "Expedition", "District button opens playable expedition")
	var expedition = current_scene
	expedition.save_path = "user://transition-expedition-test.json"
	expedition.travel(Vector2i(32000, 0))
	expedition.return_to_temple()
	for frame in range(30):
		await process_frame
	check(current_scene.name == "TempleRealm", "Expedition returns to original district")
	check(
		current_scene.journey_path == "user://transition-journey-test.json",
		"Return uses same journey save"
	)
	check(
		current_scene.exploration.discovered.has("sanctuary"),
		"Earned discoveries survive roundtrip"
	)
	check(
		absf(current_scene.get_node("Player").position.x - 4) < 0.1,
		"Original journey position survives roundtrip"
	)
	DirAccess.remove_absolute("user://transition-journey-test.json")
	DirAccess.remove_absolute("user://transition-expedition-test.json")
	await preload("res://tests/scene_fixture.gd").dispose_scene(self, current_scene)
	print("EXPEDITION_TRANSITION_RESULT: %d checks, %d failures" % [checks, failures])
	quit(1 if failures else 0)
