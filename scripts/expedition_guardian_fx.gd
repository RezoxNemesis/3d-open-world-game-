extends Node3D
## Four pooled, unshaded effects. All sizes are supplied by the actual damage zones.

var lane_warning: MeshInstance3D
var breath_warning: MeshInstance3D
var wave_front: MeshInstance3D
var breath_cloud: MultiMeshInstance3D
var lane_half_width := 1.65
var wave_reach := 13.5
var near_distance := 2.0
var breath_reach := 8.0
var breath_slope := 0.45


func setup(width: float, reach: float, near: float, breath_length: float, slope: float) -> void:
	lane_half_width = width
	wave_reach = reach
	near_distance = near
	breath_reach = breath_length
	breath_slope = slope
	lane_warning = _outline(
		[
			Vector3(-width, 0.13, near - 0.35),
			Vector3(width, 0.13, near - 0.35),
			Vector3(width, 0.13, reach + 0.35),
			Vector3(-width, 0.13, reach + 0.35)
		],
		Color("ffb650")
	)
	breath_warning = _outline(
		[
			Vector3(-near * slope, 0.13, near),
			Vector3(near * slope, 0.13, near),
			Vector3(breath_length * slope, 0.13, breath_length),
			Vector3(-breath_length * slope, 0.13, breath_length)
		],
		Color("ff9862")
	)
	var vertices := PackedVector3Array()
	for index in range(12):
		var x0 := lerpf(-width, width, index / 12.0)
		var x1 := lerpf(-width, width, (index + 1) / 12.0)
		var height0 := 0.38 + cos(x0 / width * PI * 0.5) * 0.65
		var height1 := 0.38 + cos(x1 / width * PI * 0.5) * 0.65
		_quad(
			vertices,
			Vector3(x0, 0.08, -0.35),
			Vector3(x1, 0.08, -0.35),
			Vector3(x1, height1, 0),
			Vector3(x0, height0, 0)
		)
		_quad(
			vertices,
			Vector3(x0, height0, 0),
			Vector3(x1, height1, 0),
			Vector3(x1, 0.08, 0.35),
			Vector3(x0, 0.08, 0.35)
		)
	wave_front = _mesh(vertices, Color("80f1c6"))
	var sphere := SphereMesh.new()
	sphere.radius = 0.5
	sphere.height = 1
	sphere.radial_segments = 8
	sphere.rings = 4
	var cloud := MultiMesh.new()
	cloud.transform_format = MultiMesh.TRANSFORM_3D
	cloud.mesh = sphere
	cloud.instance_count = 14
	breath_cloud = MultiMeshInstance3D.new()
	breath_cloud.multimesh = cloud
	breath_cloud.material_override = _material(Color("a9ffd4"))
	add_child(breath_cloud)
	clear()


func _material(color: Color) -> StandardMaterial3D:
	var material := StandardMaterial3D.new()
	material.albedo_color = color
	material.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	material.cull_mode = BaseMaterial3D.CULL_DISABLED
	return material


func _mesh(vertices: PackedVector3Array, color: Color) -> MeshInstance3D:
	var arrays := []
	arrays.resize(Mesh.ARRAY_MAX)
	arrays[Mesh.ARRAY_VERTEX] = vertices
	var mesh := ArrayMesh.new()
	mesh.add_surface_from_arrays(Mesh.PRIMITIVE_TRIANGLES, arrays)
	var instance := MeshInstance3D.new()
	instance.mesh = mesh
	instance.material_override = _material(color)
	instance.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	add_child(instance)
	return instance


func _quad(vertices: PackedVector3Array, a: Vector3, b: Vector3, c: Vector3, d: Vector3) -> void:
	vertices.append_array(PackedVector3Array([a, b, c, a, c, d]))


func _outline(points: Array, color: Color) -> MeshInstance3D:
	var vertices := PackedVector3Array()
	for index in range(points.size()):
		var a: Vector3 = points[index]
		var b: Vector3 = points[(index + 1) % points.size()]
		var edge := (b - a).normalized().cross(Vector3.UP) * 0.045
		_quad(vertices, a + edge, b + edge, b - edge, a - edge)
	return _mesh(vertices, color)


func aim(origin: Vector3, direction: Vector3) -> void:
	global_position = origin
	rotation.y = atan2(direction.x, direction.z)


func present(pattern: String, phase: String, progress: float, breath_depth: float) -> void:
	var warning := phase == "telegraph" or phase == "attack"
	lane_warning.visible = warning and pattern == "shockwave"
	breath_warning.visible = warning and pattern == "breath"
	wave_front.visible = phase == "attack" and pattern == "shockwave" and progress >= 0
	breath_cloud.visible = (
		phase == "attack" and pattern == "breath" and breath_depth > near_distance + 0.4
	)
	if wave_front.visible:
		wave_front.position.z = lerpf(near_distance, wave_reach, clampf(progress, 0, 1))
	if breath_cloud.visible:
		for index in range(14):
			var depth := lerpf(near_distance + 0.2, breath_depth - 0.2, (index / 2) / 6.0)
			var width := depth * breath_slope
			var side := -1.0 if index % 2 == 0 else 1.0
			var position := Vector3(
				width * side * 0.4, 0.85 + sin(depth * 2 + progress * 8) * 0.18, depth
			)
			var size := Vector3(width * 0.95, 1.05, 0.65)
			breath_cloud.multimesh.set_instance_transform(
				index, Transform3D(Basis.from_scale(size), position)
			)


func clear() -> void:
	lane_warning.visible = false
	breath_warning.visible = false
	wave_front.visible = false
	breath_cloud.visible = false
