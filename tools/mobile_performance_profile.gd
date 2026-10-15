extends SceneTree
## Matched static district cameras with renderer counters; never device FPS evidence.

const FIXTURE := preload("res://tests/scene_fixture.gd")
var report: Dictionary


func _initialize() -> void:
	call_deferred("run")


func run() -> void:
	root.size = Vector2i(1600, 720)
	root.content_scale_size = root.size
	var arguments := OS.get_cmdline_user_args()
	var label := arguments[0] if not arguments.is_empty() else "current"
	var output := "res://artifacts/performance-" + label + "/"
	DirAccess.make_dir_recursive_absolute(output)
	var scene: Node3D = load("res://scenes/main.tscn").instantiate()
	scene.settings_path = "user://performance-profile-settings.json"
	root.add_child(scene)
	scene.settings.reset_defaults()
	scene.settings.set_value("quality", "balanced")
	scene.apply_settings()
	for frame in range(20):
		await process_frame
	scene.process_mode = Node.PROCESS_MODE_DISABLED
	var world := scene.get_node("World")
	var camera := Camera3D.new()
	camera.fov = 58
	camera.far = 600
	scene.add_child(camera)
	camera.make_current()
	report = {
		"renderer": RenderingServer.get_video_adapter_name(),
		"viewport": [1600, 720],
		"preset": "balanced",
		"coverage": "Static desktop Compatibility render counters; no physical phone timing.",
		"captures": [],
		"inputs_sha256": {}
	}
	for path in [
		"nature",
		"architectural_detail",
		"celestial_district",
		"verdant_district",
		"world",
		"player"
	]:
		report.inputs_sha256[path] = FileAccess.get_sha256("res://scripts/" + path + ".gd")
	var views := [
		["courtyard", Vector3(0, 4, 14), Vector3(0, 3, -18)],
		["roof", Vector3(11, 9, -9), Vector3(0, 7, -18)],
		["overview", Vector3(35, 22, 35), Vector3(-2, 4, -6)]
	]
	for view in views:
		camera.position = view[1]
		camera.look_at(view[2])
		var metrics := await measure()
		metrics["view"] = view[0]
		metrics["camera"] = [str(camera.position), str(camera.rotation)]
		metrics["layer_contributions"] = {}
		root.get_texture().get_image().save_png(output + view[0] + ".png")
		for layer_name in [
			"ArchitecturalDetail",
			"CelestialDistrict",
			"VerdantDistrict",
			"GardenNature",
			"MountainWoodlands"
		]:
			var layer: Node3D = world.get_node_or_null(layer_name)
			if layer == null:
				continue
			layer.hide()
			var without := await measure()
			metrics.layer_contributions[layer_name] = {
				"draw_calls": metrics.draw_calls - without.draw_calls,
				"triangles": metrics.triangles - without.triangles
			}
			layer.show()
		report.captures.append(metrics)
		print("PERFORMANCE_PROFILE: ", JSON.stringify(metrics))
	var file := FileAccess.open(output + "profile.json", FileAccess.WRITE)
	file.store_string(JSON.stringify(report, "\t") + "\n")
	file.close()
	await FIXTURE.dispose_scene(self, scene)
	DirAccess.remove_absolute("user://performance-profile-settings.json")
	quit()


func measure() -> Dictionary:
	for frame in range(3):
		await process_frame
		await RenderingServer.frame_post_draw
	return {
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
