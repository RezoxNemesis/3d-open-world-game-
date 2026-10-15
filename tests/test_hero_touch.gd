extends SceneTree
## Actual native finger ownership, simultaneous powers and involuntary cancellation.

const FIXTURE := preload("res://tests/scene_fixture.gd")
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
	root.size = Vector2i(1280, 720)
	root.content_scale_size = root.size
	var scene = load("res://scenes/main.tscn").instantiate()
	scene.settings_path = "user://hero_touch_settings_test.json"
	root.add_child(scene)
	await frames(60)
	var player = scene.get_node("Player")
	var powers = scene.get_node("HeroPowers")
	var controls = scene.get_node("HUD/HeroPowerControls")
	var mobile = scene.get_node("MobileControls")
	check(controls.buttons.size() == 5, "five functioning power actions use native touch buttons")
	for action in controls.buttons:
		check(controls.buttons[action] is TouchScreenButton, "native action target: " + action)
	await layout(scene, controls)
	var alone: Vector2 = controls.hit_rects.power_leap.get_center()
	await touch(8, alone, true)
	await frames(3)
	var alone_yaw: float = player.yaw
	await drag(8, alone + Vector2(9, 0), Vector2(9, 0))
	check(
		mobile.look_finger == -1 and is_equal_approx(player.yaw, alone_yaw),
		"a power-only press and drag never becomes the legacy look finger"
	)
	await touch(8, alone, false, true)
	var flight: Vector2 = controls.hit_rects.power_flight.get_center()
	await tap(10, flight)
	check(powers.flying, "real native FLY tap activates collision-aware flight")
	await process_frame
	check(controls.buttons.power_descend.visible, "DOWN native action appears only during flight")
	player.position = Vector3(0, 8, 12)
	await touch(11, controls.hit_rects.power_descend.get_center(), true)
	await frames(15)
	await touch(11, controls.hit_rects.power_descend.get_center(), false)
	check(player.position.y < 5, "native held DOWN moves the real flying capsule downward")
	await tap(10, flight)
	await reset_ground(player, powers)
	var move_point: Vector2 = mobile.joystick_center()
	await touch(2, move_point, true)
	await drag(2, move_point + Vector2(35, 0), Vector2(35, 0))
	await touch(3, Vector2(750, 300), true)
	var leap: Vector2 = controls.hit_rects.power_leap.get_center()
	await touch(4, leap, true)
	await frames(12)
	check(
		powers.charging and powers.charge_time > 0.1,
		"native held LEAP charges while movement and look fingers remain active"
	)
	check(
		mobile.move_finger == 2 and mobile.look_finger == 3,
		"power finger never steals independent movement or look ownership"
	)
	var yaw: float = player.yaw
	await drag(4, leap + Vector2(8, 0), Vector2(8, 0))
	check(is_equal_approx(player.yaw, yaw), "dragging a held power button never steers the camera")
	await drag(3, Vector2(770, 300), Vector2(20, 0))
	check(
		player.yaw < yaw - 0.02 and powers.charging,
		"independent look finger can steer while LEAP continues charging"
	)
	await touch(4, leap, false)
	await frames(3)
	check(
		player.velocity.y > 15 and player.position.y > 0.2,
		"deliberate native release launches the actual charged leap"
	)
	await touch(2, move_point, false)
	await touch(3, Vector2(770, 300), false)
	mobile.release_all_actions()
	await reset_ground(player, powers)
	for reason in ["canceled", "resize", "focus", "modal"]:
		await touch(5, leap, true)
		await frames(12)
		check(powers.charging, "charge begins before involuntary " + reason)
		match reason:
			"canceled":
				await touch(5, leap, false, true)
			"resize":
				controls.resize(Rect2(Vector2.ZERO, Vector2(root.size)), Vector2(root.size))
			"focus":
				controls._notification(Node.NOTIFICATION_WM_WINDOW_FOCUS_OUT)
			"modal":
				scene.toggle_map()
		await frames(5)
		check(
			(
				not powers.charging
				and not Input.is_action_pressed("power_leap")
				and not controls.buttons.power_leap.is_pressed()
			),
			"involuntary " + reason + " clears charge, action and native finger latch"
		)
		check(player.position.y < 0.05, "involuntary " + reason + " never launches the body")
		if reason == "modal":
			scene.toggle_map()
		await touch(5, leap, false)
	await tap(6, controls.hit_rects.power_speed.get_center())
	check(powers.fast, "actual native SPEED tap activates real ground speed mode")
	check(not controls.buttons.power_descend.visible, "DOWN target hides again after flight ends")
	root.size = Vector2i(960, 540)
	root.content_scale_size = root.size
	scene.resize_hud()
	await process_frame
	await layout(scene, controls)
	player.position = Vector3(0, 0.1, 12)
	player.velocity = Vector3.ZERO
	await frames(30)
	await tap(7, controls.hit_rects.power_flight.get_center())
	check(powers.flying, "actual compact native FLY tap activates the same real controller")
	controls.resize(Rect2(80, 0, 880, 540), Vector2(960, 540))
	await layout(scene, controls)
	check(
		controls.contains_point(controls.hit_rects.power_leap.get_center()),
		"published power hit-testing agrees with the actual compact native shape"
	)
	powers.restore_state({"flying": false, "fast": false, "destroyed": []})
	var world = scene.get_node("World")
	player.position = Vector3(100, world.terrain_height(100, 60) + 0.05, 60)
	player.velocity = Vector3.ZERO
	player.yaw = 0.0
	world.get_node("Regions").update_regions(player.position)
	await frames(4)
	await tap(9, controls.hit_rects.power_smash.get_center())
	check(
		powers.mountains.destroyed_ids().has("crag_east"),
		"actual compact native SMASH removes a real mountain formation"
	)
	controls.release_all_actions()
	await FIXTURE.dispose_scene(self, scene)
	print("HERO_TOUCH_RESULT: %d checks, %d failures" % [checks, failures])
	quit(1 if failures else 0)


func layout(scene: Node3D, controls: Control) -> void:
	var screen := Rect2(Vector2.ZERO, Vector2(root.size))
	var protected: Array[Rect2] = [
		scene.hud_panel.get_global_rect(), scene.quest_ui.minimap.get_global_rect()
	]
	var mobile = scene.get_node("MobileControls")
	for action in ["map_game", "settings_game", "sprint", "jump", "toggle_view"]:
		var button = mobile.buttons[action]
		var radius: float = button.shape.radius
		protected.append(Rect2(button.position - Vector2.ONE * radius, Vector2.ONE * radius * 2))
	var clear := true
	var inside := true
	var targets: Array[Rect2] = []
	for action in controls.buttons:
		if not controls.buttons[action].visible:
			continue
		var bounds: Rect2 = controls.hit_rects[action]
		inside = inside and screen.encloses(bounds) and bounds.size.x >= 48 and bounds.size.y >= 48
		for exclusion in protected + targets:
			clear = clear and not bounds.intersects(exclusion)
		targets.append(bounds)
	check(inside, "actual native power hit rectangles fit %s and remain at least48px" % root.size)
	check(clear, "native power hit rectangles avoid HUD/minimap/legacy controls and each other")
	var feedback: Rect2 = controls.feedback_bounds()
	var readable := screen.encloses(feedback)
	for target in targets:
		readable = readable and not feedback.intersects(target)
	check(readable, "actual font-metric feedback bounds avoid every native power target")


func reset_ground(player: CharacterBody3D, powers: Node) -> void:
	powers.restore_state({"flying": false, "fast": false, "destroyed": []})
	player.position = Vector3(0, 0.1, 12)
	player.velocity = Vector3.ZERO
	await frames(40)


func touch(index: int, point: Vector2, pressed: bool, canceled := false) -> void:
	var event := InputEventScreenTouch.new()
	event.index = index
	event.position = point
	event.pressed = pressed
	event.canceled = canceled
	root.push_input(event, true)
	await process_frame
	await physics_frame


func tap(index: int, point: Vector2) -> void:
	await touch(index, point, true)
	await touch(index, point, false)


func drag(index: int, point: Vector2, relative: Vector2) -> void:
	var event := InputEventScreenDrag.new()
	event.index = index
	event.position = point
	event.relative = relative
	root.push_input(event, true)
	await process_frame


func frames(count: int) -> void:
	for index in range(count):
		await physics_frame
