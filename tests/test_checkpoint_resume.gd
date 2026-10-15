extends SceneTree

const FIXTURE := preload("res://tests/scene_fixture.gd")
const CHECKPOINT := preload("res://scripts/journey_checkpoint.gd")
const PATH := "user://checkpoint_resume_test.json"
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
	check(
		ResourceLoader.exists("res://scripts/journey_checkpoint.gd"),
		"mobile checkpoint controller exists"
	)
	if failures:
		finish()
		return
	DirAccess.remove_absolute(PATH)
	var scene_template: PackedScene = load("res://scenes/main.tscn")
	var scene = scene_template.instantiate()
	scene.settings_path = "user://checkpoint_settings_test.json"
	scene.journey_path = PATH
	scene.autosave_enabled = true
	root.add_child(scene)
	for frame in range(90):
		await physics_frame
	var player = scene.get_node("Player")
	player.position = scene.quest.GUIDE_POSITION + Vector3(0, 0.05, 1)
	player.velocity = Vector3.ZERO
	for frame in range(45):
		await physics_frame
	check(player.is_on_floor(), "checkpoint fixture stands on actual floor")
	check(scene.quest.accept(), "real nearby quest acceptance creates a milestone")
	check(scene.checkpoint.flush(), "milestone checkpoint writes an atomic journey")
	var state: Dictionary = scene.storage.load_state(PATH)
	check(state.valid and state.quest_stage == 1, "checkpoint stores actual earned quest stage")
	var safe_point: Vector3 = state.position
	await check_debounce_and_retry(scene)
	check_disabled_controller(scene)
	await check_flight_checkpoint_pairing(scene, safe_point)
	player.position += Vector3(0, 30, 0)
	player.set_physics_process(false)
	scene.checkpoint.request_save()
	check(scene.checkpoint.flush(), "airborne milestone can retain the last safe floor")
	state = scene.storage.load_state(PATH)
	check(
		state.position.distance_to(safe_point) < 0.2,
		"checkpoint never replaces safe floor with airborne position"
	)
	await FIXTURE.dispose_scene(self, scene)
	var resumed = scene_template.instantiate()
	resumed.settings_path = "user://checkpoint_settings_test.json"
	resumed.journey_path = PATH
	resumed.autosave_enabled = true
	root.add_child(resumed)
	await process_frame
	check(resumed.quest.stage == 1, "startup safely resumes earned quest progress")
	check(
		resumed.get_node("Player").position.distance_to(safe_point) < 0.3,
		"startup resumes the saved safe location"
	)
	check(not resumed.checkpoint.dirty, "restoring a journey does not immediately overwrite it")
	var previous: Vector3 = resumed.get_node("Player").position
	var file := FileAccess.open(PATH, FileAccess.WRITE)
	file.store_string("malformed")
	file.close()
	check(not resumed.load_game(PATH), "malformed resume is reported as invalid")
	check(
		(
			resumed.quest.stage == 1
			and resumed.get_node("Player").position.distance_to(previous) < 0.1
		),
		"invalid load preserves active progress and position"
	)
	await create_timer(0.8).timeout
	check(
		FileAccess.get_file_as_string(PATH) == "malformed",
		"invalid restore schedules no delayed overwrite"
	)
	await FIXTURE.dispose_scene(self, resumed)
	DirAccess.remove_absolute(PATH)
	finish()


func check_debounce_and_retry(scene: Node3D) -> void:
	var checkpoint: Node = scene.checkpoint
	var debounce_path := "user://checkpoint_debounce_test.json"
	DirAccess.remove_absolute(debounce_path)
	checkpoint.path = debounce_path
	checkpoint.request_save()
	check(checkpoint.dirty, "milestone schedules a pending checkpoint")
	await create_timer(0.2).timeout
	check(not FileAccess.file_exists(debounce_path), "checkpoint writes are debounced")
	await create_timer(0.55).timeout
	check(
		FileAccess.file_exists(debounce_path) and not checkpoint.dirty,
		"debounced checkpoint eventually saves earned progress"
	)
	DirAccess.remove_absolute(debounce_path)
	var retry_directory := "user://checkpoint_retry_test"
	var retry_path := retry_directory + "/journey.json"
	DirAccess.remove_absolute(retry_path)
	DirAccess.remove_absolute(retry_directory)
	var previous := FileAccess.get_file_as_bytes(PATH)
	checkpoint.path = retry_path
	checkpoint.request_save()
	check(
		not checkpoint.flush() and checkpoint.dirty,
		"unwritable destination retains pending progress"
	)
	check(
		FileAccess.get_file_as_bytes(PATH) == previous,
		"failed write preserves the existing journey bytes"
	)
	DirAccess.make_dir_absolute(retry_directory)
	await create_timer(0.25).timeout
	check(
		not FileAccess.file_exists(retry_path), "failed checkpoint does not spin immediate retries"
	)
	await create_timer(1.0).timeout
	check(
		FileAccess.file_exists(retry_path) and not checkpoint.dirty,
		"bounded retry saves when the destination becomes writable"
	)
	checkpoint.path = PATH
	DirAccess.remove_absolute(retry_path)
	DirAccess.remove_absolute(retry_directory)


func check_disabled_controller(scene: Node3D) -> void:
	var checkpoint: Node = CHECKPOINT.new()
	scene.add_child(checkpoint)
	checkpoint.setup(scene, "user://checkpoint_disabled_test.json", false)
	checkpoint.start()
	checkpoint.request_save()
	check(
		not checkpoint.dirty and not checkpoint.flush(),
		"disabled desktop checkpoint remains inactive"
	)
	checkpoint.queue_free()


func check_flight_checkpoint_pairing(scene: Node3D, grounded: Vector3) -> void:
	var player: CharacterBody3D = scene.get_node("Player")
	scene.powers.toggle_flight()
	player.position = Vector3(grounded.x, 65, grounded.z)
	player.velocity = Vector3.ZERO
	for frame in range(4):
		await physics_frame
	check(scene.checkpoint.flush(), "active flight permits an airborne checkpoint")
	var state: Dictionary = scene.storage.load_state(PATH)
	check(
		state.hero_state.flying and state.position.y > 60,
		"flight checkpoint pairs altitude with enabled flight"
	)
	scene.powers.toggle_flight()
	player.set_physics_process(false)
	check(scene.checkpoint.flush(), "flight-off checkpoint can use the confirmed ground fallback")
	state = scene.storage.load_state(PATH)
	check(
		not state.hero_state.flying and state.position.distance_to(grounded) < 0.2,
		"flight-off checkpoint never pairs cached altitude with disabled flight"
	)
	var no_floor_path := "user://checkpoint_without_floor_test.json"
	DirAccess.remove_absolute(no_floor_path)
	var empty: Node = CHECKPOINT.new()
	scene.add_child(empty)
	empty.setup(scene, no_floor_path, true)
	empty.start()
	scene.powers.toggle_flight()
	player.set_physics_process(true)
	for frame in range(4):
		await physics_frame
	scene.powers.toggle_flight()
	player.set_physics_process(false)
	empty.request_save()
	check(
		not empty.flush() and empty.dirty and not FileAccess.file_exists(no_floor_path),
		"flight-off without a grounded fallback postpones automatic saving"
	)
	empty.queue_free()
	scene.checkpoint.flush()
	player.position = grounded + Vector3.UP * 0.05
	player.velocity = Vector3.ZERO
	player.set_physics_process(true)
	for frame in range(12):
		await physics_frame


func finish() -> void:
	print("CHECKPOINT_RESULT: %d checks, %d failures" % [checks, failures])
	quit(1 if failures else 0)
