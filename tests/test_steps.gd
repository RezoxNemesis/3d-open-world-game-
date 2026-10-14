extends SceneTree

const SCENE_FIXTURE := preload("res://tests/scene_fixture.gd")
## Real body motion probes for stairs, tall walls and overhead step clearance.

var checks := 0
var failures := 0


func check(condition: bool, label: String) -> void:
	checks += 1
	if condition:
		print("PASS: " + label)
	else:
		failures += 1
		push_error("FAIL: " + label)


func _initialize() -> void:
	call_deferred("run")


func settle(player: CharacterBody3D, location: Vector3) -> void:
	player.position = location
	player.velocity = Vector3.ZERO
	player.yaw = 0.0
	player.update_camera()
	for i in range(70):
		await physics_frame


func obstacle(parent: Node3D, size: Vector3, location: Vector3) -> StaticBody3D:
	var body := StaticBody3D.new()
	var shape := CollisionShape3D.new()
	var box := BoxShape3D.new()
	box.size = size
	shape.shape = box
	body.add_child(shape)
	body.position = location
	parent.add_child(body)
	return body


func run() -> void:
	var scene = load("res://scenes/main.tscn").instantiate()
	root.add_child(scene)
	var player: CharacterBody3D = scene.get_node("Player")
	await settle(player, Vector3(0, 2, -6))
	check(player.is_on_floor(), "stair approach starts grounded")
	Input.action_press("move_forward")
	for i in range(70):
		await physics_frame
	check(
		player.position.z < -10 and player.position.y > 0.65,
		"walking climbs consecutive 0.22 m sanctuary risers without jumping"
	)
	for i in range(80):
		await physics_frame
	Input.action_release("move_forward")
	for i in range(20):
		await physics_frame
	check(
		player.position.z < -15 and absf(player.position.y - 1.76) < 0.08,
		"walking reaches the sanctuary platform"
	)
	check(player.is_on_floor(), "sanctuary ascent ends grounded")
	Input.action_press("move_backward")
	var lowest := player.position.y
	for i in range(160):
		await physics_frame
		lowest = minf(lowest, player.position.y)
	Input.action_release("move_backward")
	for i in range(30):
		await physics_frame
	check(
		player.position.z > -7 and player.is_on_floor() and absf(player.position.y) < 0.08,
		"descending sanctuary stairs returns to grounded courtyard"
	)
	check(lowest > -0.1, "descending never falls through stair or courtyard collision")
	await settle(player, Vector3(0, 2, 17))
	Input.action_press("move_backward")
	for i in range(90):
		await physics_frame
	Input.action_release("move_backward")
	check(
		player.position.z < 19.6 and player.position.y < 0.1,
		"1.2 m south wall blocks automatic ascent"
	)
	var fixture := Node3D.new()
	scene.add_child(fixture)
	obstacle(fixture, Vector3(1, 0.22, 2), Vector3(0, 0.11, 10))
	obstacle(fixture, Vector3(1.9, 0.12, 2), Vector3(0, 1.82, 10))
	await settle(player, Vector3(-2, 1, 10))
	Input.action_press("move_right")
	for i in range(65):
		await physics_frame
	Input.action_release("move_right")
	check(
		player.position.x < -0.8 and player.position.y < 0.08,
		"low overhead ceiling prevents stepping into a blocked capsule space"
	)
	check(player.is_on_floor(), "blocked step keeps the player grounded")
	print("RESULT: %d step checks, %d failures" % [checks, failures])
	await SCENE_FIXTURE.dispose_scene(self, scene)
	quit(1 if failures else 0)
