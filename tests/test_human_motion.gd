extends SceneTree
## Real capsule displacement drives gait; blocking, landing and flight keep distinct poses.

const PLAYER := preload("res://scripts/player.gd")
var checks := 0
var failures := 0


class FlightFixture:
	extends Node
	var flying := true
	var fast := false

	func advance(_delta: float) -> void:
		pass

	func prepare_streaming(_delta: float) -> void:
		pass

	func update_camera(_delta: float) -> void:
		pass

	func flight_velocity(_input: Vector2, _running: bool, _delta: float) -> Vector3:
		return Vector3.ZERO


func _initialize() -> void:
	call_deferred("run")


func check(value: bool, label: String) -> void:
	checks += 1
	if value:
		print("PASS: " + label)
	else:
		failures += 1
		push_error("FAIL: " + label)


func frames(count: int) -> void:
	for index in range(count):
		await physics_frame


func obstacle(size: Vector3, at: Vector3) -> StaticBody3D:
	var body := StaticBody3D.new()
	var collision := CollisionShape3D.new()
	var shape := BoxShape3D.new()
	shape.size = size
	collision.shape = shape
	body.position = at
	body.add_child(collision)
	root.add_child(body)
	return body


func run() -> void:
	for action in [
		"move_left", "move_right", "move_forward", "move_backward", "jump", "toggle_view", "sprint"
	]:
		if not InputMap.has_action(action):
			InputMap.add_action(action)
	var floor_body := obstacle(Vector3(60, 0.2, 60), Vector3(0, -0.1, 0))
	var wall := obstacle(Vector3(12, 3, 0.2), Vector3(0, 1.5, -4))
	var player := PLAYER.new()
	root.add_child(player)
	await frames(30)
	var chest: Node3D = player.model.get_node("TailoredAttire")
	var low := chest.scale.y
	var high := low
	for index in range(90):
		await physics_frame
		low = minf(low, chest.scale.y)
		high = maxf(high, chest.scale.y)
	check(high - low > 0.001, "idle breathing changes the actual chest pose")
	Input.action_press("move_forward")
	await frames(25)
	check(
		player.position.z < -1.0 and player.gait_weight > 0.5,
		"actual forward displacement drives the walking blend"
	)
	await frames(65)
	var blocked_phase: float = player.step_time
	await frames(30)
	check(
		player.position.z > -3.6 and player.gait_weight < 0.04,
		"held movement into a real wall settles out of gait"
	)
	check(
		absf(player.step_time - blocked_phase) < 0.01,
		"stride phase stops when the capsule cannot move"
	)
	Input.action_release("move_forward")
	player.position = Vector3(0, 0.02, 2)
	await frames(20)
	Input.action_press("move_forward")
	await frames(18)
	var walk_arm: float = player.elbows[0].rotation.x
	Input.action_press("sprint")
	await frames(15)
	check(
		player.elbows[0].rotation.x > walk_arm + 0.15,
		"actual running smoothly bends elbows more than walking"
	)
	Input.action_press("move_right")
	await frames(4)
	check(
		absf(player.model.rotation.z) > 0.008,
		"real direction change leans the traveler into the turn"
	)
	check(
		absf(player.model.get_node("TailoredAttire").rotation.y) > 0.005,
		"moving torso counterrotates against the paired gait"
	)
	Input.action_release("move_right")
	Input.action_release("sprint")
	Input.action_release("move_forward")
	await frames(30)
	check(player.gait_weight < 0.04, "release returns smoothly to an idle stance")
	Input.action_press("jump")
	await frames(5)
	Input.action_release("jump")
	check(
		player.position.y > 0.2 and player.knees[0].rotation.x < -0.2,
		"actual rising jump flexes knees anatomically backward"
	)
	var landed := false
	var compressed := false
	for index in range(100):
		await physics_frame
		if player.is_on_floor():
			landed = true
			compressed = compressed or player.model.position.y < -0.015
	check(landed and compressed, "real airborne-to-ground transition absorbs landing impact")
	var flight := FlightFixture.new()
	root.add_child(flight)
	player.powers = flight
	player.position.y = 3
	await frames(30)
	check(
		player.arms[0].rotation.x > 1.2 and player.model.rotation.x < -0.2,
		"existing extended-arm flight pose survives gait replacement"
	)
	player.set_meta("traveler_action", "mounted")
	flight.flying = false
	player.set_physics_process(false)
	for index in range(30):
		player.update_traveler_motion(1.0 / 60.0, Vector3.ZERO, true, false)
	check(
		player.legs[0].rotation.x > 0.8 and player.knees[0].rotation.x < -0.8,
		"mounted visual action produces a seated rider without moving the collider"
	)
	player.remove_meta("traveler_action")
	player.powers = null
	flight.free()
	player.free()
	wall.free()
	floor_body.free()
	print("HUMAN_MOTION_RESULT: %d checks, %d failures" % [checks, failures])
	quit(1 if failures else 0)
