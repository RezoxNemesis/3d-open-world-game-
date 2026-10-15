extends Node
## Powers compose velocity through the existing Player's single swept capsule move.

signal changed
signal notice(message: String)

const MOUNTAINS := preload("res://scripts/destructible_mountains.gd")
const MAX_ALTITUDE := 160.0
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
var _player: CharacterBody3D
var _world: Node3D
var _normal_fov := 66.0
var _camera_boost_active := false
var _setup := false


func setup(player: CharacterBody3D, world: Node3D) -> void:
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
			var key := InputEventKey.new()
			key.physical_keycode = bindings[action]
			InputMap.action_add_event(action, key)
	mountains = MOUNTAINS.new()
	world.add_child(mountains)
	mountains.build(world)
	mountains.changed.connect(func(): changed.emit())


func toggle_flight() -> void:
	flying = not flying
	cancel_actions()
	_player.velocity = Vector3.ZERO
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
	return true


func cancel_actions() -> void:
	charging = false
	charge_time = 0.0
	if is_instance_valid(_player):
		_player.velocity.x = 0.0
		_player.velocity.z = 0.0
		if flying:
			_player.velocity.y = 0.0


func smash() -> bool:
	if smash_cooldown > 0.0 or not is_instance_valid(mountains):
		return false
	var forward := Vector3.FORWARD.rotated(Vector3.UP, _player.yaw)
	if not mountains.strike(_player.global_position, forward, 30.0, 15.0):
		notice.emit("Face a marked mountain crag within 30 m")
		return false
	smash_cooldown = SMASH_COOLDOWN
	notice.emit("Mountain crag shattered")
	return true


func advance(delta: float) -> void:
	leap_cooldown = maxf(0.0, leap_cooldown - delta)
	smash_cooldown = maxf(0.0, smash_cooldown - delta)
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
		result.y -= 20.0
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
		fast and not flying and Vector2(_player.velocity.x, _player.velocity.z).length() > 12
	)
	if moving_fast:
		_camera_boost_active = true
	elif not _camera_boost_active:
		_normal_fov = _player.camera.fov
	var target := 88.0 if moving_fast else _normal_fov
	_player.camera.fov = lerpf(_player.camera.fov, target, 1.0 - exp(-6.0 * delta))
	if not moving_fast and absf(_player.camera.fov - _normal_fov) < 0.05:
		_player.camera.fov = _normal_fov
		_camera_boost_active = false


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
