extends SceneTree
## Actual wide-phone and compact-canvas pixels; these are not phone FPS measurements.

const OUTPUT := "res://artifacts/upgrade-qa/"
const SETTINGS_PATH := "user://qa-mobile-render-settings.json"
var report: Dictionary
var failed := false


func _initialize() -> void:
	call_deferred("capture")


func capture() -> void:
	DirAccess.make_dir_recursive_absolute(OUTPUT)
	root.size = Vector2i(1600, 720)
	root.content_scale_size = root.size
	var hashes := input_hashes()
	report = {
		"schema_version": 1,
		"captured_utc": Time.get_datetime_string_from_system(true),
		"renderer": RenderingServer.get_video_adapter_name(),
		"display_server": DisplayServer.get_name(),
		"coverage":
		"Actual desktop Compatibility pixels; phone speed and safe-area hardware unverified.",
		"inputs_sha256": hashes,
		"captures": []
	}
	var scene = load("res://scenes/main.tscn").instantiate()
	scene.settings_path = SETTINGS_PATH
	root.add_child(scene)
	scene.settings.reset_defaults()
	scene.apply_settings()
	for frame in range(45):
		await process_frame
	for preset in ["performance", "balanced", "high"]:
		scene.settings.set_value("quality", preset)
		scene.apply_settings()
		await save_view(scene, "wide-" + preset + ".png", false)
	scene.settings.set_value("quality", "balanced")
	scene.apply_settings()
	scene.toggle_settings()
	await save_view(scene, "wide-settings.png", true)
	scene.toggle_settings()
	root.size = Vector2i(960, 540)
	root.content_scale_size = root.size
	await save_view(scene, "compact-gameplay.png", false)
	scene.toggle_settings()
	await save_view(scene, "compact-settings.png", true)
	var file := FileAccess.open(OUTPUT + "mobile-render-metrics.json", FileAccess.WRITE)
	if file == null:
		push_error("MOBILE_RENDER: cannot write report")
		failed = true
	else:
		file.store_string(JSON.stringify(report, "\t") + "\n")
		file.close()
	stop_audio(scene)
	await create_timer(0.15).timeout
	scene.queue_free()
	await process_frame
	await create_timer(0.15).timeout
	DirAccess.remove_absolute(SETTINGS_PATH)
	quit(1 if failed else 0)


func save_view(scene: Node, filename: String, settings_open: bool) -> void:
	for frame in range(6):
		await process_frame
		await RenderingServer.frame_post_draw
	var screenshot := root.get_texture().get_image()
	var result := screenshot.save_png(OUTPUT + filename)
	failed = failed or result != OK
	var controls: Control = scene.get_node("MobileControls")
	var actions := {}
	for action in controls.buttons:
		var button: TouchScreenButton = controls.buttons[action]
		if button.is_visible_in_tree():
			actions[action] = {
				"center": [button.global_position.x, button.global_position.y],
				"radius": button.shape.radius
			}
	var metrics := {
		"file": "artifacts/upgrade-qa/" + filename,
		"image_size": [screenshot.get_width(), screenshot.get_height()],
		"canvas_size": [root.get_visible_rect().size.x, root.get_visible_rect().size.y],
		"save_result": result,
		"preset": scene.settings.values.quality,
		"settings_open": settings_open,
		"scaling_3d_scale": root.scaling_3d_scale,
		"touch_actions": actions,
		"hud_bounds": rect_array(scene.hud_panel.get_global_rect()),
		"settings_bounds": rect_array(scene.settings_panel.get_global_rect()),
		"settings_buttons": settings_button_bounds(scene.settings_overlay),
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
	print(
		"MOBILE_RENDER: %s %dx%d, preset=%s" % [filename, root.size.x, root.size.y, metrics.preset]
	)


func rect_array(rect: Rect2) -> Array:
	return [rect.position.x, rect.position.y, rect.size.x, rect.size.y]


func settings_button_bounds(node: Node) -> Array:
	var found: Array = []
	if node is Button and node.is_visible_in_tree():
		var button := node as Button
		var visible_rect := button.get_global_rect()
		var ancestor := button.get_parent()
		while ancestor != null:
			if ancestor is ScrollContainer:
				visible_rect = visible_rect.intersection(ancestor.get_global_rect())
			ancestor = ancestor.get_parent()
		found.append(
			{
				"label": button.text,
				"bounds": rect_array(button.get_global_rect()),
				"visible_bounds": rect_array(visible_rect)
			}
		)
	for child in node.get_children():
		found.append_array(settings_button_bounds(child))
	return found


func stop_audio(node: Node) -> void:
	if node is AudioStreamPlayer or node is AudioStreamPlayer3D or node is AudioStreamPlayer2D:
		node.stop()
		node.stream = null
	for child in node.get_children():
		stop_audio(child)


func input_hashes() -> Dictionary:
	var hashes := {}
	for path in [
		"project.godot",
		"tools/render_capture.gd",
		"tools/mobile_render_capture.gd",
		"tools/android_label_ocr.py"
	]:
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
