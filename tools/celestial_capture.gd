extends SceneTree
## Actual upper-temple, proximity dialogue and earned-reward pixels with source provenance.

const FIXTURE := preload("res://tests/scene_fixture.gd")
const OUTPUT := "res://artifacts/celestial-qa/"
const SETTINGS_PATH := "user://qa-celestial-render-settings.json"
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
		"coverage": "Actual desktop Compatibility pixels; physical Android performance unverified.",
		"inputs_sha256": input_hashes(),
		"captures": [],
		"gui_assertions": []
	}
	var scene = load("res://scenes/main.tscn").instantiate()
	scene.settings_path = SETTINGS_PATH
	root.add_child(scene)
	scene.settings.reset_defaults()
	scene.apply_settings()
	for frame in range(45):
		await process_frame
	var player: CharacterBody3D = scene.get_node("Player")
	var player_camera := root.get_camera_3d()
	await heading_probe(scene)
	player.position = scene.quest.GUIDE_POSITION + Vector3(0, 0.05, 1)
	player.velocity = Vector3.ZERO
	if not scene.quest.accept():
		push_error("CELESTIAL_CAPTURE: real nearby keeper acceptance failed")
		failed = true
	player.position = Vector3(45, 10.05, -38)
	player.velocity = Vector3.ZERO
	for frame in range(15):
		await physics_frame
	player.set_physics_process(false)
	var hidden := hide_overlays(scene)
	var camera := Camera3D.new()
	camera.name = "CelestialEvidenceCamera"
	camera.fov = 58
	camera.near = 0.1
	camera.far = 600
	scene.add_child(camera)
	camera.make_current()
	camera.global_position = Vector3(65, 20, -15)
	camera.look_at(Vector3(46, 16, -41))
	await save_view(scene, "sky-terrace.png", "upper temple and real stair landing", camera)
	camera.global_position = Vector3(51, 13.0, -35)
	camera.look_at(Vector3(46, 11.1, -42))
	await save_view(scene, "upper-relic.png", "accepted quest with world relic visible", camera)
	for entry in hidden:
		entry.node.visible = entry.visible
	player_camera.make_current()
	player.position = scene.quest.GUIDE_POSITION + Vector3(0, 0.05, 1.6)
	player.velocity = Vector3.ZERO
	player.yaw = 0.0
	player.pitch = -0.12
	player.update_camera()
	player.set_physics_process(true)
	for frame in range(15):
		await physics_frame
	scene.quest.restore_stage(0)
	scene.quest_ui.refresh()
	await process_frame
	await tap_button(scene.quest_ui.context_button)
	gui_check(scene.quest_ui.dialog_open, "native touch opens nearby keeper dialogue")
	gui_check(not player.is_physics_processing(), "native dialogue pauses character physics")
	gui_check(not scene.get_node("MobileControls").visible, "native dialogue hides play controls")
	await save_view(scene, "wide-dialogue.png", "real keeper dialogue at1600x720", player_camera)
	await click_button(scene.quest_ui.primary_button)
	gui_check(scene.quest.stage == 1, "real mouse primary action accepts the journey")
	gui_check(not scene.quest_ui.dialog_open, "primary action closes dialogue")
	gui_check(player.is_physics_processing(), "primary action restores play physics")
	root.size = Vector2i(960, 540)
	root.content_scale_size = root.size
	scene.resize_hud()
	scene.quest.restore_stage(0)
	scene.quest_ui.refresh()
	await process_frame
	await tap_button(scene.quest_ui.context_button)
	gui_check(scene.quest_ui.dialog_open, "native touch opens compact keeper dialogue")
	await save_view(scene, "compact-dialogue.png", "real keeper dialogue at960x540", player_camera)
	var close_button := find_button(scene.quest_ui.dialog_overlay, "CLOSE")
	gui_check(close_button != null, "compact dialogue exposes a genuine CLOSE button")
	if close_button != null:
		await tap_button(close_button)
	gui_check(not scene.quest_ui.dialog_open, "native touch closes compact dialogue")
	root.size = Vector2i(1600, 720)
	root.content_scale_size = root.size
	scene.resize_hud()
	if not scene.quest.accept():
		push_error("CELESTIAL_CAPTURE: second real keeper acceptance failed")
		failed = true
	player.position = scene.quest.RELIC_POSITION + Vector3(0, 0, 1)
	player.velocity = Vector3.ZERO
	if not scene.quest.collect():
		push_error("CELESTIAL_CAPTURE: real nearby upper-relic collection failed")
		failed = true
	player.position = scene.quest.GUIDE_POSITION + Vector3(0, 0, 1)
	player.velocity = Vector3.ZERO
	if not scene.quest.deliver():
		push_error("CELESTIAL_CAPTURE: real keeper return failed")
		failed = true
	player.set_physics_process(false)
	hidden = hide_overlays(scene)
	camera.make_current()
	camera.global_position = player.global_position + Vector3(2.2, 1.6, 3.0)
	camera.look_at(player.global_position + Vector3(0, 1.0, 0))
	camera.fov = 48
	await save_view(
		scene, "earned-lantern.png", "visible lantern earned by accept collect deliver", camera
	)
	var file := FileAccess.open(OUTPUT + "celestial-render-metrics.json", FileAccess.WRITE)
	if file == null:
		push_error("CELESTIAL_CAPTURE: cannot write report")
		failed = true
	else:
		file.store_string(JSON.stringify(report, "\t") + "\n")
		file.close()
	await FIXTURE.dispose_scene(self, scene)
	DirAccess.remove_absolute(SETTINGS_PATH)
	quit(1 if failed else 0)


func save_view(scene: Node, filename: String, purpose: String, camera: Camera3D) -> void:
	for frame in range(6):
		await process_frame
		await RenderingServer.frame_post_draw
	var screenshot := root.get_texture().get_image()
	var result := screenshot.save_png(OUTPUT + filename)
	failed = failed or result != OK
	var quest = scene.quest
	var metrics := {
		"file": "artifacts/celestial-qa/" + filename,
		"image_size": [screenshot.get_width(), screenshot.get_height()],
		"save_result": result,
		"purpose": purpose,
		"quest_stage": quest.stage,
		"dialog_open": scene.quest_ui.dialog_open,
		"dialog_bounds": rect_array(scene.quest_ui.dialog_panel.get_global_rect()),
		"primary_action": scene.quest_ui.primary_button.text,
		"primary_bounds": rect_array(scene.quest_ui.primary_button.get_global_rect()),
		"dialogue_text_bounds": rect_array(scene.quest_ui.dialogue_text.get_global_rect()),
		"dialogue_content_height": scene.quest_ui.dialogue_text.get_content_height(),
		"relic_visible": quest.relic.visible,
		"reward_visible": quest.reward.visible,
		"player_position": vector_array(scene.get_node("Player").global_position),
		"camera_position": vector_array(camera.global_position),
		"camera_rotation": vector_array(camera.global_rotation),
		"camera_fov": camera.fov,
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
	report.captures.append(metrics)
	print("CELESTIAL_CAPTURE: %s %dx%d stage%d" % [filename, root.size.x, root.size.y, quest.stage])


func hide_overlays(node: Node) -> Array:
	var hidden: Array = []
	if node is CanvasLayer or (node is Control and node.name == "MobileControls"):
		hidden.append({"node": node, "visible": node.visible})
		node.visible = false
	for child in node.get_children():
		hidden.append_array(hide_overlays(child))
	return hidden


func rect_array(rect: Rect2) -> Array:
	return [rect.position.x, rect.position.y, rect.size.x, rect.size.y]


func vector_array(value: Vector3) -> Array:
	return [value.x, value.y, value.z]


func input_hashes() -> Dictionary:
	var hashes := {}
	for path in ["project.godot", "tools/celestial_capture.gd"]:
		hashes[path] = FileAccess.get_sha256("res://" + path)
	for folder in ["assets", "scripts", "scenes"]:
		resource_hashes(folder, hashes)
	return hashes


func resource_hashes(path: String, hashes: Dictionary) -> void:
	var directory := DirAccess.open("res://" + path)
	if directory == null:
		return
	for child in directory.get_directories():
		resource_hashes(path.path_join(child), hashes)
	for child in directory.get_files():
		var resource_path := path.path_join(child)
		hashes[resource_path] = FileAccess.get_sha256("res://" + resource_path)


func gui_check(condition: bool, label: String) -> void:
	report.gui_assertions.append({"label": label, "passed": condition})
	if not condition:
		failed = true
		push_error("CELESTIAL_GUI: " + label)
	else:
		print("CELESTIAL_GUI: PASS " + label)


func tap_button(button: Button) -> void:
	var point := button.get_global_rect().get_center()
	for pressed in [true, false]:
		var event := InputEventScreenTouch.new()
		event.index = 0
		event.position = point
		event.pressed = pressed
		Input.parse_input_event(event)
		await process_frame


func click_button(button: Button) -> void:
	var point := button.get_global_rect().get_center()
	for pressed in [true, false]:
		var event := InputEventMouseButton.new()
		event.position = point
		event.global_position = point
		event.button_index = MOUSE_BUTTON_LEFT
		event.pressed = pressed
		root.push_input(event, true)
		await process_frame


func find_button(node: Node, label: String) -> Button:
	if node is Button and node.text == label:
		return node
	for child in node.get_children():
		var found := find_button(child, label)
		if found != null:
			return found
	return null


func heading_probe(scene: Node) -> void:
	var player = scene.get_node("Player")
	var minimap: Control = scene.quest_ui.minimap
	var images: Array[Image] = []
	for entry in [["north", 0.0], ["east", -PI / 2]]:
		player.yaw = entry[1]
		player.update_camera()
		minimap.queue_redraw()
		for frame in range(6):
			await process_frame
			await RenderingServer.frame_post_draw
		var pixels := root.get_texture().get_image()
		var bounds := Rect2i(minimap.get_global_rect())
		var crop := pixels.get_region(bounds)
		var result := crop.save_png(OUTPUT + "minimap-heading-" + entry[0] + ".png")
		failed = failed or result != OK
		images.append(crop)
	gui_check(
		images[0].get_data() != images[1].get_data(), "actual minimap pixels change on camera turn"
	)
	report.heading_probe = {
		"bounds": rect_array(minimap.get_global_rect()),
		"north_file": "artifacts/celestial-qa/minimap-heading-north.png",
		"east_file": "artifacts/celestial-qa/minimap-heading-east.png",
		"north_yaw": 0.0,
		"east_yaw": -PI / 2
	}
	player.yaw = 0.0
	player.update_camera()
