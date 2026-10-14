extends SceneTree

const SCENE_FIXTURE := preload("res://tests/scene_fixture.gd")
## Finger ownership, analog motion, camera safety and pause-release regressions.

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


func touch(index: int, position: Vector2, pressed: bool, canceled := false) -> void:
	var event := InputEventScreenTouch.new()
	event.index = index
	event.position = position
	event.pressed = pressed
	event.canceled = canceled
	root.push_input(event, true)
	await process_frame


func drag(index: int, position: Vector2, relative: Vector2) -> void:
	var event := InputEventScreenDrag.new()
	event.index = index
	event.position = position
	event.relative = relative
	root.push_input(event, true)
	await process_frame


func run() -> void:
	var scene = load("res://scenes/main.tscn").instantiate()
	root.add_child(scene)
	for i in range(60):
		await physics_frame
	var controls = scene.get_node("MobileControls")
	var player = scene.get_node("Player")
	var viewport_size: Vector2 = controls.get_viewport_rect().size
	var floating_point := viewport_size * Vector2(0.29, 0.74)
	await touch(2, floating_point, true)
	check(controls.move_finger == 2, "lower-left touch claims movement beyond the old fixed ring")
	await drag(2, floating_point + Vector2(60, 0), Vector2(60, 0))
	check(
		Input.get_action_strength("move_right") > 0.75, "floating joystick anchors to touch origin"
	)
	await touch(2, floating_point, false)
	controls.release_all_actions()
	var edge_point := Vector2(18, viewport_size.y - 18)
	await touch(2, edge_point, true)
	check(
		(
			Input.get_vector("move_left", "move_right", "move_forward", "move_backward", 0.0)
			== Vector2.ZERO
		),
		"edge touch does not move before the thumb drags"
	)
	await touch(2, edge_point, false)
	var center: Vector2 = controls.joystick_center()
	await touch(3, center, true)
	await drag(3, center + Vector2(4, 0), Vector2(4, 0))
	check(
		Input.get_action_strength("move_right") == 0, "small finger jitter stays inside dead zone"
	)
	await drag(3, center + Vector2(28, 0), Vector2(24, 0))
	var analog_strength := Input.get_action_strength("move_right")
	check(
		analog_strength > 0.1 and analog_strength < 0.6,
		"partial stick travel produces analog walking"
	)
	for i in range(12):
		await physics_frame
	var analog_speed: float = Vector2(player.velocity.x, player.velocity.z).length()
	check(
		analog_speed > 0.2 and analog_speed < 2.8,
		"partial stick travel moves the real body below full walking speed"
	)
	var look_start := Vector2(viewport_size.x * 0.69, viewport_size.y * 0.48)
	await touch(4, look_start, true)
	check(
		controls.look_finger == 4 and controls.move_finger == 3,
		"separate fingers own look and movement"
	)
	var yaw_before: float = player.yaw
	await drag(4, look_start + Vector2(40, 0), Vector2(40, 0))
	check(absf(player.yaw - yaw_before) > 0.05, "look swipe turns while walking remains active")
	check(Input.get_action_strength("move_right") > 0.1, "camera swipe preserves the moving finger")
	if controls.buttons.has("sprint"):
		var run_position: Vector2 = controls.buttons["sprint"].position
		await touch(5, run_position, true)
		check(
			Input.is_action_pressed("sprint"), "third finger can hold RUN while moving and looking"
		)
		check(
			controls.move_finger == 3 and controls.look_finger == 4,
			"RUN button does not steal either gesture"
		)
		await touch(5, run_position, false)
		check(
			not Input.is_action_pressed("sprint"),
			"lifting RUN finger releases sprint independently"
		)
	await touch(4, look_start, false)
	await touch(3, center, true, true)
	check(controls.move_finger == -1, "canceled movement touch releases its finger")
	check(
		Input.get_action_strength("move_right") == 0,
		"canceled movement cannot leave a stuck action"
	)
	controls.release_all_actions()
	check(
		controls.has_method("configure_controls"),
		"touch sensitivity and joystick scale are configurable"
	)
	if controls.has_method("configure_controls"):
		controls.configure_controls(0.4, 1.2)
		await touch(4, look_start, true)
		yaw_before = player.yaw
		await drag(4, look_start + Vector2(40, 0), Vector2(40, 0))
		var slow_turn: float = absf(player.yaw - yaw_before)
		await touch(4, look_start, false)
		controls.configure_controls(1.4, 1.2)
		await touch(4, look_start, true)
		yaw_before = player.yaw
		await drag(4, look_start + Vector2(40, 0), Vector2(40, 0))
		check(
			absf(player.yaw - yaw_before) > slow_turn * 2,
			"configured sensitivity changes actual swipe response"
		)
		await touch(4, look_start, false)
		controls.configure_controls(1.0, 1.0)
	check(player.has_method("set_camera_distance"), "third-person distance is configurable")
	if player.has_method("set_camera_distance"):
		player.set_camera_distance(4.5)
		# Camera damping integrates delta; physics frames guarantee one simulated
		# second even when a hosted headless renderer runs hundreds of FPS.
		for i in range(60):
			await physics_frame
		var spring = player.pivot.get_child(0)
		check(
			absf(spring.spring_length - 4.5) < 0.1, "camera distance converges to the selected zoom"
		)
	check(player.has_method("rotate_camera"), "touch camera has bounded damped target rotation")
	if player.has_method("rotate_camera"):
		player.rotate_camera(Vector2(0, -50000), 1.0)
		check(player.pitch <= 0.10, "upward swipes cannot drive camera below ground")
		player.rotate_camera(Vector2(0, 50000), 1.0)
		check(player.pitch >= -0.85, "downward swipes stop before disorienting overhead rotation")
		player.pitch = -0.28
		player.update_camera()
		var previous_yaw: float = player.pivot.rotation.y
		player.rotate_camera(Vector2(120, 0), 1.0)
		check(
			absf(player.pivot.rotation.y - previous_yaw) < 0.001,
			"swipe changes target without snapping the actual camera"
		)
		for i in range(30):
			await physics_frame
		check(
			absf(angle_difference(player.pivot.rotation.y, player.yaw)) < 0.02,
			"damped camera settles onto the swipe target"
		)
	Input.mouse_mode = Input.MOUSE_MODE_VISIBLE
	var mouse := InputEventMouseButton.new()
	mouse.button_index = MOUSE_BUTTON_LEFT
	mouse.pressed = true
	mouse.device = -1
	root.push_input(mouse, true)
	await process_frame
	check(
		Input.mouse_mode == Input.MOUSE_MODE_VISIBLE,
		"touch-emulated mouse click does not capture the cursor"
	)
	if InputMap.has_action("sprint"):
		player.yaw = 0.0
		player.update_camera()
		Input.action_press("move_forward")
		for i in range(20):
			await physics_frame
		var walking_speed: float = Vector2(player.velocity.x, player.velocity.z).length()
		Input.action_press("sprint")
		for i in range(25):
			await physics_frame
		check(
			Vector2(player.velocity.x, player.velocity.z).length() > walking_speed * 1.3,
			"held RUN increases grounded travel speed"
		)
		controls.release_all_actions()
		check(not Input.is_action_pressed("sprint"), "pause or focus loss releases held sprint")
	else:
		check(false, "held RUN action exists")
	root.content_scale_size = Vector2i(960, 540)
	root.size = Vector2i(960, 540)
	controls.resize_controls()
	await process_frame
	for action in ["jump", "toggle_view", "sprint", "map_game", "settings_game"]:
		if not controls.buttons.has(action):
			check(false, "ergonomic " + action + " button exists")
			continue
		var button = controls.buttons[action]
		var radius: float = button.shape.radius
		var position: Vector2 = button.position
		check(
			(
				radius >= 24
				and position.x - radius > 0
				and position.x + radius < 960
				and position.y - radius > 0
				and position.y + radius < 540
			),
			"small-screen " + action + " has a usable target inside screen"
		)
	controls.release_all_actions()
	root.content_scale_size = Vector2i(1920, 720)
	root.size = Vector2i(1920, 720)
	controls.resize_controls()
	await process_frame
	check(
		controls.buttons["jump"].position.x > 1750 and controls.joystick_center().x < 200,
		"ultrawide layout keeps controls anchored at thumb edges"
	)
	player.velocity.x = 3.0
	await touch(5, controls.buttons["sprint"].position, true)
	controls._notification(Control.NOTIFICATION_APPLICATION_FOCUS_OUT)
	check(
		player.velocity.x == 0 and not Input.is_action_pressed("sprint"),
		"focus loss stops horizontal drift and sprint"
	)
	check(
		not controls.buttons["sprint"].is_pressed(),
		"focus loss clears the physical RUN button latch"
	)
	await touch(5, controls.buttons["sprint"].position, false)
	print("MOBILE_RESULT: %d checks, %d failures" % [checks, failures])
	await SCENE_FIXTURE.dispose_scene(self, scene)
	quit(1 if failures else 0)
