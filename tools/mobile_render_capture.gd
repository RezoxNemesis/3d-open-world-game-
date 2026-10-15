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
	# Exercise Godot's documented desktop touchscreen emulation and full input
	# synthesis. Viewport.push_input bypasses the mouse events used by GUI scroll.
	Input.emulate_touch_from_mouse = true
	Input.emulate_mouse_from_touch = true
	root.size = Vector2i(1600, 720)
	root.content_scale_size = root.size
	var hashes := input_hashes()
	report = {
		"schema_version": 2,
		"captured_utc": Time.get_datetime_string_from_system(true),
		"renderer": RenderingServer.get_video_adapter_name(),
		"display_server": DisplayServer.get_name(),
		"touchscreen_available": DisplayServer.is_touchscreen_available(),
		"emulate_touch_from_mouse": Input.emulate_touch_from_mouse,
		"emulate_mouse_from_touch": Input.emulate_mouse_from_touch,
		"input_dispatch": "Input.parse_input_event with native ScreenTouch/ScreenDrag",
		"coverage":
		"Actual desktop Compatibility pixels; phone speed and safe-area hardware unverified.",
		"inputs_sha256": hashes,
		"captures": [],
		"native_events": [],
		"checks": []
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
	await settings_bottom(scene, "wide")
	scene.toggle_settings()
	root.size = Vector2i(960, 540)
	root.content_scale_size = root.size
	await save_view(scene, "compact-gameplay.png", false)
	scene.toggle_settings()
	await save_view(scene, "compact-settings.png", true)
	await settings_bottom(scene, "compact")
	var file := FileAccess.open(OUTPUT + "mobile-render-metrics.json", FileAccess.WRITE)
	if file == null:
		push_error("MOBILE_RENDER: cannot write report")
		failed = true
	else:
		file.store_string(JSON.stringify(report, "\t") + "\n")
		file.close()
	await preload("res://tests/scene_fixture.gd").dispose_scene(self, scene)
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
		"settings_scroll": settings_scroll(scene),
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
		var clip_rect := root.get_visible_rect()
		var in_scroll := false
		var ancestor := button.get_parent()
		while ancestor != null:
			if ancestor is ScrollContainer:
				in_scroll = true
				clip_rect = clip_rect.intersection(ancestor.get_global_rect())
			ancestor = ancestor.get_parent()
		visible_rect = visible_rect.intersection(clip_rect)
		found.append(
			{
				"label": button.text,
				"path": str(button.get_path()),
				"scroll_content": in_scroll,
				"clip_bounds": rect_array(clip_rect),
				"bounds": rect_array(button.get_global_rect()),
				"visible_bounds": rect_array(visible_rect)
			}
		)
	for child in node.get_children():
		found.append_array(settings_button_bounds(child))
	return found


func settings_scroll(scene: Node) -> Dictionary:
	var scroll: ScrollContainer = (
		scene.settings_overlay.find_children("*", "ScrollContainer", true, false)[0]
	)
	return {"vertical": scroll.scroll_vertical, "bounds": rect_array(scroll.get_global_rect())}


func settings_bottom(scene: Node, size_name: String) -> void:
	var scroll: ScrollContainer = (
		scene.settings_overlay.find_children("*", "ScrollContainer", true, false)[0]
	)
	var before := scroll.scroll_vertical
	for attempt in range(4):
		if fully_visible(scene.sprint_assist_toggle, scroll):
			var restore: Button = scene.settings_overlay.find_child(
				"RestoreMountainCrags", true, false
			)
			if fully_visible(restore, scroll):
				break
		await swipe_scroll(scroll, size_name)
	check(scroll.scroll_vertical > before, size_name + " native touch drag scrolls settings")
	var restore: Button = scene.settings_overlay.find_child("RestoreMountainCrags", true, false)
	check(
		fully_visible(scene.sprint_assist_toggle, scroll), size_name + " sprint toggle fully shown"
	)
	check(fully_visible(restore, scroll), size_name + " restore button fully shown")
	var original: bool = scene.settings.values.sprint_assist
	await tap_gui(scene.sprint_assist_toggle, size_name + " sprint toggle")
	check(
		(
			scene.settings.values.sprint_assist != original
			and scene.get_node("MobileControls").sprint_assist != original
		),
		size_name + " native sprint touch changes setting and actual movement control"
	)
	scene.powers.mountains.restore_destroyed(["crag_east"])
	check(
		not scene.powers.mountains.targets.has("crag_east"), size_name + " restore fixture removed"
	)
	await tap_gui(restore, size_name + " restore crags")
	check(
		(
			scene.powers.mountains.destroyed_ids().is_empty()
			and scene.powers.mountains.targets.has("crag_east")
			and (
				(
					scene
					. powers
					. mountains
					. targets
					. crag_east
					. find_children("*", "StaticBody3D", true, false)
					. size()
				)
				== 3
			)
		),
		size_name + " native restore touch rebuilds real mountain collision bodies"
	)
	await save_view(scene, size_name + "-settings-bottom.png", true)
	await tap_gui(scene.sprint_assist_toggle, size_name + " sprint restore")
	check(scene.settings.values.sprint_assist == original, size_name + " sprint restored")
	for attempt in range(4):
		if scroll.scroll_vertical == 0:
			break
		await swipe_scroll(scroll, size_name, false)
	check(scroll.scroll_vertical == 0, size_name + " native drag returns to settings top")


func fully_visible(button: Control, scroll: ScrollContainer) -> bool:
	return scroll.get_global_rect().encloses(button.get_global_rect())


func swipe_scroll(scroll: ScrollContainer, size_name: String, upward := true) -> void:
	var bounds := scroll.get_global_rect()
	var start := bounds.position + Vector2(bounds.size.x * 0.85, bounds.size.y - 25)
	# Start on a visible noninteractive label, so a slider cannot consume the drag.
	for label: Label in scroll.find_children("*", "Label", true, false):
		var label_rect := label.get_global_rect()
		if bounds.encloses(label_rect) and label_rect.get_center().y > bounds.get_center().y:
			start = Vector2(label_rect.end.x - 25, label_rect.get_center().y)
	var distance := minf(245.0, start.y - bounds.position.y - 15.0)
	if not upward:
		start = bounds.position + Vector2(bounds.size.x * 0.85, 25)
		for label: Label in scroll.find_children("*", "Label", true, false):
			var label_rect := label.get_global_rect()
			if bounds.encloses(label_rect) and label_rect.get_center().y < bounds.get_center().y:
				start = Vector2(label_rect.end.x - 25, label_rect.get_center().y)
				break
		distance = -minf(245.0, bounds.end.y - start.y - 15.0)
	var event := InputEventScreenTouch.new()
	event.index = 73
	event.position = start
	event.pressed = true
	Input.parse_input_event(event)
	Input.flush_buffered_events()
	await process_frame
	for step in range(1, 5):
		var drag := InputEventScreenDrag.new()
		drag.index = 73
		drag.position = start - Vector2(0, distance * step / 4.0)
		drag.relative = Vector2(0, -distance / 4.0)
		drag.velocity = Vector2(0, -signf(distance) * 400)
		Input.parse_input_event(drag)
		Input.flush_buffered_events()
		await process_frame
	event = InputEventScreenTouch.new()
	event.index = 73
	event.position = start - Vector2(0, distance)
	event.pressed = false
	Input.parse_input_event(event)
	Input.flush_buffered_events()
	for frame in range(3):
		await process_frame
	report.native_events.append(
		{"kind": "ScreenTouch+4ScreenDrag+release", "view": size_name, "distance": distance}
	)


func tap_gui(button: Button, label: String) -> void:
	for pressed in [true, false]:
		var event := InputEventScreenTouch.new()
		event.index = 74
		event.position = button.get_global_rect().get_center()
		event.pressed = pressed
		Input.parse_input_event(event)
		Input.flush_buffered_events()
		await process_frame
	report.native_events.append({"kind": "ScreenTouch+release", "target": label})


func check(condition: bool, label: String) -> void:
	report.checks.append({"label": label, "passed": condition})
	failed = failed or not condition
	if not condition:
		push_error("MOBILE_RENDER: " + label)


func input_hashes() -> Dictionary:
	var hashes := {}
	for path in [
		"project.godot",
		"tools/render_capture.gd",
		"tools/mobile_render_capture.gd",
		"tools/check_mobile_render_evidence.py",
		"tests/scene_fixture.gd",
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
