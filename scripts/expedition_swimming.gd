extends Node
## Water owns desired velocity only; Player remains the sole collision/move owner.

signal health_changed(value: float)
signal submerged_changed(value: bool)
const OCEAN := preload("res://scripts/expedition_ocean.gd")
const SURFACE_FEET := -0.8
var health := 100.0
var _player: CharacterBody3D
var _world: Node3D
var _stroke := 0.0
var _invulnerable := 0.0
var _warning := ""
var _warning_time := 0.0
var _recovering := false
var _camera: Camera3D
var _prior_environment: Environment
var _underwater_environment: Environment
var _underwater := false


func setup(player: CharacterBody3D, world: Node3D) -> void:
	_player = player
	_world = world
	_player.set("water_motion", self)
	for action in ["jump", "power_descend"]:
		if not InputMap.has_action(action):
			InputMap.add_action(action)


func is_water_position() -> bool:
	if not is_instance_valid(_player) or not is_instance_valid(_world):
		return false
	return OCEAN.is_water(_world.origin_sector, _player.position)


func is_swimming() -> bool:
	if not is_water_position() or _player.position.y > 0.35:
		return false
	var powers: Node = _player.get("powers")
	return not (is_instance_valid(powers) and bool(powers.get("flying")))


func depth() -> float:
	return maxf(0.0, -_player.position.y - 1.2) if is_instance_valid(_player) else 0.0


func status_text() -> String:
	if not is_water_position():
		return ""
	if _recovering:
		return "Sea ward recovering · Rising to the surface"
	if _warning_time > 0:
		return _warning
	if depth() > 1.0:
		return "Depth %.0f m · Spirit breathing · Sea ward %.0f" % [depth(), health]
	return "Azure Sea · DIVE to explore · Spirit breathing"


func warn(message: String, duration: float = 1.4) -> void:
	_warning = message
	_warning_time = duration


func receive_bite(amount: float, direction: Vector3) -> void:
	if (
		not can_process()
		or not is_swimming()
		or not _player.is_physics_processing()
		or _invulnerable > 0
	):
		return
	health = maxf(0.0, health - maxf(0.0, amount))
	_invulnerable = 1.6
	_player.velocity += direction.normalized() * 4.0
	health_changed.emit(health)
	warn("Tide wyrm strike · Sea ward %.0f" % health, 2.0)
	if health <= 0:
		_recovering = true


func swim_velocity(input: Vector2, running: bool, delta: float) -> Vector3:
	var direction := Vector3(input.x, 0, input.y).rotated(Vector3.UP, float(_player.get("yaw")))
	var speed := 6.0 if running else 3.5
	var result := _player.velocity
	result.x = move_toward(result.x, direction.x * speed, 7.0 * delta)
	result.z = move_toward(result.z, direction.z * speed, 7.0 * delta)
	var vertical := 0.0
	if Input.is_action_pressed("jump"):
		vertical += 3.2
	if Input.is_action_pressed("power_descend"):
		vertical -= 3.2
	if _recovering:
		vertical = 4.0
	elif is_zero_approx(vertical) and _player.position.y > -1.8:
		vertical = clampf((SURFACE_FEET - _player.position.y) * 3.0, -1.8, 2.0)
	# Rise stops below the waterline; no repeated jumping out of the surface.
	if vertical > 0:
		vertical = minf(vertical, maxf(0.0, -0.6 - _player.position.y) / maxf(delta, 0.001))
	result.y = move_toward(result.y, vertical, 10.0 * delta)
	_stroke = fposmod(_stroke + delta * (3.2 if input.length() > 0.1 else 1.4), TAU)
	_player.set_meta("water_swimming", true)
	_player.set_meta("swim_depth", depth())
	_player.set_meta("swim_stroke_phase", _stroke)
	return result


func _process(delta: float) -> void:
	_invulnerable = maxf(0.0, _invulnerable - delta)
	_warning_time = maxf(0.0, _warning_time - delta)
	if not is_instance_valid(_player):
		return
	_player.set_meta("water_swimming", is_swimming())
	if _recovering and (not is_water_position() or _player.position.y >= -0.9):
		_recovering = false
		health = 100.0
		_invulnerable = 3.0
		health_changed.emit(health)
	var camera := get_viewport().get_camera_3d()
	var submerged := camera != null and is_water_position() and camera.global_position.y < -0.2
	if camera != _camera or submerged != _underwater:
		_restore_camera()
		_camera = camera
		if submerged:
			_enter_underwater()


func _enter_underwater() -> void:
	_prior_environment = _camera.environment
	var source := _prior_environment
	if source == null:
		source = _camera.get_world_3d().environment
	_underwater_environment = (
		source.duplicate() as Environment if source != null else Environment.new()
	)
	_underwater_environment.fog_enabled = true
	_underwater_environment.fog_light_color = Color("225b65")
	_underwater_environment.fog_density = 0.045
	_underwater_environment.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	_underwater_environment.ambient_light_color = Color("559a9d")
	_underwater_environment.ambient_light_energy = 0.55
	_camera.environment = _underwater_environment
	_underwater = true
	submerged_changed.emit(true)


func _restore_camera() -> void:
	var was_underwater := _underwater
	if (
		_underwater
		and is_instance_valid(_camera)
		and _camera.environment == _underwater_environment
	):
		_camera.environment = _prior_environment
	_underwater = false
	_underwater_environment = null
	_prior_environment = null
	if was_underwater:
		submerged_changed.emit(false)


func _exit_tree() -> void:
	_restore_camera()
	if is_instance_valid(_player) and _player.get("water_motion") == self:
		_player.set("water_motion", null)
		_player.set_meta("water_swimming", false)
