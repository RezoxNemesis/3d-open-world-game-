extends SceneTree
## Own the smoke scene lifecycle so the audio server drains before process shutdown.


func _initialize() -> void:
	call_deferred("run")


func run() -> void:
	var scene := load("res://scenes/main.tscn").instantiate() as Node3D
	root.add_child(scene)
	for frame in range(180):
		await process_frame
	scene.queue_free()
	await process_frame
	await create_timer(0.15).timeout
	quit(0)
