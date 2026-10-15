extends Node
## Powers compose velocity through the existing Player's single swept capsule move.

signal changed
signal notice(message: String)

const MOUNTAINS := preload("res://scripts/destructible_mountains.gd")
const POWER_FX := preload("res://scripts/hero_power_fx.gd")
const MAX_ALTITUDE := 160.0
const FLIGHT_CROUCH := 0.12
const FLIGHT_LIFT := 0.32
const SMASH_WINDUP := 0.22
const LEAP_CHARGE := 1.1
const LEAP_COOLDOWN := 0.8
const SMASH_COOLDOWN := 3.0
var flying := false
var fast := false
var charging := false
var charge_time := 0.0
var leap_cooldown := 0.0
var smash_cooldown := 0.0
var mountains: Node3D
var fx: Node3D
var _player: CharacterBody3D
var _world: Node3D
var _normal_fov := 66.0
var _camera_boost_active := false
var _setup := false
var _flight_launch := 0.0
var _smash_time := 0.0
var _smash_pending := false
var _smash_forward := Vector3.FORWARD
var _leap_airborne := false
var _resolved_velocity := Vector3.ZERO
var _previous_grounded := true
var _fall_speed := 0.0
var _last_position := Vector3.ZERO


func setup(player: CharacterBody3D, world: Node3D, bind_keys := true) -> void:
	if _setup:
		return
	_setup = true
	name = "HeroPowers"
	_player = player
	_world = world
	_player.powers = self
	_normal_fov = player.camera.fov
	var bindings := {
		"power_flight": KEY_F,
		"power_leap": KEY_Q,
		"power_speed": KEY_G,
		"power_smash": KEY_R,
		"power_descend": KEY_C
	}
	for action in bindings:
		if not InputMap.has_action(action):
			InputMap.add_action(action)
		if bind_keys:
			InputMap.action_erase_events(action)
			var key := InputEventKey.new()
			key.physical_keycode = bindings[action]
			InputMap.action_add_event(action, key)
	mountains = MOUNTAINS.new()
	world.add_child(mountains)
	mountains.build(world)
	mountains.changed.connect(func(): changed.emit())
	fx = POWER_FX.new()
	world.add_child(fx)
	fx.setup(world)
	_last_position = player.global_position
	_previous_grounded = player.is_on_floor()
	if world.has_signal("rebased"):
		world.rebased.connect(_on_rebased)
	_reposition_crags()


func toggle_flight() -> void:
	flying = not flying
	cancel_actions()
	_player.velocity = Vector3.ZERO
	if flying and _player.is_on_floor():
		_flight_launch = FLIGHT_CROUCH + FLIGHT_LIFT
	_player.update_camera()
	changed.emit()


func toggle_speed() -> void:
	if not fast and not _camera_boost_active:
		_normal_fov = _player.camera.fov
	fast = not fast
	changed.emit()


func begin_leap() -> void:
	if flying or charging or leap_cooldown > 0.0 or not _player.is_on_floor():
		return
	charging = true
	charge_time = 0.0


func release_leap() -> bool:
	if not charging:
		return false
	var strength := clampf(charge_time / LEAP_CHARGE, 0.0, 1.0)
	charging = false
	charge_time = 0.0
	if flying or leap_cooldown > 0.0 or not _player.is_on_floor():
		return false
	_player.velocity.y = lerpf(18.0, 52.0, strength)
	leap_cooldown = LEAP_COOLDOWN
	_leap_airborne = true
	fx.burst(
		_player.global_position + Vector3.UP * 0.08,
		7.0 + strength * 6.0,
		Color(1.0, 0.83, 0.43, 0.70)
	)
	return true


func cancel_actions() -> void:
	charging = false
	charge_time = 0.0
	_flight_launch = 0.0
	_smash_time = 0.0
	_smash_pending = false
	_leap_airborne = false
	_resolved_velocity = Vector3.ZERO
	_fall_speed = 0.0
	if is_instance_valid(fx):
		fx.clear()
	if is_instance_valid(_player):
		_player.velocity.x = 0.0
		_player.velocity.z = 0.0
		if flying:
			_player.velocity.y = 0.0


func smash() -> bool:
	if smash_cooldown > 0.0 or not is_instance_valid(mountains):
		return false
	var forward := Vector3.FORWARD.rotated(Vector3.UP, _player.yaw)
	var reachable := false
	for target: Node3D in mountains.targets.values():
		var offset := target.global_position - _player.global_position
		reachable = (
			reachable or (offset.length() <= 30.0 and offset.normalized().dot(forward) > 0.0)
		)
	if not reachable:
		notice.emit("Face a marked mountain crag within 30 m")
		return false
	_smash_forward = forward
	_smash_pending = true
	_smash_time = SMASH_WINDUP + 0.38
	smash_cooldown = SMASH_COOLDOWN
	notice.emit("Gathering force")
	return true


func _impact_smash() -> void:
	_smash_pending = false
	var point := _player.global_position + Vector3.UP * 0.12 + _smash_forward * 0.8
	fx.burst(point, 14.0, Color(1.0, 0.75, 0.32, 0.85), 0.60)
	if mountains.strike(_player.global_position, _smash_forward, 30.0, 15.0):
		notice.emit("Mountain crag shattered")
	else:
		notice.emit("Strike missed — face the marked crag")


func advance(delta: float) -> void:
	leap_cooldown = maxf(0.0, leap_cooldown - delta)
	smash_cooldown = maxf(0.0, smash_cooldown - delta)
	_flight_launch = maxf(0.0, _flight_launch - delta)
	_smash_time = maxf(0.0, _smash_time - delta)
	if _smash_pending and _smash_time <= 0.38:
		_impact_smash()
	if Input.is_action_just_pressed("power_flight"):
		toggle_flight()
	if Input.is_action_just_pressed("power_speed"):
		toggle_speed()
	if Input.is_action_just_pressed("power_smash"):
		smash()
	if Input.is_action_just_pressed("power_leap"):
		begin_leap()
	if charging:
		charge_time = minf(LEAP_CHARGE, charge_time + delta)
	if Input.is_action_just_released("power_leap"):
		release_leap()


func flight_velocity(input: Vector2, running: bool, delta: float) -> Vector3:
	var direction := Vector3(input.x, 0, input.y).rotated(Vector3.RIGHT, _player.pitch)
	direction = direction.rotated(Vector3.UP, _player.yaw)
	var result := direction * (90.0 if running else 36.0)
	if Input.is_action_pressed("jump"):
		result.y += 20.0
	if Input.is_action_pressed("power_descend"):
		_flight_launch = 0.0
		result.y -= 20.0
	elif _flight_launch > FLIGHT_LIFT:
		return Vector3.ZERO
	elif _flight_launch > 0.0:
		result.y = maxf(result.y, 26.0)
	if _player.is_on_floor() and result.y < 0.0:
		result.y = 0.0
	result.y = minf(result.y, maxf(0.0, MAX_ALTITUDE - _player.global_position.y) / delta)
	return result


func prepare_streaming(delta: float) -> void:
	var regions := _world.get_node_or_null("Regions")
	if regions == null:
		return
	if flying or fast:
		regions.prepare_motion(_player.global_position, _player.velocity, maxf(delta * 2.0, 0.12))
	else:
		regions.clear_motion_prediction()


func update_camera(delta: float) -> void:
	var moving_fast := (
		fast and not flying and Vector2(_resolved_velocity.x, _resolved_velocity.z).length() > 12
	)
	if moving_fast:
		_camera_boost_active = true
	elif not _camera_boost_active:
		_normal_fov = _player.camera.fov
	var boost := clampf((_resolved_velocity.length() - 12.0) / 50.0, 0.0, 1.0)
	var target := maxf(_normal_fov, lerpf(_normal_fov, 88.0, boost)) if moving_fast else _normal_fov
	_player.camera.fov = lerpf(_player.camera.fov, target, 1.0 - exp(-6.0 * delta))
	if not moving_fast and absf(_player.camera.fov - _normal_fov) < 0.05:
		_player.camera.fov = _normal_fov
		_camera_boost_active = false


func after_move(delta: float, actual_velocity: Vector3) -> void:
	# Teleports clear old trails; origin rebases explicitly move their short-lived samples.
	if (
		_player.global_position.distance_to(_last_position)
		> maxf(8.0, actual_velocity.length() * delta * 2.0)
	):
		fx.clear()
	_last_position = _player.global_position
	_resolved_velocity = actual_velocity
	var grounded := _player.is_on_floor()
	if grounded and not _previous_grounded and not flying:
		if _fall_speed > 8.0 or _leap_airborne:
			fx.burst(
				_player.global_position + Vector3.UP * 0.07,
				clampf(_fall_speed * 0.65, 4.0, 20.0),
				Color(0.93, 0.83, 0.62, 0.60)
			)
		_leap_airborne = false
	_fall_speed = maxf(0.0, -actual_velocity.y) if not grounded else 0.0
	_previous_grounded = grounded
	fx.advance(delta, _player, actual_velocity, motion_state())


func motion_state() -> Dictionary:
	var action := ""
	var strength := 0.0
	if charging:
		action = "leap_charge"
		strength = clampf(charge_time / LEAP_CHARGE, 0, 1)
	elif _smash_time > 0.0:
		action = "smash_windup" if _smash_pending else "smash_impact"
		strength = clampf(_smash_time / 0.38, 0.0, 1.0)
	elif _flight_launch > FLIGHT_LIFT:
		action = "flight_crouch"
		strength = 1.0
	elif _flight_launch > 0.0:
		action = "flight_launch"
		strength = 1.0
	elif flying:
		action = "flight"
		strength = clampf(_resolved_velocity.length() / 90.0, 0, 1)
	elif _leap_airborne:
		action = "leap"
		strength = clampf(absf(_resolved_velocity.y) / 52.0, 0, 1)
	elif fast:
		action = "speed"
		strength = clampf(Vector2(_resolved_velocity.x, _resolved_velocity.z).length() / 72.0, 0, 1)
	return {"action": action, "strength": strength}


func relocate_for_world(reset_destroyed := true) -> void:
	cancel_actions()
	mountains.position = Vector3.ZERO
	if reset_destroyed:
		mountains.restore_destroyed([])
	_reposition_crags()
	_last_position = _player.global_position
	_previous_grounded = _player.is_on_floor()


func _reposition_crags() -> void:
	if _world.has_method("ground_height"):
		for target: Node3D in mountains.targets.values():
			target.position.y = (
				_world.ground_height(_world.origin_sector, target.position + mountains.position)
				- 0.3
			)


func _on_rebased(offset: Vector3) -> void:
	mountains.position -= offset
	_last_position -= offset


func snapshot() -> Dictionary:
	return {"flying": flying, "fast": fast, "destroyed": mountains.destroyed_ids()}


func restore_state(state: Dictionary) -> void:
	flying = state.get("flying", false) == true
	fast = state.get("fast", false) == true
	cancel_actions()
	_player.velocity = Vector3.ZERO
	leap_cooldown = 0.0
	smash_cooldown = 0.0
	mountains.restore_destroyed(state.get("destroyed", []))
	_reposition_crags()
	_player.update_camera()
	changed.emit()


func is_checkpoint_safe() -> bool:
	return flying or (is_instance_valid(_player) and _player.is_on_floor())


func status() -> String:
	if charging:
		return "LEAP CHARGE %d%%" % roundi(charge_time / LEAP_CHARGE * 100)
	if flying:
		return "FLY · JUMP rises / DOWN lowers · RUN boosts"
	if smash_cooldown > 0.0:
		return "SMASH ready in %.1f s · FLY / LEAP / SPEED available" % smash_cooldown
	if fast:
		return "SPEED · Hold RUN to boost"
	return "FLY · Hold LEAP · SPEED · SMASH marked crags"
