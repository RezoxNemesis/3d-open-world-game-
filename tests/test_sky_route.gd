extends SceneTree
## The upper temple is reached and left by real capsule motion on every riser.

const SCENE_FIXTURE := preload("res://tests/scene_fixture.gd")
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


func walk(frames: int, action: String) -> void:
	Input.action_press(action)
	for index in range(frames):
		await physics_frame
	Input.action_release(action)
	for index in range(8):
		await physics_frame


func run() -> void:
	var scene = load("res://scenes/main.tscn").instantiate()
	root.add_child(scene)
	var player: CharacterBody3D = scene.get_node("Player")
	player.position = Vector3(29, 1, -4)
	player.velocity = Vector3.ZERO
	player.yaw = 0.0
	player.set_sprint_enabled(false)
	player.update_camera()
	for index in range(75):
		await physics_frame
	check(player.is_on_floor(), "sky approach starts grounded at eastern gate")
	await walk(18, "move_backward")
	await walk(252, "move_right")
	check(
		player.position.x > 49 and player.position.x < 51 and player.is_on_floor(),
		"capsule walks from eastern gate onto the sky stair approach"
	)
	# Align within the approach lane before the single uninterrupted ascent.
	player.velocity = Vector3.ZERO
	Input.action_press("move_forward")
	var lowest := player.position.y
	var highest := player.position.y
	for index in range(420):
		await physics_frame
		lowest = minf(lowest, player.position.y)
		highest = maxf(highest, player.position.y)
	Input.action_release("move_forward")
	for index in range(20):
		await physics_frame
	check(
		player.position.z < -32 and player.is_on_floor() and absf(player.position.y - 10) < 0.08,
		"continuous capsule walking climbs all fifty risers and lands on upper terrace"
	)
	check(lowest > -0.08 and highest < 10.1, "sky ascent neither falls through nor jumps to height")
	await walk(45, "move_left")
	await walk(95, "move_forward")
	check(
		player.position.distance_to(Vector3(46, 10, -42)) < 2.3 and player.is_on_floor(),
		"upper relic landing is reachable by walking from the stair exit"
	)
	# Reverse the same physical route, allowing acceleration/deceleration to settle.
	await walk(95, "move_backward")
	await walk(45, "move_right")
	await walk(375, "move_backward")
	check(
		player.position.z > -3 and player.is_on_floor() and absf(player.position.y) < 0.08,
		"descending all fifty risers returns to the grounded approach deck"
	)
	await walk(252, "move_left")
	check(
		player.position.x < 31 and player.is_on_floor() and absf(player.position.y) < 0.08,
		"return route walks back through eastern gate without teleporting"
	)
	print("SKY_ROUTE_RESULT: %d checks, %d failures" % [checks, failures])
	await SCENE_FIXTURE.dispose_scene(self, scene)
	quit(1 if failures else 0)
