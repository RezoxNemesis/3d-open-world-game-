extends RefCounted
## Original procedural stone-and-cedar qilin and wind cart, batched by mesh/material.

var batches: Dictionary = {}
var materials: Array[StandardMaterial3D] = []
var meshes: Array[Mesh] = []


func _init() -> void:
	for color in [
		Color("617c72"),
		Color("cfad62"),
		Color("303d37"),
		Color("794c34"),
		Color("8de6cb"),
		Color("e5d6ad")
	]:
		var material := StandardMaterial3D.new()
		material.albedo_color = color
		material.roughness = 0.8
		if color == Color("8de6cb"):
			material.emission_enabled = true
			material.emission = color
			material.emission_energy_multiplier = 1.3
		materials.append(material)
	var sphere := SphereMesh.new()
	sphere.radius = 0.5
	sphere.height = 1.0
	sphere.radial_segments = 10
	sphere.rings = 6
	var cube := BoxMesh.new()
	var cylinder := CylinderMesh.new()
	cylinder.top_radius = 0.5
	cylinder.bottom_radius = 0.5
	cylinder.height = 1.0
	cylinder.radial_segments = 10
	var cone := CylinderMesh.new()
	cone.top_radius = 0.0
	cone.bottom_radius = 0.5
	cone.height = 1.0
	cone.radial_segments = 8
	meshes.assign([sphere, cube, cylinder, cone])


func part(
	kind: int, material: int, position: Vector3, size: Vector3, rotation := Vector3.ZERO
) -> void:
	var key := Vector2i(kind, material)
	if not batches.has(key):
		batches[key] = []
	batches[key].append(Transform3D(Basis.from_euler(rotation).scaled_local(size), position))


func rod(material: int, start: Vector3, end: Vector3, width: float) -> void:
	var direction := end - start
	var basis := Basis(Quaternion(Vector3.UP, direction.normalized()))
	var key := Vector2i(2, material)
	if not batches.has(key):
		batches[key] = []
	batches[key].append(
		Transform3D(
			basis.scaled_local(Vector3(width, direction.length(), width)), (start + end) * 0.5
		)
	)


func finish(parent: Node3D, pivot := Vector3.ZERO) -> void:
	for key: Vector2i in batches:
		var multimesh := MultiMesh.new()
		multimesh.transform_format = MultiMesh.TRANSFORM_3D
		multimesh.mesh = meshes[key.x]
		multimesh.instance_count = batches[key].size()
		for index in range(multimesh.instance_count):
			var placement: Transform3D = batches[key][index]
			placement.origin -= pivot
			multimesh.set_instance_transform(index, placement)
		var instance := MultiMeshInstance3D.new()
		instance.multimesh = multimesh
		instance.material_override = materials[key.y]
		parent.add_child(instance)
	batches.clear()


func guardian(parent: Node3D) -> Dictionary:
	var sculpt: Node3D = preload("res://assets/models/heroes/jade_sentinel.glb").instantiate()
	parent.add_child(sculpt)
	for mesh: MeshInstance3D in sculpt.find_children("*", "MeshInstance3D", true, false):
		var base := mesh.get_active_material(0) as StandardMaterial3D
		if (
			base == null
			or base.resource_name not in ["GuardianJade", "GuardianGold", "GuardianIvory"]
		):
			continue
		var surface: StandardMaterial3D = base.duplicate()
		surface.normal_enabled = true
		surface.normal_texture = preload(
			"res://assets/materials/landscape_karst_original_normal.png"
		)
		surface.normal_scale = 0.28
		surface.roughness = 0.68 if base.resource_name == "GuardianGold" else 0.82
		mesh.material_override = surface
	for child in sculpt.get_children():
		child.reparent(parent)
	sculpt.queue_free()
	return {
		"head": parent.get_node("Head"),
		"forelegs": [parent.get_node("Foreleg0"), parent.get_node("Foreleg1")]
	}


func vehicle(parent: Node3D) -> void:
	# Cedar wind cart: lower hull, bow, seat, brass rails, mast and segmented sail.
	part(1, 3, Vector3(0, 0.52, 0), Vector3(1.7, 0.32, 3.25))
	part(0, 1, Vector3(0, 0.5, -1.5), Vector3(1.65, 0.38, 0.9))
	for side in [-1.0, 1.0]:
		rod(1, Vector3(side * 0.8, 0.9, -1.25), Vector3(side * 0.8, 0.9, 1.3), 0.08)
		for z in [-1.1, 1.1]:
			rod(1, Vector3(side * 0.8, 0.5, z), Vector3(side * 0.8, 0.92, z), 0.07)
			part(
				2, 2, Vector3(side * 1.0, 0.48, z), Vector3(0.96, 0.25, 0.96), Vector3(0, 0, PI / 2)
			)
			part(
				2, 1, Vector3(side * 1.15, 0.48, z), Vector3(0.7, 0.055, 0.7), Vector3(0, 0, PI / 2)
			)
	part(1, 5, Vector3(0, 0.83, 0.2), Vector3(0.8, 0.2, 0.75))
	part(1, 3, Vector3(0, 1.13, 0.55), Vector3(0.85, 0.65, 0.15))
	rod(3, Vector3(0, 0.6, 1.1), Vector3(0, 3.9, 1.1), 0.12)
	rod(1, Vector3(-1.2, 3.65, 1.1), Vector3(1.2, 3.65, 1.1), 0.08)
	for panel in range(5):
		var x := (panel - 2) * 0.44
		part(
			1,
			5,
			Vector3(x, 2.75, 1.12 + absf(x) * 0.22),
			Vector3(0.43, 1.7 - absf(x) * 0.2, 0.05),
			Vector3(0, -x * 0.18, 0)
		)
		rod(
			1,
			Vector3(x, 1.95, 1.12 + absf(x) * 0.22),
			Vector3(x, 3.55, 1.12 + absf(x) * 0.22),
			0.027
		)
	part(0, 0, Vector3(0, 2.8, 1.06), Vector3(0.67, 0.67, 0.06))
	part(0, 1, Vector3(0, 2.8, 1.02), Vector3(0.38, 0.38, 0.06))
	rod(1, Vector3(0, 0.72, -0.6), Vector3(0, 1.3, -0.75), 0.08)
	rod(3, Vector3(-0.4, 1.3, -0.75), Vector3(0.4, 1.3, -0.75), 0.09)
	finish(parent)
