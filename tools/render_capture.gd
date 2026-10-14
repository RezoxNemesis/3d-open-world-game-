extends SceneTree
## Capture the running game with a real renderer; cinematic views do not replace play evidence.

const OUTPUT_DIR := "res://artifacts/"
const INPUTS := [
	"project.godot",
	"scenes/main.tscn",
	"scripts/world.gd",
	"scripts/nature.gd",
	"scripts/main.gd",
	"scripts/mobile_controls.gd",
	"scripts/player.gd",
	"scripts/exploration.gd",
	"tools/render_capture.gd"
]

var evidence: Dictionary = {}
var failed := false


func _initialize() -> void:
	call_deferred("capture")


func capture() -> void:
	root.size = Vector2i(1280, 720)
	var captured_inputs := input_hashes()
	var scene: Node3D = load("res://scenes/main.tscn").instantiate()
	root.add_child(scene)
	for frame in range(45):
		await process_frame
	evidence = {
		"schema_version": 1,
		"captured_utc": Time.get_datetime_string_from_system(true),
		"renderer": RenderingServer.get_video_adapter_name(),
		"display_server": DisplayServer.get_name(),
		"rendering_method": ProjectSettings.get_setting("rendering/renderer/rendering_method"),
		"viewport": [1280, 720],
		"coverage": "Actual desktop viewport pixels; mobile speed and thermal behavior unverified.",
		"metric_notes": "Frame counters include rendering passes and UI; no measured mobile FPS.",
		"inputs_sha256": captured_inputs,
		"captures": []
	}
	var player_camera := root.get_camera_3d()
	if player_camera == null:
		push_error("RENDER_CAPTURE: playable scene has no active camera")
		quit(1)
		return
	await save_view("district-player.png", player_camera, true, null)
	hide_overlays(scene)
	var camera := Camera3D.new()
	camera.name = "EvidenceCamera"
	camera.fov = 58
	camera.near = 0.1
	camera.far = 600.0
	scene.add_child(camera)
	camera.current = true
	await capture_view(camera, "district-sanctuary.png", Vector3(14, 6, 19), Vector3(0, 4, -13))
	await capture_view(camera, "district-lotus.png", Vector3(0, 10, 25), Vector3(-29, 3, -8))
	await capture_view(camera, "district-gate.png", Vector3(43, 5, 13), Vector3(25, 3, -6))
	await capture_view(camera, "temple-courtyard.png", Vector3(35, 22, 35), Vector3(-2, 4, -6))
	var report := FileAccess.open(OUTPUT_DIR + "district-render-metrics.json", FileAccess.WRITE)
	if report == null:
		push_error("RENDER_CAPTURE: could not write rendering evidence")
		failed = true
	else:
		report.store_string(JSON.stringify(evidence, "\t") + "\n")
		report.close()
	stop_audio(scene)
	# Permit the audio mixing thread to release its playback before deleting the scene.
	await create_timer(0.15).timeout
	scene.queue_free()
	await process_frame
	# Scene-owned preload references disappear on deletion; drain that release too.
	await create_timer(0.15).timeout
	quit(1 if failed else 0)


func input_hashes() -> Dictionary:
	var hashes := {}
	for path in INPUTS:
		if FileAccess.file_exists("res://" + path):
			hashes[path] = FileAccess.get_sha256("res://" + path)
	resource_hashes("assets", hashes)
	resource_hashes("scripts", hashes)
	resource_hashes("scenes", hashes)
	return hashes


func resource_hashes(path: String, hashes: Dictionary) -> void:
	var directory := DirAccess.open("res://" + path)
	if directory == null:
		return
	for child in directory.get_directories():
		resource_hashes(path.path_join(child), hashes)
	for child in directory.get_files():
		var asset_path := path.path_join(child)
		hashes[asset_path] = FileAccess.get_sha256("res://" + asset_path)


func hide_overlays(node: Node) -> void:
	if node is CanvasLayer:
		node.visible = false
	elif node is Control and node.name == "MobileControls":
		node.hide()
	for child in node.get_children():
		hide_overlays(child)


func stop_audio(node: Node) -> void:
	if node is AudioStreamPlayer or node is AudioStreamPlayer3D or node is AudioStreamPlayer2D:
		node.stop()
		node.stream = null
	for child in node.get_children():
		stop_audio(child)


func capture_view(camera: Camera3D, filename: String, position: Vector3, target: Vector3) -> void:
	camera.global_position = position
	camera.look_at(target)
	await save_view(filename, camera, false, target)


func vector_array(value: Vector3) -> Array:
	return [value.x, value.y, value.z]


func save_view(filename: String, camera: Camera3D, ui_visible: bool, target: Variant) -> void:
	# Warm the current camera and wait for completed drawing rather than a headless texture.
	for frame in range(3):
		await process_frame
		await RenderingServer.frame_post_draw
	var rendered_image := root.get_texture().get_image()
	var result := rendered_image.save_png(OUTPUT_DIR + filename)
	failed = failed or result != OK
	var metrics := {
		"file": "artifacts/" + filename,
		"image_size": [rendered_image.get_width(), rendered_image.get_height()],
		"camera_position": vector_array(camera.global_position),
		"camera_rotation_radians": vector_array(camera.global_rotation),
		"camera_fov_degrees": camera.fov,
		"ui_visible": ui_visible,
		"save_result": result,
		"rendering_server":
		{
			"objects_in_frame":
			RenderingServer.get_rendering_info(
				RenderingServer.RENDERING_INFO_TOTAL_OBJECTS_IN_FRAME
			),
			"triangles_in_frame":
			RenderingServer.get_rendering_info(
				RenderingServer.RENDERING_INFO_TOTAL_PRIMITIVES_IN_FRAME
			),
			"draw_calls_in_frame":
			RenderingServer.get_rendering_info(
				RenderingServer.RENDERING_INFO_TOTAL_DRAW_CALLS_IN_FRAME
			),
			"video_memory_bytes":
			RenderingServer.get_rendering_info(RenderingServer.RENDERING_INFO_VIDEO_MEM_USED)
		},
		"viewport_visible": viewport_metrics(RenderingServer.VIEWPORT_RENDER_INFO_TYPE_VISIBLE),
		"viewport_shadows": viewport_metrics(RenderingServer.VIEWPORT_RENDER_INFO_TYPE_SHADOW),
		"performance_monitors":
		{
			"draw_calls_in_frame":
			Performance.get_monitor(Performance.RENDER_TOTAL_DRAW_CALLS_IN_FRAME),
			"triangles_in_frame":
			Performance.get_monitor(Performance.RENDER_TOTAL_PRIMITIVES_IN_FRAME),
			"static_memory_bytes": Performance.get_monitor(Performance.MEMORY_STATIC),
			"nodes": Performance.get_monitor(Performance.OBJECT_NODE_COUNT)
		}
	}
	if target is Vector3:
		metrics["camera_target"] = vector_array(target)
	evidence.captures.append(metrics)
	print(
		(
			"RENDER_CAPTURE: %s %dx%d, renderer=%s, result=%d"
			% [
				filename,
				rendered_image.get_width(),
				rendered_image.get_height(),
				evidence.renderer,
				result
			]
		)
	)


func viewport_metrics(info_type: int) -> Dictionary:
	return {
		"objects_in_frame":
		RenderingServer.viewport_get_render_info(
			root.get_viewport_rid(),
			info_type,
			RenderingServer.VIEWPORT_RENDER_INFO_OBJECTS_IN_FRAME
		),
		"triangles_in_frame":
		RenderingServer.viewport_get_render_info(
			root.get_viewport_rid(),
			info_type,
			RenderingServer.VIEWPORT_RENDER_INFO_PRIMITIVES_IN_FRAME
		),
		"draw_calls_in_frame":
		RenderingServer.viewport_get_render_info(
			root.get_viewport_rid(),
			info_type,
			RenderingServer.VIEWPORT_RENDER_INFO_DRAW_CALLS_IN_FRAME
		)
	}
