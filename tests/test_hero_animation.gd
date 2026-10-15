extends SceneTree
## Actual swept launch, charged poses, delayed smash and bounded motion-driven geometry.

const PLAYER := preload("res://scripts/player.gd")
const POWERS := preload("res://scripts/hero_powers.gd")
var checks := 0
var failures := 0


class TestWorld:
	extends Node3D
	signal rebased(offset: Vector3)
	var origin_sector := Vector2i.ZERO
	var sample_height := 0.0

	func ground_height(_sector: Vector2i, _local: Vector3) -> float:
		return sample_height

	func terrain_height(_x: float, _z: float) -> float:
		return 0.0


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


func obstacle(parent: Node3D, dimensions: Vector3, point: Vector3) -> StaticBody3D:
	var body := StaticBody3D.new()
	var collision := CollisionShape3D.new()
	var shape := BoxShape3D.new()
	shape.size = dimensions
	collision.shape = shape
	body.position = point
	body.add_child(collision)
	parent.add_child(body)
	return body


func run() -> void:
	for action in [
		"move_left", "move_right", "move_forward", "move_backward", "jump", "toggle_view", "sprint"
	]:
		if not InputMap.has_action(action):
			InputMap.add_action(action)
	var world := TestWorld.new()
	root.add_child(world)
	obstacle(world, Vector3(300, 1, 300), Vector3(0, -0.5, 0))
	var player := PLAYER.new()
	world.add_child(player)
	var powers := POWERS.new()
	world.add_child(powers)
	powers.setup(player, world)
	await frames(30)
	powers.toggle_flight()
	await frames(4)
	check(
		powers.motion_state().action == "flight_crouch" and player.knees[0].rotation.x < -0.4,
		"FLY visibly compresses the actual legs before automatic launch"
	)
	await frames(32)
	check(
		player.position.y > 4.0 and player.position.y < 12.0,
		"a FLY tap alone lifts the real capsule into the air"
	)
	var hover: float = player.position.y
	await frames(45)
	check(absf(player.position.y - hover) < 0.03, "launch settles into controllable stable hover")
	check(
		player.arms[0].rotation.x > 1.2, "airborne arms transition from launch to extended flight"
	)
	powers.restore_state({"flying": true, "fast": false, "destroyed": []})
	await frames(20)
	check(absf(player.position.y - hover) < 0.03, "saved airborne flight never replays the launch")
	powers.toggle_flight()
	await frames(90)
	var ceiling := obstacle(world, Vector3(10, 0.1, 10), Vector3(0, 3.2, 0))
	powers.toggle_flight()
	await frames(40)
	check(
		player.position.y < 1.55 and player.position.y > 1.3,
		"automatic launch remains swept and stops below an actual low ceiling"
	)
	Input.action_press("power_descend")
	await frames(20)
	Input.action_release("power_descend")
	check(
		player.position.y < 0.05,
		"DOWN immediately controls the launched body and collides with ground"
	)
	powers.toggle_flight()
	ceiling.free()
	await frames(20)
	powers.begin_leap()
	await frames(40)
	check(
		player.model.position.y < -0.08 and player.knees[0].rotation.x < -1.0,
		"held LEAP deepens the visible crouch and knee compression"
	)
	check(powers.fx.active_count("ring") > 0, "charged power emits actual pooled ground rings")
	check(powers.release_leap(), "deliberate charge release launches the real body")
	await frames(10)
	check(
		player.position.y > 3 and player.arms[0].rotation.x > 1.0,
		"charged leap extends arms and drives a genuine ascending arc"
	)
	var landing_ring := false
	for index in range(300):
		await physics_frame
		if player.is_on_floor() and powers.fx.active_count("ring") > 0:
			landing_ring = true
	check(landing_ring, "actual charged-leap landing creates an impact ring on contact")
	check(
		player.is_on_floor() and powers.motion_state().action == "",
		"charged leap returns to grounded animation after actual landing"
	)
	player.position = Vector3(0, 0.02, 0)
	var wall := obstacle(world, Vector3(0.1, 4, 20), Vector3(24, 2, 0))
	powers.toggle_speed()
	Input.action_press("move_right")
	Input.action_press("sprint")
	await frames(28)
	check(
		player.position.x > 5 and player.model.rotation.x < -0.2,
		"actual accelerated speed creates a strong forward body lean"
	)
	check(
		powers.fx.active_count("streak") > 0 and powers.fx.active_count("echo") > 0,
		"real fast displacement leaves original 3D streaks and humanoid echoes"
	)
	check(
		powers.fx.active_count() <= 34 and powers.fx.get_child_count() == 3,
		"all power geometry stays in 34 fixed instances and three mesh batches"
	)
	await frames(130)
	check(
		player.position.x < 23.7 and powers.fx.active_count() == 0,
		"holding speed into an actual wall expires all motion trails"
	)
	check(
		player.camera.fov < 67 and absf(player.model.rotation.x) < 0.1,
		"blocked resolved motion restores camera FOV and body posture"
	)
	Input.action_release("move_right")
	Input.action_release("sprint")
	powers.toggle_speed()
	wall.free()
	player.position = Vector3(100, 0.02, 60)
	player.velocity = Vector3.ZERO
	player.yaw = 0
	await frames(10)
	check(
		powers.smash() and powers.mountains.targets.has("crag_east"),
		"SMASH begins anticipation while the real mountain still blocks travel"
	)
	await frames(8)
	check(
		player.arms[1].rotation.x < -0.5 and powers.mountains.targets.has("crag_east"),
		"smash winds the striking arm back before collision destruction"
	)
	await frames(10)
	check(
		not powers.mountains.targets.has("crag_east") and powers.mountains.debris.size() == 8,
		"the impact frame removes the actual mountain and launches physical debris"
	)
	check(
		powers.mountains.shockwaves.size() == 1 and powers.fx.active_count("ring") > 0,
		"impact has both the mountain shockwave and the pooled near-body ground ring"
	)
	powers.restore_state({"flying": false, "fast": false, "destroyed": []})
	check(powers.smash(), "a restored intact formation accepts another deliberate strike")
	powers.cancel_actions()
	await frames(30)
	check(
		powers.mountains.targets.has("crag_east") and powers.fx.active_count() == 0,
		"involuntary cancellation clears pending impact and all visual effects"
	)
	check(
		powers.snapshot() == {"flying": false, "fast": false, "destroyed": []},
		"animation and effect state never leak into the established save contract"
	)
	powers.fx.burst(player.position, 4, Color.WHITE)
	world.rebased.emit(Vector3(128, 0, 0))
	var shifted := false
	for entry: Dictionary in powers.fx.slots.ring:
		if entry.life > 0:
			shifted = is_equal_approx(entry.at.origin.x, player.position.x - 128)
	check(
		shifted and powers.mountains.position.x == -128,
		"world origin rebasing shifts live effects and breakable bodies together"
	)
	world.sample_height = 4.0
	powers.relocate_for_world()
	check(
		(
			powers.mountains.position.is_zero_approx()
			and is_equal_approx(powers.mountains.targets.crag_east.position.y, 3.7)
			and powers.fx.active_count() == 0
		),
		"atlas relocation clears old effects and seats restored crags on destination terrain"
	)
	world.free()
	await process_frame
	print("HERO_ANIMATION_RESULT: %d checks, %d failures" % [checks, failures])
	quit(1 if failures else 0)
