extends SceneTree

const SCENE_FIXTURE := preload("res://tests/scene_fixture.gd")

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


func run() -> void:
	check(ResourceLoader.exists("res://scripts/game_settings.gd"), "settings storage exists")
	if failures:
		finish()
		return
	var settings = load("res://scripts/game_settings.gd").new()
	var path := "user://settings_test.json"
	DirAccess.remove_absolute(path)
	settings.load_settings(path)
	check(settings.values.quality == "balanced", "missing settings use mobile balanced default")
	check(settings.set_value("quality", "high"), "high quality selection accepted")
	check(settings.set_value("sensitivity", 1.5), "valid sensitivity accepted")
	check(settings.set_value("joystick_scale", 1.2), "valid movement pad size accepted")
	check(settings.set_value("camera_distance", 7.0), "valid camera distance accepted")
	check(settings.save_settings(path), "settings persist atomically")
	var restored = settings.get_script().new()
	restored.load_settings(path)
	check(restored.values == settings.values, "all settings restore across a fresh store")
	check(settings.set_value("sensitivity", 0.4), "exact minimum sensitivity accepted")
	check(settings.set_value("joystick_scale", 1.4), "exact maximum movement pad size accepted")
	check(not settings.set_value("sensitivity", -1.0), "negative sensitivity rejected")
	check(not settings.set_value("sensitivity", INF), "infinite sensitivity rejected")
	check(not settings.set_value("joystick_scale", "large"), "text pad size rejected")
	check(not settings.set_value("camera_distance", 1000), "unsafe camera distance rejected")
	check(not settings.set_value("quality", "ultra"), "unknown quality rejected")
	check(not settings.set_value("unknown", 1), "unknown setting rejected")
	for payload in [
		"broken json",
		'{"version":99,"values":{"quality":"high"}}',
		'{"version":true,"values":{"quality":"high"}}',
		'{"version":"1","values":{"quality":"high"}}',
		'{"version":[],"values":{"quality":"high"}}',
		"null",
		" ".repeat(4097)
	]:
		write_fixture(path, payload)
		restored.load_settings(path)
		check(restored.values.quality == "balanced", "invalid settings file falls back safely")
	write_fixture(
		path,
		JSON.stringify(
			{
				"version": 1,
				"values":
				{
					"quality": "performance",
					"sensitivity": -9,
					"joystick_scale": 1.1,
					"camera_distance": "far"
				}
			}
		)
	)
	restored.load_settings(path)
	check(restored.values.quality == "performance", "valid fields survive malformed neighbors")
	check(restored.values.sensitivity == 1.0, "bad numeric field gets safe default")
	check(restored.values.joystick_scale == 1.1, "valid numeric field restores")
	check(restored.values.camera_distance == 6.0, "wrong field type gets safe default")
	DirAccess.remove_absolute(path)
	await check_settings_overlay()
	finish()


func write_fixture(path: String, content: String) -> void:
	var file := FileAccess.open(path, FileAccess.WRITE)
	file.store_string(content)
	file.close()


func check_settings_overlay() -> void:
	var scene = load("res://scenes/main.tscn").instantiate()
	scene.settings_path = "user://settings_overlay_test.json"
	root.add_child(scene)
	await process_frame
	var player = scene.get_node("Player")
	var mobile = scene.get_node("MobileControls")
	check(scene.has_method("toggle_settings"), "main exposes functioning settings overlay")
	if not scene.has_method("toggle_settings"):
		await SCENE_FIXTURE.dispose_scene(self, scene)
		return
	Input.action_press("move_forward")
	Input.action_press("sprint")
	scene.toggle_settings()
	check(scene.settings_overlay.visible, "settings opens a real visible overlay")
	check(not player.is_physics_processing(), "settings pauses player movement")
	check(not mobile.visible, "settings hides play controls")
	check(not Input.is_action_pressed("move_forward"), "settings releases movement")
	check(not Input.is_action_pressed("sprint"), "settings releases sprint")
	scene.quality_buttons["performance"].emit_signal("pressed")
	check(scene.settings.values.quality == "performance", "quality button changes selected preset")
	check(is_equal_approx(root.scaling_3d_scale, 0.70), "performance lowers rendering resolution")
	check(root.msaa_3d == Viewport.MSAA_DISABLED, "performance avoids multisample cost")
	check(scene.get_node("World").quality_preset == "performance", "quality reaches world detail")
	for key in scene.settings_sliders:
		var slider: HSlider = scene.settings_sliders[key]
		for endpoint in [slider.min_value, slider.max_value]:
			slider.value = endpoint
			check(
				is_equal_approx(scene.settings.values[key], endpoint),
				"%s slider accepts exact endpoint %.2f" % [key, endpoint]
			)
			var consumer: Node = player if key == "camera_distance" else mobile
			check(
				is_equal_approx(consumer.get(key), endpoint),
				"%s endpoint %.2f reaches play behavior" % [key, endpoint]
			)
	scene.settings_sliders["sensitivity"].value = 1.5
	scene.settings_sliders["joystick_scale"].value = 1.2
	scene.settings_sliders["camera_distance"].value = 7.0
	check(is_equal_approx(mobile.sensitivity, 1.5), "look slider updates touch behavior")
	check(is_equal_approx(mobile.joystick_scale, 1.2), "pad slider updates touch layout")
	check(is_equal_approx(player.camera_distance, 7.0), "distance slider updates camera")
	scene.toggle_map()
	check(scene.map_overlay.visible and not scene.settings_overlay.visible, "map replaces settings")
	check(not player.is_physics_processing(), "switching overlay preserves movement pause")
	var persisted = scene.settings.get_script().new()
	persisted.load_settings(scene.settings_path)
	check(persisted.values == scene.settings.values, "closing settings flushes slider choices")
	scene.settings_sliders["sensitivity"].value = 1.7
	scene._notification(Node.NOTIFICATION_APPLICATION_FOCUS_OUT)
	persisted.load_settings(scene.settings_path)
	check(
		is_equal_approx(persisted.values.sensitivity, 1.7),
		"leaving the app flushes pending settings changes"
	)
	scene.toggle_map()
	check(player.is_physics_processing() and mobile.visible, "closing overlay restores play")
	scene.settings.reset_defaults()
	scene.apply_settings()
	check(root.msaa_3d == Viewport.MSAA_2X, "balanced smooths geometry edges")
	DirAccess.remove_absolute(scene.settings_path)
	await SCENE_FIXTURE.dispose_scene(self, scene)


func finish() -> void:
	print("SETTINGS RESULT: %d checks, %d failures" % [checks, failures])
	quit(1 if failures else 0)
