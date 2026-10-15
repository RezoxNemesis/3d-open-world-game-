extends SceneTree

var checks := 0
var failures := 0


func _initialize() -> void:
	call_deferred("run")


func check(value: bool, label: String) -> void:
	checks += 1
	if not value:
		failures += 1
		push_error(label)


func run() -> void:
	var stage := Node3D.new()
	root.add_child(stage)
	var camera := Camera3D.new()
	stage.add_child(camera)
	camera.position = Vector3(0, 4, 20)
	camera.current = true
	var floor_body := StaticBody3D.new()
	var collision := CollisionShape3D.new()
	var shape := BoxShape3D.new()
	shape.size = Vector3(40, 1, 40)
	collision.shape = shape
	floor_body.position.y = -0.5
	floor_body.add_child(collision)
	stage.add_child(floor_body)
	var residents = preload("res://scripts/expedition_residents.gd").new()
	stage.add_child(residents)
	residents.build()
	check(residents.get_child_count() == 2, "Two original residents inhabit the arrival court")
	var keeper = residents.get_child(0)
	var initial: Vector3 = keeper.position
	for frame in range(300):
		await physics_frame
	check(keeper.is_on_floor(), "Resident patrol has physical ground support")
	check(
		keeper.position.distance_to(initial) > 1.0,
		"Resident walks a real patrol instead of static decoration"
	)
	check(keeper.gait_weight > 0.3, "Human gait follows actual patrol movement")
	camera.position = keeper.position + Vector3(0, 1.7, 5)
	for frame in range(50):
		await physics_frame
	check(keeper.velocity.length() < 0.1, "Resident stops to greet a nearby visitor")
	check(
		keeper.greeting.text.contains("Keeper Lin"),
		"Nearby visitor receives a place-specific greeting"
	)
	check(absf(keeper.arms[0].rotation.x) < 0.5, "Idle greeting returns human arms to relaxed pose")
	stage.queue_free()
	await process_frame
	print("EXPEDITION_RESIDENTS_RESULT: %d checks, %d failures" % [checks, failures])
	quit(1 if failures else 0)
