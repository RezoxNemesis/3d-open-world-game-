extends SceneTree
## Actual rendered pixels from the playable expedition, with exact source hashes.

const OUTPUT := "res://artifacts/expedition-qa/"

var scene: Node3D
var camera: Camera3D
var evidence := {"captures": [], "inputs_sha256": {}}


func _initialize() -> void:
	call_deferred("run")


func run() -> void:
	DirAccess.make_dir_recursive_absolute(OUTPUT)
	root.size = Vector2i(1600, 720)
	hash_directory("scripts")
	hash_directory("assets")
	hash_directory("scenes")
	evidence.inputs_sha256["project.godot"] = FileAccess.get_sha256("res://project.godot")
	evidence["renderer"] = RenderingServer.get_video_adapter_name()
	evidence["coverage"] = "Actual desktop Compatibility render; not Realme performance."
	scene = load("res://scenes/expedition.tscn").instantiate()
	scene.restore_on_start = false
	scene.save_path = "user://capture-expedition.json"
	root.add_child(scene)
	scene.apply_quality("balanced")
	for frame in range(30):
		await process_frame
	await capture("01-expedition-gameplay.png", true)
	camera = Camera3D.new()
	camera.fov = 59
	camera.far = 1800
	scene.add_child(camera)
	camera.current = true
	scene.get_node("HUD").hide()
	scene.mobile.hide()
	await view("02-temple-road.png", Vector3(24, 7, 25), Vector3(0, 6, -20))
	await view("03-hall-interior.png", Vector3(4.8, 2.3, -16), Vector3(-3, 1.5, -23))
	await view("04-guardian.png", Vector3(24, 3.7, 12), Vector3(18, 2.1, 6))
	await view("05-wind-cart.png", Vector3(13, 3.5, 18), Vector3(8, 1.2, 12))
	await view("06-frontier-overlook.png", Vector3(-38, 27, 42), Vector3(0, 10, -23))
	await view("10-lotus-sanctuary.png", Vector3(-6, 4, 16), Vector3(-25, 4, -16))
	await view("11-water-garden.png", Vector3(-28, 2.5, 10), Vector3(-26, 4, -18))
	await view("12-pavilion-view.png", Vector3(-36, 11, -33), Vector3(-20, 1, -3))
	await view("13-keeper.png", Vector3(-3, 2.0, 10), Vector3(-6, 1.2, 7))
	scene.world.travel_to(Vector2i(781249, 0))
	scene.encounter.reset_for_destination()
	for frame in range(15):
		await process_frame
	await view("07-eastern-frontier.png", Vector3(20, 6, 20), Vector3(0, 6, -22))
	scene.world.travel_to(Vector2i.ZERO)
	scene.encounter.reset_for_destination()
	camera.current = false
	scene.player.camera.current = true
	scene.player.position = Vector3(18, 0.1, 10)
	scene.player.yaw = 0
	scene.player.model.rotation.y = 0
	scene.player.update_camera()
	scene.encounter._begin_telegraph()
	scene.encounter.set_physics_process(false)
	scene.get_node("HUD").show()
	scene.mobile.show()
	await capture("08-encounter-gameplay.png", true)
	scene.open_atlas()
	await capture("09-world-atlas.png", true)
	var file := FileAccess.open(OUTPUT + "render-evidence.json", FileAccess.WRITE)
	file.store_string(JSON.stringify(evidence, "\t"))
	file.close()
	DirAccess.remove_absolute(scene.save_path)
	await preload("res://tests/scene_fixture.gd").dispose_scene(self, scene)
	quit()


func view(filename: String, position: Vector3, target: Vector3) -> void:
	camera.position = position
	camera.look_at(target)
	await capture(filename, false)


func capture(filename: String, gameplay: bool) -> void:
	for frame in range(4):
		await process_frame
		await RenderingServer.frame_post_draw
	var texture := root.get_texture().get_image()
	assert(texture.save_png(OUTPUT + filename) == OK)
	var active_camera := root.get_camera_3d()
	evidence.captures.append(
		{
			"file": filename,
			"gameplay_hud": gameplay,
			"draws":
			RenderingServer.get_rendering_info(
				RenderingServer.RENDERING_INFO_TOTAL_DRAW_CALLS_IN_FRAME
			),
			"triangles":
			RenderingServer.get_rendering_info(
				RenderingServer.RENDERING_INFO_TOTAL_PRIMITIVES_IN_FRAME
			),
			"camera":
			[active_camera.position.x, active_camera.position.y, active_camera.position.z],
			"coordinates": scene.world.world_coordinates(),
			"size": [texture.get_width(), texture.get_height()]
		}
	)
	print("CAPTURED ", filename, " ", evidence.captures.back())


func hash_directory(path: String) -> void:
	var directory := DirAccess.open("res://" + path)
	for child in directory.get_directories():
		hash_directory(path.path_join(child))
	for child in directory.get_files():
		if not child.ends_with(".uid"):
			evidence.inputs_sha256[path.path_join(child)] = FileAccess.get_sha256(
				"res://" + path.path_join(child)
			)
