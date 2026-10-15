extends SceneTree
## Actual Main/Player flight against imported structural roof geometry.

const FIXTURE := preload("res://tests/scene_fixture.gd")
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


func frames(count: int) -> void:
	for frame in range(count):
		await physics_frame


func walk(action: String, count: int) -> void:
	Input.action_press(action)
	await frames(count)
	Input.action_release(action)
	await frames(10)


func run() -> void:
	var scene: Node3D = load("res://scenes/main.tscn").instantiate()
	root.add_child(scene)
	await frames(3)
	var player: CharacterBody3D = scene.get_node("Player")
	var powers: Node = player.powers
	var world := scene.get_node("World") as Node3D
	var structures := world.get_node_or_null("ArchitectureCollision")
	check(structures != null, "actual World builds the structural collision layer")
	if structures != null:
		var valid := true
		var triangles := 0
		var sources: Dictionary = {}
		for body: StaticBody3D in structures.get_children():
			var path: String = body.get_meta("source_module", "")
			sources[path.get_file().get_basename()] = true
			valid = valid and not "residence" in path
			for collision: CollisionShape3D in body.get_children():
				valid = valid and collision.shape is ConcavePolygonShape3D
				if collision.shape is ConcavePolygonShape3D:
					valid = valid and collision.shape.backface_collision
					var faces: PackedVector3Array = collision.shape.get_faces()
					triangles += faces.size() / 3
					for point in faces:
						valid = valid and point.is_finite()
		check(valid, "actual finite roof/floor faces block both directions and exclude residence")
		check(
			triangles > 2000 and triangles < 100000,
			"collision uses bounded base geometry without the million decorative tiles"
		)
		check(sources.size() == 8, "every existing structural module type receives collision")
		var bodies := structures.get_child_count()
		structures.build(world)
		check(structures.get_child_count() == bodies, "collision building is idempotent")
		print(
			(
				"ARCHITECTURE_COLLISION_GEOMETRY: %d actual base triangles in %d bodies"
				% [triangles, bodies]
			)
		)
	if not powers.flying:
		powers.toggle_flight()
	player.position = Vector3(5.3, 9.0, -15.0)
	player.velocity = Vector3.ZERO
	await frames(2)
	Input.action_press("power_descend")
	await frames(28)
	Input.action_release("power_descend")
	print(
		"ARCHITECTURE_REAL_DESCENT: foot=%s grounded=%s" % [player.position, player.is_on_floor()]
	)
	check(
		player.position.y > 5.3,
		"actual flying Player lands on the sanctuary roof instead of passing through it"
	)
	player.position = Vector3(5.3, 2.0, -15.0)
	player.velocity = Vector3.ZERO
	await frames(2)
	Input.action_press("jump")
	await frames(25)
	Input.action_release("jump")
	check(
		player.position.y > 3.0 and player.position.y < 4.3,
		"real ascent stops beneath the sanctuary roof"
	)
	for landing in [
		[Vector3(-12.5, 6.0, -8.0), 2.3, "scaled courtyard pavilion"],
		[Vector3(49.0, 26.0, -40.0), 16.0, "upper pagoda tier"],
		[Vector3(-29.0, 15.0, -41.5), 9.7, "fox shrine"],
		[Vector3(-30.0, 13.0, -24.5), 9.6, "covered bridge"],
		[Vector3(-47.0, 26.0, -32.0), 21.6, "highland shrine"],
		[Vector3(30.0, 9.0, -4.0), 5.7, "rotated eastern gate"]
	]:
		player.position = landing[0]
		player.velocity = Vector3.ZERO
		await frames(2)
		Input.action_press("power_descend")
		await frames(35)
		Input.action_release("power_descend")
		print("ARCHITECTURE_LANDING: %s foot=%s" % [landing[2], player.position])
		check(player.position.y > landing[1], "actual flying capsule lands on the " + landing[2])
	player.position = Vector3(1.65, 6.7, -13.2)
	player.velocity = Vector3.ZERO
	player.yaw = 0.0
	player.pitch = 0.0
	await frames(2)
	Input.action_press("move_forward")
	await frames(12)
	Input.action_release("move_forward")
	print("ARCHITECTURE_UPPER_FACADE: foot=%s" % player.position)
	check(
		player.position.z > -15.55 and player.position.z < -14.5,
		"actual horizontal flight stops against the sanctuary upper opaque facade"
	)
	powers.toggle_flight()
	player.position = Vector3(0, 2.0, -12.0)
	player.velocity = Vector3.ZERO
	player.yaw = 0.0
	await frames(12)
	await walk("move_forward", 50)
	print("ARCHITECTURE_HALL_ENTRY: foot=%s grounded=%s" % [player.position, player.is_on_floor()])
	check(
		player.position.z < -15.5 and player.is_on_floor(),
		"real capsule enters the central hall along its original walking axis"
	)
	# The original low altar/canopy is a real visible obstacle. Its right-hand
	# aisle reaches the rear floor without walking through ceremonial geometry.
	await walk("move_right", 20)
	await walk("move_forward", 50)
	check(
		player.position.z < -19.5 and player.position.x > 1.1 and player.is_on_floor(),
		"the actual capsule walks around the visible altar to the rear hall"
	)
	await walk("move_backward", 50)
	await walk("move_left", 20)
	await walk("move_backward", 50)
	check(
		player.position.z > -13.0 and player.is_on_floor(),
		"central hall doorway and stair return remain clear"
	)
	print("ARCHITECTURE_COLLISION_RESULT: %d checks, %d failures" % [checks, failures])
	await FIXTURE.dispose_scene(self, scene)
	quit(1 if failures else 0)
