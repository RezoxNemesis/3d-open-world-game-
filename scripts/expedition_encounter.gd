extends Node3D
## Optional Cedar Sentinel encounter and collision-driven wind cart.

signal notice(text: String)

const ART := preload("res://scripts/expedition_guardian_art.gd")
const GUARDIAN_HOME := Vector3(18, 0, 6)
const VEHICLE_HOME := Vector3(8, 0.1, 12)
const TELEGRAPH_TIME := 1.35
const ATTACK_RADIUS := 2.8
const MELEE_RANGE := 4.4
var player: CharacterBody3D
var world: Node3D
var guardian: StaticBody3D
var guardian_model: Node3D
var vehicle: CharacterBody3D
var vehicle_model: Node3D
var warning_ring: MeshInstance3D
var state := "idle"
var state_time := 0.0
var guardian_health := 120
var player_health := 100
var mounted := false
var invulnerability := 0.0
var dodge_cooldown := 0.0
var melee_cooldown := 0.0
var action_time := 0.0
var attack_target := Vector3.ZERO
var spawn_point := Vector3(0, 2, 12)
var guardian_home := GUARDIAN_HOME
var vehicle_home := VEHICLE_HOME
var stored_collision_layer := 1
var stored_collision_mask := 1
var animation_time := 0.0


func setup(traveler: CharacterBody3D, terrain: Node3D) -> void:
	player = traveler
	world = terrain
	guardian = StaticBody3D.new()
	guardian.name = "CedarSentinel"
	add_child(guardian)
	guardian.position = guardian_home
	var capsule := CapsuleShape3D.new()
	capsule.radius = 1.25
	capsule.height = 3.4
	_add_shape(guardian, capsule, Vector3(0, 1.7, 0))
	guardian_model = Node3D.new()
	guardian.add_child(guardian_model)
	ART.new().guardian(guardian_model)
	vehicle = CharacterBody3D.new()
	vehicle.name = "WindCart"
	vehicle.floor_snap_length = 0.4
	add_child(vehicle)
	vehicle.position = vehicle_home
	if is_instance_valid(player.spring_arm):
		player.spring_arm.add_excluded_object(vehicle.get_rid())
	var hull := CylinderShape3D.new()
	hull.radius = 2.2
	# Include the mast and rider: passing a low roof must not clip their visuals.
	hull.height = 3.9
	_add_shape(vehicle, hull, Vector3(0, 1.95, 0))
	vehicle_model = Node3D.new()
	vehicle.add_child(vehicle_model)
	ART.new().vehicle(vehicle_model)
	warning_ring = MeshInstance3D.new()
	var ring := TorusMesh.new()
	ring.inner_radius = ATTACK_RADIUS - 0.12
	ring.outer_radius = ATTACK_RADIUS
	ring.rings = 40
	ring.ring_segments = 6
	warning_ring.mesh = ring
	var material := StandardMaterial3D.new()
	material.albedo_color = Color("ff983c")
	material.emission_enabled = true
	material.emission = Color("ff6b24")
	material.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	warning_ring.material_override = material
	warning_ring.visible = false
	add_child(warning_ring)
	if world.has_signal("rebased"):
		world.connect("rebased", _on_rebased)


func _add_shape(body: CollisionObject3D, shape: Shape3D, at: Vector3) -> void:
	var collider := CollisionShape3D.new()
	collider.shape = shape
	collider.position = at
	body.add_child(collider)


func _physics_process(delta: float) -> void:
	if not is_instance_valid(player):
		return
	animation_time += delta
	invulnerability = maxf(0.0, invulnerability - delta)
	dodge_cooldown = maxf(0.0, dodge_cooldown - delta)
	melee_cooldown = maxf(0.0, melee_cooldown - delta)
	action_time = maxf(0.0, action_time - delta)
	if action_time == 0.0 and not mounted:
		player.set_meta("traveler_action", "idle")
	_update_vehicle(delta)
	guardian_model.position.y = sin(animation_time * 1.8) * 0.045
	guardian_model.rotation.x = -0.11 if state == "telegraph" else 0.0
	if state == "defeated":
		guardian_model.rotation.z = lerpf(guardian_model.rotation.z, 0.55, delta * 2)
		return
	if state == "player_defeated":
		return
	state_time += delta
	match state:
		"idle":
			if player.global_position.distance_to(guardian.global_position) < 10.0:
				_begin_telegraph()
		"telegraph":
			warning_ring.scale = Vector3.ONE * (1.0 + sin(state_time * 15) * 0.025)
			if state_time >= TELEGRAPH_TIME:
				state = "attack"
				state_time = 0.0
				_resolve_strike()
		"attack":
			if state_time >= 0.22:
				state = "recover"
				state_time = 0.0
				warning_ring.visible = false
		"recover":
			if state_time >= 1.15:
				state = "idle"
				state_time = 0.0


func _begin_telegraph() -> void:
	state = "telegraph"
	state_time = 0.0
	attack_target = player.global_position
	attack_target.y = _ground_at(attack_target)
	warning_ring.global_position = attack_target + Vector3.UP * 0.1
	warning_ring.visible = true
	notice.emit("Sentinel marks the ground — leave the amber circle or DODGE.")


func _resolve_strike() -> void:
	var difference := player.global_position - attack_target
	var within := Vector2(difference.x, difference.z).length() < ATTACK_RADIUS + 0.35
	if within and absf(difference.y) < 2.3 and invulnerability <= 0:
		player_health = maxi(0, player_health - 25)
		invulnerability = 0.65
		notice.emit("Stone pulse! Traveler health %d / 100" % player_health)
		if player_health == 0:
			state = "player_defeated"
			warning_ring.visible = false
			player.set_physics_process(false)
			player.velocity = Vector3.ZERO
			notice.emit("You fell. RETRY restores you at the road; the world stays open.")


func attack() -> bool:
	if mounted or player_health <= 0 or guardian_health <= 0 or melee_cooldown > 0:
		return false
	var offset := guardian.global_position - player.global_position
	if offset.length() > MELEE_RANGE:
		notice.emit("Move closer to the Sentinel to strike.")
		return false
	var facing: Vector3 = -player.model.global_basis.z
	if facing.normalized().dot(offset.normalized()) < 0.3:
		notice.emit("Face the Sentinel to strike.")
		return false
	# Real static geometry blocks melee through structures.
	var ray := PhysicsRayQueryParameters3D.create(
		player.global_position + Vector3.UP,
		guardian.global_position + Vector3.UP,
		player.collision_mask,
		[player.get_rid()]
	)
	var hit := get_world_3d().direct_space_state.intersect_ray(ray)
	if not hit.is_empty() and hit.collider != guardian:
		return false
	melee_cooldown = 0.5
	action_time = 0.3
	player.set_meta("traveler_action", "attack")
	guardian_health = maxi(0, guardian_health - 24)
	if guardian_health == 0:
		state = "defeated"
		warning_ring.visible = false
		notice.emit("Cedar Sentinel calmed. Explore freely, or RETRY the encounter.")
	else:
		notice.emit("Strike! Sentinel %d / 120" % guardian_health)
	return true


func dodge() -> bool:
	if mounted or player_health <= 0 or dodge_cooldown > 0:
		return false
	var direction := Input.get_vector(
		"move_left", "move_right", "move_forward", "move_backward", 0.0
	)
	var motion := Vector3(direction.x, 0, direction.y).rotated(Vector3.UP, player.yaw)
	if motion.length_squared() < 0.01:
		motion = -player.model.global_basis.z
	motion.y = 0
	player.move_and_collide(motion.normalized() * 2.6)
	invulnerability = 0.55
	dodge_cooldown = 1.15
	action_time = 0.4
	player.set_meta("traveler_action", "dodge")
	return true


func _update_vehicle(delta: float) -> void:
	# Park beyond the resident terrain so unloaded ground cannot swallow the cart.
	if not mounted and player.global_position.distance_to(vehicle.global_position) > 80.0:
		vehicle.velocity = Vector3.ZERO
		return
	if mounted and player_health > 0:
		var input := Input.get_vector(
			"move_left", "move_right", "move_forward", "move_backward", 0.0
		)
		var direction := Vector3(input.x, 0, input.y).rotated(Vector3.UP, player.yaw)
		vehicle.velocity.x = move_toward(vehicle.velocity.x, direction.x * 13.0, 16.0 * delta)
		vehicle.velocity.z = move_toward(vehicle.velocity.z, direction.z * 13.0, 16.0 * delta)
		# The conservative hull stays aligned; rotating artwork cannot rotate into walls.
		if direction.length() > 0.1:
			vehicle_model.rotation.y = lerp_angle(
				vehicle_model.rotation.y, atan2(-direction.x, -direction.z), delta * 5
			)
	else:
		vehicle.velocity.x = move_toward(vehicle.velocity.x, 0.0, 30 * delta)
		vehicle.velocity.z = move_toward(vehicle.velocity.z, 0.0, 30 * delta)
	vehicle.velocity.y -= 18.0 * delta
	vehicle.move_and_slide()
	_keep_vehicle_in_domain()
	if vehicle.position.y < _ground_at(vehicle.position) - 8.0:
		vehicle.position.y = _ground_at(vehicle.position) + 0.2
		vehicle.velocity = Vector3.ZERO
		notice.emit("The wind cart has returned to firm ground.")
	if mounted:
		player.global_position = vehicle.global_position + Vector3(0, 0.95, 0)
		player.velocity = Vector3.ZERO
		player.model.rotation.y = vehicle_model.rotation.y
		if player.has_method("update_traveler_motion"):
			player.call("update_traveler_motion", delta, vehicle.velocity, true, false)


func interact_vehicle() -> bool:
	if player_health <= 0:
		return false
	if mounted:
		for side in [
			Vector3(2.8, 0, 0), Vector3(-2.8, 0, 0), Vector3(0, 0, 2.9), Vector3(0, 0, -2.9)
		]:
			var candidate: Vector3 = vehicle.global_position + side
			var safe := _safe_dismount(candidate)
			if not safe.is_empty():
				_release_player()
				player.global_position = safe.position
				notice.emit("On foot. The wind cart waits here.")
				return true
		notice.emit("No safe footing beside the cart. Move to open ground first.")
		return false
	if player.global_position.distance_to(vehicle.global_position) > 4.0:
		notice.emit("Approach the sail cart on the road to mount.")
		return false
	var mount_ray := PhysicsRayQueryParameters3D.create(
		player.global_position + Vector3.UP,
		vehicle.global_position + Vector3.UP,
		player.collision_mask,
		[player.get_rid()]
	)
	var obstruction := get_world_3d().direct_space_state.intersect_ray(mount_ray)
	if not obstruction.is_empty() and obstruction.collider != vehicle:
		notice.emit("Walk around the obstruction to reach the cart.")
		return false
	stored_collision_layer = player.collision_layer
	stored_collision_mask = player.collision_mask
	mounted = true
	player.set_meta("expedition_mounted", true)
	player.set_meta("traveler_action", "mounted")
	player.set_physics_process(false)
	player.collision_layer = 0
	player.collision_mask = 0
	player.velocity = Vector3.ZERO
	notice.emit("Wind cart mounted — steer with the joystick; RIDE dismounts.")
	return true


func _safe_dismount(candidate: Vector3) -> Dictionary:
	var space := get_world_3d().direct_space_state
	var ray := PhysicsRayQueryParameters3D.create(
		candidate + Vector3.UP * 1.5,
		candidate - Vector3.UP * 3.0,
		stored_collision_mask,
		[player.get_rid(), vehicle.get_rid()]
	)
	var floor_hit := space.intersect_ray(ray)
	if floor_hit.is_empty() or floor_hit.normal.dot(Vector3.UP) < 0.75:
		return {}
	var standing: Vector3 = floor_hit.position + Vector3.UP * 0.04
	var capsule := CapsuleShape3D.new()
	capsule.radius = 0.37
	capsule.height = 1.74
	var query := PhysicsShapeQueryParameters3D.new()
	query.shape = capsule
	query.transform.origin = standing + Vector3.UP * 0.87
	query.collision_mask = stored_collision_mask
	query.exclude = [player.get_rid()]
	if not space.intersect_shape(query, 1).is_empty():
		return {}
	return {"position": standing}


func _release_player() -> void:
	if mounted:
		player.collision_layer = stored_collision_layer
		player.collision_mask = stored_collision_mask
	mounted = false
	player.set_meta("expedition_mounted", false)
	player.set_meta("traveler_action", "idle")
	player.set_physics_process(true)
	player.velocity = Vector3.ZERO
	vehicle.velocity = Vector3.ZERO


func restart_encounter() -> void:
	_release_player()
	player_health = 100
	guardian_health = 120
	state = "idle"
	state_time = 0
	invulnerability = 1.0
	dodge_cooldown = 0
	melee_cooldown = 0
	warning_ring.visible = false
	guardian_model.rotation = Vector3.ZERO
	player.global_position = spawn_point
	notice.emit("Restored at the road. Approach the Sentinel whenever you choose.")


func reset_for_destination() -> void:
	_release_player()
	guardian_home = _destination_anchor(GUARDIAN_HOME)
	vehicle_home = _destination_anchor(VEHICLE_HOME)
	guardian.global_position = guardian_home
	vehicle.global_position = vehicle_home
	spawn_point = _destination_anchor(Vector3(0, 2, 12))
	guardian_home.y = _ground_at(guardian_home)
	guardian.global_position = guardian_home
	vehicle.global_position.y = _ground_at(vehicle_home) + 0.1
	player_health = 100
	guardian_health = 120
	state = "idle"
	state_time = 0
	invulnerability = 1
	dodge_cooldown = 0
	melee_cooldown = 0
	warning_ring.visible = false
	guardian_model.rotation = Vector3.ZERO


func _keep_vehicle_in_domain() -> void:
	if not world.has_method("ground_height"):
		return
	var sector: Vector2i = world.get("origin_sector")
	var limit: int = world.get_script().get_script_constant_map().get("MAX_SECTOR", 781250)
	if absi(sector.x) == limit and vehicle.position.x * signi(sector.x) > 0:
		vehicle.position.x = 0
		vehicle.velocity.x = 0
	if absi(sector.y) == limit and vehicle.position.z * signi(sector.y) > 0:
		vehicle.position.z = 0
		vehicle.velocity.z = 0


func _destination_anchor(point: Vector3) -> Vector3:
	if world.has_method("ground_height"):
		var sector: Vector2i = world.get("origin_sector")
		var limit: int = world.get_script().get_script_constant_map().get("MAX_SECTOR", 781250)
		if sector.x == limit:
			point.x = -absf(point.x)
		if sector.y == limit:
			point.z = -absf(point.z)
	return point


func _ground_at(point: Vector3) -> float:
	if world.has_method("ground_height"):
		return world.call("ground_height", world.get("origin_sector"), point)
	return 0.0


func _on_rebased(offset: Vector3) -> void:
	guardian.global_position -= offset
	vehicle.global_position -= offset
	warning_ring.global_position -= offset
	attack_target -= offset
	spawn_point -= offset
	guardian_home -= offset
	vehicle_home -= offset


func status_text() -> String:
	if state == "player_defeated":
		return "Traveler fallen · RETRY to recover"
	if state == "defeated":
		return "Sentinel calmed · Traveler %d / 100" % player_health
	return (
		"Traveler %d / 100 · Sentinel %d / 120 · %s"
		% [player_health, guardian_health, "RIDING" if mounted else state.to_upper()]
	)
