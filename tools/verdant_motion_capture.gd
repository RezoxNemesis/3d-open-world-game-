extends SceneTree
## Fixed-time real gameplay frames, native touch events and actual player telemetry.

const FIXTURE := preload("res://tests/scene_fixture.gd")
const HASHES := preload("res://tools/verdant_capture.gd")
const FPS := 20
const SETTINGS_PATH := "user://qa-verdant-motion-settings.json"
var scene: Node3D
var player: CharacterBody3D
var powers: Node
var report: Dictionary
var output: String
var mode := "traversal"
var quality := "balanced"
var frame_number := 0
var failed := false
var movement_center := Vector2.ZERO
var started_msec := 0


func _initialize() -> void:
	if "--abilities" in OS.get_cmdline_user_args():
		mode = "abilities"
	if "--performance" in OS.get_cmdline_user_args():
		quality = "performance"
	call_deferred("record")


func record() -> void:
	output = "res://artifacts/verdant-qa/motion/" + mode + "/"
	DirAccess.make_dir_recursive_absolute(output)
	root.size = Vector2i(960, 540)
	root.content_scale_size = root.size
	report = {
		"schema_version": 1,
		"mode": mode,
		"captured_utc": Time.get_datetime_string_from_system(true),
		"renderer": RenderingServer.get_video_adapter_name(),
		"display_server": DisplayServer.get_name(),
		"playback_fps": FPS,
		"quality_preset": quality,
		"coverage":
		"Fixed-time real game physics with native desktop ScreenTouch/ScreenDrag; not phone FPS.",
		"inputs_sha256": HASHES.input_hashes(),
		"checks": [],
		"frames": [],
		"native_events": []
	}
	report.inputs_sha256["tools/verdant_motion_capture.gd"] = FileAccess.get_sha256(
		"res://tools/verdant_motion_capture.gd"
	)
	for path in ["tools/record_verdant_gameplay.sh", "tools/check_verdant_motion_evidence.py"]:
		report.inputs_sha256[path] = FileAccess.get_sha256("res://" + path)
	scene = load("res://scenes/main.tscn").instantiate()
	scene.settings_path = SETTINGS_PATH
	root.add_child(scene)
	scene.settings.reset_defaults()
	scene.settings.set_value("quality", quality)
	scene.apply_settings()
	player = scene.get_node("Player")
	for frame in range(30):
		await process_frame
	started_msec = Time.get_ticks_msec()
	if mode == "traversal":
		await traverse()
	else:
		powers = player.get("powers")
		check(is_instance_valid(powers), "real HeroPowers controller is attached")
		if is_instance_valid(powers):
			await abilities()
	report["recording_wall_seconds"] = (Time.get_ticks_msec() - started_msec) / 1000.0
	report["frame_count"] = frame_number
	report["playback_seconds"] = float(frame_number) / FPS
	check(frame_number >= FPS * 15, "at least fifteen seconds of actual game frames")
	var file := FileAccess.open(output + "motion-provenance.json", FileAccess.WRITE)
	if file != null:
		file.store_string(JSON.stringify(report, "\t") + "\n")
		file.close()
	else:
		failed = true
	await FIXTURE.dispose_scene(self, scene)
	DirAccess.remove_absolute(SETTINGS_PATH)
	quit(1 if failed else 0)


func traverse() -> void:
	await place(Vector3(-30, 0.1, 1), 0)
	await frames(FPS, "lotus approach")
	await movement(Vector2.UP)
	await frames(FPS * 9, "real stair and covered bridge ascent")
	await release_movement()
	check(
		player.position.distance_to(Vector3(-30, 6, -43)) < 3 and player.is_on_floor(),
		"native movement reaches six-meter shrine through stairs and covered bridge"
	)
	await frames(FPS, "shrine arrival")
	await movement(Vector2.DOWN)
	await frames(FPS * 9, "real return over bridge and down stairs")
	await release_movement()
	check(
		player.position.z > -2 and absf(player.position.y) < 0.1 and player.is_on_floor(),
		"native movement returns to original zero-meter lotus approach"
	)
	await frames(FPS, "returned to lotus")


func abilities() -> void:
	await place(Vector3(20, 0.1, 39.5), 0)
	await frames(FPS, "residence front stairs before native traversal")
	await movement(Vector2.UP)
	await frames(FPS * 3, "native walking through front and rear furnished rooms")
	await release_movement()
	check(
		player.position.z < 27 and absf(player.position.y - 0.6) < 0.1 and player.is_on_floor(),
		"native movement crosses residence steps and both real room doorways"
	)
	player.yaw = PI
	player.update_camera()
	await frames(FPS, "turn inside the furnished bedroom")
	await movement(Vector2.UP)
	await frames(FPS * 3, "native return through house and down front stairs")
	await release_movement()
	check(
		player.position.z > 39 and absf(player.position.y) < 0.1 and player.is_on_floor(),
		"native movement exits the residence to the supported ground approach"
	)
	await place(Vector3(0, 0.1, 13), 0)
	await frames(FPS, "flight before activation")
	await action("power_flight", true)
	await action("power_flight", false)
	check(powers.flying, "native FLY enters actual flight")
	var initial: Vector3 = player.position
	await action("jump", true, 71)
	await frames(FPS * 2, "flight ascent with native JUMP")
	await action("jump", false, 71)
	await movement(Vector2.UP)
	await frames(FPS * 2, "collision-aware flight forward")
	await release_movement()
	check(
		player.position.y > initial.y + 25 and player.position.distance_to(initial) > 40,
		"flight moves the actual capsule vertically and horizontally"
	)
	await action("power_flight", true)
	await action("power_flight", false)
	await place(Vector3(0, 0.1, 13), 0)
	await action("power_leap", true)
	await frames(22, "native held LEAP charge")
	await action("power_leap", false)
	initial = player.position
	var leap_apex := initial.y
	for frame in range(FPS * 4):
		await frames(1, "released charged leap")
		leap_apex = maxf(leap_apex, player.position.y)
	check(leap_apex > initial.y + 35, "released native charge creates a high real leap")
	var world: Node3D = scene.get_node("World")
	await place(Vector3(0, world.terrain_height(0, 60) + 0.1, 60), PI)
	await action("power_speed", true)
	await action("power_speed", false)
	check(powers.fast, "native SPEED activates actual fast mode")
	initial = player.position
	await movement(Vector2.UP)
	await frames(FPS * 4, "high speed across streamed terrain")
	await release_movement()
	check(
		player.position.distance_to(initial) > 170, "actual speed travel crosses a streamed region"
	)
	await action("power_speed", true)
	await action("power_speed", false)
	await place(Vector3(100, world.terrain_height(100, 56) + 0.1, 56), 0)
	await frames(FPS, "marked mountain before smash")
	var before: Array = powers.snapshot().destroyed.duplicate()
	await action("power_smash", true)
	await action("power_smash", false)
	await frames(FPS * 3, "real mountain destruction and bounded debris")
	check(
		powers.snapshot().destroyed.size() > before.size(), "native SMASH destroys a real formation"
	)


func place(point: Vector3, heading: float) -> void:
	if is_instance_valid(powers):
		powers.cancel_actions()
		if powers.flying:
			powers.toggle_flight()
		if powers.fast:
			powers.toggle_speed()
	scene.get_node("MobileControls").release_all_actions()
	player.position = point
	player.velocity = Vector3.ZERO
	player.yaw = heading
	player.pitch = -0.16
	player.update_camera()
	for frame in range(12):
		await process_frame


func movement(direction: Vector2) -> void:
	var mobile: Control = scene.get_node("MobileControls")
	movement_center = mobile.joystick_center()
	var event := InputEventScreenTouch.new()
	event.index = 80
	event.position = movement_center
	event.pressed = true
	root.push_input(event, true)
	await process_frame
	var drag := InputEventScreenDrag.new()
	drag.index = 80
	drag.position = movement_center + direction * mobile.joystick_travel()
	drag.relative = direction * mobile.joystick_travel()
	root.push_input(drag, true)
	report.native_events.append(
		{"frame": frame_number, "action": "movement", "direction": [direction.x, direction.y]}
	)
	await process_frame


func release_movement() -> void:
	var event := InputEventScreenTouch.new()
	event.index = 80
	event.position = movement_center
	event.pressed = false
	root.push_input(event, true)
	await process_frame


func action(action_name: String, pressed: bool, finger := 70) -> void:
	var target: TouchScreenButton
	for button in scene.find_children("*", "TouchScreenButton", true, false):
		if button.action == action_name and button.is_visible_in_tree():
			target = button
			break
	if target == null:
		check(false, "visible native button for " + action_name)
		return
	var event := InputEventScreenTouch.new()
	event.index = finger
	event.position = target.global_position
	event.pressed = pressed
	root.push_input(event, true)
	report.native_events.append({"frame": frame_number, "action": action_name, "pressed": pressed})
	await process_frame


func frames(count: int, phase: String) -> void:
	for index in range(count):
		await process_frame
		await RenderingServer.frame_post_draw
		var image := root.get_texture().get_image()
		var filename := "frame-%05d.png" % frame_number
		if image.save_png(output + filename) != OK:
			check(false, "save video frame " + filename)
		var point: Vector3 = player.position
		report.frames.append(
			{
				"frame": frame_number,
				"phase": phase,
				"position": [point.x, point.y, point.z],
				"grounded": player.is_on_floor()
			}
		)
		frame_number += 1
		if frame_number % FPS == 0:
			print("VERDANT_MOTION: %s %ds %s" % [mode, frame_number / FPS, phase])


func check(condition: bool, label: String) -> void:
	report.checks.append({"label": label, "passed": condition})
	failed = failed or not condition
	print(("PASS: " if condition else "FAIL: ") + label)
	if not condition:
		push_error("VERDANT_MOTION: " + label)
