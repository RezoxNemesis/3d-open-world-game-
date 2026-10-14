extends CharacterBody3D
## Camera-relative movement with real physics and an original walking traveler.

const SPEED := 5.0
const JUMP_SPEED := 6.5
const STEP_HEIGHT := 0.28
const BODY_RADIUS := 0.35
var pivot: Node3D
var camera: Camera3D
var model: Node3D
var yaw := 0.0
var pitch := -0.20
var first_person := false
var step_time := 0.0
var arms: Array[Node3D] = []
var legs: Array[Node3D] = []
var gait_weight := 0.0


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
	pivot.position.y = 1.5
	add_child(pivot)
	var arm := SpringArm3D.new()
	arm.spring_length = 6.0
	arm.margin = 0.25
	arm.add_excluded_object(get_rid())
	pivot.add_child(arm)
	camera = Camera3D.new()
	camera.current = true
	camera.fov = 68
	camera.near = 0.1
	arm.add_child(camera)
	update_camera()


func build_traveler() -> void:
	# All pieces are decorative meshes; the single capsule remains the physics body.
	var skin := make_material("c99572")
	var cream := make_material("ddd0a5")
	var teal := make_material("285b59")
	var dark_cloth := make_material("293b3c")
	var leather := make_material("493529")
	var hair := make_material("25231e")
	var gold := make_material("b5934a", 0.65)
	var steel := make_material("76878b", 0.55)
	add_piece(model, make_cylinder(0.18, 0.22, 0.45), cream, Vector3(0, 1.14, 0))
	add_piece(model, make_cylinder(0.21, 0.28, 0.29), cream, Vector3(0, 0.8, 0))
	add_piece(model, make_box(Vector3(0.28, 0.51, 0.055)), teal, Vector3(0, 1.06, -0.19))
	add_piece(model, make_box(Vector3(0.23, 0.22, 0.045)), teal, Vector3(0, 0.76, -0.245))
	add_piece(model, make_cylinder(0.225, 0.23, 0.065), leather, Vector3(0, 0.935, 0))
	add_piece(model, make_box(Vector3(0.075, 0.075, 0.025)), gold, Vector3(0, 0.935, -0.237))
	var sash := add_piece(
		model, make_box(Vector3(0.065, 0.43, 0.025)), gold, Vector3(0.03, 1.155, -0.222)
	)
	sash.rotation.z = -0.48
	add_piece(model, make_cylinder(0.06, 0.065, 0.12), skin, Vector3(0, 1.36, 0))
	add_piece(model, make_cylinder(0.085, 0.085, 0.06), teal, Vector3(0, 1.355, 0))
	add_piece(model, make_sphere(0.14, 0.30), skin, Vector3(0, 1.535, 0))
	add_piece(model, make_sphere(0.148, 0.11), hair, Vector3(0, 1.668, 0.014))
	add_piece(model, make_sphere(0.11, 0.22), hair, Vector3(0, 1.57, 0.085))
	add_piece(model, make_sphere(0.075, 0.1), hair, Vector3(0, 1.655, 0.18))
	add_piece(model, make_sphere(0.023, 0.034), skin, Vector3(0, 1.525, -0.14))
	add_piece(model, make_sphere(0.021, 0.008), make_material("9c684f"), Vector3(0, 1.488, -0.13))
	var eye_mesh := make_sphere(0.012, 0.015)
	for side in [-1.0, 1.0]:
		add_piece(model, eye_mesh, hair, Vector3(side * 0.049, 1.563, -0.131))
	# Matching limbs share their mesh resources and materials.
	var sleeve_mesh := make_cylinder(0.095, 0.077, 0.28)
	var forearm_mesh := make_cylinder(0.06, 0.044, 0.19)
	var hand_mesh := make_sphere(0.048, 0.11)
	var trouser_mesh := make_cylinder(0.098, 0.075, 0.35)
	var boot_mesh := make_cylinder(0.081, 0.086, 0.26)
	var foot_mesh := make_sphere(0.088, 0.11)
	for side in [-1.0, 1.0]:
		var arm := Node3D.new()
		arm.name = "ArmLeft" if side < 0 else "ArmRight"
		arm.position = Vector3(side * 0.235, 1.29, 0)
		model.add_child(arm)
		arms.append(arm)
		add_piece(arm, sleeve_mesh, cream, Vector3(0, -0.125, 0))
		add_piece(arm, forearm_mesh, skin, Vector3(0, -0.355, 0))
		add_piece(arm, hand_mesh, skin, Vector3(0, -0.49, 0))
		add_piece(arm, make_cylinder(0.058, 0.058, 0.04), leather, Vector3(0, -0.427, 0))
		var leg := Node3D.new()
		leg.name = "LegLeft" if side < 0 else "LegRight"
		leg.position = Vector3(side * 0.125, 0.7, 0)
		model.add_child(leg)
		legs.append(leg)
		add_piece(leg, trouser_mesh, dark_cloth, Vector3(0, -0.165, 0))
		add_piece(leg, boot_mesh, leather, Vector3(0, -0.445, 0))
		var foot := add_piece(leg, foot_mesh, leather, Vector3(0, -0.635, -0.043))
		foot.scale.z = 1.5
	# A compact travel pack and sheathed blade keep the rear silhouette readable.
	add_piece(model, make_box(Vector3(0.28, 0.33, 0.16)), leather, Vector3(0, 1.17, 0.235))
	var bedroll := add_piece(
		model, make_cylinder(0.085, 0.085, 0.36), cream, Vector3(0, 1.35, 0.245)
	)
	bedroll.rotation.z = PI / 2
	var blade := Node3D.new()
	blade.position = Vector3(0.18, 1.01, 0.23)
	blade.rotation.z = -0.32
	model.add_child(blade)
	add_piece(blade, make_box(Vector3(0.055, 0.54, 0.045)), dark_cloth, Vector3(0, 0, 0))
	add_piece(blade, make_box(Vector3(0.16, 0.025, 0.05)), gold, Vector3(0, 0.285, 0))
	add_piece(blade, make_cylinder(0.023, 0.023, 0.13), leather, Vector3(0, 0.36, 0))
	add_piece(blade, make_sphere(0.029, 0.035), steel, Vector3(0, 0.438, 0))


func make_material(color: String, roughness := 0.9) -> StandardMaterial3D:
	var material := StandardMaterial3D.new()
	material.albedo_color = Color(color)
	material.roughness = roughness
	return material


func make_cylinder(top: float, bottom: float, height: float) -> CylinderMesh:
	var mesh := CylinderMesh.new()
	mesh.top_radius = top
	mesh.bottom_radius = bottom
	mesh.height = height
	mesh.radial_segments = 12
	return mesh


func make_sphere(radius: float, height: float) -> SphereMesh:
	var mesh := SphereMesh.new()
	mesh.radius = radius
	mesh.height = height
	mesh.radial_segments = 16
	mesh.rings = 8
	return mesh


func make_box(size: Vector3) -> BoxMesh:
	var mesh := BoxMesh.new()
	mesh.size = size
	return mesh


func add_piece(parent: Node3D, mesh: Mesh, material: Material, at: Vector3) -> MeshInstance3D:
	var piece := MeshInstance3D.new()
	piece.mesh = mesh
	piece.material_override = material
	piece.position = at
	parent.add_child(piece)
	return piece


func update_camera() -> void:
	pivot.rotation = Vector3(pitch, yaw, 0)
	var arm := pivot.get_child(0) as SpringArm3D
	arm.spring_length = 0.0 if first_person else 6.0
	model.visible = not first_person


func _unhandled_input(event: InputEvent) -> void:
	if event is InputEventMouseButton and event.pressed:
		Input.mouse_mode = Input.MOUSE_MODE_CAPTURED
	if event is InputEventKey and event.pressed and not event.echo:
		if event.keycode == KEY_ESCAPE:
			Input.mouse_mode = Input.MOUSE_MODE_VISIBLE
		elif event.keycode == KEY_V:
			first_person = not first_person
			update_camera()
	if event is InputEventMouseMotion and Input.mouse_mode == Input.MOUSE_MODE_CAPTURED:
		yaw -= event.relative.x * 0.003
		pitch = clampf(pitch - event.relative.y * 0.003, -1.0, 0.35)
		update_camera()


func _physics_process(delta: float) -> void:
	if Input.is_action_just_pressed("toggle_view"):
		first_person = not first_person
		update_camera()
	var input := Input.get_vector("move_left", "move_right", "move_forward", "move_backward")
	var direction := Vector3(input.x, 0, input.y).rotated(Vector3.UP, yaw)
	velocity.x = direction.x * SPEED
	velocity.z = direction.z * SPEED
	if not is_on_floor():
		velocity.y -= 18.0 * delta
	elif Input.is_action_just_pressed("jump"):
		velocity.y = JUMP_SPEED
	var stepped := try_step(direction * SPEED * delta)
	var snap_distance := floor_snap_length
	if stepped:
		# Keep this lift for one frame; snapping to the old floor would undo the step.
		floor_snap_length = 0.0
	move_and_slide()
	floor_snap_length = snap_distance
	if direction.length() > 0.1:
		model.rotation.y = lerp_angle(
			model.rotation.y, atan2(-direction.x, -direction.z), delta * 12
		)
		step_time += delta * 8.0
	var walking := direction.length() > 0.1 and is_on_floor()
	gait_weight = move_toward(gait_weight, 1.0 if walking else 0.0, delta * 8)
	model.position.y = absf(sin(step_time)) * 0.025 * gait_weight
	for i in range(legs.size()):
		var stride := sin(step_time + i * PI) * gait_weight
		legs[i].rotation.x = stride * 0.38
		arms[i].rotation.x = -stride * 0.3
		arms[i].rotation.z = 0.055 if i == 0 else -0.055
	if position.y < -15:
		position = Vector3(0, 2, 12)
		velocity = Vector3.ZERO


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
