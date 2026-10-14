extends SceneTree

const SCENE_FIXTURE := preload("res://tests/scene_fixture.gd")

var checks := 0
var failures := 0
var signal_count := 0


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
	var scene = load("res://scenes/main.tscn").instantiate()
	root.add_child(scene)
	await process_frame
	var controls = scene.get_node("MobileControls")
	var actions := [
		"move_left",
		"move_right",
		"move_forward",
		"move_backward",
		"jump",
		"toggle_view",
		"save_game",
		"load_game",
		"map_game"
	]
	for action in actions:
		if InputMap.has_action(action):
			Input.action_press(action)
	controls._notification(Control.NOTIFICATION_APPLICATION_FOCUS_OUT)
	for action in actions:
		check(
			InputMap.has_action(action) and not Input.is_action_pressed(action),
			"focus loss releases " + action
		)
	check(controls.move_finger == -1 and controls.look_finger == -1, "focus loss clears fingers")
	var exploration = scene.get_node_or_null("Exploration")
	check(exploration != null, "main scene owns an exploration quest")
	if exploration == null:
		await SCENE_FIXTURE.dispose_scene(self, scene)
		finish()
		return
	exploration.set_process(false)
	scene.set_process(false)
	exploration.discovered.clear()
	exploration.changed.connect(func(): signal_count += 1)
	var player = scene.get_node("Player")
	player.set_physics_process(false)
	check(exploration.landmarks.size() == 3, "three playable landmarks define the district")
	check(exploration.current_objective().contains("Sanctuary"), "quest begins at sanctuary")
	var initial: Vector3 = player.position
	scene.update_hud()
	var start_status: String = scene.status.text
	player.position = Vector3.ZERO
	scene.update_hud()
	check(scene.status.text != start_status, "live objective distance follows player position")
	player.position = initial
	check(not exploration.travel("unknown", player), "unknown travel target rejected")
	check(not exploration.travel("lotus", player), "undiscovered waypoint travel rejected")
	check(player.position.is_equal_approx(initial), "rejected travel preserves position")
	exploration.visit(Vector3(0, 1.8, -8.9))
	check(not exploration.discovered.has("sanctuary"), "landmark outside seven meters stays locked")
	exploration.visit(Vector3(0, 1.8, -9.1))
	check(exploration.discovered.has("sanctuary"), "walking inside radius discovers sanctuary")
	check(signal_count == 1, "first discovery emits one quest update")
	exploration.visit(Vector3(0, 1.8, -16))
	check(signal_count == 1, "revisiting discovered landmark emits no duplicate update")
	check(exploration.current_objective().contains("Lotus"), "quest advances to lotus overlook")
	player.velocity = Vector3(2, -4, 1)
	check(exploration.travel("sanctuary", player), "discovered sanctuary allows travel")
	check(player.velocity == Vector3.ZERO, "travel resets movement velocity")
	check(player.position.distance_to(Vector3(0, 1.8, -16)) < 0.3, "travel lands at sanctuary")
	exploration.visit(Vector3(-30, 0, 1))
	check(exploration.current_objective().contains("Gate"), "quest advances to eastern gate")
	exploration.visit(Vector3(30, 0, -4))
	check(
		exploration.discovered.size() == 3, "physically visiting all landmarks completes discovery"
	)
	check(
		exploration.current_objective().contains("complete"), "completed quest reports completion"
	)
	scene.set_process(true)
	await process_frame
	check(scene.status.text.contains("3 / 3"), "HUD displays live discovery progress")
	Input.action_press("map_game")
	await process_frame
	await process_frame
	Input.action_release("map_game")
	await process_frame
	check(scene.map_overlay.visible, "map action opens district map")
	check(not player.is_physics_processing(), "open map stops player movement")
	var target_button: Button = scene.map_buttons["lotus"]
	check(not target_button.disabled, "discovered map landmark enables travel")
	var tap := InputEventMouseButton.new()
	tap.button_index = MOUSE_BUTTON_LEFT
	tap.position = target_button.get_global_rect().get_center()
	tap.pressed = true
	root.push_input(tap, true)
	await process_frame
	tap = tap.duplicate()
	tap.pressed = false
	root.push_input(tap, true)
	await process_frame
	check(
		player.position.distance_to(Vector3(-30, 0, 1)) < 0.3, "map landmark performs real travel"
	)
	check(not scene.map_overlay.visible, "successful map travel closes map")
	exploration.discovered.erase("gate")
	scene.toggle_map()
	check(scene.map_buttons["gate"].disabled, "undiscovered map landmark remains locked")
	scene.toggle_map()
	await process_frame
	var map_touch := InputEventScreenTouch.new()
	map_touch.index = 4
	map_touch.position = controls.buttons["map_game"].position
	map_touch.pressed = true
	root.push_input(map_touch, true)
	await process_frame
	await process_frame
	check(scene.map_overlay.visible, "touch map button opens map without steering player")
	check(controls.look_finger == -1 and controls.move_finger == -1, "map clears active gestures")
	map_touch = map_touch.duplicate()
	map_touch.pressed = false
	root.push_input(map_touch, true)
	scene.toggle_map()
	root.content_scale_size = Vector2i(960, 540)
	root.size = Vector2i(960, 540)
	controls.resize_controls()
	scene.resize_hud()
	await process_frame
	for action in controls.buttons:
		var center: Vector2 = controls.buttons[action].position
		check(
			center.x > 35 and center.x < 925 and center.y > 35 and center.y < 505,
			"small viewport keeps " + action + " inside screen"
		)
	check(scene.hud_panel.size.x < 960 - 280, "quest panel leaves room for top action buttons")
	await check_distant_load(scene, player)
	await SCENE_FIXTURE.dispose_scene(self, scene)
	finish()


func check_distant_load(scene: Node3D, player: CharacterBody3D) -> void:
	player.set_physics_process(false)
	var world := scene.get_node("World")
	var regions := world.get_node("Regions")
	regions.update_regions(Vector3.ZERO)
	regions.refresh_time = 0.0
	var terrain_y: float = world.terrain_height(256, 0)
	var saved_point := Vector3(256, terrain_y + 0.05, 0)
	var path := "user://distant_test_save.json"
	check(scene.storage.save_position(saved_point, path), "distant save fixture writes safely")
	scene.load_game(path)
	DirAccess.remove_absolute(path)
	check(regions.active.has(Vector2i(2, 0)), "load prepares distant terrain before next frame")
	player.set_physics_process(true)
	for frame in range(120):
		await physics_frame
	check(player.is_on_floor(), "restored distant player settles on terrain collision")
	check(absf(player.position.x - 256) < 0.1, "distant load stays in the restored region")
	check(absf(player.position.y - terrain_y) < 0.15, "distant load remains above terrain surface")


func finish() -> void:
	print("EXPLORATION RESULT: %d checks, %d failures" % [checks, failures])
	quit(1 if failures else 0)
