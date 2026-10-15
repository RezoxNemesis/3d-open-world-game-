extends Node
## Debounced mobile milestones retain the last physics-confirmed safe position.

const DEBOUNCE_SECONDS := 0.6
const RETRY_SECONDS := 1.0
var scene: Node3D
var path := "user://save.json"
var enabled := false
var dirty := false
var last_safe_position := Vector3.ZERO
var last_grounded_position := Vector3.ZERO
var _player: CharacterBody3D
var _has_safe_position := false
var _has_grounded_position := false
var _restoring := false
var _started := false
var _remaining := 0.0


func setup(owner_scene: Node3D, journey_path: String, active: bool) -> void:
	scene = owner_scene
	path = journey_path
	enabled = active
	_player = scene.get_node("Player") as CharacterBody3D
	name = "JourneyCheckpoint"
	set_process(enabled)
	set_physics_process(enabled)


func start() -> void:
	if _started or not enabled:
		return
	_started = true
	if FileAccess.file_exists(path):
		begin_restore()
		var restored: bool = scene.load_game(path, true)
		finish_restore(restored)


func begin_restore() -> void:
	_restoring = true
	dirty = false
	_remaining = 0.0


func finish_restore(restored: bool) -> void:
	_restoring = false
	dirty = false
	_remaining = 0.0
	if restored:
		_has_safe_position = false
		_has_grounded_position = false


func request_save() -> void:
	if not enabled or not _started or _restoring:
		return
	dirty = true
	_remaining = DEBOUNCE_SECONDS


func flush() -> bool:
	if not enabled or not _started or _restoring:
		return false
	if not dirty:
		return true
	# Position must remain compatible with the power mode serialized now. Flight
	# may have been switched off since the latest airborne sample was collected.
	var flying := _is_flying()
	var has_position := _has_safe_position if flying else _has_grounded_position
	var point := last_safe_position if flying else last_grounded_position
	if has_position and scene.write_journey(point, path):
		dirty = false
		_remaining = 0.0
		return true
	# A failed atomic write preserves the previous file and retries at most once/s.
	_remaining = RETRY_SECONDS
	return false


func _physics_process(_delta: float) -> void:
	if not _started or _restoring or not is_instance_valid(_player):
		return
	if not _player.is_physics_processing():
		return
	if _player.is_on_floor() and not _is_flying():
		last_grounded_position = _player.position
		_has_grounded_position = true
	var safe: bool = (
		_player.is_checkpoint_safe()
		if _player.has_method("is_checkpoint_safe")
		else _player.is_on_floor()
	)
	if safe:
		last_safe_position = _player.position
		_has_safe_position = true


func _is_flying() -> bool:
	var powers := _player.get("powers") as Node
	return is_instance_valid(powers) and powers.get("flying") == true


func _process(delta: float) -> void:
	if not dirty or _restoring or not _started:
		return
	_remaining -= delta
	if _remaining <= 0.0:
		flush()
