extends SceneTree
## Run under a real display (Xvfb/Mesa is acceptable), never the dummy headless renderer.


func _initialize() -> void:
	call_deferred("capture")


func capture() -> void:
	var scene = load("res://scenes/main.tscn").instantiate()
	root.add_child(scene)
	for i in range(45):
		await process_frame
	var camera := Camera3D.new()
	scene.add_child(camera)
	camera.current = true
	camera.global_position = Vector3(22, 16, 23)
	camera.look_at(Vector3(0, 2, -5))
	await process_frame
	await RenderingServer.frame_post_draw
	var image := root.get_texture().get_image()
	var result := image.save_png("res://artifacts/temple-courtyard.png")
	print(
		(
			"RENDER_CAPTURE: %dx%d, renderer=%s, result=%d"
			% [
				image.get_width(),
				image.get_height(),
				RenderingServer.get_video_adapter_name(),
				result
			]
		)
	)
	scene.queue_free()
	await process_frame
	quit(0 if result == OK else 1)
