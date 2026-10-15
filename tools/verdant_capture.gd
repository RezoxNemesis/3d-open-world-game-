extends SceneTree
## Final in-game art and native-control pixels. Never substitutes for phone timing.

const FIXTURE := preload("res://tests/scene_fixture.gd")
const OUTPUT := "res://artifacts/verdant-qa/final-views/"
const SETTINGS_PATH := "user://qa-verdant-final-settings.json"
var report: Dictionary
var failed := false


func _initialize() -> void:
	call_deferred("capture")


func capture() -> void:
	DirAccess.make_dir_recursive_absolute(OUTPUT)
	root.size = Vector2i(1600, 720)
	root.content_scale_size = root.size
	report = {
		"schema_version": 1,
		"captured_utc": Time.get_datetime_string_from_system(true),
		"renderer": RenderingServer.get_video_adapter_name(),
		"display_server": DisplayServer.get_name(),
		"coverage": "Actual desktop Compatibility pixels; physical Realme performance unverified.",
		"inputs_sha256": input_hashes(),
		"captures": [],
		"checks": []
	}
	var scene = load("res://scenes/main.tscn").instantiate()
	scene.settings_path = SETTINGS_PATH
	root.add_child(scene)
	scene.settings.reset_defaults()
	scene.apply_settings()
	for frame in range(35):
		await process_frame
	var player: CharacterBody3D = scene.get_node("Player")
	var player_camera := root.get_camera_3d()
	await save_view(
		scene, "wide-powers.png", "native power and movement controls", player_camera, true
	)
	root.size = Vector2i(960, 540)
	root.content_scale_size = root.size
	scene.resize_hud()
	await save_view(
		scene,
		"compact-powers.png",
		"compact native power and movement controls",
		player_camera,
		true
	)
	root.size = Vector2i(1600, 720)
	root.content_scale_size = root.size
	scene.resize_hud()
	await activity_views(scene, player, player_camera)
	player.set_physics_process(false)
	hide_overlays(scene)
	var camera := Camera3D.new()
	camera.name = "VerdantEvidenceCamera"
	camera.fov = 58
	camera.near = 0.1
	camera.far = 600
	scene.add_child(camera)
	camera.make_current()
	var views := [
		["scholar-interior.png", Vector3(2.4, 3, -13.3), Vector3(-1, 3.1, -18.1)],
		["fox-shrine.png", Vector3(-21, 13, -27), Vector3(-32, 8.1, -42.6)],
		["fox-interior.png", Vector3(-30, 7.55, -39), Vector3(-32, 7.8, -44)],
		["covered-bridge.png", Vector3(-30, 7.6, -20.2), Vector3(-30, 7.3, -35.5)],
		["dragon-spout.png", Vector3(-37, 18.6, -18), Vector3(-45, 17.4, -25.2)],
		["residence-exterior.png", Vector3(31, 6, 44), Vector3(20, 2.2, 31)],
		["residence-front-room.png", Vector3(24.2, 2.0, 35), Vector3(17.8, 1.5, 32.7)],
		["residence-back-room.png", Vector3(24.2, 2.2, 29.5), Vector3(16.4, 1.8, 27.8)]
	]
	for view in views:
		camera.position = view[1]
		camera.look_at(view[2])
		await save_view(scene, view[0], "actual game architecture and solid interior", camera)
	await roof_views(scene, camera)
	camera.position = Vector3(-51, 7, -14)
	camera.look_at(Vector3(-45, 6, -23))
	await save_view(
		scene, "water-motion-a.png", "actual animated cascade before timed interval", camera
	)
	await create_timer(0.7).timeout
	await save_view(scene, "water-motion-b.png", "same cascade camera after timed interval", camera)
	await dragon_views(scene, camera)
	player.position = Vector3(0, 0.02, 8)
	player.velocity = Vector3.ZERO
	player.model.rotation = Vector3.ZERO
	camera.position = player.position + Vector3(2.1, 1.7, 2.8)
	camera.look_at(player.position + Vector3.UP)
	camera.fov = 42
	await save_view(
		scene, "traveler-detail.png", "original traveler geometry and materials", camera
	)
	var file := FileAccess.open(OUTPUT + "verdant-render-metrics.json", FileAccess.WRITE)
	if file == null:
		check(false, "write capture metric report")
	else:
		file.store_string(JSON.stringify(report, "\t") + "\n")
		file.close()
	await FIXTURE.dispose_scene(self, scene)
	DirAccess.remove_absolute(SETTINGS_PATH)
	quit(1 if failed else 0)


func save_view(
	scene: Node, filename: String, purpose: String, camera: Camera3D, controls_visible := false
) -> void:
	for frame in range(6):
		await process_frame
		await RenderingServer.frame_post_draw
	var screenshot := root.get_texture().get_image()
	var result := screenshot.save_png(OUTPUT + filename)
	check(result == OK, "save " + filename)
	var controls := {}
	for button in scene.find_children("*", "TouchScreenButton", true, false):
		if not button.is_visible_in_tree():
			continue
		var bounds: Rect2 = button.shape.get_rect()
		bounds.position += button.global_position
		controls[button.action] = [
			bounds.position.x, bounds.position.y, bounds.size.x, bounds.size.y
		]
	var ui = scene.quest_ui
	report.captures.append(
		{
			"file": "artifacts/verdant-qa/final-views/" + filename,
			"purpose": purpose,
			"quality_preset": scene.settings.values.quality,
			"image_size": [screenshot.get_width(), screenshot.get_height()],
			"save_result": result,
			"camera_position": [camera.position.x, camera.position.y, camera.position.z],
			"camera_fov": camera.fov,
			"controls_visible": controls_visible,
			"touch_actions": controls,
			"dialog_open": ui.dialog_open,
			"dialog_mode": ui.mode,
			"dialog_bounds": rect_array(ui.dialog_panel.get_global_rect()),
			"primary_bounds": rect_array(ui.primary_button.get_global_rect()),
			"text_bounds": rect_array(ui.dialogue_text.get_global_rect()),
			"text_content_height": ui.dialogue_text.get_content_height(),
			"text_scroll_enabled": ui.dialogue_text.scroll_active,
			"player_physics": scene.get_node("Player").is_physics_processing(),
			"draw_calls":
			RenderingServer.get_rendering_info(
				RenderingServer.RENDERING_INFO_TOTAL_DRAW_CALLS_IN_FRAME
			),
			"triangles":
			RenderingServer.get_rendering_info(
				RenderingServer.RENDERING_INFO_TOTAL_PRIMITIVES_IN_FRAME
			),
			"video_memory_bytes":
			RenderingServer.get_rendering_info(RenderingServer.RENDERING_INFO_VIDEO_MEM_USED)
		}
	)
	print("VERDANT_CAPTURE: " + filename)


func activity_views(scene: Node3D, player: CharacterBody3D, camera: Camera3D) -> void:
	var ui = scene.quest_ui
	player.position = Vector3(-2.2, 1.85, -14.5)
	player.velocity = Vector3.ZERO
	player.yaw = 0
	player.update_camera()
	for frame in range(15):
		await physics_frame
	ui.refresh()
	await tap_gui(ui.context_button)
	check(ui.dialog_open and ui.mode == "record", "native touch opens nearby scholar record")
	await save_view(scene, "wide-lore.png", "real native hall record dialogue", camera)
	resize_canvas(scene, Vector2i(960, 540))
	await save_view(scene, "compact-lore.png", "compact hall record dialogue", camera)
	await tap_gui(ui.primary_button)
	check(not ui.dialog_open, "native CLOSE RECORD closes the actual overlay")
	resize_canvas(scene, Vector2i(1600, 720))
	player.position = scene.quest.GUIDE_POSITION + Vector3(0, 0.05, 1)
	check(scene.quest.accept(), "accept original lantern journey at real proximity")
	player.position = scene.quest.RELIC_POSITION + Vector3(0, 0, 1)
	check(scene.quest.collect(), "collect original world lantern at real proximity")
	player.position = scene.quest.GUIDE_POSITION + Vector3(0, 0, 1)
	check(scene.quest.deliver(), "return original lantern at real proximity")
	for id in ["bridge", "shrine"]:
		player.position = scene.activities.RECORDS[id].position + Vector3(0, 0, 1)
		check(scene.activities.read_record(id), "read nearby record " + id)
	ui.open_journal()
	await save_view(
		scene, "wide-journal.png", "actual journal with all three earned records", camera
	)
	resize_canvas(scene, Vector2i(960, 540))
	await save_view(
		scene, "compact-journal.png", "compact earned journal with actual scrolling", camera
	)
	await tap_gui(ui.primary_button)
	resize_canvas(scene, Vector2i(1600, 720))
	player.position = scene.activities.BELL_POSITION + Vector3(0, 0, 1.3)
	player.velocity = Vector3.ZERO
	for frame in range(8):
		await physics_frame
	ui.refresh()
	await tap_gui(ui.context_button)
	check(ui.dialog_open and ui.mode == "bell", "native touch opens nearby shrine bell")
	await save_view(
		scene, "shrine-bell.png", "actual completion-gated shrine bell dialogue", camera
	)
	await tap_gui(ui.primary_button)
	check(
		scene.activities.blessed and scene.activities.reward.visible,
		"native bell earns visible jade seal"
	)
	player.position = Vector3(0, 0.02, 12)
	player.velocity = Vector3.ZERO


func dragon_views(scene: Node3D, camera: Camera3D) -> void:
	var dragon := scene.get_node_or_null("World/CelestialDragon")
	check(dragon != null, "modeled celestial dragon is integrated into the actual world")
	if dragon == null:
		return
	scene.settings.set_value("quality", "high")
	scene.apply_settings()
	var body: Node3D = dragon.get_node("NorthernFlight")
	var point := body.global_position
	camera.position = point + Vector3(24, 8, 24)
	camera.look_at(point)
	await save_view(
		scene, "dragon-motion-a.png", "original animated dragon in actual game at High", camera
	)
	var before := body.global_position
	var bones_a := dragon_bones(dragon)
	await create_timer(0.7).timeout
	await save_view(
		scene, "dragon-motion-b.png", "same camera after real flight and skin animation", camera
	)
	var after := body.global_position
	var bones_b := dragon_bones(dragon)
	check(before.distance_to(after) > 0.2, "actual dragon body moves along its game-time flight")
	check(not bones_a.is_empty() and bones_a != bones_b, "actual dragon skeleton changes pose")
	report["dragon_motion"] = {
		"before": [before.x, before.y, before.z],
		"after": [after.x, after.y, after.z],
		"bones_before": bones_a,
		"bones_after": bones_b
	}
	scene.settings.set_value("quality", "balanced")
	scene.apply_settings()


func roof_views(scene: Node3D, camera: Camera3D) -> void:
	camera.position = Vector3(9, 8.5, -9)
	camera.look_at(Vector3(0, 6, -17))
	for preset in ["balanced", "high"]:
		scene.settings.set_value("quality", preset)
		scene.apply_settings()
		await save_view(
			scene,
			"roof-" + preset + ".png",
			"same-camera actual sanctuary roof; near detail counters separate from courtyard budget",
			camera
		)
	scene.settings.set_value("quality", "balanced")
	scene.apply_settings()


func dragon_bones(dragon: Node) -> Array:
	var result := []
	var model := dragon.get_node("NorthernFlight/DragonNear")
	for skeleton: Skeleton3D in model.find_children("*", "Skeleton3D", true, false):
		for index in range(skeleton.get_bone_count()):
			var rotation := skeleton.get_bone_pose_rotation(index)
			result.append([rotation.x, rotation.y, rotation.z, rotation.w])
	return result


func resize_canvas(scene: Node, size_value: Vector2i) -> void:
	root.size = size_value
	root.content_scale_size = size_value
	scene.resize_hud()


func tap_gui(button: Button) -> void:
	var event := InputEventScreenTouch.new()
	event.index = 72
	event.position = button.get_global_rect().get_center()
	event.pressed = true
	root.push_input(event, true)
	await process_frame
	event = InputEventScreenTouch.new()
	event.index = 72
	event.position = button.get_global_rect().get_center()
	event.pressed = false
	root.push_input(event, true)
	await process_frame


func rect_array(rect: Rect2) -> Array:
	return [rect.position.x, rect.position.y, rect.size.x, rect.size.y]


func check(condition: bool, label: String) -> void:
	report.checks.append({"label": label, "passed": condition})
	failed = failed or not condition
	if not condition:
		push_error("VERDANT_CAPTURE: " + label)


func hide_overlays(node: Node) -> void:
	if node is CanvasLayer:
		node.visible = false
	elif node is Control and node.name in ["MobileControls", "HeroPowerControls"]:
		node.hide()
	for child in node.get_children():
		hide_overlays(child)


static func input_hashes() -> Dictionary:
	var hashes := {}
	for path in ["project.godot", "tools/verdant_capture.gd", "tests/scene_fixture.gd"]:
		hashes[path] = FileAccess.get_sha256("res://" + path)
	for path in ["assets", "scripts", "scenes"]:
		resource_hashes(path, hashes)
	return hashes


static func resource_hashes(path: String, hashes: Dictionary) -> void:
	var directory := DirAccess.open("res://" + path)
	if directory == null:
		return
	for child in directory.get_directories():
		resource_hashes(path.path_join(child), hashes)
	for child in directory.get_files():
		var resource_path := path.path_join(child)
		hashes[resource_path] = FileAccess.get_sha256("res://" + resource_path)
