extends SceneTree
## Actual physics probes for the expedition's optional encounter and travel vehicle.

const ENCOUNTER := preload("res://scripts/expedition_encounter.gd")
const PLAYER := preload("res://scripts/player.gd")


class BoundaryWorld:
	extends Node3D
	const MAX_SECTOR := 781250
	var origin_sector := Vector2i.ZERO

	func ground_height(_sector: Vector2i, _local: Vector3) -> float:
		return 0.0


var checks := 0
var failures := 0


func _initialize() -> void:
	call_deferred("run")


func check(condition: bool, label: String) -> void:
	checks += 1
	if not condition:
		failures += 1
		push_error("FAIL: " + label)
	else:
		print("PASS: " + label)


func frames(count: int) -> void:
	for index in range(count):
		await physics_frame


func box(parent: Node3D, size: Vector3, location: Vector3) -> StaticBody3D:
	var body := StaticBody3D.new()
	var collider := CollisionShape3D.new()
	var shape := BoxShape3D.new()
	shape.size = size
	collider.shape = shape
	body.add_child(collider)
	parent.add_child(body)
	body.position = location
	return body


func run() -> void:
	for action in [
		"move_left", "move_right", "move_forward", "move_backward", "toggle_view", "jump"
	]:
		if not InputMap.has_action(action):
			InputMap.add_action(action)
	var world := BoundaryWorld.new()
	root.add_child(world)
	var terrain_floor := box(world, Vector3(150, 1, 150), Vector3(0, -0.5, 0))
	var player := PLAYER.new()
	world.add_child(player)
	player.position = Vector3(0, 2, 12)
	var encounter := ENCOUNTER.new()
	world.add_child(encounter)
	encounter.setup(player, world)
	await frames(35)
	check(encounter.state == "idle", "guardian stays dormant outside its optional arena")
	check(not encounter.attack(), "distant melee misses the guardian")
	player.position = encounter.guardian.position + Vector3(0, 0, 4)
	await frames(2)
	check(encounter.state == "telegraph", "approach begins readable telegraph before damage")
	check(encounter.player_health == 100, "telegraph deals no immediate damage")
	player.position += Vector3(7, 0, 0)
	await frames(100)
	check(encounter.player_health == 100, "walking out of locked attack circle avoids damage")
	encounter.restart_encounter()
	player.position = encounter.guardian.position + Vector3(0, 0, 4)
	await frames(92)
	check(encounter.player_health == 75, "standing in the telegraph takes exactly one strike")
	await frames(15)
	check(encounter.player_health == 75, "one strike cannot repeatedly damage every frame")
	encounter.restart_encounter()
	player.position = encounter.guardian.position + Vector3(0, 0, 4)
	await frames(70)
	check(encounter.dodge(), "dodge is available during telegraph")
	check(not encounter.dodge(), "dodge has cooldown")
	await frames(25)
	check(encounter.player_health == 100, "timed dodge avoids guardian impact")
	encounter.restart_encounter()
	player.position = encounter.guardian.position + Vector3(0, 0, 3)
	player.model.rotation.y = PI
	check(not encounter.attack(), "melee facing away misses")
	player.model.rotation.y = 0.0
	check(encounter.attack(), "facing close guardian lands melee")
	check(not encounter.attack(), "melee cooldown prevents repeated instant damage")
	for index in range(4):
		await frames(34)
		player.position = encounter.guardian.position + Vector3(0, 0, 3)
		player.model.rotation.y = 0.0
		encounter.attack()
	check(
		encounter.guardian_health == 0 and encounter.state == "defeated",
		"five real melee strikes defeat guardian"
	)
	await frames(150)
	check(encounter.state == "defeated", "defeated guardian stops attacking")
	encounter.restart_encounter()
	check(
		encounter.player_health == 100 and encounter.guardian_health == 120,
		"retry restores health and encounter"
	)
	player.position = encounter.vehicle.position + Vector3(2, 0, 0)
	await frames(3)
	check(encounter.interact_vehicle(), "nearby player mounts actual vehicle")
	check(
		encounter.mounted and not player.is_physics_processing(),
		"mount transfers movement ownership"
	)
	var start := encounter.vehicle.position
	Input.action_press("move_forward")
	await frames(45)
	Input.action_release("move_forward")
	check(encounter.vehicle.position.z < start.z - 3, "joystick actions move mounted vehicle")
	check(
		player.position.distance_to(encounter.vehicle.position + Vector3(0, 0.95, 0)) < 0.1,
		"traveler follows the seat"
	)
	var driving_wall := box(
		world, Vector3(12, 5, 1), encounter.vehicle.position + Vector3(0, 1, -5)
	)
	var wall_z: float = encounter.vehicle.position.z - 5
	Input.action_press("move_forward")
	await frames(100)
	Input.action_release("move_forward")
	check(
		encounter.vehicle.position.z > wall_z + 1.2,
		"vehicle body cannot cross a tall physical wall"
	)
	check(encounter.interact_vehicle(), "safe supported side permits dismount")
	check(
		not encounter.mounted and player.is_physics_processing(),
		"dismount restores player controls"
	)
	await frames(10)
	check(player.is_on_floor(), "dismounted player lands on support")
	player.position = encounter.vehicle.position + Vector3(2, 0, 0)
	check(encounter.interact_vehicle(), "player remounts before blocked exit probe")
	var cage := Node3D.new()
	world.add_child(cage)
	for side in [-1.0, 1.0]:
		box(cage, Vector3(0.8, 6, 8), encounter.vehicle.position + Vector3(side * 2.8, 3, 0))
		box(cage, Vector3(8, 6, 0.8), encounter.vehicle.position + Vector3(0, 3, side * 2.9))
	await frames(2)
	check(
		not encounter.interact_vehicle() and encounter.mounted,
		"blocked dismount refuses to put player inside collision"
	)
	cage.queue_free()
	await frames(2)
	encounter.reset_for_destination()
	check(
		not encounter.mounted and player.is_physics_processing(),
		"atlas destination resets mounted ownership safely"
	)
	encounter.restart_encounter()
	player.position = encounter.guardian.position + Vector3(0, 0, 4)
	await frames(750)
	check(
		encounter.player_health == 0 and encounter.state == "player_defeated",
		"repeated real impacts produce recoverable player defeat"
	)
	check(not player.is_physics_processing(), "defeated player cannot continue moving")
	encounter.restart_encounter()
	check(
		player.is_physics_processing() and encounter.player_health == 100,
		"retry after player defeat restores control"
	)
	player.position = encounter.guardian.position + Vector3(0, 0, 3.5)
	player.model.rotation.y = 0.0
	var barrier := box(
		world, Vector3(6, 3, 0.3), encounter.guardian.position + Vector3(0, 1.5, 2.0)
	)
	await frames(2)
	check(not encounter.attack(), "melee cannot strike through a wall")
	var before_dodge: Vector3 = player.position
	encounter.dodge()
	check(
		player.position.z > barrier.position.z + 0.35 and player.position.z < before_dodge.z,
		"dodge travels but stops before solid wall"
	)
	barrier.queue_free()
	await frames(2)
	encounter.restart_encounter()
	player.position = encounter.vehicle.position + Vector3(3.5, 0, 0)
	var mount_barrier := box(
		world, Vector3(0.2, 3, 6), encounter.vehicle.position + Vector3(2.8, 1.5, 0)
	)
	await frames(2)
	check(not encounter.interact_vehicle(), "mount cannot teleport through an intervening wall")
	mount_barrier.queue_free()
	await frames(2)
	player.position = Vector3(120, 2, 12)
	var parked_position: Vector3 = encounter.vehicle.position
	terrain_floor.queue_free()
	await frames(15)
	check(
		encounter.vehicle.position.is_equal_approx(parked_position),
		"distant unmounted cart remains parked after its terrain collision unloads"
	)
	driving_wall.queue_free()
	box(world, Vector3(150, 1, 150), Vector3(0, -0.5, 0))
	await frames(2)
	for edge in [Vector2i(1, 0), Vector2i(-1, 0), Vector2i(0, 1), Vector2i(0, -1)]:
		world.origin_sector = edge * world.MAX_SECTOR
		encounter.reset_for_destination()
		var outward := Vector3(edge.x, 0, edge.y)
		encounter.vehicle.position = outward * -4.0 + Vector3.UP * 0.1
		player.position = encounter.vehicle.position + Vector3(2.8, 0, 0)
		await frames(2)
		check(encounter.interact_vehicle(), "edge cart mounts at %s" % edge)
		var action: String = (
			"move_right"
			if edge.x > 0
			else "move_left" if edge.x < 0 else "move_backward" if edge.y > 0 else "move_forward"
		)
		Input.action_press(action)
		await frames(45)
		Input.action_release(action)
		check(
			(
				encounter.vehicle.position.dot(outward) <= 0.001
				and player.position.dot(outward) <= 0.001
			),
			"mounted cart and traveler respect world edge %s" % edge
		)
		check(
			encounter.vehicle.velocity.dot(outward) <= 0.001,
			"world edge brakes outward vehicle speed %s" % edge
		)
		encounter.reset_for_destination()
	world.origin_sector = Vector2i.ZERO
	encounter.reset_for_destination()
	player.position = encounter.vehicle.position + Vector3(2.8, 0, 0)
	await frames(2)
	encounter.interact_vehicle()
	encounter.vehicle.position.y = -20.0
	await frames(3)
	check(
		encounter.vehicle.position.y >= 0 and player.position.y > 0.9,
		"fallen mounted cart recovers on supporting terrain"
	)
	encounter.reset_for_destination()
	encounter.vehicle.position = Vector3(-20, 0.1, 0)
	player.position = encounter.vehicle.position + Vector3(2.8, 0, 0)
	var canopy := box(world, Vector3(10, 0.3, 1), Vector3(-20, 2.4, -5))
	await frames(2)
	encounter.interact_vehicle()
	Input.action_press("move_forward")
	await frames(60)
	Input.action_release("move_forward")
	check(
		encounter.vehicle.position.z > -2.4 and encounter.vehicle.position.z < -0.2,
		"cart mast and rider are blocked by low overhead beams"
	)
	canopy.queue_free()
	world.origin_sector = Vector2i(world.MAX_SECTOR, world.MAX_SECTOR)
	encounter.reset_for_destination()
	check(
		(
			encounter.guardian.position.x <= 0
			and encounter.guardian.position.z <= 0
			and encounter.vehicle.position.x <= 0
			and encounter.vehicle.position.z <= 0
		),
		"extreme atlas arrival places encounter and vehicle inside the domain"
	)
	var old_position: Vector3 = encounter.guardian.position
	encounter._on_rebased(Vector3(128, 0, 0))
	check(
		encounter.guardian.position == old_position - Vector3(128, 0, 0),
		"guardian follows floating origin shift"
	)
	await check_encounter_lifecycle(encounter, world, player)
	print("RESULT: %d expedition encounter checks, %d failures" % [checks, failures])
	world.queue_free()
	await process_frame
	await process_frame
	quit(1 if failures else 0)


func check_encounter_lifecycle(encounter: Node3D, world: Node3D, player: CharacterBody3D) -> void:
	check(encounter.has_signal("guardian_defeated"), "guardian exposes persisted victory signal")
	if not encounter.has_signal("guardian_defeated"):
		return
	var victories: Array[Vector2i] = []
	encounter.guardian_defeated.connect(func(sector: Vector2i): victories.append(sector))
	world.origin_sector = Vector2i(12, -9)
	encounter.reset_for_destination(true)
	player.position = encounter.guardian.position + Vector3(0, 0, 4)
	await frames(200)
	check(
		(
			encounter.state == "defeated"
			and encounter.guardian_health == 0
			and encounter.player_health == 100
		),
		"persisted pacification restores calm guardian without attacks"
	)
	check(victories.is_empty(), "restoring a pacified guardian does not award another victory")
	encounter.reset_for_destination()
	player.position = encounter.guardian.position + Vector3(0, 0, 4)
	await frames(60)
	var head: Node3D = encounter.guardian_model.get_node("Head")
	var foreleg: Node3D = encounter.guardian_model.get_node("Foreleg0")
	check(
		head.rotation.x < -0.1 and foreleg.rotation.x < -0.3,
		"telegraph raises articulated head and forelegs before impact"
	)
	check(
		encounter.warning_ring.scale.is_equal_approx(Vector3.ONE),
		"warning boundary stays at actual strike radius during windup"
	)
	var node_count: int = encounter.get_child_count()
	var relative_target: Vector3 = encounter.attack_target - player.position
	var warning_offset: Vector3 = encounter.warning_ring.position - encounter.attack_target
	player.position -= Vector3(128, 0, 0)
	world.origin_sector += Vector2i(1, 0)
	encounter._on_rebased(Vector3(128, 0, 0))
	check(
		(
			(encounter.attack_target - player.position).is_equal_approx(relative_target)
			and (encounter.warning_ring.position - encounter.attack_target).is_equal_approx(
				warning_offset
			)
		),
		"rebase preserves locked strike and visible warning relative to traveler"
	)
	await frames(35)
	check(
		encounter.player_health == 75 and encounter.pulse_ring.visible,
		"animated ground strike deals one hit with bounded impact pulse"
	)
	await frames(40)
	check(
		encounter.player_health == 75 and absf(foreleg.rotation.x) < 0.2,
		"recovery lowers limbs without duplicate strike damage"
	)
	check(
		encounter.get_child_count() == node_count and not encounter.pulse_ring.visible,
		"strike effect reuses fixed geometry and expires after impact"
	)
	encounter.guardian_health = 24
	player.position = encounter.guardian.position + Vector3(0, 0, 3)
	player.model.rotation.y = 0
	check(encounter.attack(), "final melee calms guardian after rebased attack")
	check(
		victories == [Vector2i(12, -9)],
		"victory records guardian's original sector exactly once after rebase"
	)
	encounter.attack()
	await frames(5)
	check(victories.size() == 1, "extra attacks on calmed guardian cannot duplicate victory")
	world.origin_sector = Vector2i.ZERO
	encounter.reset_for_destination()
	encounter.vehicle.position = encounter.guardian.position + Vector3(0, 0.1, 5)
	player.position = encounter.vehicle.position + Vector3(2.8, 0, 0)
	await frames(2)
	check(encounter.interact_vehicle(), "rider defeat probe starts mounted")
	encounter.player_health = 25
	await frames(105)
	check(
		encounter.state == "player_defeated" and encounter.mounted,
		"guardian can defeat mounted traveler without dropping collision ownership"
	)
	var stopped_position: Vector3 = encounter.vehicle.position
	Input.action_press("move_right")
	await frames(20)
	Input.action_release("move_right")
	check(
		encounter.vehicle.position.is_equal_approx(stopped_position),
		"defeated rider's cart cannot drift or accept movement"
	)
	encounter.restart_encounter()
	check(
		not encounter.mounted and player.collision_layer != 0 and player.is_physics_processing(),
		"retry restores rider collision and on-foot controls"
	)
	player.position = encounter.vehicle.position + Vector3(2.8, 0, 0)
	await frames(2)
	check(encounter.interact_vehicle(), "scene-exit probe starts mounted")
	world.remove_child(encounter)
	check(
		(
			player.collision_layer != 0
			and player.collision_mask != 0
			and player.is_physics_processing()
			and not player.get_meta("expedition_mounted")
		),
		"removing mounted encounter releases traveler controls and collision"
	)
	encounter.free()
