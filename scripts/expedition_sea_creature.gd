extends Node3D
## The original twenty-joint dragon swims as a twelve-meter tide wyrm.

const MODEL_PATHS := [
	"res://assets/models/dragon/celestial_dragon.glb",
	"res://assets/models/dragon/celestial_dragon_far.glb"
]
const MODEL_SCALE := 0.38
var state := "patrol"
var _world: Node3D
var _models: Array[Node3D] = []
var _animators: Array[AnimationPlayer] = []
var _time := 0.0
var _swim_time := 0.0
var _remaining := 0.0
var _lunge := Vector3.ZERO
var _hit := false
var _selected_lod := 0


func setup(world: Node3D) -> void:
	_world = world
	name = "TideWyrm"
	position = Vector3(22, -9, -12)
	for index in range(MODEL_PATHS.size()):
		var packed := load(MODEL_PATHS[index]) as PackedScene
		var model := packed.instantiate() as Node3D
		model.name = "TideDragonNear" if index == 0 else "TideDragonFar"
		model.scale = Vector3.ONE * MODEL_SCALE
		model.position.z = -1.5
		add_child(model)
		_models.append(model)
		for mesh: MeshInstance3D in model.find_children("*", "MeshInstance3D", true, false):
			mesh.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
			mesh.extra_cull_margin = 6.0
			mesh.visibility_range_end = 100.0
		var animator := model.find_child("AnimationPlayer", true, false) as AnimationPlayer
		animator.callback_mode_process = AnimationMixer.ANIMATION_CALLBACK_MODE_PROCESS_MANUAL
		for animation_name in animator.get_animation_list():
			if animation_name != "RESET":
				animator.get_animation(animation_name).loop_mode = Animation.LOOP_LINEAR
				animator.play(animation_name)
				animator.advance(0)
				break
		_animators.append(animator)
	select_lod(0)


func select_lod(distance: float) -> void:
	_selected_lod = 1 if distance > 45 else 0
	for index in range(_models.size()):
		_models[index].visible = index == _selected_lod
		_animators[index].active = index == _selected_lod


func _physics_process(delta: float) -> void:
	if not is_instance_valid(_world):
		return
	var player: CharacterBody3D = _world.get("_player")
	if not is_instance_valid(player):
		return
	var swimmer: Node = player.get("water_motion")
	# The atlas owns the player's physics while open. Freeze this encounter's
	# clock too, so closing the map cannot resume an already-expired windup.
	if (
		not player.is_physics_processing()
		or (is_instance_valid(swimmer) and not swimmer.can_process())
	):
		return
	_time += delta
	_remaining -= delta
	var distance := global_position.distance_to(player.global_position)
	var can_attack: bool = (
		is_instance_valid(swimmer) and swimmer.is_swimming() and player.position.y < -3
	)
	match state:
		"patrol":
			var target := Vector3(
				cos(_time * .12) * 24, -9 + sin(_time * .35), -12 + sin(_time * .12) * 18
			)
			var movement := position.direction_to(target)
			position = position.move_toward(target, delta * 4)
			_face(movement, delta)
			if can_attack and distance < 14 and _remaining <= 0:
				state = "telegraph"
				_remaining = 1.5
				_lunge = global_position.direction_to(player.global_position)
				swimmer.warn("Tide wyrm gathers · Swim sideways!", 1.5)
		"telegraph":
			_face(_lunge, delta)
			if not can_attack or distance > 24:
				state = "patrol"
				_remaining = 3.0
			elif _remaining <= 0:
				state = "lunge"
				_remaining = 1.1
				_hit = false
		"lunge":
			position += _lunge * delta * 11.0
			if can_attack and not _hit and distance < 3.0:
				_hit = true
				swimmer.receive_bite(25, _lunge)
			if _remaining <= 0:
				state = "patrol"
				_remaining = 5.0
	_animate(delta)


func _face(direction: Vector3, delta: float) -> void:
	if Vector2(direction.x, direction.z).length() > .01:
		rotation.y = lerp_angle(rotation.y, atan2(-direction.x, -direction.z), minf(1, delta * 2))


func _animate(delta: float) -> void:
	var camera := get_viewport().get_camera_3d()
	if camera != null:
		select_lod(camera.global_position.distance_to(global_position))
	_swim_time += delta * (1.65 if state == "telegraph" else (1.3 if state == "lunge" else 0.85))
	# Manual skeletal playback shares the AI pause gate and a common phase at LOD
	# changes. The original authored swim provides connected neck, belly and tail.
	var animator := _animators[_selected_lod]
	animator.seek(fposmod(_swim_time, animator.current_animation_length), true)
