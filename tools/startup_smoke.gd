extends SceneTree

const SCENE_FIXTURE := preload("res://tests/scene_fixture.gd")
## Own the smoke scene lifecycle so the audio server drains before process shutdown.


func _initialize() -> void:
	call_deferred("run")


func run() -> void:
	var scene := load("res://scenes/main.tscn").instantiate() as Node3D
	root.add_child(scene)
	for frame in range(180):
		await process_frame
	await SCENE_FIXTURE.dispose_scene(self, scene)
	quit(0)
