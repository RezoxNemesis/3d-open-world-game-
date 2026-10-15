extends SceneTree
## Real two-finger movement, camera and native RUN cancellation coverage.

const FIXTURE := preload("res://tests/scene_fixture.gd")
const SETTINGS_PATH := "user://sprint_assist_test.json"
var checks := 0
var failures := 0
var controls
var player


func check(value: bool, label: String) -> void:
	checks += 1
	if value:
		print("PASS: " + label)
	else:
		failures += 1
		push_error("FAIL: " + label)


func _initialize() -> void:
	call_deferred("run")


func touch(index: int, point: Vector2, pressed: bool, canceled := false) -> void:
	var event := InputEventScreenTouch.new()
	event.index = index
	event.position = point
	event.pressed = pressed
	event.canceled = canceled
	root.push_input(event, true)
	await process_frame


func drag(index: int, point: Vector2, relative: Vector2) -> void:
	var event := InputEventScreenDrag.new()
	event.index = index
	event.position = point
	event.relative = relative
	root.push_input(event, true)
	await process_frame


func activate_assist() -> Vector2:
	controls.configure_controls(1.0, 1.0, true)
	var center: Vector2 = controls.joystick_center()
	await touch(70, center, true)
	await drag(70, center - Vector2(0, controls.joystick_travel()), Vector2(0, -70))
	return center


func run() -> void:
	var settings = load("res://scripts/game_settings.gd").new()
	check(settings.values.has("sprint_assist"), "optional sprint assistance setting exists")
	if failures:
		finish()
		return
	check(settings.values.sprint_assist == false, "sprint assistance defaults off")
	for invalid in [0, 1, 1.0, "true", null, [], {}]:
		check(
			not settings.set_value("sprint_assist", invalid), "sprint assistance rejects nonboolean"
		)
	check(settings.set_value("sprint_assist", true), "strict boolean enables sprint assistance")
	check(settings.save_settings(SETTINGS_PATH), "sprint preference saves atomically")
	var restored = settings.get_script().new()
	restored.load_settings(SETTINGS_PATH)
	check(restored.values.sprint_assist == true, "sprint preference restores")
	var file := FileAccess.open(SETTINGS_PATH, FileAccess.WRITE)
	file.store_string('{"version":1,"values":{"quality":"performance","sprint_assist":1}}')
	file.close()
	restored.load_settings(SETTINGS_PATH)
	check(
		not restored.values.sprint_assist and restored.values.quality == "performance",
		"malformed bool falls back without discarding valid settings"
	)
	file = FileAccess.open(SETTINGS_PATH, FileAccess.WRITE)
	file.store_string('{"version":1,"values":{"quality":"balanced"}}')
	file.close()
	restored.load_settings(SETTINGS_PATH)
	check(not restored.values.sprint_assist, "legacy settings migrate with assistance disabled")
	DirAccess.remove_absolute(SETTINGS_PATH)
	var scene = load("res://scenes/main.tscn").instantiate()
	scene.settings_path = SETTINGS_PATH
	scene.autosave_enabled = false
	root.add_child(scene)
	for frame in range(60):
		await physics_frame
	controls = scene.get_node("MobileControls")
	player = scene.get_node("Player")
	scene.toggle_settings()
	scene.sprint_assist_toggle.button_pressed = true
	check(
		scene.settings.values.sprint_assist and controls.sprint_assist,
		"settings checkbox enables the actual movement-pad assistance"
	)
	scene.sprint_assist_toggle.button_pressed = false
	check(
		not scene.settings.values.sprint_assist and not controls.sprint_assist,
		"settings checkbox restores default walking behavior"
	)
	scene.toggle_settings()
	controls.configure_controls(1.0, 1.0)
	check(not controls.sprint_assist, "legacy two-argument configuration preserves walking")
	var center: Vector2 = await activate_assist()
	check(player.sprint_enabled, "outer pad deflection enables independent sprint state")
	check(not Input.is_action_pressed("sprint"), "assistance never synthesizes native RUN")
	for frame in range(18):
		await physics_frame
	check(
		Vector2(player.velocity.x, player.velocity.z).length() > 6.8,
		"two-thumb assist moves the actual capsule at sprint speed"
	)
	var look: Vector2 = controls.size * Vector2(0.67, 0.48)
	await touch(71, look, true)
	var yaw: float = player.yaw
	await drag(71, look + Vector2(45, 0), Vector2(45, 0))
	check(
		absf(player.yaw - yaw) > 0.08 and player.sprint_enabled,
		"second thumb turns camera while assisted sprint continues"
	)
	await touch(71, look, false)
	await drag(70, center - Vector2(0, controls.joystick_travel() * 0.70), Vector2(0, 20))
	check(not player.sprint_enabled, "partial pad travel returns to walking")
	for frame in range(15):
		await physics_frame
	check(
		Vector2(player.velocity.x, player.velocity.z).length() < 5.0,
		"actual capsule slows after easing the movement pad"
	)
	var run_point: Vector2 = controls.buttons.sprint.position
	await touch(72, run_point, true)
	controls.release_movement()
	check(
		Input.is_action_pressed("sprint"),
		"clearing assistance preserves separately held native RUN"
	)
	await touch(72, run_point, false)
	for cause in ["cancel", "focus", "resize", "map", "disable", "release"]:
		center = await activate_assist()
		match cause:
			"cancel":
				await touch(70, center, false, true)
			"focus":
				controls._notification(Node.NOTIFICATION_APPLICATION_FOCUS_OUT)
			"resize":
				controls.resize_controls()
			"map":
				scene.toggle_map()
			"disable":
				controls.configure_controls(1.0, 1.0, false)
			"release":
				controls.release_movement()
		check(
			not player.sprint_enabled and not controls.assist_running,
			cause + " clears assisted sprint"
		)
		if scene.map_overlay.visible:
			scene.toggle_map()
	controls.release_all_actions()
	await FIXTURE.dispose_scene(self, scene)
	DirAccess.remove_absolute(SETTINGS_PATH)
	finish()


func finish() -> void:
	print("SPRINT_ASSIST_RESULT: %d checks, %d failures" % [checks, failures])
	quit(1 if failures else 0)
