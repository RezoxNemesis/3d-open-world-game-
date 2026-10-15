extends Node3D
## Optional Cedar Sentinel encounter and collision-driven wind cart.

signal notice(text: String)
signal guardian_defeated(sector: Vector2i)

const CREATURE_FX := preload("res://scripts/expedition_guardian_fx.gd")
const ART := preload("res://scripts/expedition_guardian_art.gd")
const GUARDIAN_HOME := Vector3(18, 0, 6)
const VEHICLE_HOME := Vector3(8, 0.1, 12)
const TELEGRAPH_TIME := 1.35
const ATTACK_RADIUS := 2.8
const STRIKE_IMPACT_TIME := 0.12
const STRIKE_DURATION := 0.36
const MELEE_RANGE := 4.4
const SHOCK_HALF_WIDTH := 1.65
const SHOCK_REACH := 13.5
const BREATH_REACH := 8.0
const BREATH_SLOPE := 0.45
const ATTACK_NEAR := 2.0
var player: CharacterBody3D
var world: Node3D
var guardian: StaticBody3D
var guardian_model: Node3D
var vehicle: CharacterBody3D
var vehicle_model: Node3D
var warning_ring: MeshInstance3D
var pulse_ring: MeshInstance3D
var guardian_head: Node3D
var guardian_forelegs: Array[Node3D] = []
var guardian_sector := Vector2i.ZERO
var strike_resolved := false
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
var fx: Node3D
var attack_pattern := "stomp"
var last_pattern := ""
var personality := "calm"
var attack_origin := Vector3.ZERO
var attack_direction := Vector3.FORWARD
var windup_duration := TELEGRAPH_TIME
var active_duration := STRIKE_DURATION
var recovery_duration := 1.15
var previous_attack_time := 0.0
var hit_reaction_time := 0.0
var foreleg_rest: Array[Vector3] = []
var head_rest := Vector3.ZERO
var region_active := true


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
	var torso := BoxShape3D.new()
	torso.size = Vector3(2.3, 2.3, 3.2)
	_add_shape(guardian, torso, Vector3(0, 1.85, -0.15))
	var skull := BoxShape3D.new()
	skull.size = Vector3(1.6, 1.5, 2.0)
	_add_shape(guardian, skull, Vector3(0, 3.5, 2.3))
	guardian_model = Node3D.new()
	guardian.add_child(guardian_model)
	var rig: Dictionary = ART.new().guardian(guardian_model)
	guardian_head = rig.head
	head_rest = guardian_head.position
	guardian_forelegs.assign(rig.forelegs)
	for limb in guardian_forelegs:
		foreleg_rest.append(limb.position)
	guardian_sector = _current_sector()
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
	pulse_ring = MeshInstance3D.new()
	pulse_ring.name = "GroundPulse"
	pulse_ring.mesh = ring
	pulse_ring.material_override = material.duplicate()
	pulse_ring.visible = false
	add_child(pulse_ring)
	fx = CREATURE_FX.new()
	add_child(fx)
	fx.setup(SHOCK_HALF_WIDTH, SHOCK_REACH, ATTACK_NEAR, BREATH_REACH, BREATH_SLOPE)
	if world.has_signal("rebased"):
		world.connect("rebased", _on_rebased)


func _add_shape(body: CollisionObject3D, shape: Shape3D, at: Vector3) -> void:
	var collider := CollisionShape3D.new()
	collider.shape = shape
	collider.position = at
	body.add_child(collider)


func _physics_process(delta: float) -> void:
	if not is_instance_valid(player) or not region_active:
		return
	animation_time += delta
	invulnerability = maxf(0.0, invulnerability - delta)
	dodge_cooldown = maxf(0.0, dodge_cooldown - delta)
	melee_cooldown = maxf(0.0, melee_cooldown - delta)
	action_time = maxf(0.0, action_time - delta)
	hit_reaction_time = maxf(0.0, hit_reaction_time - delta)
	if action_time == 0.0 and not mounted:
		player.set_meta("traveler_action", "idle")
	_update_vehicle(delta)
	_update_personality()
	_update_guardian_pose()
	if state == "defeated" or state == "player_defeated":
		return
	state_time += delta
	match state:
		"idle":
			if player.global_position.distance_to(guardian.global_position) < SHOCK_REACH:
				_begin_telegraph()
		"telegraph":
			if state_time >= windup_duration:
				state = "attack"
				state_time = 0.0
				previous_attack_time = 0.0
		"attack":
			if state_time >= STRIKE_IMPACT_TIME and not strike_resolved:
				_resolve_strike()
			previous_attack_time = state_time
			if state == "attack" and state_time >= active_duration:
				state = "recover"
				state_time = 0.0
				warning_ring.visible = false
				pulse_ring.visible = false
				fx.clear()
		"recover":
			if state_time >= recovery_duration:
				state = "idle"
				state_time = 0.0


func _begin_telegraph() -> void:
	state = "telegraph"
	state_time = 0.0
	strike_resolved = false
	attack_pattern = _select_pattern()
	last_pattern = attack_pattern
	windup_duration = (
		1.65
		if attack_pattern == "breath"
		else 1.6 if attack_pattern == "shockwave" else TELEGRAPH_TIME
	)
	active_duration = (
		0.95
		if attack_pattern == "breath"
		else 1.25 if attack_pattern == "shockwave" else STRIKE_DURATION
	)
	recovery_duration = (
		1.45 if attack_pattern == "breath" else 1.25 if attack_pattern == "shockwave" else 1.15
	)
	attack_origin = guardian.global_position
	attack_direction = player.global_position - attack_origin
	attack_direction.y = 0
	attack_direction = (
		attack_direction.normalized() if attack_direction.length_squared() > 0.01 else Vector3.BACK
	)
	guardian.rotation.y = atan2(attack_direction.x, attack_direction.z)
	attack_target = player.global_position
	attack_target.y = _ground_at(attack_target)
	warning_ring.global_position = attack_target + Vector3.UP * 0.1
	warning_ring.visible = attack_pattern == "stomp"
	warning_ring.scale = Vector3.ONE
	pulse_ring.global_position = attack_target + Vector3.UP * 0.14
	pulse_ring.visible = attack_pattern == "stomp"
	pulse_ring.scale = Vector3.ONE
	fx.aim(attack_origin, attack_direction)
	fx.present(attack_pattern, state, -1.0, ATTACK_NEAR)
	if attack_pattern == "shockwave":
		notice.emit("JADE WAVE — step out of the amber lane before the crest arrives.")
	elif attack_pattern == "breath":
		notice.emit("CEDAR BREATH — leave the marked wedge; the Sentinel cannot turn.")
	else:
		notice.emit("STONE STOMP — leave the amber circle or DODGE the impact.")


func _resolve_strike() -> void:
	var inside := _inside_attack_zone(player.global_position)
	if attack_pattern == "stomp":
		strike_resolved = true
	if not inside or not _clear_attack_line():
		return
	# A successful dodge consumes this one attack contact, including sustained breath.
	strike_resolved = true
	if invulnerability > 0:
		return
	var damage := 30 if attack_pattern == "breath" else 28 if attack_pattern == "shockwave" else 25
	player_health = maxi(0, player_health - damage)
	invulnerability = 0.65
	notice.emit("%s! Traveler health %d / 100" % [attack_pattern.capitalize(), player_health])
	if player_health == 0:
		state = "player_defeated"
		warning_ring.visible = false
		pulse_ring.visible = false
		fx.clear()
		vehicle.velocity = Vector3.ZERO
		player.set_physics_process(false)
		player.velocity = Vector3.ZERO
		notice.emit("You fell. RETRY restores you at the road; the world stays open.")


func _inside_attack_zone(point: Vector3) -> bool:
	if attack_pattern == "stomp":
		var difference := point - attack_target
		return (
			Vector2(difference.x, difference.z).length() < ATTACK_RADIUS + 0.35
			and absf(difference.y) < 2.3
		)
	var difference := point - attack_origin
	var depth := difference.dot(attack_direction)
	var side := absf(difference.dot(attack_direction.cross(Vector3.UP)))
	if attack_pattern == "shockwave":
		var before := lerpf(ATTACK_NEAR, SHOCK_REACH, _wave_progress(previous_attack_time))
		var after := lerpf(ATTACK_NEAR, SHOCK_REACH, _wave_progress(state_time))
		return (
			depth >= before - 0.7
			and depth <= after + 0.7
			and side < SHOCK_HALF_WIDTH + 0.35
			and absf(difference.y) < 1.05
		)
	return (
		depth >= ATTACK_NEAR - 0.35
		and depth <= _breath_depth() + 0.35
		and side <= maxf(depth, ATTACK_NEAR) * BREATH_SLOPE + 0.35
		and absf(difference.y) < 2.3
	)


func _clear_attack_line() -> bool:
	# Keep this independent of the disabled rider collision mask.
	var mask := stored_collision_mask if mounted else player.collision_mask
	var excluded: Array[RID] = [guardian.get_rid(), player.get_rid()]
	if mounted:
		excluded.append(vehicle.get_rid())
	var ray := PhysicsRayQueryParameters3D.create(
		attack_origin + Vector3.UP, player.global_position + Vector3.UP, mask, excluded
	)
	return get_world_3d().direct_space_state.intersect_ray(ray).is_empty()


func _wave_progress(time: float) -> float:
	return clampf((time - STRIKE_IMPACT_TIME) / (1.25 - STRIKE_IMPACT_TIME), 0, 1)


func _breath_depth() -> float:
	return lerpf(ATTACK_NEAR, BREATH_REACH, clampf((state_time - STRIKE_IMPACT_TIME) / 0.3, 0, 1))


func _select_pattern() -> String:
	var distance := player.global_position.distance_to(guardian.global_position)
	if distance > BREATH_REACH:
		return "shockwave"
	if last_pattern == "stomp" or (last_pattern == "shockwave" and distance > 4.5):
		return "breath"
	if distance > 6.0 or (personality == "furious" and last_pattern == "breath" and distance > 4.5):
		return "shockwave"
	return "stomp"


func _update_personality() -> void:
	if (
		state == "defeated"
		or player.global_position.distance_to(guardian.global_position) >= SHOCK_REACH
	):
		personality = "calm"
	else:
		personality = "furious" if guardian_health <= 48 else "alert"


func attack() -> bool:
	if (
		not region_active
		or mounted
		or player_health <= 0
		or guardian_health <= 0
		or melee_cooldown > 0
	):
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
	hit_reaction_time = 0.24
	guardian_health = maxi(0, guardian_health - 24)
	if guardian_health == 0:
		state = "defeated"
		warning_ring.visible = false
		pulse_ring.visible = false
		fx.clear()
		personality = "calm"
		notice.emit("Cedar Sentinel calmed. Explore freely, or RETRY the encounter.")
		guardian_defeated.emit(guardian_sector)
	else:
		notice.emit("Strike! Sentinel %d / 120" % guardian_health)
	return true


func dodge() -> bool:
	if not region_active or mounted or player_health <= 0 or dodge_cooldown > 0:
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
	if player_health <= 0:
		vehicle.velocity = Vector3.ZERO
		return
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
	if not region_active or player_health <= 0:
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
	if is_instance_valid(vehicle):
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
	pulse_ring.visible = false
	strike_resolved = false
	last_pattern = ""
	attack_pattern = "stomp"
	personality = "calm"
	hit_reaction_time = 0
	fx.clear()
	guardian.rotation.y = 0
	action_time = 0
	guardian_model.rotation = Vector3.ZERO
	_update_guardian_pose()
	player.global_position = spawn_point
	notice.emit("Restored at the road. Approach the Sentinel whenever you choose.")


func reset_for_destination(pacified: bool = false) -> void:
	_release_player()
	guardian_sector = _current_sector()
	guardian_home = _destination_anchor(GUARDIAN_HOME)
	vehicle_home = _destination_anchor(VEHICLE_HOME)
	guardian.global_position = guardian_home
	vehicle.global_position = vehicle_home
	spawn_point = _destination_anchor(Vector3(0, 2, 12))
	guardian_home.y = _ground_at(guardian_home)
	guardian.global_position = guardian_home
	vehicle.global_position.y = _ground_at(vehicle_home) + 0.1
	player_health = 100
	guardian_health = 0 if pacified else 120
	state = "defeated" if pacified else "idle"
	state_time = 0
	invulnerability = 1
	dodge_cooldown = 0
	melee_cooldown = 0
	warning_ring.visible = false
	pulse_ring.visible = false
	strike_resolved = false
	last_pattern = ""
	attack_pattern = "stomp"
	personality = "calm"
	hit_reaction_time = 0
	fx.clear()
	guardian.rotation.y = 0
	action_time = 0
	guardian_model.rotation = Vector3.ZERO
	_update_guardian_pose()


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
	pulse_ring.global_position -= offset
	attack_target -= offset
	attack_origin -= offset
	fx.global_position -= offset
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


func _current_sector() -> Vector2i:
	return world.get("origin_sector") if world.has_method("ground_height") else Vector2i.ZERO


func _update_guardian_pose() -> void:
	var lift := 0.0
	var stomp := 0.0
	var pulse_material: StandardMaterial3D = pulse_ring.material_override
	pulse_material.albedo_color = Color("fff0b3") if state == "attack" else Color("ffb55e")
	if state == "telegraph":
		lift = smoothstep(0.0, 0.85, state_time / windup_duration)
		pulse_ring.scale = Vector3.ONE * maxf(0.12, 1.0 - state_time / windup_duration)
	elif state == "attack":
		lift = 1.0 - smoothstep(0.0, STRIKE_IMPACT_TIME, state_time)
		stomp = sin(clampf((state_time - STRIKE_IMPACT_TIME) / 0.24, 0, 1) * PI)
		pulse_ring.scale = (
			Vector3.ONE * lerpf(0.12, 1.0, clampf(state_time / STRIKE_DURATION, 0, 1))
		)
	elif state == "recover":
		stomp = 0.15 * (1.0 - smoothstep(0.0, 0.5, state_time))
	var calm := personality == "calm"
	var fierce := personality == "furious"
	var recoil := sin(hit_reaction_time / 0.24 * PI) * 0.09
	guardian_model.position = Vector3(
		0, sin(animation_time * (2.8 if fierce else 1.8)) * 0.035 - stomp * 0.12, -recoil
	)
	guardian_model.rotation.x = -lift * 0.1 + stomp * 0.035
	guardian_head.rotation.x = -lift * 0.3 + stomp * 0.1 + (0.16 if calm else 0.0) + recoil
	guardian_head.rotation.y = sin(animation_time * 0.65) * (0.08 if calm else 0.025)
	guardian_head.rotation.z = 0
	for index in range(guardian_forelegs.size()):
		var limb := guardian_forelegs[index]
		limb.rotation.x = -lift * 1.05 + stomp * 0.12
		limb.position = foreleg_rest[index] + Vector3.UP * lift * 0.1
	if attack_pattern == "shockwave" and state in ["telegraph", "attack"]:
		# One raised forepaw sweeps the jade crest down the locked lane.
		guardian_forelegs[1].rotation.x *= 0.2
		guardian_head.rotation.z = -lift * 0.16
	elif attack_pattern == "breath" and state in ["telegraph", "attack"]:
		guardian_head.rotation.x = -lift * 0.45 if state == "telegraph" else 0.18
		guardian_head.position.z = head_rest.z + (0.12 if state == "attack" else -lift * 0.08)
		for limb in guardian_forelegs:
			limb.rotation.x = lift * 0.12
		guardian_model.rotation.x = lift * 0.04 if state == "telegraph" else -0.035
	else:
		guardian_head.position.z = head_rest.z
	if state == "recover":
		guardian_head.rotation.x += sin(clampf(state_time / recovery_duration, 0, 1) * PI) * 0.18
	fx.present(
		attack_pattern,
		state,
		_wave_progress(state_time) if state_time >= STRIKE_IMPACT_TIME else -1.0,
		_breath_depth()
	)


func _exit_tree() -> void:
	if (
		is_instance_valid(world)
		and world.has_signal("rebased")
		and world.is_connected("rebased", _on_rebased)
	):
		world.disconnect("rebased", _on_rebased)
	if is_instance_valid(player):
		if mounted:
			_release_player()
		if is_instance_valid(player.spring_arm) and is_instance_valid(vehicle):
			player.spring_arm.remove_excluded_object(vehicle.get_rid())


func set_region_active(active: bool) -> void:
	if not active and mounted:
		_release_player()
	region_active = active
	guardian.visible = active
	vehicle.visible = active
	fx.visible = active
	guardian.collision_layer = 1 if active else 0
	guardian.collision_mask = 1 if active else 0
	vehicle.collision_layer = 1 if active else 0
	vehicle.collision_mask = 1 if active else 0
	vehicle.velocity = Vector3.ZERO
	warning_ring.visible = false
	pulse_ring.visible = false
	fx.clear()
	if state not in ["defeated", "player_defeated"]:
		state = "idle"
	state_time = 0
	strike_resolved = false
	personality = "calm"
