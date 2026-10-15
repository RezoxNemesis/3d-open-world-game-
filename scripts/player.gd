extends CharacterBody3D
## Camera-relative movement with real physics and an original walking traveler.

const TRAVELER_VISUAL := preload("res://scripts/traveler_visual.gd")
const TRAVELER_MOTION := preload("res://scripts/traveler_motion.gd")
const SPEED := 5.0
const SPRINT_SPEED := 8.0
const MIN_PITCH := -0.80
const MAX_PITCH := 0.08
const JUMP_SPEED := 6.5
const STEP_HEIGHT := 0.28
const BODY_RADIUS := 0.35
var pivot: Node3D
var camera: Camera3D
var spring_arm: SpringArm3D
var camera_distance := 5.4
var sprint_enabled := false
var powers: Node
var water_motion: Node
var model: Node3D
var yaw := 0.0
var pitch := -0.16
var first_person := false
var step_time := 0.0
var arms: Array[Node3D] = []
var legs: Array[Node3D] = []
var knees: Array[Node3D] = []
var elbows: Array[Node3D] = []
var coat_tails: Array[Node3D] = []
var gait_weight := 0.0
var motion := TRAVELER_MOTION.new()


func _ready() -> void:
	var shape := CollisionShape3D.new()
	var capsule := CapsuleShape3D.new()
	capsule.radius = BODY_RADIUS
	capsule.height = 1.7
	shape.shape = capsule
	shape.position.y = 0.85
	add_child(shape)
	floor_snap_length = STEP_HEIGHT + 0.03
	model = Node3D.new()
	model.name = "Traveler"
	add_child(model)
	build_traveler()
	pivot = Node3D.new()
	pivot.position.y = 1.55
	add_child(pivot)
	spring_arm = SpringArm3D.new()
	spring_arm.spring_length = camera_distance
	spring_arm.margin = 0.22
	spring_arm.collision_mask = 3
	spring_arm.add_excluded_object(get_rid())
	pivot.add_child(spring_arm)
	camera = Camera3D.new()
	camera.current = true
	camera.fov = 66
	camera.near = 0.1
	spring_arm.add_child(camera)
	update_camera()


func build_traveler() -> void:
	# Decorative authored cloth remains separate from the single physics capsule.
	var joints := TRAVELER_VISUAL.build(model)
	for key in joints:
		var destination: Array = get(key)
		destination.assign(joints[key])


func update_camera() -> void:
	# Legacy callers (loading and explicit view changes) need an immediate reset.
	var flying: bool = is_instance_valid(powers) and powers.flying
	pitch = clampf(pitch, -1.25 if flying else MIN_PITCH, 1.25 if flying else MAX_PITCH)
	pivot.rotation = Vector3(pitch, yaw, 0)
	spring_arm.spring_length = 0.0 if first_person else camera_distance
	model.visible = not first_person


func set_camera_distance(distance: float) -> void:
	camera_distance = clampf(distance, 3.5, 8.0)


func set_sprint_enabled(enabled: bool) -> void:
	sprint_enabled = enabled


func rotate_camera(relative: Vector2, look_sensitivity := 1.0) -> void:
	yaw -= relative.x * 0.0035 * clampf(look_sensitivity, 0.4, 2.0)
	var flying: bool = is_instance_valid(powers) and powers.flying
	pitch = clampf(
		pitch - relative.y * 0.0035 * look_sensitivity,
		-1.25 if flying else MIN_PITCH,
		1.25 if flying else MAX_PITCH
	)


func _process(delta: float) -> void:
	var weight := 1.0 - exp(-14.0 * delta)
	pivot.rotation.x = lerpf(pivot.rotation.x, pitch, weight)
	pivot.rotation.y = lerp_angle(pivot.rotation.y, yaw, weight)
	spring_arm.spring_length = lerpf(
		spring_arm.spring_length, 0.0 if first_person else camera_distance, weight
	)
	if is_instance_valid(powers):
		powers.update_camera(delta)


func _unhandled_input(event: InputEvent) -> void:
	if event is InputEventMouseButton and event.pressed and not OS.has_feature("android"):
		# Android can synthesize a mouse event from touch; that must not capture it.
		if event.device != -1 and event.button_index == MOUSE_BUTTON_LEFT:
			Input.mouse_mode = Input.MOUSE_MODE_CAPTURED
		elif event.button_index == MOUSE_BUTTON_WHEEL_UP:
			set_camera_distance(camera_distance - 0.5)
		elif event.button_index == MOUSE_BUTTON_WHEEL_DOWN:
			set_camera_distance(camera_distance + 0.5)
	if event is InputEventKey and event.pressed and not event.echo:
		if event.keycode == KEY_ESCAPE:
			Input.mouse_mode = Input.MOUSE_MODE_VISIBLE
		elif event.keycode == KEY_V:
			first_person = not first_person
			update_camera()
	if (
		event is InputEventMouseMotion
		and event.device != -1
		and Input.mouse_mode == Input.MOUSE_MODE_CAPTURED
	):
		rotate_camera(event.relative, 0.86)


func _physics_process(delta: float) -> void:
	if is_instance_valid(powers):
		powers.advance(delta)
	if Input.is_action_just_pressed("toggle_view"):
		first_person = not first_person
		update_camera()
	# The joystick already applies its own radial dead zone. A second default
	# InputMap dead zone would discard light thumb movement and snap to running.
	var input := Input.get_vector("move_left", "move_right", "move_forward", "move_backward", 0.0)
	var direction := Vector3(input.x, 0, input.y).rotated(Vector3.UP, yaw)
	var running := (
		sprint_enabled or (InputMap.has_action("sprint") and Input.is_action_pressed("sprint"))
	)
	var flying: bool = is_instance_valid(powers) and powers.flying
	var fast: bool = is_instance_valid(powers) and powers.fast
	var swimming: bool = is_instance_valid(water_motion) and water_motion.is_swimming()
	if swimming:
		velocity = water_motion.swim_velocity(input, running, delta)
	elif flying:
		velocity = powers.flight_velocity(input, running, delta)
	else:
		var speed := SPRINT_SPEED if running else SPEED
		var acceleration := 38.0 if direction.length() > 0 else 50.0
		if fast:
			speed = 120.0 if running else 72.0
			acceleration = 100.0
		velocity.x = move_toward(velocity.x, direction.x * speed, acceleration * delta)
		velocity.z = move_toward(velocity.z, direction.z * speed, acceleration * delta)
		if not is_on_floor():
			velocity.y -= 18.0 * delta
		elif Input.is_action_just_pressed("jump"):
			velocity.y = JUMP_SPEED
	if is_instance_valid(powers):
		powers.prepare_streaming(delta)
	var stepped := (
		not flying and not swimming and try_step(Vector3(velocity.x, 0, velocity.z) * delta)
	)
	var snap_distance := floor_snap_length
	if stepped:
		# Keep this lift for one frame; snapping to the old floor would undo the step.
		floor_snap_length = 0.0
	move_and_slide()
	floor_snap_length = snap_distance
	if is_instance_valid(powers) and powers.has_method("after_move"):
		powers.after_move(delta, get_real_velocity())
	update_traveler_motion(delta, get_real_velocity(), is_on_floor(), flying)
	var over_water: bool = is_instance_valid(water_motion) and water_motion.is_water_position()
	if position.y < -15 and not over_water:
		position = Vector3(0, 2, 12)
		velocity = Vector3.ZERO


func update_traveler_motion(
	delta: float, actual_velocity: Vector3, grounded: bool, flying: bool
) -> void:
	motion.update(self, delta, actual_velocity, grounded, flying)


func is_checkpoint_safe() -> bool:
	return powers.is_checkpoint_safe() if is_instance_valid(powers) else is_on_floor()


func try_step(motion: Vector3) -> bool:
	if not is_on_floor() or velocity.y > 0.0 or motion.length_squared() < 0.000001:
		return false
	var wall := KinematicCollision3D.new()
	if (
		not test_move(global_transform, motion, wall)
		or wall.get_normal().dot(Vector3.UP) >= cos(floor_max_angle)
	):
		return false
	# Inspect the ledge just beyond the rounded foot, never an arbitrary distant point.
	var forward := motion.normalized() * (BODY_RADIUS + 0.04)
	var start := global_position + forward + Vector3.UP * STEP_HEIGHT
	var query := PhysicsRayQueryParameters3D.create(
		start, start - Vector3.UP * (STEP_HEIGHT + 0.04), collision_mask, [get_rid()]
	)
	var ledge := get_world_3d().direct_space_state.intersect_ray(query)
	if ledge.is_empty() or ledge.normal.dot(Vector3.UP) < cos(floor_max_angle):
		return false
	var rise: float = ledge.position.y - global_position.y
	if rise < 0.02 or rise > STEP_HEIGHT:
		return false
	var lift := Vector3.UP * (rise + 0.001)
	# The complete body must clear both the ceiling and the forward obstacle.
	var raised := global_transform
	raised.origin += lift
	if test_move(global_transform, lift) or test_move(raised, motion):
		return false
	global_position += lift
	velocity.y = 0.0
	return true
