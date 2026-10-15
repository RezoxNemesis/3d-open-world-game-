extends Node3D
## Authored two-room house, matching collision profiles and a continuous front route.

const LANDSCAPE := preload("res://scripts/landscape_visuals.gd")
const PALETTE := preload("res://scripts/architectural_palette.gd")
const HOUSE_POSITION := Vector3(20, 0.6, 31)
const NEAR_PATH := "res://assets/models/residence/residence_near.glb"
const FAR_PATH := "res://assets/models/residence/residence_far.glb"
const MANIFEST_PATH := "res://assets/models/residence/manifest.json"
var _world: Node3D
var _near: Node3D
var _far: Node3D
var _preset := "balanced"
var _refresh := 0.0
var _built := false


func build(world: Node3D) -> void:
	if _built:
		return
	_world = world
	position = HOUSE_POSITION
	if not ResourceLoader.exists(NEAR_PATH) or not ResourceLoader.exists(FAR_PATH):
		return
	var manifest = JSON.parse_string(FileAccess.get_file_as_string(MANIFEST_PATH))
	if not manifest is Dictionary or not manifest.has("collision_profiles"):
		push_error("Residence requires its authored collision manifest")
		return
	_built = true
	_near = load(NEAR_PATH).instantiate()
	_near.name = "ResidenceNear"
	add_child(_near)
	PALETTE.apply(_near)
	_far = load(FAR_PATH).instantiate()
	_far.name = "ResidenceFar"
	add_child(_far)
	PALETTE.apply(_far)
	_build_collision(manifest.collision_profiles)
	_build_approach()
	apply_quality(_preset)


func _build_collision(profiles: Dictionary) -> void:
	var collision := Node3D.new()
	collision.name = "ResidenceCollision"
	add_child(collision)
	for label in ["floor", "walls", "posts", "ceiling", "furniture"]:
		var body := StaticBody3D.new()
		body.name = label.capitalize()
		collision.add_child(body)
		for profile in profiles[label]:
			var shape := CollisionShape3D.new()
			shape.name = str(profile.name)
			shape.position = _vector(profile.center_y_up_m)
			var box := BoxShape3D.new()
			box.size = _vector(profile.size_y_up_m)
			shape.shape = box
			body.add_child(shape)
	var roof := StaticBody3D.new()
	roof.name = "Roof"
	collision.add_child(roof)
	var faces := PackedVector3Array()
	for triangle in profiles.roof.triangles:
		for index in triangle:
			faces.append(_vector(profiles.roof.vertices_y_up_m[int(index)]))
	var roof_shape := CollisionShape3D.new()
	var polygon := ConcavePolygonShape3D.new()
	polygon.set_faces(faces)
	polygon.backface_collision = true
	roof_shape.shape = polygon
	roof.add_child(roof_shape)


func _vector(value: Array) -> Vector3:
	return Vector3(float(value[0]), float(value[1]), float(value[2]))


func _build_approach() -> void:
	var path := Node3D.new()
	path.name = "ResidenceApproach"
	path.position = -HOUSE_POSITION
	add_child(path)
	var body := StaticBody3D.new()
	body.name = "WalkableResidenceRoute"
	path.add_child(body)
	var helper := LANDSCAPE.new()
	var stones: Array[Transform3D] = []
	# Follow the closed rear wall around the west side to the actual south door.
	helper.add_box(body, stones, Vector3(3.4, 1.0, 12), Vector3(20, -0.5, 17.5))
	helper.add_box(body, stones, Vector3(11.5, 1.0, 3.2), Vector3(15.75, -0.5, 22.5))
	helper.add_box(body, stones, Vector3(3.2, 1.0, 20.2), Vector3(11.5, -0.5, 30.4))
	helper.add_box(body, stones, Vector3(11.6, 1.0, 3.2), Vector3(15.75, -0.5, 39.5))
	helper.add_box(body, stones, Vector3(14.4, 1.4, 12.4), Vector3(20, -0.115, 31))
	for index in range(3):
		var height := (index + 1) * 0.2
		helper.add_box(
			body, stones, Vector3(3.6, height, 0.6), Vector3(20, height / 2, 38.7 - index * 0.6)
		)
	helper.add_box(body, stones, Vector3(3.6, 0.35, 0.25), Vector3(20, 0.425, 37.075))
	var cubes := BoxMesh.new()
	cubes.size = Vector3.ONE
	helper.batch(path, "ResidencePathAndSteps", cubes, stones, _world.stone)
	for point in [
		Vector3(18.1, 0, 24.3), Vector3(9.55, 0, 30), Vector3(9.55, 0, 39.5), Vector3(22.1, 0, 39.5)
	]:
		_world.module_at("lantern", point, 0.68)


func _process(delta: float) -> void:
	if not _built:
		return
	_refresh += delta
	if _refresh >= 0.25:
		_refresh = 0.0
		refresh_visibility()


func apply_quality(preset: String) -> void:
	_preset = preset if preset in ["performance", "balanced", "high"] else "balanced"
	if not _built:
		return
	for mesh in find_children("*", "GeometryInstance3D", true, false):
		mesh.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
		var ancestor: Node = mesh.get_parent()
		var exterior := false
		while ancestor != null and ancestor != self:
			exterior = exterior or ancestor.name in ["Roof", "Walls", "Posts"]
			ancestor = ancestor.get_parent()
		if _preset != "performance" and _near.is_ancestor_of(mesh) and exterior:
			mesh.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_ON
	refresh_visibility()


func refresh_visibility() -> void:
	if not _built:
		return
	var camera := get_viewport().get_camera_3d()
	var distance := 0.0 if camera == null else camera.global_position.distance_to(global_position)
	var near_end := 120.0 if _preset == "high" else (65.0 if _preset == "performance" else 90.0)
	var far_end := 260.0 if _preset == "high" else (160.0 if _preset == "performance" else 210.0)
	_near.visible = distance < near_end
	_far.visible = distance >= near_end and distance < far_end
