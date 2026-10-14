extends CharacterBody3D
## Camera-relative keyboard movement with real physics and a procedural avatar.

const SPEED := 5.0
const JUMP_SPEED := 6.5
var pivot: Node3D
var camera: Camera3D
var model: Node3D
var yaw := 0.0
var pitch := -0.20
var first_person := false
var step_time := 0.0


func _ready() -> void:
	var shape := CollisionShape3D.new()
	var capsule := CapsuleShape3D.new()
	capsule.radius = 0.35
	capsule.height = 1.7
	shape.shape = capsule
	shape.position.y = 0.85
	add_child(shape)
	model = Node3D.new()
	add_child(model)
	var body := MeshInstance3D.new()
	var mesh := CapsuleMesh.new()
	mesh.radius = 0.32
	mesh.height = 1.6
	body.mesh = mesh
	body.position.y = 0.85
	var material := StandardMaterial3D.new()
	material.albedo_color = Color("b98c54")
	material.roughness = 0.85
	body.material_override = material
	model.add_child(body)
	var sash := MeshInstance3D.new()
	var sash_mesh := CylinderMesh.new()
	sash_mesh.top_radius = 0.34
	sash_mesh.bottom_radius = 0.43
	sash_mesh.height = 0.8
	sash.mesh = sash_mesh
	sash.position.y = 0.8
	var cloth := StandardMaterial3D.new()
	cloth.albedo_color = Color("31595a")
	sash.material_override = cloth
	model.add_child(sash)
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
	move_and_slide()
	if direction.length() > 0.1:
		model.rotation.y = lerp_angle(
			model.rotation.y, atan2(-direction.x, -direction.z), delta * 12
		)
		step_time += delta * 8.0
		model.position.y = sin(step_time) * 0.025
	else:
		model.position.y = 0
	if position.y < -15:
		position = Vector3(0, 2, 12)
		velocity = Vector3.ZERO
