extends SceneTree
## Walks from the retained courtyard through both real rooms and back.

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


func walk_to(player: CharacterBody3D, target: Vector3) -> bool:
	var reached := false
	for frame in range(900):
		var offset := Vector2(target.x - player.position.x, target.z - player.position.z)
		if offset.length() < 0.11:
			reached = true
			break
		var direction := offset.normalized()
		Input.action_press("move_right", maxf(0, direction.x))
		Input.action_press("move_left", maxf(0, -direction.x))
		Input.action_press("move_backward", maxf(0, direction.y))
		Input.action_press("move_forward", maxf(0, -direction.y))
		await physics_frame
	for action in ["move_left", "move_right", "move_forward", "move_backward"]:
		Input.action_release(action)
	for frame in range(8):
		await physics_frame
	return reached and player.is_on_floor() and absf(player.position.y - target.y) < 0.09


func run() -> void:
	var scene = load("res://scenes/main.tscn").instantiate()
	root.add_child(scene)
	for frame in range(70):
		await physics_frame
	var world: Node3D = scene.get_node("World")
	var house: Node3D = world.get_node_or_null("ResidenceDistrict")
	check(house != null, "residence is instantiated in the actual game world")
	if house == null:
		print("RESIDENCE_RESULT: %d checks, %d failures" % [checks, failures])
		await FIXTURE.dispose_scene(self, scene)
		quit(1)
		return
	check(
		house.has_node("ResidenceNear") and house.has_node("ResidenceFar"),
		"home imports actual near interior and far shell geometry"
	)
	check(
		house.get_node("ResidenceCollision").get_child_count() >= 6,
		"floor walls posts ceiling furniture and roof all have physical collision"
	)
	var player: CharacterBody3D = scene.get_node("Player")
	player.position = Vector3(20, 2, 12)
	player.velocity = Vector3.ZERO
	player.yaw = 0.0
	player.set_sprint_enabled(false)
	player.update_camera()
	for frame in range(75):
		await physics_frame
	check(
		await walk_to(player, Vector3(20, 0, 22.5)),
		"capsule exits courtyard through the visible south wall opening"
	)
	check(
		await walk_to(player, Vector3(11.5, 0, 22.5)), "supported path turns toward the house side"
	)
	check(
		await walk_to(player, Vector3(11.5, 0, 39)),
		"capsule walks around the real closed rear and side walls"
	)
	check(
		await walk_to(player, Vector3(20, 0, 39.5)),
		"front approach connects continuously to the residence steps"
	)
	check(
		await walk_to(player, Vector3(20, 0.6, 35)),
		"three physical twenty-centimeter risers lead through the front doorway"
	)
	check(
		await walk_to(player, Vector3(20, 0.6, 32)),
		"front furnished room has an unobstructed walking corridor"
	)
	check(
		await walk_to(player, Vector3(20, 0.6, 30)),
		"capsule passes the real internal partition doorway"
	)
	check(
		await walk_to(player, Vector3(20, 0.6, 26.2)),
		"rear furnished room is physically reachable from the entrance"
	)
	var solid_rooms := true
	for segment in [
		[Vector3(20, 1.8, 30), Vector3(28, 1.8, 30)], [Vector3(20, 1.8, 27), Vector3(20, 1.8, 24)]
	]:
		var ray := PhysicsRayQueryParameters3D.create(segment[0], segment[1], 1, [player.get_rid()])
		solid_rooms = (
			solid_rooms
			and not world.get_world_3d().direct_space_state.intersect_ray(ray).is_empty()
		)
	check(solid_rooms, "visible house side and rear walls stop physical rays")
	var furniture: StaticBody3D = house.get_node("ResidenceCollision/Furniture")
	var solid_furniture := furniture.get_child_count() >= 10
	for collider in furniture.get_children():
		var center: Vector3 = collider.global_position
		var ray := PhysicsRayQueryParameters3D.create(
			center + Vector3.RIGHT * (collider.shape.size.x / 2 + 0.12),
			center,
			1,
			[player.get_rid()]
		)
		var hit: Dictionary = world.get_world_3d().direct_space_state.intersect_ray(ray)
		solid_furniture = solid_furniture and not hit.is_empty() and hit.collider == furniture
	check(
		solid_furniture,
		"actual desks bed shelves and furniture retain their authored solid profiles"
	)
	var ceiling_ray := PhysicsRayQueryParameters3D.create(
		Vector3(20, 2.6, 34), Vector3(20, 8, 34), 1, [player.get_rid()]
	)
	var ceiling_hit: Dictionary = world.get_world_3d().direct_space_state.intersect_ray(ceiling_ray)
	check(
		(
			not ceiling_hit.is_empty()
			and ceiling_hit.position.y > 3.1
			and ceiling_hit.position.y < 5.5
		),
		"actual room ceiling bounds the usable interior height"
	)
	var roof_ray := PhysicsRayQueryParameters3D.create(
		Vector3(23, 10, 34), Vector3(23, 3, 34), 1, [player.get_rid()]
	)
	var roof_hit: Dictionary = world.get_world_3d().direct_space_state.intersect_ray(roof_ray)
	check(
		not roof_hit.is_empty() and roof_hit.collider.name == "Roof",
		"layered house roof has the authored solid triangle surface from above"
	)
	check(
		await walk_to(player, Vector3(20, 0.6, 35)), "capsule returns through the internal doorway"
	)
	check(
		await walk_to(player, Vector3(20, 0, 39.5)),
		"capsule exits through the front doorway and descends all three steps"
	)
	var returned := await walk_to(player, Vector3(11.5, 0, 39.5))
	returned = await walk_to(player, Vector3(11.5, 0, 22.5)) and returned
	returned = await walk_to(player, Vector3(20, 0, 22.5)) and returned
	returned = await walk_to(player, Vector3(20, 0, 12)) and returned
	check(returned, "actual walking returns to the original courtyard floor without teleporting")
	var camera := Camera3D.new()
	scene.add_child(camera)
	camera.current = true
	camera.global_position = Vector3(20, 2, 34)
	house.apply_quality("balanced")
	house.refresh_visibility()
	check(
		house.get_node("ResidenceNear").visible and not house.get_node("ResidenceFar").visible,
		"a camera in the residence keeps the furnished near interior"
	)
	camera.global_position = Vector3(20, 20, 180)
	house.refresh_visibility()
	check(
		not house.get_node("ResidenceNear").visible and house.get_node("ResidenceFar").visible,
		"distant view uses the lower cost real shell LOD"
	)
	house.apply_quality("performance")
	camera.global_position = Vector3(20, 2, 34)
	house.refresh_visibility()
	check(
		house.get_node("ResidenceNear").visible,
		"performance quality keeps an enterable interior while inside"
	)
	camera.queue_free()
	player.camera.make_current()
	world.apply_quality("balanced")
	print("RESIDENCE_RESULT: %d checks, %d failures" % [checks, failures])
	await FIXTURE.dispose_scene(self, scene)
	quit(1 if failures else 0)
